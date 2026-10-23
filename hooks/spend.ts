// What each pet's API calls would cost at list prices: every call in its
// transcript and its subagents', read as the transcript grows, each call once.
import type { Spend } from '../types'
import { costOf, tokensOf, type Usage } from './pricing'

/** One API call: when, what it would cost (null: a model with no price), and its tokens. */
export type Call = { at: number; usd: number | null; tokens: number }

/**
 * The awk pass the read scripts run over a transcript's new bytes: a line per
 * API call, `U <message id> <model> <timestamp> <input> <output> <cache read>
 * <cache write> <5-minute write> <1-hour write>`, `-` for what the line lacks.
 * Claude Code writes a line per content block, each with its call's usage:
 * the message id makes them one. A tool's input sits in the content as plain
 * JSON and may hold any of these names, so each is looked for where the
 * line's own is: the message's id and model come before its content, its
 * usage and the line's timestamp after it (the last of each on the line; the
 * first count after the usage is its total, not one of its `iterations`).
 */
export const USAGE_AWK = String.raw`function after(s, key,  i, at) { at = 0; while ((i = index(substr(s, at + 1), key)) > 0) at += i; return at ? substr(s, at + length(key)) : "" }
function num(s, k) { if (!match(s, "\"" k "\":[0-9]+")) return "-"; s = substr(s, RSTART, RLENGTH); sub(/.*:/, "", s); return s }
function str(s, re, pre) { if (!match(s, re)) return "-"; return substr(s, RSTART + length(pre), RLENGTH - length(pre)) }
/"type":"assistant"/ && /"usage":\{/ {
  id = str($0, "\"id\":\"msg_[A-Za-z0-9_-]+", "\"id\":\""); if (id == "-") next
  u = after($0, "\"usage\":{")
  t = after($0, "\"timestamp\":\"")
  print "U", id, str($0, "\"model\":\"claude-[^\"]*", "\"model\":\""), str(t, "^[0-9T:.Z+-]+", ""), num(u, "input_tokens"), num(u, "output_tokens"), num(u, "cache_read_input_tokens"), num(u, "cache_creation_input_tokens"), num(u, "ephemeral_5m_input_tokens"), num(u, "ephemeral_1h_input_tokens")
}`

/** Reads the awk pass's lines into `calls`, by message id: a call read again (a read backed up over it) is the same call. */
export function readCalls(text: string, calls: Map<string, Call>) {
  for (const l of text.split('\n')) {
    if (!l.startsWith('U ')) continue
    const [, id, model, stamp, ...n] = l.split(' ')
    if (!id || n.length < 6) continue
    const [input, output, read, write, w5, w1] = n.map(v => (v === '-' ? undefined : Number(v)))
    const usage: Usage = { input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write }
    if (w5 !== undefined || w1 !== undefined) usage.cache_creation = { ephemeral_5m_input_tokens: w5, ephemeral_1h_input_tokens: w1 }
    const tokens = tokensOf(usage)
    // an error's stand-in reply (`<synthetic>`) moves nothing
    if (!tokens) continue
    const at = Date.parse(stamp ?? '')
    calls.set(id, { at: Number.isNaN(at) ? 0 : at, usd: costOf(model === '-' ? null : model, usage), tokens })
  }
}

/** A day as `2026-10-21`, in this machine's time. */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The last `n` days, today first, by the calendar (a day across a clock change is still one day). */
export function lastDays(now: number, n: number): string[] {
  const d = new Date(now)
  return Array.from({ length: n }, (_, i) => dayOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime()))
}

/** A pet's spend: in all, and day by day over the last `windowDays` days. */
export function spendOf(calls: Iterable<Call>, now: number, windowDays: number): Spend {
  const out: Spend = { usd: 0, tokens: 0, calls: 0, unpriced: 0, days: {} }
  const window = new Set(lastDays(now, windowDays))
  for (const c of calls) {
    out.calls++
    out.tokens += c.tokens
    if (c.usd === null) { out.unpriced++; continue }
    out.usd += c.usd
    const day = c.at ? dayOf(c.at) : ''
    if (window.has(day)) out.days[day] = (out.days[day] ?? 0) + c.usd
  }
  return out
}
