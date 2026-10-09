/**
 * Cevi Schichtplan – Tailwind-Preset ("Lagerfeuer"-Design-System)
 *
 * Alle Farben sind semantische Tokens auf CSS-Variablen (RGB-Kanäle), damit
 *  - Light/Dark nur die Variablen tauscht (keine `dark:`-Duplikate in Komponenten),
 *  - die Abteilungsfarbe (`department.primaryColor`) zur Laufzeit als einziger Akzent
 *    gesetzt werden kann (siehe `accentVars()` in src/theme/accent.ts),
 *  - Opacity-Modifier (`bg-accent/10`) weiterhin funktionieren.
 *
 * Form-Regeln (überall einhalten):
 *  - Interaktive Elemente (Buttons, Chips, Badges): `rounded-full`
 *  - Eingabefelder: `rounded-field`
 *  - Karten, Sheets, Dialoge, Hero: `rounded-card`
 *  - Kleine Kacheln in Karten (Logos, Icons): `rounded-tile`
 *
 * Z-Index-Skala: header 30 · sheet 50 · toast 60 · grain 70
 */
import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

// RGB-Kanäle. Default-Akzent = Cevi-Rot (#e11d48), wird pro Abteilung überschrieben.
const light = {
  '--canvas': '250 250 249',
  '--surface': '254 254 253',
  '--surface-2': '245 244 242',
  '--surface-3': '236 234 231',
  '--line': '228 225 222',
  '--line-strong': '208 204 200',
  '--fg': '28 25 23',
  '--fg-muted': '87 83 78',
  '--fg-subtle': '113 107 102',
  '--success': '22 163 74',
  '--success-ink': '21 128 61',
  '--warning': '217 119 6',
  '--warning-ink': '161 85 6',
  '--danger': '220 38 38',
  '--danger-ink': '185 28 28',
  '--shadow': '41 37 36',
  '--accent-ink': 'var(--accent-ink-light)',
  'color-scheme': 'light',
};

const dark = {
  '--canvas': '12 10 9',
  '--surface': '23 21 19',
  '--surface-2': '33 30 28',
  '--surface-3': '45 41 38',
  '--line': '45 41 38',
  '--line-strong': '68 63 59',
  '--fg': '245 244 242',
  '--fg-muted': '172 166 161',
  '--fg-subtle': '138 132 127',
  '--success': '34 197 94',
  '--success-ink': '74 222 128',
  '--warning': '245 158 11',
  '--warning-ink': '251 191 36',
  '--danger': '239 68 68',
  '--danger-ink': '252 129 129',
  '--shadow': '5 4 3',
  '--accent-ink': 'var(--accent-ink-dark)',
  'color-scheme': 'dark',
};

const accentDefaults = {
  '--accent': '225 29 72',
  '--accent-fg': '255 255 255',
  '--accent-ink-light': '190 18 60',
  '--accent-ink-dark': '251 113 133',
};

