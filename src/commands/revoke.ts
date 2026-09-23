import { discoverPackages } from '../core/discovery'
import { createReporter, summarize } from '../core/reporter'
import type { CommandReport, PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { createCommandClient, runPackageCommand } from './shared'

/**
 * Revoke command options.
 */
export interface RevokeOptions {
  id: string
}

/**
 * Revokes trust configuration by id for selected packages.
 *
 * @param config - Resolved runtime configuration.
 * @param options - Revoke options including trust id.
 * @returns Structured report where `0` means success and `1` means one or more failures.
 *
 * @example
 * ```ts
 * const code = await runRevoke(config, { id: 'trust-id' })
 * ```
 */
export async function runRevokeDetailed(
  config: TrustedPublishConfig,
  options: RevokeOptions,
): Promise<CommandReport> {
  const reporter = createReporter(config)
  const client = createCommandClient(config)

  if (!options.id) {
    throw new Error('revoke command requires --id')
  }
  const trustId = options.id

  const packages = await discoverPackages(config)
  if (packages.length > 1) {
    throw new Error('revoke by ID requires a single selected package')
  }

  reporter.title('npm trusted publisher revoke')
  reporter.info(`Selected packages: ${packages.length}`)
  reporter.info(`Trust ID: ${trustId}`)

  const results = await runPackageCommand(config, packages, reporter, async pkg => {
    if (config.dryRun) {
      return {
        packageName: pkg.name,
        packageDir: pkg.dir,
        status: 'skipped',
        message: `dry-run revoke id=${trustId}`,
        trustId,
      } satisfies PackageCommandResult
    }

    await client.revoke(pkg.name, trustId)
    return {
      packageName: pkg.name,
      packageDir: pkg.dir,
      status: 'revoked',
      message: 'trust configuration revoked',
      trustId,
    } satisfies PackageCommandResult
  })

  const summary = summarize(results)
  reporter.summary(summary, results)
  return { exitCode: summary.failed > 0 ? 1 : 0, summary, results }
}

/**
 * Runs revoke and returns its exit code.
 * @param config - Runtime config.
 * @param options - Entry selection.
 * @returns Exit code.
 */
export async function runRevoke(
  config: TrustedPublishConfig,
  options: RevokeOptions,
): Promise<number> {
  const report = await runRevokeDetailed(config, options)
  return report.exitCode
}
