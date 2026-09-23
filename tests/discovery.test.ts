import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSetupDetailed } from '../src/commands/setup'
import { DEFAULT_CONFIG } from '../src/constants'
import { loadTrustedPublishConfig } from '../src/core/config'
import { discoverPackages } from '../src/core/discovery'

const directories: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
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
  it.each(['null', '[]', '{"name":42}', '{"name":"example","private":"false"}'])(
    'rejects invalid manifest metadata with its path: %s',
    async content => {
      const cwd = await workspace('packages: ["packages/a"]')
      const manifestPath = join(cwd, 'packages/a/package.json')
      await writeFile(manifestPath, content)
      await expect(discoverPackages({ ...DEFAULT_CONFIG, cwd })).rejects.toThrow(manifestPath)
    },
  )

  it('includes the root manifest path and original cause in parse errors', async () => {
    const cwd = await workspace()
    const manifestPath = join(cwd, 'package.json')
    await writeFile(manifestPath, '{ invalid JSON')
    await expect(discoverPackages({ ...DEFAULT_CONFIG, cwd })).rejects.toMatchObject({
      message: expect.stringContaining(manifestPath),
      cause: expect.any(SyntaxError),
    })
  })

  it('fails before any registry mutations when a selected manifest is unreadable JSON', async () => {
    const cwd = await workspace('packages: ["packages/*"]')
    const manifestPath = join(cwd, 'packages/excluded/package.json')
    await writeFile(manifestPath, '{ invalid JSON')
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(
      runSetupDetailed({
        ...DEFAULT_CONFIG,
        cwd,
        silent: true,
        claims: { repository: 'owner/repo', workflow: 'release.yml' },
        permissions: ['createPackage'],
      }),
    ).rejects.toThrow(`failed to read package manifest ${manifestPath}`)
    expect(request).not.toHaveBeenCalled()
  })

  it.each(['packages: ["packages/*"]', 'packages: [".", "packages/*"]', 'packages: []'])(
    'selects the pnpm root exactly once, including with --package: %s',
    async yaml => {
      const cwd = await workspace(yaml)
      await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'root-package' }))
      const packages = await discoverPackages({ ...DEFAULT_CONFIG, cwd })
      expect(packages.filter(pkg => pkg.name === 'root-package')).toHaveLength(1)
      const selected = await discoverPackages({ ...DEFAULT_CONFIG, cwd, package: 'root-package' })
      expect(selected.map(pkg => pkg.name)).toStrictEqual(['root-package'])
    },
  )

  it('applies private and name filters to the pnpm root', async () => {
    const cwd = await workspace('packages: []')
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ name: 'root-package', private: true }),
    )
    const config = { ...DEFAULT_CONFIG, cwd }
    await expect(discoverPackages(config)).resolves.toStrictEqual([])
    await expect(discoverPackages({ ...config, includePrivate: true })).resolves.toHaveLength(1)
    await expect(
      discoverPackages({ ...config, includePrivate: true, exclude: ['root-package'] }),
    ).resolves.toStrictEqual([])
    await expect(
      discoverPackages({ ...config, includePrivate: true, include: ['other'] }),
    ).resolves.toStrictEqual([])
    await expect(
      discoverPackages({ ...config, includePrivate: true, ignores: ['package.json'] }),
    ).resolves.toStrictEqual([])
  })

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
