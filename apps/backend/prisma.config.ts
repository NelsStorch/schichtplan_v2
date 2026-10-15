// Prisma 7: Konfiguration der CLI (generate, migrate deploy, db seed).
// .env wird nicht mehr automatisch geladen; im Container kommt DATABASE_URL aus der Umgebung.
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config({ quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Nicht env(): das bricht ab, wenn DATABASE_URL fehlt (z. B. `prisma generate` im Docker-Build).
  // migrate/seed melden eine fehlende URL dann selbst.
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
