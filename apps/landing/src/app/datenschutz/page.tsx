import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  ORGANIZATIONS,
  getOrganization,
  getVocabulary,
  helpUrl,
  type OrganizationConfig,
  type OrganizationSlug,
} from "@schichtplan/shared";
import { ThemeToggle } from "@schichtplan/ui";
import { getRequestOrigin } from "@schichtplan/ui/og";
import { BrandLogo } from "@/components/CeviLogo";
import { ContactReveal } from "./ContactReveal";

export async function generateMetadata(): Promise<Metadata> {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  return {
    title: "Datenschutzerklärung",
    description: `Welche Personendaten der ${org.name} bearbeitet, wozu und welche Rechte du hast (nDSG).`,
    // Eigener Canonical statt dem der Startseite (aus dem Layout), sonst widersprechen sich die Signale
    alternates: { canonical: "/datenschutz" },
    // Nicht in Suchmaschinen, keine Kopie im Cache (zusätzlich zu robots.txt)
    robots: {
      index: false,
      follow: false,
      nocache: true,
      noarchive: true,
      "max-snippet": 0,
    },
  };
}

const STAND = "11. November 2026";

/**
 * Betreiber der Verbandsdatenbank (Hitobito), über die man sich anmelden kann, samt deren Datenschutz-Seite.
 * Vereine haben keine Verbandsdatenbank (Anmeldung mit E-Mail und Passwort).
 */
const FEDERATION_DB: Record<
  OrganizationSlug,
  { operator: string; where: string; policyLabel: string; policyUrl: string } | null
> = {
  cevi: {
    operator: "vom Dachverband Cevi Schweiz",
    where: ", Server in der Schweiz",
    policyLabel: "Datenschutzerklärung des Cevi Schweiz",
    policyUrl: "https://www.cevi.ch/datenschutz/",
  },
  pfadi: {
    operator: "von der Pfadibewegung Schweiz (PBS)",
    where: "",
    policyLabel: "Datenschutz der Pfadibewegung Schweiz",
    policyUrl: "https://pfadi.swiss/de/verband/datenschutz/",
  },
  jubla: {
    operator: "von Jungwacht Blauring Schweiz",
    where: "",
    policyLabel: "Datenschutzerklärung von Jungwacht Blauring Schweiz",
    policyUrl: "https://www.jubla.ch/datenschutz",
  },
  verein: null,
};

/** Begriffe der Verbandsdomain: Abteilung, Schar oder Verein samt passendem Artikel */
function wording(org: OrganizationConfig) {
  const vocab = getVocabulary(org.dbType);
  const isVerein = org.slug === "verein";
  const unit = org.unitTerm;
  return {
    vocab,
    unit,
    units: org.unitTermPlural,
    leadership: vocab.departmentLeader,
    nickname: org.nicknameTerm,
    /** «die Abteilung», «die Schar», «der Verein» */
    the: isVerein ? "der Verein" : `die ${unit}`,
    /** «der Abteilung», «der Schar», «des Vereins» */
    ofThe: isVerein ? "des Vereins" : `der ${unit}`,
    /** «die jeweilige Abteilung», «der jeweilige Verein» */
    respective: isVerein ? "der jeweilige Verein" : `die jeweilige ${unit}`,
    /** «in der betreffenden Abteilung», «im betreffenden Verein» */
    inConcerned: isVerein ? "im betreffenden Verein" : `in der betreffenden ${unit}`,
    /** «Im Cevi», «In der Pfadi», «In der Jubla», «In Vereinen» */
    inOrg: { cevi: "Im Cevi", pfadi: "In der Pfadi", jubla: "In der Jubla", verein: "In Vereinen" }[org.slug],
    federation: FEDERATION_DB[org.slug],
  };
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="font-display text-xl font-bold tracking-tight text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-fg-subtle">
      {children}
    </ul>
  );
}

