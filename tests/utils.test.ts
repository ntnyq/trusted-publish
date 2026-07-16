import { describe, expect, it } from 'vitest'
import { runWithConcurrency } from '../src/utils'

describe('concurrency helper', () => {
  it('keeps valid falsy worker results', async () => {
    const outputs: (number | boolean)[] = [0, false, 0]
    const values = await runWithConcurrency(
      [0, 1, 2],
      2,
      async (_, index) => outputs[index]!,
    )

    expect(values).toStrictEqual([0, false, 0])
  })
})
