import type { NpmTrustClient } from '../core/client'
import { matchesTrustConfig } from '../core/trust-config'
import type { PackageCommandResult, PackageMeta, TrustConfig } from '../core/types'

/**
 * Explicitly replaces one entry and attempts recovery only when the registry is confirmed empty.
 * @param client - Authenticated registry client.
 * @param pkg - Selected package.
 * @param entries - Entries observed after a conflict.
 * @param expected - Desired payload.
 * @returns Replacement or recovery result.
 */
export async function replaceTrust(
  client: NpmTrustClient,
  pkg: PackageMeta,
  entries: TrustConfig[],
  expected: TrustConfig,
): Promise<PackageCommandResult> {
  const base = { packageName: pkg.name, packageDir: pkg.dir, entries, expected }
  const previous = entries[0]
  if (entries.length !== 1 || !previous?.id) {
    return {
      ...base,
      status: 'failed',
      message: 'replace requires exactly one existing entry with an ID',
    }
  }
  await client.revoke(pkg.name, previous.id)
  try {
    await client.setup(pkg.name, expected)
    return { ...base, status: 'configured', message: 'trusted publisher replaced' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      const current = await client.list(pkg.name)
      if (current.some(entry => matchesTrustConfig(entry, expected))) {
        return {
          ...base,
          status: 'configured',
          message: 'replacement confirmed after an uncertain response',
        }
      }
      if (current.length > 0) {
        return {
          ...base,
          status: 'failed',
          message,
          recovery:
            'not restored: registry contains another configuration; inspect it before retrying',
        }
      }
      const { type, claims, permissions } = previous
      await client.setup(pkg.name, { type, claims, ...(permissions ? { permissions } : {}) })
      return {
        ...base,
        status: 'failed',
        message,
        recovery: 'previous configuration restored; its trust ID may have changed',
      }
    } catch (recoveryError) {
      return {
        ...base,
        status: 'failed',
        message,
        recovery: `automatic recovery failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}; inspect registry state and restore entries manually`,
      }
    }
  }
}
