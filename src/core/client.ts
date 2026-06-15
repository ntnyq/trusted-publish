import type { TrustConfig } from './types'
import { sleep } from './utils'

/**
 * Runtime options for npm trust API client.
 */
interface ClientOptions {
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
  private lastMutationAt = 0

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

    return Array.isArray(body) ? body : []
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

  private async request(
    url: string,
    init: RequestInit,
    asJson = false,
  ): Promise<unknown> {
    if (this.options.dryRun && init.method !== 'GET') {
      return Response.json({ dryRun: true }, { status: 200 })
    }

    const headers = new Headers(init.headers || {})
    if (this.options.token) {
      headers.set('authorization', `Bearer ${this.options.token}`)
    }
    if (this.options.otp && init.method !== 'GET') {
      headers.set('npm-otp', this.options.otp)
    }

    const res = await this.requestWithRetry(url, {
      ...init,
      headers,
    })

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

  private async requestWithRetry(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
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
        if (init.method && init.method !== 'GET') {
          this.lastMutationAt = Math.max(this.lastMutationAt, Date.now())
        }
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

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    if (this.options.requestTimeoutMs <= 0) {
      return fetch(url, init)
    }

    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => {
      controller.abort()
    }, this.options.requestTimeoutMs)

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(
          `request timed out after ${this.options.requestTimeoutMs}ms: ${url}`,
          { cause: error },
        )
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

    const elapsed = Date.now() - this.lastMutationAt
    const waitMs = this.options.rateLimitMs - elapsed
    if (waitMs > 0) {
      await sleep(waitMs)
    }
  }

  private isRetryableStatus(statusCode: number): boolean {
    return statusCode === 429 || statusCode >= 500
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
