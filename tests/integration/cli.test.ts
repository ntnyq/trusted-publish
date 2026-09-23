import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'
import type { CommandReport } from '../../src/core/types'

const exec = promisify(execFile)
beforeAll(async () => {
  await exec(process.execPath, [fileURLToPath(import.meta.resolve('tsdown/run'))])
})
async function cli(...args: string[]): Promise<Omit<CommandReport, 'exitCode'>> {
  const { stdout } = await exec(process.execPath, ['dist/cli.mjs', ...args, '--json'], {
    // oxlint-disable-next-line node/no-process-env -- Keep Node's runtime environment while clearing npm credentials.
    env: { ...process.env, NPM_TOKEN: '', NPM_OTP: '' },
  })
  return JSON.parse(stdout)
}

describe('built CLI', () => {
  it('does not grant direct publication when its flag is explicitly false', async () => {
    const report = await cli(
      'plan',
      '--remote-package',
      'example',
      '--repository',
      'owner/repo',
      '--workflow',
      'release.yml',
      '--allow-publish=false',
      '--allow-stage-publish',
    )
    expect(report.results[0]?.expected?.permissions).toStrictEqual(['createStagedPackage'])
  })

  it('loads external npm modules under native Node ESM and prints a complete plan', async () => {
    const report = await cli(
      'plan',
      '--remote-package',
      '@scope/smoke',
      '--repository',
      'owner/repo',
      '--workflow',
      'release.yml',
      '--allow-publish',
    )
    expect(report.results[0]?.expected).toMatchObject({
      type: 'github',
      permissions: ['createPackage'],
    })
  })

  it('generates a retained placeholder with no local project files or credentials', async () => {
    const report = await cli(
      'bootstrap',
      '--remote-package',
      '@scope/smoke',
      '--dry-run',
      '--keep-temp',
    )
    const directory = report.results[0]!.bootstrap!.directory!
    try {
      const { readdir } = await import('node:fs/promises')
      const files = await readdir(directory)
      expect(files.toSorted()).toStrictEqual(['README.md', 'index.js', 'package.json'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('lists, diagnoses and revokes a remote package against a local test registry', async () => {
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      // oxlint-disable vitest/no-conditional-in-test -- Local registry routing.
      if (request.url === '/-/whoami') {
        response.end(JSON.stringify({ username: 'smoke' }))
      } else if (request.method === 'DELETE') {
        response.statusCode = 204
        response.end()
      } else if (request.url?.endsWith('/trust')) {
        response.end(
          JSON.stringify([
            {
              id: 'smoke-id',
              type: 'github',
              claims: { repository: 'owner/repo', workflow_ref: { file: 'release.yml' } },
              permissions: ['createPackage'],
            },
          ]),
        )
      } else {
        response.end(JSON.stringify({ name: '@scope/smoke' }))
      }
      // oxlint-enable vitest/no-conditional-in-test
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const address = server.address() as AddressInfo
      const common = [
        '--remote-package',
        '@scope/smoke',
        '--registry',
        `http://127.0.0.1:${address.port}`,
        '--token',
        'smoke-test-token',
      ]
      const listed = await cli('list', ...common)
      const doctor = await cli('doctor', ...common)
      const revoked = await cli('revoke', ...common, '--id', 'smoke-id')
      expect(listed.results[0]?.entries?.[0]?.id).toBe('smoke-id')
      expect(doctor.summary.failed).toBe(0)
      expect(revoked.summary.revoked).toBe(1)
    } finally {
      server.closeAllConnections()
      await promisify(server.close.bind(server))()
    }
  })
})
