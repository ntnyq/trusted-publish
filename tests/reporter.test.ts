import { consola } from 'consola'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../src/constants'
import { createReporter } from '../src/core/reporter'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reporter', () => {
  it('emits only the JSON document in JSON mode', () => {
    const boxSpy = vi.spyOn(consola, 'box').mockImplementation(() => {})
    const infoSpy = vi.spyOn(consola, 'info').mockImplementation(() => {})
    const successSpy = vi.spyOn(consola, 'success').mockImplementation(() => {})
    const warnSpy = vi.spyOn(consola, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(consola, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(consola, 'log').mockImplementation(() => {})
    const reporter = createReporter({
      ...DEFAULT_CONFIG,
      json: true,
      silent: false,
    })

    reporter.title('title')
    reporter.info('info')
    reporter.success('success')
    reporter.warn('warn')
    reporter.error('error')
    reporter.result({
      packageName: 'pkg',
      packageDir: '/pkg',
      status: 'configured',
      message: 'configured',
    })
    reporter.summary(
      {
        total: 0,
        configured: 0,
        already: 0,
        revoked: 0,
        failed: 0,
        skipped: 0,
      },
      [],
    )

    expect(
      [boxSpy, infoSpy, successSpy, warnSpy, errorSpy].every(
        spy => spy.mock.calls.length === 0,
      ),
    ).toBe(true)
    expect(logSpy).toHaveBeenCalledOnce()
    expect(() => JSON.parse(String(logSpy.mock.calls[0]![0]))).not.toThrow()
  })
})
