# DESIGN.md — Green Deck for Inventory

Design system for the inventory & order-management web app described in
`01-business-prd.md`. Built on **Tailwind CSS v4 + shadcn/ui** (Radix primitives,
Lucide icons, Recharts via shadcn Charts).

**Inspiration:** [Green Deck](https://designmd.ai/chef/green-deck) by chef on designmd.ai — a dark-first,
high-energy green system originally made for an audio app. We keep its **identity**
(near-black surfaces, electric green accent, DM Sans, elevation by surface brightness,
pill buttons) and **re-engineer its behaviour** for a data-dense business tool used for
8 hours a day, on desktops in the office and phones on the warehouse floor.

---

## 0. What we changed from Green Deck, and why

| Green Deck (original) | This system | Reason |
|---|---|---|
| White text on green buttons | **Near-black text (`#0A0A0A`) on green** | White on `#1DB954` = **2.59:1** (fails WCAG AA). Black = **8.1:1** |
| Dark only, "never light backgrounds" | **Dark default + full light theme** | Warehouses have bright light & glare; printed docs; user choice. Dark stays default |
| Hover scales element 1.04× | **Color/surface change only** | Scale shifts layout in tables and lists; feels toy-like in a work tool |
| Uppercase, tracked button labels | **Sentence case, 500–600 weight** | Faster to scan; many buttons per screen; i18n friendly |
| 56px list rows | **44px default, 36px compact, 56px touch** | Data density for tables of SKUs and orders |
| "No borders to define containers" | **Surfaces first, but hairline dividers in tables and forms** | Rows and form fields need clear edges at high density |
| Error `#E22134` for text | **`#F15E6C` for error text, `#E22134` for fills** | `#E22134` on `#121212` = 4.02:1 (fails for small text) |
| `#535353` secondary control color | **Disabled/decorative only** | 2.44:1 — not readable as text |
| Persistent now-playing bar | **Contextual bottom action bar** (bulk actions, scan session, unsaved order) | Same "always-visible context" idea, business purpose |
| Hero 64px display | **Max 32px page title** | App, not marketing. No hero type inside the product |

---

## 1. Principles

1. **Data first, chrome last.** UI recedes into dark surfaces; numbers, names and statuses are the brightest things on screen.
2. **Green means "go".** Green is reserved for the primary action, active navigation, positive stock, and focus. Never for large fills or decoration.
3. **Status is never color-only.** Every status pairs color with a label and/or icon.
4. **One primary action per view.** One green button per screen region.
5. **Thumb-ready on the floor.** Any flow used in the warehouse (pick, receive, count, scan) works one-handed at 360px with 48px targets.
6. **Numbers are tabular.** Quantities and money use `tabular-nums`, right-aligned, consistent decimals.

---

## 2. Color tokens

### 2.1 Palette

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `background` | `#121212` | `#FAFAFA` | App canvas (Level 0) |
| `foreground` | `#FFFFFF` | `#0A0A0A` | Primary text, numbers |
| `card` | `#181818` | `#FFFFFF` | Cards, panels, table body (Level 1) |
| `popover` | `#282828` | `#FFFFFF` | Menus, popovers, combobox lists (Level 2) |
| `elevated` | `#333333` | `#FFFFFF` + shadow | Dialogs, sheets, bottom bar (Level 3) |
| `sidebar` | `#000000` | `#F4F4F5` | App sidebar |
| `primary` | `#1DB954` | `#15803D` | Primary buttons, active nav, focus ring, links |
| `primary-hover` | `#1ED760` | `#166534` | Hover for primary |
| `primary-foreground` | `#0A0A0A` | `#FFFFFF` | Text on primary (8.1:1 / 5.0:1) |
| `secondary` | `#282828` | `#F4F4F5` | Secondary buttons, chips |
| `muted` | `#1F1F1F` | `#F4F4F5` | Table header, zebra, skeletons |
| `muted-foreground` | `#A7A7A7` | `#52525B` | Metadata, helper text (7.8:1 / 7.7:1) |
| `accent` | `#282828` | `#F4F4F5` | Hover row / hover menu item |
| `border` | `#2A2A2A` | `#E4E4E7` | Dividers (decorative) |
| `input` | `#727272` | `#71717A` | Input/checkbox outlines (≥3:1 UI contrast) |
| `ring` | `#1DB954` | `#15803D` | Focus ring |
| `destructive` | `#E22134` | `#DC2626` | Destructive button fill |
| `destructive-text` | `#F15E6C` | `#B91C1C` | Error text & icons (5.9:1) |
| `warning` | `#F59B23` | `#B45309` | Low stock, expiring lots, unapproved |
| `info` | `#3D91F4` | `#2563EB` | In transit, informational |
| `success` | `#1DB954` | `#15803D` | Fulfilled, paid, in stock |
| `disabled` | `#535353` | `#D4D4D8` | Disabled controls (not for text you must read) |

All text/background pairs above were checked against WCAG 2.2 AA (4.5:1 text, 3:1 UI).

### 2.2 Chart palette (categorical, dark-validated)
`chart-1 #1DB954` (green) · `chart-2 #3D91F4` (blue) · `chart-3 #F59B23` (amber) ·
`chart-4 #B57BFF` (violet) · `chart-5 #F15E6C` (coral). Light theme uses
`#15803D #2563EB #B45309 #7C3AED #DC2626`. Max 5 series per chart; group the rest as "Other".

### 2.3 Business status mapping (shadcn `Badge`)

| Domain status | Variant | Icon (Lucide) |
|---|---|---|
| Fulfilled · Paid · Completed · In stock | `success` | `CircleCheck` |
| Started · Partial · In progress · In transit | `info` | `CircleDashed` / `Truck` |
| Unfulfilled · Uninvoiced · Open · Quote | `neutral` | `Circle` |
| Unapproved · Unconfirmed · Low stock · Expiring | `warning` | `TriangleAlert` |
| Owing · Out of stock · Expired · Error | `destructive` | `CircleAlert` |
| Cancelled · Deactivated | `muted` (strikethrough label) | `Ban` |

Sales/purchase orders show **two badges** (inventory status + payment status), always in that order.

---

## 3. Typography

- **Sans:** DM Sans (400, 500, 600, 700) — UI and data
- **Mono:** JetBrains Mono (400, 500) — SKUs, barcodes, lot/serial numbers, API keys
- Load via `next/font/google` (or `<link>` with `display=swap`). No 800 weight in app UI.

| Role | Mobile | ≥ md | Weight | Tailwind |
|---|---|---|---|---|
| Page title | 24/32 | 32/40 | 700, `-0.02em` | `text-2xl md:text-[32px] md:leading-10 font-bold tracking-tight` |
| Section title | 18/26 | 20/28 | 700 | `text-lg md:text-xl font-bold` |
| Card title | 16/22 | 16/22 | 600 | `text-base font-semibold` |
| KPI value | 28/34 | 32/40 | 700, tabular | `text-[28px] md:text-[32px] font-bold tabular-nums` |
| Body | 14/22 | 14/22 | 400 | `text-sm` |
| Table cell | 14/20 | 13/20 | 400 | `text-sm md:text-[13px]` |
| Small / helper | 12/18 | 12/18 | 400 | `text-xs` |
| Overline label | 11/16 | 11/16 | 700, `0.1em`, uppercase | `text-[11px] font-bold uppercase tracking-[0.1em]` (section labels only) |
| Code / SKU | 13/20 | 13/20 | 400 mono | `font-mono text-[13px]` |

Rules: body text ≥ 14px on mobile (16px for form inputs to prevent iOS zoom); max line length 72ch;
numbers `tabular-nums`; never all-caps sentences.

---

## 4. Spacing, radius, elevation

**Spacing** — 4px base (Tailwind default scale), rhythm from Green Deck's 8px grid:
`1 (4) · 2 (8) · 3 (12) · 4 (16) · 6 (24) · 8 (32) · 12 (48) · 16 (64)`.
Card padding `p-4 md:p-6` · section gap `gap-6 md:gap-10` · form field gap `gap-4` · table cell `px-3 py-2`.

**Radius**

| Token | Value | Use |
|---|---|---|
| `rounded-sm` | 4px | Inputs, thumbnails, table row focus, menu items |
| `rounded-md` | 6px | Badges (non-pill), small cards |
| `rounded-lg` (`--radius`) | 8px | Cards, popovers, dialogs, sheets |
| `rounded-xl` | 12px | Large media, empty-state illustrations |
| `rounded-full` | 9999px | Buttons, chips, search bar, avatars, scan FAB |

**Elevation** — dark mode uses **surface brightness**, not shadows (Green Deck rule):
L0 `background #121212` → L1 `card #181818` → L2 `popover #282828` → L3 `elevated #333333`.
Hover raises one level. Popovers/dialogs add `shadow-[0_8px_24px_rgba(0,0,0,0.5)]` to separate from content.
Light mode uses white surfaces with `shadow-sm` (L1), `shadow-md` (L2), `shadow-xl` (L3).

---

## 5. Tailwind v4 + shadcn/ui setup

> **This project (Vite SPA, spec 0001) differs from the Next.js snippets below in four places** (spec 0025):
> the CSS lives in `src/index.css`; `components.json` has `"rsc": false` and style `radix-vega`;
> fonts are self hosted with `@fontsource/dm-sans` and `@fontsource/jetbrains-mono` (no `next/font`);
> the theme uses `src/components/theme-provider.tsx` with `defaultTheme="dark"` instead of `next-themes`.
> The tokens and values are the same.

### 5.1 `components.json`
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "config": "", "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "ui": "@/components/ui", "utils": "@/lib/utils", "hooks": "@/hooks", "lib": "@/lib" }
}
```

### 5.2 `app/globals.css`
```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {                     /* light */
  --radius: 0.5rem;
  --background: #FAFAFA;  --foreground: #0A0A0A;
  --card: #FFFFFF;        --card-foreground: #0A0A0A;
  --popover: #FFFFFF;     --popover-foreground: #0A0A0A;
  --elevated: #FFFFFF;
  --primary: #15803D;     --primary-hover: #166534;  --primary-foreground: #FFFFFF;
  --secondary: #F4F4F5;   --secondary-foreground: #0A0A0A;
  --muted: #F4F4F5;       --muted-foreground: #52525B;
  --accent: #F4F4F5;      --accent-foreground: #0A0A0A;
  --destructive: #DC2626; --destructive-text: #B91C1C;
  --warning: #B45309;     --info: #2563EB;  --success: #15803D;
  --border: #E4E4E7;      --input: #71717A;  --ring: #15803D;
  --disabled: #D4D4D8;
  --chart-1: #15803D; --chart-2: #2563EB; --chart-3: #B45309; --chart-4: #7C3AED; --chart-5: #DC2626;
  --sidebar: #F4F4F5; --sidebar-foreground: #3F3F46; --sidebar-primary: #15803D;
  --sidebar-primary-foreground: #FFFFFF; --sidebar-accent: #E4E4E7;
  --sidebar-accent-foreground: #0A0A0A; --sidebar-border: #E4E4E7; --sidebar-ring: #15803D;
}

