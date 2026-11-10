/**
 * Intelligente Namens-Unterscheidung bei doppelten Cevi-Namen.
 *
 * Kaskade gemäss Spezifikation:
 * 1. Kein Konflikt: Plain Cevi-Name (z. B. «Falk»)
 * 2. Konflikt:
 *    - Wenn Stufe eindeutig ist: `Cevi-Name (Stufe)` (z. B. «Falk (Hiskia)»)
 *    - Wenn Stufe gleich oder leer ist, aber Abteilung eindeutig: `Cevi-Name (Abteilung)` (z. B. «Falk (Wetzikon)»)
 *    - Wenn beides nötig ist zur Eindeutigkeit: `Cevi-Name (Stufe, Abteilung)` (z. B. «Falk (Hiskia, Wetzikon)»)
 *    - Wenn Stufe/Abteilung nicht ausreichen oder fehlen: `Vorname v/o Cevi-Name` (z. B. «Max v/o Falk»)
 *    - Wenn Vorname auch identisch ist: `Vorname Nachname v/o Cevi-Name` (z. B. «Max Muster v/o Falk»)
 *    - Falls selbst das kollidiert: `Vorname Nachname v/o Cevi-Name (Stufe/Abteilung)`
 */

export interface DisambiguationCandidate {
  /** Eindeutige Kennung der Person (z. B. userId oder guest identifier) */
  personKey: string;
  nickname?: string | null;
  ceviName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  guestName?: string | null;
  stufe?: string | null;
  departmentName?: string | null;
}

/**
 * Ermittelt die Hauptstufe einer Person:
 * 1. hitobitoStufen / ceviDbStufen mit isPrimary === true, sonst erste Stufe
 * 2. erste zugeordnete Stufe aus stufen
 */
export function extractPrimaryStufe(user: {
  hitobitoStufen?: { groupName: string; isPrimary: boolean }[] | null;
  ceviDbStufen?: { groupName: string; isPrimary: boolean }[] | null;
  stufen?: { stufe: { name: string } }[] | null;
} | null | undefined): string | null {
  if (!user) return null;
  const stufenList = user.hitobitoStufen ?? user.ceviDbStufen;
  if (stufenList && stufenList.length > 0) {
    const primary = stufenList.find((s) => s.isPrimary);
    const name = primary?.groupName?.trim() || stufenList[0]?.groupName?.trim();
    if (name) return name;
  }
  if (user.stufen && user.stufen.length > 0) {
    const name = user.stufen[0]?.stufe?.name?.trim();
    if (name) return name;
  }
  return null;
}

/**
 * Bereinigt den Abteilungsnamen für kompakte Klammer-Darstellung:
 * «Cevi Illnau-Effretikon» -> «Illnau-Effretikon»
 */
export function formatDepartmentShort(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name.replace(/^Cevi\s+/i, '').trim();
  return cleaned || null;
}

/**
 * Berechnet für alle übergebenen Personen die eindeutigen Anzeigenamen.
 * Gibt eine Map von personKey -> displayName zurück.
 */
export function disambiguatePersonNames(
  candidates: DisambiguationCandidate[]
): Map<string, string> {
  const result = new Map<string, string>();

  // 1. Gruppierung nach normalisiertem Cevi-Namen
  const byCeviName = new Map<string, DisambiguationCandidate[]>();
  const withoutCeviName: DisambiguationCandidate[] = [];

  for (const c of candidates) {
    const trimmed = (c.nickname ?? c.ceviName)?.trim();
    if (trimmed) {
      const norm = trimmed.toLowerCase();
      const list = byCeviName.get(norm) ?? [];
      list.push(c);
      byCeviName.set(norm, list);
    } else {
      withoutCeviName.push(c);
    }
  }

  // Personen ohne Cevi-Namen: Standard Vorname Nachname oder Gastname
  for (const c of withoutCeviName) {
    const fullName = `${c.firstName?.trim() || ''} ${c.lastName?.trim() || ''}`.trim();
    const name = c.guestName?.trim() || fullName || c.firstName?.trim() || 'Helfer*in';
    result.set(c.personKey, name);
  }

  // 2. Cevi-Namen ohne Kollision (nur 1 Person im Anlass hat diesen Cevi-Namen)
  for (const [, group] of byCeviName.entries()) {
    if (group.length === 1) {
      result.set(group[0].personKey, group[0].ceviName!.trim());
      continue;
    }

    // 3. Kollision auflösen (2+ Personen mit gleichem Cevi-Namen)
    resolveCollisionGroup(group, result);
  }

  return result;
}

