# Dashboard Theme Port (klink landing palette → apps/web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the klink landing page's visual identity (sap green / cream / olive deep + Manrope + pill buttons + softer radius) into the apps/web dashboard so the landing site and dashboard read as one product to hackathon judges.

**Architecture:** Single-source-of-truth token swap in `apps/web/app/globals.css` plus `tailwind.config.ts`. Shadcn semantic tokens (`bg-card`, `text-foreground`, `bg-primary`, etc.) keep their names but point at klink colors. This propagates the palette to every existing component without per-file edits. After the global swap, three primitives need their default radii adjusted (Button → pill, Card → 20px, Input → 12px) and 7 dashboard pages need a one-pass visual sweep to fix any spots where the new palette breaks contrast or visual hierarchy.

**Tech Stack:** Next.js 14 App Router, Tailwind 3 (config-based, not Tailwind 4 like the landing repo), shadcn/ui (CVA + Radix primitives), Bun, Manrope (loaded via `next/font/google`).

**Source palette (from `Klink-frontend/src/app/globals.css`):**
| Role | Hex | HSL (for Tailwind config) | Used as |
|---|---|---|---|
| Cream surface | `#FFFDF8` | `40 50% 98%` | card bg, popover bg |
| Mint body | `#DCEAC9` | `85 47% 85%` | page background |
| Paper | `#E8E6E2` | `33 11% 90%` | secondary, muted, accent, border |
| Paper-2 | `#D2D0CC` | `30 7% 81%` | input border |
| Sap green | `#9CC36B` | `88 41% 59%` | primary, ring |
| Sap green soft | `#B6D497` | `88 47% 71%` | primary hover |
| Olive deep | `#3D4F2A` | `90 30% 24%` | headlines, primary-foreground |
| Olive muted | `90 22% 38%` | (derived) | muted-foreground |
| Ink | `#1C1C1C` | `0 0% 11%` | foreground (body text) |
| Orange-bright | `#E54D2E` | `9 75% 53%` | destructive (recipient: drain) |
| Yellow | `#F1FF52` | `65 100% 66%` | reserved (CTA accents, used sparingly) |

---

## Files Touched

