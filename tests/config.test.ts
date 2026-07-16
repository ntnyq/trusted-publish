import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildTrustedPublishPayload,
  defineConfig,
  resolveTrustedPublishConfig,
} from '../src/index'

const tempDirs: string[] = []

function createTempDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'trusted-publish-config-'))
  tempDirs.push(cwd)
  return cwd
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('config resolution', () => {
  it('resolves stage-only permissions without granting direct publish', async () => {
    const config = await resolveTrustedPublishConfig({
      provider: 'github',
      repository: 'owner/repo',
      workflow: 'release.yml',
      allowStagePublish: true,
    })

    expect(config.permissions).toStrictEqual(['createStagedPackage'])
  })

  it('combines explicit permissions with CLI permission toggles', async () => {
    const config = await resolveTrustedPublishConfig({
      provider: 'github',
      repository: 'owner/repo',
      workflow: 'release.yml',
      permissions: ['createPackage'],
      allowStagePublish: true,
    })

    expect(config.permissions).toStrictEqual([
      'createPackage',
      'createStagedPackage',
    ])
  })

  it('requires an explicit permission when building a trust payload', async () => {
    const config = await resolveTrustedPublishConfig({
      provider: 'github',
      repository: 'owner/repo',
      workflow: 'release.yml',
    })

    expect(config.permissions).toStrictEqual([])
    expect(() => buildTrustedPublishPayload(config)).toThrow(
      'at least one permission must be configured',
    )
  })

  it('rejects unsupported providers at runtime', async () => {
    await expect(
      resolveTrustedPublishConfig({
        provider: 'unsupported' as 'github',
      }),
    ).rejects.toThrow('provider must be github, gitlab, or circleci')
  })

  it('resolves explicit config files relative to cwd', async () => {
    const cwd = createTempDir()
    writeFileSync(
      join(cwd, 'custom.json'),
      JSON.stringify({
        provider: 'github',
        registry: 'https://registry.example.test',
        concurrency: 7,
        claims: {
          repository: 'owner/repo',
          workflow: 'release.yml',
        },
        permissions: ['createPackage'],
        profiles: {
          ci: {
            concurrency: 2,
          },
        },
      }),
      'utf8',
    )

    const config = await resolveTrustedPublishConfig({
      cwd,
      config: 'custom.json',
      profile: 'ci',
    })

    expect(config.registry).toBe('https://registry.example.test')
    expect(config.concurrency).toBe(2)
  })

  it('rejects missing explicit config files', async () => {
    const cwd = createTempDir()

    await expect(
      resolveTrustedPublishConfig({ cwd, config: 'missing.json' }),
    ).rejects.toThrow(`config file not found: ${join(cwd, 'missing.json')}`)
  })

  it('rejects unknown profiles', async () => {
    const cwd = createTempDir()
    writeFileSync(
      join(cwd, 'trusted-publish.config.json'),
      JSON.stringify({
        provider: 'github',
        claims: {
          repository: 'owner/repo',
          workflow: 'release.yml',
        },
        profiles: {
          ci: {
            dryRun: true,
          },
        },
      }),
      'utf8',
    )

    await expect(
      resolveTrustedPublishConfig({ cwd, profile: 'missing' }),
    ).rejects.toThrow('config profile not found: missing')
  })

  it('accepts partial nested discovery config', () => {
    const config = defineConfig({
      discovery: {
        fromGlobs: false,
      },
    })

    expect(config.discovery.fromGlobs).toBe(false)
  })
})
