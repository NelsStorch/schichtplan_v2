'use client';

import { EventAccessPanel } from '@/components/EventAccessPanel';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';

export default function AccessPage() {
  const { event } = useOkEvent();
  return (
    <div>
      <OkPageHeader
        title="Zugang & Antworten"
        description="Wer sich eintragen darf, Zugangs-Links für Personen ausserhalb dieser Regeln und die Antworten auf eure Fragen."
        help="/ok/zugangs-links/"
      />
      <EventAccessPanel event={event} />
    </div>
  );
}
