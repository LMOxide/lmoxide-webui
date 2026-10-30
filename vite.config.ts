import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// In development /api goes to lmoxide-api (tools/web-dev-backend.sh in the lmoxide repo), the
// same layout as production behind a reverse proxy. LMOXIDE_API points it elsewhere.
const apiTarget = process.env.LMOXIDE_API ?? 'http://127.0.0.1:8090'

/**
 * What this build is, served as `version.json` next to index.html (the Discord bot's `/version`
 * reads it): the version (`APP_VERSION`, else a `v1.2.3` tag being built, else package.json's),
 * the git commit and its time (`GIT_COMMIT` / `GIT_COMMIT_TIME` in Docker builds, which have no
 * .git; else asked of git) and when it was built (unix times).
 */
function versionJson(): Plugin {
  const git = (args: string) => {
    try {
      return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null
    } catch {
      return null
    }
  }
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { name: string; version: string }
  const tag = process.env.GITHUB_REF_NAME?.match(/^v(\d.*)$/)?.[1]
  const given = process.env.GIT_COMMIT || null
  const commit = given ?? git('rev-parse HEAD')
  const commitTime = given ? process.env.GIT_COMMIT_TIME : commit ? git('log -1 --format=%ct') : null
  return {
    name: 'version-json',
    apply: 'build',
    generateBundle() {
      const info = {
        name: pkg.name,
        version: process.env.APP_VERSION || tag || pkg.version,
        commit,
        commit_time: Number(commitTime) || null,
        built: Math.floor(Date.now() / 1000),
      }
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(info, null, 2) + '\n' })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionJson()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    proxy: {
      '^/api/': { target: apiTarget, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
