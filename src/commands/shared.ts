import { NpmTrustClient } from '../core/client'
import type { createReporter } from '../core/reporter'
import type {
  PackageCommandResult,
  PackageMeta,
  TrustedPublishConfig,
} from '../core/types'
import { runWithConcurrency } from '../utils'

type CommandReporter = ReturnType<typeof createReporter>
type PackageWorker = (
  pkg: PackageMeta,
  index: number,
) => Promise<PackageCommandResult>

interface IndexedResult {
  index: number
  result: PackageCommandResult
}

export function createCommandClient(
  config: TrustedPublishConfig,
): NpmTrustClient {
  return new NpmTrustClient({
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
}

export async function runPackageCommand(
  config: TrustedPublishConfig,
  packages: PackageMeta[],
  reporter: CommandReporter,
  worker: PackageWorker,
): Promise<PackageCommandResult[]> {
  if (packages.length === 0) {
    const result: PackageCommandResult = {
      packageName: config.package || '(selection)',
      packageDir: config.cwd || process.cwd(),
      status: 'failed',
      message: 'no packages matched the current selection',
    }
    reporter.result(result)
    return [result]
  }

  const processed = await runWithConcurrency(
    packages,
    config.concurrency,
    async (pkg, index): Promise<IndexedResult> => {
      const result = await runPackageWorker(pkg, index, worker)
      reporter.result(result)
      return { index, result }
    },
    {
      failFast: config.failFast,
      shouldStop: ({ result }) => result.status === 'failed',
    },
  )

  const resultsByIndex = new Map(
    processed.map(({ index, result }) => [index, result]),
  )

  return packages.map((pkg, index) => {
    const result = resultsByIndex.get(index)
    if (result) {
      return result
    }

    const skippedResult: PackageCommandResult = {
      packageName: pkg.name,
      packageDir: pkg.dir,
      status: 'skipped',
      message: 'skipped due to fail-fast stop',
    }
    reporter.result(skippedResult)
    return skippedResult
  })
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runPackageWorker(
  pkg: PackageMeta,
  index: number,
  worker: PackageWorker,
): Promise<PackageCommandResult> {
  try {
    return await worker(pkg, index)
  } catch (error) {
    return {
      packageName: pkg.name,
      packageDir: pkg.dir,
      status: 'failed',
      message: getErrorMessage(error),
    }
  }
}
