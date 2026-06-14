import type { TrustedPublishConfig } from './types'

/**
 * Default ignore globs used while searching package manifests.
 */
export const DEFAULT_IGNORES = [
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
export const CONFIG_FILES = [
  'trusted-publish.config.ts',
  'trusted-publish.config.mts',
  'trusted-publish.config.js',
  'trusted-publish.config.mjs',
  'trusted-publish.config.cjs',
  'trusted-publish.config.json',
]
