import { resolve } from 'node:path'
import { loadConfig } from 'unconfig'
import { CONFIG_FILES, DEFAULT_CONFIG } from '../constants'
import {
  fileExists,
  mergeConfig,
  normalizeRegistry,
  parsePermissions,
  resolveCwd,
  toArray,
  toNumber,
  uniq,
} from '../utils'
import type { PermissionInput } from '../utils'
import { getNpmToken, loadNpmConfig } from './auth'
import type {
  Config,
  ConfigOverride,
  CommandName,
  ProviderType,
  TrustedPublishConfig,
  TrustPermission,
} from './types'
import { validateConfig } from './validation'
import { inferRepository } from './workflow'

/**
 * Input accepted by config loader before defaults are resolved.
 */
export interface LoadConfigInput {
  cwd?: string
  config?: string
  profile?: string
  requestTimeoutMs?: number | string
  provider?: ProviderType
  command?: CommandName
  retryFrom?: string
  remotePackage?: string
  package?: string
  include?: string | string[]
  exclude?: string | string[]
  ignores?: string | string[]
  includePrivate?: boolean
  workspaceGlobs?: string | string[]
  packageJsonGlobs?: string | string[]
  fromWorkspaces?: boolean
  fromGlobs?: boolean
  repository?: string
  workflow?: string
  project?: string
  file?: string
  environment?: string
  orgId?: string
  projectId?: string
  pipelineDefinitionId?: string
  vcsOrigin?: string
  contextIds?: string | string[]
  allowPublish?: boolean
  allowStagePublish?: boolean
  permissions?: TrustPermission[]
  concurrency?: number | string
  failFast?: boolean
  maxRetries?: number | string
  retryDelayMs?: number | string
  maxRetryDelayMs?: number | string
  rateLimitMs?: number | string
  dryRun?: boolean
  json?: boolean
  silent?: boolean
  verbose?: boolean
  yes?: boolean
  registry?: string
  token?: string
  otp?: string
  authenticate?: TrustedPublishConfig['authenticate']
}

/**
 * Helper for authoring strongly-typed configuration files.
 *
 * @param config - User configuration object.
 * @returns The same object with preserved type inference.
 *
 * @example
 * import { defineConfig } from 'trusted-publish'
 *
 * export default defineConfig({
 *   provider: 'github',
 *   claims: {
 *     repository: 'owner/repo',
 *     workflow: 'release.yml',
 *   },
 *   profiles: {
 *     ci: {
 *       dryRun: true,
 *       failFast: true,
 *     },
 *   },
 * })
 */
export function defineConfig<T extends Config>(config: T): T {
  return config
}

/**
 * Loads config from file, env vars and CLI-like input, then validates it.
 *
 * @param cliInput - Raw loader input.
 * @returns A fully resolved runtime config.
 *
 * @example
 * ```ts
 * const config = await loadTrustedPublishConfig({
 *   cwd: process.cwd(),
 *   provider: 'github',
 *   repository: 'owner/repo',
 *   workflow: 'release.yml',
 *   allowPublish: true,
 * })
 * ```
 */
