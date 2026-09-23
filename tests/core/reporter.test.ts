import { consola } from 'consola'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '../../src/core/config/defaults'
import { createReporter, summarize } from '../../src/core/reporter'
import type { PackageCommandResult } from '../../src/core/types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('reporter', () => {
  it('reports zero counts for an empty batch', () => {
    expect(summarize([])).toStrictEqual({
      total: 0,
      configured: 0,
      already: 0,
      revoked: 0,
      failed: 0,
      skipped: 0,
    })
  })

  it('counts mixed results and defaults missing statuses to zero', () => {
    const statuses: PackageCommandResult['status'][] = [
      'failed',
      'configured',
      'already',
      'failed',
      'revoked',
    ]
    const results = statuses.map((status, index) => ({
      packageName: `pkg-${index}`,
      packageDir: `/pkg-${index}`,
      status,
      message: status,
    }))

    expect(summarize(results)).toStrictEqual({
      total: 5,
      configured: 1,
      already: 1,
      revoked: 1,
      failed: 2,
      skipped: 0,
    })
    expect(results.map(result => result.status)).toStrictEqual(statuses)
  })

  it('emits only the JSON document in JSON mode', () => {
    const boxSpy = vi.spyOn(consola, 'box').mockImplementation(() => {})
    const infoSpy = vi.spyOn(consola, 'info').mockImplementation(() => {})
    const successSpy = vi.spyOn(consola, 'success').mockImplementation(() => {})
    const warnSpy = vi.spyOn(consola, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(consola, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
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
      [boxSpy, infoSpy, successSpy, warnSpy, errorSpy].every(spy => spy.mock.calls.length === 0),
    ).toBe(true)
    expect(logSpy).toHaveBeenCalledOnce()
    expect(() => JSON.parse(String(logSpy.mock.calls[0]![0]))).not.toThrow()
  })
})
