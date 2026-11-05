#!/usr/bin/env node
// Renders the PDF résumé (and its PNG preview) from the YAML data.
//
//   node pdf/build.mjs [--pdf out.pdf] [--png out.png] [--png-width 583] [--debug]
//
// Data: data/resume.yaml (+ data/pdf.yaml, data/skills.yaml, data/hobbies.yaml,
// data/photo.jpg). The page itself is pdf/page.html + page.css + render.js,
// laid out and printed by headless Chromium (Playwright). Output: out/.

import { readFile, readdir, mkdir } from 'node:fs/promises'
import { dirname, join, resolve, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import * as yaml from 'js-yaml'
import QRCode from 'qrcode'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = join(root, 'data')
const out = join(root, 'out')

const { values: opt } = parseArgs({
  options: {
    pdf: { type: 'string', default: join(out, 'resume.pdf') },
    png: { type: 'string', default: join(out, 'resume.png') },
    'png-width': { type: 'string', default: '583' },
    debug: { type: 'boolean', default: false },
  },
})

// CORE_SCHEMA keeps dates such as `from: 1982-02-16T20:07:42Z` as strings.
const load = async (p) => yaml.load(await readFile(p, 'utf8'), { schema: yaml.CORE_SCHEMA })

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base
  const out = { ...(base || {}) }
  for (const [k, v] of Object.entries(over)) out[k] = merge(out[k], v)
  return out
}

const cv = await load(join(src, 'pdf.yaml'))
const resume = merge(await load(join(src, 'resume.yaml')), cv.overrides)
const icons = {}
for (const f of await readdir(join(here, 'icons')))
  if (extname(f) === '.svg') icons[basename(f, '.svg')] = await readFile(join(here, 'icons', f), 'utf8')

const qr = await QRCode.toString(cv.qr?.url || resume.address?.website, {
  type: 'svg', margin: 0, errorCorrectionLevel: 'M',
  color: { dark: '#ffffffff', light: '#00000000' },
})

const data = {
  resume, cv, icons, qr,
  skills: await load(join(src, 'skills.yaml')),
  hobbies: await load(join(src, 'hobbies.yaml')),
  debug: opt.debug,
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' }

const browser = await chromium.launch()
try {
  const pngWidth = Number(opt['png-width'])
  const page = await browser.newPage({
    viewport: { width: Math.ceil(595.28 * 4 / 3), height: Math.ceil(841.89 * 4 / 3) },
    deviceScaleFactor: pngWidth / (595.28 * 4 / 3),
  })
  page.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()))
  // Serve the repository on a fake origin so that modules and fonts load.
  await page.route('http://cv.local/**', async (route) => {
    const path = join(root, decodeURIComponent(new URL(route.request().url()).pathname))
    if (!path.startsWith(root)) return route.abort()
    try {
      await route.fulfill({ body: await readFile(path), contentType: MIME[extname(path)] || 'application/octet-stream' })
    } catch {
      await route.fulfill({ status: 404 })
    }
  })
  await page.addInitScript((d) => { window.CV_DATA = d }, data)
  await page.goto('http://cv.local/pdf/page.html')
  await page.waitForFunction(() => window.CV_READY || window.CV_ERROR, null, { timeout: 120000 })
  const err = await page.evaluate(() => window.CV_ERROR)
  if (err) throw new Error(err)
  const stats = await page.evaluate(() => window.CV_READY)

  await mkdir(dirname(opt.pdf), { recursive: true })
  await page.pdf({ path: opt.pdf, preferCSSPageSize: true, printBackground: true, pageRanges: '1' })
  if (opt.png) {
    await mkdir(dirname(opt.png), { recursive: true })
    await page.screenshot({ path: opt.png, clip: { x: 0, y: 0, width: 595.28 * 4 / 3, height: 841.89 * 4 / 3 } })
  }
  console.log(`skills: ${stats.skills.words} words, scale ${stats.skills.scale}`)
  console.log(`hobbies: ${stats.hobbies.words} words, scale ${stats.hobbies.scale}`)
  console.log(`skills panel: ${stats.split} pt high`)
  console.log(`→ ${opt.pdf}${opt.png ? `\n→ ${opt.png}` : ''}`)
} finally {
  await browser.close()
}
