import { afterEach, describe, expect, it, vi } from 'vitest'
/* oxlint-disable vitest/prefer-mock-return-shorthand -- Each request must receive an unread Response body. */
import { runList } from '../../src/commands/list'
import { createConfig } from '../helpers/config'
import { createWorkspace } from '../helpers/workspace'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('list', () => {
  it('list returns success with empty trust list', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const fetchSpy = vi.fn().mockImplementation(() => Response.json([], { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runList(config)

    expect(code).toBe(0)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('list accounts for skipped packages after fail-fast', async () => {
    const ws = await createWorkspace(['@scope/a', '@scope/b', '@scope/c'])
    const config = createConfig(ws.cwd)
    config.concurrency = 1
    config.failFast = true
    config.json = true
    config.maxRetries = 0
    config.silent = false
    const logSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('boom', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runList(config)
    const report = JSON.parse(String(logSpy.mock.calls[0]![0])) as {
      summary: { failed: number; skipped: number; total: number }
    }

    expect(code).toBe(1)
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(report.summary).toMatchObject({ total: 3, failed: 1, skipped: 2 })
  })
})
