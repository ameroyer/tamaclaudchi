// The pet rules, drawn in terminal cells:
//   BODY COLOUR = git repo (or folder), HAT = model, HELD ITEM = git branch.
import {
  CLR, CREATURE, EGG, EGG_SPECKLES, EYES, HAT, ITEM, ITEM_NAMES, MODEL_HAT,
  MODEL_SKIN, REPO_SKINS, type Cell, type Skin,
} from './sprites'
import type { TamaSession } from '../types'

export { MODEL_SKIN }

export function modelFamily(model: string | null | undefined): string {
  const m = (model || '').toLowerCase()
  if (m.includes('fable') || m.includes('mythos')) return 'fable'
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return 'other'
}

/** `claude-opus-5-5` -> `Opus 5.5`, `claude-haiku-4-5-20251001` -> `Haiku 4.5`. */
export function modelLabel(model: string | null | undefined): string {
  if (!model) return 'egg'
  const m = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(model.toLowerCase())
  if (!m) return model
  const fam = m[1]!
  const name = fam[0]!.toUpperCase() + fam.slice(1)
  return m[3] ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* The hash only picks a preferred slot; a taken one probes forward, so a
   handful of repos rarely share a colour. */
function assignSlots<T>(keys: string[], names: T[]): Record<string, T> {
  const taken: (string | null)[] = new Array(names.length).fill(null)
  const out: Record<string, T> = {}
  for (const key of [...new Set(keys)].sort()) {
    let i = hashStr(key) % names.length
    for (let n = 0; n < names.length && taken[i] !== null; n++) i = (i + 1) % names.length
    taken[i] = key
    out[key] = names[i]!
  }
  return out
}

export const repoKey = (s: TamaSession) => 'repo:' + s.repo
// An item per branch of a repo (the one the session was born on: it keeps its
// item through a checkout), so five repos on main hold five items, while
// sessions in one checkout still hold the same (keyed by branch alone, every
// main would hold the sword).
export const itemKey = (s: TamaSession) => 'item:' + s.repo + ':' + (s.bornBranch ?? s.branch ?? 'dir:' + s.cwd)

export const SKIN_COUNT = REPO_SKINS.length
export const ITEM_COUNT = ITEM_NAMES.length

/** Kept slots by key, each with when its key was last on the shelf: `[slot, seenMs]`. */
export type Slots = { repo: Record<string, [number, number]>; item: Record<string, [number, number]> }
/** How many keys a slot table remembers; the longest unseen go first. */
const SLOTS_KEPT = 400
const SEEN_EVERY_MS = 3600_000

/**
 * Slots that stay put: a key keeps the slot it was given; a new one takes its
 * hashed slot, or the next one nobody on the shelf holds, preferring slots no
 * key remembers at all (so a pet coming back finds its colour). Two keys only
 * share a slot when there are more keys on the shelf than slots.
 */
export function stickySlots(keys: string[], count: number, kept: Record<string, [number, number]>, now: number) {
  const out: Record<string, [number, number]> = { ...kept }
  const here = [...new Set(keys)].sort()
  const held = new Set<number>()
  const fresh: string[] = []
  for (const k of here) {
    const slot = kept[k]?.[0]
    if (slot !== undefined && slot < count && !held.has(slot)) {
      held.add(slot)
      // seen again: noted at most hourly, so the store is not written at every poll
      if (now - kept[k]![1] > SEEN_EVERY_MS) out[k] = [slot, now]
    } else fresh.push(k)
  }
  const remembered = new Set(Object.entries(out).filter(([k]) => !here.includes(k)).map(([, [slot]]) => slot))
  for (const k of fresh) {
    const start = hashStr(k) % count
    const at = (n: number) => (start + n) % count
    const probe = (ok: (slot: number) => boolean) => Array.from({ length: count }, (_, n) => at(n)).find(ok)
    const slot = probe(i => !held.has(i) && !remembered.has(i)) ?? probe(i => !held.has(i)) ?? start
    held.add(slot)
    out[k] = [slot, now]
  }
  const keysByAge = Object.keys(out).sort((a, b) => out[b]![1] - out[a]![1])
  for (const k of keysByAge.slice(SLOTS_KEPT)) delete out[k]
  return out
}

export type Outfit = { skin: Skin; hat: string | null; item: string; isEgg: boolean }

/**
 * Outfits for everyone on the shelf: the colour and item each was given for
 * good (see stickySlots), or, before that is known, spread over the shelf as is.
 */
export function outfits(all: TamaSession[]): Map<string, Outfit> {
  const colors = assignSlots(all.map(repoKey), REPO_SKINS)
  const items = assignSlots(all.map(itemKey), ITEM_NAMES)
  const out = new Map<string, Outfit>()
  for (const s of all) {
    out.set(s.id, {
      skin: (s.skinSlot !== null ? REPO_SKINS[s.skinSlot] : undefined) ?? colors[repoKey(s)]!,
      hat: MODEL_HAT[modelFamily(s.model)] ?? null,
      item: (s.itemSlot !== null ? ITEM_NAMES[s.itemSlot] : undefined) ?? items[itemKey(s)]!,
      isEgg: !s.model,
    })
  }
  return out
}

function haloOf(cells: Cell[]): Cell[] {
  const has = new Set(cells.map(([x, y]) => x + ',' + y))
  const out = new Set<string>()
  for (const [x, y] of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = x + dx + ',' + (y + dy)
      if (!has.has(k)) out.add(k)
    }
  }
  return [...out].map(k => k.split(',').map(Number) as Cell)
}
const ITEM_HALO: Record<string, Cell[]> = Object.fromEntries(
  Object.entries(ITEM).map(([name, cells]) => [name, haloOf(cells)]),
)

