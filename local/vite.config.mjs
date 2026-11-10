import { defineConfig } from 'vite'
import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root,
  plugins: [{ name: 'local-excalidraw-fonts', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = req.url?.split('?')[0]
      if (!path?.startsWith('/fonts/')) return next()
      if (!/^\/fonts\/[a-zA-Z0-9_./-]+\.woff2$/.test(path) || path.includes('..')) { res.statusCode = 404; return res.end() }
      try {
        res.setHeader('Content-Type', 'font/woff2')
        res.end(readFileSync(resolve(root, 'node_modules/@excalidraw/excalidraw/dist/prod', `.${path}`)))
      } catch { res.statusCode = 404; res.end() }
    })
  }, closeBundle() {
    mkdirSync(resolve(root, 'dist/fonts'), { recursive: true })
    cpSync(resolve(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts'), resolve(root, 'dist/fonts'), { recursive: true })
  } }],
  build: { outDir: 'dist', chunkSizeWarningLimit: 5000 },
  server: { fs: { allow: [root] } },
})
