# Repo Upgrader

Repo Upgrader is an MVP modernization agent for repeatable, auditable React migrations. It scans a repository, explains the proposed work, creates a checkpoint, applies deterministic transforms, runs the project's own quality gates, and writes a machine-readable report.

The first production path is **Create React App → Vite**. A deliberately gated **React → Next.js** planner establishes the extension point without pretending that routing, rendering, and data-fetching semantics can be migrated safely by a blind codemod.

## What the MVP does

- Detects CRA using multiple repository signals and inventories dependencies, scripts, entrypoints, environment-variable usage, and package manager.
- Classifies migration risk and blocks custom webpack override stacks unless an operator explicitly uses `--force`.
- Produces a structured, reviewable migration plan before changing files.
- Replaces `react-scripts`, creates Vite configuration and HTML entry, updates scripts, and converts `REACT_APP_*` access to `import.meta.env.VITE_*`.
- Migrates CRA's Jest command to Vitest/jsdom, carries forward `setupTests`, and renames public `.env` contracts while leaving secrets untouched.
- Saves a byte-for-byte checkpoint outside the scanned file set before mutation.
- Runs dependency installation, build, test, and lint when those scripts exist.
- Can automatically roll back failed migrations or restore any checkpoint later.
- Emits versioned JSON scans, plans, and migration reports for CI, dashboards, or a future hosted control plane.
- Runs verification with sanitized environment variables, per-command timeouts, bounded output, fail-fast checks, and secret redaction.
- Optionally verifies inside a resource-limited Docker container with no network access after dependency installation.
- Supports up to three deterministic repair attempts and records every recipe and verification run in the report.

## Requirements

- Node.js 18 or newer
- The target application's package manager available on `PATH`

No installation is needed while developing this repository:

```bash
node bin/repo-upgrader.js --help
```

To install the CLI globally from a checkout:

```bash
npm install -g .
repo-upgrader --help
```

## Safe workflow

Start with a scan and plan:

```bash
repo-upgrader scan --repo /path/to/legacy-react-app --out scan.json
repo-upgrader plan --repo /path/to/legacy-react-app --target vite --out plan.json
```

Run the migration and automatically restore the original files if verification fails:

```bash
repo-upgrader migrate \
  --repo /path/to/legacy-react-app \
  --target vite \
  --rollback-on-failure
```

High-risk repositories are stopped before mutation. After reviewing the JSON findings, an operator can deliberately override the gate with `--force`.

For untrusted customer repositories, run verification in Docker and allow a bounded repair pass:

```bash
repo-upgrader migrate \
  --repo /path/to/customer-app \
  --executor docker \
  --timeout-ms 600000 \
  --max-repair-attempts 2 \
  --rollback-on-failure
```

Docker verification uses a disposable Node 20 container, a 2 GB memory limit, two CPUs, a PID limit, and no network for build/test/lint. Dependency installation receives network access and no host secrets are forwarded. Docker must be installed and running.

For an offline transform, skip installation. Build/test/lint still run against already installed dependencies:

```bash
repo-upgrader migrate --repo /path/to/app --skip-install
```

Restore the latest checkpoint:

```bash
repo-upgrader rollback --repo /path/to/app
```

Migration reports are written to `.modernizer/reports/<checkpoint-id>.json`. Checkpoints live at `.modernizer/checkpoints/<checkpoint-id>/`. Add `.modernizer/` to the target repository's ignore file if reports should remain local.

## Architecture

```text
CLI
 ├─ Scanner       repository facts and capability detection
 ├─ Planner       versioned plan, preconditions, verification contract
 ├─ Checkpoint    byte-for-byte backup and rollback
 ├─ Transformer   deterministic migration-pack implementation
 ├─ Verifier      install/build/test/lint subprocess loop
 └─ Reporter      versioned JSON evidence for every run
```

Each target migration is intended to become a migration pack with four contracts: detection, planning, transformation, and verification. CRA → Vite implements that contract today. React → Next.js currently returns a `foundation-only` plan because safe automation requires route discovery, SSR compatibility classification, browser/API boundary detection, and behavioral tests.

## Current limits

- The Vite pack covers conventional CRA layouts and entrypoints. Custom webpack overrides are blocked; service workers and proxy middleware are surfaced as warnings for explicit review.
- Environment variable references are converted in JavaScript and TypeScript source, but `.env` key renaming is left explicit to avoid changing deployment contracts silently.
- Repair is intentionally deterministic and allowlisted. It does not yet perform model-generated code edits; unsupported failures stop and remain visible in the report.
- Checkpoints intentionally exclude generated directories, Git metadata, dependencies, and `.modernizer` itself.

## Development

```bash
npm test
npm run lint
npm run build
```

The test suite uses temporary CRA fixtures and does not require network access.

## Hosted job API

Version 0.4 adds a dependency-free service foundation with durable job state, authentication, bounded worker concurrency, GitHub webhook verification, and health/status endpoints.

```bash
export MODERNIZER_API_TOKEN='replace-with-a-long-random-token'
export MODERNIZER_WEBHOOK_SECRET='github-webhook-secret'
export MODERNIZER_ALLOWED_REPO_ROOT='/srv/modernizer/repositories'
repo-upgrader serve --host 127.0.0.1 --port 8787
```

Submit and inspect a job:

```bash
curl -X POST http://127.0.0.1:8787/v1/jobs \
  -H "Authorization: Bearer $MODERNIZER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"repository":{"fullName":"owner/repository"},"target":"vite"}'

curl http://127.0.0.1:8787/v1/jobs/JOB_ID \
  -H "Authorization: Bearer $MODERNIZER_API_TOKEN"
```

`GET /healthz` is unauthenticated for load balancers. API jobs require bearer authentication. GitHub `repository_dispatch` webhooks require an exact `X-Hub-Signature-256` HMAC signature. State is persisted atomically with owner-only file permissions.

GitHub repository jobs currently transition to `awaiting-github-app`. The service deliberately does not accept repository tokens in API payloads. The next provider adapter must exchange a signed GitHub App JWT for a short-lived installation token, clone into a disposable workspace, push the migration branch, and open the PR.

## Product roadmap

1. Expand CRA recipes: proxies, service workers, SVG imports, Jest-to-Vitest, path aliases, and `.env` contract assistance.
2. Add Git-aware checkpoints and PR evidence (commits per migration phase, diff summaries, risk scoring).
3. Implement the React → Next.js analyzer and a gated App Router migration pack.
4. Expand the sandbox policy with read-only source mounts, disposable workspaces, and organization-specific egress rules.
5. Add a hosted API/worker model, GitHub App, billing, organization policies, and migration analytics.

## Security note

Verification executes package-manager scripts from the target repository. Treat repositories as untrusted and run the CLI inside an isolated container or disposable CI worker. A hosted version must enforce CPU, memory, network, filesystem, secret, and timeout policies.