// The sprite grid, with a one-pixel margin on the left for the halo.
export const PET_W = 21
export const PET_H = 14

const hex = (c: string) => parseInt(c.slice(1), 16)

/** Washes a colour toward grey: a pet that has been quiet for hours. */
function faded(rgb: number): number {
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255
  const y = Math.round(0.3 * r + 0.59 * g + 0.11 * b)
  const mix = (v: number) => Math.round(v * 0.35 + y * 0.65)
  return (mix(r) << 16) | (mix(g) << 8) | mix(b)
}

/** A frame of motion: where the body and the held item sit, and extras. */
type Pose = { dx?: number; dy?: number; itemDx?: number; itemDy?: number; blink?: boolean; extra?: Cell[]; glow?: number }

// A halo floats over a pet whose session has ended, in the room above its head.
const HALO: Cell[] = [[7, -2, 'G'], [8, -2, 'W'], [9, -2, 'G'], [10, -2, 'G'], [6, -1, 'G'], [11, -1, 'G']]

// The halo's light at its dimmest and brightest; a dead pet's hover breathes
// smoothly between the two.
const HALO_DIM = { base: '#b8932e', hi: '#e6c55c' }
const HALO_BRIGHT = { base: '#fff4d1', hi: '#ffffff' }

/** The colour `t` (0 to 1) of the way from `a` to `b`. */
function lerp(a: string, b: string, t: number): string {
  const ca = hex(a), cb = hex(b)
  const ch = (shift: number) => Math.round(((ca >> shift) & 255) * (1 - t) + ((cb >> shift) & 255) * t)
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')
}

type DrawOpts = { faded?: boolean; halo?: boolean; sad?: boolean }

// A pet left waiting on you: heavy lids (the lower half of each eye), a frown, a tear.
const FROWN: Cell[] = [[8, 9, 'E'], [9, 9, 'E'], [7, 10, 'E'], [10, 10, 'E']]
const TEAR: Cell[] = [[6, 8, 'C'], [6, 9, 'c']]

