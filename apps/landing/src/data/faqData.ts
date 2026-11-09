export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: 'allgemein' | 'funktionen' | 'leitende' | 'datenschutz';
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'was-ist-cevi-schichtplan',
    category: 'allgemein',
    question: 'Was ist der Cevi Schichtplan und für welche Anlässe ist er gedacht?',
    answer:
      'Der Cevi Schichtplan ist ein kostenloses, werbefreies Web-Tool zur unkomplizierten Schicht- und Helferplanung für Schweizer Jugendverbände (insbesondere Cevi / CVJM / YMCA, aber auch Pfadi und Jubla) sowie für Vereine und Festkomitees. Er eignet sich ideal für Chilbi, Dorffeste, Pfingstlager (PfiLa), Sommerlager (SoLa), Sponsorenläufe, Waldweihnachten, Jubiläen und Vereinsanlässe jeder Grösse.',
  },
  {
    id: 'unterschied-excel-doodle',
    category: 'funktionen',
    question: 'Warum ist der Cevi Schichtplan besser als Excel, WhatsApp oder Doodle?',
    answer:
      'Gegenüber geteilten Excel-Tabellen gibt es kein Versionschaos, kein versehentliches Überschreiben fremder Schichten und keine ungeschützten Telefonnummern. Im Gruppenchat auf WhatsApp gehen Helferwünsche schnell verloren. Und im Vergleich zu Doodle oder Nuudel bietet der Cevi Schichtplan rollenbasierte Schichten, automatische Mindestalter-Prüfungen (z. B. Bierausschank oder Barbetrieb erst ab 18), 1-Klick-Übernahme aller Schichten vom Vorjahr, Kalender-Erinnerungen und Echtzeit-Balken für freie Plätze.',
  },
  {
    id: 'kosten-und-werbung',
    category: 'allgemein',
    question: 'Ist der Cevi Schichtplan wirklich 100% kostenlos und ohne Werbung?',
    answer:
      'Ja, zu 100%. Der Cevi Schichtplan ist ein unabhängiges, ehrenamtliches Open-Source-Projekt von und für Cevianer*innen und kein offizielles Angebot des Cevi Schweiz. Es gibt weder Nutzungsgebühren, Abos noch Werbebanner oder Tracker. Die Server stehen in einem Rechenzentrum in Frankfurt am Main (Deutschland); Details stehen in der Datenschutzerklärung.',
  },
  {
    id: 'anmeldung-helfer',
    category: 'funktionen',
    question: 'Wie tragen sich Helfer*innen ein? Wird eine App oder ein Passwort benötigt?',
    answer:
      'Nein. Helfer*innen müssen weder eine App im App Store herunterladen noch ein Passwort anlegen. Das OK verschickt einfach den Link zum Anlass per WhatsApp, Signal, E-Mail oder als QR-Code auf einem Flyer. Helfer*innen wählen ihre Wunschschicht und tragen sich mit Cevi-Namen (oder Vor- und Nachnamen) und Geburtsdatum in unter 10 Sekunden direkt im Handy-Browser ein.',
  },
  {
    id: 'cevidb-anbindung',
    category: 'leitende',
    question: 'Wie funktioniert die Cevi.DB-Anbindung für Leitende?',
    answer:
      'Leitende melden sich per Single Sign-On (OAuth 2.0) direkt mit ihren gewohnten Zugangsdaten der Cevi.DB (Hitobito) an. Vorname, Nachname, Cevi-Name, Ortsgruppe/Abteilung und Leitungsrollen werden vollautomatisch übernommen. Abteilungsleitende erhalten sofort Zugriff auf ihre eigene Abteilung und können sofort Anlässe und Schichten anlegen.',
  },
  {
    id: 'abteilung-einrichten',
    category: 'leitende',
    question: 'Wie richte ich den Schichtplan für meine Cevi-Abteilung ein?',
    answer:
      'Melde dich als Abteilungsleitung auf login.cevi-schichtplan.ch mit deinem Cevi.DB-Account an. Hat deine Abteilung noch keinen Schichtplan, kannst du ihn mit einem einzigen Klick anlegen. Ihr erhaltet sofort eure eigene, feste Adresse (z. B. eure-abteilung.cevi-schichtplan.ch) inklusive individuellem Logo und Abteilungsfarbe.',
  },
  {
    id: 'datenschutz-sicherheit',
    category: 'datenschutz',
    question: 'Wie wird der Datenschutz (Schweizer nDSG) gewährleistet?',
    answer:
      'Der Schutz persönlicher Daten steht an oberster Stelle: Private Kontaktdaten (Telefonnummern, E-Mail-Adressen, Geburtsdaten) sind in öffentlichen Helferlisten niemals für andere Helfer*innen sichtbar – ganz im Gegensatz zu frei geteilten Google Sheets oder WhatsApp-Listen. Nur das berechtigte OK und die Abteilungsleitung haben für Notfälle und Schichtkoordination Zugriff auf die Kontaktdaten.',
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
      'Ja, der Cevi Schichtplan ist als moderne Progressive Web App (PWA) gebaut. Er funktioniert perfekt auf iPhones und Android-Smartphones und lässt sich auf Wunsch direkt als Icon zum Home-Bildschirm hinzufügen. So hat das OK auch mitten im Festzelt oder am Lagerfeuer alle Einteilungen griffbereit.',
  },
];
