import type { OrganizationConfig } from '@schichtplan/shared';

interface JsonLdProps {
  origin: string;
  org?: OrganizationConfig;
}

/**
 * Strukturierte Daten als ein verknüpfter Graph (Organization → WebSite → WebApplication).
 * Bewusst ohne HowTo (keine Rich Results mehr seit 2023), ohne FAQPage.
 */
export function JsonLd({ origin, org }: JsonLdProps) {
  const home = `${origin}/`;
  const organizationId = `${origin}/#organization`;
  const name = org?.name ?? 'Cevi Schichtplan';
  const orgName = org?.orgName ?? 'Cevi';
  const targetGroup = org?.targetGroup ?? 'Cevi-Abteilungen';
  const logoUrl = `${origin}${org?.logoUrl ?? '/images/cevi-logo.svg'}`;

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name,
        url: home,
        description: `Unabhängiges, ehrenamtliches Projekt für ${targetGroup}.`,
        logo: {
          '@type': 'ImageObject',
          url: logoUrl,
        },
        sameAs: ['https://github.com/NelsStorch/schichtplan_v2'],
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: home,
        name,
        inLanguage: 'de-CH',
        publisher: { '@id': organizationId },
      },
      {
        '@type': 'WebApplication',
        '@id': `${origin}/#webapp`,
        name,
        alternateName: [`${orgName} Schichtplaner`, `Helferplanung ${orgName}`, 'Helferliste online'],
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        browserRequirements: 'Requires JavaScript. Requires HTML5.',
        isAccessibleForFree: true,
        url: home,
        image: logoUrl,
        screenshot: `${origin}/og`,
        description:
          `Kostenlose Helferliste und Schichtplanung für ${targetGroup}: Lager und Anlässe ohne Excel-Chaos. Eintragen können sich alle Helfer*innen per Link.`,
        inLanguage: 'de-CH',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'CHF',
          availability: 'https://schema.org/InStock',
        },
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
