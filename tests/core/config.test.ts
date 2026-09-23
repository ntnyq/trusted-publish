import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildTrustedPublishPayload,
  defineConfig,
  resolveTrustedPublishConfig,
} from '../../src/index'
import { createTempDir } from '../helpers/workspace'

describe('config resolution', () => {
  it.each([
    {
      base: { workflow: 'base.yml' },
      profile: {},
      input: { file: 'cli.yml' },
      expected: 'cli.yml',
    },
    {
      base: { file: 'base.yml' },
      profile: {},
      input: { workflow: 'cli.yml' },
      expected: 'cli.yml',
    },
    {
      base: { workflow: 'base.yml' },
      profile: { file: 'profile.yml' },
      input: {},
      expected: 'profile.yml',
    },
    {
      base: { file: 'base.yml' },
      profile: { workflow: 'profile.yml' },
      input: {},
      expected: 'profile.yml',
    },
    {
      base: { workflow: 'base.yml' },
      profile: { workflow: 'profile.yml' },
      input: { file: 'cli.yml' },
      expected: 'cli.yml',
    },
    {
      base: { file: 'base.yml' },
      profile: {},
      input: { workflow: 'workflow.yml', file: 'file.yml' },
      expected: 'workflow.yml',
    },
  ])(
    'resolves GitHub workflow aliases by source priority: %j',
    async ({ base, profile, input, expected }) => {
      const cwd = await createTempDir()
      writeFileSync(
        join(cwd, 'trusted-publish.config.json'),
        JSON.stringify({
          claims: { repository: 'owner/repo', ...base },
          permissions: ['createPackage'],
          profiles: { release: { claims: profile } },
        }),
      )
      const config = await resolveTrustedPublishConfig({ cwd, profile: 'release', ...input })
      expect(buildTrustedPublishPayload(config).claims).toStrictEqual({
        repository: 'owner/repo',
        workflow_ref: { file: expected },
      })
    },
  )

  it('keeps GitLab file overrides separate from GitHub workflow aliases', async () => {
    const config = await resolveTrustedPublishConfig({
      cwd: await createTempDir(),
      provider: 'gitlab',
      project: 'group/project',
      file: 'pipeline.yml',
      workflow: 'unrelated.yml',
      allowPublish: true,
    })
    expect(buildTrustedPublishPayload(config).claims).toStrictEqual({
      project_path: 'group/project',
      ci_config_ref_uri: { file: 'pipeline.yml' },
    })
  })

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

    expect(config.permissions).toStrictEqual(['createPackage', 'createStagedPackage'])
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
    const cwd = await createTempDir()
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
    const cwd = await createTempDir()

    await expect(resolveTrustedPublishConfig({ cwd, config: 'missing.json' })).rejects.toThrow(
      `config file not found: ${join(cwd, 'missing.json')}`,
    )
  })

  it('rejects unknown profiles', async () => {
    const cwd = await createTempDir()
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

    await expect(resolveTrustedPublishConfig({ cwd, profile: 'missing' })).rejects.toThrow(
      'config profile not found: missing',
    )
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
