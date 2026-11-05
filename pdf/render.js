// Builds the résumé page from window.CV_DATA (injected by build.mjs).
// All coordinates are in pt, measured on the original Illustrator artwork.

import { layoutCloud } from './cloud.js'

const PT = 4 / 3 // CSS px per pt
const SVGNS = 'http://www.w3.org/2000/svg'

// Open Sans vertical metrics: ascender 1.069 em, descender 0.293 em. For a line
// box whose line-height equals the font size, the baseline sits 0.888 em below
// its top.
const BASELINE = 0.888

// Icon boxes (pt) on the original page; their size is the SVG viewBox.
const ICON_BOX = {
  skills: [153, 203], work: [350, 203], education: [350, 577],
  hobbies: [151, 684], future: [352, 766], github: [10, 793], linkedin: [10, 811],
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function el(tag, cls, html, parent) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  if (parent) parent.appendChild(e)
  return e
}

function css(e, styles) {
  for (const [k, v] of Object.entries(styles)) e.style[k] = typeof v === 'number' ? `${v}pt` : v
  return e
}

// Single line of text whose baseline is at (x, baseline) in its parent.
function textAt(parent, cls, html, x, baseline, size) {
  return css(el('div', `abs ${cls}`, html, parent), {
    left: x, top: baseline - BASELINE * size, fontSize: size, lineHeight: size,
  })
}

function icon(name, parent, cls = 'icon') {
  const svg = window.CV_DATA.icons[name]
  const box = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  const e = el('div', cls, svg, parent)
  return css(e, { width: +box[1], height: +box[2] })
}

function iconAt(name, parent, x, y) {
  return css(icon(name, parent, 'abs icon'), { left: x, top: y })
}

function sectionTitle(panel, name, title, titleX, baseline, origin) {
  const [ix, iy] = ICON_BOX[name]
  iconAt(name, panel, ix - origin[0], iy - origin[1]).style.color = 'var(--text)'
  textAt(panel, 'section-title', esc(title), titleX - origin[0], baseline - origin[1], 21)
}

const dim = (s) => `<span class="dim">${esc(s)}</span>`
const yearLabel = (k) => String(k).replace(/\s*-\s*/, ' - ')
const startYear = (k) => parseInt(String(k), 10)

function panel(page, cls) {
  return el('section', `panel ${cls}`, undefined, page)
}

// Page coordinates (pt) of an element's box.
function boxOf(e) {
  const r = e.getBoundingClientRect()
  const p = document.getElementById('page').getBoundingClientRect()
  return { x: (r.left - p.left) / PT, y: (r.top - p.top) / PT, w: r.width / PT, h: r.height / PT }
}

function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  if (parent) parent.appendChild(e)
  return e
}

// Vertical timeline: a circle per entry, arrows between consecutive circles.
function timeline(svg, x, centers, color) {
  const r = 3.85
  centers.forEach((cy, i) => {
    svgEl('circle', { cx: x, cy, r, fill: 'none', stroke: color, 'stroke-width': 1 }, svg)
    if (i === centers.length - 1) return
    const tip = centers[i + 1] - r
    svgEl('line', { x1: x, y1: cy + r, x2: x, y2: tip - 4, stroke: color, 'stroke-width': 1 }, svg)
    svgEl('path', { d: `M${x - 2.1} ${tip - 4.7}L${x + 2.1} ${tip - 4.7}L${x} ${tip}Z`, fill: color }, svg)
  })
}

