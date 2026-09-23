import {
  HTTP_AUTH_STATUSES,
  HTTP_EMPTY_BODY_STATUSES,
  HTTP_STATUS_SERVER_ERROR_MIN,
  HTTP_STATUS_TOO_MANY_REQUESTS,
} from '../constants'
import { sleep } from '../utils'
import type { AuthenticationChallenge, AuthenticationHandler, TrustConfig } from './types'

/**
 * Runtime options for npm trust API client.
 */
interface ClientOptions {
  authenticate?: AuthenticationHandler | undefined
  registry: string
  requestTimeoutMs: number
  token: string | undefined
  otp: string | undefined
  dryRun: boolean
  maxRetries: number
  retryDelayMs: number
  maxRetryDelayMs: number
  rateLimitMs: number
}

/**
 * Trust entry returned by npm registry API.
 */
export interface NpmTrustRemoteItem extends TrustConfig {
  id?: string
}

/**
 * Npm trusted publisher API client.
 */
export class NpmTrustClient {
  private readonly options: ClientOptions
  private mutationQueue: Promise<void> = Promise.resolve()
  private nextMutationAt = 0
  private otp: string | undefined
  private authentication: Promise<string> | undefined

  /**
   * Creates a new npm trust client.
   *
   * @param options - Client runtime options.
   *
   * @example
   * ```ts
   * const client = new NpmTrustClient({
   *   registry: 'https://registry.npmjs.org',
   *   requestTimeoutMs: 30000,
   *   token: process.env.NPM_TOKEN,
   *   otp: process.env.NPM_OTP,
   *   dryRun: false,
   *   maxRetries: 2,
   *   retryDelayMs: 1200,
   *   maxRetryDelayMs: 8000,
   *   rateLimitMs: 0,
   * })
   * ```
   */
  constructor(options: ClientOptions) {
    this.options = options
    this.otp = options.otp
  }

  /**
   * Lists trust entries for a package.
   *
   * @param packageName - npm package name.
   * @returns Remote trust entry list.
   *
   * @example
   * ```ts
   * const items = await client.list('@scope/pkg')
   * ```
   */
  async list(packageName: string): Promise<NpmTrustRemoteItem[]> {
    const body = (await this.request(
      this.packageUrl(packageName),
      {
        method: 'GET',
      },
      true,
    )) as unknown

    if (!Array.isArray(body)) {
      throw new TypeError('invalid trust response: expected an array')
    }
    return body
  }

