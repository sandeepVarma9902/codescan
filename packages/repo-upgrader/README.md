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
- Analyzes React → React Native conversion, maps DOM elements to native primitives, proposes Expo Router destinations, and attaches reviewable native recipes to browser/platform assumptions.

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

## React to React Native conversion

React → React Native is an explicit product target using Expo and Expo Router, which aligns with current React Native guidance to use a framework for new applications. Generate the conversion analysis with:

```bash
repo-upgrader plan \
  --repo /path/to/react-web-app \
  --target react-native \
  --out react-native-readiness.json
```

The analyzer inventories DOM elements and suggests primitives such as `div → View`, `p → Text`, `button → Pressable`, `input → TextInput`, and `img → Image`. It maps web paths to Expo Router files, identifies components for conversion, and selects native recipes for CSS, pointer interactions, storage, files, navigation, authentication, location, notifications, maps, charts, media, React Router, Material UI, Ant Design, and unknown components.

Selecting the React Native target approves the recommended recipe set. The migration creates an Expo SDK 57 and Expo Router workspace, targets React Native 0.86 and React 19.2.3, converts common JSX into a parallel `native-src` tree, generates NativeWind and platform-adapter foundations, installs selected Expo/native dependencies, creates native routes, and writes every decision to `migration-decisions.json` before verifying Android, iOS, and web export.

```bash
repo-upgrader migrate \
  --repo /path/to/safe-react-app \
  --target react-native \
  --executor docker \
  --rollback-on-failure
```

Common web features are recommendations rather than hard stops. If verification fails, the GitHub Actions path still opens a reviewable PR containing the partial conversion, TODO decisions, and structured evidence. A hard failure is reserved for cases where the transformation itself cannot preserve a usable project boundary; credentials, app-store signing, proprietary SDK configuration, and product-specific UX decisions remain explicit follow-up work.

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

### Organization policies and analytics

Version 1.3 adds account-level guardrails for enterprise customers. Policies can restrict repository owners, migration targets, execution environments, and repair attempts:

```bash
export MODERNIZER_ACCOUNT_POLICIES_JSON='[
  {
    "accountId":"customer-a",
    "allowedRepositories":["customer-a/*","shared/design-system"],
    "allowedTargets":["vite","nextjs"],
    "allowedExecutors":["docker"],
    "maxRepairAttempts":1
  }
]'
```

Policy enforcement occurs before a job is created or metered. Repository patterns support exact `owner/repository` values or an `owner/*` wildcard. Customers can query `GET /v1/analytics` for tenant-isolated totals, completion and success rates, average execution duration, and per-target outcomes. Administrators receive the aggregate view.

### Managed API keys

Version 1.4 removes the operational dependency on environment-only customer credentials. A bootstrap administrator can create managed keys through `POST /v1/api-keys`, list their safe metadata with `GET /v1/api-keys`, and revoke them with `DELETE /v1/api-keys/:id`.

```bash
curl -X POST http://127.0.0.1:8787/v1/api-keys \
  -H "Authorization: Bearer $MODERNIZER_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"accountId":"customer-a","plan":"starter","role":"member","name":"Production CI"}'
```

The complete `ru_live_...` secret is returned only by the creation response. Only its SHA-256 digest and a short display prefix are persisted. Generated keys contain 192 bits of randomness, revocation takes effect immediately, and list responses never expose credential digests. Environment-configured keys remain available as bootstrap or break-glass credentials.

### Audit trail

Version 1.5 records security and business events in an append-only JSON Lines audit trail. Credential creation and revocation, migration submissions and cancellations, and billing plan changes are recorded with actor, tenant, resource, timestamp, and safe metadata. Each record includes the previous record's hash, forming a SHA-256 chain that is verified at startup; modified or reordered history prevents the service from starting silently with compromised evidence.

Use `GET /v1/audit-events?limit=100&action=migration.submitted` to retrieve recent activity. Member credentials receive only their account's events, while administrators can review the aggregate trail. Fields with names such as key, token, secret, or authorization are removed before persistence.

### Outbound webhooks

