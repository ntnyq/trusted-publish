import { ChildProcess } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import spawn from 'cross-spawn'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../src/constants'
import { publishPlaceholder } from '../src/core/publish'

vi.mock(import('cross-spawn'))
const directories: string[] = []
afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
describe('npm publication', () => {
  it('passes credentials only through the child environment and an npmrc placeholder', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'trust-publish-'))
    directories.push(directory)
    const child = new ChildProcess()
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => child.emit('close', 0))
      return child as ReturnType<typeof spawn>
    })
    await publishPlaceholder(
      directory,
      'restricted',
      {
        ...DEFAULT_CONFIG,
        token: 'test-secret',
        otp: 'test-otp',
        json: true,
      },
      '@scope/new-package',
    )
    const [command, args, options] = vi.mocked(spawn).mock.calls[0]!
    expect(command).toBe('npm')
    expect(args).toStrictEqual([
      'publish',
      '.',
      '--registry',
      DEFAULT_CONFIG.registry,
      '--access',
      'restricted',
      '--tag',
      'bootstrap',
      '--ignore-scripts',
      '--workspaces=false',
      '--dry-run=false',
    ])
    expect(options).toMatchObject({
      cwd: directory,
      stdio: 'ignore',
      env: {
        TRUSTED_PUBLISH_BOOTSTRAP_TOKEN: 'test-secret',
        npm_config_otp: 'test-otp',
        'npm_config_@scope:registry': DEFAULT_CONFIG.registry,
      },
    })
    const npmrc = await readFile(join(directory, '.npmrc'), 'utf8')
    expect(npmrc).not.toContain('test-secret')
    expect(npmrc).toContain('TRUSTED_PUBLISH_BOOTSTRAP_TOKEN')
  })
})
