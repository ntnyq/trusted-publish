/* oxlint-disable vitest/prefer-mock-return-shorthand -- Each request must receive an unread Response body. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NpmTrustClient } from '../src/core/client'
import { loadTrustedPublishConfig } from '../src/core/config'

const directories: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
function client(authenticate?: (challenge: object) => Promise<string>): NpmTrustClient {
  return new NpmTrustClient({
    registry: 'https://registry.example.test',
    token: 'test-only',
    otp: '123456',
    requestTimeoutMs: 1000,
    dryRun: false,
    maxRetries: 0,
    retryDelayMs: 0,
    maxRetryDelayMs: 0,
    rateLimitMs: 0,
    authenticate,
  })
}
describe('npm authentication', () => {
  it('loads scoped credentials and env interpolation without crossing registry hosts', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'trust-auth-'))
    directories.push(cwd)
    await writeFile(join(cwd, 'package.json'), '{}')
    const userconfig = join(cwd, 'user.npmrc')
    await writeFile(userconfig, '//registry.example.test/:_authToken=user-test-token')
    await writeFile(
      join(cwd, '.npmrc'),
      // oxlint-disable-next-line no-template-curly-in-string -- npm expands this fixture value.
      'registry=https://registry.example.test/team/\n//registry.example.test/team/:_authToken=${TEST_NPM_TOKEN}',
    )
    vi.stubEnv('npm_config_userconfig', userconfig)
    vi.stubEnv('NPM_TOKEN', '')
    vi.stubEnv('TEST_NPM_TOKEN', 'project-test-token')
    const input = { cwd, repository: 'owner/repo', workflow: 'release.yml' }
    const config = await loadTrustedPublishConfig(input)
    expect(config.registry).toBe('https://registry.example.test/team')
    expect(config.token).toBe('project-test-token')
    const other = await loadTrustedPublishConfig({
      ...input,
      registry: 'https://different.example.test',
    })
    expect(other.token).toBeUndefined()
    const explicit = await loadTrustedPublishConfig({ ...input, token: 'explicit-test-token' })
    expect(explicit.token).toBe('explicit-test-token')
  })

  it('sends OTP on GET and retries a browser challenge once', async () => {
    const authenticate = vi.fn(async () => 'fresh-otp')
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: 'EOTP',
            authUrl: 'https://npmjs.com/auth',
            doneUrl: 'https://registry.example.test/done',
          },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(Response.json([]))
    vi.stubGlobal('fetch', request)
    await expect(client(authenticate).list('foo')).resolves.toStrictEqual([])
    expect(authenticate).toHaveBeenCalledWith({
      authUrl: 'https://npmjs.com/auth',
      doneUrl: 'https://registry.example.test/done',
    })
    expect(new Headers(request.mock.calls[0]?.[1].headers).get('npm-otp')).toBe('123456')
    expect(new Headers(request.mock.calls[1]?.[1].headers).get('npm-otp')).toBe('fresh-otp')
  })

  it('does not loop or retry ordinary authorization failures', async () => {
    const authenticate = vi.fn(async () => 'otp')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Response.json({ code: 'EOTP' }, { status: 401 })),
    )
    await expect(client(authenticate).list('foo')).rejects.toThrow('401')
    expect(authenticate).toHaveBeenCalledOnce()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 })))
    await expect(client(authenticate).list('foo')).rejects.toThrow('403')
    expect(authenticate).toHaveBeenCalledOnce()
  })

  it('shares one authentication flow across concurrent requests', async () => {
    const authenticate = vi.fn(async () => {
      await delay(10)
      return 'shared-otp'
    })
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      // oxlint-disable-next-line vitest/no-conditional-in-test -- Simulate registry authentication state.
      if (new Headers(init.headers).get('npm-otp') === 'shared-otp') {
        return Response.json([])
      }
      return Response.json({ code: 'EOTP' }, { status: 401 })
    })
    vi.stubGlobal('fetch', request)
    const sharedClient = client(authenticate)
    await expect(
      Promise.all([sharedClient.list('a'), sharedClient.list('b')]),
    ).resolves.toStrictEqual([[], []])
    expect(authenticate).toHaveBeenCalledOnce()
  })

  it('returns actionable 2FA errors without a handler', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ code: 'EOTP' }, { status: 401 })),
    )
    await expect(client().list('foo')).rejects.toThrow('2FA required')
  })
})
