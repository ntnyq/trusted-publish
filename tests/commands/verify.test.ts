import { afterEach, describe, expect, it, vi } from 'vitest'
import { runVerify } from '../../src/commands/verify'
import { createConfig } from '../helpers/config'
import { createWorkspace } from '../helpers/workspace'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('verify', () => {
  it('verify succeeds when remote payload matches', async () => {
    const ws = await createWorkspace(['@scope/a'])
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
  })

  it('verify ignores permission ordering', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    config.permissions = ['createPackage', 'createStagedPackage']
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json([
        {
          type: 'github',
          claims: {
            repository: 'owner/repo',
            workflow_ref: {
              file: 'release.yml',
            },
          },
          permissions: ['createStagedPackage', 'createPackage'],
        },
      ]),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runVerify(config)

    expect(code).toBe(0)
  })

  it('verify fails when no packages match the selection', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)
    config.package = '@scope/missing'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runVerify(config)

    expect(code).toBe(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('verify fails when payload does not match', async () => {
    const ws = await createWorkspace(['@scope/a'])
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

    const fetchSpy = vi.fn().mockResolvedValue(Response.json(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runVerify(config)

    expect(code).toBe(1)
  })

  it('verify fails when nested claim payload does not match', async () => {
    const ws = await createWorkspace(['@scope/a'])
    const config = createConfig(ws.cwd)

    const body = [
      {
        type: 'github',
        claims: {
          repository: 'owner/repo',
          workflow_ref: {
            file: 'another.yml',
          },
        },
        permissions: ['createPackage'],
      },
    ]

    const fetchSpy = vi.fn().mockResolvedValue(Response.json(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const code = await runVerify(config)

    expect(code).toBe(1)
  })
})
