# 0001. Vite + React + TypeScript single page app with Tailwind v4 and shadcn/ui

**Date**: 2026-10-18
**Status**: In Progress

## Summary

The app starts as a plain React single page app (SPA, everything runs in the browser) built with Vite, written in TypeScript, styled with Tailwind CSS v4, and using shadcn/ui components on Radix primitives. Every package is installed on its latest stable version, managed with pnpm, and the app lives at the repo root. The scaffold holds only what is needed to run: no router, no backend, no extra libraries. The colors, fonts and theme from `docs/DESIGN.md` are wired in by the next feature, Design system integration.

## Context

> ⚠️ Premise note: `docs/DESIGN.md` was written for Next.js. It loads fonts with `next/font/google`, puts global styles in `app/globals.css`, sets `"rsc": true` in `components.json`, and uses `next-themes`. With a Vite SPA, each of these needs a small change: a different font loading method, `src/index.css`, `"rsc": false`, and a theme provider that works without Next. None of this blocks the scaffold. But the Design system integration feature (scope row 2) must make those changes and update DESIGN.md §5 so it describes the real project, or the doc and the code will drift apart.

This is a new project with no code yet. It is a cloud inventory and order management web app for small businesses (`docs/01-business-prd.md`). It is data heavy, used all day on desktops in an office, and also on phones on a warehouse floor (DESIGN.md §1 and §7). The engineer fixed four things up front: React, TypeScript, Tailwind CSS and shadcn/ui, all on their latest versions, with nothing beyond the bootstrap.

The design system (`docs/DESIGN.md`) is already decided and assumes Tailwind v4 with CSS variables and shadcn/ui on Radix primitives with Lucide icons. Whatever the scaffold produces has to accept that design without fighting it.

Database, auth, API shape and hosting are not part of this decision. The engineer chose to decide them later, when a feature first needs them. So this decision covers only the frontend skeleton.

If this is left undecided, the design system integration and every later screen have nothing to build on.

## Options considered

### Option 1: Vite + React SPA

Vite (a fast build tool and dev server) with React and TypeScript, using the official `react-ts` template. The app runs fully in the browser. Tailwind connects through its Vite plugin, and shadcn/ui has a dedicated Vite path.

**Pros**:
- The smallest moving part count. One build tool, no server runtime to run or host.
- Fastest dev server start and reload.
- Can be hosted as static files anywhere later.
- A good fit for an app that sits behind a login, where search engine indexing does not matter.

**Cons**:
- DESIGN.md §5 needs small changes (fonts, CSS path, `rsc`, theme provider).
- No server side yet. A backend or framework has to be chosen later.
- Routing, data loading and code splitting are added by hand when needed.

### Option 2: Next.js 16 (App Router)

A full React framework with routing, server rendering and React Server Components.

**Pros**:
- DESIGN.md drops in unchanged.
- Routing and a server side are built in.

**Cons**:
- Server rendering and server components add complexity that a login only business app does not need.
- Heavier dev server and a server runtime to host.
- Goes beyond "only the bootstrap" that the engineer asked for.

### Option 3: React Router 8 (framework mode)

Vite based, with file based routes and optional server rendering.

**Pros**:
- Keeps Vite, and adds routing from day one.

**Cons**:
- Adds routing and a server layer before any page needs them.
- The same DESIGN.md changes as Option 1, with more framework on top.

### Option 4: TanStack Start

A Vite based full stack framework with fully typed routes.

**Pros**:
- Strong type safety across routes and server functions.

**Cons**:
- Younger, and its APIs still change often. That is a maintenance risk for a long lived business app.
- Adds more than the bootstrap needs.

## Decision

**Chosen option**: Option 1: Vite + React SPA

