import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isArray, isRecord, isString } from '@ntnyq/utils'
import { parse } from 'yaml'
import { fileExists } from '../utils'
import type { Diagnostic, ProviderType, TrustedPublishConfig } from './types'

/**
 * Infers a repository path only from a matching provider's repository URL.
 * @param cwd - Project root.
 * @param provider - Expected hosting provider.
 * @returns Repository path if recognized.
 */
export async function inferRepository(
  cwd: string,
  provider: ProviderType,
): Promise<string | undefined> {
  const path = resolve(cwd, 'package.json')
  if (provider === 'circleci' || !(await fileExists(path))) {
    return undefined
  }
  const manifest: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!isRecord(manifest)) {
    return undefined
  }
  const repository = manifest['repository']
  const value = isRecord(repository) ? repository['url'] : repository
  if (!isString(value)) {
    return undefined
  }
  const host = provider === 'github' ? 'github.com' : 'gitlab.com'
  if (provider === 'github' && /^[\w.-]+\/[\w.-]+$/.test(value)) {
    return value
  }
  const normalized = value
    .replace(/^git\+/, '')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/^(github|gitlab):/, 'https://$1.com/')
  if (!URL.canParse(normalized)) {
    return undefined
  }
  const url = new URL(normalized)
  if (url.hostname !== host) {
    return undefined
  }
  const repositoryPath = url.pathname.replace(/^\/|\/$/g, '').replace(/\.git$/, '')
  return repositoryPath.includes('/') ? repositoryPath : undefined
}

/**
 * Inspects local GitHub workflow syntax and OIDC permissions for direct publish jobs.
 * @param config - Provider and workflow settings.
 * @returns Diagnostics; remote selectors skip local file checks.
 */
export async function inspectWorkflow(config: TrustedPublishConfig): Promise<Diagnostic[]> {
  if (config.remotePackage || config.provider !== 'github') {
    return [
      {
        check: 'workflow',
        status: 'warn',
        message: 'local workflow inspection skipped for remote packages or non-GitHub providers',
      },
    ]
  }
  const file = config.claims.workflow || config.claims.file
  if (!file) {
    return []
  }
  const path = resolve(config.cwd || process.cwd(), '.github/workflows', file)
  if (!(await fileExists(path))) {
    return [{ check: 'workflow', status: 'fail', message: `workflow file not found: ${path}` }]
  }
  const workflow: unknown = parse(await readFile(path, 'utf8'))
  if (!isRecord(workflow) || !isRecord(workflow['jobs'])) {
    return [{ check: 'workflow', status: 'fail', message: 'workflow must contain a jobs mapping' }]
  }
  const diagnostics: Diagnostic[] = []
  for (const [name, job] of Object.entries(workflow['jobs'])) {
    if (!isRecord(job) || !isArray(job['steps'])) {
      continue
    }
    const publishes = job['steps'].some(
      step =>
        isRecord(step)
        && isString(step['run'])
        && /\b(?:npm|pnpm|yarn(?:\s+npm)?)\s+(?:--[^\s]+\s+)*publish\b/.test(step['run']),
    )
    if (!publishes) {
      continue
    }
    const permissions = job['permissions'] ?? workflow['permissions']
    const hasOidc =
      permissions === 'write-all' || (isRecord(permissions) && permissions['id-token'] === 'write')
    diagnostics.push({
      check: 'workflow',
      status: hasOidc ? 'pass' : 'fail',
      message: hasOidc
        ? `publish job ${name} grants id-token: write`
        : `publish job ${name} needs permissions.id-token: write`,
    })
  }
  if (diagnostics.length === 0) {
    diagnostics.push({
      check: 'workflow',
      status: 'warn',
      message:
        'no direct npm/pnpm/yarn publish step found; inspect reusable workflows or release actions manually',
    })
  }
  return diagnostics
}
