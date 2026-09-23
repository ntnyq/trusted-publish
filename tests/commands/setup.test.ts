import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSetup } from '../../src/commands/setup'
import { createConfig } from '../helpers/config'
import { createWorkspace } from '../helpers/workspace'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('setup', () => {
  it('setup dry-run does not call fetch', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    config.dryRun = true

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runSetup(config)

    expect(code).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('setup retries on 429 then succeeds', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('rate limited', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      )
      .mockResolvedValueOnce(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runSetup(config)

    expect(code).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('setup treats a matching conflict as already configured', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('conflict', {
          status: 409,
          statusText: 'Conflict',
        }),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 'trust-id',
            type: 'github',
            claims: {
              repository: 'owner/repo',
              workflow_ref: {
                file: 'release.yml',
              },
            },
            permissions: ['createPackage'],
          },
        ]),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runSetup(config)

    expect(code).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('setup fails when an existing conflict does not match', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('conflict', {
          status: 409,
          statusText: 'Conflict',
        }),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            type: 'github',
            claims: {
              repository: 'owner/another-repo',
              workflow_ref: {
                file: 'release.yml',
              },
            },
            permissions: ['createPackage'],
          },
        ]),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runSetup(config)

    expect(code).toBe(1)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('setup fail-fast stops early', async () => {
    const ws = await createWorkspace(['@scope/a', '@scope/b'])
    const config = createConfig(ws.cwd)
    config.failFast = true
    config.concurrency = 1
    config.maxRetries = 0

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('boom', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runSetup(config)

    expect(code).toBe(1)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