// Feines Filmkorn als fixierte Ebene (nie auf scrollenden Containern -> keine Repaints).
const grain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const preset = {
  content: [],
  darkMode: [
    'variant',
    [
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) & }',
      ':root[data-theme="dark"] &',
    ],
  ],
  theme: {
    extend: {
      colors: {
        canvas: token('--canvas'),
        surface: {
          DEFAULT: token('--surface'),
          2: token('--surface-2'),
          3: token('--surface-3'),
        },
        line: { DEFAULT: token('--line'), strong: token('--line-strong') },
        fg: {
          DEFAULT: token('--fg'),
          muted: token('--fg-muted'),
          subtle: token('--fg-subtle'),
        },
        accent: {
          DEFAULT: token('--accent'),
          fg: token('--accent-fg'),
          ink: token('--accent-ink'),
        },
        success: { DEFAULT: token('--success'), ink: token('--success-ink') },
        warning: { DEFAULT: token('--warning'), ink: token('--warning-ink') },
        danger: { DEFAULT: token('--danger'), ink: token('--danger-ink') },
      },
      fontFamily: {
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      // Feinere Stufen für getönte Flächen (bg-accent/12 etc.)
      opacity: {
        6: '0.06',
        8: '0.08',
        12: '0.12',
        14: '0.14',
      },
      borderRadius: {
        tile: '0.875rem',
        field: '0.875rem',
        card: '1.5rem',
      },
      spacing: {
        13: '3.25rem',
        'safe-b': 'env(safe-area-inset-bottom)',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(var(--shadow) / 0.06), 0 4px 16px -6px rgb(var(--shadow) / 0.12)',
        lift: '0 2px 4px rgb(var(--shadow) / 0.08), 0 24px 48px -16px rgb(var(--shadow) / 0.28)',
        glow: '0 8px 24px -10px rgb(var(--accent) / 0.65)',
        'inset-hi': 'inset 0 1px 0 rgb(255 255 255 / 0.06)',
      },
      zIndex: {
        header: '30',
        sheet: '50',
        toast: '60',
        grain: '70',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        'ring-fill': {
          from: { strokeDashoffset: 'var(--ring-c)' },
          to: { strokeDashoffset: 'var(--ring-o)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-up': 'sheet-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 2.2s linear infinite',
        'ring-fill': 'ring-fill 1.1s cubic-bezier(0.16, 1, 0.3, 1) both',
        pop: 'pop 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [
    plugin(({ addBase, addUtilities }) => {
      addBase({
        ':root': { ...light, ...accentDefaults },
        '@media (prefers-color-scheme: dark)': {
          ':root:not([data-theme="light"])': dark,
        },
        ':root[data-theme="dark"]': dark,
        html: {
          backgroundColor: 'rgb(var(--canvas))',
          '-webkit-tap-highlight-color': 'transparent',
          textSizeAdjust: '100%',
        },
        body: {
          backgroundColor: 'rgb(var(--canvas))',
          color: 'rgb(var(--fg))',
          fontFamily: 'var(--font-sans), ui-sans-serif, system-ui, sans-serif',
          fontFeatureSettings: '"ss01", "cv11"',
          '-webkit-font-smoothing': 'antialiased',
          '-moz-osx-font-smoothing': 'grayscale',
          textRendering: 'optimizeLegibility',
        },
        '::selection': {
          backgroundColor: 'rgb(var(--accent) / 0.85)',
          color: 'rgb(var(--accent-fg))',
        },
        ':focus-visible': {
          outline: '2px solid rgb(var(--accent))',
          outlineOffset: '2px',
        },
        // Einheitliche Icon-Strichstärke für lucide-react
        'svg.lucide': { strokeWidth: '1.75' },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      });

      addUtilities({
        // Kaskadierte Einblendung: style={{ '--i': index }}
        '.stagger': { animationDelay: 'calc(var(--i, 0) * 55ms)' },
        '.tabular': { fontVariantNumeric: 'tabular-nums' },
        '.text-balance': { textWrap: 'balance' },
        '.scrollbar-none': {
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
        // Warmer Lagerfeuer-Schein von oben, getönt mit der Abteilungsfarbe
        '.bg-campfire': {
          backgroundImage:
            'radial-gradient(120% 60% at 50% -10%, rgb(var(--accent) / 0.16), transparent 60%), radial-gradient(80% 40% at 100% 0%, rgb(var(--warning) / 0.06), transparent 60%)',
        },
        '.grain': {
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'fixed',
            inset: '0',
            zIndex: '70',
            pointerEvents: 'none',
            opacity: '0.035',
            backgroundImage: grain,
            mixBlendMode: 'overlay',
          },
        },
        '.skeleton': {
          backgroundImage:
            'linear-gradient(90deg, rgb(var(--surface-2)) 0%, rgb(var(--surface-3)) 50%, rgb(var(--surface-2)) 100%)',
          backgroundSize: '200% 100%',
        },
      });
    }),
  ],
} satisfies Config;

export default preset;
