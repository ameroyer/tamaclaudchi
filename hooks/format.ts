// Text for the cards and bubbles.
import { contextWindow } from './sessions'

// Bubbles are drawn again at every redraw, from the same messages: tidied
// once each. Bounded, as conversations come and go.
const tidied = new Map<string, string>()
const TIDIED_KEPT = 2000

/** Text for a bubble: markdown marks dropped, runs of blank lines folded. */
export function tidy(text: string): string {
  const hit = tidied.get(text)
  if (hit !== undefined) return hit
  if (tidied.size >= TIDIED_KEPT) tidied.clear()
  const out = tidyNow(text)
  tidied.set(text, out)
  return out
}

function tidyNow(text: string): string {
  return text
    .replace(/```[a-z]*\n?/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')

/** `Oct 9 14:32`, in the local time of this machine. */
export function when(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`
}

export function tokenCount(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export function usd(cost: number): string {
  if (!cost) return '$0'
  return `$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`
}

/** `42s ago`, `5m ago`, `3h ago`, then days: `2.1 days ago`. */
export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${(s / 86400).toFixed(1)} days ago`
}

/** A text cut to `n` cells, an ellipsis marking the cut. */
export const clip = (text: string, n: number) => (text.length > n ? text.slice(0, n - 1) + '…' : text)

/** The widest line of a text, in characters; a loop, as a spread of a long log would overflow the stack. */
export function widest(text: string): number {
  let w = 0
  for (const l of text.split('\n')) if (l.length > w) w = l.length
  return w
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The device's five context lights, and the share of the window used. */
export function lights(tokens: number): { on: string; off: string; color: string; pct: number } {
  const share = tokens / contextWindow(tokens)
  const n = Math.min(5, Math.round(share * 5))
  const color = share > 0.8 ? '#ff6188' : share > 0.6 ? '#ffd866' : '#a9dc76'
  return { on: '●'.repeat(n), off: '○'.repeat(5 - n), color, pct: Math.round(100 * share) }
}

export const GiB = 1024 * 1024 // in KiB

/** KiB as `12.1 GB`, `845 MB` or `12 KB`. */
export function bytes(kb: number): string {
  if (kb >= GiB) return `${(kb / GiB).toFixed(1)} GB`
  return kb >= 1024 ? `${Math.round(kb / 1024)} MB` : `${Math.round(kb)} KB`
}

/** The same packed for a card's corner, four cells at most: `12G`, `3.4G`, `0.2G`. */
export function bytesShort(kb: number): string {
  return kb >= 10 * GiB ? `${Math.round(kb / GiB)}G` : `${(kb / GiB).toFixed(1)}G`
}

/** Green, orange or red as `kb` passes `warn` and `alarm` (in GiB). Plain
 * hues, as a terminal of 16 colours turns a pink red into magenta. */
export function diskColor(kb: number, warn: number, alarm: number): string {
  return kb >= alarm * GiB ? '#ff5555' : kb >= warn * GiB ? '#ffaa00' : '#55dd55'
}

/**
 * A colour's hue at full strength. A terminal of 16 colours rounds a pastel to
 * white, so a text meant to match a pet keeps the pet's hue, saturated, and
 * lands on the nearest bright colour of that hue rather than on white.
 */
export function vivid(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255) as [number, number, number]
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (!d) return hex
  // in [0, 360): a red with more blue than green (a pink) comes out negative
  const h = ((max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360
  // HSL with full saturation and a lightness of 0.6
  const c = 0.8, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = 0.2
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r1)}${to(g1)}${to(b1)}`
}
