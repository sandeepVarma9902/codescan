# Repo Upgrader

Repo Upgrader is an MVP modernization agent for repeatable, auditable React migrations. It scans a repository, explains the proposed work, creates a checkpoint, applies deterministic transforms, runs the project's own quality gates, and writes a machine-readable report.

The first production path is **Create React App → Vite**. The **React → Next.js** path performs deep readiness analysis and can create a conservative App Router compatibility bridge for high-readiness projects, while route-by-route server migration stays gated.

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
- Inventories React Router paths, proposes App Router destinations, detects client-only boundaries and SSR hazards, classifies data fetching, and scores React → Next.js readiness.
- Analyzes React → React Native conversion, maps DOM elements to native primitives, proposes Expo Router destinations, and blocks unsafe browser/platform assumptions.

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

Generate a gated React → Next.js readiness plan:

```bash
repo-upgrader plan \
  --repo /path/to/react-app \
  --target nextjs \
  --out nextjs-readiness.json
```

The plan maps paths such as `/users/:id` to `app/users/[id]/page`, identifies files requiring `'use client'`, flags browser APIs and global CSS placement, classifies effect-based data fetching, and lists approval gates.

For a high-readiness project, create the compatibility bridge:

```bash
repo-upgrader migrate \
  --repo /path/to/react-app \
  --target nextjs \
  --rollback-on-failure
```

The bridge upgrades to Next.js 16, React 19.2, and Node.js 20.9+, creates the root App Router layout, and hosts the existing SPA under a client-rendered optional catch-all route. This preserves behavior as an intermediate migration state. Medium, low, and blocked projects remain gated unless an operator reviews the findings and deliberately passes `--force`.

## React to React Native roadmap

React → React Native is an explicit product target using Expo and Expo Router, which aligns with current React Native guidance to use a framework for new applications. Generate the conversion analysis with:

```bash
repo-upgrader plan \
  --repo /path/to/react-web-app \
  --target react-native \
  --out react-native-readiness.json
```

The analyzer inventories DOM elements and suggests primitives such as `div → View`, `p → Text`, `button → Pressable`, `input → TextInput`, and `img → Image`. It maps web paths to Expo Router files, identifies components for conversion, flags CSS and desktop interactions, and blocks browser APIs, unsupported DOM elements, and web-only dependencies.

Version 1.0 enables conversion only when the analyzer finds safe structural and text components with no blockers or conversion warnings. It creates an Expo SDK 57 and Expo Router workspace, targets React Native 0.86 and React 19.2.3, converts supported JSX primitives into a parallel `native-src` tree, preserves reusable logic and relative imports, creates native routes, and verifies bundle export for Android, iOS, and web.

```bash
repo-upgrader migrate \
  --repo /path/to/safe-react-app \
  --target react-native \
  --executor docker \
  --rollback-on-failure
```

Interactive elements, forms, media, browser APIs, CSS-dependent components, React Router, unmapped DOM elements, and web-only UI libraries remain hard-gated for later behavior-aware recipes. `--force` does not bypass React Native conversion eligibility.

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

Each target migration is intended to become a migration pack with four contracts: detection, planning, transformation, and verification. CRA → Vite implements that contract. React → Next.js now implements analysis plus a verified compatibility-bridge transform; deeper server/client decomposition remains gated behind explicit route, rendering, data-fetching, and behavioral-test approvals.

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

For multi-tenant deployments, configure account-scoped API keys instead of the legacy administrator token:

```bash
export MODERNIZER_API_KEYS_JSON='[
  {"key":"rk_customer_a_long_random_value","accountId":"customer-a","plan":"starter"},
  {"key":"rk_customer_b_long_random_value","accountId":"customer-b","plan":"pro"}
]'
```

Keys are SHA-256 digested in memory after startup and are never persisted with jobs. Every job records its account and plan. Non-admin accounts can list, inspect, cancel, and meter only their own jobs; cross-account lookup returns `404` to avoid leaking identifiers.

Built-in entitlements provide a vendor-neutral billing boundary:

