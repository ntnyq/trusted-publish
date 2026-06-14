# trusted-publish

[![CI](https://github.com/ntnyq/trusted-publish/workflows/CI/badge.svg)](https://github.com/ntnyq/trusted-publish/actions)
[![NPM VERSION](https://img.shields.io/npm/v/trusted-publish.svg)](https://www.npmjs.com/package/trusted-publish)
[![NPM DOWNLOADS](https://img.shields.io/npm/dy/trusted-publish.svg)](https://www.npmjs.com/package/trusted-publish)
[![LICENSE](https://img.shields.io/github/license/ntnyq/trusted-publish.svg)](https://github.com/ntnyq/trusted-publish/blob/main/LICENSE)

A CLI for configuring npm Trusted Publisher relationships in single-package and monorepo projects.

Supported providers:

- GitHub
- GitLab
- CircleCI

Supported package discovery:

- npm/yarn/pnpm workspaces
- bun workspaces
- tinyglobby-based package.json scan

## Features

- Setup trusted publisher in batch for one or many packages
- List existing trust configurations
- Verify expected configuration is present
- Revoke trust configuration by id
- Dry-run mode for previewing all changes
- Concurrency controls for batch operations
- 429 and 5xx retry strategy with backoff
- Configurable rate-limit interval for mutation requests
- Fail-fast mode for CI pipelines
- Config file + CLI override model
- Include/exclude/ignore filters
- Text and JSON output

## Install

```shell
npm install trusted-publish
```

```shell
yarn add trusted-publish
```

```shell
pnpm add trusted-publish
```

## Usage

```shell
trusted-publish setup --provider github --repository owner/repo --workflow release.yml --allow-publish
```

```shell
trusted-publish setup --provider github --repository owner/repo --workflow release.yml --allow-publish --concurrency 6 --max-retries 3 --retry-delay-ms 1500 --rate-limit-ms 250
```

```shell
trusted-publish list --provider github
```

```shell
trusted-publish verify --provider gitlab --project group/project --file .gitlab-ci.yml --allow-publish
```

```shell
NPM_TOKEN=xxxx trusted-publish verify --provider github --repository owner/repo --workflow release.yml --allow-publish
```

```shell
trusted-publish revoke --id <trust-id>
```

## Common Options

- --cwd <path>
- --config <path>
- --profile <name>
- --package <name>
- --include <a,b,c>
- --exclude <a,b,c>
- --ignores <glob,glob>
- --dry-run
- --concurrency <n>
- --fail-fast
- --max-retries <n>
- --retry-delay-ms <n>
- --max-retry-delay-ms <n>
- --rate-limit-ms <n>
- --json
- --registry <url>
- --token <npm-token>
- --otp <2fa-otp>

## Provider Options

GitHub:

- --provider github
- --repository owner/repo
- --workflow workflow.yml (or --file)
- --environment production (optional)

GitLab:

- --provider gitlab
- --project group/project
- --file .gitlab-ci.yml
- --environment production (optional)

CircleCI:

- --provider circleci
- --org-id <uuid>
- --project-id <uuid>
- --pipeline-definition-id <uuid>
- --vcs-origin provider/owner/repo
- --context-ids <uuid,uuid> (optional)

Permissions:

- --allow-publish
- --allow-stage-publish

## Config File

Create trusted-publish.config.ts in project root:

```ts
import type { TrustedPublishConfig } from 'trusted-publish'

const config: Partial<TrustedPublishConfig> = {
  provider: 'github',
  registry: 'https://registry.npmjs.org',
  include: [],
  exclude: [],
  ignores: ['**/fixtures/**'],
  claims: {
    repository: 'owner/repo',
    workflow: 'release.yml',
  },
  permissions: ['createPackage'],
  concurrency: 6,
  failFast: false,
  maxRetries: 3,
  retryDelayMs: 1500,
  maxRetryDelayMs: 8000,
  rateLimitMs: 250,
}

export default config
```

Then run:

```shell
trusted-publish setup --dry-run
```

## Retry and Fail-Fast Strategy

- Retries are applied on HTTP 429 and 5xx responses.
- Retry order uses exponential backoff, then clamps by max retry delay.
- If response has retry-after header, that delay is preferred.
- rate-limit-ms enforces minimum spacing between POST/DELETE calls.
- fail-fast stops scheduling new packages once one package fails.

## Auth Notes

- setup/revoke requires npm auth capable of trust endpoint operations.
- verify/list may return 401 if registry requires bearer token for trust reads.
- You can pass credentials via CLI flags or environment variables:
  - NPM_TOKEN
  - NPM_OTP

## License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
