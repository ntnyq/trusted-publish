import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runSetupDetailed } from '../../src/commands/setup'
import { createRemoteConfig } from '../helpers/config'
import { createTempDir } from '../helpers/workspace'

afterEach(() => {
  vi.unstubAllGlobals()
})
const expected = {
  type: 'github',
  claims: { repository: 'owner/repo', workflow_ref: { file: 'release.yml' } },
  permissions: ['createPackage'],
}
const config = createRemoteConfig()

describe('retry selection', () => {
  it('retries only failed packages in the current selection and treats no failures as a no-op', async () => {
    const cwd = await createTempDir()
    const retryFrom = join(cwd, 'report.json')
    await writeFile(
      retryFrom,
      JSON.stringify({
        results: [
          { packageName: 'example', status: 'configured' },
          { packageName: 'other', status: 'failed' },
        ],
      }),
    )
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const report = await runSetupDetailed({ ...config, cwd, retryFrom })
    expect(report.exitCode).toBe(0)
    expect(report.summary.skipped).toBe(1)
    expect(request).not.toHaveBeenCalled()
    await writeFile(
      retryFrom,
      JSON.stringify({ results: [{ packageName: 'example', status: 'failed' }] }),
    )
    const preview = await runSetupDetailed({ ...config, cwd, retryFrom, dryRun: true })
    expect(preview.results[0]?.expected).toStrictEqual(expected)
  })
})
