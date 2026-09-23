import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import NpmConfig from '@npmcli/config'
import npmDefinitions from '@npmcli/config/lib/definitions/index.js'
import { isNonEmptyString } from '@ntnyq/utils'

/**
 * Loads npm's project, user and global configuration without reading this CLI's argv.
 * @param cwd - Project directory.
 * @returns Loaded npm config.
 */
export async function loadNpmConfig(cwd: string): Promise<NpmConfig> {
  const npmPackagePath = fileURLToPath(import.meta.resolve('@npmcli/config/package.json'))
  const { definitions, flatten, shorthands } = npmDefinitions
  const config = new NpmConfig({
    definitions,
    flatten,
    shorthands,
    cwd,
    argv: [],
    npmPath: dirname(npmPackagePath),
  })
  await config.load()
  return config
}

/**
 * Resolves the most specific registry-scoped token, never an unrelated registry's token.
 * @param config - Loaded npm config.
 * @param registry - Target registry URL.
 * @returns Matching token, if available.
 */
export function getNpmToken(config: NpmConfig, registry: string): string | undefined {
  const url = new URL(registry)
  let path = url.pathname.replace(/\/?$/, '/')
  while (true) {
    const token: unknown = config.get(`//${url.host}${path}:_authToken`)
    if (isNonEmptyString(token)) {
      return token
    }
    if (path === '/') {
      return undefined
    }
    path = path.slice(0, path.slice(0, -1).lastIndexOf('/') + 1)
  }
}
