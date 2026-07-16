import { HTTP_STATUS_CONFLICT } from '../constants'
import { discoverPackages } from '../core/discovery'
import { buildTrustConfig } from '../core/providers'
import { createReporter, summarize } from '../core/reporter'
import { matchesTrustConfig } from '../core/trust-config'
import type { PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { createCommandClient, runPackageCommand } from './shared'

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
  const client = createCommandClient(config)

  const trustConfig = buildTrustConfig(config)
  const packages = await discoverPackages(config)

  reporter.title('npm trusted publisher setup')
  reporter.info(`Selected packages: ${packages.length}`)
  reporter.info(`Provider: ${config.provider}`)
  reporter.info(`Registry: ${config.registry}`)
  reporter.info(`Mode: ${config.dryRun ? 'dry-run' : 'apply'}`)

  const results = await runPackageCommand(
    config,
    packages,
    reporter,
    async pkg => {
      if (config.dryRun) {
        return {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'skipped',
          message: 'dry-run (no changes applied)',
        } satisfies PackageCommandResult
      }

      try {
        await client.setup(pkg.name, trustConfig)
        return {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'configured',
          message: 'trusted publisher configured',
        } satisfies PackageCommandResult
      } catch (error) {
        const { statusCode } = error as { statusCode?: number }
        if (statusCode === HTTP_STATUS_CONFLICT) {
          const existing = await client.list(pkg.name)
          const match = existing.find(item =>
            matchesTrustConfig(item, trustConfig),
          )
          if (match) {
            return {
              packageName: pkg.name,
              packageDir: pkg.dir,
              status: 'already',
              message: 'matching trust configuration already exists',
              ...(match.id ? { trustId: match.id } : {}),
            } satisfies PackageCommandResult
          }

          return {
            packageName: pkg.name,
            packageDir: pkg.dir,
            status: 'failed',
            message: 'an existing trust configuration does not match',
          } satisfies PackageCommandResult
        }
        throw error
      }
    },
  )

  const summary = summarize(results)
  reporter.summary(summary, results)

  return summary.failed > 0 ? 1 : 0
}
