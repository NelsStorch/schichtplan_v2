import type { OrganizationConfig } from '@schichtplan/shared';

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: 'allgemein' | 'funktionen' | 'leitende' | 'datenschutz';
}

export function getFaqItems(org?: OrganizationConfig): FaqItem[] {
  const name = org?.name ?? 'Cevi Schichtplan';
  const orgName = org?.orgName ?? 'Cevi';
  const targetGroup = org?.targetGroup ?? 'Cevi-Abteilungen';
  const unitTerm = org?.unitTerm ?? 'Abteilung';
  const nicknameTerm = org?.nicknameTerm ?? 'Cevi-Name';
  const authProvider = org?.authProviderName ?? 'Cevi.DB (Hitobito)';
  const domain = org?.domain ?? 'cevi-schichtplan.ch';

  return [
    {
      id: 'was-ist-schichtplan',
      category: 'allgemein',
      question: `Was ist der ${name} und für welche Anlässe ist er gedacht?`,
      answer:
        `Der ${name} ist ein kostenloses, werbefreies Web-Tool zur unkomplizierten Schicht- und Helferplanung für Schweizer Jugendverbände (${orgName}, Pfadi, Jubla, Cevi) sowie für Vereine und Festkomitees. Er eignet sich ideal für Chilbi, Dorffeste, Pfingstlager (PfiLa), Sommerlager (SoLa), Sponsorenläufe, Waldweihnachten, Jubiläen und Vereinsanlässe jeder Grösse.`,
    },
    {
      id: 'unterschied-excel-doodle',
      category: 'funktionen',
      question: `Warum ist der ${name} besser als Excel, WhatsApp oder Doodle?`,
      answer:
        `Gegenüber geteilten Excel-Tabellen gibt es kein Versionschaos, kein versehentliches Überschreiben fremder Schichten und keine ungeschützten Telefonnummern. Im Gruppenchat auf WhatsApp gehen Helferwünsche schnell verloren. Und im Vergleich zu Doodle oder Nuudel bietet der ${name} rollenbasierte Schichten, automatische Mindestalter-Prüfungen (z. B. Bierausschank oder Barbetrieb erst ab 18), 1-Klick-Übernahme aller Schichten vom Vorjahr, Kalender-Erinnerungen und Echtzeit-Balken für freie Plätze.`,
    },
    {
      id: 'kosten-und-werbung',
      category: 'allgemein',
      question: `Ist der ${name} wirklich 100% kostenlos und ohne Werbung?`,
      answer:
        `Ja, zu 100%. Der ${name} ist ein unabhängiges, ehrenamtliches Open-Source-Projekt für ${targetGroup}. Es gibt weder Nutzungsgebühren, Abos noch Werbebanner oder Tracker. Die Server stehen in einem Rechenzentrum in Frankfurt am Main (Deutschland); Details stehen in der Datenschutzerklärung.`,
    },
    {
      id: 'anmeldung-helfer',
      category: 'funktionen',
      question: 'Wie tragen sich Helfer*innen ein? Wird eine App oder ein Passwort benötigt?',
      answer:
        `Nein. Helfer*innen müssen weder eine App im App Store herunterladen noch ein Passwort anlegen. Das OK verschickt einfach den Link zum Anlass per WhatsApp, Signal, E-Mail oder als QR-Code auf einem Flyer. Helfer*innen wählen ihre Wunschschicht und tragen sich mit ${nicknameTerm}n (oder Vor- und Nachnamen) und Geburtsdatum in unter 10 Sekunden direkt im Handy-Browser ein.`,
    },
    {
      id: 'auth-anbindung',
      category: 'leitende',
      question: `Wie funktioniert die ${authProvider}-Anbindung für Leitende?`,
      answer:
        `Leitende melden sich per Single Sign-On (OAuth 2.0) direkt mit ihren gewohnten Zugangsdaten von ${authProvider} an. Vorname, Nachname, ${nicknameTerm}, ${unitTerm} und Leitungsrollen werden vollautomatisch übernommen. Leitende erhalten sofort Zugriff auf ihre eigene ${unitTerm} und können sofort Anlässe und Schichten anlegen.`,
    },
    {
      id: 'abteilung-einrichten',
      category: 'leitende',
      question: `Wie richte ich den Schichtplan für meine ${unitTerm} ein?`,
      answer:
        `Melde dich als ${unitTerm}sleitung auf login.${domain} an. Hat deine ${unitTerm} noch keinen Schichtplan, kannst du ihn mit einem einzigen Klick anlegen. Ihr erhaltet sofort eure eigene, feste Adresse (z. B. eure-${unitTerm.toLowerCase()}.${domain}) inklusive individuellem Logo und Farbe.`,
    },
    {
      id: 'datenschutz-sicherheit',
      category: 'datenschutz',
      question: 'Wie wird der Datenschutz (Schweizer nDSG) gewährleistet?',
      answer:
        `Der Schutz persönlicher Daten steht an oberster Stelle: Private Kontaktdaten (Telefonnummern, E-Mail-Adressen, Geburtsdaten) sind in öffentlichen Helferlisten niemals für andere Helfer*innen sichtbar – ganz im Gegensatz zu frei geteilten Google Sheets oder WhatsApp-Listen. Nur das berechtigte OK und die Leitung haben für Notfälle und Schichtkoordination Zugriff auf die Kontaktdaten.`,
    },
    {
      id: 'mindestalter-pruefung',
      category: 'funktionen',
      question: 'Können Schichten mit einem Mindestalter (z. B. Barbetrieb ab 18 Jahren) geschützt werden?',
      answer:
        'Ja. Beim Erfassen einer Schicht kann das OK ein beliebiges Mindestalter festlegen (z. B. 16 Jahre für den Grillstand oder 18 Jahre für Spirituosen an der Bar). Das System prüft das Geburtsdatum der Person automatisch bei der Eintragung und verhindert Fehleinteilungen gemäss Jugendschutzgesetz.',
    },
    {
      id: 'smartphone-pwa',
      category: 'funktionen',
      question: 'Funktioniert der Schichtplan auf dem Smartphone und offline?',
      answer:
        `Ja, der ${name} ist als moderne Progressive Web App (PWA) gebaut. Er funktioniert perfekt auf iPhones und Android-Smartphones und lässt sich auf Wunsch direkt als Icon zum Home-Bildschirm hinzufügen. So hat das OK auch mitten im Festzelt oder am Lagerfeuer alle Einteilungen griffbereit.`,
    },
  ];
}

export const FAQ_ITEMS = getFaqItems();