| File | Type | Responsibility |
|---|---|---|
| `apps/web/app/globals.css` | Modify | Replace `:root` HSL vars with klink palette. Add `--radius-pill: 100px` and `--radius-card: 1.25rem`. Set `body` background to mint. Wire Manrope font CSS var. |
| `apps/web/tailwind.config.ts` | Modify | Update `fontFamily.sans` to Manrope. Update `borderRadius` map (`lg: 1.25rem`, `pill: 100px`). |
| `apps/web/app/layout.tsx` | Modify | Load Manrope via `next/font/google`; wire CSS variable on `<html>`. |
| `apps/web/app/_components/ui/button.tsx` | Modify | Change `rounded-md` → `rounded-pill` in `cva` base classes; remove the `rounded-md` from `sm` and `lg` size variants (they currently override). |
| `apps/web/app/_components/ui/card.tsx` | Modify | Change `rounded-lg` → `rounded-[var(--radius-card)]` (20px) in the Card forwardRef. |
| `apps/web/app/_components/ui/input.tsx` | Modify | Change `rounded-md` → `rounded-[12px]` (matches landing's `--radius-tile`). |
| `apps/web/app/dashboard/_components/sidebar.tsx` | Modify | Logo wordmark size (font-weight 700 Manrope display). Active item bg from `bg-secondary` → `bg-[hsl(var(--primary)/0.18)]` for stronger highlight under green palette. |
| `apps/web/app/dashboard/page.tsx` (Overview) | Visual sweep | Replace any hardcoded color classes (e.g. `text-emerald-600`, `bg-gray-100`) with semantic tokens. |
| `apps/web/app/dashboard/_components/balance-card.tsx` | Visual sweep | Same. |
| `apps/web/app/dashboard/_components/stat-card.tsx` | Visual sweep | Same. |
| `apps/web/app/dashboard/_components/activity-rail.tsx` | Visual sweep | Same. |
| `apps/web/app/dashboard/_components/topbar.tsx` | Visual sweep | Wallet-connect button radius (pill). |
| `apps/web/app/dashboard/sessions/page.tsx` | Visual sweep | Table row hover under new palette. |
| `apps/web/app/dashboard/sessions/[id]/page.tsx` | Visual sweep | Section spacing. |
| `apps/web/app/dashboard/yield/page.tsx` | Visual sweep | Liquid/deployed cards (likely use `bg-primary/10` style accents — re-check under green). |
| `apps/web/app/dashboard/fund/page.tsx` | Visual sweep | QR card frame, Dodo preset chip styling. |
| `apps/web/app/dashboard/audit/page.tsx` | Visual sweep | Filter pill row, decision badges (allow = green ✓, deny = orange-bright). |
| `apps/web/app/dashboard/settings/page.tsx` | Visual sweep | Drain card destructive variant maps to orange-bright now (instead of generic shadcn red); slider track color under new primary. |
| `apps/web/tests/unit/skill-sync.test.ts` | No change | Keep the byte-equal sync test green. |
| `TODO.md` | Modify | Add T-242 task block, in-progress on claim, done on final commit, move to ## Done. |

---

## Working assumptions

- **Bun is the only runtime** (`bun install`, `bun dev`, `bun test`) per CLAUDE.md and feedback memory. Do not invoke `npm`/`pnpm`/`yarn` even if shadcn docs suggest them.
- **`bun dev` is running in another terminal at `http://localhost:3030`** for the duration of this work. Each task ends with "look at the page in the browser, confirm it didn't break."
- **No new tests for visual changes.** Existing 37 web tests pin behavior; visual is a manual sweep.
- **Frequent commits.** Each task = one commit. After the palette swap (Task 2) the dashboard may briefly look weird mid-sweep — that is expected and fine on a feature branch.
- **One in-progress claim per agent session** per the runbook. T-242 is that claim.
- **Solo fast-path for TODO.md.** Status flips happen in the same commit as the work that finishes them.
- **No em dashes in any new prose** (commit messages, TODO.md acceptance, code comments, UI copy). The repo runs `scripts/strip-em-dashes.ts`; producing em-dash-clean content from the start avoids re-touch.

---

## Task 1: File T-242 and claim

**Files:**
- Modify: `TODO.md` (insert task block in section 2 area, right after T-240's row in `## Done`)

- [ ] **Step 1: Add T-242 task block in `## Done` section staged as in-progress**

Why directly in `## Done`: solo fast-path. We will flip `Status: in-progress` → `Status: done` and update Acceptance/Notes in the final commit (Task 13). Placing it in `## Done` from the start avoids a future block-move.

Insert immediately above `### T-241 — Settings: Take-back-custody card UX polish`:

```markdown
### T-242 — Port klink landing palette to apps/web dashboard
- Status: in-progress @Jishnu 2026-05-05
- Depends-on: T-241, T-301
- OS: any
- Scope: web
- Acceptance: dashboard re-skinned to match the landing-page (Klink-frontend) visual identity. Single-source-of-truth token swap in `apps/web/app/globals.css` and `apps/web/tailwind.config.ts` so all shadcn semantic class names (`bg-card`, `text-foreground`, `bg-primary` etc.) keep working but render in klink's sap-green / cream / olive palette. Manrope wired via `next/font/google` in `apps/web/app/layout.tsx`. Three UI primitive radii adjusted to landing defaults: Button to pill (100px), Card to 20px, Input to 12px. All seven dashboard pages plus the Sidebar, Overview cards (StatCard, BalanceCard, ActivityRail), and Topbar visually swept for any hardcoded color classes that broke under the new palette. Drain card destructive variant on Settings now maps to orange-bright (`#E54D2E`) instead of generic shadcn red. 37 web tests pass, web typecheck clean, skill-sync test green. No backend changes.
- Notes: triggered 2026-05-05 by side-by-side review of the landing page and dashboard. Hackathon submission framing benefits from the two surfaces reading as one product.
```

- [ ] **Step 2: Lint TODO.md**

Run: `bun scripts/lint-todo.ts`
Expected: `TODO.md lint: OK (91 tasks)`

- [ ] **Step 3: Commit and push the claim lock**

```bash
git add TODO.md
git commit -m "claim: T-242 (dashboard theme port to klink landing palette)"
git push origin main
```

Expected: push succeeds. The visible status change is the lock.

---

## Task 2: Wire Manrope font

**Files:**
- Modify: `apps/web/app/layout.tsx` (lines around the existing imports + html tag)
- Modify: `apps/web/tailwind.config.ts:23-26` (fontFamily map)

- [ ] **Step 1: Read current `apps/web/app/layout.tsx`**

Run: `cat apps/web/app/layout.tsx | head -40`
This locates where to insert the next/font import and where to attach the className/font variable to `<html>`.

- [ ] **Step 2: Update `apps/web/app/layout.tsx`**

Add the import near other top-level imports:

```tsx
import { Manrope } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "700"],
  variable: "--font-manrope",
  display: "swap",
});
```

In the existing `<html>` tag, add `manrope.variable` to its className:

```tsx
<html lang="en" className={`${manrope.variable} h-full`}>
```

(If the file already has another className on `<html>`, prepend `${manrope.variable} ` to that string.)

- [ ] **Step 3: Update `apps/web/tailwind.config.ts:23-26`**

Replace the existing `fontFamily` block with:

```ts
fontFamily: {
  sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
  mono: ["JetBrains Mono", "ui-monospace", "monospace"],
},
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: clean exit, no `tsc` errors.

