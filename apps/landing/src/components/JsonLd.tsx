interface JsonLdProps {
  origin: string;
}

export function JsonLd({ origin }: JsonLdProps) {
  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${origin}/#webapp`,
    name: 'Cevi Schichtplan',
    alternateName: [
      'Cevi Schichtplaner',
      'Helferplanung Cevi',
      'Schichtplan für Schweizer Vereine',
      'Helferliste Chilbi',
      'Freiwilligenmanagement Jugendverband',
    ],
    applicationCategory: 'VolunteerManagementApplication',
    operatingSystem: 'All (Web, iOS, Android Progressive Web App)',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    softwareVersion: '2.0',
    isAccessibleForFree: true,
    url: origin,
    image: `${origin}/images/cevi-logo.png`,
    screenshot: `${origin}/og`,
    description:
      'Kostenlose Schicht- und Helferplanung für Cevi-Abteilungen, Schweizer Vereine und Jugendverbände. Helferlisten für Chilbi, Lager und Feste ohne Excel-Chaos.',
    inLanguage: 'de-CH',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'CHF',
      availability: 'https://schema.org/InStock',
    },
    featureList: [
      'Eintragen ohne Passwort & ohne App in unter 10 Sekunden',
      'Offizieller Cevi.DB (Hitobito) Single Sign-On für Leitende',
      'Automatische Mindestalter-Prüfung (z. B. Barbetrieb und Bierausschank ab 18)',
      'Automatische Kalender-Erinnerungen (.ics / Google / Apple)',
      'Live-Übersicht für das Organisationskomitee (OK)',
      '1-Klick-Übernahme aller Schichten als Vorlage vom Vorjahr',
      'Schweizer Datenschutz (nDSG): private Kontaktdaten nur fürs OK sichtbar',
      'Eigene Abteilungs-Subdomain mit Logo und individueller Farbe',
      '100% kostenlos und werbefrei für alle Abteilungen und Vereine',
    ],
    author: {
      '@type': 'Organization',
      name: 'Cevi Schichtplan',
      url: origin,
    },
    creator: {
      '@type': 'Organization',
      name: 'Cevi Schichtplan',
      url: origin,
    },
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: 'Cevi Schichtplan',
    url: origin,
    logo: {
      '@type': 'ImageObject',
      url: `${origin}/images/cevi-logo.png`,
      width: 512,
      height: 512,
    },
    sameAs: [
      'https://github.com/NelsStorch/schichtplan_v2',
      'https://cevi.ch',
    ],
  };

  const howToSchema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${origin}/#howto`,
    name: 'In drei Schritten zum vollen Schichtplan',
    description:
      'So organisiert das Organisationskomitee (OK) Helfereinsätze und Schichten mit dem Cevi Schichtplan.',
    inLanguage: 'de-CH',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Anlass erfassen',
        text: 'Das OK legt Schichten an: wann, was zu tun ist und wie viele Leute es braucht. Mit einer Vorlage vom Vorjahr geht das in Minuten.',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Link teilen',
        text: 'Den Link per WhatsApp, Mail oder Flyer verschicken. Ihr bestimmt, wer sich eintragen darf: alle, nur eure Abteilung oder einzelne Stufen.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'Alle tragen sich ein',
        text: 'Helfer*innen wählen ihre Schicht selbst, auch Eltern und Ehemalige ohne Cevi.DB. Das OK sieht sofort, wo noch Lücken sind.',
      },
    ],
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: origin,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}