function resolveCollisionGroup(
  group: DisambiguationCandidate[],
  result: Map<string, string>
) {
  const ceviName = group[0].ceviName!.trim();

  // Daten für jede Person aufbereiten
  interface PersonData {
    c: DisambiguationCandidate;
    stufe: string | null;
    dept: string | null;
    firstName: string | null;
    fullName: string | null;
  }

  const people: PersonData[] = group.map((c) => {
    const stufe = c.stufe?.trim() || null;
    const dept = formatDepartmentShort(c.departmentName);
    const fn = c.firstName?.trim() || null;
    const ln = c.lastName?.trim() || null;
    const fullName = [fn, ln].filter(Boolean).join(' ') || fn;
    return { c, stufe, dept, firstName: fn, fullName };
  });

  // Häufigkeiten von Stufe, Abteilung und Kombination zählen
  const stufeCounts = new Map<string, number>();
  const deptCounts = new Map<string, number>();
  const comboCounts = new Map<string, number>();
  const firstNameCounts = new Map<string, number>();
  const fullNameCounts = new Map<string, number>();

  for (const p of people) {
    if (p.stufe) stufeCounts.set(p.stufe.toLowerCase(), (stufeCounts.get(p.stufe.toLowerCase()) || 0) + 1);
    if (p.dept) deptCounts.set(p.dept.toLowerCase(), (deptCounts.get(p.dept.toLowerCase()) || 0) + 1);
    if (p.stufe && p.dept) {
      const combo = `${p.stufe.toLowerCase()}|${p.dept.toLowerCase()}`;
      comboCounts.set(combo, (comboCounts.get(combo) || 0) + 1);
    }
    if (p.firstName) {
      const fn = p.firstName.toLowerCase();
      firstNameCounts.set(fn, (firstNameCounts.get(fn) || 0) + 1);
    }
    if (p.fullName) {
      const fn = p.fullName.toLowerCase();
      fullNameCounts.set(fn, (fullNameCounts.get(fn) || 0) + 1);
    }
  }

  for (const p of people) {
    let resolvedName: string | null = null;

    // Ebene 1: Ist die Stufe vorhanden und eindeutig innerhalb der Gruppe?
    const hasUniqueStufe = p.stufe && (stufeCounts.get(p.stufe.toLowerCase()) || 0) === 1;

    // Ebene 2: Ist die Abteilung vorhanden und eindeutig innerhalb der Gruppe?
    const hasUniqueDept = p.dept && (deptCounts.get(p.dept.toLowerCase()) || 0) === 1;

    // Ebene 3: Ist die Kombination Stufe + Abteilung eindeutig?
    const hasUniqueCombo =
      p.stufe &&
      p.dept &&
      (comboCounts.get(`${p.stufe.toLowerCase()}|${p.dept.toLowerCase()}`) || 0) === 1;

    if (hasUniqueStufe) {
      // Priorität 1: Stufe eindeutig -> Cevi-Name (Stufe)
      resolvedName = `${ceviName} (${p.stufe})`;
    } else if (hasUniqueDept && !p.stufe) {
      // Stufe leer, aber Abteilung eindeutig -> Cevi-Name (Abteilung)
      resolvedName = `${ceviName} (${p.dept})`;
    } else if (hasUniqueCombo) {
      // Beide nötig -> Cevi-Name (Stufe, Abteilung)
      resolvedName = `${ceviName} (${p.stufe}, ${p.dept})`;
    } else if (hasUniqueDept && p.stufe) {
      // Stufe ist nicht eindeutig (gleiche Stufe bei beiden), aber Abteilung ist eindeutig
      resolvedName = `${ceviName} (${p.stufe}, ${p.dept})`;
    }

    // Wenn Stufe / Abteilung nicht reichen oder nicht eindeutig sind:
    if (!resolvedName) {
      // Vorname-Kaskade:
      const hasUniqueFirstName = p.firstName && (firstNameCounts.get(p.firstName.toLowerCase()) || 0) === 1;

      if (hasUniqueFirstName) {
        // Vorname v/o Cevi-Name
        resolvedName = `${p.firstName} v/o ${ceviName}`;
      } else if (p.fullName) {
        const hasUniqueFullName = (fullNameCounts.get(p.fullName.toLowerCase()) || 0) === 1;
        if (hasUniqueFullName) {
          // Vorname Nachname v/o Cevi-Name
          resolvedName = `${p.fullName} v/o ${ceviName}`;
        } else {
          // Vorname Nachname v/o Cevi-Name (Stufe/Abteilung)
          const loc = p.stufe && p.dept ? `${p.stufe}, ${p.dept}` : p.stufe || p.dept || '';
          resolvedName = loc ? `${p.fullName} v/o ${ceviName} (${loc})` : `${p.fullName} v/o ${ceviName}`;
        }
      } else if (p.firstName) {
        resolvedName = `${p.firstName} v/o ${ceviName}`;
      } else {
        // Notfall: Gastname oder Cevi-Name mit Kennung
        const loc = p.stufe && p.dept ? `${p.stufe}, ${p.dept}` : p.stufe || p.dept || '';
        resolvedName = loc ? `${ceviName} (${loc})` : ceviName;
      }
    }

    result.set(p.c.personKey, resolvedName);
  }
}
