import { cac } from 'cac'
import { name, version } from '../package.json'
import { configureCliOptions } from './cli-options'
import { runList } from './commands/list'
import { runRevoke } from './commands/revoke'
import { runSetup } from './commands/setup'
import { runVerify } from './commands/verify'
import { authenticateInteractively } from './core/auth'
import { loadTrustedPublishConfig } from './core/config'
import type { TrustedPublishConfig } from './core/types'

const cli = configureCliOptions(cac(name), version)

cli.command('setup', 'configure trusted publisher for selected packages').action(async () => {
  const config = await loadCliConfig()
  process.exitCode = await runSetup(config)
})

cli.command('list', 'list trusted publisher configs for selected packages').action(async () => {
  const config = await loadCliConfig()
  process.exitCode = await runList(config)
})

cli.command('verify', 'verify expected trusted publisher config exists').action(async () => {
  const config = await loadCliConfig()
  process.exitCode = await runVerify(config)
})

cli
  .command('revoke', 'revoke trusted publisher config by id')
  .option('--id <id>', 'trusted publisher config id')
  .action(async options => {
    if (!options.id) {
      throw new Error('revoke command requires --id')
    }
    const config = await loadCliConfig()
    process.exitCode = await runRevoke(config, { id: options.id })
  })

cli.help()
cli.parse()

async function loadCliConfig(): Promise<TrustedPublishConfig> {
  const config = await loadTrustedPublishConfig(cli.options)
  if (!config.json && !config.silent && !config.authenticate) {
    config.authenticate = authenticateInteractively
  }
  return config
}
