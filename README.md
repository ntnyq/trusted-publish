# trusted-publish

[![CI](https://github.com/ntnyq/trusted-publish/workflows/CI/badge.svg)](https://github.com/ntnyq/trusted-publish/actions)
[![NPM VERSION](https://img.shields.io/npm/v/trusted-publish.svg)](https://www.npmjs.com/package/trusted-publish)
[![NPM DOWNLOADS](https://img.shields.io/npm/dy/trusted-publish.svg)](https://www.npmjs.com/package/trusted-publish)
[![LICENSE](https://img.shields.io/github/license/ntnyq/trusted-publish.svg)](https://github.com/ntnyq/trusted-publish/blob/main/LICENSE)

A CLI and Node API for configuring npm Trusted Publisher relationships in single-package and monorepo projects.

## ✨ Highlights

- 🚀 Batch setup, list, verify, and revoke trusted publisher relationships
- 🧭 Workspace discovery from npm/yarn/pnpm, bun, and glob scanning
- 🧪 Dry-run mode for safe previews
- ⚡ Built-in retry, backoff, and request timeout controls
- 🧱 Config file + CLI override model with optional profiles
- 📦 Programmatic Node API with typed helpers

## 📦 Installation

```shell
npm install trusted-publish
```

```shell
yarn add trusted-publish
```

```shell
pnpm add trusted-publish
```

## 🚀 Quick Start

```shell
trusted-publish setup --provider github --repository owner/repo --workflow release.yml --allow-publish
```

```shell
trusted-publish list --provider github --repository owner/repo --workflow release.yml
```

```shell
trusted-publish verify --provider gitlab --project group/project --file .gitlab-ci.yml --allow-publish
```

```shell
trusted-publish revoke --provider github --repository owner/repo --workflow release.yml --id trust-id
```

## 🧰 Commands

| Command | Purpose                                               |
| ------- | ----------------------------------------------------- |
| setup   | Create trusted publisher config for selected packages |
| list    | List trust config counts for selected packages        |
| verify  | Verify expected trust payload exists                  |
| revoke  | Revoke trust config by id                             |

## 📝 CLI Reference (Complete)

The tables below document every CLI argument, including type, allowed values, whether it is required, default value, and description. Requiredness can vary by command and provider.

### General Arguments

| Argument                     | Type    | Allowed Values         | Required                         | Default                    | Description                                  |
| ---------------------------- | ------- | ---------------------- | -------------------------------- | -------------------------- | -------------------------------------------- |
| --cwd <path>                 | string  | Any directory path     | No                               | Current working directory  | Sets the execution root directory            |
| --config <path>              | string  | Any config file path   | No                               | Auto-discovery             | Specifies a config file path                 |
| --profile <name>             | string  | Key in config profiles | No                               | None                       | Uses a named config profile                  |
| --package <name>             | string  | npm package name       | No                               | None                       | Processes a single package only              |
| --include <names>            | string  | Comma-separated names  | No                               | Empty                      | Includes only the specified packages         |
| --exclude <names>            | string  | Comma-separated names  | No                               | Empty                      | Excludes the specified packages              |
| --ignores <globs>            | string  | Comma-separated globs  | No                               | Empty                      | Adds ignore patterns                         |
| --workspace-globs <globs>    | string  | Comma-separated globs  | No                               | Empty                      | Adds workspace discovery patterns            |
| --package-json-globs <globs> | string  | Comma-separated globs  | No                               | \*\*/package.json          | package.json scan patterns                   |
| --from-workspaces            | boolean | true/false             | No                               | true                       | Enables workspace-based discovery            |
| --from-globs                 | boolean | true/false             | No                               | true                       | Enables glob-based discovery                 |
| --include-private            | boolean | true/false             | No                               | false                      | Includes private packages                    |
| --concurrency <n>            | number  | >= 1                   | No                               | 4                          | Number of concurrent package tasks           |
| --fail-fast                  | boolean | true/false             | No                               | false                      | Stops scheduling new tasks after first error |
| --max-retries <n>            | number  | >= 0                   | No                               | 2                          | Retry count for 429/5xx responses            |
| --retry-delay-ms <n>         | number  | >= 0                   | No                               | 1200                       | Base retry delay in milliseconds             |
| --max-retry-delay-ms <n>     | number  | >= 0                   | No                               | 8000                       | Maximum retry delay in milliseconds          |
| --rate-limit-ms <n>          | number  | >= 0                   | No                               | 0                          | Minimum spacing for mutation requests        |
| --request-timeout-ms <n>     | number  | >= 0                   | No                               | 30000                      | Per-request timeout in milliseconds          |
| --dry-run                    | boolean | true/false             | No                               | false                      | Preview mode, does not apply changes         |
| --json                       | boolean | true/false             | No                               | false                      | Outputs JSON result format                   |
| --silent                     | boolean | true/false             | No                               | false                      | Suppresses normal logs                       |
| --verbose                    | boolean | true/false             | No                               | false                      | Enables verbose logs                         |
| --yes                        | boolean | true/false             | No                               | false                      | Skips confirmations (reserved)               |
| --registry <url>             | string  | Valid URL              | No                               | https://registry.npmjs.org | npm registry endpoint                        |
| --token <token>              | string  | npm token              | Recommended for setup/revoke     | None                       | Auth token                                   |
| --otp <otp>                  | string  | OTP string             | Recommended when 2FA is required | None                       | npm 2FA OTP                                  |

### Provider Arguments

| Argument                      | Type   | Allowed Values           | Required                                           | Providers      | Description                      |
| ----------------------------- | ------ | ------------------------ | -------------------------------------------------- | -------------- | -------------------------------- |
| --provider <type>             | string | github, gitlab, circleci | Yes                                                | All            | Sets the CI provider             |
| --repository <value>          | string | owner/repo               | Yes for GitHub                                     | github         | GitHub repository identifier     |
| --workflow <file>             | string | Workflow file name       | Conditionally required for GitHub                  | github         | GitHub workflow file             |
| --project <value>             | string | group/project            | Yes for GitLab                                     | gitlab         | GitLab project identifier        |
| --file <file>                 | string | CI config file path      | Yes for GitLab, optional workflow alias for GitHub | github, gitlab | Provider config file path        |
| --environment <name>          | string | Any environment name     | No                                                 | github, gitlab | Protected environment (optional) |
| --org-id <id>                 | string | UUID/string              | Yes for CircleCI                                   | circleci       | CircleCI org id                  |
| --project-id <id>             | string | UUID/string              | Yes for CircleCI                                   | circleci       | CircleCI project id              |
| --pipeline-definition-id <id> | string | UUID/string              | Yes for CircleCI                                   | circleci       | CircleCI pipeline definition id  |
| --vcs-origin <value>          | string | provider/owner/repo      | Yes for CircleCI                                   | circleci       | CircleCI vcs origin              |
| --context-ids <ids>           | string | Comma-separated UUIDs    | No                                                 | circleci       | CircleCI context ids             |

### Permission Arguments

| Argument              | Type    | Allowed Values | Required | Default | Description              |
| --------------------- | ------- | -------------- | -------- | ------- | ------------------------ |
| --allow-publish       | boolean | true/false     | No       | false   | Adds createPackage       |
| --allow-stage-publish | boolean | true/false     | No       | false   | Adds createStagedPackage |

Setup and verify require at least one permission from CLI flags or config.

### Revoke-only Argument

| Argument  | Type   | Allowed Values | Required for | Default | Description                      |
| --------- | ------ | -------------- | ------------ | ------- | -------------------------------- |
| --id <id> | string | trust id       | revoke       | None    | Trust configuration id to revoke |

## ⚙️ Configuration (Config)

### Supported Config File Names

- trusted-publish.config.ts
- trusted-publish.config.mts
- trusted-publish.config.js
- trusted-publish.config.mjs
- trusted-publish.config.cjs
- trusted-publish.config.json

### Config Type

Use the exported Config type to describe your config file structure. It supports:

- Partial runtime fields, including partial nested discovery options
- An optional profiles field containing the same partial override shape

### defineConfig Helper

defineConfig is a zero-runtime-cost typing helper that:

- Returns exactly what you pass in
- Preserves TypeScript inference
- Improves editor autocomplete and validation in config files

### Recommended Config Example

```ts
import { defineConfig } from 'trusted-publish'

export default defineConfig({
  provider: 'github',
  registry: 'https://registry.npmjs.org',
  requestTimeoutMs: 30_000,
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
  profiles: {
    ci: {
      dryRun: true,
      failFast: true,
      concurrency: 2,
    },
  },
})
```

Using a profile:

```shell
trusted-publish setup --profile ci
```

## 🧪 Node API

trusted-publish also provides a Node API for scripts and platform integrations.

### Exported Node API Types

| Type                 | Description                                |
| -------------------- | ------------------------------------------ |
| NodeApiConfigInput   | Input type for resolveTrustedPublishConfig |
| NodeApiRuntimeConfig | Fully resolved runtime config type         |
| NodeApiPackageMeta   | Package discovery result type              |
| NodeApiTrustPayload  | Generated trusted publisher payload type   |
| NodeApiRevokeOptions | Revoke options type                        |

### End-to-end Node API Example

```ts
import {
  resolveTrustedPublishConfig,
  discoverTrustedPublishPackages,
  buildTrustedPublishPayload,
  setupTrustedPublish,
  listTrustedPublish,
  verifyTrustedPublish,
  revokeTrustedPublish,
  createTrustedPublishClient,
  type NodeApiConfigInput,
} from 'trusted-publish'

const input: NodeApiConfigInput = {
  provider: 'github',
  repository: 'owner/repo',
  workflow: 'release.yml',
  allowPublish: true,
  dryRun: true,
}

async function main() {
  const config = await resolveTrustedPublishConfig(input)

  const packages = await discoverTrustedPublishPackages(config)
  console.log(
    'packages',
    packages.map(p => p.name),
  )

  const payload = buildTrustedPublishPayload(config)
  console.log('payload', payload)

  const client = createTrustedPublishClient(config)
  const trustList = await client.list(packages[0]?.name || 'example')
  console.log('first package trust entries', trustList.length)

  await setupTrustedPublish(config)
  await listTrustedPublish(config)
  await verifyTrustedPublish(config)

  // If you need to revoke:
  // await revokeTrustedPublish(config, { id: 'trust-id' })
}

main()
```

## 🔁 Retry, Rate Limiting, and Fail-Fast

- Automatically retries on HTTP 429 and 5xx
- Prefers retry-after response header when available
- Uses exponential backoff capped by max-retry-delay-ms
- rate-limit-ms controls spacing between mutation requests
- fail-fast stops scheduling new tasks after first failure
- request-timeout-ms limits maximum wait time per request

## 🔐 Auth Notes

- setup/revoke usually require npm credentials with trust endpoint permissions
- list/verify may also require a token depending on registry policy
- You can pass credentials via --token and --otp
- You can also use environment variables: NPM_TOKEN and NPM_OTP

## 📄 License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
