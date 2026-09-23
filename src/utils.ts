import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { filterFalsy, isArray, isFunction, isNumber, isObject, isString } from '@ntnyq/utils'

/**
 * Checks whether a file system path is accessible.
 *
 * @param path - File system path to check.
 * @returns Whether the path can be accessed.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

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
  if (isArray(value)) {
    return filterFalsy(value)
  }
  return filterFalsy(value.split(',').map(v => v.trim()))
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
 * Converts a finite number or numeric string to a number.
 *
 * @param value - Number-like input.
 * @param fallback - Value returned when the input is invalid.
 * @returns Parsed finite number or the fallback.
 */
export function toNumber(value: number | string | undefined, fallback: number): number {
  if (isNumber(value) && Number.isFinite(value)) {
    return value
  }
  if (isString(value) && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

/**
 * Serializes a value with recursively sorted object keys.
 *
 * @param value - Value to serialize.
 * @returns Stable JSON text.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeStable(value))
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
 * @param options - Optional fail-fast/stop/error behavior. An onError callback handles failures explicitly.
 * @returns Results for completed workers in input order (omits empty slots).
 * @throws {unknown} Unhandled worker errors, after already running workers settle.
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
  const results: (R | undefined)[] = Array.from({ length: items.length })
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
        if (!options?.onError) {
          shouldStop = true
          throw error
        }
        try {
          options.onError(error, items[index]!, index)
        } catch (handlerError) {
          shouldStop = true
          throw handlerError
        }
        if (options?.failFast) {
          shouldStop = true
          return
        }
      }
    }
  }

  const workers = await Promise.allSettled(
    Array.from({ length: safeConcurrency }, () => runWorker()),
  )
  for (const outcome of workers) {
    if (outcome.status === 'rejected') {
      throw outcome.reason
    }
  }

  return results.filter((result): result is R => result !== undefined)
}

function normalizeStable(value: unknown): unknown {
  if (isArray(value)) {
    return value.map(item => normalizeStable(item))
  }

  if (isObject(value) && !isFunction(value)) {
    const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right))
    return Object.fromEntries(entries.map(([key, item]) => [key, normalizeStable(item)]))
  }

  return value
}
