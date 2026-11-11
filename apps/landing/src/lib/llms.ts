import {
  ORGANIZATIONS,
  getRootDomain,
  helpUrl,
  statusUrl,
  type OrganizationConfig,
  type OrganizationSlug,
} from '@schichtplan/shared';

/**
 * Inhalt von /llms.txt und /llms-full.txt, passend zur aufgerufenen Verbandsdomain
 * (cevi-, pfadi-, jubla- und vereins-schichtplan.ch). Gemeinsame Eckdaten stehen einmal hier,
 * die Verbands-Unterschiede in `PROFILES`.
 */

const REPO_URL = 'https://github.com/NelsStorch/schichtplan_v2';

interface OrgProfile {
  /** Verband, dessen Datenbank für den Login genutzt wird (null = kein Verband, Login mit E-Mail und Passwort) */
  federation: string | null;
  /** Wer die Zielgruppe ist, als Satzteil nach «für» */
  audience: string;
  /** Wer die Zielgruppe konkret nutzt, für die Zielgruppen-Zeile */
  audienceDetail: string;
  /** Beispiel-Subdomain, z. B. «eure-abteilung» */
  exampleSlug: string;
  /** Typische Anlässe, in Fliesstext und Stichworten */
  events: string;
  /** Konkrete Einsatzbeispiele (Aufzählung für «Geeignet für») */
  useCases: string[];
  /** Anlässe für die wiederkehrende Vorlage */
  recurring: string;
  /** Anlässe für den Einsatzbeispiel-Abschnitt in der ausführlichen Beschreibung */
  detailedExamples: string[];
  /** Beispiel für Schichtmuster in Lagern */
  camps: string | null;
}

