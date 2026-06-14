import { cac } from 'cac'
import { runList } from './commands/list'
import { runRevoke } from './commands/revoke'
import { runSetup } from './commands/setup'
import { runVerify } from './commands/verify'
import { loadTrustedPublishConfig } from './core/config'

const cli = cac('trusted-publish')

cli
  .option('--cwd <path>', 'working directory')
  .option('--config <path>', 'custom config file')
  .option('--profile <name>', 'config profile')
  .option('--provider <type>', 'provider: github|gitlab|circleci')
  .option('--package <name>', 'single package name')
  .option('--include <names>', 'comma-separated package names')
  .option('--exclude <names>', 'comma-separated package names')
  .option('--ignores <globs>', 'comma-separated ignore globs')
  .option('--workspace-globs <globs>', 'additional workspace globs')
  .option('--package-json-globs <globs>', 'package.json search globs')
  .option('--from-workspaces', 'enable workspace discovery')
  .option('--from-globs', 'enable glob discovery')
  .option('--include-private', 'include private packages')
  .option('--repository <value>', 'github repository owner/repo')
  .option('--workflow <file>', 'github workflow file')
  .option('--project <value>', 'gitlab project path')
  .option('--file <file>', 'provider file (gitlab/github)')
  .option('--environment <name>', 'CI environment')
  .option('--org-id <id>', 'circleci org id')
  .option('--project-id <id>', 'circleci project id')
  .option('--pipeline-definition-id <id>', 'circleci pipeline definition id')
  .option('--vcs-origin <value>', 'circleci vcs origin provider/owner/repo')
  .option('--context-ids <ids>', 'circleci context ids (comma separated)')
  .option('--allow-publish', 'allow publish (createPackage)')
  .option('--allow-stage-publish', 'allow stage publish (createStagedPackage)')
  .option('--concurrency <n>', 'parallelism', { default: 4 })
  .option('--fail-fast', 'stop processing after first failed package')
  .option('--max-retries <n>', 'max retry times on 429/5xx', { default: 2 })
  .option('--retry-delay-ms <n>', 'base retry delay in ms', { default: 1200 })
  .option('--max-retry-delay-ms <n>', 'max retry delay in ms', {
    default: 8000,
  })
  .option('--rate-limit-ms <n>', 'minimum interval between mutation requests', {
    default: 0,
  })
  .option('--dry-run', 'preview only')
  .option('--json', 'json output')
  .option('--silent', 'silent logs')
  .option('--verbose', 'verbose logs')
  .option('--yes', 'skip confirmation')
  .option('--registry <url>', 'npm registry', {
    default: 'https://registry.npmjs.org',
  })
  .option('--token <token>', 'npm token')
  .option('--otp <otp>', 'npm 2fa otp')

cli
  .command('setup', 'configure trusted publisher for selected packages')
  .action(async () => {
    const config = await loadTrustedPublishConfig(cli.options)
    process.exitCode = await runSetup(config)
  })

cli
  .command('list', 'list trusted publisher configs for selected packages')
  .action(async () => {
    const config = await loadTrustedPublishConfig(cli.options)
    process.exitCode = await runList(config)
  })

cli
  .command('verify', 'verify expected trusted publisher config exists')
  .action(async () => {
    const config = await loadTrustedPublishConfig(cli.options)
    process.exitCode = await runVerify(config)
  })

cli
  .command('revoke', 'revoke trusted publisher config by id')
  .option('--id <id>', 'trusted publisher config id')
  .action(async options => {
    const config = await loadTrustedPublishConfig(cli.options)
    process.exitCode = await runRevoke(config, { id: options.id })
  })

cli.help()
cli.parse()
