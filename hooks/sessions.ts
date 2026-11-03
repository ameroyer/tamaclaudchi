// A session as read off its transcript. Its mood is inferred from what was
// written last and how long ago, then corrected by the live registry when the
// process still runs.
import type { Live, Mood, Said, Step, TamaSession } from '../types'
import { costOf, tokensOf, type Usage } from './pricing'

/** A tool call older than this with no result is taken to be waiting on you. */
const STUCK_MS = 30_000
/** A turn with nothing written for this long has ended one way or another. */
const STALE_TURN_MS = 5 * 60_000
/** A pet quiet for this long is asleep (drawn faded). */
const ASLEEP_MS = 6 * 3600_000

/** What a pet is called: its title, or its repo until it has one. */
export const petName = (s: TamaSession) => s.title || s.repo

/** Closed, or quiet for hours: drawn faded. */
export const isAsleep = (s: TamaSession, now: number) => !s.live || now - s.mtimeMs > ASLEEP_MS

/** Running and stuck on you (a permission prompt): sad for as long as it lasts. */
export const isSad = (s: TamaSession) => !!s.live && s.mood === 'needs'

/** Running, its turn over, and left idle for `sleepyMs` (0: never): never sad, only sleepy. */
export const isSleepy = (s: TamaSession, now: number, sleepyMs: number) =>
  !!s.live && sleepyMs > 0 && (s.mood === 'waiting' || s.mood === 'idle') && now - s.mtimeMs > sleepyMs

type Entry = {
  type?: string
  isSidechain?: boolean
  isMeta?: boolean
  cwd?: string
  gitBranch?: string
  aiTitle?: string
  timestamp?: string
  message?: {
    id?: string
    role?: string
    model?: string
    stop_reason?: string | null
    content?: unknown
    usage?: Usage
  }
}

function lines(text: string): Entry[] {
  const out: Entry[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue // the cut first line of a tail, blanks
    try {
      out.push(JSON.parse(line))
    } catch {
      // a line cut by the tail, or still being written
    }
  }
  return out
}

// What the shelf keeps of each conversation; an opened pet reads its own in full.
const RECENT = 6
const SAID_CHARS = 400

export type ReadOpts = { recent?: number; chars?: number }

/** What a line said in words, or null for tool traffic and harness notes. */
function saidOf(e: Entry, chars: number): Said | null {
  const c = e.message?.content
  let text = ''
  if (typeof c === 'string') text = c
  else if (Array.isArray(c)) {
    text = (c as { type?: string; text?: string }[])
      .filter(b => b?.type === 'text' && typeof b.text === 'string')
      .map(b => b.text).join('\n')
  }
  text = text.trim()
  // command echoes, task notifications, system reminders, interruptions
  if (!text || text.startsWith('<') || text.startsWith('[Request interrupted')) return null
  // narration between tool calls is the pet thinking aloud: only a turn's reply counts
  if (e.type === 'assistant' && e.message?.stop_reason === 'tool_use') return null
  const role = e.type === 'assistant' ? 'assistant' : 'user'
  const at = e.timestamp ? Date.parse(e.timestamp) : NaN
  return {
    role, text: text.length > chars ? text.slice(0, chars - 1) + '…' : text,
    at: Number.isNaN(at) ? null : at,
    tokens: role === 'user' ? Math.ceil(text.length / 4) : 0,
    costUsd: null,
  }
}

const hasToolResult = (e: Entry) =>
  Array.isArray(e.message?.content) &&
  (e.message!.content as { type?: string }[]).some(c => c?.type === 'tool_result')

/** The folder name a repo is known by; a worktree counts as its repo. */
export function repoOf(cwd: string): string {
  const wt = cwd.indexOf('/.claude/worktrees/')
  const root = wt >= 0 ? cwd.slice(0, wt) : cwd
  return root.split('/').filter(Boolean).pop() || root
}

