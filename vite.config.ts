import { defineConfig } from 'vite';

// Even Hub loads the entrypoint from inside the .ehpk, so assets must use relative paths.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