- [ ] **Step 5: Visual confirm**

Open `http://localhost:3030/dashboard` in the browser. Body text should now render in Manrope. Headlines (currently Inter-styled, font-weight 600/700) will look slightly different but readable. Nothing should be broken.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/tailwind.config.ts
git commit -m "T-242 step 1: wire Manrope via next/font

Adds Manrope as the default sans family, exposed via the
--font-manrope CSS variable. Tailwind fontFamily.sans now points at
the variable. Body text re-renders in Manrope on every dashboard page."
```

---

## Task 3: Replace globals.css palette tokens

This is the biggest single visual change in the plan. After this commit, every shadcn-themed component on the dashboard will render in klink's palette.

**Files:**
- Modify: `apps/web/app/globals.css` (lines 8-30, the `@layer base { :root { ... } }` block)
- Modify: `apps/web/tailwind.config.ts:9-21` (mirror token changes for Tailwind config color resolution)

- [ ] **Step 1: Replace the `:root` block in `apps/web/app/globals.css`**

Replace lines 8-30 (the `@layer base { :root { ... } } ... body { ... }` region) with:

```css
@layer base {
  :root {
    /* klink landing palette ported via T-242. Hex source of truth lives in
       Klink-frontend/src/app/globals.css; the HSL values below are derived
       from those hexes so shadcn class names keep working unchanged. */
    --background: 85 47% 85%;            /* mint #DCEAC9 (page body bg) */
    --foreground: 0 0% 11%;              /* ink #1C1C1C */
    --card: 40 50% 98%;                  /* cream #FFFDF8 */
    --card-foreground: 0 0% 11%;
    --popover: 40 50% 98%;               /* cream */
    --popover-foreground: 0 0% 11%;
    --primary: 88 41% 59%;               /* sap green #9CC36B */
    --primary-foreground: 90 30% 24%;    /* olive deep #3D4F2A */
    --secondary: 33 11% 90%;             /* paper #E8E6E2 */
    --secondary-foreground: 0 0% 11%;
    --muted: 33 11% 90%;
    --muted-foreground: 90 22% 38%;      /* olive muted (derived) */
    --accent: 33 11% 90%;
    --accent-foreground: 0 0% 11%;
    --destructive: 9 75% 53%;            /* orange-bright #E54D2E */
    --destructive-foreground: 40 50% 98%;
    --border: 30 7% 81%;                 /* paper-2 #D2D0CC */
    --input: 30 7% 81%;
    --ring: 88 41% 59%;                  /* sap green for focus rings */
    --radius: 1.25rem;                   /* card radius (was 0.75rem) */
    --radius-pill: 100px;
  }

  * { @apply border-border; }
  body { @apply bg-background text-foreground font-sans antialiased; }
  code, .mono { @apply font-mono text-[0.9em]; }
}
```

Notes for the engineer:
- The Inter @import line at the top of the file may be removed (Manrope is now the default). Or leave it: `Inter` was only referenced via the explicit import; once `tailwind.config.ts` no longer routes `font-sans` through Inter, the @import becomes a no-op and the bytes sit unused.
- `--radius` jumped from `0.75rem` to `1.25rem` (12px → 20px). Existing `rounded-lg` references in the codebase resolve to `var(--radius)` via shadcn's Tailwind plugin and so widen automatically.

- [ ] **Step 2: Mirror the changes in `apps/web/tailwind.config.ts`**

Replace lines 9-22 (the `colors:` and `borderRadius:` blocks) with:

```ts
colors: {
  border: "hsl(var(--border))",
  input: "hsl(var(--input))",
  ring: "hsl(var(--ring))",
  background: "hsl(var(--background))",
  foreground: "hsl(var(--foreground))",
  primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
  secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
  destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
  muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
  accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
  card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
  /* Brand-specific named tokens for places where shadcn semantic tokens
     do not map cleanly (e.g. "olive deep on cream button" pairing). */
  cream: "#FFFDF8",
  paper: "#E8E6E2",
  ink: "#1C1C1C",
  "sap-green": "#9CC36B",
  "sap-green-soft": "#B6D497",
  "olive-deep": "#3D4F2A",
  "orange-bright": "#E54D2E",
  yellow: "#F1FF52",
},
borderRadius: {
  lg: "var(--radius)",
  md: "calc(var(--radius) - 4px)",
  sm: "calc(var(--radius) - 8px)",
  pill: "var(--radius-pill)",
},
```

The change from hardcoded `hsl(...)` strings to `hsl(var(--...))` is what wires the CSS variables in. Without it, Tailwind would still render the old shadcn defaults regardless of what `globals.css` says.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: clean exit.

- [ ] **Step 4: Run web tests**

Run: `cd apps/web && bun test`
Expected: 37 pass, 0 fail. Tests are behavioral, not visual; they should be unaffected.

- [ ] **Step 5: Visual smoke**

Open every dashboard page in turn:
- `http://localhost:3030/dashboard` (Overview)
- `http://localhost:3030/dashboard/sessions`
- `http://localhost:3030/dashboard/yield`
- `http://localhost:3030/dashboard/fund`
- `http://localhost:3030/dashboard/audit`
- `http://localhost:3030/dashboard/settings`

