import { access, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runBootstrapDetailed } from '../../src/commands/bootstrap'
import { DEFAULT_CONFIG } from '../../src/core/config/defaults'
import { publishPlaceholder } from '../../src/core/publish'

vi.mock(import('../../src/core/publish'), () => ({ publishPlaceholder: vi.fn() }))
const directories: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
const config = { ...DEFAULT_CONFIG, remotePackage: '@scope/new-package', silent: true, yes: true }
describe('bootstrap', () => {
  it('generates an inspectable dry-run without network or publication', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const report = await runBootstrapDetailed(
      { ...config, dryRun: true },
      { version: '0.1.0-beta.1', access: 'restricted', keepTemp: true },
    )
    const directory = report.results[0]?.bootstrap?.directory
    directories.push(directory!)
    const manifest = JSON.parse(await readFile(join(directory!, 'package.json'), 'utf8'))
    expect(manifest).toMatchObject({
      name: '@scope/new-package',
      version: '0.1.0-beta.1',
      files: ['index.js'],
      publishConfig: { access: 'restricted' },
    })
    expect(manifest.scripts).toBeUndefined()
    expect(report.results[0]?.bootstrap?.settingsUrl).toBe(
      'https://www.npmjs.com/package/@scope/new-package/access',
    )
    expect(request).not.toHaveBeenCalled()
    expect(publishPlaceholder).not.toHaveBeenCalled()
  })

  it.each([false, true])('cleans generated files when publication fails=%s', async shouldFail => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })))
    vi.mocked(publishPlaceholder).mockImplementation(async () => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- Exercise both publication outcomes.
      if (shouldFail) {
        throw new Error('publication failed')
      }
    })
    const report = await runBootstrapDetailed(config)
    expect(publishPlaceholder).toHaveBeenCalledOnce()
    const [directory] = vi.mocked(publishPlaceholder).mock.calls[0]!
    await expect(access(directory)).rejects.toThrow('ENOENT')
    expect(report.exitCode).toBe(Number(shouldFail))
  })

  it('skips existing packages and stops on authorization errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ name: config.remotePackage }))
        .mockResolvedValueOnce(new Response('forbidden', { status: 403 })),
    )
    const existing = await runBootstrapDetailed(config)
    expect(existing.results[0]?.status).toBe('already')
    const denied = await runBootstrapDetailed(config)
    expect(denied.exitCode).toBe(1)
    expect(publishPlaceholder).not.toHaveBeenCalled()
  })

  it('requires explicit publication consent and valid options', async () => {
    await expect(runBootstrapDetailed({ ...config, yes: false })).rejects.toThrow('--yes')
    await expect(runBootstrapDetailed(config, { version: 'not-semver' })).rejects.toThrow('semver')
    const unscoped = await runBootstrapDetailed(
      { ...config, remotePackage: 'unscoped', dryRun: true },
      { access: 'restricted' },
    )
    expect(unscoped.results[0]?.message).toContain('scoped package')
  })
})
