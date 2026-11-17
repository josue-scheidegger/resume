// Grouped word cloud layout, run in the browser (needs canvas + loaded fonts).
//
// 1. The cloud box is split into one rectangle per group (slicing treemap
//    driven by `rows`), each proportional to the area of the group's words.
// 2. Each group sets a share `style.vertical` of its ink vertically (see
//    `orient`). The orientation is fixed before placement: a vertical word
//    never falls back to horizontal, so the text shrinks instead.
// 3. Words are placed from the largest to the smallest, along a spiral that
//    starts at the centre of their group's rectangle. Collisions are tested on
//    the real glyph shapes (bit masks), so small words can nest in the holes
//    of big ones, but never overlap.
// 4. The whole cloud is scaled by bisection to the largest size at which every
//    word still fits in its group's area.

const RES = 3 // bitmap pixels per pt
const WEIGHTS = { light: 300, regular: 400, semibold: 600, bold: 700 }

// Orientation tuning.
const MIN_VERTICAL_EM = 2 // shorter words (C, C++, C#, Git) stay horizontal
const MAX_ELIGIBLE = 12 // per group, so that 2^n subsets stay cheap
const FIT = 2 // weight of the "taller than its area" penalty
const FIT_FREE = 0.85 // vertical length / area height allowed for free
const FILL = 0.55 // ink / box area of a typical cloud, for the first scale guess
const TOLERANCE = 0.05 // accepted gap between the vertical share and its target

// Advance width of a word, in em.
function advanceEm(text, weight) {
  ctx.font = `${weight} 100px "Open Sans"`
  return ctx.measureText(text).width / 100
}

// Bit matrix, rows of 32-bit words, most significant bit = leftmost pixel.
class Bitmap {
  constructor(w, h) {
    this.w = w
    this.h = h
    this.stride = (w >> 5) + 2 // one spare word for shifted masks
    this.bits = new Uint32Array(this.stride * h)
  }
  set(x, y) {
    this.bits[y * this.stride + (x >> 5)] |= (0x80000000 >>> (x & 31))
  }
  get(x, y) {
    return (this.bits[y * this.stride + (x >> 5)] & (0x80000000 >>> (x & 31))) !== 0
  }
  fillRect(x0, y0, x1, y1) {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(this.w, x1); x++) this.set(x, y)
  }
  // Does `mask` placed with its top-left corner at (px, py) hit a set bit?
  collides(mask, px, py) {
    const s = px & 31
    const base = px >> 5
    const ms = mask.stride
    for (let y = 0; y < mask.h; y++) {
      const row = (py + y) * this.stride + base
      const mrow = y * ms
      let carry = 0
      for (let j = 0; j < ms; j++) {
        const m = mask.bits[mrow + j]
        const v = s ? (m >>> s) | carry : m
        carry = s ? m << (32 - s) : 0
        if (v & this.bits[row + j]) return true
      }
      if (carry & this.bits[row + ms]) return true
    }
    return false
  }
  // OR `mask` into this bitmap at (px, py).
  draw(mask, px, py) {
    const s = px & 31
    const base = px >> 5
    const ms = mask.stride
    for (let y = 0; y < mask.h; y++) {
      const row = (py + y) * this.stride + base
      const mrow = y * ms
      let carry = 0
      for (let j = 0; j < ms; j++) {
        const m = mask.bits[mrow + j]
        this.bits[row + j] |= s ? (m >>> s) | carry : m
        carry = s ? m << (32 - s) : 0
      }
      this.bits[row + ms] |= carry
    }
  }
}

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d', { willReadFrequently: true })

