import { cac } from 'cac'
import { name, version } from '../package.json'
import { configureCliOptions, normalizeCliBooleans } from './cli-options'
import { runBootstrap, runDoctor, runList, runRevoke, runSetup, runVerify } from './commands'
import { authenticateInteractively } from './core/auth'
import { loadTrustedPublishConfig } from './core/config'
import type { CommandName, TrustedPublishConfig } from './core/types'

const cli = configureCliOptions(cac(name), version)

cli
  .command('setup', 'configure trusted publisher for selected packages')
  .option('--replace', 'replace conflicting trust with recovery on failure')
  .action(async options => {
    const config = await loadCliConfig('setup')
    process.exitCode = await runSetup(config, { replace: options.replace })
  })

cli.command('list', 'list trusted publisher configs for selected packages').action(async () => {
  const config = await loadCliConfig('list')
  process.exitCode = await runList(config)
})

cli.command('verify', 'verify expected trusted publisher config exists').action(async () => {
  const config = await loadCliConfig('verify')
  process.exitCode = await runVerify(config)
})

cli
  .command('revoke', 'revoke trusted publisher config by id')
  .option('--id <id>', 'trusted publisher config id')
  .option('--matching', 'resolve a matching trust ID separately for each package')
  .action(async options => {
    if (Boolean(options.id) === Boolean(options.matching)) {
      throw new Error('revoke requires exactly one of --id or --matching')
    }
    const config = await loadCliConfig(options.matching ? 'verify' : 'revoke')
    process.exitCode = await runRevoke(
      config,
      options.matching ? { matching: true } : { id: options.id },
    )
  })

cli
  .command('plan', 'preview package targets and exact trust payloads without requests')
  .action(async () => {
    const config = await loadCliConfig('plan')
    process.exitCode = await runSetup({ ...config, dryRun: true })
  })

cli
  .command('bootstrap', 'publish an isolated placeholder for a new package')
  .option('--initial-version <version>', 'placeholder version (default: 0.0.0)')
  .option('--access <access>', 'public or restricted (default: public)')
  .option('--keep-temp', 'retain the generated placeholder directory')
  .action(async options => {
    const config = await loadCliConfig('bootstrap')
    process.exitCode = await runBootstrap(config, {
      version: options.initialVersion,
      access: options.access,
      keepTemp: options.keepTemp,
    })
  })

cli
  .command('doctor', 'check package existence, authentication and trusted publisher readiness')
  .action(async () => {
    const config = await loadCliConfig('doctor')
    process.exitCode = await runDoctor(config)
  })

cli.help()
cli.parse(process.argv, { run: false })
normalizeCliBooleans(cli)
cli.runMatchedCommand()

async function loadCliConfig(command: CommandName): Promise<TrustedPublishConfig> {
  const config = await loadTrustedPublishConfig({ ...cli.options, command })
  if (!config.json && !config.silent && !config.authenticate) {
    config.authenticate = authenticateInteractively
  }
  return config
}
