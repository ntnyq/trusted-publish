import { NpmTrustClient } from '../core/client'
import { discoverPackages } from '../core/discovery'
import { createReporter, summarize } from '../core/reporter'
import type { PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { runWithConcurrency } from '../core/utils'

/**
 * Lists trust configuration counts for selected packages.
 *
 * @param config - Resolved runtime configuration.
 * @returns Exit code where `0` means success and `1` means one or more failures.
 *
 * @example
 * ```ts
 * const code = await runList(config)
 * ```
 */
export async function runList(config: TrustedPublishConfig): Promise<number> {
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

  const packages = await discoverPackages(config)
  const results: PackageCommandResult[] = []

  reporter.title('npm trusted publisher list')
  reporter.info(`Selected packages: ${packages.length}`)

  const processed = await runWithConcurrency(
    packages,
    config.concurrency,
    async pkg => {
      try {
        const items = await client.list(pkg.name)
        const result: PackageCommandResult = {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'configured',
          message: `found ${items.length} trust config(s)`,
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