const PROFILES: Record<OrganizationSlug, OrgProfile> = {
  cevi: {
    federation: 'Cevi Schweiz',
    audience: 'Cevi-Abteilungen in der Schweiz',
    audienceDetail: 'Cevi-Abteilungen und die Organisationskomitees (OK) ihrer Anlässe',
    exampleSlug: 'eure-abteilung',
    events: 'Chilbi, Pfingstlager, Sommerlager und Vereinsanlässe',
    recurring: 'jährliche Chilbi, PfiLa, SoLa',
    useCases: [
      'Helferliste oder Schichtplan für eine Chilbi, ein Dorffest oder einen Vereinsanlass einer Cevi-Abteilung',
      'Küchen-, Material- und Fahrdienste im Pfingstlager oder Sommerlager, auch mit Eltern und Ehemaligen',
      'Abteilungen, die Helferdaten nicht in offenen Excel- oder WhatsApp-Listen teilen wollen',
    ],
    detailedExamples: [
      '**Chilbi und Dorffest**: Schichten meist in Blöcken von 2 bis 3 Stunden, etwa «Aufbau», «Grill», «Getränke», «Kasse», «Bar» und «Abbau». Den Link teilt das OK im Gruppenchat oder als QR-Code auf dem Flyer.',
      '**Pfingstlager (PfiLa) und Sommerlager (SoLa)**: Kochteams, Materialtransporte und Fahrdienste werden für Eltern und Ehemalige freigegeben.',
      '**Jubiläen und Feste**: Helfereinteilung nach Rollen statt Zettelwirtschaft.',
    ],
    camps: 'Pfingstlager (PfiLa) und Sommerlager (SoLa)',
  },
  pfadi: {
    federation: 'Pfadibewegung Schweiz (PBS)',
    audience: 'Pfadi-Abteilungen in der Schweiz',
    audienceDetail: 'Pfadi-Abteilungen und die Organisationskomitees (OK) ihrer Anlässe',
    exampleSlug: 'eure-abteilung',
    events: 'Pfingstlager, Sommerlager (SoLa) und Anlässe der Abteilung',
    recurring: 'jährliches Pfingstlager, SoLa, Abteilungsfest',
    useCases: [
      'Helferliste oder Schichtplan für ein Abteilungsfest, einen Pfadi-Anlass oder ein Dorffest',
      'Küchen-, Material- und Fahrdienste im Pfingstlager oder Sommerlager, auch mit Eltern und Ehemaligen',
      'Abteilungen, die Helferdaten nicht in offenen Excel- oder WhatsApp-Listen teilen wollen',
    ],
    detailedExamples: [
      '**Abteilungsfest und Dorffest**: Schichten meist in Blöcken von 2 bis 3 Stunden, etwa «Aufbau», «Grill», «Getränke», «Kasse», «Bar» und «Abbau». Den Link teilt das OK im Gruppenchat oder als QR-Code auf dem Flyer.',
      '**Pfingstlager (PfiLa) und Sommerlager (SoLa)**: Kochteams, Materialtransporte und Fahrdienste werden für Eltern und Ehemalige freigegeben.',
      '**Jubiläen und Waldweihnachten**: Helfereinteilung nach Rollen statt Zettelwirtschaft.',
    ],
    camps: 'Pfingstlager (PfiLa) und Sommerlager (SoLa)',
  },
  jubla: {
    federation: 'Jungwacht Blauring Schweiz (Jubla)',
    audience: 'Jubla-Scharen in der Schweiz',
    audienceDetail: 'Jubla-Scharen und die Organisationskomitees (OK) ihrer Anlässe',
    exampleSlug: 'eure-schar',
    events: 'Lager, Scharanlässe und Feste',
    recurring: 'jährliches Sommerlager, Scharfest, Pfarreianlässe',
    useCases: [
      'Helferliste oder Schichtplan für ein Scharfest, einen Pfarreianlass oder ein Dorffest',
      'Küchen-, Material- und Fahrdienste im Lager, auch mit Eltern und Ehemaligen',
      'Scharen, die Helferdaten nicht in offenen Excel- oder WhatsApp-Listen teilen wollen',
    ],
    detailedExamples: [
      '**Scharfest und Dorffest**: Schichten meist in Blöcken von 2 bis 3 Stunden, etwa «Aufbau», «Grill», «Getränke», «Kasse», «Bar» und «Abbau». Den Link teilt das OK im Gruppenchat oder als QR-Code auf dem Flyer.',
      '**Lager**: Kochteams, Materialtransporte und Fahrdienste werden für Eltern und Ehemalige freigegeben.',
      '**Jubiläen und Feste**: Helfereinteilung nach Rollen statt Zettelwirtschaft.',
    ],
    camps: 'Lager',
  },
  verein: {
    federation: null,
    audience: 'Vereine und Festkomitees in der Schweiz',
    audienceDetail: 'Vereine, Festkomitees und die Organisationskomitees (OK) ihrer Anlässe',
    exampleSlug: 'euer-verein',
    events: 'Vereinsfeste, Turniere und Anlässe aller Art',
    recurring: 'jährliches Vereinsfest, Turnier, Dorffest',
    useCases: [
      'Helferliste oder Schichtplan für ein Vereinsfest, ein Turnier oder ein Dorffest',
      'Festkomitees, die Helfer*innen für Aufbau, Festwirtschaft und Abbau einteilen',
      'Vereine, die Helferdaten nicht in offenen Excel- oder WhatsApp-Listen teilen wollen',
    ],
    detailedExamples: [
      '**Vereinsfest und Dorffest**: Schichten meist in Blöcken von 2 bis 3 Stunden, etwa «Aufbau», «Grill», «Getränke», «Kasse», «Bar» und «Abbau». Den Link teilt das OK im Gruppenchat oder als QR-Code auf dem Flyer.',
      '**Turniere**: Spielleitung, Festwirtschaft und Parkdienst werden für Mitglieder, Eltern und Freunde des Vereins freigegeben.',
      '**Jubiläen und Feste**: Helfereinteilung nach Rollen statt Zettelwirtschaft.',
    ],
    camps: null,
  },
};

