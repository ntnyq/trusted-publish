import { cac } from 'cac'
import { name, version } from '../package.json'
import { configureCliOptions } from './cli-options'
import { runBootstrap, runDoctor, runList, runRevoke, runSetup, runVerify } from './commands'
import { authenticateInteractively } from './core/auth'
import { loadTrustedPublishConfig } from './core/config'
import type { CommandName, TrustedPublishConfig } from './core/types'

const cli = configureCliOptions(cac(name), version)

cli.command('setup', 'configure trusted publisher for selected packages').action(async () => {
  const config = await loadCliConfig('setup')
  process.exitCode = await runSetup(config)
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
  .action(async options => {
    if (!options.id) {
      throw new Error('revoke command requires --id')
    }
    const config = await loadCliConfig('revoke')
    process.exitCode = await runRevoke(config, { id: options.id })
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
cli.parse()

async function loadCliConfig(command: CommandName): Promise<TrustedPublishConfig> {
  const config = await loadTrustedPublishConfig({ ...cli.options, command })
  if (!config.json && !config.silent && !config.authenticate) {
    config.authenticate = authenticateInteractively
  }
  return config
}