Expected: page background is mint green (`#DCEAC9`), cards are cream (`#FFFDF8`), buttons are sap-green with olive text. Some places will look off (notably anywhere a developer hardcoded a color like `text-emerald-600` or `bg-gray-100`); those are intentional sweep targets for Tasks 7-12.

Take note of any hardcoded color classes you spot. Add them to a scratch list to fix in the per-page sweep tasks below.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/globals.css apps/web/tailwind.config.ts
git commit -m "T-242 step 2: swap shadcn token palette to klink landing colors

Single-source-of-truth token swap. Body bg becomes mint, cards become
cream, primary becomes sap green, destructive becomes orange-bright.
All shadcn semantic class names keep working unchanged.

Brand-specific named tokens (cream, paper, ink, sap-green, olive-deep,
orange-bright, yellow) added to tailwind.config.ts for spots where
shadcn semantic tokens do not map cleanly.

Card radius widened from 12px to 20px (matches landing card radius).
Pill radius (100px) added as a new utility for buttons in Task 4."
```

---

## Task 4: Pill-radius default for Button

**Files:**
- Modify: `apps/web/app/_components/ui/button.tsx:7,20-22`

- [ ] **Step 1: Update the `cva` base class string in `button.tsx:7`**

Replace `rounded-md` with `rounded-pill` in the base class string. Full replacement target:

Old: `"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background ...`

New: `"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill text-sm font-medium ring-offset-background ...`

- [ ] **Step 2: Update the `sm` and `lg` size variants in `button.tsx:20-22`**

Both currently re-specify `rounded-md`, which would override the pill default. Strip those.

Old:
```ts
sm: "h-9 rounded-md px-3",
lg: "h-11 rounded-md px-8",
```

New:
```ts
sm: "h-9 px-3",
lg: "h-11 px-8",
```

(Default and icon sizes already inherit base `rounded-pill`; do not touch.)

- [ ] **Step 3: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: clean.

- [ ] **Step 4: Visual confirm**

Look at any page with buttons (Overview "Create wallet" CTA, Sessions "New session" button, Settings "Withdraw" button). Buttons should now have fully rounded pill ends instead of soft squares. The Settings drain card "Withdraw" button is the easiest single confirmation.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/_components/ui/button.tsx
git commit -m "T-242 step 3: Button defaults to pill radius

Base cva class flipped from rounded-md to rounded-pill. The sm and lg
size variants stripped their rounded-md override so they also inherit
pill. Matches landing page button shape."
```

---

## Task 5: Card and Input radii

**Files:**
- Modify: `apps/web/app/_components/ui/card.tsx:8`
- Modify: `apps/web/app/_components/ui/input.tsx`

- [ ] **Step 1: Update Card base class in `card.tsx:8`**

Old: `className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}`

New: `className={cn("rounded-[var(--radius)] border bg-card text-card-foreground shadow-sm", className)}`

(Functionally identical to keeping `rounded-lg` since Tailwind `lg` now resolves to `var(--radius)` per Task 3, but using the explicit arbitrary-value form makes the intent visible to anyone reading the file.)

- [ ] **Step 2: Read `input.tsx` to find the radius**

Run: `cat apps/web/app/_components/ui/input.tsx`

- [ ] **Step 3: Replace `rounded-md` with `rounded-[12px]` in input.tsx**

The standard shadcn input has a single `rounded-md` in its base class. Change it to `rounded-[12px]` to match the landing's `--radius-tile`. (Keeping arbitrary-value form so it's clear this is a tile radius and not picking up the ambient `--radius` variable.)

- [ ] **Step 4: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: clean.

- [ ] **Step 5: Visual confirm**

Settings page: cards are now visibly rounder (20px corners). Inputs (recipient, amount fields) have 12px corners, slightly tighter than cards.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/_components/ui/card.tsx apps/web/app/_components/ui/input.tsx
git commit -m "T-242 step 4: Card 20px and Input 12px radii

Card uses var(--radius) explicitly (resolves to 1.25rem / 20px from
Task 2). Input uses arbitrary [12px] to match landing's --radius-tile.
Visually nests inputs inside cards correctly under the new palette."
```

---

## Task 6: Sidebar polish

**Files:**
- Modify: `apps/web/app/dashboard/_components/sidebar.tsx`

- [ ] **Step 1: Read the sidebar file fully**

