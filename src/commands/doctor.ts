import { HTTP_UNAUTHORIZED, HTTP_FORBIDDEN } from '../constants'
import { discoverPackages } from '../core/discovery'
import { buildTrustConfig } from '../core/providers'
import { createReporter, summarize } from '../core/reporter'
import { matchesTrustConfig } from '../core/trust-config'
import type { CommandReport, Diagnostic, TrustedPublishConfig, TrustConfig } from '../core/types'
import { inspectWorkflow } from '../core/workflow'
import { createCommandClient, runPackageCommand } from './shared'

/**
 * Diagnoses registry visibility, credentials, trust state and optional expected configuration.
 * @param config - Runtime config, with optional provider claims.
 * @returns Structured read-only findings.
 */
export async function runDoctorDetailed(config: TrustedPublishConfig): Promise<CommandReport> {
  const reporter = createReporter(config)
  const client = createCommandClient(config)
  const packages = await discoverPackages(config)
  const common: Diagnostic[] = []
  let expected: TrustConfig | undefined = undefined
  if (Object.keys(config.claims).length > 0 || config.permissions.length > 0) {
    try {
      expected = buildTrustConfig(config)
      common.push(
        {
          check: 'configuration',
          status: 'pass',
          message: 'expected provider configuration is valid',
        },
        ...(await inspectWorkflow(config)),
      )
    } catch (error) {
      common.push({ check: 'configuration', status: 'fail', message: errorMessage(error) })
    }
  } else {
    common.push({
      check: 'configuration',
      status: 'warn',
      message: 'no expected claims supplied; checking registry state only',
    })
  }
  reporter.title('npm trusted publisher doctor')
  let authentication: Promise<Diagnostic> | undefined = undefined
  const results = await runPackageCommand(config, packages, reporter, async pkg => {
    const diagnostics = [...common]
    authentication ??= client.whoami().then(
      username => ({
        check: 'authentication',
        status: 'pass',
        message: `authenticated as ${username}`,
      }),
      error => ({ check: 'authentication', status: 'fail', message: errorMessage(error) }),
    )
    diagnostics.push(await authentication)
    let entries
    try {
      if (await client.packageExists(pkg.name)) {
        diagnostics.push({ check: 'package', status: 'pass', message: 'package exists' })
        entries = await client.list(pkg.name)
        diagnostics.push(describeTrust(entries, expected))
      } else {
        diagnostics.push({
          check: 'package',
          status: 'fail',
          message:
            'package not found or not visible; bootstrap an unpublished package or check private-package access',
        })
      }
    } catch (error) {
      diagnostics.push({ check: 'trust', status: 'fail', message: errorMessage(error) })
    }
    const failed = diagnostics.some(item => item.status === 'fail')
    return {
      packageName: pkg.name,
      packageDir: pkg.dir,
      status: failed ? 'failed' : 'configured',
      message: failed ? 'preflight checks failed' : 'preflight checks completed',
      diagnostics,
      ...(entries ? { entries } : {}),
      ...(expected ? { expected } : {}),
    }
  })
  const summary = summarize(results)
  reporter.summary(summary, results)
  return { exitCode: summary.failed > 0 ? 1 : 0, summary, results }
}

/**
 * Runs read-only diagnostics and returns an exit code.
 * @param config - Runtime settings.
 * @returns Exit code; warnings alone do not fail.
 */
export async function runDoctor(config: TrustedPublishConfig): Promise<number> {
  const report = await runDoctorDetailed(config)
  return report.exitCode
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    if (error.statusCode === HTTP_UNAUTHORIZED) {
      return `authentication required: ${String(error)}`
    }
    if (error.statusCode === HTTP_FORBIDDEN) {
      return `permission denied: ${String(error)}`
    }
  }
  return error instanceof Error ? error.message : String(error)
}

function describeTrust(entries: TrustConfig[], expected: TrustConfig | undefined): Diagnostic {
  if (entries.length === 0) {
    return {
      check: 'trust',
      status: 'warn',
      message: 'no trusted publisher configured; setup is needed',
    }
  }
  if (expected && !entries.some(entry => matchesTrustConfig(entry, expected))) {
    return {
      check: 'trust',
      status: 'fail',
      message: 'existing trusted publisher conflicts with expected configuration',
    }
  }
  return {
    check: 'trust',
    status: 'pass',
    message:
      'trusted publisher configuration is readable; mutation permissions are not proven by read access',
  }
}
