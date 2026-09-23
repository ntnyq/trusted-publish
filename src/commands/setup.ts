import { HTTP_STATUS_CONFLICT } from '../constants'
import { discoverPackages } from '../core/discovery'
import { buildTrustConfig } from '../core/providers'
import { createReporter, summarize } from '../core/reporter'
import { matchesTrustConfig } from '../core/trust-config'
import type { CommandReport, PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { createCommandClient, runPackageCommand } from './runner'
import { replaceTrust } from './setup-replace'

/**
 * Optional destructive update behavior, enabled only by explicit request.
 */
export interface SetupOptions {
  replace?: boolean
}

/**
 * Configures trusted publishers for selected packages.
 *
 * @param config - Resolved runtime configuration.
 * @param options - Explicit replacement controls.
 * @returns Structured report where `0` means success and `1` means partial/full failure.
 *
 * @example
 * ```ts
 * const code = await runSetup(config)
 * ```
 */
export async function runSetupDetailed(
  config: TrustedPublishConfig,
  options: SetupOptions = {},
): Promise<CommandReport> {
  const reporter = createReporter(config)
  const client = createCommandClient(config)

  const trustConfig = buildTrustConfig(config)
  const packages = await discoverPackages(config)

  reporter.title('npm trusted publisher setup')
  reporter.info(`Selected packages: ${packages.length}`)
  reporter.info(`Provider: ${config.provider}`)
  reporter.info(`Registry: ${config.registry}`)
  reporter.info(`Mode: ${config.dryRun ? 'dry-run' : 'apply'}`)

  const results = await runPackageCommand(config, packages, reporter, async pkg => {
    if (config.dryRun) {
      return {
        packageName: pkg.name,
        packageDir: pkg.dir,
        status: 'skipped',
        message: options.replace
          ? 'dry-run: replace conflicting entry (revoke then create; non-atomic)'
          : 'dry-run (no changes applied)',
        expected: trustConfig,
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
        const match = existing.find(item => matchesTrustConfig(item, trustConfig))
        if (match) {
          return {
            packageName: pkg.name,
            packageDir: pkg.dir,
            status: 'already',
            message: 'matching trust configuration already exists',
            ...(match.id ? { trustId: match.id } : {}),
          } satisfies PackageCommandResult
        }

        if (options.replace) {
          return replaceTrust(client, pkg, existing, trustConfig)
        }

        return {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'failed',
          message: 'an existing trust configuration does not match',
          entries: existing,
          expected: trustConfig,
        } satisfies PackageCommandResult
      }
      throw error
    }
  })

  const summary = summarize(results)
  reporter.summary(summary, results)

  return { exitCode: summary.failed > 0 ? 1 : 0, summary, results }
}

/**
 * Runs setup and returns its exit code.
 * @param config - Runtime config.
 * @param options - Explicit replacement controls.
 * @returns Exit code.
 */
export async function runSetup(
  config: TrustedPublishConfig,
  options?: SetupOptions,
): Promise<number> {
  const report = await runSetupDetailed(config, options)
  return report.exitCode
}
