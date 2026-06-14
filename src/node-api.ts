import { runList } from './commands/list'
import { runRevoke } from './commands/revoke'
import type { RevokeOptions } from './commands/revoke'
import { runSetup } from './commands/setup'
import { runVerify } from './commands/verify'
import { NpmTrustClient } from './core/client'
import { loadTrustedPublishConfig } from './core/config'
import type { LoadConfigInput } from './core/config'
import { discoverPackages } from './core/discovery'
import { buildTrustConfig } from './core/providers'
import type {
  PackageMeta,
  TrustedPublishConfig,
  TrustConfig,
} from './core/types'

/**
 * Resolves runtime configuration from Node input.
 *
 * @param input - Partial loader input used by config resolution.
 * @returns A validated runtime configuration.
 *
 * @example
 * ```ts
 * import { resolveTrustedPublishConfig } from 'trusted-publish'
 *
 * const config = await resolveTrustedPublishConfig({
 *   cwd: process.cwd(),
 *   provider: 'github',
 *   repository: 'owner/repo',
 *   workflow: 'release.yml',
 *   allowPublish: true,
 * })
 * ```
 */
export async function resolveTrustedPublishConfig(
  input: LoadConfigInput,
): Promise<TrustedPublishConfig> {
  return loadTrustedPublishConfig(input)
}

/**
 * Creates a configured npm trust API client from runtime config.
 *
 * @param config - Resolved runtime configuration.
 * @returns Initialized npm trust client.
 *
 * @example
 * ```ts
 * const client = createTrustedPublishClient(config)
 * const entries = await client.list('@scope/pkg')
 * ```
 */
export function createTrustedPublishClient(
  config: TrustedPublishConfig,
): NpmTrustClient {
  return new NpmTrustClient({
    registry: config.registry,
    token: config.token,
    otp: config.otp,
    dryRun: config.dryRun,
    maxRetries: config.maxRetries,
    retryDelayMs: config.retryDelayMs,
    maxRetryDelayMs: config.maxRetryDelayMs,
    rateLimitMs: config.rateLimitMs,
  })
}

/**
 * Discovers package targets from runtime configuration.
 *
 * @param config - Resolved runtime configuration.
 * @returns Normalized package list.
 *
 * @example
 * ```ts
 * const packages = await discoverTrustedPublishPackages(config)
 * ```
 */
export async function discoverTrustedPublishPackages(
  config: TrustedPublishConfig,
): Promise<PackageMeta[]> {
  return discoverPackages(config)
}

/**
 * Builds provider-specific trust payload from runtime config.
 *
 * @param config - Resolved runtime configuration.
 * @returns Trust payload for registry APIs.
 *
 * @example
 * ```ts
 * const payload = buildTrustedPublishPayload(config)
 * ```
 */
export function buildTrustedPublishPayload(
  config: TrustedPublishConfig,
): TrustConfig {
  return buildTrustConfig(config)
}

/**
 * Runs setup operation programmatically.
 *
 * @param config - Resolved runtime configuration.
 * @returns Exit code where `0` means success.
 *
 * @example
 * ```ts
 * const exitCode = await setupTrustedPublish(config)
 * ```
 */
export async function setupTrustedPublish(
  config: TrustedPublishConfig,
): Promise<number> {
  return runSetup(config)
}

/**
 * Runs list operation programmatically.
 *
 * @param config - Resolved runtime configuration.
 * @returns Exit code where `0` means success.
 *
 * @example
 * ```ts
 * const exitCode = await listTrustedPublish(config)
 * ```
 */
export async function listTrustedPublish(
  config: TrustedPublishConfig,
): Promise<number> {
  return runList(config)
}

/**
 * Runs verify operation programmatically.
 *
 * @param config - Resolved runtime configuration.
 * @returns Exit code where `0` means all targets are matched.
 *
 * @example
 * ```ts
 * const exitCode = await verifyTrustedPublish(config)
 * ```
 */
export async function verifyTrustedPublish(
  config: TrustedPublishConfig,
): Promise<number> {
  return runVerify(config)
}

/**
 * Runs revoke operation programmatically.
 *
 * @param config - Resolved runtime configuration.
 * @param options - Revoke options containing trust id.
 * @returns Exit code where `0` means success.
 *
 * @example
 * ```ts
 * const exitCode = await revokeTrustedPublish(config, { id: 'trust-id' })
 * ```
 */
export async function revokeTrustedPublish(
  config: TrustedPublishConfig,
  options: RevokeOptions,
): Promise<number> {
  return runRevoke(config, options)
}

export type { RevokeOptions }
