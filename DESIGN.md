---
name: Alias
description: Field continuity and briefing register that keeps your cover identity consistent over time.
colors:
  walnut-espresso: "#241813"
  mahogany-header: "#6b3022"
  redwood-stamp: "#c85428"
  amber-signal: "#b56910"
  maple-ground: "#ede2d5"
  birch-surface: "#f7f0e6"
  oak-raised: "#e2d3c1"
  wood-line: "#cbb69e"
  wood-rule: "#dbcab6"
  wood-control: "#a68d75"
  hickory-muted: "#5e4538"
  cedar-faint: "#785b4c"
  walnut-night-ground: "#181310"
  walnut-night-surface: "#231c18"
  walnut-night-raised: "#302620"
  walnut-night-line: "#3e3129"
  walnut-night-ink: "#f5ede6"
  driftwood-muted: "#c2ad9d"
  honey-gold: "#f0b23a"
  terracotta-glow: "#e87a4d"
  pos-fill: "#e3efe8"
  pos-ink: "#1b5238"
  neg-fill: "#fbe9e2"
  neg-ink: "#8c2814"
  warn-fill: "#fcf0d9"
  warn-ink: "#784808"
  info-fill: "#f5e8dc"
  info-ink: "#6e351c"
typography:
  display:
    fontFamily: "var(--font-public-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.875rem"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "var(--font-public-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  title:
    fontFamily: "var(--font-public-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "var(--font-public-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "var(--font-azeret-mono), ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0.02em"
    fontFeature: "tnum"
rounded:
  sm: "2px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "20px"
  lg: "32px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.walnut-espresso}"
    textColor: "{colors.maple-ground}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  button-secondary:
    backgroundColor: "{colors.oak-raised}"
    textColor: "{colors.walnut-espresso}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  button-danger:
    backgroundColor: "{colors.neg-fill}"
    textColor: "{colors.neg-ink}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  card-ledger:
    backgroundColor: "{colors.birch-surface}"
    textColor: "{colors.walnut-espresso}"
    rounded: "{rounded.sm}"
    padding: "20px"
  serial-tag:
    backgroundColor: "{colors.oak-raised}"
    textColor: "{colors.walnut-espresso}"
    rounded: "{rounded.sm}"
    padding: "2px 7px"
---

# Design System: Alias

## Overview

**Creative North Star: "The Field Survey & Datum Ledger"**

Alias treats cover-identity management like a geological reconnaissance and datum register. Every contact is a surveyed sector anchored to a benchmark cutoff timestamp (`lastConversationAt`), and every statement or incoming news fact plots along a chronological delta axis with an explicit receipt (`CLM-01`, `FCT-04`, `CRD-02`).

The interface rejects both generic B2B SaaS card templates and novelty spy-terminal costumes. Instead, it pairs warm survey vellum and alabaster ledger sheets with deep pine-charcoal command panels, transit-orange conflict callouts, benchmark forest-green verification badges, and strict tabular monospace coordinates.

**Key Characteristics:**
- **Datum-Anchored Hierarchy**: Every contact and research timeline surfaces its cutoff timestamp (`YYYY-MM-DD HH:mm`) in tabular monospace alongside live conflict and delta counts.
- **Serial Evidence Receipts**: Every claim (`CLM-01`), research fact (`FCT-01`), collection run (`RUN-01`), and flashcard (`CRD-01`) carries a deterministic serial reference code for instant cross-referencing.
- **Two-Register Day/Night Operation**: Pre-call preparation operates on warm vellum (`#f4f3ec`) and alabaster sheets (`#faf9f5`); beside-call Live mode switches to a full-viewport deep pine-night teleprompter (`#0e1511`) with zero chrome distraction.
- **Explicit Verification Marks**: Claims and flashcards display unmistakable checked/rehearsed states so an operator knows at a glance what has been cleared before a call.

## Colors

The palette uses stepped wooden tones—deep smoked walnut, rosewood/teak inner bars, a rich mahogany top command bar, and warm birch/maple light surfaces—paired with honey-gold and terracotta-redwood operational accents.

### Primary
- **Smoked Walnut Night** (`#181310` ground / `#231c18` surface / `#302620` raised bar): Default dark-mode stepped wood surfaces inspired by layered dark-panel dashboards with a warm walnut grain tint.
- **Mahogany Command Bar** (`#5e2a1d` / `#6b3022`): Rich warm rosewood-mahogany top navigation banner that anchors the application frame.
- **Terracotta Redwood** (`#e87a4d` dark / `#c85428` light): Primary warm accent used on section underlines, contradiction banners, timeline conflict nodes, and input carets.

### Secondary
- **Honey Gold** (`#f0b23a` dark / `#b56910` light): Interactive focus rings, metric highlights, active run indicators, and status accents.
- **Forest Sage** (`#1b5238` on `#e3efe8` in light; `#6ee7b7` on `#182e25` in dark): Verified claims, completed research runs, and rehearsed flashcard states.

### Neutral
- **Maple Ground** (`#ede2d5`), **Birch Surface** (`#f7f0e6`), & **Oak Raised** (`#e2d3c1`): Warm light-mode wooden surfaces (`data-theme="light"`).
- **Walnut Espresso** (`#241813`), **Hickory Muted** (`#5e4538`), & **Cedar Faint** (`#785b4c`): Light-mode typography tinted from roasted wood rather than neutral gray.
- **Birch Cream Ink** (`#f5ede6`) & **Driftwood Muted** (`#c2ad9d`): Dark-mode typography on walnut surfaces.

### Day / Night Register Toggle (`data-theme`)
- **Night Register (`data-theme="dark"`, default)**: Stepped dark walnut (`#181310` -> `#231c18` -> `#302620`) with a rich mahogany top bar (`#5e2a1d`), honey-gold (`#f0b23a`), and terracotta-redwood (`#e87a4d`) accents.
- **Day Register (`data-theme="light"`)**: Warm maple & birch wood (`#ede2d5` -> `#f7f0e6` -> `#e2d3c1`) with deep espresso walnut ink (`#241813`) and mahogany header (`#6b3022`).
- Persisted via `localStorage` (`"alias-theme-wood"`) with an inline `<head>` script in `src/app/layout.tsx` to eliminate flash of unstyled theme (FOUC).

### Named Rules
**The Tinted-From-Pine Rule.** Secondary and muted text is always tinted toward the pine-charcoal / sage axis (`#4a574f`, `#a3b5aa`), never neutral gray (`#888888`).
**The Transit-Orange Signal Rule.** Transit Orange (`#c84316`) is reserved for the top command bar datum rule, active contradiction warnings, and input carets—never for decorative fills.

## Typography

**Display Font:** Public Sans (`var(--font-public-sans)`, with `ui-sans-serif, system-ui, sans-serif` fallback)
**Body Font:** Public Sans (`var(--font-public-sans)`)
**Label/Mono Font:** Azeret Mono (`var(--font-azeret-mono)`, with `ui-monospace, SFMono-Regular, Menlo, monospace` fallback)

**Character:** Public Sans provides authoritative civil-survey clarity across dense operational tables and spoken flashcard prompts, while Azeret Mono locks timestamps, serial codes, and delta counts to a rigid tabular grid.

### Hierarchy
- **Display** (`700`, `2.875rem` / `46px`, line-height `1.02`, tracking `-0.035em`): Cover identity name on the benchmark dossier.
- **Headline** (`700`, `1.75rem–2.125rem` / `28px–34px`, line-height `1.15`, tracking `-0.03em`): Page titles (`PageHeader`) and flashcard prompts (`Flashcard`, `LiveMode`).
- **Title** (`700`, `1.0625rem–1.25rem` / `17px–20px`, line-height `1.25`, tracking `-0.015em`): Section headers (`SectionTitle`), contact names, and ledger titles.
- **Body** (`400–600`, `0.9375rem` / `15px`, line-height `1.5`, measure `60–70ch`): Claims, research facts, background prose, and form controls.
- **Label** (`600`, `0.6875rem–0.75rem` / `11px–12px`, tracking `0.02em`, `font-variant-numeric: tabular-nums`): Serial tags (`CLM-01`), coordinate timestamps (`YYYY-MM-DD HH:mm`), and status badges.

### Named Rules
**The Heading-First Rule.** Headings never carry an eyebrow or kicker above them; serial tags and status badges sit beside the heading on the right edge of a flex row or in a bordered header bar.
**The Tabular Coordinate Rule.** Every timestamp, count, and serial code uses `Azeret Mono` with `font-variant-numeric: tabular-nums`.

## Layout

The application uses a centered `1200px` max-width operational container (`px-4 sm:px-6`) below a sticky `56px` (`h-14`) pine-charcoal command bar.
- **Overview (`/`)**: A full-width datum status bar over a 12-column split (`5 cols` Cover Benchmark Dossier + `7 cols` Contact Cutoff & Continuity Register), followed by a 4-column `1px`-gap operational sequence grid.
- **Management views (`/interests`, `/people`, `/people/[id]`, `/interests/[id]`)**: Asymmetric two-column grids (`7fr / 5fr` or `8fr / 4fr`) pairing primary ledger sheets on the left with sticky (`lg:sticky lg:top-20`) action/creation wells on the right.
- **Live mode (`/decks/[id]/live`)**: Full-viewport (`fixed inset-0 z-50`) centered single-column (`max-w-2xl`) teleprompter that hides the global app header via `body:has([data-live-route]) > header { display: none; }`.

## Elevation & Depth

Surfaces are flat by default and rely on tonal layering across four structural steps (`#f4f3ec` ground → `#e6e4d8` raised well → `#faf9f5` alabaster sheet → `#16211b` pine-charcoal dossier) separated by crisp `1px solid` rules (`#c9c6b8` outer, `#dddad0` internal). Box shadows are reserved exclusively for the transient `.flag-in` contradiction highlight pulse (`0 0 0 4px rgb(200 67 22 / 0.28)`).

### Named Rules
**The Hairline-Over-Shadow Rule.** Containment and hierarchy come from `1px solid` structural rules and tonal surface contrast rather than drop shadows or thick side borders.

## Shapes

Every interactive control, ledger card, badge, and input uses a crisp `2px` (`rounded-sm`) survey corner radius with `1px solid` borders. Timeline nodes (`size-[15px]` in `ClaimsLedger`, `size-[11px]` in `ResearchTimeline`) and pulsing status dots (`size-1.5`) are the only circular (`rounded-full`) elements.

## Components

### Buttons
- **Shape:** Crisp `2px` radius (`rounded-sm`) with `1px solid` border and `min-h-11 sm:min-h-9` touch target.
- **Primary:** Pine Charcoal fill (`#16211b`) with Survey Vellum text (`#f4f3ec`), `px-3.5 py-1.5`, `14px` semibold.
- **Hover / Focus:** Darkens to `#23332a` on hover, scales to `0.98` on active press, and shows a `2px solid #1b4fd8` focus-visible outline (`2px` offset).
- **Secondary / Danger:** Secondary uses Vellum Well (`#e6e4d8`) with `#c9c6b8` border; Danger uses Neg Fill (`#ffede6`) with `#e3a088` border and `#7c2207` text.

### Chips
- **Style:** `.serial-tag` and `StatusBadge` use `2px` radius (`rounded-sm`), `1px solid` borders, `Azeret Mono` `11px` (`600` weight), and compact padding (`2px 7px`).
- **State:** `StatusBadge` pairs a `6px` status dot (pulsing on `running`) with semantic fills (`queued`, `running`, `completed` / "Verified", `failed`).

### Cards / Containers
- **Corner Style:** `2px` (`rounded-sm`).
- **Background:** Alabaster Sheet (`#faf9f5`) for standard registers; Pine Charcoal (`#16211b`) for the Cover Benchmark Dossier and Deck Builder.
- **Shadow Strategy:** Flat at rest; `1px solid #c9c6b8` border.
- **Internal Padding:** `20px` (`p-5`) to `24px` (`sm:p-6`), often topped by a `px-5 py-3` header strip (`bg-raised/55 border-b border-rule`).

### Inputs / Fields
- **Style:** `1px solid #aba696` border on Alabaster Sheet (`#faf9f5`), `2px` radius, `px-3 py-2`, `15px` body text, transit-orange caret (`caret-color: #c84316`).
- **Focus:** Border shifts to `#16211b` with a `2px solid #1b4fd8` outline (`1px` offset).

### Navigation
- **Style:** Sticky `56px` Pine Charcoal bar (`#16211b`) with a `2px solid #c84316` bottom datum rule. Active route tab uses a solid Survey Vellum pill (`bg-ground text-ink`); inactive tabs use `text-night-muted` with `hover:bg-night-raised hover:text-ground`.

### Flashcard & Teleprompter (`Flashcard`, `LiveMode`)
- **Structure:** Three-band survey card: top datum bar (`CRD-01` serial + `CardTypeLabel` + status hint), middle spoken prompt zone (`24px–31px` bold), and bottom Pine Charcoal revealed answer well with clickable source/claim receipts (`EvidenceList`).

## Do's and Don'ts

### Do:
- **Do** assign deterministic serial codes (`CLM-01`, `FCT-01`, `RUN-01`, `CRD-01`, `CNT-01`, `SEC-01`) to ledger items and citations.
- **Do** format operational cutoff timestamps with `formatCoordDate` (`YYYY-MM-DD HH:mm`) in `font-mono tnum`.
- **Do** draw all icons as inline SVGs with consistent `2px` stroke and rounded caps/joins.

### Don't:
- **Don't** place kickers or eyebrows above headings (`h1`, `h2`, `h3`); place metadata tags beside the heading in a flex header bar or below it.
- **Don't** use colored `border-left` or `border-right` stripes thicker than `1px` on callouts, claims, or cards; use full `1px` semantic borders and tinted header strips instead.
- **Don't** use Unicode symbols (`+`, `✓`, `→`, `←`) in place of drawn SVG icons.
