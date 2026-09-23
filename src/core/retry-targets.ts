import { readFile } from 'node:fs/promises'
import { validatePackageName } from './package-name'

/**
 * Reads failed package names as data from a saved CLI/Node report.
 * @param path - Report file path.
 * @returns Failed package names to intersect with the current selection.
 */
export async function readRetryTargets(path: string): Promise<Set<string>> {
  const report: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (
    !report
    || typeof report !== 'object'
    || !('results' in report)
    || !Array.isArray(report.results)
  ) {
    throw new Error('retry report must contain a results array')
  }
  const names = new Set<string>()
  for (const result of report.results) {
    if (
      !result
      || typeof result !== 'object'
      || !('status' in result)
      || !('packageName' in result)
      || typeof result.packageName !== 'string'
      || !['configured', 'already', 'failed', 'skipped', 'revoked'].includes(result.status)
    ) {
      throw new Error('invalid package result in retry report')
    }
    if (result.status === 'failed') {
      validatePackageName(result.packageName)
      names.add(result.packageName)
    }
  }
  return names
}
