import { isString } from '@ntnyq/utils'
import { consola } from 'consola'
import { webAuthOpener } from 'npm-profile'
import open from 'open'
import type { AuthenticationHandler } from '../core/types'

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
  if (!isString(otp) || !otp.trim()) {
    throw new Error('2FA authentication cancelled')
  }
  return otp.trim()
}
