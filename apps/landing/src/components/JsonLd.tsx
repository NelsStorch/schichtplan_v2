interface JsonLdProps {
  origin: string;
}

/**
 * Strukturierte Daten als ein verknüpfter Graph (Organization → WebSite → WebApplication).
 * Bewusst ohne HowTo (keine Rich Results mehr seit 2023), ohne FAQPage und ohne sameAs auf cevi.ch:
 * Der Cevi Schichtplan ist ein unabhängiges Projekt und nicht der Cevi Schweiz.
 */
export function JsonLd({ origin }: JsonLdProps) {
  const home = `${origin}/`;
  const organizationId = `${origin}/#organization`;

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: 'Cevi Schichtplan',
        url: home,
        description:
          'Unabhängiges, ehrenamtliches Projekt von Cevi-Leitenden. Kein offizielles Angebot des Cevi Schweiz.',
        logo: {
          '@type': 'ImageObject',
          url: `${origin}/images/cevi-logo.png`,
          width: 512,
          height: 512,
        },
        sameAs: ['https://github.com/NelsStorch/schichtplan_v2'],
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: home,
        name: 'Cevi Schichtplan',
        inLanguage: 'de-CH',
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'WebApplication',
        '@id': `${origin}/#webapp`,
        name: 'Cevi Schichtplan',
        alternateName: ['Cevi Schichtplaner', 'Helferplanung Cevi', 'Helferliste Chilbi'],
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        browserRequirements: 'Requires JavaScript. Requires HTML5.',
        isAccessibleForFree: true,
        url: home,
        image: `${origin}/images/cevi-logo.png`,
        screenshot: `${origin}/og`,
        description:
          'Kostenlose Helferliste und Schichtplanung für Cevi-Abteilungen: Chilbi, Lager und Anlässe ohne Excel-Chaos. Eintragen können sich alle Helfer*innen per Link.',
        inLanguage: 'de-CH',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'CHF',
          availability: 'https://schema.org/InStock',
        },
        featureList: [
          'Eintragen ohne Passwort und ohne App in unter 10 Sekunden',
          'Login mit Cevi.DB (Hitobito) für Leitende',
          'Automatische Mindestalter-Prüfung (z. B. Barbetrieb ab 18)',
          'Kalender-Erinnerungen (.ics / Google / Apple)',
          'Live-Übersicht für das Organisationskomitee (OK)',
          '1-Klick-Übernahme aller Schichten als Vorlage vom Vorjahr',
          'Datenschutz nach nDSG: private Kontaktdaten nur fürs OK sichtbar',
          'Eigene Abteilungs-Subdomain mit Logo und individueller Farbe',
          'Kostenlos und werbefrei für alle Cevi-Abteilungen',
        ],
        author: { '@id': organizationId },
        publisher: { '@id': organizationId },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
