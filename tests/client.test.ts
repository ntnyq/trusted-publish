import { once } from 'node:events'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NpmTrustClient } from '../src/core/client'

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
