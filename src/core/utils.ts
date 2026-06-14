import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { TrustedPublishConfig, TrustPermission } from './types'

/**
 * Normalizes CLI/config values that can be single string or string array.
 *
 * @param value - Input value, such as `"a,b,c"` or `["a", "b"]`.
 * @returns A trimmed array of non-empty strings.
 *
 * @example
 * ```ts
 * toArray('a,b,c')
 * // ['a', 'b', 'c']
 * ```
 */
export function toArray(value: string | string[] | undefined): string[] {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean)
  }
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
}

/**
 * Removes trailing slash from registry URL.
 *
 * @param registry - Registry base URL.
 * @returns Normalized registry URL without trailing slash.
 *
 * @example
 * ```ts
 * normalizeRegistry('https://registry.npmjs.org/')
 * // 'https://registry.npmjs.org'
 * ```
 */
export function normalizeRegistry(registry: string): string {
  return registry.endsWith('/') ? registry.slice(0, -1) : registry
}

/**
 * Resolves cwd to an absolute path.
 *
 * @param cwd - Optional working directory.
 * @returns Absolute cwd path.
 *
 * @example
 * ```ts
 * resolveCwd('.')
 * // '/abs/path/to/current/project'
 * ```
 */
export function resolveCwd(cwd?: string): string {
  return cwd ? resolve(cwd) : process.cwd()
}

/**
 * Input shape for permission inference.
 */
export interface PermissionInput {
  permissions?: string[]
  allowPublish?: boolean
  allowStagePublish?: boolean
}

/**
 * Resolves publish permissions from explicit list or boolean toggles.
 *
 * @param input - Permission input controls.
 * @returns Final list of trust permissions.
 *
 * @example
 * ```ts
 * parsePermissions({ allowPublish: true, allowStagePublish: true })
 * // ['createPackage', 'createStagedPackage']
 * ```
 */
export function parsePermissions(input: PermissionInput): TrustPermission[] {
  if (input.permissions && input.permissions.length > 0) {
    return input.permissions.filter(
      (v): v is TrustPermission =>
        v === 'createPackage' || v === 'createStagedPackage',
    )
  }

  const permissions: TrustPermission[] = []
  if (input.allowPublish) {
    permissions.push('createPackage')
  }
  if (input.allowStagePublish) {
    permissions.push('createStagedPackage')
  }

  return permissions.length > 0 ? permissions : ['createPackage']
}

/**
 * Removes duplicated values while preserving insertion order.
 *
 * @param arr - Input array.
 * @returns De-duplicated array.
 *
 * @example
 * ```ts
 * uniq(['a', 'a', 'b'])
 * // ['a', 'b']
 * ```
 */
export function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

/**
 * Sleeps for a given number of milliseconds.
 *
 * @param ms - Delay in milliseconds.
 * @returns A promise resolved after the delay.
 *
 * @example
 * ```ts
 * await sleep(250)
 * ```
 */
export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return
  }
  await delay(ms)
}

/**
 * Optional controls for concurrent runner.
 */
export interface RunWithConcurrencyOptions<R, T> {
  failFast?: boolean
  shouldStop?: (result: R) => boolean
  onError?: (error: unknown, item: T, index: number) => void
}

/**
 * Runs async worker with bounded concurrency.
 *
 * @param items - Work items.
 * @param concurrency - Maximum parallel workers. Values below `1` are clamped to `1`.
 * @param worker - Async worker callback.
 * @param options - Optional fail-fast/stop/error behavior.
 * @returns Results for completed workers in input order (omits empty slots).
 *
 * @example
 * ```ts
 * const squares = await runWithConcurrency([1, 2, 3], 2, async value => value * value)
 * // [1, 4, 9]
 * ```
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options?: RunWithConcurrencyOptions<R, T>,
): Promise<R[]> {
  const safeConcurrency = Math.max(1, Math.floor(concurrency))
  const results = Array.from({ length: items.length }) as R[]
  let nextIndex = 0
  let shouldStop = false

  async function runWorker(): Promise<void> {
    while (!shouldStop) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) {
        return
      }

      try {
        const result = await worker(items[index]!, index)
        results[index] = result
        if (options?.failFast && options.shouldStop?.(result)) {
          shouldStop = true
          return
        }
      } catch (error) {
        options?.onError?.(error, items[index]!, index)
        if (options?.failFast) {
          shouldStop = true
          return
        }
      }
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => runWorker()))

  return results.filter(Boolean)
}

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
  patch: Partial<TrustedPublishConfig>,
): TrustedPublishConfig {
  return {
    ...base,
    ...patch,
    discovery: {
      ...base.discovery,
      ...patch.discovery,
      workspaceGlobs:
        patch.discovery?.workspaceGlobs || base.discovery.workspaceGlobs,
      packageJsonGlobs:
        patch.discovery?.packageJsonGlobs || base.discovery.packageJsonGlobs,
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