/** Draws the pet into a PET_W x height grid, `top` pixel rows down from its edge. */
function draw(o: Outfit, pose: Pose, height: number, top: number, opts: DrawOpts): Int32Array {
  const px = new Int32Array(PET_W * height).fill(-1)
  const at = (dx: number, dy: number) => (x: number, y: number, c: string) => {
    const gx = x + 1 + dx, gy = y + top + dy
    if (gx >= 0 && gx < PET_W && gy >= 0 && gy < height) px[gy * PET_W + gx] = hex(c)
  }
  const body = at(pose.dx ?? 0, pose.dy ?? 0)
  const held = at((pose.dx ?? 0) + (pose.itemDx ?? 0), (pose.dy ?? 0) + (pose.itemDy ?? 0))
  const paint = (role: string | undefined) => CLR[role || ''] || o.skin.body
  // a blink keeps only the lower half of each pupil
  const eyes = pose.blink || (opts.sad && !o.isEgg) ? EYES.filter(([, y]) => y === 7) : EYES
  if (o.isEgg) {
    EGG.forEach(([x, y]) => body(x, y, o.skin.body))
    EGG_SPECKLES.forEach(([x, y, r]) => body(x, y, paint(r)))
    eyes.forEach(([x, y, r]) => body(x, y, paint(r)))
  } else {
    CREATURE.forEach(([x, y, r]) => body(x, y, r === 'T' ? o.skin.body : o.skin.outline))
    eyes.forEach(([x, y, r]) => body(x, y, paint(r)))
    ;(HAT[o.hat || ''] || []).forEach(([x, y, r]) => body(x, y, paint(r)))
    ;(ITEM_HALO[o.item] || []).forEach(([x, y]) => held(x, y, o.skin.outline))
    ;(ITEM[o.item] || []).forEach(([x, y, r]) => held(x, y, paint(r)))
    if (opts.sad) [...FROWN, ...TEAR].forEach(([x, y, r]) => body(x, y, paint(r)))
  }
  // sparkles, a letter: an egg gets its letters too
  ;(pose.extra || []).forEach(([x, y, r]) => held(x, y, paint(r)))
  if (opts.faded) for (let i = 0; i < px.length; i++) if (px[i]! >= 0) px[i] = faded(px[i]!)
  // drawn after the fade: the halo keeps its gold
  if (opts.halo) {
    const t = pose.glow ?? 0.35
    HALO.forEach(([x, y, r]) => body(x, y, r === 'W' ? lerp(HALO_DIM.hi, HALO_BRIGHT.hi, t) : lerp(HALO_DIM.base, HALO_BRIGHT.base, t)))
  }
  return px
}

/** The pet as a PET_W x PET_H grid of 0xRRGGBB, -1 where it is see-through. */
export function petPixels(o: Outfit, opts: DrawOpts = {}): Int32Array {
  return draw(o, {}, PET_H, 0, opts)
}

// How a held item moves while its pet is hovered.
const SWINGS = ['sword', 'umbrella', 'leek', 'quill', 'lollipop', 'sunflower', 'elfstaff', 'scroll']
const SPARKLES = ['fairywand', 'crystal', 'lantern', 'spellbook']

function poses(o: Outfit): Pose[] {
  if (o.isEgg) return [{}, { dx: -1 }, {}, { dx: 1 }] // an egg wobbles
  const hop = { dy: -1 }
  if (SWINGS.includes(o.item)) {
    return [{}, { ...hop, itemDx: 1 }, { blink: true }, { ...hop, itemDy: -1 }]
  }
  if (SPARKLES.includes(o.item)) {
    return [
      {}, { ...hop, extra: [[18, 1, 'W'], [14, 3, 'g']] },
      { blink: true, extra: [[18, 0, 'g']] }, { ...hop, extra: [[14, 1, 'W'], [18, 3, 'g']] },
    ]
  }
  // round things bob a beat behind the body
  return [{}, { ...hop, itemDy: -1 }, { blink: true, itemDy: 1 }, { ...hop }]
}

/** Extra rows above the pet, so a hop has room. */
const HOP_ROOM = 2
export const ANIM_H = PET_H + HOP_ROOM

// The shelf draws every pet again at each redraw: a pet at rest is packed
// once per look. Bounded, as pets come and go.
const restCells = new Map<string, RasterCells>()
const REST_KEPT = 500

