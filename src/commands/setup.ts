import { NpmTrustClient } from '../core/client'
import { discoverPackages } from '../core/discovery'
import { buildTrustConfig } from '../core/providers'
import { createReporter, summarize } from '../core/reporter'
import type { PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { runWithConcurrency } from '../core/utils'

const STATUS_CONFLICT = 409

/**
 * Configures trusted publishers for selected packages.
 *
 * @param config - Resolved runtime configuration.
 * @returns Exit code where `0` means success and `1` means partial/full failure.
 *
 * @example
 * ```ts
 * const code = await runSetup(config)
 * ```
 */
export async function runSetup(config: TrustedPublishConfig): Promise<number> {
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

  const trustConfig = buildTrustConfig(config)
  const packages = await discoverPackages(config)
  const results: PackageCommandResult[] = []

  reporter.title('npm trusted publisher setup')
  reporter.info(`Selected packages: ${packages.length}`)
  reporter.info(`Provider: ${config.provider}`)
  reporter.info(`Registry: ${config.registry}`)
  reporter.info(`Mode: ${config.dryRun ? 'dry-run' : 'apply'}`)

  const processed = await runWithConcurrency(
    packages,
    config.concurrency,
    async (pkg, index) => {
      if (config.dryRun) {
        const result: PackageCommandResult = {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'skipped',
          message: 'dry-run (no changes applied)',
        }
        reporter.result(result)
        return { index, result }
      }

      try {
        await client.setup(pkg.name, trustConfig)
        const result: PackageCommandResult = {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'configured',
          message: 'trusted publisher configured',
        }
        reporter.result(result)
        return { index, result }
      } catch (error) {
        const { statusCode } = error as { statusCode?: number }
        if (statusCode === STATUS_CONFLICT) {
          const result: PackageCommandResult = {
            packageName: pkg.name,
            packageDir: pkg.dir,
            status: 'already',
            message: 'trust configuration already exists',
          }
          reporter.result(result)
          return { index, result }
        }

        const result: PackageCommandResult = {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'failed',
          message: (error as Error).message,
        }
        reporter.result(result)
        return { index, result }
      }
    },
    {
      failFast: config.failFast,
      shouldStop: ({ result }) => result.status === 'failed',
    },
  )

  const processedIndexes = new Set<number>()
  for (const item of processed) {
    processedIndexes.add(item.index)
    results.push(item.result)
  }

  if (config.failFast && results.length < packages.length) {
    for (const [index, pkg] of packages.entries()) {
      if (processedIndexes.has(index)) {
        continue
      }
      const skippedResult: PackageCommandResult = {
        packageName: pkg.name,
        packageDir: pkg.dir,
        status: 'skipped',
        message: 'skipped due to fail-fast stop',
      }
      results.push(skippedResult)
      reporter.result(skippedResult)
    }
  }

  const summary = summarize(results)
  reporter.summary(summary, results)

  return summary.failed > 0 ? 1 : 0
}
