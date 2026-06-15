import { NpmTrustClient } from '../core/client'
import { discoverPackages } from '../core/discovery'
import { createReporter, summarize } from '../core/reporter'
import type { PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { runWithConcurrency } from '../core/utils'

/**
 * Revoke command options.
 */
export interface RevokeOptions {
  id?: string
}

/**
 * Revokes trust configuration by id for selected packages.
 *
 * @param config - Resolved runtime configuration.
 * @param options - Revoke options including trust id.
 * @returns Exit code where `0` means success and `1` means one or more failures.
 *
 * @example
 * ```ts
 * const code = await runRevoke(config, { id: 'trust-id' })
 * ```
 */
export async function runRevoke(
  config: TrustedPublishConfig,
  options: RevokeOptions,
): Promise<number> {
  const reporter = createReporter(config)
  const client = new NpmTrustClient({
    registry: config.registry,
    requestTimeoutMs: config.requestTimeoutMs,
    token: config.token,
    otp: config.otp,
    dryRun: config.dryRun,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    maxRetryDelayMs: config.maxRetryDelayMs,
    rateLimitMs: config.rateLimitMs,
  })

  if (!options.id) {
    throw new Error('revoke command requires --id')
  }
  const trustId = options.id

  const packages = await discoverPackages(config)
  const results: PackageCommandResult[] = []

  reporter.title('npm trusted publisher revoke')
  reporter.info(`Selected packages: ${packages.length}`)
  reporter.info(`Trust ID: ${trustId}`)

  const processed = await runWithConcurrency(
    packages,
    config.concurrency,
    async pkg => {
      if (config.dryRun) {
        const result: PackageCommandResult = {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'skipped',
          message: `dry-run revoke id=${trustId}`,
        }
        reporter.result(result)
        return result
      }

      try {
        await client.revoke(pkg.name, trustId)
        const result: PackageCommandResult = {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'revoked',
          message: 'trust configuration revoked',
        }
        reporter.result(result)
        return result
      } catch (error) {
        const result: PackageCommandResult = {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'failed',
          message: (error as Error).message,
        }
        reporter.result(result)
        return result
      }
    },
    {
      failFast: config.failFast,
      shouldStop: result => result.status === 'failed',
    },
  )

  results.push(...processed)

  const summary = summarize(results)
  reporter.summary(summary, results)
  return summary.failed > 0 ? 1 : 0
}
