import { stableStringify } from '../utils'
import type { TrustConfig } from './types'

const CIRCLECI_CONTEXT_IDS_KEY = 'oidc.circleci.com/context-ids'

export function matchesTrustConfig(
  actual: TrustConfig,
  expected: TrustConfig,
): boolean {
  return (
    stableStringify(normalizeTrustConfig(actual)) ===
    stableStringify(normalizeTrustConfig(expected))
  )
}

function normalizeTrustConfig(config: TrustConfig): object {
  const claims: Record<string, unknown> = { ...config.claims }
  const contextIds = claims[CIRCLECI_CONTEXT_IDS_KEY]
  if (Array.isArray(contextIds)) {
    claims[CIRCLECI_CONTEXT_IDS_KEY] = sortUnique(contextIds)
  }

  return {
    type: config.type,
    claims,
    permissions: sortUnique(config.permissions || []),
  }
}

function sortUnique(values: unknown[]): string[] {
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === 'string'),
    ),
  ].toSorted()
}
