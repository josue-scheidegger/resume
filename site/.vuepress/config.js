import { defaultTheme } from '@vuepress/theme-default'
import { defineUserConfig } from 'vuepress/cli'
import { viteBundler } from '@vuepress/bundler-vite'
import { fs, getDirname } from 'vuepress/utils'
import { resolve } from 'node:path'

const here = getDirname(import.meta.url)
const out = resolve(here, '../../out')

// Served by GitHub Pages under the project path (no custom domain).
const base = '/resume/'

// The PDF and its preview are built into out/ by `npm run pdf`, outside the
// site sources: published path → file in out/.
const generated = { 'resume.pdf': 'resume.pdf', 'images/resume.png': 'resume.png' }
const missing = (file) => `${resolve(out, file)} is missing: run \`npm run pdf\` first`

// Copies the generated files into the build.
const resumePdf = {
  name: 'resume-pdf',
  onGenerated: async (app) => {
    for (const [to, from] of Object.entries(generated)) {
      if (!fs.existsSync(resolve(out, from))) throw new Error(missing(from))
      await fs.copy(resolve(out, from), app.dir.dest(to))
    }
  },
}

// Serves the generated files in `npm run site:dev`.
const servePdf = {
  name: 'resume-pdf',
  // Block body: a function returned from configureServer would be run by Vite
  // as a post-middleware hook.
  configureServer: (server) => {
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url || '').split('?')[0])
      const from = path.startsWith(base) && generated[path.slice(base.length)]
      if (!from) return next()
      if (!fs.existsSync(resolve(out, from))) {
        res.statusCode = 404
        return res.end(missing(from))
      }
      res.setHeader('Content-Type', from.endsWith('.pdf') ? 'application/pdf' : 'image/png')
      fs.createReadStream(resolve(out, from)).pipe(res)
    })
  },
}

export default defineUserConfig({
  lang: 'en-US',
  port: 4000,
  title: 'Josué Scheidegger',
  description: 'Have a look at my resumé',
  head: [
    // `head` URLs are not prefixed with `base` automatically.
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
  ],
  theme: defaultTheme({
    //logo: 'https://vuejs.press/images/hero.png',
    navbar: false, //['/', '/get-started'],
    contributors: false, // pas de liste de contributeurs
    themePlugins: {
      // Only the "last updated" date is used; keep the commit history and its
      // authors out of the published pages.
      git: { contributors: false, changelog: false },
    },
  }),
  plugins: [resumePdf],
  bundler: viteBundler({ viteOptions: { plugins: [servePdf] } }),
  public: resolve(here, '../public'),
  dest: resolve(out, 'site'),
  base,
})
