# AGENTS

Agent working guide for this repository.

## Project Snapshot

- Node ESM TypeScript CLI for configuring npm Trusted Publisher relationships across single-package and monorepo setups.
- Main user-facing entrypoints are the CLI in [src/cli.ts](src/cli.ts) and the programmatic API in [src/node-api.ts](src/node-api.ts).
- Start with [README.md](README.md) for feature-level behavior and option semantics.

## Essential Commands

- Install deps: `pnpm install`
- Build: `pnpm run build`
- Dev watch build: `pnpm run dev`
- Test: `pnpm run test`
- Typecheck: `pnpm run typecheck`
- Lint: `pnpm run lint`
- Format check: `pnpm run format:check`
- Full pre-release gate: `pnpm run release:check`

## Code Map

- CLI command wiring and option surface: [src/cli.ts](src/cli.ts)
- Public exports: [src/index.ts](src/index.ts)
- Node API wrappers: [src/node-api.ts](src/node-api.ts)
- Command implementations: [src/commands/setup.ts](src/commands/setup.ts), [src/commands/list.ts](src/commands/list.ts), [src/commands/verify.ts](src/commands/verify.ts), [src/commands/revoke.ts](src/commands/revoke.ts)
- Core domain/types/provider claim builders: [src/core/types.ts](src/core/types.ts), [src/core/providers.ts](src/core/providers.ts)
- Config loading and defaults: [src/core/config.ts](src/core/config.ts), [src/core/constants.ts](src/core/constants.ts)
- HTTP/retry/rate-limit behavior: [src/core/client.ts](src/core/client.ts)
- Package discovery logic: [src/core/discovery.ts](src/core/discovery.ts)
- Reporting/output behavior: [src/core/reporter.ts](src/core/reporter.ts)

## Repository Conventions

- ESM-first project (`"type": "module"`) with strict TypeScript config in [tsconfig.json](tsconfig.json).
- Bundling uses tsdown and API snapshot generation via tsnapi plugin in [tsdown.config.ts](tsdown.config.ts).
- Lint/format stack is Oxlint + Oxfmt (not ESLint/Prettier), configured in [.oxlintrc.jsonc](.oxlintrc.jsonc) and [.oxfmtrc.jsonc](.oxfmtrc.jsonc).
- Tests are Vitest-based and heavily mock `fetch`; see [tests/commands.test.ts](tests/commands.test.ts) and [tests/node-api.test.ts](tests/node-api.test.ts).

## Implementation Expectations For Agents

- Keep provider-specific claim behavior aligned with discriminated provider types in [src/core/types.ts](src/core/types.ts) and claim construction in [src/core/providers.ts](src/core/providers.ts).
- Preserve CLI option names and compatibility in [src/cli.ts](src/cli.ts) when adding config fields.
- Keep config precedence predictable: file/profile + CLI overrides via [src/core/config.ts](src/core/config.ts).
- Maintain retry and rate-limit semantics in [src/core/client.ts](src/core/client.ts), especially around 429/5xx and retry-after handling.
- Prefer small, targeted changes; avoid unrelated refactors.

## Validation Checklist Before Finishing

1. Run `pnpm run test` for behavior changes.
2. Run `pnpm run typecheck` for type-affecting edits.
3. Run `pnpm run lint` and `pnpm run format:check` before finalizing.
4. If public API surface changed, verify snapshots in [**snapshots**/tsnapi](__snapshots__/tsnapi).

## Useful References

- Product behavior and CLI usage examples: [README.md](README.md)
- CI pipeline expectations: [.github/workflows](.github/workflows)

## Notes

- No prior local session friction patterns were found in chronicle history for this repository.
- Use `/chronicle improve` periodically to refine these instructions from real session friction.
