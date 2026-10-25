import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'

// Writes dist/sw.js listing every built file, so the app opens offline after the first visit.
// Hashed file names change whenever their content does, so the cache version follows the file list.
function offlineServiceWorker(): Plugin {
  let config: ResolvedConfig
  const listFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name)
      return statSync(path).isDirectory() ? listFiles(path) : [path]
    })

  return {
    name: 'offline-service-worker',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    closeBundle() {
      const outDir = join(config.root, config.build.outDir)
      const files = listFiles(outDir)
        .map((path) => relative(outDir, path).split(sep).join('/'))
        .filter((path) => path !== 'sw.js')
        .sort()
      const template = readFileSync(join(config.root, 'src/sw.template.js'), 'utf8')
      const version = createHash('sha256')
        .update(template)
        .update(files.join('\n'))
        .update(files.map((file) => readFileSync(join(outDir, file)).byteLength).join(','))
        .digest('hex')
        .slice(0, 12)
      writeFileSync(
        join(outDir, 'sw.js'),
        template
          .replace('__CACHE_VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(['./', ...files])),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineServiceWorker()],
})
