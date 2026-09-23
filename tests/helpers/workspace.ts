import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onTestFinished } from 'vitest'

/**
 * Creates a temporary directory and removes it even when the test fails.
 * @returns Temporary directory path.
 */
export async function createTempDir(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'trusted-publish-test-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  return cwd
}

/**
 * Creates package manifests for command and Node API tests.
 * @param names - Package names to create.
 * @returns Workspace directory.
 */
export async function createWorkspace(names: string[]): Promise<{ cwd: string }> {
  const cwd = await createTempDir()
  for (const name of names) {
    const directory = join(cwd, 'packages', name.replaceAll('@', '').replaceAll('/', '-'))
    await mkdir(directory, { recursive: true })
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name, version: '0.0.0' }, null, 2),
      'utf8',
    )
  }
  return { cwd }
}
