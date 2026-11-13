'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Alte Adresse: die Benachrichtigungen sind jetzt ein Tab der Profilseite */
export default function NotificationsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/profil?tab=benachrichtigungen');
  }, [router]);

  return null;
}