export function parseSession(
  id: string,
  tail: string,
  title: string | null,
  mtimeMs: number,
  now: number,
  bornMs: number | null = null,
  opts: ReadOpts = {},
): TamaSession {
  const chars = opts.chars ?? SAID_CHARS
  let cwd = '', branch: string | null = null, model: string | null = null
  let contextTokens = 0
  let last: Entry | null = null
  const recent: Said[] = []
  // This turn's API calls by message id: Claude Code writes one line per
  // content block, each carrying the call's usage, so a call is counted once.
  let turn = new Map<string, { model: string | undefined; usage: Usage }>()
  for (const e of lines(tail)) {
    if (e.cwd) cwd = e.cwd
    if (e.gitBranch) branch = e.gitBranch
    if (e.type === 'ai-title' && e.aiTitle) title = e.aiTitle
    if (e.isSidechain || e.isMeta) continue
    if (e.type === 'assistant' && e.message) {
      const m = e.message.model
      if (m && !m.startsWith('<')) model = m
      const u = e.message.usage
      if (u) contextTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
      last = e
      if (u) turn.set(e.message.id ?? `line-${turn.size}`, { model: m, usage: u })
      const said = saidOf(e, chars)
      if (said) {
        // the reply carries what its whole turn cost: the tool calls on the way
        // and the answer itself
        const calls = [...turn.values()]
        const costs = calls.map(c => costOf(c.model ?? model, c.usage))
        said.tokens = calls.reduce((n, c) => n + tokensOf(c.usage), 0)
        said.costUsd = costs.every(c => c !== null) && costs.length ? costs.reduce((a, c) => a! + c!, 0) : null
        recent.push(said)
      }
    } else if (e.type === 'user') {
      last = e
      const said = saidOf(e, chars)
      if (said) {
        recent.push(said)
        turn = new Map() // a new prompt starts a new turn
      }
    }
  }
  const age = now - mtimeMs
  let mood: Mood = 'idle'
  if (last?.type === 'assistant') {
    if (last.message?.stop_reason === 'tool_use') mood = age < STUCK_MS ? 'busy' : 'needs'
    else mood = 'waiting'
  } else if (last?.type === 'user') {
    // a prompt or a tool result the model has not answered yet
    mood = age < STALE_TURN_MS ? 'busy' : hasToolResult(last) ? 'idle' : 'waiting'
  }
  if (age > ASLEEP_MS) mood = 'idle'
  return {
    id, path: '', cwd, repo: repoOf(cwd || id), branch: branch || null, model, title,
    mood, mtimeMs, bornMs, contextTokens,
    isToolPending: last?.type === 'assistant' && last.message?.stop_reason === 'tool_use',
    recent: recent.slice(-(opts.recent ?? RECENT)),
    subagents: 0,
    subagentsEver: 0,
    compactions: 0,
    droppedTokens: 0,
    disk: null,
    spend: null,
    mail: null,
    lastPromptMs: null,
    bornBranch: null,
    skinSlot: null,
    itemSlot: null,
    live: null,
  }
}

/**
 * Folds in what the live registry says. A session with no live process is
 * closed: shown idle (and faded), whatever its transcript last said. One that
 * runs is as its registry says: `waiting` on you (a permission prompt…),
 * `busy` however long its tool takes, or `idle`. Only a registry with no
 * status (an older Claude Code) leaves the guess from the transcript's age.
 */
export function withLive(s: TamaSession, live: Live | null): TamaSession {
  if (!live) return { ...s, live: null, mood: 'idle' }
  const mood: Mood = live.status === 'waiting' ? 'needs'
    : live.status === 'busy' ? 'busy'
    : live.status === 'idle' ? 'waiting'
    : s.mood
  return { ...s, live, mood }
}

/** Moods change with time alone: a tool call goes unanswered, a turn goes quiet. */
export function rederive(s: TamaSession, now: number): TamaSession {
  const age = now - s.mtimeMs
  if (age > ASLEEP_MS) return { ...s, mood: 'idle' }
  if (s.mood !== 'busy') return s
  if (s.isToolPending && age > STUCK_MS) return { ...s, mood: 'needs' }
  if (!s.isToolPending && age > STALE_TURN_MS) return { ...s, mood: 'waiting' }
  return s
}

/** Models whose context window is 1M natively: Fable, Mythos, Opus 4.7 and later, Sonnet 5 and later, Haiku 5.5. */
const NATIVE_1M = /claude-(fable|mythos|opus-(4-[7-9]|[5-9])|sonnet-[5-9]|haiku-[5-9])/

/**
 * A model's context window as Claude Code takes it: 1M for those above, or a
 * `[1m]` one; 200K for the rest (Opus and Sonnet 4.6 without the long context,
 * Haiku 4.5), unless the session has grown past 200K, which only a long
 * context allows.
 */
export function modelWindow(model: string | null, tokens = 0): number {
  const id = (model ?? '').toLowerCase()
  return NATIVE_1M.test(id) || id.includes('[1m]') || tokens > 200_000 ? 1_000_000 : 200_000
}

/**
 * What can narrow Claude Code's auto-compact window: `CLAUDE_CODE_AUTO_COMPACT_WINDOW`,
 * then the `autoCompactWindow` setting of the model (`modelSettings`), then the top-level one.
 */
export type CompactWindows = { env: number | null; byModel: Record<string, number | null>; all: number | null }
export const NO_WINDOWS: CompactWindows = { env: null, byModel: {}, all: null }

/**
 * Where Claude Code auto-compacts a session, in tokens, as it reckons it: its
 * window (the model's, or the one set, never wider), less what it keeps for
 * the reply (20K) and for the summary (13K). About 967K for a 1M model.
 */
export function compactAt(model: string | null, tokens: number, w: CompactWindows = NO_WINDOWS): number {
  const full = modelWindow(model, tokens)
  const key = (model ?? '').toLowerCase().split('[')[0]!.replace(/-\d{8}$/, '')
  // a model's own setting, `auto` (null) included, before the top-level one
  const set = w.env ?? (key in w.byModel ? w.byModel[key] ?? null : w.all)
  return Math.min(full, set ?? full) - 20_000 - 13_000
}

