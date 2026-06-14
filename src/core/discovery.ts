import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { glob } from 'tinyglobby'
import { DEFAULT_IGNORES } from './constants'
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
export async function discoverPackages(
  config: TrustedPublishConfig,
): Promise<PackageMeta[]> {
  const cwd = config.cwd || process.cwd()
  const manifests = new Set<string>()

  if (config.discovery.fromWorkspaces) {
    const workspaceManifests = await discoverFromWorkspaces(config)
    for (const m of workspaceManifests) {
      manifests.add(m)
    }
  }

  if (config.discovery.fromGlobs) {
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
    const pkg = parsePackage(manifestPath)
    if (!pkg?.name) {
      continue
    }
    packages.push(pkg)
  }

  return filterPackages(packages, config)
}

async function discoverFromWorkspaces(
  config: TrustedPublishConfig,
): Promise<string[]> {
  const cwd = config.cwd || process.cwd()
  const patterns = new Set<string>()

  const pnpmWorkspacePath = resolve(cwd, 'pnpm-workspace.yaml')
  if (existsSync(pnpmWorkspacePath)) {
    const raw = readFileSync(pnpmWorkspacePath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*-\s*['"]?(.+?)['"]?\s*$/)
      if (match?.[1]) {
        patterns.add(match[1])
      }
    }
  }

  const rootPkgPath = resolve(cwd, 'package.json')
  if (existsSync(rootPkgPath)) {
    const raw = readFileSync(rootPkgPath, 'utf8')
    const pkg = JSON.parse(raw) as {
      workspaces?: string[] | { packages?: string[] }
    }
    if (Array.isArray(pkg.workspaces)) {
      for (const item of pkg.workspaces) {
        patterns.add(item)
      }
    } else if (Array.isArray(pkg.workspaces?.packages)) {
      for (const item of pkg.workspaces.packages) {
        patterns.add(item)
      }
    }
  }

  const bunPath = resolve(cwd, 'bunfig.toml')
  if (existsSync(bunPath)) {
    const raw = readFileSync(bunPath, 'utf8')
    const match = raw.match(/workspaces\s*=\s*\[(.*?)\]/s)
    if (match?.[1]) {
      for (const item of match[1].split(',')) {
        const value = item.trim().replace(/^['"]|['"]$/g, '')
        if (value) {
          patterns.add(value)
        }
      }
    }
  }

  for (const item of config.discovery.workspaceGlobs) {
    patterns.add(item)
  }

  if (patterns.size === 0) {
    return []
  }

  const manifests = await glob(
    [...patterns].map(pattern => `${pattern.replace(/\/$/, '')}/package.json`),
    {
      cwd,
      ignore: [...DEFAULT_IGNORES, ...config.ignores],
      onlyFiles: true,
      absolute: true,
    },
  )

  return manifests
}

function parsePackage(manifestPath: string): PackageMeta | null {
  try {
    const raw = readFileSync(manifestPath, 'utf8')
    const pkg = JSON.parse(raw) as Manifest
    if (!pkg.name) {
      return null
    }
    return {
      name: pkg.name,
      private: Boolean(pkg.private),
      manifestPath,
      dir: manifestPath.replace(/\/package\.json$/, ''),
    }
  } catch {
    return null
  }
}

function filterPackages(
  packages: PackageMeta[],
  config: TrustedPublishConfig,
): PackageMeta[] {
  return packages
    .filter(pkg => (config.includePrivate ? true : !pkg.private))
    .filter(pkg => (config.package ? pkg.name === config.package : true))
    .filter(pkg =>
      config.include.length > 0 ? config.include.includes(pkg.name) : true,
    )
    .filter(pkg => !config.exclude.includes(pkg.name))
    .sort((a, b) => a.name.localeCompare(b.name))
}
