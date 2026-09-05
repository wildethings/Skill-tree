import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Served from a subpath on GitHub Pages (https://<user>.github.io/Skill-tree/),
 * so the base is set for dev as well as build. Keeping them the same means the
 * browser checks exercise the real base path rather than a root-served variant
 * that would hide a subpath bug until deploy.
 */
export default defineConfig({
  base: process.env.BASE_PATH ?? '/Skill-tree/',
  plugins: [react()],
  server: { port: 5173 },
  build: { target: 'es2022' },
})
