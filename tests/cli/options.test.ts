import { cac } from 'cac'
import { describe, expect, it } from 'vitest'
import { configureCliOptions, normalizeCliBooleans } from '../../src/cli/options'

describe('cli options', () => {
  it('leaves runtime defaults to config resolution', () => {
    const cli = configureCliOptions(cac('trusted-publish'), '0.0.0')
    const { options } = cli.parse(['node', 'trusted-publish'], { run: false })
    normalizeCliBooleans(cli)

    expect(options).toStrictEqual({ '--': [] })
  })

  it.each(['true', 'false'])('normalizes all declared global booleans set to %s', value => {
    const cli = configureCliOptions(cac('trusted-publish'), '0.0.0')
    const booleans = cli.globalCommand.options.filter(
      // oxlint-disable-next-line vitest/no-conditional-in-test -- Enumerate runtime flags, excluding the version command.
      option => option.isBoolean && option.name !== 'version',
    )
    cli.parse(
      ['node', 'trusted-publish', ...booleans.map(option => `${option.rawName}=${value}`)],
      {
        run: false,
      },
    )
    normalizeCliBooleans(cli)
    expect(booleans.map(option => cli.options[option.name])).toStrictEqual(
      booleans.map(() => value === 'true'),
    )
  })

  it.each(['--allow-publish', '--no-allow-publish'])(
    'preserves native boolean syntax: %s',
    flag => {
      const cli = configureCliOptions(cac('trusted-publish'), '0.0.0')
      cli.parse(['node', 'trusted-publish', flag], { run: false })
      normalizeCliBooleans(cli)
      expect(cli.options['allowPublish']).toBe(flag === '--allow-publish')
    },
  )

  it('normalizes command-specific boolean options before running the action', () => {
    const cli = configureCliOptions(cac('trusted-publish'), '0.0.0')
    cli.command('bootstrap').option('--keep-temp', 'retain artifacts')
    cli.parse(['node', 'trusted-publish', 'bootstrap', '--keep-temp=false'], { run: false })
    normalizeCliBooleans(cli)
    expect(cli.options['keepTemp']).toBe(false)
  })

  it.each(['--allow-publish=invalid', '--allow-publish=false --allow-publish=true'])(
    'rejects ambiguous boolean input: %s',
    flags => {
      const cli = configureCliOptions(cac('trusted-publish'), '0.0.0')
      cli.parse(['node', 'trusted-publish', ...flags.split(' ')], { run: false })
      expect(() => normalizeCliBooleans(cli)).toThrow('--allow-publish must be true or false')
    },
  )
})