/** An `autoCompactWindow` as a setting or the variable gives it: tokens from 100K to 1M (`500000`, `500k`, `1M`), or null for `auto` and anything else. */
export function windowOf(v: unknown): number | null {
  const m = typeof v === 'number' ? [String(v), String(v), ''] : typeof v === 'string' ? /^\s*(\d+(?:\.\d+)?)\s*([km]?)\s*$/i.exec(v) : null
  if (!m) return null
  const n = Number(m[1]) * (m[2]!.toLowerCase() === 'k' ? 1000 : m[2]!.toLowerCase() === 'm' ? 1_000_000 : 1)
  return n >= 100_000 && n <= 1_000_000 ? Math.round(n) : null
}

/** A settings file's part in the windows: `autoCompactWindow`, top-level and per model (`modelSettings`, as `/autocompact` writes it). */
export type WindowSettings = { autoCompactWindow?: unknown; modelSettings?: Record<string, { autoCompactWindow?: unknown } | undefined> }

/**
 * The windows once a settings file is laid over those set below it (user,
 * then the project's, then its local one), as Claude Code merges them: what
 * the file sets wins, `auto` included; what it leaves out stands.
 */
export function withSettings(w: CompactWindows, set: WindowSettings | null): CompactWindows {
  const byModel = { ...w.byModel }
  for (const [model, m] of Object.entries(set?.modelSettings ?? {})) {
    if (m && 'autoCompactWindow' in m) byModel[model.toLowerCase()] = windowOf(m.autoCompactWindow)
  }
  return { env: w.env, byModel, all: set && 'autoCompactWindow' in set ? windowOf(set.autoCompactWindow) : w.all }
}

/**
 * The awk pass the read scripts run for each compaction, after USAGE_AWK
 * (whose functions it uses): `K <timestamp> <tokens before> <tokens after>`,
 * `-` for what the line lacks (older ones give no count after).
 */
export const COMPACT_AWK = String.raw`/"subtype":"compact_boundary"/ && /"compactMetadata":\{/ {
  m = after($0, "\"compactMetadata\":{")
  print "K", str(after($0, "\"timestamp\":\""), "^[0-9T:.Z+-]+", ""), num(m, "preTokens"), num(m, "postTokens")
}`

/** Reads the awk pass's `K` lines into what each compaction dropped, by its time: one read twice (a read backed up over it) is one. */
export function readCompacts(text: string, into: Map<string, number>) {
  for (const l of text.split('\n')) {
    if (!l.startsWith('K ')) continue
    const [, at, pre, post] = l.split(' ')
    if (!at || at === '-' || !pre || pre === '-') continue
    into.set(at, Math.max(0, Number(pre) - (post && post !== '-' ? Number(post) : 0)))
  }
}

const MOOD_ORDER: Record<Mood, number> = { busy: 0, needs: 1, waiting: 2, idle: 3 }

export function shelfOrder(a: TamaSession, b: TamaSession): number {
  return Number(!a.live) - Number(!b.live) || MOOD_ORDER[a.mood] - MOOD_ORDER[b.mood] || b.mtimeMs - a.mtimeMs
}

type Block = { type?: string; text?: string; name?: string; input?: Record<string, unknown> }

/** A tool call in one line: its name and the gist of its input. */
function toolLine(b: Block): string {
  const i = b.input ?? {}
  const gist = ['command', 'description', 'file_path', 'pattern', 'url', 'query', 'prompt']
    .map(k => i[k]).find((v): v is string => typeof v === 'string') ?? JSON.stringify(i)
  const first = gist.split('\n')[0]!.trim()
  return `${b.name ?? 'tool'} · ${first.length > TOOL_CHARS ? first.slice(0, TOOL_CHARS - 1) + '…' : first}`
}
const TOOL_CHARS = 160

/**
 * A subagent's trace, oldest first: the task it was given, each tool call it
 * made, and what it wrote between them. Unlike a pet's conversation, the
 * narration between tool calls counts here: it is the agent thinking aloud.
 */
export function traceOf(text: string): Step[] {
  const out: Step[] = []
  for (const e of lines(text)) {
    const at = e.timestamp ? Date.parse(e.timestamp) : NaN
    const push = (kind: Step['kind'], t: string) => { if (t.trim()) out.push({ kind, text: t.trim(), at: Number.isNaN(at) ? null : at }) }
    const c = e.message?.content
    if (e.type === 'user') {
      if (typeof c === 'string') push('prompt', c)
      else if (Array.isArray(c)) for (const b of c as Block[]) if (b?.type === 'text') push('prompt', b.text ?? '')
    } else if (e.type === 'assistant' && Array.isArray(c)) {
      for (const b of c as Block[]) {
        if (b?.type === 'text') push('reply', b.text ?? '')
        else if (b?.type === 'tool_use') push('tool', toolLine(b))
      }
    }
  }
  return out
}
