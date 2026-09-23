import { afterEach, describe, expect, it, vi } from 'vitest'
import { runDoctorDetailed } from '../src/commands/doctor'
import { DEFAULT_CONFIG } from '../src/constants'

afterEach(() => {
  vi.unstubAllGlobals()
})
const config = { ...DEFAULT_CONFIG, remotePackage: 'example', silent: true, maxRetries: 0 }
describe('doctor', () => {
  it('reports missing packages using only read requests', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ username: 'test-user' }))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
    vi.stubGlobal('fetch', request)
    const report = await runDoctorDetailed(config)
    expect(report.exitCode).toBe(1)
    expect(report.results[0]?.diagnostics).toContainEqual(
      expect.objectContaining({ check: 'package', status: 'fail' }),
    )
    expect(request.mock.calls.map(call => call[1].method)).toStrictEqual(['GET', 'GET'])
  })

  it('distinguishes authentication failure from readable package data', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ name: 'example' }))
      .mockResolvedValueOnce(Response.json([]))
    vi.stubGlobal('fetch', request)
    const report = await runDoctorDetailed(config)
    expect(report.results[0]?.diagnostics).toContainEqual(
      expect.objectContaining({
        check: 'authentication',
        status: 'fail',
        message: expect.stringContaining('authentication required'),
      }),
    )
    expect(report.results[0]?.diagnostics).toContainEqual(
      expect.objectContaining({ check: 'trust', status: 'warn' }),
    )
  })

  it('reports configuration conflicts with existing and expected payloads', async () => {
    const entries = [
      {
        id: 'test-id',
        type: 'github',
        claims: { repository: 'other/repo', workflow_ref: { file: 'release.yml' } },
        permissions: ['createPackage'],
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ username: 'test-user' }))
        .mockResolvedValueOnce(Response.json({ name: 'example' }))
        .mockResolvedValueOnce(Response.json(entries)),
    )
    const report = await runDoctorDetailed({
      ...config,
      claims: { repository: 'owner/repo', workflow: 'release.yml' },
      permissions: ['createPackage'],
    })
    expect(report.results[0]?.entries).toStrictEqual(entries)
    expect(report.results[0]?.diagnostics).toContainEqual(
      expect.objectContaining({
        check: 'trust',
        status: 'fail',
        message: expect.stringContaining('conflicts'),
      }),
    )
  })
})
