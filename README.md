# Cloud Inventory and Order Management

A cloud inventory and order management web app for small businesses: products and stock across locations, sales and purchase orders, payments, reordering and reports. The backend is **SELISE Blocks only** (no custom server). The browser talks to Blocks through the official SDK, and project setup runs through the `blocks` CLI.

- Product requirements: [`docs/01-business-prd.md`](docs/01-business-prd.md)
- Database design: [`docs/02-database-design.md`](docs/02-database-design.md)
- Design system: [`docs/DESIGN.md`](docs/DESIGN.md)
- Feature plan and status: [`docs/scope/scope.md`](docs/scope/scope.md)
- Decisions (one spec per feature): [`docs/specs/`](docs/specs/)

---

## Contents

1. [Tech stack](#tech-stack)
2. [Getting started](#getting-started)
3. [Scripts](#scripts)
4. [Project structure](#project-structure)
5. [Feature status](#feature-status)
6. [How the app works on Blocks](#how-the-app-works-on-blocks)
7. [Working on this repo](#working-on-this-repo)
8. [Live checks](#live-checks)
9. [Known limits and open items](#known-limits-and-open-items)
10. [Security rules](#security-rules)

---

## Tech stack

| Area | Choice |
|---|---|
| UI | React 19, TypeScript 7, Vite 8 |
| Styling | Tailwind CSS 4, shadcn/ui components, tokens from `docs/DESIGN.md` (dark by default, light and system themes) |
| Backend | SELISE Blocks: IAM (sign in, roles, organizations, MFA), Data gateway (schemas, GraphQL, access rules), Storage, Mail |
| SDK | `@seliseblocks/client` (one shared client in `src/lib/blocks/client.ts`) |
| CLI | `@seliseblocks/cli-os` (`blocks`), 0.9.2 or newer |
| Tooling | pnpm, oxlint, Node 24 |

## Getting started

### 1. What you need

- Node 24 and pnpm
- The Blocks CLI: `npm install -g @seliseblocks/cli-os@latest`, then `blocks --version`
- Access to the Blocks project (tenant `Dfe830076882d4e28a313347efed8fbbe`)

### 2. Install

```bash
pnpm install
```

### 3. Environment

Copy `.env.example` to `.env` and fill it from the CLI. None of these values are secrets (the tenant key and OIDC client id are public identifiers).

```bash
blocks login
blocks use Dfe830076882d4e28a313347efed8fbbe
blocks projects get --json           # API URL, x-blocks-key, app domain
blocks auth oidc-clients list --json # OIDC URL, client id, scope
```

| Variable | Meaning |
|---|---|
| `VITE_BLOCKS_API_URL` | Blocks API base URL |
| `VITE_BLOCKS_X_BLOCKS_KEY` | Project key sent with every SDK call |
| `VITE_BLOCKS_APP_DOMAIN` | The app's domain registered in Blocks |
| `VITE_BLOCKS_OIDC_URL`, `VITE_BLOCKS_OIDC_CLIENT_ID`, `VITE_BLOCKS_OIDC_SCOPE` | Hosted login (OIDC) |
| `VITE_BLOCKS_DEV_HOST`, `VITE_BLOCKS_DEV_PORT` | Local HTTPS host and port for the dev server |

### 4. Local HTTPS

Blocks hosted login needs HTTPS on the project domain.

1. Map `VITE_BLOCKS_DEV_HOST` to `127.0.0.1` in your hosts file.
2. Create a local certificate: `pnpm cert`
3. Start the app: `pnpm dev`, then open `https://<VITE_BLOCKS_DEV_HOST>:<port>`.

### 5. First time Blocks setup (once per project)

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' pnpm blocks:setup   # OIDC client, roles, first admin
node scripts/blocks-data-deploy.mjs --dry-run                       # review schemas, rules and indexes
node scripts/blocks-data-deploy.mjs                                  # apply them
```

Every mutating step shows its dry run first and is safe to run again. The admin password is only passed to the CLI, never written anywhere. Change it after your first sign in.

### 6. Demo data (optional)

An admin can load starter lists and a sample catalog from the **Starter data** card on the home page. You can also seed from the terminal with a temporary machine client (delete it afterwards):

```bash
BLOCKS_SEED_CLIENT_ID=... BLOCKS_SEED_CLIENT_SECRET=... node scripts/seed-dummy.mjs
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server over HTTPS |
| `pnpm build` | Typecheck and production build |
| `pnpm typecheck` | TypeScript only |
| `pnpm lint` | oxlint |
| `pnpm preview` | Serve the production build |
| `pnpm cert` | Create the local HTTPS certificate |
| `pnpm blocks:setup` | One time Blocks project setup (`scripts/blocks-setup.sh`) |
| `node scripts/blocks-data-deploy.mjs [--dry-run]` | Push schemas, access rules and indexes from `blocks/data/` |
| `node scripts/seed-dummy.mjs` | Seed demo data with a machine client |
| `node scripts/workflows/build.mjs` | Generate workflow definitions into `blocks/workflows/` (not published, see limits) |

## Project structure

```
.
├── blocks/
│   ├── data/
│   │   ├── schemas/          # One JSON file per Blocks schema (entities and embedded types)
│   │   ├── rules.json        # Access rules per schema (signed in users only, 0 public)
│   │   └── indexes.json      # Indexes and unique keys per schema
│   └── workflows/            # Generated workflow definitions (not published yet)
├── docs/
│   ├── 01-business-prd.md    # What the product must do
│   ├── 02-database-design.md # Data model the specs build on
│   ├── DESIGN.md             # Visual design system
│   ├── scope/scope.md        # Feature list, order, status, checklists
│   └── specs/                # One decision record per feature (0001 to 0027)
├── scripts/
│   ├── blocks-setup.sh       # One time project setup
│   ├── blocks-data-deploy.mjs# Schema, rules and index deploy for CLI 0.9.x
│   ├── seed-dummy.mjs        # Terminal demo data seed
│   ├── generate-cert.mjs     # Local HTTPS certificate
│   ├── checks/               # Live checks against the real Blocks project
│   └── workflows/            # Workflow definition builder
├── src/
│   ├── app/                  # Shell, routes, guards, auth and current user providers
│   ├── components/           # Shared UI (shadcn/ui in components/ui, app parts in components/app)
│   ├── features/             # One folder per feature area (see below)
│   ├── hooks/                # Shared hooks (useResource)
│   └── lib/blocks/           # SDK client, auth session, typed data helpers
├── .agents/skills/           # Vendored Blocks skills (the source of truth for Blocks work)
├── AGENTS.md                 # Rules for working on Blocks in this repo
└── blocks.json               # Blocks workspace: project and data paths
```

### Feature folders (`src/features/`)

| Folder | What lives there |
|---|---|
| `auth` | Sign in, callback, not found |
| `team` | Team screen, roles, per person settings (`TeamMemberProfile`), Security (two step login), organization card |
| `settings` | Company profile, currencies and rates, numbering, lists and taxes, appearance, starter data |
| `products` | Products, categories, barcodes, units, vendor items |
| `locations` | Locations and bins |
| `stock` | Stock posting engine, quantities, stock screen, adjustments, transfers, counts, lots and serials |
| `partners` | Customers and vendors |
| `pricing` | Price lists, quantity breaks, shared price and tax module |
| `sales` | Sales orders, quotes, pick, pack, ship, returns, fulfillment queue, picking sessions |
| `purchasing` | Purchase orders, approval, receiving, landed cost |
| `payments` | Payments, balances, aging |
| `reorder` | Reorder points, reorder list, daily check, alerts, suggested points |
| `reports` | The 20 core reports, saved reports, CSV and print export |
| `dashboard` | Home page and widgets |

## Feature status

Status mirrors [`docs/scope/scope.md`](docs/scope/scope.md). The project runs at the **Alpha** tier: a feature is done after it's built and then verified on the running app (`/check verify`). "Built" below means the code is in and live checks pass where they exist. No feature is marked done yet, because the screens still need a click through.

| # | Feature | Built | Still open |
|---|---|---|---|
| 1 | Stack and scaffold | ✅ Built and verified | Mark done |
| 2 | Design system | ✅ | Screen check |
| 3 | Sign in, team and roles | Hosted login, team, 7 roles, organizations, two step login | Server side cost masking (see limits) |
| 4 | Company settings and lookups | ✅ | Screen check |
| 5 | Product catalog | Products, units, barcodes, vendor items | Images and P1 items |
| 6 | Locations and bins | Locations, bins, bins created on the fly | Plan limit, bin suggestions |
| 7 | Stock ledger and quantities | Posting with compare and set, ledger, balances, quantities, history | Monthly snapshot, scheduled repair, edit and delete lock rules |
| 8 | Adjustments, transfers, counts | All three, with cancel and retry | Transfer approval, cost adjustments |
| 9 | Lots, serials, traceability | Lots, serials, earliest expiry first, trace, capture on receive and pick | Expiry alerts |
| 10 | Customers, vendors, pricing | ✅ | Screen check |
| 11 | Sales orders and fulfillment | ✅ Including credit hold, rep restriction, fulfillment queue, picking sessions | Screen check |
| 12 | Purchasing and receiving | ✅ Including approval limits, last vendor, price list update | Screen check |
| 13 | Payments and balances | ✅ Balances kept up to date in the app | Screen check |
| 14 | Reordering and alerts | ✅ Daily check, alert email, suggested reorder point | Screen check, a live alert email to an active purchasing user |
| 15 | Reports and dashboards | ✅ 20 reports, saved reports, widgets (background export deferred) | Screen check |
| 16 to 24 | Documents, CSV, integrations, API, manufacturing, stockroom, portal, plans, mobile | Specs drafted | Design and build |

## How the app works on Blocks

### Sign in, roles and organizations

- People sign in through **Blocks hosted login** (OIDC). The session lives in a secure cookie.
- Seven role bundles: `admin`, `manager`, `sales`, `purchasing`, `warehouse`, `production`, `readonly`. Role checks in the app shape the UI; the gateway enforces real access.
- **Multi organization mode is on.** The first company lives in Blocks' built in `default` organization, where its users and records already are. Companies that sign up later get their own organization, and Settings → Company shows the current one, with a switcher when you belong to more than one.
- **Two step login** (authenticator app or email code, with backup codes) is set up per person under Settings → Security. Admins set the company rule there too.
- Per person settings Blocks doesn't hold (PO approval limit, own customers only, dashboard widgets) live in the `TeamMemberProfile` schema and are edited on the Team screen.

### Data

- Every schema is defined in `blocks/data/schemas/` and deployed with `scripts/blocks-data-deploy.mjs`. All entity schemas are readable and writable by signed in users only. The deploy prints an access summary, and public must be 0.
- `src/lib/blocks/data.ts` wraps the SDK: typed collections, filtered updates used as **compare and set**, and `dateFilter()` for date ranges.
- Orders are one document each (lines, steps and history inside), so an order change is a single atomic save guarded by a `revision` number.
- Stock never changes directly. Every movement goes through the posting engine in `src/features/stock/posting.ts`: an append only ledger plus balances updated with compare and set, so two people can never take the same last unit (spec 0026).

### Things Blocks does differently (learned the hard way)

| Behavior | What the code does |
|---|---|
| A date range filter only matches values written as `{ "$date": "..." }`; a plain ISO string silently matches nothing | Always build date filters with `dateFilter()` |
| An update silently ignores `null`, so a field can't be cleared that way | Text is cleared with `""`; "no approval limit" is stored as `-1`, "no credit limit" as `0`. Dates can't be cleared |
| Storage endpoints are granted only to built in roles by default | The 7 app roles were granted upload and get file, for background reports (now deferred), kept for a later server export |
| Workflows signed in with Blocks authentication wrote nothing in live tests | Balances and the reorder check run in the app for now (spec 0027); background reports are deferred |
| A file created by a machine client has no creator | Old background report files (feature deferred) are private to their creator, so a person's own downloads work, but a machine client's don't |

## Working on this repo

### The workflow

Every feature follows the same path, tracked in `docs/scope/scope.md`:

1. **Design it**: `/architect <feature>` writes or confirms the spec in `docs/specs/`.
2. **Build it**: `/develop <feature>` builds to the spec and ticks the milestones.
3. **Verify it**: `/check verify <feature>` runs the real app and checks every acceptance criterion.

When a build needs a decision the spec didn't make, it's recorded as an **Assumed** spec (for example 0025, 0026, 0027) so the choice lives in the repo. `/architect` ratifies it later.

### Blocks rules (from `AGENTS.md`)

- Use the `blocks` CLI or the `@seliseblocks/client` SDK. Never call the Blocks API with raw `fetch` or `curl`.
- Run every mutating CLI command with `--dry-run` first, then `--yes`.
- Read the vendored skill in `.agents/skills/<name>/SKILL.md` before Blocks work.
- Never print secrets, and never read the CLI's token or config storage.
- Machine clients for scripts are temporary. Delete them when you're done.

### Commits

- Plain, descriptive messages, with no AI tool attribution.
- `change.md` is a personal file and stays out of commits.

## Live checks

These run the app's own modules through Vite in Node, against the real Blocks project, using a temporary machine client. They create documents marked `Check:` and clean up after themselves.

| Script | Covers |
|---|---|
| `scripts/checks/posting-live.mjs` | Stock posting, compare and set, the last unit race |
| `scripts/checks/stock-docs-live.mjs` | Adjustments, transfers, counts |
| `scripts/checks/pricing.mjs` | Price and tax module |
| `scripts/checks/orders-live.mjs` | Sales, payments, purchasing, reordering, reports, ledger balance (10 checks) |
| `scripts/checks/p1-live.mjs` | Credit hold, picking sessions, queue, rep filter, approvals, last vendor, suggested point, daily run, export file (10 checks) |

```bash
BLOCKS_SEED_CLIENT_ID=... BLOCKS_SEED_CLIENT_SECRET=... node scripts/checks/orders-live.mjs
```

## Known limits and open items

- **Server side cost masking (spec 0003 AC-5):** a Blocks column policy hides a field for everyone. No rule found so far shows it again to some roles. Cost is hidden by role in the app until Blocks explains how a rule or DataProtection permission unmasks a field. The throwaway `CostProbe` schema stays in Blocks for that test.
- **Workflows:** definitions are generated in `blocks/workflows/` but not published, until Blocks confirms how a workflow should sign in.
- **In app push notifications:** the notifier needs a notification configuration whose channel values aren't published, so low stock alerts show on the home page and go by email instead.
- **Manufacture orders** from the reorder list wait for manufacturing (spec 0020).
- **Screen checks** for features 2 to 15 are still owed (`/check verify`).

## Security rules

- Every entity schema is limited to signed in users, with no public access.
- Server side access comes from Blocks roles and permissions. UI checks are only for display.
- Secrets (machine client secrets, passwords) are never committed, logged or written to files.
- Demo team members use `@example.com` addresses.