/** The pet at rest, in the same box the hover frames use (room to hop). */
export function petRest(o: Outfit, opts: DrawOpts = {}): RasterCells {
  const key = JSON.stringify([o, opts.faded ?? false, opts.halo ?? false, opts.sad ?? false])
  const hit = restCells.get(key)
  if (hit) return hit
  if (restCells.size >= REST_KEPT) restCells.clear()
  const cells = petCells(draw(o, {}, ANIM_H, HOP_ROOM, opts), ANIM_H)
  restCells.set(key, cells)
  return cells
}

/**
 * A dead pet does not hop about: its halo swells and fades on a sine, and it
 * blinks, gently, as the light peaks. GHOST_FRAMES frames at GHOST_FRAME_MS,
 * about two seconds a breath.
 */
const GHOST_FRAMES = 16
function ghostPoses(): Pose[] {
  return Array.from({ length: GHOST_FRAMES }, (_, i) => {
    const glow = (1 - Math.cos((2 * Math.PI * i) / GHOST_FRAMES)) / 2
    return { glow, blink: i === GHOST_FRAMES / 2 || i === GHOST_FRAMES / 2 + 1 }
  })
}

export const GHOST_FRAME_MS = 120

/** The hover animation: Raster cells per frame, repainted in place by blit. */
export function petFrames(o: Outfit, opts: DrawOpts = {}): string[] {
  return (opts.halo ? ghostPoses() : poses(o)).map(pose => petCells(draw(o, pose, ANIM_H, HOP_ROOM, opts), ANIM_H).cells)
}

// A letter, white with a grey flap and a red seal, and the heart it opens into.
const ENVELOPE: Cell[] = [
  [0, 0, 'W'], [1, 0, 'W'], [2, 0, 'W'], [3, 0, 'W'], [4, 0, 'W'],
  [0, 1, 'W'], [1, 1, 'S'], [2, 1, 'W'], [3, 1, 'S'], [4, 1, 'W'],
  [0, 2, 'W'], [1, 2, 'W'], [2, 2, 'R'], [3, 2, 'W'], [4, 2, 'W'],
  [0, 3, 'W'], [1, 3, 'W'], [2, 3, 'W'], [3, 3, 'W'], [4, 3, 'W'],
]
const HEART: Cell[] = [
  [1, 0, 'R'], [3, 0, 'R'],
  [0, 1, 'R'], [1, 1, 'R'], [2, 1, 'R'], [3, 1, 'R'], [4, 1, 'R'],
  [1, 2, 'R'], [2, 2, 'R'], [3, 2, 'R'],
  [2, 3, 'R'],
]
const moved = (cells: Cell[], dx: number, dy: number): Cell[] => cells.map(([x, y, r]) => [x + dx, y + dy, r])

/**
 * A message's animation, played once: a pet that sent one hops and throws it,
 * the letter flying off up and away from its hand (its own item put down
 * meanwhile); one that got one sees a letter drop by its head, hops, and the
 * letter turns into a heart.
 */
export function mailFrames(o: Outfit, opts: DrawOpts, role: 'send' | 'get'): string[] {
  const hop = { dy: -1 }
  const poses: Pose[] = role === 'send'
    ? [
      { extra: moved(ENVELOPE, 14, 6) }, { ...hop, extra: moved(ENVELOPE, 14, 6) }, { extra: moved(ENVELOPE, 15, 2) },
      { extra: moved(ENVELOPE, 16, -1) }, { extra: moved(ENVELOPE, 17, -4) }, { blink: true },
    ]
    : [
      { extra: moved(ENVELOPE, 14, -5) }, { extra: moved(ENVELOPE, 14, -3) }, { extra: moved(ENVELOPE, 14, -2) },
      { ...hop, blink: true, extra: moved(ENVELOPE, 14, -2) }, { extra: moved(HEART, 14, -2) }, { extra: moved(HEART, 14, -3) }, {},
    ]
  const look = role === 'send' ? { ...o, item: '' } : o
  return poses.map(pose => petCells(draw(look, pose, ANIM_H, HOP_ROOM, opts), ANIM_H).cells)
}

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const FULL = 0x2588 // █