/** «Abteilungsleitung», «Scharleitung», «Vereinsleitung» */
function leadershipTerm(org: OrganizationConfig): string {
  return org.unitTerm.endsWith('r') ? `${org.unitTerm}leitung` : `${org.unitTerm}sleitung`;
}

/** «Jede Abteilung», «Jede Schar», «Jeder Verein» */
function eachUnit(org: OrganizationConfig): string {
  return org.unitTerm === 'Verein' ? 'Jeder Verein' : `Jede ${org.unitTerm}`;
}

/** «der Abteilung», «der Schar», «des Vereins» */
function ofUnit(org: OrganizationConfig): string {
  return org.unitTerm === 'Verein' ? 'des Vereins' : `der ${org.unitTerm}`;
}

function loginUrl(host: string): string {
  const root = getRootDomain(host);
  return root === 'localhost' ? 'http://localhost:3002/' : `https://login.${root}/`;
}

function exampleDomain(org: OrganizationConfig, profile: OrgProfile): string {
  return `${profile.exampleSlug}.${org.domain}`;
}

/** Hinweis, dass das Projekt nicht vom Verband stammt (entfällt bei Vereinen) */
function independence(profile: OrgProfile): string {
  return profile.federation
    ? `Es ist ein unabhängiges, ehrenamtliches Open-Source-Projekt und kein offizielles Angebot von ${profile.federation}.`
    : 'Es ist ein unabhängiges, ehrenamtliches Open-Source-Projekt.';
}

/** Zeile zum Login der Leitenden, je nach Verband mit Datenbank oder mit E-Mail und Passwort */
function leaderLogin(org: OrganizationConfig, profile: OrgProfile): string {
  return profile.federation
    ? `Anmeldung per OAuth 2.0 mit den gewohnten ${org.authProviderShort}-Zugangsdaten. Name, ${org.nicknameTerm}, ${org.unitTerm} und Leitungsrollen werden übernommen.`
    : 'Anmeldung mit E-Mail und Passwort. Die Leitung richtet den Schichtplan des Vereins selbst ein.';
}

function siblings(current: OrganizationConfig): string {
  return Object.values(ORGANIZATIONS)
    .filter((o) => o.slug !== current.slug)
    .map((o) => `- [${o.name}](https://${o.domain}/): für ${o.targetGroup}`)
    .join('\n');
}

