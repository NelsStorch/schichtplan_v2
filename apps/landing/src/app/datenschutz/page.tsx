import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { helpUrl } from "@schichtplan/shared";
import { ThemeToggle } from "@schichtplan/ui";
import { CeviLogo } from "@/components/CeviLogo";
import { ContactReveal } from "./ContactReveal";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description:
    "Welche Personendaten der Cevi Schichtplan bearbeitet, wozu und welche Rechte du hast (nDSG).",
  // Nicht in Suchmaschinen, keine Kopie im Cache (zusätzlich zu robots.txt)
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
    "max-snippet": 0,
  },
};

// Rechtliche Stammdaten: Platzhalter in eckigen Klammern vor dem Livegang ausfüllen
const STAND = "26. Oktober 2026";

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

export default function DatenschutzPage() {
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
          <ArrowLeft className="size-4" /> <CeviLogo className="size-7" /> Cevi
          Schichtplan
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
            des Cevi Schichtplans bearbeiten, wozu wir das tun und welche Rechte
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
          <p>Diese Erklärung gilt für alle Teile des Cevi Schichtplans:</p>
          <List>
            <li>
              die Landingpage <strong>cevi-schichtplan.ch</strong> mit
              Profilseite,
            </li>
            <li>
              das zentrale Login <strong>login.cevi-schichtplan.ch</strong>,
            </li>
            <li>
              die Schichtpläne der Abteilungen{" "}
              <strong>&lt;abteilung&gt;.cevi-schichtplan.ch</strong>,
            </li>
            <li>
              das Admin-Portal <strong>admin.cevi-schichtplan.ch</strong>,
            </li>
            <li>
              das Hilfe-Center <strong>hilfe.cevi-schichtplan.ch</strong>.
            </li>
          </List>
          <p>
            Die Abteilungen und die Organisationskomitees (OK) ihrer Anlässe
            entscheiden selbst, welche Anlässe sie anlegen, welche Angaben sie
            von Helfenden verlangen und wen sie einteilen. Für diese Entscheide
            und für die Verwendung der Daten ausserhalb der Plattform
            (z.&nbsp;B. eine exportierte Helferliste) ist die jeweilige
            Abteilung verantwortlich.
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
            <li>
              <strong>Cevi.DB:</strong> Cevi.DB-Personen-ID, Vor- und Nachname,
              Cevi-Name, E-Mail, Geburtsdatum, Ortsgruppe sowie deine Rollen in
              der Cevi.DB, soweit wir daraus Abteilung, Stufen und eine
              allfällige Abteilungsleitung ableiten. Deine Postadresse aus der
              Cevi.DB übernehmen und speichern wir nicht.
            </li>
            <li>
              <strong>Cevi-Name (ohne Passwort):</strong> Cevi-Name und
              Geburtsdatum, dazu freiwillig Vor- und Nachname, Handynummer und
              Stufen.
            </li>
          </List>
          <p>
            Freiwillig oder auf Verlangen eines Anlasses kommen dazu:
            Handynummer, Geburtsdatum, Heimabteilung und Stufen (mit Rolle
            Leitung oder Teilnehmer*in) sowie die Einstellung, ob du
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
              Rollen und Rechte in Abteilung und OK (Abteilungsleitung,
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
            Abteilungen, Anlässen, Schichten und Vorlagen. Lade bitte keine
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
            E-Mail bzw. Cevi-Name nur im Arbeitsspeicher; diese Einträge gelten
            höchstens eine Stunde und gehen bei jedem Neustart verloren.
          </p>

          <h3 className="pt-2 font-semibold text-fg">Anonyme Nutzungsstatistik</h3>
          <p>
            Um zu sehen, ob der Schichtplan gut läuft und welche Funktionen
            gebraucht werden, zählen wir Nutzungen als{" "}
            <strong>Summen pro Tag</strong>, z.&nbsp;B. «12 Anmeldungen mit
            Cevi.DB», «3 PDF-Schichtpläne gedruckt» oder «40 Aufrufe der Hilfe
            zum Eintragen». Gespeichert werden nur die Art der Nutzung, eine
            feste Unterteilung (z.&nbsp;B. die Anmeldeart), die Abteilung und
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
              Zugang zu Anlässen prüfen (z.&nbsp;B. nur Mitglieder der
              Abteilung, nur Leitende, bestimmte Stufen),
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
              Schichtplan, wer in welcher Schicht eingetragen ist (Cevi-Name
              bzw. Name). Wer für einen Anlass nicht berechtigt ist, sieht den
              Plan ohne Namen.
            </li>
            <li>
              <strong>OK, Abteilungsleitung und wer das Recht «Alle Anlässe
              sehen» hat</strong> in der betreffenden Abteilung sehen zusätzlich
              Kontaktdaten (E-Mail und Telefon, soweit vorhanden), das Alter sowie Antworten und
              Abmeldungen zu ihren Anlässen.
            </li>
            <li>
              <strong>Globale Administrator*innen</strong> des Betreibers sehen
              im Admin-Portal alle Konten über alle Abteilungen (Profil,
              Anmeldeart, Abteilungen, Rollen, Eintragungen und den Tag der
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
                "Anmeldung (signiertes Sitzungs-Token, für Skripte nicht lesbar), gilt für alle Subdomains von cevi-schichtplan.ch",
                "30 Tage oder bis zur Abmeldung",
              ],
              [
                "cevidb_oauth_state",
                "Schutz der Anmeldung über die Cevi.DB vor Fälschung",
                "10 Minuten",
              ],
              [
                "cevidb_link",
                "Bestätigung, wenn ein bestehendes Konto mit der Cevi.DB verknüpft wird",
                "15 Minuten",
              ],
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
              <strong>Infomaniak Network AG</strong>, Genf, Schweiz: Versand der
              E-Mails (SMTP) und Verwaltung der Domain (DNS).
            </li>
            <li>
              <strong>Cevi.DB</strong> (Hitobito), betrieben vom Dachverband
              Cevi Schweiz, Server in der Schweiz: Wenn du dich über die Cevi.DB
              anmeldest, erhalten wir nach deiner Zustimmung dort dein Profil
              mit E-Mail, Namen und Rollen. Wir schreiben nichts in die Cevi.DB
              zurück. Für die Daten in der Cevi.DB gilt die{" "}
              <a
                href="https://www.cevi.ch/datenschutz/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Datenschutzerklärung des Cevi Schweiz
              </a>
              .
            </li>
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
            Datenschutzverordnung) einen angemessenen Datenschutz. Let&apos;s
            Encrypt in den USA erhält keine Personendaten.
          </p>
        </Section>

        <Section id="dauer" title="8. Wie lange wir Daten aufbewahren">
          <List>
            <li>
              Kontodaten bewahren wir auf, solange dein Konto besteht. Mit
              Cevi.DB oder Passwort kannst du dein Konto jederzeit selbst
              löschen (Profil auf cevi-schichtplan.ch oder Konto-Menü im
              Schichtplan). Dabei werden auch deine Eintragungen, Rollen und
              Antworten gelöscht.
            </li>
            <li>
              Profile, die nur über den Cevi-Namen angemeldet sind, bleiben
              bestehen, bis sie gelöscht werden. Schreib uns, wenn wir dein
              Profil löschen sollen.
            </li>
            <li>
              Anlässe mit ihren Eintragungen bleiben bestehen, bis die Abteilung
              sie löscht.
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
              höchstens aber 40 Tage. Gelöschte Daten können in diesen
              Sicherungen noch enthalten sein, bis sie ersetzt werden.
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
            Im Cevi helfen auch Jugendliche mit. Wir bearbeiten ihre Daten nur
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
            <a href={helpUrl()}>Hilfe-Center</a>.
          </p>
        </Section>
      </main>
    </div>
  );
}
