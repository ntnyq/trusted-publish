import { NpmTrustClient } from '../core/client'
import { discoverPackages } from '../core/discovery'
import { buildTrustConfig } from '../core/providers'
import { createReporter, summarize } from '../core/reporter'
import type { PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { runWithConcurrency, stableStringify } from '../utils'

/**
 * Verifies expected trust payload exists remotely for each selected package.
 *
 * @param config - Resolved runtime configuration.
 * @returns Exit code where `0` means all packages matched and `1` means mismatch/failure.
 *
 * @example
 * ```ts
 * const code = await runVerify(config)
 * ```
 */
export async function runVerify(config: TrustedPublishConfig): Promise<number> {
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

  const expected = buildTrustConfig(config)
  const packages = await discoverPackages(config)
  const results: PackageCommandResult[] = []

  reporter.title('npm trusted publisher verify')
  reporter.info(`Selected packages: ${packages.length}`)

  const processed = await runWithConcurrency(
    packages,
    config.concurrency,
    async pkg => {
      try {
        const remote = await client.list(pkg.name)
        const hit = remote.some(
          item =>
            item.type === expected.type &&
            stableStringify(item.claims) === stableStringify(expected.claims) &&
            stableStringify(item.permissions || []) ===
              stableStringify(expected.permissions || []),
        )

        const result: PackageCommandResult = hit
          ? {
              packageName: pkg.name,
              packageDir: pkg.dir,
              status: 'configured',
              message: 'configuration matches expected payload',
            }
          : {
              packageName: pkg.name,
              packageDir: pkg.dir,
              status: 'failed',
              message: 'no matching trusted publisher configuration',
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
