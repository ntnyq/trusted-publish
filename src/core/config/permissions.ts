import { unique } from '@ntnyq/utils'
import type { TrustPermission } from '../types'

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
  const permissions = (input.permissions || []).filter(
    (value): value is TrustPermission =>
      value === 'createPackage' || value === 'createStagedPackage',
  )
  if (input.allowPublish) {
    permissions.push('createPackage')
  }
  if (input.allowStagePublish) {
    permissions.push('createStagedPackage')
  }

  return unique(permissions)
}
