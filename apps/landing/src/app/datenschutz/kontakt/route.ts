// Kontaktdaten der verantwortlichen Stelle: stehen nur in der Server-.env (nicht im öffentlichen Repo)
// und werden erst auf Klick geladen, damit sie nicht im HTML der Datenschutzerklärung stehen.
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  // Nur Abrufe aus der Seite selbst (Header setzt ContactReveal), keine direkten Links
  if (request.headers.get("x-privacy-contact") !== "1") {
    return new Response("Not found", { status: 404 });
  }
  const contact = {
    name: process.env.PRIVACY_CONTACT_NAME || "",
    street: process.env.PRIVACY_CONTACT_STREET || "",
    city: process.env.PRIVACY_CONTACT_CITY || "",
    email: process.env.PRIVACY_CONTACT_EMAIL || "",
  };
  return Response.json(contact, {
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive, noai, noimageai",
    },
  });
}
