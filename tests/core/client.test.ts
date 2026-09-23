import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NpmTrustClient } from '../../src/core/client'
import type { TrustConfig } from '../../src/core/types'
import { createConfig } from '../helpers/config'

afterEach(() => {
  vi.unstubAllGlobals()
})
describe('registry response handling', () => {
  it.each([200, 500])('times out while reading a delayed %s response body', async status => {
    const server = createServer((_request, response) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.flushHeaders()
      const timer = setTimeout(() => response.end('[]'), 500)
      response.on('close', () => clearTimeout(timer))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    const client = new NpmTrustClient({
      registry: `http://127.0.0.1:${address.port}`,
      requestTimeoutMs: 40,
      dryRun: false,
      maxRetries: 0,
      retryDelayMs: 0,
      maxRetryDelayMs: 0,
      rateLimitMs: 0,
      token: undefined,
      otp: undefined,
    })
    try {
      await expect(client.list('foo')).rejects.toThrow('request timed out after 40ms')
    } finally {
      server.closeAllConnections()
      await promisify(server.close.bind(server))()
    }
  })
})

describe('registry retries and rate limits', () => {
  it('client uses retry-after header for retry delay', async () => {
    const config = createConfig('.')
    config.maxRetries = 1

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('retry', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            'retry-after': '1',
          },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const client = new NpmTrustClient({ ...config, token: config.token, otp: config.otp })
    const response = await client.setup('@scope/a', {
      type: 'github',
      claims: { repository: 'owner/repo', workflow_ref: { file: 'release.yml' } },
      permissions: ['createPackage'],
    })
    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('client spaces concurrent mutation requests', async () => {
    const config = createConfig('.')
    config.rateLimitMs = 20
    config.requestTimeoutMs = 0
    const client = new NpmTrustClient({ ...config, token: config.token, otp: config.otp })
    const requestTimes: number[] = []
    const fetchSpy = vi.fn(async () => {
      requestTimes.push(Date.now())
      return new Response('{}', { status: 200 })
    })
    const payload: TrustConfig = {
      type: 'github',
      claims: {
        repository: 'owner/repo',
        workflow_ref: {
          file: 'release.yml',
        },
      },
      permissions: ['createPackage'],
    }
    vi.stubGlobal('fetch', fetchSpy)

    await Promise.all([client.setup('@scope/a', payload), client.setup('@scope/b', payload)])

    expect(requestTimes).toHaveLength(2)
    expect(requestTimes[1]! - requestTimes[0]!).toBeGreaterThanOrEqual(15)
  })
})