Scaffold a Vite React + TypeScript app at the repo root with pnpm, with Tailwind CSS v4 through its Vite plugin and shadcn/ui on Radix with the `radix-vega` style. Use the latest stable version of every package.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`) · `vite` (`antfu/skills`, `.claude/skills/vite/`) · `react-best-practices` (`~/.claude/skills/react-best-practices/`) · `senior-frontend` (`~/.claude/skills/senior-frontend/`)

## Rationale

The engineer asked for React, not a framework, and for nothing beyond the bootstrap. The product is a logged in business tool, so it gets no benefit from server rendering or search engine indexing, which are the main reasons to pick Next.js or a framework mode. A Vite SPA is the least machinery that fully meets the stated forces. It is also the easiest to run and host, and the simplest to understand on a bad day.

The engineer weighed the main tradeoff directly. Next.js would have taken DESIGN.md as written, but it brings a server runtime and server components that this app does not need yet. Adapting four small items in DESIGN.md (fonts, CSS path, `rsc`, theme provider) is cheaper than carrying a framework for the life of the project. A backend can still be added later as its own decision, without undoing this one.

Radix is kept as the shadcn base because DESIGN.md names it and it is the most mature option. `radix-vega` is the current name for the classic shadcn look that DESIGN.md calls `new-york`, so the DESIGN.md overrides apply with the least friction. pnpm is already installed and keeps dependencies strict. The template's default linter, Oxlint, is kept because the engineer asked for nothing extra and tooling gets revisited by `/audit` later.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime (local) | Node.js 24 LTS (installed: v24.14.1) | Current long term support line, already on the machine. |
| Package manager | pnpm (latest; installed 11.1.1) | Already installed, fast, strict about undeclared dependencies. |
| Build tool / dev server | Vite (latest; 8.3.4 as of today), plain React + TypeScript template (the one `shadcn init --template vite` generates) | The lightest way to run React with TypeScript. No React Compiler, by the engineer's choice. |
| UI library | React (latest; 19.3.1 as of today) | Fixed by the engineer. |
| Language | TypeScript (latest; 7.0.2 as of today), strict mode as the template ships it | Fixed by the engineer. |
| Styling | Tailwind CSS v4 (latest; 4.3.3) through `@tailwindcss/vite`, CSS first config with no `tailwind.config` file | What DESIGN.md §5 assumes (`@import "tailwindcss"`, `@theme inline`). |
| Components | shadcn/ui via the `shadcn` CLI (latest; 4.22.0), base `radix`, style `radix-vega`, CSS variables on, icon library `lucide` | Matches DESIGN.md's Radix + Lucide choice and its closest style. |
| shadcn config | `components.json`: `tsx: true`, `rsc: false`, `tailwind.css: src/index.css`, `tailwind.config: ""`, `baseColor: neutral`, aliases `@/components`, `@/components/ui`, `@/lib/utils`, `@/hooks`, `@/lib` | Same aliases as DESIGN.md §5.1, adjusted for a SPA (no server components, CSS in `src/`). |
| Import alias | `@/*` maps to `./src/*` in `tsconfig.json`, `tsconfig.app.json` and `vite.config.ts` | Required by shadcn, and matches the DESIGN.md aliases. |
| Linter | Oxlint (the `create-vite` default for React) | Template default. Nothing extra. |
| Routing | None for now | One screen in the bootstrap. Decide when the first real page arrives. |
| Project location | Repo root (`package.json`, `src/`, `vite.config.ts` beside `docs/`) | One app, simplest layout. |
| Version control | Not set up by the scaffold | The engineer chose to handle git themselves. |
| Backend, database, auth, hosting | Deferred | Decided later, each when a feature first needs it. |

**What "latest" means here**: install with the `@latest` tag at scaffold time, so the versions above may move up a patch or minor version by then. The lockfile (`pnpm-lock.yaml`) records the exact versions the project uses from then on.

**Scaffold method**: create the app with the shadcn CLI, which builds a Vite React + TypeScript project with Tailwind v4 and the `@/` alias already wired: `pnpm dlx shadcn@latest init --base radix --preset vega --template vite --name zoho-inventory --no-monorepo -y`. Run it in a temporary folder outside the repo, then move the generated files into the repo root. The root already holds `docs/` and `.claude/` (plus `skills-lock.json`), and the scaffold must never overwrite or delete them. There is no git to undo a mistake, so back up `docs/`, `.claude/` and `skills-lock.json` first and confirm they are unchanged afterwards. If the generated project has no Oxlint, add `oxlint` as a dev dependency with a `"lint": "oxlint"` script, so the linter matches the table above.

**Scaffold settings** (decided, so the build does not have to guess):
- Package name `zoho-inventory`. Page `<title>` is `Inventory`. Remove the template's logos, favicon and demo assets.
- Placeholder screen: a single `h1` with the text `Inventory`, using no shadcn component.
- Keep everything `shadcn init` generates as is: `components.json`, `src/lib/utils.ts`, the CSS it writes, and the packages it installs (`clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`, `tw-animate-css`, `radix-ui`, `@types/node`, and any default font). Feature 2 replaces the theme and fonts, so they are not cleaned up here.
- Import alias: keep the template's own setup (`paths` in the tsconfig files plus `resolve.alias` in `vite.config.ts`). No extra alias plugin.
- Files: keep `.gitignore`. Delete the template `README.md`. Set the `packageManager` field in `package.json` to the pnpm version used. pnpm 11 blocks dependency install scripts by default, so approve only the ones the build needs (for example `esbuild`) and nothing else.
- Versions: caret ranges in `package.json` (newer minor and patch versions are allowed), `pnpm-lock.yaml` kept, and only the stable `latest` dist tag (no beta or canary).
- If TypeScript 7 breaks the template, the shadcn CLI or the build, or two packages need different peer versions: stop and ask the engineer. Do not quietly downgrade, because the engineer asked for latest versions.

**Scaffold boundary** (what the scaffold sub task must and must not do):
- Done when: `pnpm dev` serves the placeholder screen with no browser console errors, `pnpm build` and `pnpm lint` both exit 0, `pnpm exec tsc -p tsconfig.app.json --noEmit` passes, and `pnpm dlx shadcn@latest add <component>` drops a component into `src/components/ui/`.
- Must not: add DESIGN.md tokens, fonts, theme switching or custom Button variants. Those belong to feature 2, Design system integration.
- Must not: add a router, state library, data fetching library, form library, testing setup, or any package beyond those listed here.

## Consequences

**Positive**:
- Very small surface: one build tool, no server to run, quick to start and understand.
- Design system integration can start right after, on a clean Tailwind v4 and shadcn base.
- Static output can be hosted almost anywhere once hosting is decided.

**Negative / tradeoffs**:
- DESIGN.md §5 (fonts, `app/globals.css`, `rsc: true`, `next-themes`) no longer matches the project exactly. Feature 2 must adapt and update it.
- Being on the newest major versions (TypeScript 7, Vite 8, React Router 8 later) means some ecosystem plugins may lag behind for a while. A plugin that does not support TypeScript 7 yet is the most likely friction.
- With no backend chosen, any feature that needs data will first need its own `/architect` decision.
- Without git, later skills that read the diff (`/check`, `/sync`, `/document`) will have less to work with until a repo is set up.

**Neutral**:
- Oxlint instead of ESLint means some ESLint only plugins are not available. `/audit` can revisit this.
- No React Compiler. It can be turned on later without restructuring.

## Follow-up

- [ ] Design system integration (scope row 2) adapts DESIGN.md §5 for Vite: font loading, `src/index.css`, `rsc: false`, a theme provider without `next-themes` (or `next-themes` used outside Next), and the shadcn `--pointer` option for `cursor-pointer`. Update DESIGN.md to match.
- [ ] Decide the backend, database and auth with `/architect` before the first data backed feature.
- [ ] Decide routing when the second screen arrives.
- [ ] No root `AGENTS.md` exists yet. After the scaffold, `/audit` can capture the stack and conventions. The `shadcn`, `vite`, `react-best-practices` and `senior-frontend` skills are project wide and belong in its `## Agent skills` section.
- [ ] The official shadcn MCP server (live registry access) was deferred. Connect it once the project exists: `pnpm dlx shadcn@latest mcp init --client claude`.
- [ ] Feature 2 can follow the `shadcn` skill's `design-system.md` guide (restyling shadcn from a `DESIGN.md`).
