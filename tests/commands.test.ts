import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runList } from '../src/commands/list'
import { runRevoke } from '../src/commands/revoke'
import { runSetup } from '../src/commands/setup'
import { runVerify } from '../src/commands/verify'
import type { TrustedPublishConfig } from '../src/core/types'
import {
  createTrustedPublishClient,
  listTrustedPublish,
  revokeTrustedPublish,
  setupTrustedPublish,
  verifyTrustedPublish,
} from '../src/node-api'

function createWorkspace(names: string[]): {
  cwd: string
  cleanup: () => void
} {
  const cwd = mkdtempSync(join(tmpdir(), 'trusted-publish-test-'))
  const packagesDir = join(cwd, 'packages')
  mkdirSync(packagesDir, { recursive: true })

  for (const name of names) {
    const dir = join(packagesDir, name.replace('@', '').replace('/', '-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name, version: '0.0.0' }, null, 2),
      'utf8',
    )
  }

  return {
    cwd,
    cleanup: () => {
      rmSync(cwd, { recursive: true, force: true })
    },
  }
}

function createConfig(cwd: string): TrustedPublishConfig {
  return {
    cwd,
    registry: 'https://registry.npmjs.org',
    provider: 'github',
    include: [],
    exclude: [],
    ignores: [],
    includePrivate: false,
    discovery: {
      fromWorkspaces: false,
      fromGlobs: true,
      workspaceGlobs: [],
      packageJsonGlobs: ['packages/*/package.json'],
    },
    claims: {
      repository: 'owner/repo',
      workflow: 'release.yml',
    },
    permissions: ['createPackage'],
    concurrency: 2,
    failFast: false,
    maxRetries: 1,
    retryDelayMs: 1,
    maxRetryDelayMs: 2,
    rateLimitMs: 0,
    dryRun: false,
    json: false,
    silent: true,
    verbose: false,
    yes: true,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('command flows', () => {
  it('setup dry-run does not call fetch', async () => {
    const ws = createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    config.dryRun = true

    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runSetup(config)

    expect(code).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    ws.cleanup()
  })

  it('setup retries on 429 then succeeds', async () => {
    const ws = createWorkspace(['@scope/a'])
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
    ws.cleanup()
  })

  it('setup fail-fast stops early', async () => {
    const ws = createWorkspace(['@scope/a', '@scope/b'])
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
    ws.cleanup()
  })

  it('verify succeeds when remote payload matches', async () => {
    const ws = createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)

    const body = [
      {
        type: 'github',
        claims: {
          repository: 'owner/repo',
          workflow_ref: {
            file: 'release.yml',
          },
        },
        permissions: ['createPackage'],
      },
    ]

    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json(body, {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runVerify(config)

    expect(code).toBe(0)
    expect(fetchSpy).toHaveBeenCalledOnce()
    ws.cleanup()
  })

  it('verify fails when payload does not match', async () => {
    const ws = createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)

    const body = [
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
    ]

    const fetchSpy = vi
      .fn()
      .mockResolvedValue(Response.json(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runVerify(config)

    expect(code).toBe(1)
    ws.cleanup()
  })

  it('list returns success with empty trust list', async () => {
    const ws = createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(Response.json([], { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runList(config)

    expect(code).toBe(0)
    expect(fetchSpy).toHaveBeenCalledOnce()
    ws.cleanup()
  })

  it('revoke dry-run does not call fetch', async () => {
    const ws = createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    config.dryRun = true
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runRevoke(config, { id: 'trust-id' })

    expect(code).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    ws.cleanup()
  })

  it('revoke returns failure when api fails', async () => {
    const ws = createWorkspace(['@scope/a'])
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
    ws.cleanup()
  })

  it('client uses retry-after header for retry delay', async () => {
    const ws = createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    config.maxRetries = 1

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('retry', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            'retry-after': '1',
          },
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runSetup(config)

    expect(code).toBe(0)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    ws.cleanup()
  })

  it('node api wrappers invoke command runners', async () => {
    const ws = createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(Response.json([], { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const setupCode = await setupTrustedPublish({ ...config, dryRun: true })
    const listCode = await listTrustedPublish(config)
    const verifyCode = await verifyTrustedPublish(config)
    const revokeCode = await revokeTrustedPublish(
      { ...config, dryRun: true },
      { id: 'trust-id' },
    )

    expect(setupCode).toBe(0)
    expect(listCode).toBe(0)
    expect(verifyCode).toBe(1)
    expect(revokeCode).toBe(0)
    ws.cleanup()
  })

  it('createTrustedPublishClient returns reusable client', async () => {
    const ws = createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    const client = createTrustedPublishClient(config)

    const fetchSpy = vi
      .fn()
      .mockResolvedValue(Response.json([], { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const items = await client.list('@scope/a')

    expect(Array.isArray(items)).toBe(true)
    expect(fetchSpy).toHaveBeenCalledOnce()
    ws.cleanup()
  })
})