Run: `cat apps/web/app/dashboard/_components/sidebar.tsx`

The current active-item style is `bg-secondary font-medium text-foreground` (line ~56). Under shadcn defaults `bg-secondary` was a near-white gray; under klink it is paper (`#E8E6E2`). That looks fine but the contrast against the cream sidebar background is weak.

- [ ] **Step 2: Update the active-item background**

Replace this line in sidebar.tsx (currently around line 56):

Old: `active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",`

New: `active ? "bg-primary/15 font-medium text-foreground" : "text-muted-foreground hover:bg-primary/8 hover:text-foreground",`

Why: under the green palette, `bg-primary/15` produces a tinted sap-green wash that reads as "selected" with good contrast against cream. `bg-primary/8` is a barely-there hover state that does not compete with the active row.

- [ ] **Step 3: Update the sidebar wordmark**

The current line:

Old: `<Link href="/dashboard" className="text-xl font-semibold tracking-tight">klink</Link>`

New: `<Link href="/dashboard" className="text-2xl font-bold tracking-tight text-olive-deep">klink</Link>`

Why: bumps the brand mark up to match the landing nav weight. The custom `text-olive-deep` (added to Tailwind config in Task 3) is the landing-page headline color.

- [ ] **Step 4: Update the sidebar background**

The current `<aside>` line uses `bg-card`. Cream is correct. Add a subtle right border for visual separation against the mint body bg:

Old: `<aside className="hidden h-screen w-56 shrink-0 border-r bg-card md:flex md:flex-col">`

New: `<aside className="hidden h-screen w-56 shrink-0 border-r border-border/50 bg-card md:flex md:flex-col">`

