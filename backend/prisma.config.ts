import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Die .env liegt im Wurzelverzeichnis des Monorepos, nicht in backend/.
// Prisma 7 laedt sie nicht mehr von selbst.
loadEnv({ path: ['../.env', '.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
