import { describe, expect, it, vi } from 'vitest'
import { runWithConcurrency } from '../src/utils'

describe('concurrency helper', () => {
  it('rejects unhandled errors after running workers settle and stops new work', async () => {
    const error = new Error('worker failed')
    const gates: { finish?: () => void; start?: () => void } = {}
    // oxlint-disable-next-line promise/avoid-new -- Control worker completion without timing-dependent sleeps.
    const pending = new Promise<void>(resolve => {
      gates.finish = resolve
    })
    // oxlint-disable-next-line promise/avoid-new -- Observe when the in-flight worker starts.
    const started = new Promise<void>(resolve => {
      gates.start = resolve
    })
    const calls: number[] = []
    const result = runWithConcurrency([0, 1, 2], 2, async value => {
      calls.push(value)
      // oxlint-disable-next-line vitest/no-conditional-in-test -- Simulate independent worker outcomes.
      if (value === 0) {
        throw error
      }
      gates.start?.()
      await pending
      return value
    })
    const onSettled = vi.fn()
    async function observe(): Promise<unknown> {
      try {
        return await result
      } catch (caughtError) {
        return caughtError
      } finally {
        onSettled()
      }
    }
    const observed = observe()
    await started
    expect(onSettled).not.toHaveBeenCalled()
    gates.finish?.()
    await expect(observed).resolves.toBe(error)
    expect(calls).toStrictEqual([0, 1])
  })

  it.each([
    { failFast: false, expected: [0, 2] },
    { failFast: true, expected: [0] },
  ])('allows explicit error handling with failFast=$failFast', async ({ failFast, expected }) => {
    const error = new Error('handled failure')
    const onError = vi.fn()
    const result = await runWithConcurrency(
      [0, 1, 2],
      1,
      async value => {
        // oxlint-disable-next-line vitest/no-conditional-in-test -- Simulate a failing item in a batch.
        if (value === 1) {
          throw error
        }
        return value
      },
      { failFast, onError },
    )
    expect(result).toStrictEqual(expected)
    expect(onError).toHaveBeenCalledExactlyOnceWith(error, 1, 1)
  })

  it('propagates errors thrown by an error handler', async () => {
    const error = new Error('error handler failed')
    await expect(
      runWithConcurrency(
        [1],
        1,
        async () => {
          throw new Error('worker failed')
        },
        {
          onError: () => {
            throw error
          },
        },
      ),
    ).rejects.toBe(error)
  })

  it('keeps valid falsy worker results', async () => {
    const outputs: (number | boolean)[] = [0, false, 0]
    const values = await runWithConcurrency([0, 1, 2], 2, async (_, index) => outputs[index]!)

    expect(values).toStrictEqual([0, false, 0])
  })
})
