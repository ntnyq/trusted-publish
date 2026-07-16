import type { CommandResultStatus, TrustedPublishConfig } from './core/types'

/**
 * Default ignore globs used while searching package manifests.
 */
export const DEFAULT_IGNORES: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.turbo/**',
]

/**
 * Default runtime configuration used when user input is omitted.
 */
export const DEFAULT_CONFIG: TrustedPublishConfig = {
  registry: 'https://registry.npmjs.org',
  requestTimeoutMs: 30_000,
  provider: 'github',
  include: [],
  exclude: [],
  ignores: [],
  includePrivate: false,
  discovery: {
    fromWorkspaces: true,
    fromGlobs: true,
    workspaceGlobs: [],
    packageJsonGlobs: ['**/package.json'],
  },
  claims: {},
  permissions: ['createPackage'],
  concurrency: 4,
  failFast: false,
  maxRetries: 2,
  retryDelayMs: 1200,
  maxRetryDelayMs: 8000,
  rateLimitMs: 0,
  dryRun: false,
  json: false,
  silent: false,
  verbose: false,
  yes: false,
}

/**
 * Supported configuration file names resolved by unconfig.
 */
export const CONFIG_FILES: string[] = [
  'trusted-publish.config.ts',
  'trusted-publish.config.mts',
  'trusted-publish.config.js',
  'trusted-publish.config.mjs',
  'trusted-publish.config.cjs',
  'trusted-publish.config.json',
]

/**
 * HTTP status returned when a trusted publisher already exists.
 */
export const HTTP_STATUS_CONFLICT = 409

/**
 * HTTP status returned when the registry rate limit is exceeded.
 */
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429

/**
 * Lowest HTTP status representing a server error.
 */
export const HTTP_STATUS_SERVER_ERROR_MIN = 500

/**
 * Terminal prefixes for package command result statuses.
 */
export const RESULT_STATUS_PREFIXES: Readonly<
  Record<CommandResultStatus, string>
> = {
  configured: '[OK]',
  already: '[SKIP]',
  revoked: '[OK]',
  skipped: '[SKIP]',
  failed: '[FAIL]',
}
