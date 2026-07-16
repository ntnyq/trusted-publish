import { discoverPackages } from '../core/discovery'
import { createReporter, summarize } from '../core/reporter'
import type { PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { createCommandClient, runPackageCommand } from './shared'

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
  const client = createCommandClient(config)

  const packages = await discoverPackages(config)

  reporter.title('npm trusted publisher list')
  reporter.info(`Selected packages: ${packages.length}`)

  const results = await runPackageCommand(
    config,
    packages,
    reporter,
    async pkg => {
      const items = await client.list(pkg.name)
      return {
        packageName: pkg.name,
        packageDir: pkg.dir,
        status: 'configured',
        message: `found ${items.length} trust config(s)`,
      } satisfies PackageCommandResult
    },
  )

  const summary = summarize(results)
  reporter.summary(summary, results)
  return summary.failed > 0 ? 1 : 0
}
