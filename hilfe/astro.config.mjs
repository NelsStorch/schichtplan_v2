// Hilfe-Center hilfe.cevi-schichtplan.ch: statische Seite aus Markdown (src/content/docs).
// Starlight liefert Navigation, Suche (Pagefind) und Inhaltsverzeichnis, das Aussehen kommt aus
// src/styles und den Overrides in src/overrides (Design-System «Lagerfeuer» wie die App).
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://hilfe.cevi-schichtplan.ch',
  trailingSlash: 'ignore',
  vite: {
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
        },
      },
    },
  },
  integrations: [
    starlight({
      title: 'Cevi Schichtplan Hilfe',
      description: 'Anleitungen für Helfer*innen, OK und Abteilungsleitung: eintragen, Schichten planen, Zugang regeln.',
      defaultLocale: 'root',
      // «de» statt «de-CH»: nur so findet die Suche (Pagefind) ihre deutschen Texte
      locales: { root: { label: 'Deutsch', lang: 'de' } },
      favicon: '/favicon.ico',
      credits: false,
      lastUpdated: false,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      customCss: ['./src/styles/fonts.css', './src/styles/theme.css', './src/styles/content.css'],
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '48x48' } },
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' } },
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon-48x48.png', type: 'image/png', sizes: '48x48' } },
        { tag: 'link', attrs: { rel: 'icon', href: '/icon-192.png', type: 'image/png', sizes: '192x192' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://cevi-schichtplan.ch/og' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://cevi-schichtplan.ch/og' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0c0a09', media: '(prefers-color-scheme: dark)' } },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#fafaf9', media: '(prefers-color-scheme: light)' } },
      ],
      components: {
        Header: './src/overrides/Header.astro',
        SiteTitle: './src/overrides/SiteTitle.astro',
        ThemeSelect: './src/overrides/ThemeSelect.astro',
        Hero: './src/overrides/Hero.astro',
        PageTitle: './src/overrides/PageTitle.astro',
        MarkdownContent: './src/overrides/MarkdownContent.astro',
        Footer: './src/overrides/Footer.astro',
        Pagination: './src/overrides/Pagination.astro',
      },
      sidebar: [
        {
          label: 'Erste Schritte',
          items: ['start/ueberblick', 'start/anmelden', 'start/abteilung-und-stufen'],
        },
        {
          label: 'Mithelfen',
          items: [
            'helfen/eintragen',
            'helfen/angaben-und-fragen',
            'helfen/austragen',
            'helfen/ersatz-suchen',
            'helfen/meine-schichten',
            'helfen/einchecken',
            'helfen/nicht-freigeschaltet',
            'helfen/mindestalter',
            'helfen/konto',
          ],
        },
        {
          label: 'Im OK',
          items: [
            'ok/ok-bereich',
            {
              label: 'Planung & Schichten',
              collapsed: false,
              items: [
                'ok/anlass-erstellen',
                'ok/schichten-planen',
                'ok/arbeiten-katalog',
                'ok/vorlagen',
                'ok/design',
              ],
            },
            {
              label: 'Helfende & Zugang',
              collapsed: false,
              items: [
                'ok/zugang',
                'ok/zugangs-links',
                'ok/fragen',
                'ok/helfer-pool',
                'ok/einteilen',
                'ok/nachrichten',
              ],
            },
            {
              label: 'Am Anlass & Auswertung',
              collapsed: false,
              items: [
                'ok/anwesenheit',
                'ok/export',
                'ok/auswertung',
              ],
            },
            'ok/rollen',
          ],
        },
        {
          label: 'Abteilungsleitung',
          items: [
            'abteilung/anlegen',
            'abteilung/einstellungen',
            'abteilung/stufen',
            'abteilung/personen',
            'abteilung/rechte',
            'abteilung/cevidb',
          ],
        },
        {
          label: 'Nachschlagen',
          items: ['wissen/faq', 'wissen/wer-sieht-was', 'wissen/glossar', 'wissen/kontakt'],
        },
      ],
    }),
  ],
});
