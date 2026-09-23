import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import NpmConfig from '@npmcli/config'
import npmDefinitions from '@npmcli/config/lib/definitions/index.js'
import { consola } from 'consola'
import { webAuthOpener } from 'npm-profile'
import open from 'open'
import type { AuthenticationHandler } from './types'

/**
 * Loads npm's project, user and global configuration without reading this CLI's argv.
 * @param cwd - Project directory.
 * @returns Loaded npm config.
 */
export async function loadNpmConfig(cwd: string): Promise<NpmConfig> {
  const npmPackagePath = fileURLToPath(import.meta.resolve('@npmcli/config/package.json'))
  const { definitions, flatten, shorthands } = npmDefinitions
  const config = new NpmConfig({
    definitions,
    flatten,
    shorthands,
    cwd,
    argv: [],
    npmPath: dirname(npmPackagePath),
  })
  await config.load()
  return config
}

/**
 * Resolves the most specific registry-scoped token, never an unrelated registry's token.
 * @param config - Loaded npm config.
 * @param registry - Target registry URL.
 * @returns Matching token, if available.
 */
export function getNpmToken(config: NpmConfig, registry: string): string | undefined {
  const url = new URL(registry)
  let path = url.pathname.replace(/\/?$/, '/')
  while (true) {
    const token: unknown = config.get(`//${url.host}${path}:_authToken`)
    if (typeof token === 'string' && token) {
      return token
    }
    if (path === '/') {
      return undefined
    }
    path = path.slice(0, path.slice(0, -1).lastIndexOf('/') + 1)
  }
}

/**
 * Handles CLI OTP challenges only when a terminal is available; JSON stays machine-readable.
 * @param challenge - Registry challenge.
 * @returns OTP for the retried request.
 */
export const authenticateInteractively: AuthenticationHandler = async challenge => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('2FA required: run in a terminal or provide NPM_OTP / an authenticate callback')
  }
  if (challenge.authUrl && challenge.doneUrl) {
    for (const value of [challenge.authUrl, challenge.doneUrl]) {
      if (new URL(value).protocol !== 'https:') {
        throw new Error('2FA challenge requires HTTPS URLs')
      }
    }
    const result = await webAuthOpener(
      async url => {
        consola.info(`Authenticate your npm account: ${url}`)
        await open(url)
      },
      challenge.authUrl,
      challenge.doneUrl,
      { timeout: 30_000, retry: { retries: 0 } },
    )
    return result.token
  }
  const otp = await consola.prompt('npm one-time password:', { type: 'text' })
  if (typeof otp !== 'string' || !otp.trim()) {
    throw new Error('2FA authentication cancelled')
  }
  return otp.trim()
}