function StorageTable({
  rows,
}: {
  rows: [name: string, purpose: string, duration: string][];
}) {
  // Mobil als Karten untereinander, ab sm als dreispaltige Tabelle
  return (
    <div className="overflow-hidden rounded-card border border-line text-sm">
      <div
        aria-hidden
        className="hidden border-b border-line bg-surface-2 px-3 py-2 font-semibold text-fg sm:grid sm:grid-cols-[11rem_1fr_9rem] sm:gap-4"
      >
        <span>Name</span>
        <span>Zweck</span>
        <span>Dauer</span>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([name, purpose, duration]) => (
          <div
            key={name}
            className="grid gap-1 px-3 py-2.5 sm:grid-cols-[11rem_1fr_9rem] sm:gap-4"
          >
            <dt className="break-all font-mono text-xs leading-6 text-fg">
              {name}
            </dt>
            <dd>{purpose}</dd>
            <dd className="text-fg-subtle sm:text-fg-muted">{duration}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function DatenschutzPage() {
  const { host } = await getRequestOrigin();
  const org = getOrganization(host);
  const w = wording(org);
  const fed = w.federation;
  const dbShort = org.authProviderShort;
  return (
    <div className="min-h-[100dvh] bg-canvas text-fg">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-campfire opacity-60"
      />
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-fg-muted transition hover:text-fg"
        >
          <ArrowLeft className="size-4" />{" "}
          <BrandLogo logoUrl={org.logoUrl} alt={org.name} className="size-7" />{" "}
          {org.name}
        </Link>
        <ThemeToggle />
      </header>

      <main
        id="inhalt"
        className="mx-auto w-full max-w-3xl space-y-10 px-4 pb-20 pt-4 text-[15px] leading-relaxed text-fg-muted sm:px-6 [&_a]:font-medium [&_a]:text-fg [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-fg"
      >
        <div className="space-y-3">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
            Datenschutzerklärung
          </h1>
          <p>
            Diese Erklärung beschreibt, welche Personendaten wir beim Betrieb
            des {org.name}s bearbeiten, wozu wir das tun und welche Rechte
            du hast. Sie richtet sich nach dem Schweizer Bundesgesetz über den
            Datenschutz (DSG) und der Datenschutzverordnung (DSV).
          </p>
          <p className="text-sm text-fg-subtle">Stand: {STAND}</p>
        </div>

        <Section id="verantwortlich" title="1. Verantwortliche Stelle">
          <p>
            Verantwortlich für die Datenbearbeitung auf dieser Plattform ist:
          </p>
          <ContactReveal />
          <p>
            Für Fragen zum Datenschutz und zur Ausübung deiner Rechte erreichst
            du uns unter dieser Adresse.
          </p>
        </Section>

        <Section id="geltung" title="2. Geltungsbereich">
          <p>Diese Erklärung gilt für alle Teile des {org.name}s:</p>
          <List>
            <li>
              die Landingpage <strong>{org.domain}</strong> mit Profilseite,
            </li>
            <li>
              das zentrale Login <strong>login.{org.domain}</strong>,
            </li>
            <li>
              die Schichtpläne der {w.units}{" "}
              <strong>
                &lt;{w.unit.toLowerCase()}&gt;.{org.domain}
              </strong>
              ,
            </li>
            <li>
              das Hilfe-Center <strong>hilfe.{org.domain}</strong>,
            </li>
            <li>
              das Admin-Portal <strong>admin.cevi-schichtplan.ch</strong>, das
              für alle vier Angebote gemeinsam genutzt wird und nur globalen
              Administrator*innen offensteht.
            </li>
          </List>
          <p>
            Dieselbe Plattform läuft unter vier Domains:{" "}
            {Object.values(ORGANIZATIONS).map((o, i, all) => (
              <span key={o.slug}>
                <strong>{o.domain}</strong>
                {i < all.length - 2 ? ", " : i === all.length - 2 ? " und " : ""}
              </span>
            ))}
            . Diese Erklärung gilt für alle vier.
          </p>
          <p>
            Die {w.units} und die Organisationskomitees (OK) ihrer Anlässe
            entscheiden selbst, welche Anlässe sie anlegen, welche Angaben sie
            von Helfenden verlangen und wen sie einteilen. Für diese Entscheide
            und für die Verwendung der Daten ausserhalb der Plattform
            (z.&nbsp;B. eine exportierte Helferliste) ist {w.respective}{" "}
            verantwortlich.
          </p>
        </Section>

        <Section id="daten" title="3. Welche Daten wir bearbeiten">
          <h3 className="font-semibold text-fg">Konto und Profil</h3>
          <p>Je nach Anmeldeart speichern wir:</p>
          <List>
            <li>
              <strong>E-Mail und Passwort:</strong> E-Mail-Adresse, Passwort
              (nur als bcrypt-Hash, nie im Klartext), Vor- und Nachname, ob die
              E-Mail bestätigt ist.
            </li>
            {fed && (
              <li>
                <strong>{dbShort}:</strong> {dbShort}-Personen-ID, Vor- und
                Nachname, {w.nickname}, E-Mail, Geburtsdatum,{" "}
                {org.slug === "cevi" ? "Ortsgruppe" : `Angabe deiner ${w.unit}`}{" "}
                sowie deine Rollen
                in der {dbShort}, soweit wir daraus {w.unit},{" "}
                {w.vocab.groupPlural} und eine allfällige {w.leadership}{" "}
                ableiten. Dafür lesen wir beim Login auch die Gruppenstruktur zu
                deinen Rollen (
                {org.slug === "cevi"
                  ? "welche Gruppe zu welcher Jungschar und Ortsgruppe gehört"
                  : "welche Gruppe zu welcher übergeordneten Gruppe gehört"}
                ). Deine Postadresse aus der {dbShort} übernehmen und
                speichern wir nicht.
              </li>
            )}
            <li>
              <strong>{w.nickname} (ohne Passwort):</strong> {w.nickname} und
              Geburtsdatum, dazu freiwillig Vor- und Nachname, Handynummer und{" "}
              {w.vocab.groupPlural}.
            </li>
          </List>
          <p>
            Freiwillig oder auf Verlangen eines Anlasses kommen dazu:
            Handynummer, Geburtsdatum, Heim{w.unit.toLowerCase()} und{" "}
            {w.vocab.groupPlural} (mit Rolle Leitung oder Teilnehmer*in) sowie die Einstellung, ob du
            Schicht-Erinnerungen erhalten möchtest.
          </p>
          <p>
            Nach dem Grundsatz der Datensparsamkeit speichern wir in deinem
            Profil <strong>keine Postadresse</strong>. Braucht ein OK sie für
            einen Anlass (z.&nbsp;B. für einen Versand), fragt es beim Anlass
            danach; die Antwort gehört nur zu diesem Anlass und wird nach der
            angegebenen Frist gelöscht (siehe Abschnitt 8).
          </p>

          <h3 className="pt-2 font-semibold text-fg">Schichtplanung</h3>
          <List>
            <li>
              Eintragungen in Schichten und Arbeiten, mit Zeitpunkt und
              allfälliger Notiz,
            </li>
            <li>
              Antworten auf Fragen, die ein OK zu seinem Anlass stellt
              (z.&nbsp;B. Adresse, Allergien, Notfallkontakt oder
              T-Shirt-Grösse). Beim Ausfüllen steht bei jeder Frage, wann die
              Antwort gelöscht wird,
            </li>
            <li>
              Abmeldungen von einem Anlass mit freiwilligem Grund. Bitte gib
              dort keine Gesundheitsangaben an, ein allgemeiner Grund wie
              «verhindert» reicht,
            </li>
            <li>
              Rollen und Rechte in {w.unit} und OK ({w.leadership},
              einzelne Rechte wie «Anlässe erstellen», OK-Leitung,
              OK-Mitglied) sowie ein Protokoll, wer wem welche Rechte gegeben
              hat,
            </li>
            <li>
              Personen, die ein OK von Hand einträgt (Name, allenfalls E-Mail
              und Telefon), auch ohne eigenes Konto,
            </li>
            <li>Zugangs-Links zu Anlässen und wer sie eingelöst hat.</li>
          </List>

          <h3 className="pt-2 font-semibold text-fg">Inhalte von Planenden</h3>
          <p>
            Logos, Banner und Bilder, die Planende hochladen, sowie Texte zu
            {w.unit === "Verein" ? "Vereinen" : w.units}, Anlässen, Schichten
            und Vorlagen. Lade bitte keine
            Bilder hoch, auf denen Personen ohne deren Einverständnis erkennbar
            sind.
          </p>

          <h3 className="pt-2 font-semibold text-fg">Technische Daten</h3>
          <p>
            Bei jedem Aufruf verarbeiten unsere Server technisch nötige Angaben:
            IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, HTTP-Methode,
            Statuscode, übertragene Datenmenge, die zuvor besuchte Seite
            (Referrer) und die Kennung deines Browsers (User-Agent). Diese
            Protokolle nutzen wir nur zur Fehlersuche und zum Schutz vor
            Missbrauch. Das Protokoll des Webservers (Reverse Proxy) wird
            täglich gewechselt und nach 14 Tagen gelöscht. Die Protokolle der
            Anwendung sind in der Grösse begrenzt und werden spätestens bei der
            nächsten Aktualisierung der Software gelöscht. Zum Schutz vor
            Passwort-Erraten zählen wir Fehlversuche pro IP-Adresse und pro
            E-Mail bzw. {w.nickname} nur im Arbeitsspeicher; diese Einträge gelten
            höchstens eine Stunde und gehen bei jedem Neustart verloren.
          </p>

          <h3 className="pt-2 font-semibold text-fg">Anonyme Nutzungsstatistik</h3>
          <p>
            Um zu sehen, ob der Schichtplan gut läuft und welche Funktionen
            gebraucht werden, zählen wir Nutzungen als{" "}
            <strong>Summen pro Tag</strong>, z.&nbsp;B. «12 Anmeldungen mit{" "}
            {dbShort}», «3 PDF-Schichtpläne gedruckt» oder «40 Aufrufe der Hilfe
            zum Eintragen». Gespeichert werden nur die Art der Nutzung, eine
            feste Unterteilung (z.&nbsp;B. die Anmeldeart), {w.the} und
            der Tag. Für den Betrieb zählen wir zusätzlich pro Stunde, wie viele
            Anfragen eine Funktion des Servers bekam, wie lange die Antwort
            dauerte und ob Fehler auftraten; dabei speichern wir nur das Muster
            der Adresse (z.&nbsp;B. «Anlass ansehen»), nie die echte Adresse
            mit Namen von Anlässen, Zugangs- oder Check-in-Codes.
          </p>
          <p>
            Dafür speichern wir <strong>keine</strong> IP-Adresse, keine
            Kennung deines Browsers oder Geräts, kein Cookie und nichts, was
            einer Person zugeordnet werden kann. Dein Browser meldet nur
            Nutzungen, die auf dem Server nicht sichtbar sind (z.&nbsp;B. ein
            PDF-Export, die Fenstergrösse als «Handy», «Tablet» oder «Computer»
            und ob die dunkle Darstellung aktiv ist). Hast du in deinem Browser
            «nicht verfolgen» eingestellt (Global Privacy Control oder Do Not
            Track), schickt er keine solchen Meldungen.
          </p>
          <p>
            Pro Konto speichern wir einzig den <strong>letzten Tag</strong>,
            an dem du den Schichtplan angemeldet genutzt hast (nur das Datum,
            ohne Uhrzeit). Daraus zählen wir, wie viele Personen pro Tag, Woche
            und Monat aktiv sind, und erkennen lange unbenutzte Konten.
          </p>
        </Section>

        <Section id="zweck" title="4. Wozu wir die Daten bearbeiten">
          <List>
            <li>
              Konto anlegen, Anmeldung (Single Sign-On über alle Subdomains) und
              Schutz des Kontos,
            </li>
            <li>
              Schichten planen, Helfende einteilen und Anlässe durchführen,
            </li>
            <li>
              Zugang zu Anlässen prüfen (z.&nbsp;B. nur Mitglieder{" "}
              {w.ofThe}, nur Leitende, bestimmte {w.vocab.groupPlural}),
            </li>
            <li>
              Mindestalter prüfen: Bei Schichten mit Altersgrenze (z.&nbsp;B.
              Bar ab 18) prüfen wir dein Alter anhand des Geburtsdatums,
            </li>
            <li>
              Kontakt zwischen OK und Helfenden, etwa bei kurzfristigen
              Änderungen,
            </li>
            <li>
              E-Mails: Bestätigung der E-Mail-Adresse, Zurücksetzen des
              Passworts und Erinnerung 24 Stunden vor deinen Schichten (im
              Profil abschaltbar),
            </li>
            <li>Betrieb, Sicherheit und Fehlerbehebung der Plattform,</li>
            <li>
              anonyme Nutzungsstatistik, um den Schichtplan zu verbessern
              (siehe Abschnitt 3).
            </li>
          </List>
          <p>
            Wir verwenden die Daten nicht für Werbung, verkaufen sie nicht und
            erstellen keine Profile über dein Verhalten.
          </p>
        </Section>

        <Section id="sichtbarkeit" title="5. Wer deine Daten sieht">
          <List>
            <li>
              <strong>Andere Helfende</strong> eines Anlasses sehen im
              Schichtplan, wer in welcher Schicht eingetragen ist ({w.nickname}
              bzw. Name). Wer für einen Anlass nicht berechtigt ist, sieht den
              Plan ohne Namen.
            </li>
            <li>
              <strong>OK, {w.leadership} und wer das Recht «Alle Anlässe
              sehen» hat</strong> {w.inConcerned} sehen zusätzlich
              Kontaktdaten (E-Mail und Telefon, soweit vorhanden), das Alter sowie Antworten und
              Abmeldungen zu ihren Anlässen.
            </li>
            <li>
              <strong>Globale Administrator*innen</strong> des Betreibers sehen
              im Admin-Portal alle Konten über alle vier Angebote und alle
              Abteilungen, Scharen und Vereine (Profil, Anmeldeart,
              Zugehörigkeit, Rollen, Eintragungen und den Tag der
              letzten Nutzung) sowie die anonyme Nutzungsstatistik und können
              Konten löschen. Dieser Zugriff ist auf wenige Personen beschränkt
              und dient Support und Missbrauchsbekämpfung.
            </li>
          </List>
        </Section>

        <Section id="speicher" title="6. Cookies und lokaler Speicher">
          <p>
            Wir setzen <strong>nur technisch notwendige Cookies</strong>. Es
            gibt keine Analyse-, Tracking- oder Werbe-Cookies und keine
            Einbindung von Diensten wie Google Analytics, Facebook oder YouTube.
            Die Schriften sind selbst gehostet, beim Aufruf entsteht also keine
            Verbindung zu Google. Die anonyme Nutzungsstatistik (Abschnitt 3)
            kommt ohne Cookies und ohne lokalen Speicher aus.
          </p>
          <StorageTable
            rows={[
              [
                "token",
                `Anmeldung (signiertes Sitzungs-Token, für Skripte nicht lesbar),gilt für alle Subdomains von ${org.domain}`,
                "30 Tage oder bis zur Abmeldung",
              ],
              ...(fed
                ? ([
                    [
                      "cevidb_oauth_state",
                      `Schutz der Anmeldung über die ${dbShort} vor Fälschung`,
                      "10 Minuten",
                    ],
                    [
                      "cevidb_link",
                      `Bestätigung, wenn ein bestehendes Konto mit der ${dbShort} verknüpft wird`,
                      "15 Minuten",
                    ],
                  ] as [string, string, string][])
                : []),
            ]}
          />
          <p>
            Im lokalen Speicher deines Browsers (Local Storage) legen wir ab:
          </p>
          <StorageTable
            rows={[
              [
                "cevi-theme",
                "Gewähltes Farbschema (hell/dunkel)",
                "bis du es zurücksetzt",
              ],
              [
                "schichtplan.eventView",
                "Gewählte Ansicht eines Anlasses",
                "bis du es löschst",
              ],
            ]}
          />
          <p>
            Diese Einträge verlassen deinen Browser nicht. Du kannst Cookies und
            Local Storage in den Browser-Einstellungen löschen; ohne das Cookie{" "}
            <code>token</code> ist keine Anmeldung möglich.
          </p>
        </Section>

        <Section id="dritte" title="7. Dienstleister und Weitergabe">
          <p>
            Für den Betrieb arbeiten wir mit folgenden Dienstleistern zusammen:
          </p>
          <List>
            <li>
              <strong>Hosting:</strong> Avoro, ein Angebot der dataforest GmbH,
              Kriftel, Deutschland. Der Server steht in einem Rechenzentrum in
              Frankfurt am Main. Dort laufen alle Anwendungen und die Datenbank
              mit ihren Sicherungen.
            </li>
            <li>
              <strong>Google Drive</strong> (Google Ireland Limited, Dublin,
              Irland): Speicherort für eine zusätzliche Sicherungskopie
              ausserhalb des Rechenzentrums. Die Sicherungen werden schon auf
              unserem Server verschlüsselt, bevor sie hochgeladen werden. Den
              Schlüssel zum Entschlüsseln haben nur wir, nicht Google. Google
              kann die Inhalte deshalb nicht lesen.
            </li>
            <li>
              <strong>Infomaniak Network AG</strong>, Genf, Schweiz: Versand der
              E-Mails (SMTP), Verwaltung der Domains (DNS) und Speicherort einer
              verschlüsselten Sicherungskopie der Datenbank in der Schweiz. Wie
              bei Google Drive verschlüsseln wir die Sicherung vor dem Hochladen;
              Infomaniak kann sie nicht lesen.
            </li>
            {fed && (
              <li>
                <strong>{org.authProviderName}</strong>, betrieben{" "}
                {fed.operator}
                {fed.where}: Wenn du dich über die {dbShort} anmeldest, erhalten
                wir nach deiner Zustimmung dort dein Profil mit E-Mail, Namen
                und Rollen. Wir schreiben nichts in die {dbShort} zurück. Für
                die Daten in der {dbShort} gilt die Datenschutzerklärung des
                Verbands (
                <a
                  href={fed.policyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {fed.policyLabel}
                </a>
                ).
              </li>
            )}
            <li>
              <strong>Let&apos;s Encrypt</strong> (ISRG, USA): stellt die
              TLS-Zertifikate aus. Dabei werden nur Domainnamen übermittelt,
              keine Personendaten.
            </li>
          </List>
          <p>
            Darüber hinaus geben wir Personendaten nur weiter, wenn wir
            gesetzlich dazu verpflichtet sind.
          </p>
          <p>
            Durch das Hosting werden deine Daten in Deutschland gespeichert.
            Deutschland bietet nach der Liste des Bundesrats (Anhang 1 der
            Datenschutzverordnung) einen angemessenen Datenschutz, ebenso
            Irland. Google kann die verschlüsselte Sicherungskopie auch in
            Rechenzentren ausserhalb Europas, etwa in den USA, speichern; dort
            liegen nur verschlüsselte Daten, die ohne unseren Schlüssel nicht
            lesbar sind. Let&apos;s Encrypt in den USA erhält keine
            Personendaten.
          </p>
        </Section>

        <Section id="dauer" title="8. Wie lange wir Daten aufbewahren">
          <List>
            <li>
              Kontodaten bewahren wir auf, solange dein Konto besteht. Mit{" "}
              {fed ? `${dbShort} oder Passwort` : "Passwort"} kannst du dein
              Konto jederzeit selbst löschen (Profil auf {org.domain} oder
              Konto-Menü im Schichtplan). Dabei werden auch deine Eintragungen, Rollen und
              Antworten gelöscht.
            </li>
            <li>
              Profile, die nur über den {w.nickname}n angemeldet sind, bleiben
              bestehen, bis sie gelöscht werden. Schreib uns, wenn wir dein
              Profil löschen sollen.
            </li>
            <li>
              Anlässe mit ihren Eintragungen bleiben bestehen, bis {w.the} sie
              löscht.
            </li>
            <li>
              Antworten auf die Fragen eines Anlasses löschen wir automatisch
              nach der Frist, die das OK pro Frage festlegt: direkt nach dem
              Anlass oder 10, 30, 90 bzw. 365 Tage danach (gezählt ab dem Ende
              der letzten Schicht). Die Frist steht beim Ausfüllen neben der
              Frage. Nur wenn das OK ausdrücklich «Nie löschen» wählt, bleiben
              die Antworten bis zur Löschung des Anlasses oder deines Kontos
              bestehen.
            </li>
            <li>
              Links zum Bestätigen der E-Mail und zum Zurücksetzen des Passworts
              verfallen nach kurzer Zeit.
            </li>
            <li>
              Die anonyme Nutzungsstatistik bewahren wir zwei Jahre auf, die
              Stundenwerte zum Betrieb des Servers 90 Tage (danach nur noch als
              Tagessumme). Der Tag der letzten Nutzung wird mit dem Konto
              gelöscht.
            </li>
            <li>
              Wir sichern die Datenbank jede Nacht und bewahren diese
              Sicherungen 14 Tage auf. Zusätzlich sichern wir sie vor jeder
              Aktualisierung der Software und behalten davon die letzten zehn,
              höchstens aber 40 Tage.
            </li>
            <li>
              Zusätzlich legen wir jede Nacht eine verschlüsselte Kopie der
              Datenbank und der hochgeladenen Bilder in Google Drive ab (siehe
              Abschnitt 7). Davon behalten wir die Sicherungen der letzten
              sieben Tage, je eine pro Woche für vier Wochen und je eine pro
              Monat für sechs Monate. Ältere Sicherungen werden gelöscht und
              nach weiteren 30 Tagen endgültig aus dem Papierkorb entfernt.
            </li>
            <li>
              Ebenfalls jede Nacht legen wir eine verschlüsselte Kopie der
              Datenbank bei Infomaniak in der Schweiz ab (siehe Abschnitt 7).
              Davon behalten wir die Sicherungen der letzten 14 Tage, die
              Sonntage der letzten acht Wochen und die Monatsersten der letzten
              sechs Monate. Einmal im Monat spielen wir eine dieser Sicherungen
              probeweise in eine vorübergehende Datenbank auf unserem Server
              ein, um zu prüfen, ob sie sich wiederherstellen lässt; diese
              Datenbank wird gleich danach gelöscht.
            </li>
            <li>
              Gelöschte Daten können in diesen Sicherungen noch enthalten sein,
              bis die jeweilige Sicherung gelöscht wird, also höchstens rund
              sieben Monate. Wir verwenden Sicherungen nur, um nach einem Fehler
              oder Ausfall den Betrieb wiederherzustellen.
            </li>
          </List>
        </Section>

        <Section id="sicherheit" title="9. Datensicherheit">
          <p>
            Alle Verbindungen sind mit TLS (HTTPS) verschlüsselt. Passwörter
            speichern wir nur als Hash, das Anmelde-Cookie ist für Skripte nicht
            lesbar, Anmeldeversuche sind begrenzt, und die Datenbank ist im
            Netzwerk vom Internet getrennt. Zugriff auf die Server haben nur die
            verantwortlichen Personen des Betreibers. Eine absolute Sicherheit
            kann trotzdem niemand garantieren.
          </p>
        </Section>

        <Section id="kinder" title="10. Kinder und Jugendliche">
          <p>
            {w.inOrg} helfen auch Jugendliche mit. Wir bearbeiten ihre Daten nur
            im oben beschriebenen Umfang. Jugendliche unter 14 Jahren sollten
            ein Konto nur mit Einverständnis ihrer Eltern anlegen.
          </p>
        </Section>

        <Section id="rechte" title="11. Deine Rechte">
          <p>
            Im Rahmen des Datenschutzgesetzes hast du insbesondere das Recht,
          </p>
          <List>
            <li>
              Auskunft darüber zu verlangen, welche Daten wir über dich
              bearbeiten,
            </li>
            <li>
              unrichtige Daten berichtigen zu lassen (vieles kannst du direkt im
              Profil ändern),
            </li>
            <li>
              die Löschung deiner Daten zu verlangen oder einer Bearbeitung zu
              widersprechen,
            </li>
            <li>
              deine Daten in einem gängigen elektronischen Format zu erhalten
              oder übertragen zu lassen, soweit sie auf deiner Zustimmung oder
              einem Vertrag beruhen.
            </li>
          </List>
          <p>
            Schreib uns dazu an die E-Mail-Adresse unter Punkt 1. Wir können
            verlangen, dass du dich ausweist. Ausserdem kannst du dich beim
            Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB)
            beschweren:{" "}
            <a
              href="https://www.edoeb.admin.ch"
              target="_blank"
              rel="noopener noreferrer"
            >
              www.edoeb.admin.ch
            </a>
            .
          </p>
        </Section>

        <Section id="aenderungen" title="12. Änderungen">
          <p>
            Wir passen diese Erklärung an, wenn sich die Plattform oder die
            Rechtslage ändert. Es gilt die jeweils hier veröffentlichte Fassung.
            Fragen zur Bedienung beantwortet das{" "}
            <a href={helpUrl("/", host)}>Hilfe-Center</a>.
          </p>
        </Section>
      </main>
    </div>
  );
}
