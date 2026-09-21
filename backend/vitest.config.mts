import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Vitest übersetzt standardmäßig mit esbuild, und esbuild erzeugt keine
    // Decorator-Metadaten. NestJS braucht die für Dependency Injection. SWC kann es.
    swc.vite({ module: { type: 'es6' } }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    setupFiles: ['test/setup.ts'],
    // Integrationstests sprechen dieselbe Datenbank an. Parallel laufende Dateien
    // würden sich gegenseitig die Daten wegräumen.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
