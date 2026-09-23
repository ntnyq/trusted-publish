import { validatePackageName } from './package-name'
import type { CommandName, TrustedPublishConfig } from './types'

/**
 * Validates provider-specific required fields.
 *
 * @param config - Fully resolved runtime configuration.
 * @param command - Operation being validated; list/revoke/bootstrap/doctor need no claims.
 * @returns Nothing. Throws when validation fails.
 *
 * @example
 * ```ts
 * validateConfig(config)
 * ```
 */
export function validateConfig(config: TrustedPublishConfig, command: CommandName = 'setup'): void {
  if (!['github', 'gitlab', 'circleci'].includes(config.provider)) {
    throw new Error('provider must be github, gitlab, or circleci')
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

  if (!Number.isFinite(config.requestTimeoutMs) || config.requestTimeoutMs < 0) {
    throw new Error('requestTimeoutMs must be >= 0')
  }

  if (
    !URL.canParse(config.registry)
    || !['https:', 'http:'].includes(new URL(config.registry).protocol)
  ) {
    throw new Error('registry must be a valid URL')
  }

  if (config.remotePackage && config.package) {
    throw new Error('remotePackage and package cannot be combined')
  }
  if (config.remotePackage) {
    validatePackageName(config.remotePackage)
  }
  if (['list', 'revoke', 'bootstrap', 'doctor'].includes(command)) {
    return
  }

  if (config.provider === 'github') {
    if (!config.claims.workflow && !config.claims.file) {
      throw new Error('github provider requires workflow/file')
    }
    const workflow = config.claims.workflow || config.claims.file || ''
    if (!/^[^/\\]+\.ya?ml$/.test(workflow)) {
      throw new Error('github workflow must be a .yml/.yaml filename, not a path')
    }
    if (!config.claims.repository) {
      throw new Error('github provider requires repository')
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(config.claims.repository)) {
      throw new Error('github repository must be owner/repo')
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
