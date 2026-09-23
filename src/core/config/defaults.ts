import type { TrustedPublishConfig } from '../types'

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
