import { defineConfig } from 'tsdown'
import ApiSnapshot from 'tsnapi/rolldown'

export default defineConfig({
  clean: true,
  dts: {
    tsgo: true,
  },
  entry: ['src/index.ts', 'src/cli.ts'],
  platform: 'node',
  plugins: [ApiSnapshot()],
})
