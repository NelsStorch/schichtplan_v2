import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

export const collections = {
  // Eigene Texte, vor allem die deutschen Texte der Suche (fehlen in Starlight)
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        /** Für wen die Seite ist, erscheint als Chips unter dem Titel */
        audience: z.array(z.enum(['helfer', 'ok', 'abteilung'])).optional(),
        /** H2 als nummerierte Kapitel (01, 02, …), gut für Anleitungen von oben nach unten */
        numbered: z.boolean().optional(),
      }),
    }),
  }),
};
