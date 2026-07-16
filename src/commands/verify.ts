import { discoverPackages } from '../core/discovery'
import { buildTrustConfig } from '../core/providers'
import { createReporter, summarize } from '../core/reporter'
import { matchesTrustConfig } from '../core/trust-config'
import type { TrustedPublishConfig } from '../core/types'
import { createCommandClient, runPackageCommand } from './shared'

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
  const client = createCommandClient(config)

  const expected = buildTrustConfig(config)
  const packages = await discoverPackages(config)

  reporter.title('npm trusted publisher verify')
  reporter.info(`Selected packages: ${packages.length}`)

  const results = await runPackageCommand(
    config,
    packages,
    reporter,
    async pkg => {
      const remote = await client.list(pkg.name)
      const hit = remote.some(item => matchesTrustConfig(item, expected))

      return hit
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
    },
  )

  const summary = summarize(results)
  reporter.summary(summary, results)
  return summary.failed > 0 ? 1 : 0
}