.dark {                     /* default theme */
  --background: #121212;  --foreground: #FFFFFF;
  --card: #181818;        --card-foreground: #FFFFFF;
  --popover: #282828;     --popover-foreground: #FFFFFF;
  --elevated: #333333;
  --primary: #1DB954;     --primary-hover: #1ED760;  --primary-foreground: #0A0A0A;
  --secondary: #282828;   --secondary-foreground: #FFFFFF;
  --muted: #1F1F1F;       --muted-foreground: #A7A7A7;
  --accent: #282828;      --accent-foreground: #FFFFFF;
  --destructive: #E22134; --destructive-text: #F15E6C;
  --warning: #F59B23;     --info: #3D91F4;  --success: #1DB954;
  --border: #2A2A2A;      --input: #727272;  --ring: #1DB954;
  --disabled: #535353;
  --chart-1: #1DB954; --chart-2: #3D91F4; --chart-3: #F59B23; --chart-4: #B57BFF; --chart-5: #F15E6C;
  --sidebar: #000000; --sidebar-foreground: #B3B3B3; --sidebar-primary: #1DB954;
  --sidebar-primary-foreground: #0A0A0A; --sidebar-accent: #181818;
  --sidebar-accent-foreground: #FFFFFF; --sidebar-border: #181818; --sidebar-ring: #1DB954;
}

