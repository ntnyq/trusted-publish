import { DEFAULT_CONFIG } from '../../src/core/config/defaults'
import type { TrustedPublishConfig } from '../../src/core/types'

/**
 * Builds an isolated configuration for local workspace command tests.
 * @param cwd - Workspace directory.
 * @returns Configuration with short retries and no terminal output.
 */
export function createConfig(cwd: string): TrustedPublishConfig {
  return {
    cwd,
    registry: 'https://registry.npmjs.org',
    requestTimeoutMs: 30_000,
    provider: 'github',
    include: [],
    exclude: [],
    ignores: [],
    includePrivate: false,
    discovery: {
      fromWorkspaces: false,
      fromGlobs: true,
      workspaceGlobs: [],
      packageJsonGlobs: ['packages/*/package.json'],
    },
    claims: {
      repository: 'owner/repo',
      workflow: 'release.yml',
    },
    permissions: ['createPackage'],
    concurrency: 2,
    failFast: false,
    maxRetries: 1,
    retryDelayMs: 1,
    maxRetryDelayMs: 2,
    rateLimitMs: 0,
    dryRun: false,
    json: false,
    silent: true,
    verbose: false,
    yes: true,
  }
}

/**
 * Builds configuration for remote trust management scenarios without automatic retries.
 * @returns Remote package configuration with a GitHub publisher.
 */
export function createRemoteConfig(): TrustedPublishConfig {
  return {
    ...DEFAULT_CONFIG,
    remotePackage: 'example',
    silent: true,
    maxRetries: 0,
    claims: { repository: 'owner/repo', workflow: 'release.yml' },
    permissions: ['createPackage'],
  }
}