export function buildLlmsTxt(org: OrganizationConfig, origin: string, host: string): string {
  const profile = PROFILES[org.slug];
  const leadership = leadershipTerm(org);
  const setup = profile.federation
    ? `Eine ${org.unitTerm} kann nur von ihrer ${leadership} mit ${org.authProviderShort}-Login eingerichtet werden.`
    : `Ein Verein wird von seiner Leitung eingerichtet (Anmeldung mit E-Mail und Passwort).`;

  const lines = [
    `# ${org.name}`,
    '',
    `> ${org.name} ist eine kostenlose, werbefreie Web-App für Helferlisten und Schichtpläne für ${profile.audience}, etwa für ${profile.events}. ${independence(profile)}`,
    '',
    `${setup} Eintragen können sich danach alle Helfer*innen über einen Link, auch Eltern, Ehemalige und Leute aus anderen Vereinen, ohne Konto und ohne App.`,
    '',
    '## Überblick',
    '',
    `- [Startseite](${origin}/): Funktionen, Ablauf in drei Schritten und Vergleich mit Excel, WhatsApp und Doodle`,
    `- [Ausführliche Beschreibung](${origin}/llms-full.txt): Funktionen, Berechtigungen, Datenschutz und Einsatzbeispiele im Detail`,
    `- [Datenschutzerklärung](${origin}/datenschutz): welche Daten bearbeitet werden, Hosting, Aufbewahrung und Rechte nach nDSG`,
    `- [Hilfe-Center](${helpUrl('/', host)}/): Anleitungen für Helfer*innen, OK und ${leadership}`,
    `- [System-Status](${statusUrl('/', host)}/): Verfügbarkeit der Dienste`,
    '',
    '## Eckdaten',
    '',
    `- **Zielgruppe**: ${profile.audienceDetail}`,
    '- **Kosten**: kostenlos (0 CHF), keine Abos, keine Werbung',
    '- **Tracking**: keine Werbe- oder Drittanbieter-Tracker, nur eine anonyme Nutzungsstatistik ohne Cookies',
    '- **Hosting**: Server in einem Rechenzentrum in Frankfurt am Main (Deutschland). Verschlüsselte Sicherungskopien liegen zusätzlich bei Google Drive und bei Infomaniak in der Schweiz. Details in der Datenschutzerklärung.',
    '- **Datenschutz**: Telefonnummern, E-Mail-Adressen und Geburtsdaten sieht nur das berechtigte OK, nie die anderen Helfer*innen',
    '',
    '## Kernfunktionen',
    '',
    '1. **Eintragen in 10 Sekunden ohne App und ohne Passwort**: Helfer*innen öffnen den Link zum Anlass im Handy-Browser und tragen sich direkt ein.',
    profile.federation
      ? `2. **Login mit ${org.authProviderName} für Leitende**: ${leaderLogin(org, profile)}`
      : `2. **Login für Leitende**: ${leaderLogin(org, profile)}`,
    '3. **Automatische Mindestalter-Prüfung**: Schichten mit Altersgrenze (z. B. Barbetrieb ab 16 oder 18 Jahren) prüfen das Geburtsdatum bei der Eintragung.',
    '4. **Live-Übersicht für das OK**: Belegungsbalken pro Schicht zeigen jederzeit, wo noch Helfer*innen fehlen.',
    `5. **Vorlage vom Vorjahr**: Wiederkehrende Anlässe (${profile.recurring}) übernehmen alle Schichten mit einem Klick.`,
    '6. **Kalender-Erinnerung**: Einsatz per Knopfdruck in Apple Kalender, Google Kalender oder Outlook (.ics) übernehmen.',
    `7. **Eigene Subdomain**: z. B. \`${exampleDomain(org, profile)}\` mit Logo und eigener Farbe.`,
    '8. **Progressive Web App (PWA)**: läuft auf iPhone und Android im Browser, bereits geladene Schichtpläne bleiben auch bei schlechtem Netz lesbar.',
    '',
    '## Vergleich mit Alternativen',
    '',
    '- **Excel / Google Sheets**: kein Versionschaos, kein Überschreiben fremder Einträge, keine Handynummern, die alle sehen',
    '- **WhatsApp-Gruppen**: Schichtwünsche gehen nicht im Chat unter, kein manuelles Auszählen',
    `- **Doodle / Nuudel**: für Schichten mit fester Anzahl Plätze gebaut, mit Rollenrechten, Altersgrenzen${profile.federation ? ` und ${org.authProviderShort}-Login` : ' und Login für die Leitung'}`,
    '',
    '## Geeignet für',
    '',
    ...profile.useCases.map((u) => `- ${u}`),
    '',
    '## Weitere Ausgaben',
    '',
    'Dieselbe Software läuft für vier Zielgruppen, jeweils mit eigener Domain, eigenem Login und getrennten Daten. Neben diesem Angebot gibt es:',
    '',
    siblings(org),
    '',
    '## Optional',
    '',
    `- [Quellcode auf GitHub](${REPO_URL}): Repository des Projekts`,
    `- [Zentraler Login](${loginUrl(host)}): Anmeldung ${profile.federation ? `mit ${org.authProviderShort}` : 'mit E-Mail und Passwort'}`,
    '',
  ];

  return lines.join('\n');
}