// Rasterise a word (dilated by `pad` pt) into a tight horizontal and vertical
// mask. `ax, ay` is the text origin (start of the baseline) inside the mask.
function rasterise(text, size, weight, pad) {
  const fs = size * RES
  const p = Math.ceil(pad * RES)
  const font = `${weight} ${fs}px "Open Sans"`
  ctx.font = font
  const m = ctx.measureText(text)
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 2 * p + 4
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + 2 * p + 4
  canvas.width = w
  canvas.height = h
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = ctx.strokeStyle = '#000'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2 * p
  const ox = Math.ceil(m.actualBoundingBoxLeft) + p + 2
  const oy = Math.ceil(m.actualBoundingBoxAscent) + p + 2
  ctx.clearRect(0, 0, w, h)
  ctx.fillText(text, ox, oy)
  if (p) ctx.strokeText(text, ox, oy)
  const data = ctx.getImageData(0, 0, w, h).data

  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  const mw = x1 - x0 + 1
  const mh = y1 - y0 + 1
  const hm = new Bitmap(mw, mh)
  const vm = new Bitmap(mh, mw) // rotated -90° (reads bottom to top)
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++)
      if (data[((y + y0) * w + x + x0) * 4 + 3]) {
        hm.set(x, y)
        vm.set(y, mw - 1 - x)
      }
  const ax = ox - x0
  const ay = oy - y0
  return {
    h: { mask: hm, ax, ay, rotate: 0 },
    v: { mask: vm, ax: ay, ay: mw - 1 - ax, rotate: -90 },
    area: mw * mh,
  }
}

// Split `rect` between `nodes` (group names or nested lists) in proportion to
// their weight; `vertical` stacks them top to bottom, otherwise left to right.
function slice(nodes, rect, vertical, weightOf, out) {
  const ws = nodes.map(weightOf)
  const total = ws.reduce((a, b) => a + b, 0) || 1
  let offset = 0
  nodes.forEach((node, i) => {
    const f = ws[i] / total
    const r = vertical
      ? { x: rect.x, y: rect.y + offset * rect.h, w: rect.w, h: f * rect.h }
      : { x: rect.x + offset * rect.w, y: rect.y, w: f * rect.w, h: rect.h }
    offset += f
    if (Array.isArray(node)) slice(node, r, !vertical, weightOf, out)
    else out[node] = r
  })
  return out
}

function normalise(spec) {
  const style = spec.style || {}
  const words = []
  spec.groups.forEach((g, gi) => {
    Object.entries(g.skills).forEach(([text, v], i) => {
      const o = typeof v === 'object' && v !== null ? v : { level: v }
      const key = !!o.key
      const weight = o.weight || (key ? style.weights?.key : style.weights?.normal) || 'light'
      words.push({
        text: String(text),
        group: g.name,
        order: gi * 1000 + i,
        level: o.level,
        size0: (style.base ?? 4.2) * Math.pow(style.ratio ?? 1.27, o.level - 1),
        weight: WEIGHTS[weight] ?? weight,
        color: key ? style.colors?.key : style.colors?.normal,
        rotate: o.rotate, // true | false | undefined (chosen by `orient`)
      })
    })
  })
  return { style, words }
}

