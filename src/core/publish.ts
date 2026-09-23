import { once } from 'node:events'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import spawn from 'cross-spawn'
import type { TrustedPublishConfig } from './types'

/**
 * Publishes a generated placeholder with npm, using shell-free arguments and scoped credentials.
 * @param directory - Generated package directory.
 * @param access - Package visibility.
 * @param config - Registry/auth and output options.
 * @param packageName - Package name used to pin any scoped registry override.
 * @returns Nothing after npm exits successfully.
 */
export async function publishPlaceholder(
  directory: string,
  access: 'public' | 'restricted',
  config: TrustedPublishConfig,
  packageName: string,
): Promise<void> {
  const registry = new URL(config.registry)
  const scope = `//${registry.host}${registry.pathname.replace(/\/?$/, '/')}`
  const env = { ...process.env }
  if (packageName.startsWith('@')) {
    const scopeName = packageName.slice(0, packageName.indexOf('/'))
    env[`npm_config_${scopeName}:registry`] = config.registry
  }
  if (config.token) {
    // The file contains an environment reference, never the credential itself.
    await writeFile(
      join(directory, '.npmrc'),
      `${scope}:_authToken=\${TRUSTED_PUBLISH_BOOTSTRAP_TOKEN}\n`,
      { mode: 0o600 },
    )
    env['TRUSTED_PUBLISH_BOOTSTRAP_TOKEN'] = config.token
  }
  if (config.otp) {
    env['npm_config_otp'] = config.otp
  }
  const child = spawn(
    'npm',
    [
      'publish',
      '.',
      '--registry',
      config.registry,
      '--access',
      access,
      '--tag',
      'bootstrap',
      '--ignore-scripts',
      '--workspaces=false',
      '--dry-run=false',
    ],
    { cwd: directory, env, stdio: config.json || config.silent ? 'ignore' : 'inherit' },
  )
  const [code] = await once(child, 'close')
  if (code !== 0) {
    throw new Error(
      `npm publish failed (exit ${String(code)}); check npm authentication and package access`,
    )
  }
}