Version 1.6 delivers migration lifecycle events to customer systems. Configure one or more tenant-owned HTTPS endpoints:

```bash
export MODERNIZER_OUTBOUND_WEBHOOKS_JSON='[
  {
    "accountId":"customer-a",
    "url":"https://example.com/webhooks/repo-upgrader",
    "secret":"replace-with-at-least-16-characters",
    "events":["migration.succeeded","migration.failed"]
  }
]'
```

Supported events are `migration.queued`, `migration.running`, `migration.succeeded`, `migration.failed`, and `migration.cancelled`. Deliveries include a unique ID and an `X-Repo-Upgrader-Signature` in `t=<unix timestamp>,v1=<HMAC-SHA256>` format, covering `<timestamp>.<exact body>`. Failed requests retry up to three times with exponential backoff. Final delivery outcomes are written to the audit trail without storing endpoint secrets or complete URLs.

### Production deployment

Version 1.7 adds a non-root OCI `Containerfile`, a hardened Compose example, unauthenticated liveness and readiness probes, and graceful process draining. Build and run from the package directory:

```bash
docker build -f Containerfile -t repo-upgrader:1.7.0 .
docker compose -f compose.example.yml up -d
```

`GET /healthz` reports process liveness and service version. `GET /readyz` reports whether the worker accepts new jobs along with active and queued counts. On `SIGTERM` or `SIGINT`, the service stops accepting work, allows active migrations up to 30 seconds to finish, closes HTTP connections, and returns a non-zero exit status when the drain deadline is exceeded. The container runs as the unprivileged Node user with all Linux capabilities removed by the Compose example.

### Customer control panel

Version 1.8 includes a responsive, dependency-free control panel at `/dashboard`. Customers connect with a managed API key stored only for the browser session, see monthly usage, plan, success rate, and migration totals, inspect recent job states, and launch CRA → Vite, React → Next.js, or React → React Native migrations. The UI is served by the same process and calls the tenant-isolated API, so it requires no separate frontend deployment or cross-origin credential configuration.

Version 1.9 adds live five-second refresh while migrations are active, a lifecycle timeline, safe cancellation for queued work, direct links to generated pull requests, failure details, and downloadable JSON verification reports. Reports are also available from `GET /v1/jobs/:id/report`; the endpoint returns `409` until evidence exists and preserves the same tenant ownership rules as job lookup.

### CRA compatibility recipes

Version 2.0 deepens the deterministic CRA → Vite pack. The scanner inventories TypeScript/JavaScript `paths`, CRA `ReactComponent` SVG imports, and conventional `setupProxy.js` routes. The transformer preserves aliases through `vite-tsconfig-paths`, converts SVG imports to `vite-plugin-svgr`'s `?react` contract, and translates recognized proxy routes into Vite `server.proxy` entries while retaining the source proxy file as migration evidence. Unrecognized proxy middleware and service-worker behavior remain visible for manual review rather than being silently discarded.

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

## Product status

The original MVP roadmap is implemented: deterministic CRA → Vite migration (including tests, aliases, SVG components, conventional proxies, environment contracts, and service-worker registration), gated React → Next.js App Router and React → Expo Router conversion, Git-aware delivery, verification and rollback, isolated execution, hosted workers, tenant controls, billing handoff, analytics, SDK/CLI access, and release automation. Remaining production work is deployment-specific: configure infrastructure, GitHub and Stripe accounts, secrets, DNS, monitoring destinations, and customer support processes.

## Production platform

Version 2.1 supports PostgreSQL job persistence and Redis-backed distributed execution when `DATABASE_URL` and `REDIS_URL` are configured. PostgreSQL creates indexed tenant, delivery, and idempotency records and recovers interrupted jobs safely. Redis uses pending and processing lists plus visibility leases, acknowledgements, bounded retries, and expired-lease recovery so multiple workers can share work without relying on process memory. Set `MODERNIZER_REPORT_BUCKET` (and optionally `S3_ENDPOINT`) to move full verification reports into encrypted S3-compatible object storage while PostgreSQL retains a compact reference and summary. `/metrics` exposes Prometheus job and worker gauges. The Compose example includes persistent PostgreSQL and append-only Redis services with health checks; local JSON and in-process queues remain the zero-infrastructure development fallback.

