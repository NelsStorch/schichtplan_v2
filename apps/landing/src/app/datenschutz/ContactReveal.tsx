"use client";

import { useState } from "react";
import { Button } from "@schichtplan/ui";

interface Contact {
  name: string;
  street: string;
  city: string;
  email: string;
}

/** Zeigt die Kontaktdaten erst auf Klick (Schutz vor Scrapern und KI-Crawlern) */
export function ContactReveal() {
  const [contact, setContact] = useState<Contact | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function reveal() {
    setState("loading");
    try {
      const res = await fetch("/datenschutz/kontakt", {
        headers: { "x-privacy-contact": "1" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      setContact(await res.json());
      setState("idle");
    } catch {
      setState("error");
    }
  }

  if (!contact) {
    return (
      <div className="rounded-card border border-line bg-surface p-4">
        <Button
          variant="secondary"
          onClick={reveal}
          disabled={state === "loading"}
        >
          {state === "loading" ? "Wird geladen …" : "Kontaktdaten anzeigen"}
        </Button>
        {state === "error" && (
          <p className="mt-2 text-sm">
            Die Kontaktdaten konnten nicht geladen werden.
          </p>
        )}
      </div>
    );
  }

  if (!contact.name && !contact.email) {
    return (
      <p className="rounded-card border border-line bg-surface p-4">
        Die Kontaktdaten sind noch nicht hinterlegt.
      </p>
    );
  }

  return (
    <address className="rounded-card border border-line bg-surface p-4 not-italic text-fg">
      {contact.name}
      {contact.street && (
        <>
          <br />
          {contact.street}
        </>
      )}
      {contact.city && (
        <>
          <br />
          {contact.city}
        </>
      )}
      {contact.email && (
        <>
          <br />
          E-Mail: <a href={`mailto:${contact.email}`}>{contact.email}</a>
        </>
      )}
    </address>
  );
}
