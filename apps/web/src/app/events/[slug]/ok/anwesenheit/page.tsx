'use client';

import { useRouter } from 'next/navigation';
import { EventAttendancePanel } from '@/components/EventAttendancePanel';
import { useOkEvent } from '@/components/ok/OkContext';
import { OkPageHeader } from '@/components/ok/OkLayout';

export default function AttendancePage() {
  const { event, base, reload, permissions } = useOkEvent();
  const router = useRouter();
  return (
    <div>
      <OkPageHeader
        title="Anwesenheit"
        description="Am Anlass abhaken, wer da war. Mit QR-Code checken sich die Helfenden selbst ein."
        help="/ok/anwesenheit/"
      />
      <EventAttendancePanel
        event={event}
        canEditSettings={permissions.canEditSettings}
        onOpenSettings={() => router.push(`${base}/einstellungen#anwesenheit`)}
        onChanged={reload}
      />
    </div>
  );
}
