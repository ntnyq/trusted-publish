import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '../src/constants'
import { loadTrustedPublishConfig } from '../src/core/config'
import { discoverPackages } from '../src/core/discovery'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})
async function workspace(yaml?: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'trust-discovery-'))
  directories.push(cwd)
  for (const name of ['a', 'excluded']) {
    await mkdir(join(cwd, 'packages', name), { recursive: true })
    await writeFile(join(cwd, 'packages', name, 'package.json'), JSON.stringify({ name }))
  }
  if (yaml !== undefined) {
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), yaml)
  }
  return cwd
}

describe('package selection', () => {
  it.each([
    'packages: ["packages/a"]',
    "packages:\n  - 'packages/a' # main package\nignoredBuiltDependencies:\n  - packages/excluded",
    "packages:\n  - 'packages/*'\n  - '!packages/excluded'",
  ])('honors workspace patterns without glob re-inclusion: %s', async yaml => {
    const cwd = await workspace(yaml)
    const packages = await discoverPackages({ ...DEFAULT_CONFIG, cwd })
    expect(packages.map(pkg => pkg.name)).toStrictEqual(['a'])
  })

  it('does not fall back for empty or invalid workspaces', async () => {
    const cwd = await workspace('packages: []')
    await expect(discoverPackages({ ...DEFAULT_CONFIG, cwd })).resolves.toStrictEqual([])
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'packages: wrong')
    await expect(discoverPackages({ ...DEFAULT_CONFIG, cwd })).rejects.toThrow('workspace packages')
  })

  it('falls back when pnpm config contains no packages field', async () => {
    const cwd = await workspace('onlyBuiltDependencies: [esbuild]')
    await expect(discoverPackages({ ...DEFAULT_CONFIG, cwd })).resolves.toHaveLength(2)
  })

  it.each([['packages/a'], { packages: ['packages/a'] }])(
    'reads package.json workspaces: %j',
    async workspaces => {
      const cwd = await workspace()
      await writeFile(join(cwd, 'package.json'), JSON.stringify({ workspaces }))
      const packages = await discoverPackages({ ...DEFAULT_CONFIG, cwd })
      expect(packages.map(pkg => pkg.name)).toStrictEqual(['a'])
    },
  )

  it('explicit CLI globs replace defaults and workspace selection', async () => {
    const cwd = await workspace('packages: ["packages/excluded"]')
    const config = await loadTrustedPublishConfig({
      cwd,
      repository: 'owner/repo',
      workflow: 'release.yml',
      packageJsonGlobs: 'packages/a/package.json',
    })
    expect(config.discovery.packageJsonGlobs).toStrictEqual(['packages/a/package.json'])
    const packages = await discoverPackages(config)
    expect(packages.map(pkg => pkg.name)).toStrictEqual(['a'])
    expect(packages[0]?.dir).toBe(join(cwd, 'packages', 'a'))
  })
})
