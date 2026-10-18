# 0025 · Design system integration

**Status**: Assumed
**Date**: 2026-10-18
**Authorized by**: the engineer, during /develop ("1 to 5 and don't ask any questions")

## Owed decision
How `docs/DESIGN.md`, written for Next.js, maps onto the Vite SPA from spec 0001: font loading, the CSS file, the theme provider, and how far the Button variants replace shadcn's defaults.

## Assumption built on
- Tokens: every color, radius and chart token from DESIGN.md §2 and §4 lives in `src/index.css` as CSS variables, light in `:root`, dark in `.dark`, exposed through `@theme inline`, so `bg-primary`, `text-destructive-text`, `bg-elevated` and friends work as utilities.
- Fonts: self hosted with `@fontsource/dm-sans` (400 to 700) and `@fontsource/jetbrains-mono` (400, 500), imported in `src/index.css`, instead of `next/font/google`. No request to Google at runtime.
- Theme: the existing shadcn Vite `ThemeProvider` (`src/components/theme-provider.tsx`) instead of `next-themes`, with `defaultTheme="dark"`, choice saved in `localStorage` under `theme`. An inline script in `index.html` applies the saved theme before first paint. Dark, light and system are offered in the top bar and on Settings, Appearance.
- Reduced motion: the global rule from DESIGN.md §5.2.
- Button: DESIGN.md §6.1 variants and sizes replace the shadcn ones. `outline` is kept as an alias of `secondary` so generated shadcn components that use it keep working. Extra sizes `xs`, `icon-xs`, `icon-lg` kept for the same reason.
- Badge: DESIGN.md §2.3 status variants added (`success`, `info`, `neutral`, `warning`, `muted`).
- Other shadcn components are added only when a screen needs them.

## Code area
`src/index.css`, `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/theme-provider.tsx` (unchanged, used with dark default), `src/components/app/theme-menu.tsx`, `src/features/settings/AppearancePage.tsx`, `index.html`, `src/main.tsx`.

## Requirements
From the scope Done when:
- The app opens in dark by default and can switch to light or system, and the choice persists.
- Every token from DESIGN.md §2 and §4 is usable as a utility class.
- DM Sans and JetBrains Mono load.
- The Button renders all its variants and sizes with near black text on green.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect design system integration`
to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
