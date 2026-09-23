import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRevoke, runRevokeDetailed } from '../../src/commands/revoke'
import { createConfig, createRemoteConfig } from '../helpers/config'
import { createTempDir, createWorkspace } from '../helpers/workspace'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('revoke', () => {
  it('revoke dry-run does not call fetch', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    config.dryRun = true
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runRevoke(config, { id: 'trust-id' })

    expect(code).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('revoke returns failure when api fails', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('missing', {
        status: 404,
        statusText: 'Not Found',
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runRevoke(config, { id: 'trust-id' })

    expect(code).toBe(1)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})

const expected = {
  type: 'github',
  claims: { repository: 'owner/repo', workflow_ref: { file: 'release.yml' } },
  permissions: ['createPackage'],
}
const config = createRemoteConfig()

describe('matching revoke', () => {
  it('resolves a different trust ID per package during matching batch revoke', async () => {
    const cwd = await createTempDir()
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
})
