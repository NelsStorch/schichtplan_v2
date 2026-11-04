'use client';


export function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;

  // Präfixe entfernen (@, #, :, !, >)
  const clean = query.replace(/^[@#:!>]/, '').trim();
  if (!clean) return <>{text}</>;

  // Suchwörter splitten
  const words = clean
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (words.length === 0) return <>{text}</>;

  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = words.some((w) => w.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <span
            key={i}
            className="font-bold text-accent-ink underline decoration-accent/40 decoration-1 underline-offset-2"
          >
            {part}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}
