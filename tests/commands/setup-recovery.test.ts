import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSetupDetailed } from '../../src/commands/setup'
import { createRemoteConfig } from '../helpers/config'

afterEach(() => {
  vi.unstubAllGlobals()
})
const expected = {
  type: 'github',
  claims: { repository: 'owner/repo', workflow_ref: { file: 'release.yml' } },
  permissions: ['createPackage'],
}
const previous = {
  ...expected,
  id: 'old-id',
  claims: { repository: 'old/repo', workflow_ref: { file: 'old.yml' } },
}
const config = createRemoteConfig()
function conflict(): Response {
  return new Response('conflict', { status: 409 })
}
function failed(): Response {
  return new Response('failed', { status: 500 })
}

describe('setup replacement recovery', () => {
  it('replaces only when explicitly requested and preserves the previous payload for review', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(Response.json([previous]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({}))
    vi.stubGlobal('fetch', request)
    const report = await runSetupDetailed(config, { replace: true })
    expect(report.exitCode).toBe(0)
    expect(request.mock.calls.map(call => call[1].method)).toStrictEqual([
      'POST',
      'GET',
      'DELETE',
      'POST',
    ])
    expect(report.results[0]?.entries).toStrictEqual([previous])
  })

  it('restores the old payload without its stale ID when replacement fails and registry is empty', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(Response.json([previous]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(failed())
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json({}))
    vi.stubGlobal('fetch', request)
    const report = await runSetupDetailed(config, { replace: true })
    expect(report.exitCode).toBe(1)
    expect(report.results[0]?.recovery).toContain('restored')
    expect(JSON.parse(String(request.mock.calls[5]?.[1].body))).toStrictEqual([
      { type: previous.type, claims: previous.claims, permissions: previous.permissions },
    ])
  })

  it('confirms an uncertain successful replacement without attempting rollback', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(Response.json([previous]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(failed())
      .mockResolvedValueOnce(Response.json([expected]))
    vi.stubGlobal('fetch', request)
    const report = await runSetupDetailed(config, { replace: true })
    expect(report.exitCode).toBe(0)
    expect(request).toHaveBeenCalledTimes(5)
  })

  it('retains recovery data when the revoke response is uncertain', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(Response.json([previous]))
      .mockRejectedValueOnce(new Error('connection closed'))
    vi.stubGlobal('fetch', request)
    const report = await runSetupDetailed(config, { replace: true })
    expect(report.results[0]?.entries).toStrictEqual([previous])
    expect(report.results[0]?.recovery).toContain('outcome is unknown')
    expect(request).toHaveBeenCalledTimes(3)
  })

  it('reports failed recovery without hiding the old payload', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(conflict())
      .mockResolvedValueOnce(Response.json([previous]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(failed())
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(failed())
    vi.stubGlobal('fetch', request)
    const report = await runSetupDetailed(config, { replace: true })
    expect(report.results[0]?.recovery).toContain('automatic recovery failed')
    expect(report.results[0]?.entries).toStrictEqual([previous])
  })
})