@theme inline {
  --font-sans: var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;

  --color-background: var(--background);   --color-foreground: var(--foreground);
  --color-card: var(--card);               --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);         --color-popover-foreground: var(--popover-foreground);
  --color-elevated: var(--elevated);
  --color-primary: var(--primary);         --color-primary-hover: var(--primary-hover);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);     --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);             --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);           --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive); --color-destructive-text: var(--destructive-text);
  --color-warning: var(--warning);         --color-info: var(--info);  --color-success: var(--success);
  --color-border: var(--border);           --color-input: var(--input);  --color-ring: var(--ring);
  --color-disabled: var(--disabled);
  --color-chart-1: var(--chart-1); --color-chart-2: var(--chart-2); --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4); --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);                 --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary); --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);   --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);   --color-sidebar-ring: var(--sidebar-ring);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground font-sans antialiased; font-feature-settings: "tnum" 0; }
  .num { font-variant-numeric: tabular-nums; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
}
```

### 5.3 Theme
Use `next-themes` with `attribute="class"`, `defaultTheme="dark"`, `enableSystem`. Persist user choice;
Settings → Appearance offers Dark / Light / System.

### 5.4 Fonts (`app/layout.tsx`)
```tsx
import { DM_Sans, JetBrains_Mono } from "next/font/google";
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-dm-sans" });
const mono   = JetBrains_Mono({ subsets: ["latin"], weight: ["400","500"], variable: "--font-jetbrains-mono" });
// <html className={`${dmSans.variable} ${mono.variable}`} suppressHydrationWarning>
```

---

## 6. Components (shadcn/ui mapping)

Install base set:
`npx shadcn@latest add button badge card input label select textarea checkbox switch radio-group form table tabs dialog drawer sheet dropdown-menu popover command tooltip sonner skeleton separator scroll-area avatar breadcrumb pagination sidebar chart calendar`

### 6.1 Button (`components/ui/button.tsx` variants)
```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold " +
  "cursor-pointer transition-colors duration-200 disabled:pointer-events-none disabled:bg-disabled disabled:text-muted-foreground " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "[&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary:   "border border-input bg-transparent text-foreground hover:bg-accent",
        ghost:       "text-muted-foreground hover:text-foreground hover:bg-accent",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link:        "text-primary underline-offset-4 hover:underline rounded-none",
      },
      size: {
        sm:      "h-8 px-3",
        default: "h-10 px-5",            // desktop default
        lg:      "h-12 px-6 text-base",  // touch / warehouse flows
        icon:    "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);
```
Rules: one `default` (green) button per region · icon-only buttons need `aria-label` + `Tooltip` ·
async buttons show a spinner and keep their width (`min-w`) · destructive actions confirm via `AlertDialog`.

### 6.2 Inputs & forms
- `Input`/`SelectTrigger`: `h-10 rounded-sm bg-secondary border border-transparent px-3 text-base md:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30` (on light: `bg-card border-input`).
- Visible `Label` above every field (never placeholder-as-label); helper text `text-xs text-muted-foreground`; error text `text-xs text-destructive-text` + `aria-invalid` + `aria-describedby`.
- Validate on blur, re-validate on change after first error. Use `react-hook-form` + `zod` via shadcn `Form`.
- Entity pickers (product, customer, vendor, location) = **Combobox** (`Popover` + `Command`) with search, recent items, and "Create new…" footer.
- Quantity input: right-aligned, `inputMode="decimal"`, UoM suffix inside field, stepper buttons on touch.

### 6.3 Data table (core of the app)
Built on shadcn `Table` + TanStack Table.
- Header: `bg-muted text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground h-9`, sticky.
- Rows: `h-11` (default) · `h-9` (compact density toggle) · hairline `border-b border-border` · hover `bg-accent` · selected `bg-primary/10` + left 2px `primary` bar.
- Numbers `text-right num`; SKU/lot/serial `font-mono`; status column uses badges (§2.3).
- Row click opens detail; checkbox column for bulk select → **bottom action bar** slides up (L3, `h-16`, shows "3 selected · Print labels · Adjust · …").
- Built-ins: column visibility, sort, saved filters as chips, pagination (25/50/100), sticky first column on horizontal scroll, empty state, loading skeleton rows (never spinners on tables).

### 6.4 Cards & KPIs
- `Card`: `bg-card rounded-lg p-4 md:p-6`, **no border in dark** (surface contrast), `border` in light.
- KPI card: overline label → KPI value (tabular) → delta chip (`▲ 12%` success / `▼` destructive-text, with arrow icon, not color alone) → sparkline (chart-1).
- Clickable cards: `cursor-pointer hover:bg-accent transition-colors` — **no scale**.

### 6.5 Chips / filters
Pill (`rounded-full h-8 px-3 bg-secondary text-sm`), selected = `bg-foreground text-background` (Green Deck rule). Filter rows scroll horizontally on mobile with `snap-x`.

### 6.6 Navigation
- **Sidebar** (shadcn `Sidebar`): `bg-sidebar`, links `text-sm font-semibold text-sidebar-foreground`, active = `text-white` + 3px left `primary` indicator + `bg-sidebar-accent`. Sections: Dashboard · Sales · Purchasing · Inventory · Manufacturing · Customers · Vendors · Reports · Settings.
- **Top bar**: page breadcrumb (left), global search pill `h-10 md:w-[420px] rounded-full bg-secondary` with `⌘K` hint (opens `CommandDialog` across products, orders, customers), location switcher, notifications, avatar.
- Global **Scan** action: barcode icon button in top bar; on mobile a 56px green FAB bottom-right.

### 6.7 Overlays
- `Dialog` (≥ md) / `Drawer` (< md) for create/edit of small records — same component via a `ResponsiveDialog` wrapper.
- `Sheet` (right, `w-full sm:max-w-lg`) for record previews from tables.
- `Tooltip`: `bg-popover text-xs rounded-sm px-3 py-2`, 300ms delay.
- Toasts: `sonner`, bottom-right desktop / top-center mobile, auto-dismiss 4s, errors persist until dismissed, undo action for reversible operations.

### 6.8 Charts (shadcn `ChartContainer` + Recharts)
| Question | Chart |
|---|---|
| Sales / purchases over time | Area or line (chart-1, chart-2) |
| Top products / customers | Horizontal bar, sorted, max 10 |
| Stock by location | Stacked bar |
| Inventory value mix by category | Bar (not pie) — pie only for ≤ 4 parts |
| Stock trend on product page | Sparkline + step line |
Gridlines `stroke-border`, axis text `muted-foreground 12px`, tooltips L2. Every chart has a table/CSV alternative.

### 6.9 Feedback states
- **Loading:** skeletons matching final layout; show after 300ms; optimistic UI for status changes.
- **Empty:** icon + one sentence + primary action ("No purchase orders yet · Create purchase order").
- **Error:** inline banner with cause + retry; never lose user input.
- **Unsaved changes:** sticky bottom bar "Unsaved changes · Discard · Save".

---

## 7. Responsive rules

### 7.1 Breakpoints (Tailwind defaults) & target devices
| Token | Min width | Primary devices | Layout |
|---|---|---|---|
| base | 0 | Phones (360–430), scanners | Single column, bottom tab bar, drawers |
| `sm` | 640px | Large phones landscape, small tablets | Single column, 2-col grids for cards |
| `md` | 768px | Tablets portrait | Icon-rail sidebar (64px), 2-col forms |
| `lg` | 1024px | Tablets landscape, small laptops | Full sidebar (240px), tables full |
| `xl` | 1280px | Laptops/desktops | Detail page = main + 360px side panel |
| `2xl` | 1536px | Large monitors | Content max-width 1600px, centered |

Test at **360, 390, 768, 1024, 1280, 1440, 1920**. No horizontal page scroll at any width (tables scroll inside their own container).

### 7.2 App shell
| Element | < md | md – lg | ≥ lg |
|---|---|---|---|
| Sidebar | Hidden; opens as `Sheet` from hamburger | Collapsed 64px icon rail with tooltips | Expanded 240px; user can collapse (persisted) |
| Primary nav | **Bottom tab bar** `h-16` + `pb-[env(safe-area-inset-bottom)]`: Home · Orders · Scan (center FAB) · Stock · More | Sidebar rail | Sidebar |
| Top bar | `h-14`, title + search icon (opens full-screen search) | `h-14`, search pill | `h-16`, search pill 420px |
| Page padding | `px-4 py-4` | `px-6 py-6` | `px-8 py-6` |
| Content width | full | full | `max-w-[1600px] mx-auto` |

```tsx
<main className="flex-1 min-w-0 px-4 py-4 md:px-6 md:py-6 lg:px-8 pb-24 md:pb-6">
  <div className="mx-auto w-full max-w-[1600px]">{children}</div>
</main>
```
(`pb-24` on mobile clears the bottom tab bar.)

### 7.3 Grids
- KPI row: `grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4`
- Dashboard widgets: `grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-12` (widgets span `lg:col-span-8` / `lg:col-span-4`)
- Card catalog (products grid view, B2B portal): `grid gap-4 md:gap-6 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]`
- Detail page: `grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]` — side panel (status, totals, activity) moves **above** the main content on mobile for status, **below** for activity.

### 7.4 Tables → cards
| Width | Behaviour |
|---|---|
| ≥ lg | Full table, all default columns, sticky header |
| md – lg | Table; hide low-priority columns (`hidden lg:table-cell`); horizontal scroll inside `ScrollArea` with sticky first column |
| < md | **Card list**: each row becomes a stacked card (`title + key number` top line, `badges` second line, `meta` third line); swipe or kebab menu for row actions; bulk select via long-press |

Each column definition declares `priority: 1 | 2 | 3` → `1` always shown, `2` from `md`, `3` from `lg`.

### 7.5 Forms & document editors (sales/purchase order)
- Fields: `grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3`; addresses and remarks span full width.
- Line items: table on ≥ md; on < md each line is a card with product, qty stepper, price, and a swipe-to-remove; "Add line" opens a full-screen product search with scan button.
- Totals panel: right sticky column on ≥ xl; collapsible summary bar pinned to bottom on < xl.
- Primary save action: top-right on ≥ md; full-width sticky bottom button on < md.
- Multi-stage docs (Order · Pick · Pack · Ship · Invoice): `Tabs` on ≥ md; horizontal scrollable segmented control on < md.

### 7.6 Overlays
| Component | < md | ≥ md |
|---|---|---|
| Create/edit dialog | `Drawer` (bottom sheet, 90vh max) | `Dialog` `max-w-lg` (forms up to `max-w-2xl`) |
| Record preview | Full-screen route | `Sheet` right `sm:max-w-lg` |
| Filters | Bottom `Drawer` with "Apply" | Inline filter bar + `Popover`s |
| Menus | `Drawer` action list | `DropdownMenu` |

### 7.7 Touch & warehouse mode
- Min touch target **44×44px** everywhere on touch; **48px** (`size="lg"`) in pick/receive/count/scan screens.
- 8px minimum gap between adjacent targets.
- Scan screens: camera viewport top 50%, last-scanned item card, big qty stepper, success = green flash + haptic (`navigator.vibrate(30)`) + sound; error = red flash + distinct sound + message.
- Works in portrait only on phones; keeps screen awake during scan sessions (Wake Lock API).
- Inputs use correct `inputMode` (`numeric`, `decimal`, `email`, `search`) and `autoComplete`.

### 7.8 Typography & spacing scaling
- Only page titles, KPI values, and card padding scale up (see §3 and §4); body text stays 14px.
- Use `md:` and `lg:` prefixes only — never design desktop-first with `max-*` overrides except for rare fixes.
- Respect safe areas: `pt-[env(safe-area-inset-top)]` on top bar in PWA standalone mode.

---

## 8. Motion
- Durations: 150ms (hover, color), 200ms (menus, toggles), 250–300ms (sheets, drawers). Never > 400ms.
- Easing: `ease-out` entering, `ease-in` leaving.
- Animate only `opacity`, `transform` (translate), and `color/background` — never width/height in lists.
- No hover scale (layout shift). No looping/decorative animation in the app.
- Honor `prefers-reduced-motion` (global rule in §5.2).

---

## 9. Accessibility checklist (WCAG 2.2 AA)
- [ ] Text contrast ≥ 4.5:1, UI components & focus ring ≥ 3:1 (palette pre-validated, §2)
- [ ] Visible focus on every interactive element (`ring-2 ring-ring ring-offset-2`)
- [ ] Full keyboard support: tables navigable with arrows, `⌘K` search, `Esc` closes overlays, `/` focuses search
- [ ] Status never conveyed by color alone (badge label + icon)
- [ ] Every input has a `<Label>`; errors linked by `aria-describedby`
- [ ] Icon-only buttons have `aria-label`
- [ ] Images have `alt` (product photos: product name)
- [ ] Live regions for toasts and scan results (`aria-live="polite"`)
- [ ] Target size ≥ 24px (AA), ≥ 44px on touch (our rule)
- [ ] Logical heading order, one `h1` per page
- [ ] Both themes tested

---

## 10. Do's and Don'ts

**Do**
- Default to dark; let users choose light or system.
- Use near-black text on green buttons.
- Use surface brightness for hierarchy in dark mode; hairline dividers for dense data.
- Right-align and tabular-format every quantity and amount; show UoM next to quantities.
- Use Lucide icons at `size-4` (inline) / `size-5` (nav) consistently.
- Add `cursor-pointer` and a color/background hover to everything clickable.
- Keep copy short and label-like (Green Deck's voice) — "Receive", not "Click here to receive items".

**Don't**
- Don't use white text on green.
- Don't fill large areas (headers, cards, charts backgrounds) with green.
- Don't scale elements on hover.
- Don't use emoji as icons.
- Don't use `#535353` / `--disabled` for text people need to read.
- Don't use more than one primary (green) button per region.
- Don't hide critical actions behind hover on touch devices.
- Don't use pie charts for more than 4 slices.

---

## 11. Pre-delivery checklist (per screen)
- [ ] Renders correctly at 360 / 768 / 1024 / 1440 px, no horizontal page scroll
- [ ] Dark and light themes checked
- [ ] Loading, empty, error, and permission-denied states designed
- [ ] Keyboard-only walkthrough passes; focus visible
- [ ] Numbers tabular & right-aligned; currency and UoM shown
- [ ] Touch targets ≥ 44px on touch layouts (48px in warehouse flows)
- [ ] Only design tokens used (`bg-primary`, `text-muted-foreground`) — no raw hex in components
- [ ] `prefers-reduced-motion` respected
