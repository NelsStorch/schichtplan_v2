import { departmentOgResponse } from '@/lib/ogRender';

/** Vorschaubild der Abteilungs-Seite: Abteilungsname, -logo und -farbe (siehe lib/ogRender.tsx) */
export async function GET() {
  return departmentOgResponse();
}
