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

Requires Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`.

## 🚀 Quick Start

```shell
trusted-publish setup --provider github --repository owner/repo --workflow release.yml --allow-publish
```

```shell
trusted-publish list --remote-package @scope/pkg --json
```

```shell
trusted-publish verify --provider gitlab --project group/project --file .gitlab-ci.yml --allow-publish
```

```shell
trusted-publish revoke --remote-package @scope/pkg --id trust-id
```

## 🧰 Commands

| Command   | Purpose                                                                 |
| --------- | ----------------------------------------------------------------------- |
| doctor    | Diagnose authentication, package visibility and configuration readiness |
| bootstrap | Publish a minimal placeholder for an unpublished package                |
| setup     | Create trusted publisher config for selected packages                   |
| list      | List complete entries, including IDs and claims                         |
| plan      | Preview exact payloads without network requests                         |
| verify    | Verify expected trust payload exists                                    |
| revoke    | Revoke trust config by id                                               |

## Bootstrap a new package

`setup` manages trust for an existing registry package. For a package that has never
been published, use `bootstrap` explicitly:

```shell
trusted-publish bootstrap --remote-package @scope/new-package --dry-run --keep-temp
trusted-publish bootstrap --remote-package @scope/new-package --initial-version 0.0.0 --access public --yes
trusted-publish setup --remote-package @scope/new-package --repository owner/repo --workflow release.yml --allow-publish
```

Bootstrap generates an isolated minimal package, checks existence before applying, and
publishes through the installed npm CLI with lifecycle scripts disabled. It skips existing
packages, refuses private local packages, and never modifies your source manifests.
The placeholder throws when imported and is published under the `bootstrap` dist-tag.
Select a version you will not need for a real release: npm does not allow version reuse.
Use `restricted` only for scoped packages with an appropriate npm account.

Dry-run performs no registry requests or publication. Temporary directories are cleaned
on success and failure unless `--keep-temp` is passed. Retained artifacts contain no npm
credentials. Results include the version/access and, for npmjs.org, the package settings
link. Bootstrap does not automatically configure OIDC; run setup afterwards or use that link.

| Bootstrap option              | Default  | Description                          |
| ----------------------------- | -------- | ------------------------------------ |
| `--initial-version <version>` | `0.0.0`  | Canonical semver placeholder version |
| `--access <access>`           | `public` | `public` or `restricted`             |
| `--keep-temp`                 | false    | Keep generated files for inspection  |
| `--yes`                       | false    | Required to actually publish         |

Node API: `bootstrapTrustedPublish(config, { version, access, keepTemp })` returns an exit
code; `bootstrapTrustedPublishDetailed` returns a report. Resolve config with
`command: 'bootstrap'`; claims and permissions are unnecessary. Publication runs serially
so npm authentication prompts cannot overlap. JSON/silent mode suppresses npm output;
provide credentials/OTP in advance in those modes.

## Replace, revoke in bulk, and resume

`setup --replace` explicitly permits replacing one conflicting trust entry. It revokes
then creates, so there is a period without a trusted publisher. If creation fails, it
reads registry state again: a matching replacement is treated as success; an empty
registry triggers an attempt to restore the previous payload; another configuration is
left untouched. Failures include the previous `entries`, `expected` payload and a
`recovery` message. Recovery is best effort and restored entries can have new IDs.
Preview with `setup --replace --dry-run`; this offline preview cannot show remote state.

```shell
trusted-publish setup --replace --profile release --dry-run
trusted-publish setup --replace --profile release
trusted-publish revoke --matching --profile release --dry-run
trusted-publish revoke --matching --profile release
trusted-publish setup --profile release --json > setup-results.json
trusted-publish setup --profile release --retry-from setup-results.json --json > retry-results.json
```

`revoke --matching` lists each package and revokes only its uniquely matching trust ID.
It requires expected provider claims and permissions. Its dry-run performs GET requests
to show the IDs but sends no DELETE requests. `--id` still selects one package and
cannot be combined with `--matching`.

`--retry-from` reads a previous JSON report and intersects failed package names with the
current local/remote selection and include/exclude filters. It never imports executable
config or credentials from a report. Skipped fail-fast packages are not retried by this
option; rerun the original selection to include them. No matching failed packages is a
successful no-op. Save each retry to a different file to avoid truncating the input report.

Node API: `setupTrustedPublishDetailed(config, { replace: true })`,
`revokeTrustedPublishDetailed(config, { matching: true })`, and the `retryFrom` config input
provide the same behavior. For matching revoke, resolve config with `command: 'verify'`
or supply a complete setup config.

## Diagnose readiness

```shell
trusted-publish doctor --remote-package @scope/pkg --json
trusted-publish doctor --workflow release.yml --allow-publish
```

Doctor only sends GET requests. It checks authenticated identity, package visibility and
trust entries. When expected claims are supplied it also validates configuration and
reports conflicts with both actual and expected payloads. HTTP 404 can mean an unpublished
package or a private package hidden from the current account. Reading an entry successfully
does not prove permission to change it. Warnings alone exit successfully; failed checks exit 1.

For local GitHub projects, doctor parses the workflow YAML and checks effective
`id-token: write` permission on jobs with direct npm/pnpm/yarn publish commands. Missing
files and missing OIDC permission fail; reusable workflows/release actions without a
direct publish command produce a warning for manual inspection. Remote package selectors
and other providers skip local workflow inspection.

GitHub/GitLab repository paths can be inferred from the root `package.json.repository`
when the provider matches and no explicit repository/project was supplied. GitHub shorthand,
HTTPS and SSH URLs are supported. Workflow selection remains explicit; GitHub requires
only the `.yml`/`.yaml` filename, not `.github/workflows/...`.

Node API: resolve with `command: 'doctor'`, then use `doctorTrustedPublish` for an exit
code or `doctorTrustedPublishDetailed` for results including typed `diagnostics`.

## Package selection

Workspace declarations take precedence over recursive glob discovery. npm, Yarn and Bun
use `package.json` workspaces; pnpm uses the YAML `packages` field (including inline arrays,
comments and negated patterns). Declared empty workspaces select no packages. Invalid
workspace metadata fails instead of silently widening the selection.

`--package` filters local discovered packages. `--remote-package @scope/pkg` bypasses local
discovery and operates on the named registry package; it cannot be combined with `--package`.
Include/exclude name filters still apply. `--package-json-globs` replaces the default
`**/package.json` pattern and disables workspace discovery unless `--from-workspaces` is
explicitly supplied. Use `--no-from-workspaces` to scan custom globs even in a workspace.
Set `discovery.fromWorkspaces: false` with custom `discovery.packageJsonGlobs` in config
files for the same behavior. `--workspace-globs` appends workspace patterns.

## 📝 CLI Reference (Complete)

The tables below document every CLI argument, including type, allowed values, whether it is required, default value, and description. Requiredness can vary by command and provider.

### General Arguments

| Argument                     | Type    | Allowed Values         | Required                         | Default                    | Description                                                |
| ---------------------------- | ------- | ---------------------- | -------------------------------- | -------------------------- | ---------------------------------------------------------- |
| --cwd <path>                 | string  | Any directory path     | No                               | Current working directory  | Sets the execution root directory                          |
| --config <path>              | string  | Any config file path   | No                               | Auto-discovery             | Specifies a config file path                               |
| --retry-from <path>          | string  | JSON report path       | No                               | None                       | Select only previously failed packages                     |
| --profile <name>             | string  | Key in config profiles | No                               | None                       | Uses a named config profile                                |
| --package <name>             | string  | npm package name       | No                               | None                       | Processes a single package only                            |
| --remote-package <name>      | string  | npm package name       | No                               | None                       | Select a remote package without a local manifest           |
| --include <names>            | string  | Comma-separated names  | No                               | Empty                      | Includes only the specified packages                       |
| --exclude <names>            | string  | Comma-separated names  | No                               | Empty                      | Excludes the specified packages                            |
| --ignores <globs>            | string  | Comma-separated globs  | No                               | Empty                      | Adds ignore patterns                                       |
| --workspace-globs <globs>    | string  | Comma-separated globs  | No                               | Empty                      | Adds workspace discovery patterns                          |
| --package-json-globs <globs> | string  | Comma-separated globs  | No                               | \*\*/package.json          | Replaces package.json scan patterns                        |
| --from-workspaces            | boolean | true/false             | No                               | true                       | Enables workspace-based discovery                          |
| --from-globs                 | boolean | true/false             | No                               | true                       | Enables glob fallback without workspaces                   |
| --include-private            | boolean | true/false             | No                               | false                      | Includes private packages                                  |
| --concurrency <n>            | number  | >= 1                   | No                               | 4                          | Number of concurrent package tasks                         |
| --fail-fast                  | boolean | true/false             | No                               | false                      | Stops scheduling new tasks after first error               |
| --max-retries <n>            | number  | >= 0                   | No                               | 2                          | Retry count for 429/5xx responses                          |
| --retry-delay-ms <n>         | number  | >= 0                   | No                               | 1200                       | Base retry delay in milliseconds                           |
| --max-retry-delay-ms <n>     | number  | >= 0                   | No                               | 8000                       | Maximum retry delay in milliseconds                        |
| --rate-limit-ms <n>          | number  | >= 0                   | No                               | 0                          | Minimum spacing for mutation requests                      |
| --request-timeout-ms <n>     | number  | >= 0                   | No                               | 30000                      | Per-request timeout in milliseconds                        |
| --dry-run                    | boolean | true/false             | No                               | false                      | Preview mode, does not apply changes                       |
| --json                       | boolean | true/false             | No                               | false                      | Outputs JSON result format                                 |
| --silent                     | boolean | true/false             | No                               | false                      | Suppresses normal logs                                     |
| --verbose                    | boolean | true/false             | No                               | false                      | Enables verbose logs                                       |
| --yes                        | boolean | true/false             | No                               | false                      | Confirms bootstrap publication; setup/revoke do not prompt |
| --registry <url>             | string  | Valid URL              | No                               | https://registry.npmjs.org | npm registry endpoint                                      |
| --token <token>              | string  | npm token              | Recommended for setup/revoke     | None                       | Auth token                                                 |
| --otp <otp>                  | string  | OTP string             | Recommended when 2FA is required | None                       | npm 2FA OTP                                                |

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

Setup, plan and verify require provider claims and at least one permission from CLI flags or config.
List and revoke by ID need neither claims nor permissions. Revoke with `--matching` requires both. Revoke by ID requires one selected package.

### Setup and Revoke Arguments

| Argument     | Command | Default | Description                                                           |
| ------------ | ------- | ------- | --------------------------------------------------------------------- |
| `--replace`  | setup   | false   | Revoke then recreate a conflicting trust; attempt recovery on failure |
| `--id <id>`  | revoke  | None    | Revoke one ID for one selected package                                |
| `--matching` | revoke  | false   | Find and revoke each selected package's matching ID                   |

Revoke requires exactly one of `--id` or `--matching`.

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

### Structured reports and plans

The existing `setupTrustedPublish`, `listTrustedPublish`, `verifyTrustedPublish` and
`revokeTrustedPublish` functions still return numeric exit codes. Their `*Detailed`
variants return `{ exitCode, summary, results }`, including entries, trust IDs and
expected payloads where applicable. CLI `--json` prints `{ summary, results }`.

```ts
const config = await resolveTrustedPublishConfig({
  command: 'list',
  remotePackage: '@scope/pkg',
  silent: true,
})
const report = await listTrustedPublishDetailed(config)
console.log(report.results[0]?.entries)
```

Import `listTrustedPublishDetailed` from `trusted-publish`. Use `command: 'revoke'` when
resolving config to revoke an entry without provider claims. Config resolution defaults
to `command: 'setup'` for compatibility.

`trusted-publish plan` is an offline setup preview, equivalent to `setup --dry-run`.
Both show the complete intended claims and permissions for each selected package and
make no registry requests. Setup conflicts and verify mismatches include `entries` and
`expected` for comparison. `--verbose` also prints selected manifest paths.

## 🔁 Retry, Rate Limiting, and Fail-Fast

- Automatically retries on HTTP 429 and 5xx
- Prefers retry-after response header when available
- Uses exponential backoff capped by max-retry-delay-ms
- rate-limit-ms controls spacing between mutation requests
- fail-fast stops scheduling new tasks after first failure
- request-timeout-ms covers response headers and the complete body, including error responses

## 🔐 Auth Notes

Credentials saved by `npm login` are loaded using npm's configuration loader (project,
user and global `.npmrc`, including environment interpolation). Registry-scoped tokens
are selected for the configured registry. Token precedence is `--token`, `NPM_TOKEN`,
trusted-publish config, then npm config. Registry precedence is CLI, profile, config,
then npm config. OTP can be supplied through `--otp` or `NPM_OTP` on **all** operations,
including list and verify.

In an interactive terminal, an OTP challenge prompts for a code or opens npm's browser
2FA page and retries once. Concurrent requests share the in-flight authentication.
`--json`, `--silent` and noninteractive usage require an OTP or a Node API
`authenticate(challenge)` callback; they never open an interactive prompt. Authentication
responses are held in memory, not written to disk. Do not put credentials in tracked config.

The account needs 2FA and write access, and the package must already exist. Tokens with
bypass 2FA and legacy username/password credentials are not supported by npm trust.
See [npm trust prerequisites](https://docs.npmjs.com/cli/v11/commands/npm-trust/#prerequisites).

## 📄 License

[MIT](./LICENSE) License © 2026-PRESENT [ntnyq](https://github.com/ntnyq)
