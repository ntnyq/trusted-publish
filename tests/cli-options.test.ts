import { cac } from 'cac'
import { describe, expect, it } from 'vitest'
import { configureCliOptions } from '../src/cli-options'

describe('cli options', () => {
  it('leaves runtime defaults to config resolution', () => {
    const cli = configureCliOptions(cac('trusted-publish'), '0.0.0')
    const { options } = cli.parse(['node', 'trusted-publish'], { run: false })

    expect(options).toStrictEqual({ '--': [] })
  })
})
