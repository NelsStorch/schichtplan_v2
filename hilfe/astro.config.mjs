// Hilfe-Center hilfe.cevi-schichtplan.ch: statische Seite aus Markdown (src/content/docs).
// Starlight liefert Navigation, Suche (Pagefind) und Inhaltsverzeichnis, das Aussehen kommt aus
// src/styles und den Overrides in src/overrides (Design-System «Lagerfeuer» wie die App).
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://hilfe.cevi-schichtplan.ch',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'Cevi Schichtplan Hilfe',
      description: 'Anleitungen für Helfer*innen, OK und Abteilungsleitung: eintragen, Schichten planen, Zugang regeln.',
      defaultLocale: 'root',
      // «de» statt «de-CH»: nur so findet die Suche (Pagefind) ihre deutschen Texte
      locales: { root: { label: 'Deutsch', lang: 'de' } },
      favicon: '/favicon.svg',
      credits: false,
      lastUpdated: false,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      customCss: ['./src/styles/fonts.css', './src/styles/theme.css', './src/styles/content.css'],
      head: [
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
            'ok/rollen',
            'ok/anlass-erstellen',
            'ok/schichten-planen',
            'ok/arbeiten-katalog',
            'ok/zugang',
            'ok/fragen',
            'ok/zugangs-links',
            'ok/einteilen',
            'ok/helfer-pool',
            'ok/nachrichten',
            'ok/anwesenheit',
            'ok/export',
            'ok/auswertung',
            'ok/vorlagen',
            'ok/design',
          ],
        },
        {
          label: 'Abteilungsleitung',
          items: [
            'abteilung/anlegen',
            'abteilung/einstellungen',
            'abteilung/stufen',
            'abteilung/personen',
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