// spec: parsed skills.yaml; box: {x, y, w, h} in pt; obstacles: [{x, y, w, h}].
export function layoutCloud(spec, box, obstacles = []) {
  const { style, words } = normalise(spec)
  const pad = style.padding ?? 0.6
  const spill = (style.spill ?? 6) * RES
  const W = Math.floor(box.w * RES)
  const H = Math.floor(box.h * RES)

  // Group areas at scale 1, used to size the treemap cells.
  const area = {}
  for (const w of words) {
    w.base = rasterise(w.text, w.size0, w.weight, pad)
    area[w.group] = (area[w.group] || 0) + w.base.area
  }
  const names = spec.groups.map((g) => g.name)
  const rows = (spec.rows || []).map((r) => (Array.isArray(r) ? r : [r]))
  const listed = new Set(rows.flat(Infinity))
  for (const n of names) if (!listed.has(n)) rows.push([n])
  const weights = { ...area }
  const weightOf = (n) => (Array.isArray(n) ? n.reduce((a, c) => a + weightOf(c), 0) : weights[n] || 0)

  const order = [...words].sort((a, b) => b.size0 - a.size0 || a.order - b.order)
  const cache = new Map()
  const masksFor = (w, scale) => {
    const k = `${w.text}|${w.weight}|${scale.toFixed(3)}`
    if (!cache.has(k)) cache.set(k, rasterise(w.text, w.size0 * +scale.toFixed(3), w.weight, pad))
    return cache.get(k)
  }

  // Orientation candidates. `ink` (advance × size, pt² at scale 1) is the
  // visual weight of a word, `len` its length once vertical (pt at scale 1).
  const target = Math.max(0, Math.min(1, style.vertical ?? 0.33))
  const groupOrder = rows.flat(Infinity)
  const byGroup = Object.fromEntries(names.map((n) => [n, order.filter((w) => w.group === n)]))
  let totalInk = 0
  for (const w of words) {
    const em = advanceEm(w.text, w.weight)
    w.ink = em * w.size0 * w.size0
    w.len = em * w.size0 + 2 * pad
    totalInk += w.ink
  }
  for (const ws of Object.values(byGroup))
    ws.forEach((w, i) => {
      // The largest word of each group stays horizontal and titles its area.
      w.eligible = target > 0 && i > 0 && w.rotate === undefined && w.len - 2 * pad >= MIN_VERTICAL_EM * w.size0
    })

  // Treemap + bisection; the group that blocks a larger scale gets more room
  // and the layout is retried. The orientations are chosen again for each
  // try, with the scale of the previous one as an estimate, but always against
  // the treemap sized by ink alone: measuring them against the grown areas
  // would let a tall vertical word earn the room that then justifies it.
  const natural = slice(rows, { x: 0, y: 0, w: W, h: H }, true, weightOf, {})
  const fits = (r) => Math.abs(r.share - target) <= TOLERANCE
  const better = (r, b) => !b || (fits(r) !== fits(b) ? fits(r)
    : fits(r) ? r.scale > b.scale : Math.abs(r.share - target) < Math.abs(b.share - target))
  let result = null
  let last = null
  let stale = 0
  for (let i = 0; i < (style.balance ?? 30) && stale < 8; i++) {
    const cells = slice(rows, { x: 0, y: 0, w: W, h: H }, true, weightOf, {})
    const share = orient(natural, last?.scale ?? Math.sqrt((FILL * box.w * box.h) / totalInk))
    const r = { ...bisect(cells, result?.scale), share }
    if (better(r, result)) { result = r; stale = 0 } else stale++
    last = r
    if (!r.blocker) break
    weights[r.blocker] *= 1.12
  }
  return finish(result)

  // Picks the vertical words of every group, so that a share `target` of its
  // ink is vertical, by error diffusion at two levels:
  // - inside a group, every subset of the eligible words is tried, and the one
  //   whose ink is closest to the group's target wins, minus a penalty for
  //   words longer than the group's area is high (at the estimated `scale`),
  //   so that several medium words beat one tall pillar;
  // - the error left by a group (bounded to half its target) is carried over
  //   to the next one, so the whole cloud stays on target.
  // Returns the vertical share of the whole cloud.
  function orient(cells, scale) {
    let carry = 0
    let vertical = 0
    for (const g of groupOrder) {
      const ws = byGroup[g]
      const A = ws.reduce((s, w) => s + w.ink, 0)
      const T = target * A + Math.max(-target * A / 2, Math.min(target * A / 2, carry))
      const height = cells[g].h / RES + 2 * spill / RES
      const penalty = (w) => Math.max(0, (w.len * scale) / height - FIT_FREE) ** 2
      const forced = ws.filter((w) => w.rotate === true)
      const elig = ws.filter((w) => w.eligible).slice(0, MAX_ELIGIBLE)
      const V0 = forced.reduce((s, w) => s + w.ink, 0)
      const P0 = forced.reduce((s, w) => s + penalty(w), 0)
      const pen = elig.map(penalty)
      let best = { cost: Infinity, set: 0, V: V0 }
      for (let set = 0; set < 1 << elig.length; set++) {
        let V = V0, P = P0
        for (let j = 0; j < elig.length; j++) if (set & (1 << j)) { V += elig[j].ink; P += pen[j] }
        const cost = Math.abs(V - T) / A + FIT * P
        if (cost < best.cost - 1e-9) best = { cost, set, V }
      }
      for (const w of ws) w.vertical = w.rotate === true
      elig.forEach((w, j) => { w.vertical = !!(best.set & (1 << j)) })
      carry = T - best.V
      vertical += best.V
    }
    return vertical / totalInk
  }

  function attempt(cells, scale) {
    const grid = new Bitmap(W, H)
    for (const o of obstacles)
      grid.fillRect(
        Math.floor((o.x - box.x) * RES), Math.floor((o.y - box.y) * RES),
        Math.ceil((o.x + o.w - box.x) * RES), Math.ceil((o.y + o.h - box.y) * RES))
    const placed = []
    for (const w of order) {
      const m = masksFor(w, scale)
      const c = cells[w.group]
      const lim = {
        x0: Math.max(0, Math.floor(c.x - spill)), y0: Math.max(0, Math.floor(c.y - spill)),
        x1: Math.min(W, Math.ceil(c.x + c.w + spill)), y1: Math.min(H, Math.ceil(c.y + c.h + spill)),
      }
      const pos = spiral(grid, w.vertical ? m.v : m.h, c, lim)
      if (!pos) return { fail: w.group }
      grid.draw(pos.t.mask, pos.x, pos.y)
      placed.push({ w, t: pos.t, x: pos.x, y: pos.y })
    }
    return { placed }
  }

  // Largest scale at which every word fits; `blocker` is the group that
  // failed just above it.
  function bisect(cells, guess = 1) {
    const f = guess === 1 ? 1.5 : 1.05
    let lo = 0, hi = 0, best = null, blocker = null
    for (let s = guess; s < 64; s *= f) {
      const r = attempt(cells, s)
      if (r.fail) { hi = s; blocker = r.fail; break }
      lo = s; best = r.placed
    }
    if (!best) {
      for (let s = guess / f; s > 0.01; s /= f) {
        const r = attempt(cells, s)
        if (r.placed) { lo = s; best = r.placed; break }
        hi = s; blocker = r.fail
      }
      if (!best) throw new Error('word cloud: cannot place the words even at a tiny scale')
    }
    for (let i = 0; i < (guess === 1 ? 8 : 4); i++) {
      const s = (lo + hi) / 2
      const r = attempt(cells, s)
      if (r.placed) { lo = s; best = r.placed } else { hi = s; blocker = r.fail }
    }
    return { scale: lo, placed: best, cells, blocker }
  }

  function finish({ scale: lo, placed: best, cells, share }) {
  return {
    scale: lo,
    vertical: share,
    cells: Object.fromEntries(Object.entries(cells).map(([k, c]) =>
      [k, { x: box.x + c.x / RES, y: box.y + c.y / RES, w: c.w / RES, h: c.h / RES }])),
    words: best.map(({ w, t, x, y }) => ({
      text: w.text,
      group: w.group,
      size: w.size0 * lo,
      weight: w.weight,
      color: w.color,
      rotate: t.rotate,
      x: box.x + (x + t.ax) / RES,
      y: box.y + (y + t.ay) / RES,
    })),
  }
  }
}