## Commercial customer experience

Version 2.2 adds tenant roles, GitHub App onboarding, Stripe customer-portal handoff, a published OpenAPI contract, a JavaScript SDK, and hosted CLI commands. Roles follow least privilege: viewers inspect results, operators submit and cancel migrations, admins manage credentials and integrations, owners additionally manage billing, and the bootstrap platform administrator can support all tenants. Tenant admins remain scoped to their own account.

Configure `GITHUB_APP_SLUG`, `MODERNIZER_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, and `MODERNIZER_DASHBOARD_URL`. An admin can call `GET /v1/integrations/github` for a short-lived, account-bound GitHub installation URL. An owner can call `POST /v1/billing/portal` to open Stripe's hosted portal when the billing webhook has associated a customer with the account. These endpoints create secure handoffs; they do not require payment or GitHub credentials in the browser.

The machine-readable API contract is available without authentication at `/openapi.json`. The package also exports `RepoUpgraderClient` from `sdk/index.js`:

```js
import { RepoUpgraderClient } from 'repo-upgrader/sdk';

const client = new RepoUpgraderClient({ baseUrl: process.env.REPO_UPGRADER_API_URL, apiKey: process.env.REPO_UPGRADER_API_KEY });
const job = await client.submit({ repository: { fullName: 'owner/repository' }, target: 'vite' });
```

The same hosted workflow is available from the CLI:

```bash
export REPO_UPGRADER_API_URL='https://upgrader.example.com'
export REPO_UPGRADER_API_KEY='ru_live_...'
repo-upgrader remote submit --github-repo owner/repository --target vite
repo-upgrader remote jobs
repo-upgrader remote usage
```

## Advanced migration and releases

Version 3.0 recognizes conventional CRA service-worker registration and replaces it with `vite-plugin-pwa` auto-update registration while retaining ambiguous custom workers for manual review. The existing gated Next.js compatibility bridge and Expo Router conversion remain conservative: unsupported browser behavior and interactive DOM semantics stop automatic mutation instead of creating deceptively broken output.

### Free GitHub Actions migration

The public demo serves a ready-to-use workflow at `/github-actions.yml`. Save it as `.github/workflows/repo-upgrader.yml` in the React repository, enable GitHub Actions to create pull requests under **Settings → Actions → General → Workflow permissions**, then run **Repo Upgrader** from the Actions tab and select `vite`, `nextjs`, or `react-native`. Choose `pull-request` to commit the migration to a feature branch and open a PR, or `download-zip` to keep the repository unchanged and receive the complete migrated project as a seven-day GitHub Actions artifact. GitHub performs the scan, checkpoint, deterministic transformation, dependency installation, and build/test/lint verification. No repository token is sent to the demo service.

### Uploaded project migration

The dashboard also accepts a single React project ZIP up to 10 MB compressed, 50 MB uncompressed, and 2,000 files. The public service validates every archive path, extracts into a disposable workspace, scans and transforms without installing dependencies or executing project scripts, embeds `repo-upgrader-report.json`, returns a migrated ZIP, and deletes the workspace. This is intentionally marked `transformed-unverified`; run the included project locally or use the GitHub Actions path for full build, test, and lint verification.

Run `npm run benchmark` to exercise a deterministic 100-component CRA fixture with a five-second scan, plan, and transform budget. Tagged releases named `repo-upgrader-v*` run tests, lint, build, benchmark, and package inspection; then publish npm provenance when `NPM_TOKEN` is configured and an immutable container to GitHub Container Registry. See `SECURITY.md` for disclosure and release requirements. Creating a version tag is intentionally a maintainer action because it publishes external artifacts.

## Security note

Verification executes package-manager scripts from the target repository. Treat repositories as untrusted and run the CLI inside an isolated container or disposable CI worker. A hosted version must enforce CPU, memory, network, filesystem, secret, and timeout policies.
