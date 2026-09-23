import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { valid } from 'semver'
import { discoverPackages } from '../core/discovery'
import { validatePackageName } from '../core/package-name'
import { publishPlaceholder } from '../core/publish'
import { createReporter, summarize } from '../core/reporter'
import type { CommandReport, PackageCommandResult, TrustedPublishConfig } from '../core/types'
import { createCommandClient, runPackageCommand } from './runner'

/**
 * Explicit controls for first publication of a placeholder package.
 */
export interface BootstrapOptions {
  version?: string
  access?: 'public' | 'restricted'
  keepTemp?: boolean
}

/**
 * Creates an isolated placeholder and optionally publishes it; never changes a local manifest.
 * @param config - Selected packages and registry settings; apply requires yes.
 * @param options - Placeholder version, visibility and artifact retention.
 * @returns Per-package publication/preview results.
 */
export async function runBootstrapDetailed(
  config: TrustedPublishConfig,
  options: BootstrapOptions = {},
): Promise<CommandReport> {
  const version = options.version ?? '0.0.0'
  const access = options.access ?? 'public'
  if (!valid(version) || valid(version) !== version) {
    throw new Error('bootstrap version must be a canonical semver version')
  }
  if (!['public', 'restricted'].includes(access)) {
    throw new Error('bootstrap access must be public or restricted')
  }
  if (!config.dryRun && !config.yes) {
    throw new Error(
      'bootstrap publishes a new package; preview with --dry-run, then pass --yes to publish',
    )
  }
  const packages = await discoverPackages(config)
  const reporter = createReporter(config)
  const client = createCommandClient(config)
  reporter.title('npm package bootstrap')
  // Npm owns interactive publish authentication, so do not interleave terminal prompts.
  const results = await runPackageCommand(
    { ...config, concurrency: 1 },
    packages,
    reporter,
    async pkg => {
      validatePackageName(pkg.name)
      if (pkg.private) {
        throw new Error('bootstrap refuses private local packages')
      }
      if (access === 'restricted' && !pkg.name.startsWith('@')) {
        throw new Error('restricted access requires a scoped package name')
      }
      const base = { packageName: pkg.name, packageDir: pkg.dir }
      if (!config.dryRun && (await client.packageExists(pkg.name))) {
        return {
          ...base,
          status: 'already',
          message: 'package already exists; use setup to configure trusted publishing',
        }
      }
      const directory = await mkdtemp(join(tmpdir(), 'trusted-publish-bootstrap-'))
      const bootstrap = {
        version,
        access,
        ...(options.keepTemp ? { directory } : {}),
        ...(new URL(config.registry).hostname === 'registry.npmjs.org'
          ? { settingsUrl: `https://www.npmjs.com/package/${pkg.name}/access` }
          : {}),
      }
      try {
        const manifest = {
          name: pkg.name,
          version,
          description: 'Placeholder for npm trusted publishing setup',
          type: 'module',
          main: 'index.js',
          files: ['index.js'],
          publishConfig: { access, registry: config.registry },
        }
        await writeFile(join(directory, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
        await writeFile(
          join(directory, 'index.js'),
          "throw new Error('Placeholder package: the first implementation has not been published yet')\n",
        )
        await writeFile(
          join(directory, 'README.md'),
          `# ${pkg.name}\n\nPlaceholder reserved for the first trusted publication.\n`,
        )
        if (!config.dryRun) {
          await publishPlaceholder(directory, access, config, pkg.name)
        }
        return {
          ...base,
          status: config.dryRun ? 'skipped' : 'configured',
          message: config.dryRun
            ? 'dry-run: placeholder generated; nothing published'
            : 'placeholder published with tag bootstrap; configure a trusted publisher next',
          bootstrap,
        } satisfies PackageCommandResult
      } catch (error) {
        return {
          ...base,
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
          bootstrap,
        } satisfies PackageCommandResult
      } finally {
        // Remove even the environment-only npmrc from retained artifacts.
        await rm(join(directory, '.npmrc'), { force: true })
        if (!options.keepTemp) {
          await rm(directory, { recursive: true, force: true })
        }
      }
    },
  )
  const summary = summarize(results)
  reporter.summary(summary, results)
  return { exitCode: summary.failed > 0 ? 1 : 0, summary, results }
}

/**
 * Runs bootstrap and returns an exit code.
 * @param config - Runtime settings.
 * @param options - Placeholder controls.
 * @returns Exit code.
 */
export async function runBootstrap(
  config: TrustedPublishConfig,
  options?: BootstrapOptions,
): Promise<number> {
  const report = await runBootstrapDetailed(config, options)
  return report.exitCode
}
