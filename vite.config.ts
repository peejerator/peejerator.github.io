import { defineConfig } from 'vite';

export default defineConfig({
  // User/org Pages site (peejerator.github.io) is served from the domain root,
  // so base stays '/'. For a *project* repo you'd set this to '/repo-name/'.
  base: '/',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
  },
});
