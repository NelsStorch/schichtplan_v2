# @schichtplan/ui – Design-System „Lagerfeuer“

Gemeinsame Grundlage für `apps/web`, `apps/landing` und `apps/login`:
Tokens, Tailwind-Preset, Fonts und React-Komponenten. Lebender Styleguide: `http://localhost:3000/design` (nur Dev).

## Einbinden (pro Next-App)

```ts
// tailwind.config.ts
import uiPreset from '../../packages/ui/tailwind-preset';
export default { presets: [uiPreset], content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'] };

// next.config.ts
transpilePackages: ['@schichtplan/ui'],

// app/layout.tsx
import { FeedbackProvider, ThemeScript } from '@schichtplan/ui';
import { fontVariables } from '@schichtplan/ui/fonts';
<html className={fontVariables} suppressHydrationWarning><head><ThemeScript /></head>…
```

`globals.css` enthält nur die drei `@tailwind`-Direktiven. Dockerfiles kopieren `packages/ui` mit (wie `packages/shared`).

## Regeln

**Farben = semantische Tokens.** Nie `slate-*`/`rose-*` direkt verwenden, sondern:

| Token | Zweck |
| --- | --- |
| `canvas` | Seitenhintergrund |
| `surface`, `surface-2`, `surface-3` | Karten, Felder, Hover-/Füllflächen |
| `line`, `line-strong` | Rahmen, Trenner |
| `fg`, `fg-muted`, `fg-subtle` | Text primär / sekundär / tertiär (alle WCAG AA) |
| `accent`, `accent-fg`, `accent-ink` | Abteilungsfarbe: Fläche / Text darauf / als Textfarbe |
| `success`, `warning`, `danger` (+ `-ink`) | Belegungs- und Fehlerzustände |

Light/Dark tauscht nur die Variablen (System-Einstellung, umschaltbar mit `ThemeToggle`).
Der Akzent kommt zur Laufzeit aus `department.primaryColor` (`applyAccent()`); Kontraste
für Text werden automatisch berechnet, jede Abteilungsfarbe bleibt lesbar.

**Ein Akzent pro Seite.** Signup-Modi, Kategorien usw. sind neutral. Farbe trägt nur Bedeutung:
Akzent = Aktion/Fokus, Grün = voll/erledigt, Amber = letzter Platz/Hinweis, Rot = Fehler/Austragen.

**Formen:** Buttons, Chips, Badges `rounded-full` · Felder `rounded-field` · Karten, Dialoge, Hero `rounded-card` · kleine Kacheln `rounded-tile`.

**Typo:** Titel `font-display` (Bricolage Grotesque, extrabold, `tracking-[-0.03em]`) · Text `font-sans` (Geist) · Zeiten und Zahlen `font-mono tabular` (Geist Mono).

**Mobile zuerst:** Touch-Ziele ≥ 44 px (`Button size="md"`), Felder 16 px (kein iOS-Zoom), Dialoge sind auf Mobile Bottom-Sheets, Navigation unten in der Daumen-Zone. Kein `h-screen`, sondern `min-h-[100dvh]`.

**Bewegung mit Grund:** `animate-fade-up` + `stagger` (`style={{ '--i': index }}`) für das Erscheinen von Listen, `active:scale-[0.97]` als Klick-Feedback. `prefers-reduced-motion` schaltet alles ab (im Preset).

**Zustände immer komplett:** `Skeleton` in der Form des Inhalts statt Spinner, `EmptyState` mit nächstem Schritt, Fehler über `Callout` (Formular) oder `useToast()` (Aktion), Bestätigungen über `useConfirm()` statt `window.confirm`.

## Komponenten

`Button` / `buttonClasses()` · `Badge` · `Chip` / `ChipRow` · `Card` · `Field` + `Input` / `Select` / `Textarea` / `Switch` · `Dialog` · `FeedbackProvider` + `useToast` / `useConfirm` · `Callout` · `ProgressRing` · `SlotMeter` · `Avatar` · `Skeleton` · `EmptyState` · `CeviLogo` · `ThemeToggle` / `ThemeScript`

Icons: `lucide-react` (Strichstärke global 1.75 über das Preset).
