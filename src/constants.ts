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
  permissions: [],
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
export const RESULT_STATUS_PREFIXES: Readonly<Record<CommandResultStatus, string>> = {
  configured: '[OK]',
  already: '[SKIP]',
  revoked: '[OK]',
  skipped: '[SKIP]',
  failed: '[FAIL]',
}

/**
 * Status codes that may carry an npm authentication challenge.
 */
/**
 * Missing or invalid credentials.
 */
export const HTTP_UNAUTHORIZED = 401
/**
 * Authenticated request lacks permission.
 */
export const HTTP_FORBIDDEN = 403
export const HTTP_AUTH_STATUSES: readonly number[] = [HTTP_UNAUTHORIZED, HTTP_FORBIDDEN]

/**
 * HTTP status codes that cannot have a response body.
 */
const HTTP_NO_CONTENT = 204
const HTTP_RESET_CONTENT = 205
const HTTP_NOT_MODIFIED = 304
export const HTTP_EMPTY_BODY_STATUSES: readonly number[] = [
  HTTP_NO_CONTENT,
  HTTP_RESET_CONTENT,
  HTTP_NOT_MODIFIED,
]

/**
 * Registry package not found status.
 */
export const HTTP_STATUS_NOT_FOUND = 404