export function buildLlmsFullTxt(org: OrganizationConfig, origin: string, host: string): string {
  const profile = PROFILES[org.slug];
  const leadership = leadershipTerm(org);
  const unitSubdomain = `<${org.unitTerm.toLowerCase()}>.${org.domain}`;
  const hasFederation = profile.federation !== null;

  const lines = [
    `# ${org.name} – ausführliche Beschreibung`,
    '',
    `> Diese Datei beschreibt Zweck, Funktionen, Berechtigungen und Datenschutz des ${org.name}s. Sie richtet sich an Suchmaschinen, Sprachmodelle und alle, die das Projekt genauer kennenlernen wollen. Massgebend für den Datenschutz ist die [Datenschutzerklärung](${origin}/datenschutz).`,
    '',
    '## 1. Projekt',
    '',
    `- **Name**: ${org.name}`,
    `- **Website**: [${org.domain}](${origin}/)`,
    '- **Art**: Ehrenamtliche Open-Source-Web-App',
    `- **Betrieb**: Unabhängiges, ehrenamtliches Projekt.${hasFederation ? ` Kein offizielles Angebot von ${profile.federation}.` : ''}`,
    `- **Zielgruppe**: ${profile.audienceDetail}. ${
      hasFederation
        ? `Eine ${org.unitTerm} richtet ihre ${leadership} mit ${org.authProviderShort}-Login ein; eintragen können sich danach alle Helfer*innen, auch Eltern, Ehemalige und Leute aus anderen Vereinen.`
        : 'Der Verein wird von seiner Leitung mit E-Mail und Passwort eingerichtet; eintragen können sich danach alle Helfer*innen, auch Mitglieder, Eltern, Freunde und Leute aus anderen Vereinen.'
    }`,
    '- **Kosten**: Kostenlos (0 CHF), keine Abos, keine Transaktionsgebühren, keine Werbung.',
    `- **Quellcode**: [GitHub-Repository](${REPO_URL})`,
    `- **Weitere Ausgaben**: dieselbe Software gibt es auch für andere Zielgruppen, mit eigener Domain und getrennten Daten (siehe Abschnitt 8).`,
    '',
    '## 2. Technik',
    '',
    '- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript',
    '- **Komponenten**: gemeinsames Design-System (`@schichtplan/ui`), Progressive Web App (PWA)',
    '- **Backend**: Fastify 5 mit TypeScript-REST-API',
    '- **Datenbank**: PostgreSQL 17 mit Prisma 7',
    '- **Zeitzone**: Alle Termine und Schichtzeiten laufen in **Europe/Zurich**. Server und Container laufen in UTC, die Umrechnung erfolgt automatisch.',
    "- **Hosting**: Server bei Avoro (dataforest GmbH) in einem Rechenzentrum in Frankfurt am Main, Deutschland. Traefik als Reverse Proxy, TLS-Zertifikate von Let's Encrypt. Verschlüsselte Sicherungskopien liegen zusätzlich bei Google Drive und bei Infomaniak in der Schweiz; die Schlüssel hat nur das Projekt.",
    '',
    '## 3. Datenschutz (nDSG)',
    '',
    'In vielen Vereinen werden Helferlisten offen per Excel oder WhatsApp geteilt. Dann sehen alle die Handynummern und E-Mail-Adressen aller anderen.',
    '',
    `Der ${org.name} trennt das:`,
    '',
    `- **Trennung nach ${org.unitTermPlural}**: ${eachUnit(org)} hat eine eigene Subdomain (\`${unitSubdomain}\`).`,
    `- **Öffentliche Helferlisten**: Helfer*innen sehen bei anderen nur Name bzw. ${org.nicknameTerm}. Telefonnummern, Geburtsdaten und E-Mail-Adressen sind für sie nicht sichtbar.`,
    `- **Zugriff des OK**: Nur das berechtigte Organisationskomitee (OK) und die ${leadership} sehen Kontaktdaten, für Notfälle und die Einsatzkoordination.`,
    '- **Kein Werbe-Tracking**: Kein Google Analytics, kein Meta Pixel, keine Werbe-Cookies. Es gibt nur eine anonyme Nutzungsstatistik ohne Cookies.',
    '',
    '## 4. Berechtigungen und Anmeldung',
    '',
    '### A. Helfer*innen (ohne Konto)',
    '- Tragen sich über den vom OK geteilten Link in wenigen Sekunden ein.',
    '- Brauchen kein Passwort und kein Konto.',
    `- Angaben: Vorname und Nachname (oder ${org.nicknameTerm}), Handynummer für Notfälle und Geburtsdatum für die Altersprüfung.`,
    '- Können den Einsatz als Kalendereintrag übernehmen (.ics für Apple Kalender, Google Kalender, Outlook).',
    '',
    hasFederation
      ? `### B. Leitende und Anlass-OK (Login mit ${org.authProviderShort})`
      : '### B. Leitende und Anlass-OK (Login mit E-Mail und Passwort)',
    hasFederation
      ? `- Melden sich mit ihren Zugangsdaten der ${org.authProviderName} (betrieben von ${profile.federation}) per OAuth 2.0 an.`
      : '- Melden sich mit E-Mail-Adresse und Passwort an.',
    hasFederation
      ? `- Name, ${org.nicknameTerm}, Rollen und ${org.unitTerm} werden übernommen.`
      : '- Name und Verein werden beim Einrichten erfasst.',
    '- Das OK verwaltet Schichten, sieht die Belegung live und kann Einteilungen bearbeiten.',
    '',
    `### C. ${leadership}`,
    `- Richtet den Schichtplan ${ofUnit(org)} ein (eigene Subdomain).`,
    '- Verwaltet Einstellungen wie Farbe, Logo und Vorlagen.',
    '- Kann Anlässe vergangener Jahre mit einem Klick als Vorlage übernehmen.',
    '',
    '## 5. Funktionen im Detail',
    '',
    '1. **Eintragen ohne Hürden**: Für das Handy gebaut, ohne App-Store-Download und ohne Passwort.',
    '2. **Mindestalter**: Schichten können ein Mindestalter haben (z. B. 16 Jahre für Bier und Wein, 18 Jahre für Spirituosen an der Bar). Das Geburtsdatum wird bei der Eintragung automatisch geprüft.',
    `3. **Vorlage vom Vorjahr**: Wiederkehrende Anlässe (${profile.recurring}) übernehmen alle Schichten mit einem Klick ins neue Jahr.`,
    '4. **Live-Übersicht**: Farbige Belegungsbalken zeigen sofort, welche Schichten noch frei sind.',
    '5. **Mehrere Anlässe**: Mehrere Anlässe lassen sich gleichzeitig planen, jedes OK sieht seinen Anlass.',
    '6. **PWA**: Bereits geladene Schichtpläne bleiben auch bei schwachem Netz im Festzelt oder Lagerhaus lesbar.',
    '',
    '## 6. Einsatzbeispiele',
    '',
    ...profile.detailedExamples.map((e) => `- ${e}`),
    '',
    '## 7. Wichtige Adressen',
    '',
    `- [Startseite](${origin}/)`,
    `- [Zentraler Login](${loginUrl(host)})`,
    `- [Hilfe-Center](${helpUrl('/', host)}/)`,
    `- [System-Status](${statusUrl('/', host)}/)`,
    `- [Datenschutzerklärung](${origin}/datenschutz)`,
    `- [GitHub-Repository](${REPO_URL})`,
    '',
    '## 8. Weitere Ausgaben',
    '',
    'Dieselbe Software läuft für vier Zielgruppen, jeweils mit eigener Domain, eigenem Login und getrennten Daten. Neben diesem Angebot gibt es:',
    '',
    siblings(org),
    '',
  ];

  return lines.join('\n');
}