function sidebar(page, d) {
  const { resume: r, cv } = d
  const side = panel(page, 'sidebar')
  const O = [7.3, 8] // sidebar origin on the page

  const photo = css(el('div', 'photo', `<img src="../data/photo.jpg" alt="">`, side),
    { left: 20 - O[0], top: 16.3 - O[1], width: 107.5, height: 107.5 })
  css(photo.querySelector('img'), { left: 0, top: 0, width: 107.5, height: 107.5 })

  const blocks = css(el('div', 'blocks', undefined, side), { top: 126.1 })
  const block = (iconName, lines) => {
    const holder = el('div', 'block-icon', undefined, blocks)
    const ic = icon(iconName, holder)
    ic.style.color = '#fff'
    return el('div', '', lines.join('\n'), blocks)
  }

  const a = r.address || {}
  const IND = '<span class="indent"></span>'
  const kv = (k, v, last) => `${IND}${dim(`${k}: “`)}${esc(v)}${dim(`”${last ? '' : ','}`)}`
  const identity = ['type', 'gender', 'relationship', 'from', 'height', 'energy'].filter((k) => r[k] != null)
  block('person', [dim('{'), ...identity.map((k, i) => kv(k, r[k], i === identity.length - 1)), dim('},')])

  const tag = (t, v) => `${IND}${dim(`<${t}>`)}${esc(v)}${dim(`</${t}>`)}`
  block('home', [
    dim('<address>'),
    tag('who', `${r.lastname} ${r.firstname}`),
    tag('street', a.street), tag('npa', a.npa), tag('city', a.city),
    dim('</address>'),
  ])
  if (a.email) {
    const mail = block('mail', [`${dim('msg[“to”] = ')}${esc(a.email)}`])
    // Too wide for the sidebar: break the address before its domain.
    const at = a.email.indexOf('@')
    if (mail.scrollWidth > mail.clientWidth && at > 0)
      mail.innerHTML = [`${dim('msg[“to”] = ')}${esc(a.email.slice(0, at))}`,
        `${IND}${dim('+ ')}${esc(a.email.slice(at))}`].join('\n')
  }
  if (a.phone) block('phone', [`${dim('tel:')}${esc(a.phone)}`])
  if (r.languages)
    block('globe', [
      dim('%YAML 1.2'), dim('---'), `   ${dim('languages:')}`,
      ...Object.entries(r.languages).map(([k, v]) => `      ${dim(`${k}:`)} ${esc(v)}`),
      dim('...'),
    ])
  if (cv.sports?.length) block('fitness', cv.sports.map((s) => `${dim('print(“')}${esc(s)}${dim('”)')}`))
  // Flaws follow the mindset in the same block, dimmed.
  if (r.mindset || r.flaws)
    block('brain', [...Object.keys(r.mindset || {}).map(esc), ...Object.keys(r.flaws || {}).map(dim)])

  // QR code and social links stick to the bottom of the sidebar.
  css(el('div', 'qr', d.qr, side), { left: 52.4 - O[0], top: 731.5 - O[1], width: 41.8, height: 41.8 })
  ;(cv.social || []).forEach((s, i) => {
    const [ix, iy] = ICON_BOX[s.icon] || [10, 793 + 17.7 * i]
    iconAt(s.icon, side, ix - O[0], iy - O[1]).style.color = '#fff'
    const text = s.url ? `<a href="${esc(s.url)}">${esc(s.text)}</a>` : esc(s.text)
    textAt(side, 'social-text', text, 29.2 - O[0], 805.3 + 17.7 * i - O[1], 9).style.whiteSpace = 'nowrap'
  })
}

function header(page, d) {
  const { resume: r, cv } = d
  const h = panel(page, 'header')
  const O = [150.9, 8]
  textAt(h, 'name', esc(`${r.firstname} ${r.lastname}`), 159.1 - O[0], 82 - O[1], 33.2)
  textAt(h, 'headline', (cv.headline || []).map((t) => `<span class="hash">#</span>${esc(t)}`).join(' '),
    159.1 - O[0], 99.4 - O[1], 12)
  const uuid = textAt(h, 'uuid', esc(cv.uuid || ''), 0, 23.6 - O[1], 12.45)
  uuid.style.left = ''
  uuid.style.right = '15.6pt'
  css(el('p', 'abs description', esc(String(r.description || '').trim()), page),
    { left: 150.9, top: 128.6 - 7.2 - 0.388 * 12, width: 437.4 })
}

function work(page, d, overlay) {
  const p = panel(page, 'work')
  const O = [348, 200.5]
  sectionTitle(p, 'work', 'Work Experience', 384.5, 225.3, O)
  const list = css(el('div', 'entries', undefined, p), { left: 428 - O[0], top: 253.2 - 8.892 - O[1], width: 154 })
  const jobs = Object.entries(d.resume.work || {}).sort((a, b) => startYear(b[0]) - startYear(a[0]))
  const entries = jobs.map(([years, j]) => {
    const e = el('div', 'entry', undefined, list)
    el('div', 'year', esc(yearLabel(years)), e)
    el('div', 'title', esc(j.title), e)
    const c = j.company || {}
    el('div', 'company', `${esc(c.name)}${c.city ? `, <span class="city">${esc(c.city)}</span>` : ''}`, e)
    const tags = Object.keys(j.tags || {})
    if (tags.length) el('div', 'tags', tags.map((t) => `<span class="tag"><span class="hash">#</span>${esc(t)}</span>`).join(' '), e)
    return e
  })
  return () => timeline(overlay, 359.25, entries.map((e) => boxOf(e).y + 5.34), d.cv.palette?.line)
}

function education(page, d, overlay) {
  const p = panel(page, 'education')
  const O = [348, 573.4]
  sectionTitle(p, 'education', 'Education', 386.5, 599.9, O)
  const list = css(el('div', 'entries', undefined, p), { left: 353 - O[0], top: 629.5 - 8.892 - O[1], width: 144.5 })
  const items = Object.entries(d.resume.education || {}).sort((a, b) => startYear(b[0]) - startYear(a[0]))
  const entries = items.map(([years, s]) => {
    const e = el('div', 'entry', undefined, list)
    el('div', 'school', esc([s.school, s.city].filter(Boolean).join(', ')), e)
    for (const deg of [].concat(s.degree || [])) el('div', 'degree', esc(deg), e)
    el('div', 'year', esc(yearLabel(years)), e)
    return e
  })
  return () => timeline(overlay, 571.65, entries.map((e) => boxOf(e).y + 5.34), d.cv.palette?.line)
}