  /**
   * Creates trust configuration for a package.
   *
   * @param packageName - npm package name.
   * @param payload - Trust payload.
   * @returns Raw registry response.
   *
   * @example
   * ```ts
   * await client.setup('@scope/pkg', payload)
   * ```
   */
  async setup(packageName: string, payload: TrustConfig): Promise<Response> {
    return this.request(this.packageUrl(packageName), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify([payload]),
    }) as Promise<Response>
  }

  /**
   * Revokes a trust configuration by id.
   *
   * @param packageName - npm package name.
   * @param id - Trust entry id.
   * @returns Raw registry response.
   *
   * @example
   * ```ts
   * await client.revoke('@scope/pkg', 'trust-id')
   * ```
   */
  async revoke(packageName: string, id: string): Promise<Response> {
    return this.request(this.packageTrustIdUrl(packageName, id), {
      method: 'DELETE',
    }) as Promise<Response>
  }

  private async request(url: string, init: RequestInit, asJson = false): Promise<unknown> {
    if (this.options.dryRun && init.method !== 'GET') {
      return Response.json({ dryRun: true }, { status: 200 })
    }

    const headers = new Headers(init.headers || {})
    if (this.options.token) {
      headers.set('authorization', `Bearer ${this.options.token}`)
    }
    if (this.otp) {
      headers.set('npm-otp', this.otp)
    }

    let res = await this.requestWithRetry(url, {
      ...init,
      headers,
    })

    if (!res.ok) {
      const body = await res.clone().text()
      if (
        HTTP_AUTH_STATUSES.includes(res.status)
        && /EOTP|one[- ]time pass|"authUrl"/i.test(body)
      ) {
        if (!this.options.authenticate) {
          throw Object.assign(
            new Error(
              '2FA required: provide NPM_OTP, use an interactive terminal, or supply an authenticate callback',
            ),
            { statusCode: res.status, code: 'EOTP' },
          )
        }
        await this.authenticate(parseChallenge(body), headers.get('npm-otp') || undefined)
        headers.set('npm-otp', this.otp || '')
        res = await this.requestWithRetry(url, { ...init, headers })
      }
    }

    if (!res.ok) {
      const text = await res.text()
      const err = new Error(
        `${res.status} ${res.statusText}: ${text || '(empty response)'}`,
      ) as Error & { statusCode?: number }
      err.statusCode = res.status
      throw err
    }

    if (asJson) {
      return res.json()
    }

    return res
  }

  private async authenticate(
    challenge: AuthenticationChallenge,
    attemptedOtp: string | undefined,
  ): Promise<void> {
    if (this.otp !== attemptedOtp) {
      return
    }
    const handler = this.options.authenticate
    if (!handler) {
      return
    }
    this.authentication ??= handler(challenge)
    try {
      this.otp = await this.authentication
      if (!this.otp) {
        throw new Error('2FA authentication returned an empty OTP')
      }
    } finally {
      this.authentication = undefined
    }
  }

  private async requestWithRetry(url: string, init: RequestInit): Promise<Response> {
    let attempt = 0
    // Retry on 429 and 5xx to improve batch resilience.
    while (true) {
      await this.waitForRateLimit(init.method)

      let res: Response | undefined = undefined
      try {
        res = await this.fetchWithTimeout(url, init)
      } catch (error) {
        if (attempt >= this.options.maxRetries) {
          throw error
        }
        const expDelay = Math.min(
          this.options.retryDelayMs * 2 ** attempt,
          this.options.maxRetryDelayMs,
        )
        await sleep(expDelay)
        attempt += 1
        continue
      }

      if (!res) {
        continue
      }

      if (res.ok) {
        return res
      }

      const shouldRetry = this.isRetryableStatus(res.status)
      if (!shouldRetry || attempt >= this.options.maxRetries) {
        return res
      }

      const retryAfterMs = this.getRetryAfterMs(res)
      const expDelay = Math.min(
        this.options.retryDelayMs * 2 ** attempt,
        this.options.maxRetryDelayMs,
      )
      await sleep(retryAfterMs > 0 ? retryAfterMs : expDelay)
      attempt += 1
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeoutHandle =
      this.options.requestTimeoutMs > 0
        ? setTimeout(() => controller.abort(), this.options.requestTimeoutMs)
        : undefined
    try {
      const response = await fetch(url, {
        ...init,
        headers: new Headers(init.headers),
        signal: controller.signal,
      })
      // Read the entire body before releasing the deadline, including error/retry responses.
      const body = await response.arrayBuffer()
      return new Response(HTTP_EMPTY_BODY_STATUSES.includes(response.status) ? null : body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`request timed out after ${this.options.requestTimeoutMs}ms: ${url}`, {
          cause: error,
        })
      }
      throw error
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  private async waitForRateLimit(method: string | undefined): Promise<void> {
    if (!method || method === 'GET' || this.options.rateLimitMs <= 0) {
      return
    }

    const previous = this.mutationQueue
    const queueGate: { release?: () => void } = {}
    this.mutationQueue = new Promise(resolve => {
      queueGate.release = resolve
    })

    await previous
    try {
      const waitMs = Math.max(0, this.nextMutationAt - Date.now())
      await sleep(waitMs)
      this.nextMutationAt = Date.now() + this.options.rateLimitMs
    } finally {
      queueGate.release?.()
    }
  }

  private isRetryableStatus(statusCode: number): boolean {
    return (
      statusCode === HTTP_STATUS_TOO_MANY_REQUESTS || statusCode >= HTTP_STATUS_SERVER_ERROR_MIN
    )
  }

  private getRetryAfterMs(response: Response): number {
    const retryAfter = response.headers.get('retry-after')
    if (!retryAfter) {
      return 0
    }

    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000
    }

    const when = Date.parse(retryAfter)
    if (!Number.isNaN(when)) {
      return Math.max(0, when - Date.now())
    }

    return 0
  }

  private packageUrl(packageName: string): string {
    return `${this.options.registry}/-/package/${encodeURIComponent(packageName)}/trust`
  }

  private packageTrustIdUrl(packageName: string, id: string): string {
    return `${this.packageUrl(packageName)}/${encodeURIComponent(id)}`
  }
}

function parseChallenge(body: string): AuthenticationChallenge {
  try {
    const value: unknown = JSON.parse(body)
    if (
      value
      && typeof value === 'object'
      && 'authUrl' in value
      && 'doneUrl' in value
      && typeof value.authUrl === 'string'
      && typeof value.doneUrl === 'string'
    ) {
      return { authUrl: value.authUrl, doneUrl: value.doneUrl }
    }
  } catch {
    // Older registries return a text OTP challenge.
  }
  return {}
}
