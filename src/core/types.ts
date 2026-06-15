/**
 * Supported trusted publisher providers.
 */
export type ProviderType = 'github' | 'gitlab' | 'circleci'

/**
 * Supported npm trust permissions.
 */
export type TrustPermission = 'createPackage' | 'createStagedPackage'

/**
 * GitHub trusted publisher claims payload.
 */
export interface TrustClaimsGitHub {
  repository: string
  workflow_ref: {
    file: string
  }
  environment?: string
}

/**
 * GitLab trusted publisher claims payload.
 */
export interface TrustClaimsGitLab {
  project_path: string
  ci_config_ref_uri: {
    file: string
  }
  environment?: string
}

/**
 * CircleCI trusted publisher claims payload.
 */
export interface TrustClaimsCircleCI {
  'oidc.circleci.com/org-id': string
  'oidc.circleci.com/project-id': string
  'oidc.circleci.com/pipeline-definition-id': string
  'oidc.circleci.com/vcs-origin': string
  'oidc.circleci.com/context-ids'?: string[]
}

/**
 * Provider-specific claim union.
 */
export type TrustClaims =
  | TrustClaimsGitHub
  | TrustClaimsGitLab
  | TrustClaimsCircleCI

/**
 * Npm trust configuration payload.
 */
export interface TrustConfig {
  id?: string
  type: ProviderType
  claims: TrustClaims
  permissions?: TrustPermission[]
}

/**
 * Normalized workspace package metadata.
 */
export interface PackageMeta {
  dir: string
  manifestPath: string
  name: string
  private: boolean
}

/**
 * Include/exclude selection controls.
 */
export interface TargetSelectOptions {
  package?: string
  include: string[]
  exclude: string[]
  ignores: string[]
  includePrivate: boolean
}

/**
 * Discovery strategy configuration.
 */
export interface DiscoveryConfig {
  fromWorkspaces: boolean
  fromGlobs: boolean
  workspaceGlobs: string[]
  packageJsonGlobs: string[]
}

/**
 * Generic claims input accepted by config loader.
 */
export interface ClaimsInput {
  repository?: string
  workflow?: string
  project?: string
  file?: string
  environment?: string
  orgId?: string
  projectId?: string
  pipelineDefinitionId?: string
  vcsOrigin?: string
  contextIds?: string[]
}

/**
 * Fully resolved runtime configuration for trusted-publish commands.
 */
export interface TrustedPublishConfig {
  cwd?: string
  registry: string
  requestTimeoutMs: number
  provider: ProviderType
  package?: string
  include: string[]
  exclude: string[]
  ignores: string[]
  includePrivate: boolean
  discovery: DiscoveryConfig
  claims: ClaimsInput
  permissions: TrustPermission[]
  concurrency: number
  failFast: boolean
  maxRetries: number
  retryDelayMs: number
  maxRetryDelayMs: number
  rateLimitMs: number
  dryRun: boolean
  json: boolean
  silent: boolean
  verbose: boolean
  yes: boolean
  token?: string
  otp?: string
  profile?: string
}

/**
 * Per-package command status.
 */
export type CommandResultStatus =
  | 'configured'
  | 'already'
  | 'failed'
  | 'skipped'
  | 'revoked'

/**
 * Result item emitted by command runners.
 */
export interface PackageCommandResult {
  packageName: string
  packageDir: string
  status: CommandResultStatus
  message: string
  trustId?: string
}

/**
 * Batch command summary totals.
 */
export interface Summary {
  total: number
  configured: number
  already: number
  revoked: number
  failed: number
  skipped: number
}
