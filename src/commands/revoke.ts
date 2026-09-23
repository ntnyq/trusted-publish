import { discoverPackages } from '../core/discovery'
import { buildTrustConfig } from '../core/providers'
import { createReporter, summarize } from '../core/reporter'
import { matchesTrustConfig } from '../core/trust-config'
import type { CommandReport, PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { createCommandClient, runPackageCommand } from './runner'

/**
 * Revoke command options.
 */
export interface RevokeOptions {
  id?: string
  matching?: boolean
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

  if (Boolean(options.id) === Boolean(options.matching)) {
    throw new Error('revoke requires exactly one of --id or --matching')
  }
  const expected = options.matching ? buildTrustConfig(config) : undefined
  const packages = await discoverPackages(config)
  if (options.id && packages.length > 1) {
    throw new Error(
      'revoke by ID requires a single selected package; use --matching for batch revoke',
    )
  }

  reporter.title('npm trusted publisher revoke')
  reporter.info(`Selected packages: ${packages.length}`)
  reporter.info(
    options.id ? `Trust ID: ${options.id}` : 'Select the matching trust ID for each package',
  )

  const results = await runPackageCommand(config, packages, reporter, async pkg => {
    let trustId = options.id
    if (expected) {
      const entries = await client.list(pkg.name)
      const matches = entries.filter(entry => matchesTrustConfig(entry, expected))
      if (matches.length !== 1 || !matches[0]?.id) {
        return {
          packageName: pkg.name,
          packageDir: pkg.dir,
          status: 'failed',
          message: 'expected exactly one matching entry with an ID',
          entries,
          expected,
        }
      }
      trustId = matches[0].id
    }
    if (!trustId) {
      throw new Error('no trust ID selected')
    }
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