/**
 * Packs a PET_W x height grid of pixels into Raster cells, two pixel rows per
 * terminal row (half blocks): PET_W columns, ceil(height / 2) rows.
 */
export function petCells(px: Int32Array, height = PET_H): RasterCells {
  return pack((x, y) => px[y * PET_W + x] ?? -1, PET_W, height)
}

type RasterCells = { columns: number; rows: number; cells: string }

/** Packs a W x H pixel grid (a colour, or -1 for none) into half-block Raster cells. */
function pack(at: (x: number, y: number) => number, W: number, H: number): RasterCells {
  const rows = Math.ceil(H / 2)
  const words = new Uint32Array(W * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < W; x++) {
      const top = at(x, 2 * r), bot = 2 * r + 1 < H ? at(x, 2 * r + 1) : -1
      const i = (r * W + x) * 3
      if (top < 0 && bot < 0) words.set([0x20, DEFAULT, DEFAULT], i)
      else if (top === bot) words.set([FULL, top, DEFAULT], i)
      else if (bot < 0) words.set([UPPER, top, DEFAULT], i)
      else if (top < 0) words.set([LOWER, bot, DEFAULT], i)
      else words.set([UPPER, top, bot], i)
    }
  }
  return { columns: W, rows, cells: toBase64(new Uint8Array(words.buffer)) }
}

/**
 * The pet shrunk `k` times (2: half size, 3: a third): each k x k block of the
 * sprite becomes one pixel of its most common colour, ties going to the colour
 * rarer in the whole sprite, so the eyes and the hat's details beat the body
 * around them. A block with fewer than k pixels is an edge, and goes.
 */
function petScaled(o: Outfit, opts: DrawOpts, k: number): { px: Int32Array; W: number; H: number } {
  const px = draw(o, {}, PET_H, 0, opts)
  const total = new Map<number, number>()
  for (const c of px) if (c >= 0) total.set(c, (total.get(c) ?? 0) + 1)
  const W = Math.ceil(PET_W / k), H = Math.ceil(PET_H / k)
  const small = new Int32Array(W * H).fill(-1)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const count = new Map<number, number>()
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const gx = k * x + dx, gy = k * y + dy
      const c = gx < PET_W && gy < PET_H ? px[gy * PET_W + gx]! : -1
      if (c >= 0) count.set(c, (count.get(c) ?? 0) + 1)
    }
    let best = -1, n = k - 1
    for (const [c, m] of count) {
      if (m > n || (m === n && best >= 0 && total.get(c)! < total.get(best)!)) { best = c; n = m }
    }
    small[y * W + x] = best
  }
  return { px: small, W, H }
}

/** The pet at half size, for a subagent. */
export function petSmall(o: Outfit, opts: DrawOpts = {}): RasterCells {
  const { px, W, H } = petScaled(o, opts, 2)
  return pack((x, y) => px[y * W + x] ?? -1, W, H)
}

/** A subagent's look: its pet's colours, a hat for its own model, an item of its own. */
export function agentOutfit(parent: Outfit, agent: { id: string; model: string | null }): Outfit {
  return {
    skin: parent.skin,
    hat: MODEL_HAT[modelFamily(agent.model)] ?? null,
    item: ITEM_NAMES[hashStr(agent.id) % ITEM_NAMES.length]!,
    isEgg: !agent.model,
  }
}

function toBase64(bytes: Uint8Array): string {
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64
  if (native) return native.call(bytes)
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let s = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    s += A.charAt((n >> 18) & 63) + A.charAt((n >> 12) & 63)
    s += i + 1 < bytes.length ? A.charAt((n >> 6) & 63) : '='
    s += i + 2 < bytes.length ? A.charAt(n & 63) : '='
  }
  return s
}

/** The same pet as an SVG, for surfaces without Raster (the desktop app). */
export function petSvg(px: Int32Array): string {
  const rects: string[] = []
  for (let y = 0; y < PET_H; y++) for (let x = 0; x < PET_W; x++) {
    const c = px[y * PET_W + x]!
    if (c >= 0) rects.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="#${c.toString(16).padStart(6, '0')}"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PET_W} ${PET_H}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