function future(page, d, overlay) {
  const p = panel(page, 'future')
  const O = [348, 763.2]
  sectionTitle(p, 'future', 'Future ?', 385.8, 786.6, O)
  const items = d.cv.future || []
  // Two columns, filled row by row; the row step shrinks so the last row stays
  // in the panel (baselines from 38.8 to 65 pt).
  const rows = Math.ceil(items.length / 2)
  const step = rows > 1 ? Math.min(19.6, 26.2 / (rows - 1)) : 0
  items.forEach((t, i) => {
    const x = O[0] + (i % 2 ? 130.8 : 30.3)
    const base = O[1] + 38.8 + step * Math.floor(i / 2)
    svgEl('circle', { cx: x + 3.75, cy: base - 3.05, r: 3.25, fill: 'none', stroke: d.cv.palette?.line, 'stroke-width': 1 }, overlay)
    textAt(p, 'future-item', esc(t), x + 12.4 - O[0], base - O[1], 10.27)
  })
}

// Skills and hobbies share the left column. Its split is searched by bisection
// so that both clouds come out at the same scale (same font size for a level).
const COLUMN = { top: 200.5, bottom: 834.7, gap: 5.3, minHobbies: 90 }

function splitColumn(skills, hobbies) {
  const { top, bottom, gap, minHobbies } = COLUMN
  const layout = (hs) => {
    const ht = top + hs + gap // top of the hobbies panel
    return {
      hs,
      skills: layoutCloud(skills, { x: 152.5, y: top + 32.5, w: 186.3, h: hs - 35.3 }),
      hobbies: layoutCloud(hobbies, { x: 152.5, y: ht + 30.4, w: 186.3, h: bottom - ht - 32.6 }),
    }
  }
  const worst = (r) => Math.min(r.skills.scale, r.hobbies.scale)
  let lo = 150, hi = bottom - top - gap - minHobbies, best = null
  for (let i = 0; i < 7; i++) {
    const r = layout((lo + hi) / 2)
    if (!best || worst(r) > worst(best)) best = r
    if (r.skills.scale < r.hobbies.scale) lo = r.hs
    else hi = r.hs
  }
  return best
}

// Draws a cloud laid out by layoutCloud.
function drawCloud(overlay, res, debug) {
  if (debug)
    for (const c of Object.values(res.cells))
      svgEl('rect', { x: c.x, y: c.y, width: c.w, height: c.h, fill: 'none', stroke: 'red', 'stroke-width': 0.3 }, overlay)
  for (const w of res.words) {
    const t = svgEl('text', {
      x: w.x.toFixed(2), y: w.y.toFixed(2),
      'font-size': w.size.toFixed(2), 'font-weight': w.weight, fill: w.color,
    }, overlay)
    if (w.rotate) t.setAttribute('transform', `rotate(${w.rotate} ${w.x.toFixed(2)} ${w.y.toFixed(2)})`)
    t.textContent = w.text
  }
  return { scale: +res.scale.toFixed(3), words: res.words.length }
}

async function main() {
  const d = window.CV_DATA
  document.title = `${d.resume.firstname} ${d.resume.lastname} — Curriculum Vitae`
  await Promise.all(['300 normal', '300 italic', '400 normal', '600 normal', '700 normal'].map((v) => {
    const [w, s] = v.split(' ')
    return document.fonts.load(`${s} ${w} 12px "Open Sans"`)
  }))

  const palette = d.cv.palette || {}
  for (const [k, v] of Object.entries(palette)) document.documentElement.style.setProperty(`--${k}`, v)

  const page = document.getElementById('page')
  sidebar(page, d)
  header(page, d)
  const skills = panel(page, 'skills')
  sectionTitle(skills, 'skills', 'Skills', 186, 225.3, [150, 200.5])
  const hobbies = panel(page, 'hobbies')
  sectionTitle(hobbies, 'hobbies', 'Hobbies', 185, 707.3, [150, 681.6])

  const overlay = svgEl('svg', { class: 'overlay', viewBox: '0 0 595.28 841.89' }, page)
  const drawWork = work(page, d, overlay)
  const drawEdu = education(page, d, overlay)
  future(page, d, overlay)
  await document.fonts.ready
  drawWork()
  drawEdu()

  // Clouds without their own colours take the palette's.
  const colored = (spec) => ({ ...spec, style: { colors: { key: palette['cloud-key'], normal: palette.cloud }, ...spec.style } })
  const split = splitColumn(colored(d.skills), colored(d.hobbies))
  const hobbiesTop = COLUMN.top + split.hs + COLUMN.gap
  css(skills, { height: split.hs })
  css(hobbies, { top: hobbiesTop, height: COLUMN.bottom - hobbiesTop })
  const stats = {
    skills: drawCloud(overlay, split.skills, d.debug),
    hobbies: drawCloud(overlay, split.hobbies, d.debug),
    split: +split.hs.toFixed(1),
  }
  page.appendChild(overlay) // above the panel backgrounds
  await Promise.all([...document.images].map((i) => i.complete || new Promise((ok) => (i.onload = i.onerror = ok))))
  window.CV_READY = stats
}

main().catch((e) => {
  console.error(e)
  window.CV_ERROR = String(e && e.stack || e)
})
