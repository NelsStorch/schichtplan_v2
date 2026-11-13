'use client';

import { useEffect } from 'react';
import { getBrowserOrganization } from '@schichtplan/shared';

const REPO_URL = 'https://github.com/NelsStorch/schichtplan_v2';
const SECURITY_URL = `${REPO_URL}/security/advisories/new`;

/** ASCII-Buchstaben (Figlet «Standard»), je 5 Zeilen. Nur was für die Verbandsnamen gebraucht wird. */
const GLYPHS: Record<string, string[]> = {
  A: ['    _    ', '   / \\   ', '  / _ \\  ', ' / ___ \\ ', '/_/   \\_\\'],
  B: [' ____  ', '| __ ) ', '|  _ \\ ', '| |_) |', '|____/ '],
  C: ['  ____ ', ' / ___|', '| |    ', '| |___ ', ' \\____|'],
  D: [' ____  ', '|  _ \\ ', '| | | |', '| |_| |', '|____/ '],
  E: [' _____ ', '| ____|', '|  _|  ', '| |___ ', '|_____|'],
  F: [' _____ ', '|  ___|', '| |_   ', '|  _|  ', '|_|    '],
  I: [' ___ ', '|_ _|', ' | | ', ' | | ', '|___|'],
  J: ['     _ ', '    | |', ' _  | |', '| |_| |', ' \\___/ '],
  L: [' _     ', '| |    ', '| |    ', '| |___ ', '|_____|'],
  N: [' _   _ ', '| \\ | |', '|  \\| |', '| |\\  |', '|_| \\_|'],
  P: [' ____  ', '|  _ \\ ', '| |_) |', '|  __/ ', '|_|    '],
  R: [' ____  ', '|  _ \\ ', '| |_) |', '|  _ < ', '|_| \\_\\'],
  U: [' _   _ ', '| | | |', '| | | |', '| |_| |', ' \\___/ '],
  V: ['__     __', '\\ \\   / /', ' \\ \\ / / ', '  \\ V /  ', '   \\_/   '],
};

function asciiLogo(word: string): string {
  const letters = [...word.toUpperCase()].map((char) => GLYPHS[char]);
  if (letters.some((glyph) => !glyph)) return word.toUpperCase();
  const rows = [0, 1, 2, 3, 4].map((row) => letters.map((glyph) => glyph?.[row] ?? '').join(' '));
  return rows.join('\n');
}

const READER = 'Du liest Code am Lagerfeuer? Allzeit bereit, aber bitte auch fürs Debuggen.';
const REWARD = 'Bezahlung: Ruhm, Ehre und ein Schoggibanane-Zvieri.';

let printed = false;

/** Gibt die Begrüssung in der Browser-Konsole aus (einmal pro Seitenaufruf), passend zum Verband der Domain */
export function printConsoleBanner(): void {
  if (printed || typeof console === 'undefined') return;
  printed = true;

  const org = getBrowserOrganization();
  const big = 'font-size:18px;font-weight:700;';
  const mono = `font-family:monospace;font-weight:700;color:${org.accentInkDark};`;
  const text = 'font-size:13px;';

  console.log(`%c\n${asciiLogo(org.orgName)}\n  S C H I C H T P L A N\n`, mono);
  console.log('%cDu hast die Konsole geöffnet. Respekt, die meisten suchen hier nur den Zurück-Knopf. 🏕️', big);
  console.log(`%c-> ${READER}`, text);
  console.log(
    `%c-> Der Schichtplan ist Open Source und freut sich über Pull Requests. ${REWARD}`,
    text,
  );
  console.log(`%c   Hilf mit: ${REPO_URL}`, `${text}font-weight:700;`);

  console.log(
    '%cSTOPP!',
    'color:#fff;background:#d92d20;font-size:32px;font-weight:900;padding:2px 10px;border-radius:4px;',
  );
  console.log(
    '%cDiese Konsole ist für Entwickler:innen. Wenn dir jemand gesagt hat, du sollst hier etwas einfügen (um «Schichten freizuschalten», «Rechte zu erhalten» oder ähnliches), ist das ein Betrug. Damit kann jemand Fremdes auf dein Konto und die Helferdaten zugreifen. Füge hier nie Code ein, den du nicht verstehst.',
    'color:#d92d20;font-size:14px;font-weight:700;',
  );
  console.log(`%cSicherheitslücke gefunden? Bitte melden (wir sagen auch Danke): ${SECURITY_URL}`, text);
}

/** Im Root-Layout jeder App einbinden */
export function ConsoleBanner() {
  useEffect(() => {
    printConsoleBanner();
  }, []);
  return null;
}
