import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

/**
 * ===========================================================================
 * THE ONE SETTING YOU MAY NEED TO CHANGE
 * ===========================================================================
 * Where the published site lives. This decides how links to the JavaScript,
 * models and textures get written into the built page.
 *
 * Right now:                          '/personal-webpage/'
 *   because the repo is called personal-webpage, so GitHub serves it at
 *   https://marines310.github.io/personal-webpage/  - inside a subfolder.
 *
 * If you ever add a custom domain:    '/'
 *   a custom domain points at the site's root (https://yoursite.com), with
 *   no subfolder, so the prefix has to come off. See DEPLOY.md, Part 3.
 *
 * If this is wrong the page loads completely blank with no error on screen,
 * because every file it asks for comes back 404. It is the single most
 * common reason a site that works locally breaks once published.
 *
 * This only applies to the PUBLISHED site. `npm run dev` always serves from
 * plain http://localhost:3000 regardless, so you never have to remember a
 * subfolder while you're working.
 * ===========================================================================
 */
const SITE_BASE = '/personal-webpage/'

export default defineConfig(({ command }) => ({
  root: '.',
  publicDir: 'public',
  base: command === 'build' ? SITE_BASE : '/',
  plugins: [
    wasm(),
    topLevelAwait()
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'esnext',
    rollupOptions: {
      // Two pages: the game itself, and the map editor. The editor lives
      // here rather than in public/ so it can import Three.js and load the
      // real .glb models to preview them.
      input: {
        main: 'index.html',
        editor: 'map-editor.html'
      }
    }
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  },
  server: {
    port: 3000,
    open: true
  }
}))
