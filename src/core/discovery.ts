import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { glob } from 'tinyglobby'
import { parse } from 'yaml'
import { DEFAULT_IGNORES } from '../constants'
import { fileExists } from '../utils'
import { validatePackageName } from './package-name'
import { readRetryTargets } from './retry-targets'
import type { PackageMeta, TrustedPublishConfig } from './types'

interface Manifest {
  name?: string
  private?: boolean
}

/**
 * Discovers workspace packages and applies include/exclude/private filters.
 *
 * @param config - Resolved runtime configuration.
 * @returns Normalized package metadata list.
 *
 * @example
 * ```ts
 * const packages = await discoverPackages(config)
 * ```
 */
export async function discoverPackages(config: TrustedPublishConfig): Promise<PackageMeta[]> {
  const cwd = config.cwd || process.cwd()
  if (config.remotePackage) {
    validatePackageName(config.remotePackage)
    return filterPackages(
      [{ name: config.remotePackage, dir: cwd, manifestPath: '', private: false }],
      config,
    )
  }
  const manifests = new Set<string>()

  const workspaceManifests = config.discovery.fromWorkspaces
    ? await discoverFromWorkspaces(config)
    : undefined
  if (workspaceManifests !== undefined) {
    for (const m of workspaceManifests) {
      manifests.add(m)
    }
  }

  if (config.discovery.fromGlobs && workspaceManifests === undefined) {
    const globManifests = await glob(config.discovery.packageJsonGlobs, {
      cwd,
      ignore: [...DEFAULT_IGNORES, ...config.ignores],
      onlyFiles: true,
      absolute: true,
    })
    for (const m of globManifests) {
      manifests.add(m)
    }
  }

  const packages: PackageMeta[] = []
  for (const manifestPath of manifests) {
    const pkg = await parsePackage(manifestPath)
    if (!pkg?.name) {
      continue
    }
    packages.push(pkg)
  }

  return filterPackages(packages, config)
}

async function discoverFromWorkspaces(config: TrustedPublishConfig): Promise<string[] | undefined> {
  const cwd = config.cwd || process.cwd()
  const patterns = new Set(config.discovery.workspaceGlobs)
  let hasWorkspaceConfig = patterns.size > 0
  const pnpmWorkspacePath = resolve(cwd, 'pnpm-workspace.yaml')
  if (await fileExists(pnpmWorkspacePath)) {
    const workspace: unknown = parse(await readFile(pnpmWorkspacePath, 'utf8'))
    if (workspace && typeof workspace === 'object' && 'packages' in workspace) {
      hasWorkspaceConfig = true
      for (const pattern of parseWorkspacePatterns(workspace.packages, pnpmWorkspacePath)) {
        patterns.add(pattern)
      }
    }
  }

  const rootPkgPath = resolve(cwd, 'package.json')
  if (await fileExists(rootPkgPath)) {
    const pkg = JSON.parse(await readFile(rootPkgPath, 'utf8')) as { workspaces?: unknown }
    if (pkg.workspaces !== undefined) {
      hasWorkspaceConfig = true
      const workspaces = pkg.workspaces
      const values =
        workspaces && typeof workspaces === 'object' && 'packages' in workspaces
          ? workspaces.packages
          : workspaces
      for (const pattern of parseWorkspacePatterns(values, rootPkgPath)) {
        patterns.add(pattern)
      }
    }
  }

  if (!hasWorkspaceConfig) {
    return undefined
  }
  if (patterns.size === 0) {
    return []
  }
  return glob(
    [...patterns].map(pattern => `${pattern.replace(/\/$/, '')}/package.json`),
    {
      cwd,
      ignore: [...DEFAULT_IGNORES, ...config.ignores],
      onlyFiles: true,
      absolute: true,
    },
  )
}

function parseWorkspacePatterns(value: unknown, source: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string' && item.length > 0)) {
    throw new Error(`workspace packages must be an array of non-empty strings: ${source}`)
  }
  return value
}

async function parsePackage(manifestPath: string): Promise<PackageMeta | null> {
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const pkg = JSON.parse(raw) as Manifest
    if (!pkg.name) {
      return null
    }
    return {
      name: pkg.name,
      private: Boolean(pkg.private),
      manifestPath,
      dir: dirname(manifestPath),
    }
  } catch {
    return null
  }
}

async function filterPackages(
  packages: PackageMeta[],
  config: TrustedPublishConfig,
): Promise<PackageMeta[]> {
  const failedNames = config.retryFrom
    ? await readRetryTargets(resolve(config.cwd || process.cwd(), config.retryFrom))
    : undefined
  return packages
    .filter(pkg => !failedNames || failedNames.has(pkg.name))
    .filter(pkg => (config.includePrivate ? true : !pkg.private))
    .filter(pkg => (config.package ? pkg.name === config.package : true))
    .filter(pkg => (config.include.length > 0 ? config.include.includes(pkg.name) : true))
    .filter(pkg => !config.exclude.includes(pkg.name))
    .sort((a, b) => a.name.localeCompare(b.name))
}
