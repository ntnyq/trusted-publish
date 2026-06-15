import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CONFIG,
  resolveTrustedPublishConfig,
  setupTrustedPublish,
} from '../src/index'

function createWorkspace(): { cwd: string; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), 'trusted-publish-node-api-'))
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ name: 'trusted-publish', version: '0.0.0' }, null, 2),
    'utf8',
  )
  return {
    cwd,
    cleanup: () => {
      rmSync(cwd, { recursive: true, force: true })
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('node api exports', () => {
  it('exposes default config constant', () => {
    expect(DEFAULT_CONFIG.provider).toBe('github')
    expect(DEFAULT_CONFIG.concurrency).toBeGreaterThan(0)
  })

  it('resolves config and can run setup programmatically', async () => {
    const ws = createWorkspace()

    const config = await resolveTrustedPublishConfig({
      cwd: ws.cwd,
      provider: 'github',
      repository: 'owner/repo',
      workflow: 'release.yml',
      allowPublish: true,
      package: 'trusted-publish',
      fromWorkspaces: false,
      fromGlobs: true,
      packageJsonGlobs: 'package.json',
      dryRun: true,
      silent: true,
    })

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const code = await setupTrustedPublish(config)

    expect(code).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    ws.cleanup()
  })

  it('rejects invalid concurrency values', async () => {
    const ws = createWorkspace()

    await expect(
      resolveTrustedPublishConfig({
        cwd: ws.cwd,
        provider: 'github',
        repository: 'owner/repo',
        workflow: 'release.yml',
        concurrency: 0,
      }),
    ).rejects.toThrow('concurrency must be >= 1')

    ws.cleanup()
  })

  it('rejects invalid registry url', async () => {
    const ws = createWorkspace()

    await expect(
      resolveTrustedPublishConfig({
        cwd: ws.cwd,
        provider: 'github',
        repository: 'owner/repo',
        workflow: 'release.yml',
        registry: 'not-a-url',
      }),
    ).rejects.toThrow('registry must be a valid URL')

    ws.cleanup()
  })
})
