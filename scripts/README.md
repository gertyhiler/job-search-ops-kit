# Scripts

Scripts stay deterministic and are split into two groups:

- source-repo validation/privacy scripts;
- operator bundle build/install/update helpers.

## Current Scripts

- `privacy-guard.mjs` — scans tracked files / staged diffs for personal data and secret-like assignments.
- `validate-foundation.mjs` — validates fixtures, docs, and the current source/runtime contract.
- `build-operator.ts` — assembles the runtime-only operator bundle.
- `install-operator.ts` — installs the bundle into the isolated operator app roots.
- `update-operator.ts` — stages and updates an existing install with rollback to `job-search.previous`.
