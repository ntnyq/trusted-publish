import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listTrustedPublishDetailed,
  resolveTrustedPublishConfig,
  setupTrustedPublishDetailed,
  revokeTrustedPublishDetailed,
} from '../../src/index'
import { createTempDir } from '../helpers/workspace'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
const entry = {
  id: 'per-package-id',
  type: 'github',
  claims: { repository: 'owner/repo', workflow_ref: { file: 'release.yml' } },
  permissions: ['createPackage'],
}

describe('management output', () => {
  it('lists remote entries and revokes their ID without provider claims or local manifests', async () => {
    const cwd = await createTempDir()
    const config = await resolveTrustedPublishConfig({
      cwd,
      command: 'list',
      remotePackage: '@scope/a',
      json: true,
    })
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json([entry]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', request)
    const log = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    const report = await listTrustedPublishDetailed(config)
    expect(report.results[0]?.entries).toStrictEqual([entry])
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).results[0].entries).toStrictEqual([entry])
    const revoked = await revokeTrustedPublishDetailed(config, { id: entry.id })
    expect(revoked.exitCode).toBe(0)
    expect(request.mock.calls[1]?.[0]).toContain('/%40scope%2Fa/trust/per-package-id')
  })

  it('renders the exact dry-run payload and does not send any requests', async () => {
    const config = await resolveTrustedPublishConfig({
      cwd: await createTempDir(),
      remotePackage: 'example',
      command: 'plan',
      repository: 'owner/repo',
      workflow: 'release.yml',
      environment: 'production',
      allowStagePublish: true,
      dryRun: true,
      silent: true,
    })
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const report = await setupTrustedPublishDetailed(config)
    expect(report.results[0]?.expected).toStrictEqual({
      type: 'github',
      claims: {
        repository: 'owner/repo',
        workflow_ref: { file: 'release.yml' },
        environment: 'production',
      },
      permissions: ['createStagedPackage'],
    })
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects conflicting selectors and package specs', async () => {
    const cwd = await createTempDir()
    await expect(
      resolveTrustedPublishConfig({ cwd, command: 'list', remotePackage: 'foo', package: 'bar' }),
    ).rejects.toThrow('cannot be combined')
    await expect(
      resolveTrustedPublishConfig({ cwd, command: 'list', remotePackage: 'foo@latest' }),
    ).rejects.toThrow('invalid npm package name')
  })
})
