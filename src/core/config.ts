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
import type { Config, TrustedPublishConfig } from './types'

/**
 * Input accepted by config loader before defaults are resolved.
 */
export interface LoadConfigInput {
  cwd?: string
  config?: string
  profile?: string
  requestTimeoutMs?: number | string
  provider?: string
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
  permissions?: string[]
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
  const source =
    cliInput.config && (await fileExists(cliInput.config))
      ? cliInput.config
      : undefined

  const { config } = await loadConfig<Config>({
    cwd,
    defaults: {},
    sources: source
      ? [{ files: [source], extensions: [] }]
      : [{ files: CONFIG_FILES }],
    merge: true,
  })

  const baseConfig = mergeConfig(DEFAULT_CONFIG, config || {})
  const profileConfig =
    cliInput.profile && config?.profiles?.[cliInput.profile]
      ? mergeConfig(baseConfig, config.profiles[cliInput.profile] || {})
      : baseConfig

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

  const patch: Partial<TrustedPublishConfig> = {
    cwd,
    requestTimeoutMs: toNumber(
      cliInput.requestTimeoutMs,
      profileConfig.requestTimeoutMs,
    ),
    provider:
      (cliInput.provider as TrustedPublishConfig['provider']) ||
      profileConfig.provider,
    include: uniq([...profileConfig.include, ...toArray(cliInput.include)]),
    exclude: uniq([...profileConfig.exclude, ...toArray(cliInput.exclude)]),
    ignores: uniq([...profileConfig.ignores, ...toArray(cliInput.ignores)]),
    includePrivate: cliInput.includePrivate ?? profileConfig.includePrivate,
    discovery: {
      ...profileConfig.discovery,
      fromWorkspaces:
        cliInput.fromWorkspaces ?? profileConfig.discovery.fromWorkspaces,
      fromGlobs: cliInput.fromGlobs ?? profileConfig.discovery.fromGlobs,
      workspaceGlobs: uniq([
        ...profileConfig.discovery.workspaceGlobs,
        ...toArray(cliInput.workspaceGlobs),
      ]),
      packageJsonGlobs: uniq([
        ...profileConfig.discovery.packageJsonGlobs,
        ...toArray(cliInput.packageJsonGlobs),
      ]),
    },
    claims,
    permissions: parsePermissions(permissionInput),
    concurrency: toNumber(cliInput.concurrency, profileConfig.concurrency),
    failFast: cliInput.failFast ?? profileConfig.failFast,
    maxRetries: toNumber(cliInput.maxRetries, profileConfig.maxRetries),
    retryDelayMs: toNumber(cliInput.retryDelayMs, profileConfig.retryDelayMs),
    maxRetryDelayMs: toNumber(
      cliInput.maxRetryDelayMs,
      profileConfig.maxRetryDelayMs,
    ),
    rateLimitMs: toNumber(cliInput.rateLimitMs, profileConfig.rateLimitMs),
    dryRun: cliInput.dryRun ?? profileConfig.dryRun,
    json: cliInput.json ?? profileConfig.json,
    silent: cliInput.silent ?? profileConfig.silent,
    verbose: cliInput.verbose ?? profileConfig.verbose,
    yes: cliInput.yes ?? profileConfig.yes,
    registry: normalizeRegistry(cliInput.registry || profileConfig.registry),
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
    cliInput.token || process.env['NPM_TOKEN'] || profileConfig.token
  if (token !== undefined) {
    patch.token = token
  }

  const otp = cliInput.otp || process.env['NPM_OTP'] || profileConfig.otp
  if (otp !== undefined) {
    patch.otp = otp
  }

  const merged = mergeConfig(profileConfig, patch)

  validateConfig(merged)
  return merged
}

/**
 * Validates provider-specific required fields.
 *
 * @param config - Fully resolved runtime configuration.
 * @returns Nothing. Throws when validation fails.
 *
 * @example
 * ```ts
 * validateConfig(config)
 * ```
 */
export function validateConfig(config: TrustedPublishConfig): void {
  if (!config.provider) {
    throw new Error('provider is required')
  }

  if (!Number.isFinite(config.concurrency) || config.concurrency < 1) {
    throw new Error('concurrency must be >= 1')
  }

  if (!Number.isFinite(config.maxRetries) || config.maxRetries < 0) {
    throw new Error('maxRetries must be >= 0')
  }

  if (!Number.isFinite(config.retryDelayMs) || config.retryDelayMs < 0) {
    throw new Error('retryDelayMs must be >= 0')
  }

  if (!Number.isFinite(config.maxRetryDelayMs) || config.maxRetryDelayMs < 0) {
    throw new Error('maxRetryDelayMs must be >= 0')
  }

  if (config.retryDelayMs > config.maxRetryDelayMs) {
    throw new Error('retryDelayMs must be <= maxRetryDelayMs')
  }

  if (!Number.isFinite(config.rateLimitMs) || config.rateLimitMs < 0) {
    throw new Error('rateLimitMs must be >= 0')
  }

  if (
    !Number.isFinite(config.requestTimeoutMs) ||
    config.requestTimeoutMs < 0
  ) {
    throw new Error('requestTimeoutMs must be >= 0')
  }

  if (!URL.canParse(config.registry)) {
    throw new Error('registry must be a valid URL')
  }

  if (!config.permissions.length) {
    throw new Error('at least one permission must be configured')
  }

  if (config.provider === 'github') {
    if (!config.claims.workflow && !config.claims.file) {
      throw new Error('github provider requires workflow/file')
    }
    if (!config.claims.repository) {
      throw new Error('github provider requires repository')
    }
  }

  if (config.provider === 'gitlab') {
    if (!config.claims.project) {
      throw new Error('gitlab provider requires project')
    }
    if (!config.claims.file) {
      throw new Error('gitlab provider requires file')
    }
  }

  if (config.provider === 'circleci') {
    if (!config.claims.orgId) {
      throw new Error('circleci provider requires orgId')
    }
    if (!config.claims.projectId) {
      throw new Error('circleci provider requires projectId')
    }
    if (!config.claims.pipelineDefinitionId) {
      throw new Error('circleci provider requires pipelineDefinitionId')
    }
    if (!config.claims.vcsOrigin) {
      throw new Error('circleci provider requires vcsOrigin')
    }
  }
}