export async function loadTrustedPublishConfig(
  cliInput: LoadConfigInput,
): Promise<TrustedPublishConfig> {
  const cwd = resolveCwd(cliInput.cwd)
  const source = cliInput.config ? resolve(cwd, cliInput.config) : undefined
  if (source && !(await fileExists(source))) {
    throw new Error(`config file not found: ${source}`)
  }

  const { config } = await loadConfig<Config>({
    cwd,
    defaults: {},
    sources: source ? [{ files: [source], extensions: [] }] : [{ files: CONFIG_FILES }],
    merge: true,
  })

  const baseConfig = mergeConfig(DEFAULT_CONFIG, config || {})
  if (
    cliInput.profile
    && (!config?.profiles || !Object.hasOwn(config.profiles, cliInput.profile))
  ) {
    throw new Error(`config profile not found: ${cliInput.profile}`)
  }
  const profileConfig =
    cliInput.profile && config?.profiles?.[cliInput.profile]
      ? mergeConfig(baseConfig, config.profiles[cliInput.profile] || {})
      : baseConfig

  const npmConfig = await loadNpmConfig(cwd)
  const configuredRegistry =
    cliInput.registry
    || (cliInput.profile ? config?.profiles?.[cliInput.profile]?.registry : undefined)
    || config?.registry
    || npmConfig.get('registry')
  const registry = normalizeRegistry(
    typeof configuredRegistry === 'string' ? configuredRegistry : profileConfig.registry,
  )

  const claims: TrustedPublishConfig['claims'] = { ...profileConfig.claims }
  const repository = cliInput.repository ?? profileConfig.claims.repository
  if (repository !== undefined) {
    claims.repository = repository
  }
  const workflow = cliInput.workflow ?? profileConfig.claims.workflow
  if (workflow !== undefined) {
    claims.workflow = workflow
  }
  const project = cliInput.project ?? profileConfig.claims.project
  if (project !== undefined) {
    claims.project = project
  }
  const file = cliInput.file ?? profileConfig.claims.file
  if (file !== undefined) {
    claims.file = file
  }
  const environment = cliInput.environment ?? profileConfig.claims.environment
  if (environment !== undefined) {
    claims.environment = environment
  }
  const orgId = cliInput.orgId ?? profileConfig.claims.orgId
  if (orgId !== undefined) {
    claims.orgId = orgId
  }
  const projectId = cliInput.projectId ?? profileConfig.claims.projectId
  if (projectId !== undefined) {
    claims.projectId = projectId
  }
  const pipelineDefinitionId =
    cliInput.pipelineDefinitionId ?? profileConfig.claims.pipelineDefinitionId
  if (pipelineDefinitionId !== undefined) {
    claims.pipelineDefinitionId = pipelineDefinitionId
  }
  const vcsOrigin = cliInput.vcsOrigin ?? profileConfig.claims.vcsOrigin
  if (vcsOrigin !== undefined) {
    claims.vcsOrigin = vcsOrigin
  }
  const contextIds = uniq([
    ...(profileConfig.claims.contextIds || []),
    ...toArray(cliInput.contextIds),
  ])
  if (contextIds.length > 0) {
    claims.contextIds = contextIds
  }

  const permissionInput: PermissionInput = {
    permissions: cliInput.permissions || profileConfig.permissions,
  }
  if (cliInput.allowPublish !== undefined) {
    permissionInput.allowPublish = cliInput.allowPublish
  }
  if (cliInput.allowStagePublish !== undefined) {
    permissionInput.allowStagePublish = cliInput.allowStagePublish
  }

  const patch: ConfigOverride = {
    cwd,
    requestTimeoutMs: toNumber(cliInput.requestTimeoutMs, profileConfig.requestTimeoutMs),
    provider: cliInput.provider || profileConfig.provider,
    include: uniq([...profileConfig.include, ...toArray(cliInput.include)]),
    exclude: uniq([...profileConfig.exclude, ...toArray(cliInput.exclude)]),
    ignores: uniq([...profileConfig.ignores, ...toArray(cliInput.ignores)]),
    includePrivate: cliInput.includePrivate ?? profileConfig.includePrivate,
    discovery: {
      ...profileConfig.discovery,
      fromWorkspaces:
        cliInput.fromWorkspaces
        ?? (cliInput.packageJsonGlobs === undefined
          ? profileConfig.discovery.fromWorkspaces
          : false),
      fromGlobs: cliInput.fromGlobs ?? profileConfig.discovery.fromGlobs,
      workspaceGlobs: uniq([
        ...profileConfig.discovery.workspaceGlobs,
        ...toArray(cliInput.workspaceGlobs),
      ]),
      packageJsonGlobs:
        cliInput.packageJsonGlobs === undefined
          ? profileConfig.discovery.packageJsonGlobs
          : uniq(toArray(cliInput.packageJsonGlobs)),
    },
    claims,
    permissions: parsePermissions(permissionInput),
    concurrency: toNumber(cliInput.concurrency, profileConfig.concurrency),
    failFast: cliInput.failFast ?? profileConfig.failFast,
    maxRetries: toNumber(cliInput.maxRetries, profileConfig.maxRetries),
    retryDelayMs: toNumber(cliInput.retryDelayMs, profileConfig.retryDelayMs),
    maxRetryDelayMs: toNumber(cliInput.maxRetryDelayMs, profileConfig.maxRetryDelayMs),
    rateLimitMs: toNumber(cliInput.rateLimitMs, profileConfig.rateLimitMs),
    dryRun: cliInput.dryRun ?? profileConfig.dryRun,
    json: cliInput.json ?? profileConfig.json,
    silent: cliInput.silent ?? profileConfig.silent,
    verbose: cliInput.verbose ?? profileConfig.verbose,
    yes: cliInput.yes ?? profileConfig.yes,
    registry,
  }

  const retryFrom = cliInput.retryFrom ?? profileConfig.retryFrom
  if (retryFrom !== undefined) {
    patch.retryFrom = resolve(cwd, retryFrom)
  }

  const remotePackage = cliInput.remotePackage ?? profileConfig.remotePackage
  if (remotePackage !== undefined) {
    patch.remotePackage = remotePackage
  }

  const selectedPackage = cliInput.package || profileConfig.package
  if (selectedPackage !== undefined) {
    patch.package = selectedPackage
  }

  const profile = cliInput.profile
  if (profile !== undefined) {
    patch.profile = profile
  }

  const token =
    cliInput.token
    || process.env['NPM_TOKEN']
    || profileConfig.token
    || (URL.canParse(registry) ? getNpmToken(npmConfig, registry) : undefined)
  if (token !== undefined) {
    patch.token = token
  }

  const otp = cliInput.otp || process.env['NPM_OTP'] || profileConfig.otp
  if (otp !== undefined) {
    patch.otp = otp
  }

  if (cliInput.authenticate) {
    patch.authenticate = cliInput.authenticate
  }

  if (
    !patch.remotePackage
    && (cliInput.command !== 'doctor' || claims.workflow || claims.file)
    && !claims.repository
    && (patch.provider || profileConfig.provider) === 'github'
  ) {
    const inferredRepository = await inferRepository(cwd, 'github')
    if (inferredRepository) {
      claims.repository = inferredRepository
    }
  }
  if (
    !patch.remotePackage
    && (cliInput.command !== 'doctor' || claims.file)
    && !claims.project
    && (patch.provider || profileConfig.provider) === 'gitlab'
  ) {
    const inferredProject = await inferRepository(cwd, 'gitlab')
    if (inferredProject) {
      claims.project = inferredProject
    }
  }

  const merged = mergeConfig(profileConfig, patch)

  validateConfig(merged, cliInput.command)
  return merged
}

export { validateConfig } from './validation'
