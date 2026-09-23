import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../../src/core/config/defaults'
import { loadTrustedPublishConfig } from '../../src/core/config/load'
import { inspectWorkflow } from '../../src/core/workflow'
import { createTempDir } from '../helpers/workspace'

describe('workflow readiness', () => {
  it.each([
    'owner/repo',
    { url: 'git+https://github.com/owner/repo.git' },
    'git@github.com:owner/repo.git',
  ])('infers GitHub repository from %j', async repository => {
    const cwd = await createTempDir()
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'example', repository }))
    const config = await loadTrustedPublishConfig({
      cwd,
      workflow: 'release.yml',
      allowPublish: true,
    })
    expect(config.claims.repository).toBe('owner/repo')
  })

  it('checks effective job permissions instead of assuming workflow-level permissions apply', async () => {
    const cwd = await createTempDir()
    await mkdir(join(cwd, '.github/workflows'), { recursive: true })
    await writeFile(
      join(cwd, '.github/workflows/release.yml'),
      `permissions:
  id-token: write
jobs:
  publish:
    permissions:
      contents: read
    steps:
      - run: pnpm publish
`,
    )
    const diagnostics = await inspectWorkflow({
      ...DEFAULT_CONFIG,
      cwd,
      claims: { workflow: 'release.yml' },
    })
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('id-token: write'),
      }),
    )
  })

  it('reports a missing local workflow and skips it for a remote selector', async () => {
    const cwd = await createTempDir()
    const config = { ...DEFAULT_CONFIG, cwd, claims: { workflow: 'release.yml' } }
    const local = await inspectWorkflow(config)
    const remote = await inspectWorkflow({ ...config, remotePackage: 'example' })
    expect(local[0]?.status).toBe('fail')
    expect(remote[0]?.status).toBe('warn')
  })
})