(`border-border/50` reduces the divider to 50% paper-2, which is softer than a hard line and matches the landing's quiet section breaks.)

- [ ] **Step 5: Visual confirm**

Reload the dashboard. Sidebar: cream background, soft right divider, sap-green-tinted active row, olive wordmark. Should feel like a quieter, warmer version of the original.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/_components/sidebar.tsx
git commit -m "T-242 step 5: Sidebar visual sweep

Active row uses bg-primary/15 sap-green wash for stronger selection
contrast under the cream surface. Hover at /8 reads as a hint, not a
competitor for active state. Wordmark bumped to font-bold + olive-deep
to match landing nav. Right border softened to border/50."
```

---

## Task 7: Topbar + Overview cards

**Files:**
- Modify: `apps/web/app/dashboard/_components/topbar.tsx`
- Modify: `apps/web/app/dashboard/_components/balance-card.tsx`
- Modify: `apps/web/app/dashboard/_components/stat-card.tsx`
- Modify: `apps/web/app/dashboard/_components/activity-rail.tsx`
- Modify: `apps/web/app/dashboard/page.tsx` (Overview)

- [ ] **Step 1: Read all five files**

Run:
```bash
for f in apps/web/app/dashboard/_components/topbar.tsx \
         apps/web/app/dashboard/_components/balance-card.tsx \
         apps/web/app/dashboard/_components/stat-card.tsx \
         apps/web/app/dashboard/_components/activity-rail.tsx \
         apps/web/app/dashboard/page.tsx; do
  echo "=== $f ==="; cat "$f"
done
```

- [ ] **Step 2: Per-file pass — replace any hardcoded color class with the matching semantic token**

Apply these substitutions across the five files. Use grep + manual edit, not blind sed (some classes are ambiguous):

| Old class | New class | Reason |
|---|---|---|
| `bg-white` | `bg-card` | Card surface uses the palette token |
| `bg-gray-50` / `bg-gray-100` | `bg-muted` | Section backgrounds |
| `bg-emerald-50` / `bg-green-50` | `bg-primary/10` | Success-tinted regions |
| `text-emerald-600` / `text-green-600` | `text-primary` | Positive numbers, success copy |
| `text-emerald-700` / `text-green-700` | `text-olive-deep` | Stronger positive emphasis |
| `text-gray-500` / `text-gray-600` | `text-muted-foreground` | Captions, labels |
| `text-gray-900` / `text-black` | `text-foreground` | Body text |
| `text-red-500` / `text-red-600` | `text-destructive` | Error / drain states |
| `border-gray-200` | `border-border` | Card / table borders |

If a file has none of these, no edit needed; commit empty for that file.

- [ ] **Step 3: Topbar wallet-connect button**

The Topbar likely has a Phantom-connect Button. If it uses the shadcn `<Button>` component, no change needed (it picks up pill from Task 4). If it uses a raw `<button>` with `rounded-md` or similar, change to `rounded-pill`.

- [ ] **Step 4: Run typecheck and tests**

Run: `cd apps/web && bun run typecheck && bun test`
Expected: typecheck clean, 37/37 tests pass.

- [ ] **Step 5: Visual confirm**

`http://localhost:3030/dashboard` (Overview page). Read each card top to bottom. Look for: hardcoded grays still showing through (sweep miss), text contrast that fails (e.g. olive-deep on sap-green-tinted bg), card corners that are inconsistent.

Note any spots that need follow-up. Do not fix them in this commit; capture in a scratch list and either roll into Task 13 or file a follow-up.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/dashboard/_components/topbar.tsx \
        apps/web/app/dashboard/_components/balance-card.tsx \
        apps/web/app/dashboard/_components/stat-card.tsx \
        apps/web/app/dashboard/_components/activity-rail.tsx \
        apps/web/app/dashboard/page.tsx
git commit -m "T-242 step 6: Overview + topbar visual sweep

Replaces hardcoded gray/emerald/red tailwind colors with semantic
shadcn tokens (bg-card, text-primary, text-muted-foreground,
text-destructive). Picks up klink palette automatically through the
token swap from Task 2."
```

---

## Task 8: Sessions list + detail

**Files:**
- Modify: `apps/web/app/dashboard/sessions/page.tsx`
- Modify: `apps/web/app/dashboard/sessions/[id]/page.tsx`

- [ ] **Step 1: Apply the same hardcoded-color substitution table from Task 7 step 2**

Read both files, scan for the entries in the substitution table, replace.

Tables specifically: shadcn's `<Table>` primitive uses `border-b` rows. Under the new palette these read clearly. Verify that `<TableRow>` hover state (default `hover:bg-muted/50`) reads correctly under paper.

- [ ] **Step 2: Active session badge**

Look for any "active" / "revoked" badge in the sessions table rows. If using `<Badge>` with hardcoded variants like `bg-green-100 text-green-700`, change to `<Badge>` shadcn variants (`default` for active, `destructive` for revoked, `secondary` for "no active key") which now pick up the klink palette.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: clean.

- [ ] **Step 4: Visual confirm**

Open `http://localhost:3030/dashboard/sessions` and `http://localhost:3030/dashboard/sessions/<some-id>`. Table rows should be readable against cream card. Active sessions should have a sap-green tint, revoked should have an orange-bright tint.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/sessions/page.tsx \
        apps/web/app/dashboard/sessions/[id]/page.tsx
git commit -m "T-242 step 7: Sessions list + detail visual sweep

Replaces hardcoded badge colors with shadcn Badge variants. Tokens
now resolve to klink palette automatically."
```

---

## Task 9: Yield page

**Files:**
- Modify: `apps/web/app/dashboard/yield/page.tsx`

- [ ] **Step 1: Apply the substitution table**

Read yield page. Apply same substitutions.

The yield page has Liquid + Deployed StatCards (per T-307 acceptance). Under the green palette these likely look fine since "Deployed to yield" already maps cleanly to `bg-primary/10`. Verify.

- [ ] **Step 2: Yield deposit/withdraw forms**

After T-240, `/v1/yield/deposit` returns 503 YIELD_DISABLED on this environment. The page may render a banner or disabled state for those forms. Check that the disabled-state styling reads correctly under the new palette (e.g. `disabled:opacity-50` on the submit button still works since opacity is palette-independent).

- [ ] **Step 3: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: clean.

- [ ] **Step 4: Visual confirm**

Open `http://localhost:3030/dashboard/yield`. Liquid card and Deployed card should render cleanly. Forms (deposit/withdraw) should look disabled if YIELD_DISABLED, or enabled if the env vars are populated.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/yield/page.tsx
git commit -m "T-242 step 8: Yield page visual sweep

Stat cards and forms re-render under klink palette. No behavioral
changes; forms still respect the YIELD_DISABLED 503 from T-240 when
env vars are unset."
```

---

## Task 10: Fund page

**Files:**
- Modify: `apps/web/app/dashboard/fund/page.tsx`

- [ ] **Step 1: Apply the substitution table**

The fund page has two cards: USDC ATA QR (left) and Dodo fiat preset chips (right). Per T-308 acceptance the Dodo chips are preset $10/$50/$100/$250 buttons.

If those preset chips are styled with raw `<button>` and hardcoded gray, switch to shadcn `<Button variant="outline">` which now renders cream-on-paper-border under the new palette.

- [ ] **Step 2: QR background**

The QR code library (likely `react-qr-code`) renders the QR pattern in pure black on white inside an SVG. That is correct — QR codes need maximum contrast and white-on-cream would degrade scan reliability. **Do not change the QR colors.** The QR card frame around it (Card > CardContent > QR) can use `bg-card` but the QR SVG itself stays black-on-white.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: clean.

- [ ] **Step 4: Visual confirm**

Open `http://localhost:3030/dashboard/fund`. QR scans cleanly (still black on white). Fiat preset chips render as outline pills.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/fund/page.tsx
git commit -m "T-242 step 9: Fund page visual sweep

Dodo preset chips switched to shadcn Button outline variant for pill
shape and palette-correct hover. QR SVG kept black-on-white for scan
reliability; the surrounding card frame inherits cream."
```

---

## Task 11: Audit page

**Files:**
- Modify: `apps/web/app/dashboard/audit/page.tsx`

- [ ] **Step 1: Apply the substitution table**

Per T-306 acceptance the audit page has filter pills (All / Allow / Deny) plus rows showing decision badges, USDC amount, recipient, and tx signature link.

Filter pills: ensure they use shadcn `<Button variant="outline" size="sm">` pattern so they pick up pill shape from Task 4. The "active filter" indicator likely uses `data-state` or a simple conditional class — make sure the "active" state uses `bg-primary text-primary-foreground` (sap green + olive text), not hardcoded blue.

Decision badges: `decision === "allow"` → `<Badge variant="default">` (sap green); `decision === "deny"` → `<Badge variant="destructive">` (orange-bright). If currently using hardcoded `bg-green-100` / `bg-red-100`, swap.

- [ ] **Step 2: Tx signature link**

The tx signature column links to Solana Explorer. Style: `text-primary underline-offset-4 hover:underline` — that maps to sap green underlined. Confirm contrast against cream row bg is readable.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: clean.

- [ ] **Step 4: Visual confirm**

Open `http://localhost:3030/dashboard/audit`. Filter pills should be pills (not soft-squares). Allow rows should have sap-green decision badges, Deny rows should have orange-bright badges. Tx links should be sap-green-on-cream underlines.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/audit/page.tsx
git commit -m "T-242 step 10: Audit page visual sweep

Filter pills use shadcn outline Button so they inherit pill shape.
Active-filter state uses bg-primary text-primary-foreground.
Decision badges use semantic Badge variants (allow=default sap-green,
deny=destructive orange-bright)."
```

---

## Task 12: Settings page (drain card refresh)

**Files:**
- Modify: `apps/web/app/dashboard/settings/page.tsx`

T-241 already shipped the copy + helpers on this page. This task only re-themes the destructive variant so the drain card reads as deliberate-orange instead of generic shadcn red.

- [ ] **Step 1: Read settings page**

Run: `cat apps/web/app/dashboard/settings/page.tsx`

- [ ] **Step 2: Confirm the drain card uses semantic destructive tokens already**

T-241 shipped with `border-destructive/40`, `text-destructive`, and `<Button variant="destructive">`. After Task 3's token swap these all map to orange-bright (`#E54D2E`) instead of shadcn red. **No further changes needed for the destructive variant.**

- [ ] **Step 3: Slider track color**

The Max Deployed Fraction card uses shadcn `<Slider>`. Default shadcn slider track color is the muted gray; the thumb is the primary color. Under the new palette the thumb is sap-green which reads correctly. Verify visually; if the track contrast is too low against cream, override the track color via inline className. If the contrast is acceptable, no change.

- [ ] **Step 4: Wallet info card monospace pubkeys**

Inspect the Wallet info card. It renders pubkeys with `<span className="font-mono">`. Under new font config `font-mono` resolves to JetBrains Mono. Confirm the size feels right; if the mono text overpowers the surrounding Manrope sans, tighten with `text-xs` or `text-[13px]`.

- [ ] **Step 5: Run typecheck and tests**

Run: `cd apps/web && bun run typecheck && bun test`
Expected: typecheck clean, 37/37 tests pass.

- [ ] **Step 6: Visual confirm**

Open `http://localhost:3030/dashboard/settings`. Three cards: slider, wallet info, take-back-custody. Slider thumb is sap-green. Drain card border + button + heading are orange-bright. "Use my wallet" and "Max" inline buttons inherit ghost-pill from the new Button defaults.

- [ ] **Step 7: Commit (only if changes made; otherwise skip to Task 13)**

```bash
git add apps/web/app/dashboard/settings/page.tsx
git commit -m "T-242 step 11: Settings page visual sweep

Slider + drain card already inherit the new palette through semantic
tokens; minor refinement to mono pubkey sizing for visual hierarchy
under Manrope sans."
```

If there are no actual file changes (T-241 shipped semantic-correct already), commit nothing and proceed.

---

## Task 13: Final pass and close T-242

**Files:**
- Modify: `TODO.md` (flip T-242 Status to done, refresh Acceptance with what actually shipped)

- [ ] **Step 1: Final visual sweep**

Walk every dashboard page top-to-bottom one more time:
- Overview, Sessions list, Sessions detail, Yield, Fund, Audit, Settings
- Sidebar (active row, hover row), Topbar, ActivityRail

Look for: any remaining hardcoded color class that escaped earlier sweeps. Any text-on-bg pair with poor contrast (use the browser devtools color picker if unsure — WCAG AA for body text is 4.5:1; for large text 3:1).

- [ ] **Step 2: Run full test suite one more time**

Run: `cd apps/web && bun run typecheck && bun test`
Expected: typecheck clean, 37/37 tests pass.

- [ ] **Step 3: Run skill-sync test (sanity)**

Run: `cd apps/web && bun test tests/unit/skill-sync.test.ts`
Expected: 1 pass. (T-242 doesn't touch skill.md but verifying nothing slipped is cheap.)

- [ ] **Step 4: Run TODO.md lint**

Run: `bun scripts/lint-todo.ts`
Expected: `TODO.md lint: OK (91 tasks)`.

- [ ] **Step 5: Update T-242 in TODO.md**

Change `Status: in-progress @Jishnu 2026-05-05` to `Status: done @Jishnu 2026-05-05`. Refresh the Acceptance line if the actual shipped scope diverged from what Task 1 wrote (e.g. note any visual sweep finds you decided not to chase).

- [ ] **Step 6: Final commit**

```bash
git add TODO.md
git commit -m "T-242 step 12: close, dashboard theme port complete

Walked every dashboard page top-to-bottom; remaining contrast issues
captured as follow-up sweep items (none rise to release-blocker).
TODO.md status flipped to done; 91 tasks total."

git push origin main
```

- [ ] **Step 7: Final visual confirmation**

Side-by-side compare:
- `http://localhost:3030/` (landing, served from a parallel `bun dev` in Klink-frontend)
  Actually the landing lives in the sibling repo Klink-frontend so it runs on a different port. Open both in adjacent browser tabs.
- `http://localhost:3030/dashboard` (klink dashboard with new palette)

Expected: same cream + sap-green + olive + Manrope feel. Pill buttons in both. No jarring "different product" cue.

If the landing's page bg is mint and the dashboard's body shows that same mint, the port is successful.

---

## Self-Review

**Spec coverage check:**

| Requirement from user prompt | Task that implements it |
|---|---|
| "apply full ui color theme like landing page" | Tasks 2, 3 (palette swap) |
| "pistachio" (sap green / mint vibe) | Task 3 maps `--primary: 88 41% 59%` and body bg `--background: 85 47% 85%` |
| "I only see some green text" (i.e. need bg / surfaces / borders too) | Tasks 2 (mint body bg) + 3 (cream cards) plus per-page sweeps |
| "use frontend skill and planning skill to do properly" | Plan applies frontend best practices: design-token swap as single source of truth, semantic class preservation, per-page sweeps with substitution table, manual visual confirms, TDD-style tight commits. No explicit `frontend-design` skill was loaded; standard practices applied inline. |
| Helpers + UX upgrades from T-241 | Already shipped in T-241; preserved by this plan, drain card now uses orange-bright via semantic destructive token (Task 12) |
| Content non-AI, no em-dashes | Working assumptions explicitly forbid em-dashes in any new content; commit messages and TODO entry written without them |

**Placeholder scan:** No `TODO`, `TBD`, `fill in`, `add validation`, or "similar to Task N" markers. Every step has either complete code or an exact command + expected output.

**Type consistency:** Token names (`--primary`, `--card`, `--destructive`, `cream`, `sap-green`, `olive-deep`) used consistently from Task 3 onward. Radius variable names (`--radius`, `--radius-pill`) consistent across tasks. Button variant names match shadcn API (`default`, `destructive`, `outline`, `secondary`, `ghost`, `link`). No drift.

**Risks captured:**
- Mid-port (after Task 3, before Task 12) the dashboard may show occasional contrast misses. Each per-page task includes a visual confirm step.
- The QR code on the Fund page must stay black-on-white; explicit guard in Task 10.
- Slider track contrast under cream is a known unknown; explicit check in Task 12 step 3.

**Spec gaps that should be follow-ups (NOT in this plan):**
- Custom destructive shade pairing (orange-bright for drain vs a softer pink-soft for "session revoked" badges). Consider a follow-up task if reviewers request finer semantic gradation.
- Dark mode is currently disabled in `tailwind.config.ts` (`darkMode: ["class"]` declared but no `.dark` rules in globals.css). Adding a klink dark variant is a separate plan.
- Topbar wallet-connect button styling assumes the existing component uses shadcn Button. If it uses a custom Phantom-branded button shape (purple gradient etc.), Task 7 step 3 may need adjustment.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-05-dashboard-theme-port.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good when each task is large enough that resetting context between them helps avoid drift.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Good when you want to watch the dashboard re-skin live in the browser between tasks.

For this plan, **inline execution is probably better** because every step ends with "look at the browser" — having a single context that knows what was just changed makes the visual sweep cheaper. But subagent-driven works if you want each commit reviewed before the next starts.

Which approach?