| Plan | Monthly migrations | Targets |
|---|---:|---|
| Free | 3 | CRA → Vite |
| Starter | 25 | CRA → Vite, React → Next.js |
| Pro | 100 | All targets including React Native |
| Enterprise | Unlimited | All targets |

Quota enforcement occurs after idempotency lookup, so a retried request returns its original job without consuming another unit. A future Stripe/Paddle adapter can update account-plan assignments without changing migration execution or tenant isolation.

### Billing lifecycle

Version 1.2 adds a provider-neutral subscription webhook compatible with Stripe-style subscription events. Configure the signing secret and point the provider at `POST /webhooks/billing`:

```bash
export MODERNIZER_BILLING_WEBHOOK_SECRET='whsec_replace_me'
```

The webhook accepts `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. Subscription metadata must contain `accountId` and `plan` (`free`, `starter`, `pro`, or `enterprise`). Signatures cover the exact request body and timestamp, expire after five minutes, and are compared in constant time. Applied event IDs are persisted for replay protection. Active subscription plans immediately override the API key's configured fallback plan; cancellation or an inactive subscription safely returns the account to Free.

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

Configure GitHub App delivery with:

```bash
export GITHUB_APP_ID='123456'
export GITHUB_APP_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
export MODERNIZER_WORK_ROOT='/srv/modernizer/work'
```

The GitHub App requires repository contents read/write and pull requests read/write permissions. Repository dispatch payloads supply the installation ID; the service signs a short-lived App JWT, exchanges it for an installation token, clones only the requested `owner/repository`, creates a `repo-upgrader/<target>-<job>` branch, runs the migration, pushes, opens the PR, and removes the workspace in a `finally` cleanup.

Repository credentials are never accepted in API payloads, written to disk, placed in clone URLs, or returned in reports. The installation token is passed to Git through a temporary `GIT_ASKPASS` helper and removed with the disposable workspace. When GitHub App configuration is absent, remote jobs transition safely to `awaiting-github-app`.

### Reliable submissions and operations

API clients should attach an `Idempotency-Key` of 8–128 letters, digits, dots, colons, underscores, or hyphens. Repeating a submission with the same key returns the original job instead of creating another migration or charge. GitHub deliveries are similarly deduplicated with `X-GitHub-Delivery`.

```bash
curl -X POST http://127.0.0.1:8787/v1/jobs \
  -H "Authorization: Bearer $MODERNIZER_API_TOKEN" \
  -H 'Idempotency-Key: customer-42-upgrade-001' \
  -H 'Content-Type: application/json' \
  -d '{"repository":{"fullName":"owner/repository","installationId":123},"target":"vite"}'

curl -H "Authorization: Bearer $MODERNIZER_API_TOKEN" \
  'http://127.0.0.1:8787/v1/jobs?status=succeeded&limit=25'

curl -H "Authorization: Bearer $MODERNIZER_API_TOKEN" \
  http://127.0.0.1:8787/v1/usage

curl -X DELETE -H "Authorization: Bearer $MODERNIZER_API_TOKEN" \
  http://127.0.0.1:8787/v1/jobs/JOB_ID
```

Queued jobs resume after a service restart. Jobs that were running during a crash become `interrupted` for manual reconciliation, preventing an unsafe automatic replay after a branch or PR may already have been created. Only queued or waiting jobs can be cancelled.

## Product roadmap

1. Expand CRA recipes: proxies, service workers, SVG imports, Jest-to-Vitest, path aliases, and `.env` contract assistance.
2. Add Git-aware checkpoints and PR evidence (commits per migration phase, diff summaries, risk scoring).
3. Implement the React → Next.js analyzer and a gated App Router migration pack.
4. Expand the sandbox policy with read-only source mounts, disposable workspaces, and organization-specific egress rules.
5. Add a hosted API/worker model, GitHub App, billing, organization policies, and migration analytics.

## Security note

Verification executes package-manager scripts from the target repository. Treat repositories as untrusted and run the CLI inside an isolated container or disposable CI worker. A hosted version must enforce CPU, memory, network, filesystem, secret, and timeout policies.
