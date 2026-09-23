/* oxlint-disable vitest/prefer-mock-return-shorthand -- Each request must receive an unread Response body. */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CONFIG,
  resolveTrustedPublishConfig,
  setupTrustedPublish,
  listTrustedPublish,
  verifyTrustedPublish,
  revokeTrustedPublish,
  createTrustedPublishClient,
} from '../../src/index'
import { createConfig } from '../helpers/config'
import { createTempDir, createWorkspace } from '../helpers/workspace'

async function createRootWorkspace(): Promise<string> {
  const cwd = await createTempDir()
  await writeFile(
    join(cwd, 'package.json'),
    JSON.stringify({ name: 'trusted-publish', version: '0.0.0' }, null, 2),
    'utf8',
  )
  return cwd
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('node api exports', () => {
  it('exposes default config constant', () => {
    expect(DEFAULT_CONFIG.provider).toBe('github')
    expect(DEFAULT_CONFIG.concurrency).toBeGreaterThan(0)
  })

  it('resolves config and can run setup programmatically', async () => {
    const cwd = await createRootWorkspace()

    const config = await resolveTrustedPublishConfig({
      cwd,
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
  })

  it('rejects invalid concurrency values', async () => {
    const cwd = await createRootWorkspace()

    await expect(
      resolveTrustedPublishConfig({
        cwd,
        provider: 'github',
        repository: 'owner/repo',
        workflow: 'release.yml',
        concurrency: 0,
      }),
    ).rejects.toThrow('concurrency must be >= 1')
  })

  it('rejects invalid registry url', async () => {
    const cwd = await createRootWorkspace()

    await expect(
      resolveTrustedPublishConfig({
        cwd,
        provider: 'github',
        repository: 'owner/repo',
        workflow: 'release.yml',
        registry: 'not-a-url',
      }),
    ).rejects.toThrow('registry must be a valid URL')
  })
})

describe('node api wrappers', () => {
  it('node api wrappers invoke command runners', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const fetchSpy = vi.fn().mockImplementation(() => Response.json([], { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const setupCode = await setupTrustedPublish({ ...config, dryRun: true })
    const listCode = await listTrustedPublish(config)
    const verifyCode = await verifyTrustedPublish(config)
    const revokeCode = await revokeTrustedPublish({ ...config, dryRun: true }, { id: 'trust-id' })

    expect(setupCode).toBe(0)
    expect(listCode).toBe(0)
    expect(verifyCode).toBe(1)
    expect(revokeCode).toBe(0)
  })

  it('createTrustedPublishClient returns reusable client', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const client = createTrustedPublishClient(config)

    const fetchSpy = vi.fn().mockImplementation(() => Response.json([], { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const items = await client.list('@scope/a')

    expect(Array.isArray(items)).toBe(true)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})
