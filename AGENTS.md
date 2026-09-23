# Repository Guidelines

## Project Structure & Module Organization

`trusted-publish` provides a CLI and Node API for managing npm trusted publishers.

- `src/cli.ts` and `src/cli-options.ts` handle CLI registration and options; `bin.mjs` is the executable launcher.
- `src/node-api.ts` implements the programmatic API; `src/index.ts` defines public exports.
- `src/commands/` implements setup/plan, list, verify, revoke, bootstrap, and doctor operations.
- `src/core/` contains npm authentication, configuration, package discovery, registry access, provider payloads, workflow inspection, reporting, and shared types.
- `tests/` contains unit and command-flow tests. `__snapshots__/tsnapi/` tracks generated API snapshots.
- `dist/` is generated build output; `.github/workflows/` contains CI and release automation.

## Build, Test, and Development Commands

Use a Node.js version satisfying `package.json` engines and the pinned pnpm version.

- `pnpm install --frozen-lockfile`: install dependencies reproducibly.
- `pnpm build`: bundle with tsdown, generate declarations, and verify API snapshots. Set `UPDATE_SNAPSHOT=1` to update intentional API changes, then review the diff.
- `pnpm dev`: rebuild on source changes.
- `pnpm cli --help`: inspect the built CLI; build first.
- `pnpm cli bootstrap --remote-package @scope/pkg --dry-run`: preview a new placeholder without publishing.
- `pnpm cli doctor --remote-package @scope/pkg --json`: run read-only registry diagnostics.
- `pnpm cli:dry-run --provider github --repository owner/repo --workflow release.yml --allow-publish`: preview setup.
- `pnpm test`: run Vitest once; watch mode is disabled by default. Built CLI tests also compile the package and use a local mock registry.
- `pnpm test tests/commands.test.ts`: run a focused test file.
- `pnpm format`, `pnpm format:check`: apply or verify Oxfmt formatting.
- `pnpm lint`, `pnpm typecheck`: run Oxlint and TypeScript checks.

## Coding Style & Naming Conventions

Write strict TypeScript using ES modules. Follow two-space indentation, LF endings, single quotes, no semicolons, trailing commas, and a 100-column formatting width. Let Oxfmt organize imports. Use kebab-case filenames, camelCase functions and variables, PascalCase types, and uppercase snake_case shared constants. Use `import type` for type-only imports. Husky runs nano-staged formatting and lint fixes before commits.

## Testing Guidelines

Name tests `tests/<feature>.test.ts` and use Vitest `describe`/`it` blocks. Mock registry requests and use temporary workspace fixtures with cleanup. Cover changed behavior, including error handling and dry-run guarantees. No coverage threshold is configured. Review API snapshot changes after builds. CI builds and tests on Linux, Windows, and macOS with Node 22, 24, and 26.

## Commit & Pull Request Guidelines

Follow existing commit prefixes: `fix:`, `refactor:`, `docs:`, and `chore:`. Keep subjects short and imperative. PRs should explain the problem, resulting behavior, and validation performed; link related issues when applicable. Update README examples for CLI or API changes. Run formatting checks, lint, typecheck, build, and tests before requesting review.

## Security & Configuration

Keep npm credentials out of tracked files and test fixtures. Use `NPM_TOKEN` and `NPM_OTP` for local authentication. Preview setup with `--dry-run` before applying registry changes.

Bootstrap apply requires `--yes`; keep automated tests isolated from real npm publication. `setup --replace` is non-atomic; cover uncertain responses and restoration failures when changing that flow.
