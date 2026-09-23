import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRevokeDetailed } from '../src/commands/revoke'
import { runSetupDetailed } from '../src/commands/setup'
import { DEFAULT_CONFIG } from '../src/constants'

const directories: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
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
const config = {
  ...DEFAULT_CONFIG,
  remotePackage: 'example',
  silent: true,
  maxRetries: 0,
  claims: { repository: 'owner/repo', workflow: 'release.yml' },
  permissions: ['createPackage'] as ['createPackage'],
}
function conflict(): Response {
  return new Response('conflict', { status: 409 })
}
function failed(): Response {
  return new Response('failed', { status: 500 })
}

describe('replacement and batch recovery', () => {
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

  it('resolves a different trust ID per package during matching batch revoke', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'trust-revoke-'))
    directories.push(cwd)
    await mkdir(join(cwd, 'a'))
    await mkdir(join(cwd, 'b'))
    await writeFile(join(cwd, 'a/package.json'), JSON.stringify({ name: 'a' }))
    await writeFile(join(cwd, 'b/package.json'), JSON.stringify({ name: 'b' }))
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json([{ ...expected, id: 'a-id' }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json([{ ...expected, id: 'b-id' }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', request)
    const { remotePackage: _remotePackage, ...localConfig } = config
    const report = await runRevokeDetailed(
      { ...localConfig, cwd, concurrency: 1 },
      { matching: true },
    )
    expect(report.summary.revoked).toBe(2)
    expect(request.mock.calls[1]?.[0]).toContain('/a/trust/a-id')
    expect(request.mock.calls[3]?.[0]).toContain('/b/trust/b-id')
  })

  it('matching dry-run only reads and reports the selected ID', async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json([{ ...expected, id: 'entry-id' }]))
    vi.stubGlobal('fetch', request)
    const report = await runRevokeDetailed({ ...config, dryRun: true }, { matching: true })
    expect(report.results[0]?.trustId).toBe('entry-id')
    expect(request.mock.calls.map(call => call[1].method)).toStrictEqual(['GET'])
  })

  it('retries only failed packages in the current selection and treats no failures as a no-op', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'trust-retry-'))
    directories.push(cwd)
    const retryFrom = join(cwd, 'report.json')
    await writeFile(
      retryFrom,
      JSON.stringify({
        results: [
          { packageName: 'example', status: 'configured' },
          { packageName: 'other', status: 'failed' },
        ],
      }),
    )
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const report = await runSetupDetailed({ ...config, cwd, retryFrom })
    expect(report.exitCode).toBe(0)
    expect(report.summary.skipped).toBe(1)
    expect(request).not.toHaveBeenCalled()
    await writeFile(
      retryFrom,
      JSON.stringify({ results: [{ packageName: 'example', status: 'failed' }] }),
    )
    const preview = await runSetupDetailed({ ...config, cwd, retryFrom, dryRun: true })
    expect(preview.results[0]?.expected).toStrictEqual(expected)
  })
})
