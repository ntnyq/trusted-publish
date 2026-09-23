import type { ConfigOverride, TrustedPublishConfig } from '../types'

/**
 * Deep-merges trusted publish config structures with array override semantics.
 *
 * @param base - Base configuration.
 * @param patch - Partial patch values.
 * @returns Merged trusted publish configuration.
 *
 * @example
 * ```ts
 * const merged = mergeConfig(base, { include: ['pkg-a'] })
 * ```
 */
export function mergeConfig(
  base: TrustedPublishConfig,
  patch: ConfigOverride,
): TrustedPublishConfig {
  return {
    ...base,
    ...patch,
    discovery: {
      ...base.discovery,
      ...patch.discovery,
      workspaceGlobs: patch.discovery?.workspaceGlobs || base.discovery.workspaceGlobs,
      packageJsonGlobs: patch.discovery?.packageJsonGlobs || base.discovery.packageJsonGlobs,
    },
    claims: {
      ...base.claims,
      ...patch.claims,
    },
    include: patch.include || base.include,
    exclude: patch.exclude || base.exclude,
    ignores: patch.ignores || base.ignores,
    permissions: patch.permissions || base.permissions,
  }
}
