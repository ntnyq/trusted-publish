import type { Options } from 'npm-profile'

declare module 'npm-profile' {
  /**
   * Completes npm's browser authentication challenge (exported since npm-profile 7).
   */
  export function webAuthOpener(
    opener: (url: string) => Promise<void>,
    authUrl: string,
    doneUrl: string,
    options: Options,
  ): Promise<{ token: string }>
}