// Archimedean spiral from the centre of `cell`, stretched to its aspect ratio.
function spiral(grid, t, cell, lim) {
  const mw = t.mask.w, mh = t.mask.h
  const cx = cell.x + cell.w / 2, cy = cell.y + cell.h / 2
  const ex = Math.max(0.25, Math.min(4, cell.w / Math.max(1, cell.h)))
  const sx = Math.sqrt(ex), sy = 1 / sx
  // Range of word centres that keep the word inside `lim`.
  const ux0 = lim.x0 + mw / 2, ux1 = lim.x1 - mw / 2
  const uy0 = lim.y0 + mh / 2, uy1 = lim.y1 - mh / 2
  if (ux0 > ux1 || uy0 > uy1) return null
  // Spiral radius (in its stretched frame) beyond which every point is outside.
  const rmax = Math.hypot(Math.max(cx - ux0, ux1 - cx) / sx, Math.max(cy - uy0, uy1 - cy) / sy) + 2
  let theta = 0
  for (let r = 0; r <= rmax; ) {
    const x = Math.round(cx + r * Math.cos(theta) * sx - mw / 2)
    const y = Math.round(cy + r * Math.sin(theta) * sy - mh / 2)
    if (x >= lim.x0 && y >= lim.y0 && x + mw <= lim.x1 && y + mh <= lim.y1 && !grid.collides(t.mask, x, y))
      return { t, x, y }
    const step = 1.5 / Math.max(r, 1.5) // ~1.5 px along the curve
    theta += step
    r += (2.5 / (2 * Math.PI)) * step // 2.5 px between turns
  }
  return null
}
