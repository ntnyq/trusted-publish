import { consola } from 'consola'
import { RESULT_STATUS_PREFIXES } from '../constants'
import type {
  PackageCommandResult,
  Summary,
  TrustedPublishConfig,
} from './types'

/**
 * Creates structured logger helpers based on runtime output options.
 *
 * @param config - Resolved runtime configuration.
 * @returns Reporter methods for title/info/result/summary output.
 *
 * @example
 * ```ts
 * const reporter = createReporter(config)
 * reporter.info('starting...')
 * ```
 */
export function createReporter(config: TrustedPublishConfig) {
  return {
    title(message: string) {
      if (!config.silent) {
        consola.box(message)
      }
    },
    info(message: string) {
      if (!config.silent) {
        consola.info(message)
      }
    },
    success(message: string) {
      if (!config.silent) {
        consola.success(message)
      }
    },
    warn(message: string) {
      if (!config.silent) {
        consola.warn(message)
      }
    },
    error(message: string) {
      consola.error(message)
    },
    result(result: PackageCommandResult) {
      if (config.json) {
        return
      }
      const method = result.status === 'failed' ? consola.error : consola.log
      if (!config.silent) {
        method(
          `${RESULT_STATUS_PREFIXES[result.status]} ${result.packageName} (${result.packageDir}) -> ${result.message}`,
        )
      }
    },
    summary(summary: Summary, results: PackageCommandResult[]) {
      if (config.json) {
        consola.log(JSON.stringify({ summary, results }, null, 2))
        return
      }

      if (config.silent) {
        return
      }

      consola.log('')
      consola.log('---- summary ----')
      consola.log(`Total: ${summary.total}`)
      consola.log(`Configured: ${summary.configured}`)
      consola.log(`Already: ${summary.already}`)
      consola.log(`Revoked: ${summary.revoked}`)
      consola.log(`Skipped: ${summary.skipped}`)
      consola.log(`Failed: ${summary.failed}`)
    },
  }
}

/**
 * Aggregates per-package results into summary totals.
 *
 * @param results - Per-package command results.
 * @returns Summary counters for terminal/JSON output.
 *
 * @example
 * ```ts
 * const summary = summarize(results)
 * ```
 */
export function summarize(results: PackageCommandResult[]): Summary {
  return {
    total: results.length,
    configured: results.filter(v => v.status === 'configured').length,
    already: results.filter(v => v.status === 'already').length,
    revoked: results.filter(v => v.status === 'revoked').length,
    failed: results.filter(v => v.status === 'failed').length,
    skipped: results.filter(v => v.status === 'skipped').length,
  }
}
