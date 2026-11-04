// TamaClaudchi in Claude Code: a pane with a pixel pet for every session on
// this machine, across folders.
//
// Every function that takes the engine interface ($) is declared in this one
// file, as the plugin directory asks ($ may not be passed to an imported
// function); the other modules are plain helpers. Its sections, in order:
// players (animations), shared (one session reads for the machine), alerts,
// mailfx (a message's animation), shelf (reading the transcripts), actions
// (the buttons), footer, view (the pane), and register (the hooks).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunInit, RenderElement, RenderInput, Register } from 'claude-code'

import type { TamaSession, Mood, Agent, GitInfo, GitTree, Grouping, Hatch, Live, Said, Spend, Step } from '../types'

import { settings, windowDays, since, applyOptions } from './config'
import { COMPACT_AWK, compactAt, NO_WINDOWS, readCompacts, windowOf, withSettings, type CompactWindows, type WindowSettings } from './sessions'
import { petName, isAsleep, isSad, isSleepy, parseSession, rederive, repoOf, shelfOrder, traceOf, withLive, petName as nameOf } from './sessions'
import { chooseSlot, mailFrames, outfits, petRest, ITEM_COUNT, itemKey, repoKey, SKIN_COUNT, stickySlots, GHOST_FRAME_MS, petFrames, agentOutfit, MODEL_SKIN, modelFamily, modelLabel, petPixels, petSmall, petSvg, type Slots, type Outfit } from './pets'
import { REPO_SKINS } from './sprites'
import { lastDays, readCalls, spendOf, USAGE_AWK, dayOf, type Call } from './spend'
import { lettersOf, MAIL_AWK, mailEdges, mailRead, PROMPT_AWK, readMail, postsOf, threadsOf, hasRecentMail, isFrom, type MailFact, type End, type Thread } from './mail'
import { bytes, clip, vivid, ago, bytesShort, diskColor, GiB, lights, plural, tidy, tokenCount, usd, when, widest } from './format'

/** The new-pet form, empty: this session's folder, no prompt, the default model, no worktree. */
export const NO_HATCH: Hatch = { dir: null, prompt: '', model: null, worktree: false }

// The values the mod reads or writes, one plugin and key each.
const convo = atom({ plugin: 'tamaclaudchi', key: 'convo' } as const, null as { id: string; mtimeMs: number; said: Said[] } | null)
const me = atom({ plugin: 'tamaclaudchi', key: 'me' } as const, null as string | null)
const git = atom({ plugin: 'tamaclaudchi', key: 'git' } as const, null as GitInfo | null)
const selected = atom({ plugin: 'tamaclaudchi', key: 'selected' } as const, null as string | null)
const sessions = atom({ plugin: 'tamaclaudchi', key: 'sessions' } as const, [] as TamaSession[])
const agents = atom({ plugin: 'tamaclaudchi', key: 'agents' } as const, null as { id: string; list: Agent[]; total: number } | null)
const agentPick = atom({ plugin: 'tamaclaudchi', key: 'agentPick' } as const, null as string | null)
const disk = atom({ plugin: 'tamaclaudchi', key: 'disk' } as const, null as { tempDir: string; tempKb: number; logKb: number } | null)
const trace = atom({ plugin: 'tamaclaudchi', key: 'trace' } as const, null as { id: string; mtimeMs: number; steps: Step[] } | null)
const showMailroom = atom({ plugin: 'tamaclaudchi', key: 'showMailroom' } as const, false)
const mailText = atom({ plugin: 'tamaclaudchi', key: 'mailText' } as const, null as { key: string; byId: Record<string, string> } | null)
const isSpawning = atom({ plugin: 'tamaclaudchi', key: 'isSpawning' } as const, false)
const renaming = atom({ plugin: 'tamaclaudchi', key: 'renaming' } as const, null as string | null)
const armed = atom({ plugin: 'tamaclaudchi', key: 'armed' } as const, null as string | null)
const showGit = atom({ plugin: 'tamaclaudchi', key: 'showGit' } as const, false)
const showConvo = atom({ plugin: 'tamaclaudchi', key: 'showConvo' } as const, false)
const convoShown = atom({ plugin: 'tamaclaudchi', key: 'convoShown' } as const, 0)
const showMail = atom({ plugin: 'tamaclaudchi', key: 'showMail' } as const, false)
const mailTab = atom({ plugin: 'tamaclaudchi', key: 'mailTab' } as const, null as string | null)
const mailSeen = atom({ plugin: 'tamaclaudchi', key: 'mailSeen' } as const, {} as Record<string, number>)
const footerFrame = atom({ plugin: 'tamaclaudchi', key: 'footerFrame' } as const, 0)
// what this session is busy doing for you (a kill, a hatch…): the footer's egg shakes meanwhile
const doing = atom({ plugin: 'tamaclaudchi', key: 'doing' } as const, [] as string[])
const showSpend = atom({ plugin: 'tamaclaudchi', key: 'showSpend' } as const, false)
const showHelp = atom({ plugin: 'tamaclaudchi', key: 'showHelp' } as const, false)
const version = atom({ plugin: 'tamaclaudchi', key: 'version' } as const, '')
const graveQuery = atom({ plugin: 'tamaclaudchi', key: 'graveQuery' } as const, '')
const showClosed = atom({ plugin: 'tamaclaudchi', key: 'showClosed' } as const, false)
const isOpen = atom({ plugin: 'tamaclaudchi', key: 'isOpen' } as const, false)
const groupBy = atom({ plugin: 'tamaclaudchi', key: 'groupBy' } as const, 'mood' as Grouping)
const isBroadcasting = atom({ plugin: 'tamaclaudchi', key: 'isBroadcasting' } as const, false)
const broadcastTo = atom({ plugin: 'tamaclaudchi', key: 'broadcastTo' } as const, 'all')
const hatch = atom({ plugin: 'tamaclaudchi', key: 'hatch' } as const, NO_HATCH as Hatch)
// the folders the new-pet form offers for what its folder field holds
const folderHints = atom({ plugin: 'tamaclaudchi', key: 'folderHints' } as const, { for: null as string | null, dirs: [] as string[] })
// the pet whose page shows the colours its repo can take
const pickingColour = atom({ plugin: 'tamaclaudchi', key: 'pickingColour' } as const, null as string | null)
const density = atom({ plugin: 'tamaclaudchi', key: 'density' } as const, 'auto' as 'auto' | 'cards' | 'faces')
const shelfFilter = atom({ plugin: 'tamaclaudchi', key: 'shelfFilter' } as const, '')
const isFiltering = atom({ plugin: 'tamaclaudchi', key: 'isFiltering' } as const, false)
const showSleepy = atom({ plugin: 'tamaclaudchi', key: 'showSleepy' } as const, false)
const agentsMore = atom({ plugin: 'tamaclaudchi', key: 'agentsMore' } as const, 0)

// ─── players ─────────────────────────────────────────────────────────────────

// The pets now playing frames into their Rasters, by Raster key: a hover loop
// (the actions section) or a message's animation (the mailfx section). One at a time per pet: a
// new one cancels the one before. A reload drops them, which only stops a pet
// mid-hop.

export const PANE = 'tamaclaudchi'

// What narrows Claude Code's auto-compact window (sessions.ts), read at every
// poll: for this user, and for each folder a pet runs in whose project settings set it.
let windows: CompactWindows = NO_WINDOWS
let windowsByCwd = new Map<string, CompactWindows>()

/** Where Claude Code auto-compacts a pet, by the settings of the folder it runs in. */
export const compactAtOf = (s: TamaSession) => compactAt(s.model, s.contextTokens, windowsByCwd.get(s.cwd) ?? windows)

/** A pet's context lights: how far it has come to where Claude Code auto-compacts it. */
export const ctxOf = (s: TamaSession) => lights(s.contextTokens, compactAtOf(s))

/** A settings file's windows part, or null when it is missing or unreadable. */
async function readSettings($: EngineInterface, path: string): Promise<WindowSettings | null> {
  try {
    const set: unknown = JSON.parse(await $.fs.read(path))
    return set && typeof set === 'object' ? (set as WindowSettings) : null
  } catch {
    return null
  }
}

/**
 * The auto-compact windows set for this user (~/.claude/settings.json), and
 * `CLAUDE_CODE_AUTO_COMPACT_WINDOW` as this session sees it (a session
 * started with another value is not known here).
 */
async function readWindows($: EngineInterface, dir: string): Promise<CompactWindows> {
  const env = windowOf(await $.env.get('CLAUDE_CODE_AUTO_COMPACT_WINDOW'))
  return withSettings({ ...NO_WINDOWS, env }, await readSettings($, `${dir}/settings.json`))
}

/** Project settings are read again this often: they change by hand, rarely. */
const PROJECT_SETTINGS_MS = 60_000
// each folder's settings as last read, and when
const projectSettings = new Map<string, { at: number; shared: WindowSettings | null; local: WindowSettings | null }>()

/** The windows of each pet's folder that its `.claude/settings.json` or `settings.local.json` changes. */
async function readProjectWindows($: EngineInterface, shelf: TamaSession[], now: number): Promise<Map<string, CompactWindows>> {
  const out = new Map<string, CompactWindows>()
  const cwds = new Set(shelf.map(s => s.cwd).filter(Boolean))
  for (const cwd of projectSettings.keys()) if (!cwds.has(cwd)) projectSettings.delete(cwd)
  // the stale ones read at once, side by side
  await Promise.all([...cwds].filter(cwd => !(now - (projectSettings.get(cwd)?.at ?? -Infinity) <= PROJECT_SETTINGS_MS)).map(async cwd => {
    const [shared, local] = await Promise.all([readSettings($, `${cwd}/.claude/settings.json`), readSettings($, `${cwd}/.claude/settings.local.json`)])
    projectSettings.set(cwd, { at: now, shared, local })
  }))
  for (const cwd of cwds) {
    const set = projectSettings.get(cwd)!
    if (set.shared || set.local) out.set(cwd, withSettings(withSettings(windows, set.shared), set.local))
  }
  return out
}

/** How a pet is drawn now: faded asleep, haloed closed, sad stuck on you, sleepy idle for long. */
export const lookOf = (s: TamaSession, now: number) =>
  ({ faded: isAsleep(s, now), halo: !s.live, sad: isSad(s), sleepy: isSleepy(s, now, settings.sleepyMs) })

export const playing = new Map<string, { cancel: () => void }>()

/** Plays `frames` once into a Raster, `ms` apart, then rests it; unless a hover loop plays there. */
export function playOnce($: EngineInterface, key: string, frames: string[], rest: string, ms: number) {
  if (playing.has(key)) return
  let n = 0
  const stop = () => {
    timer.cancel()
    if (playing.get(key) === entry) playing.delete(key)
  }
  const timer = $.clock.every(ms, () => {
    const isLast = n >= frames.length
    const cells = isLast ? rest : frames[n++]!
    void $.ui.blit({ requestId: PANE, key, cells }).then(r => { if (r.deny) stop() })
    if (isLast) stop()
  })
  const entry = { cancel: stop }
  playing.set(key, entry)
}

// ─── shared ──────────────────────────────────────────────────────────────────

// The shelf is read once for every session on this machine, not once per
// session: whichever session holds the lease reads the transcripts and
// writes what it found to one file, and the others read that file. A lease
// not renewed for a few of its polls is anyone's, so when its session closes
// another takes over within seconds.
//
// Two files, each named for this machine (a home folder shared between
// machines holds one pair per machine): a small lease, renewed at every poll,
// and the shelf itself, written only when it changes. Neither holds what the
// sessions said, only what the shelf's cards show.

export type Disk = { tempDir: string; tempKb: number; logKb: number }

type Lease = {
  schema: number
  /** The session holding the lease. */
  by: string
  /** When it last renewed it, ms since the epoch. */
  at: number
  /** How often it reads: a lease is good for LEASE_POLLS of those. */
  everyMs: number
}

export type Shelf = { sessions: TamaSession[]; disk: Disk | null }

/**
 * Bumped when the files change shape. The files are named for it, so sessions
 * running another version share files of their own rather than fight over these.
 */
const SCHEMA = 6
const LEASE_POLLS = 3

export const sharedPaths = (claudeDir: string, machine: string) => {
  const dir = `${claudeDir}/tamaclaudchi`
  return { dir, lease: `${dir}/lease-${machine}-v${SCHEMA}.json`, shelf: `${dir}/shelf-${machine}-v${SCHEMA}.json` }
}
type Paths = ReturnType<typeof sharedPaths>

// The shelf file as last parsed, kept while its mtime and size hold; and the
// text this session last wrote there.
let last: { mtimeMs: number; size: number; value: Shelf } | null = null
let written = ''

/**
 * The shelf another session has read, while its lease holds and it reads at
 * least as often as `everyMs`; null when this session should read for itself.
 */
export async function followed($: EngineInterface, paths: Paths, me: string | null, now: number, everyMs: number): Promise<Shelf | null> {
  let lease: Lease
  try {
    lease = JSON.parse(await $.fs.read(paths.lease)) as Lease
  } catch {
    return null // none yet, or caught mid-write: read for yourself this once
  }
  if (lease?.schema !== SCHEMA || lease.by === me || now - lease.at > LEASE_POLLS * lease.everyMs || lease.everyMs > everyMs) return null
  const st = await $.fs.stat(paths.shelf).catch(() => null)
  if (!st || st.kind !== 'file') return last?.value ?? null
  if (!last || last.mtimeMs !== st.mtimeMs || last.size !== st.size) {
    try {
      const value = JSON.parse(await $.fs.read(paths.shelf)) as Shelf & { schema?: number }
      if (value?.schema !== SCHEMA || !Array.isArray(value.sessions)) return null
      last = { mtimeMs: st.mtimeMs, size: st.size, value }
    } catch {
      // caught mid-write: the last whole read stands until the next poll
      if (!last) return null
    }
  }
  return last.value
}

/** Taking the lease over: the shelf file is another's now, so the next share writes it whole. */
export const takeOver = () => { written = '' }

/** Takes or renews the lease: a few bytes at every poll. */
export async function claim($: EngineInterface, paths: Paths, lease: Omit<Lease, 'schema'>) {
  await $.fs.write(paths.lease, JSON.stringify({ schema: SCHEMA, ...lease })).catch(() => undefined)
}

/** Shares the shelf this session has read, when it differs from what it last wrote. */
export async function share($: EngineInterface, paths: Paths, sessionsJson: string, disk: Disk | null) {
  const text = `{"schema":${SCHEMA},"disk":${JSON.stringify(disk)},"sessions":${sessionsJson}}`
  if (text === written) return
  const isFirst = !written
  await $.fs.write(paths.shelf, text).catch(() => undefined)
  written = text
  // what the shelf shows of every session (names, folders) is for this user alone
  if (isFirst) await $.process.run(['chmod', '700', paths.dir]).catch(() => undefined)
}

// ─── alerts ──────────────────────────────────────────────────────────────────

// Announces a pet that has started to need you (a permission prompt), and,
// when asked for, one that has finished its turn. Every session toasts the
// news of the others; the session reading for the machine alone raises the
// native notification, so it comes once, not once per session.

// Each running pet's mood and context (percent full) at the last poll; null
// before the first, which announces nothing (a pet already waiting when the
// session started is old news).
let before: Map<string, Mood> | null = null
let fullBefore: Map<string, number> | null = null

/**
 * What changed since the last poll, as lines to announce: a pet that started
 * to need you, finished (when asked for), or filled its context past the
 * setting's share (once, as it crosses it: a compact brings it back down).
 */
export function news(shelf: TamaSession[], prev: Map<string, Mood> | null, prevFull: Map<string, number> | null = null) {
  const out = { needs: [] as TamaSession[], done: [] as TamaSession[], full: [] as TamaSession[] }
  if (!prev) return out
  for (const s of shelf) {
    if (!s.live) continue
    const was = prev.get(s.id)
    if (s.mood === 'needs' && was !== 'needs') out.needs.push(s)
    else if (settings.alertOnDone && s.mood === 'waiting' && was === 'busy') out.done.push(s)
    const pct = ctxOf(s).pct
    const wasPct = prevFull?.get(s.id)
    if (settings.contextAlertPct > 0 && pct >= settings.contextAlertPct && wasPct !== undefined && wasPct < settings.contextAlertPct) out.full.push(s)
  }
  return out
}

const names = (list: TamaSession[]) => list.map(petName).join(', ')

export async function announce($: EngineInterface, shelf: TamaSession[], me: string | null, isReader: boolean) {
  const prev = before, prevFull = fullBefore
  before = new Map(shelf.filter(s => s.live).map(s => [s.id, s.mood]))
  fullBefore = new Map(shelf.filter(s => s.live).map(s => [s.id, ctxOf(s).pct]))
  if (settings.alerts === 'off') return
  const { needs, done, full } = news(shelf, prev, prevFull)
  // your own prompt is in front of you here: the toasts are for the others
  for (const s of full) if (s.id !== me) $.ui.toast(`◔ ${petName(s)} is ${ctxOf(s).pct}% of the way to auto-compacting: its card can compact it now`)
  if (!needs.length && !done.length) return
  for (const s of needs) if (s.id !== me) $.ui.toast(`▲ ${petName(s)} needs you${s.live?.waitingFor ? `: ${s.live.waitingFor}` : ''}`)
  for (const s of done) if (s.id !== me) $.ui.toast(`✓ ${petName(s)} has finished and waits for you`)
  if (!isReader) return
  if (settings.alerts === 'toast and notification') {
    const lines = [
      needs.length ? `${needs.length === 1 ? `${petName(needs[0]!)} needs` : `${needs.length} pets need`} you${needs.length > 1 ? `: ${names(needs)}` : needs[0]!.live?.waitingFor ? `: ${needs[0]!.live!.waitingFor}` : ''}` : '',
      done.length ? `${done.length === 1 ? `${petName(done[0]!)} has` : `${names(done)} have`} finished` : '',
    ].filter(Boolean)
    await $.ui.notify(lines.join('\n'), { title: 'TamaClaudchi' }).catch(() => undefined)
  }
}

// ─── mailfx ──────────────────────────────────────────────────────────────────

// A message between two sessions, played on the shelf as it happens: its
// sender throws a letter, its receiver catches one (pets.ts draws them). Each
// pet plays its own end, so a message seen from both ends plays on both.

const MAIL_FRAME_MS = 180
/** A message older than this when first seen is old news: it plays nothing. */
const FRESH_MS = 2 * 60_000

// Each pet's ends of messages as of the last poll; null before the first,
// which plays nothing (what was sent before the shelf opened is old news).
let seen: Set<string> | null = null

/** The ends of messages new since the last poll: each its pet, and whether it sent or got the message. */
export function newMail(shelf: TamaSession[], prev: Set<string> | null, now: number) {
  const ends = new Set<string>()
  const fresh: { s: TamaSession; role: 'send' | 'get' }[] = []
  for (const s of shelf) {
    for (const m of s.mail ?? []) {
      const key = `${s.id}:${m.id}:${m.dir}`
      ends.add(key)
      if (prev && !prev.has(key) && s.live && m.ok && now - m.at < FRESH_MS) fresh.push({ s, role: m.dir === 'out' ? 'send' : 'get' })
    }
  }
  return { ends, fresh }
}

/** Plays every message new since the last poll on its pets' cards. */
export function playMail($: EngineInterface, shelf: TamaSession[], now: number) {
  const { ends, fresh } = newMail(shelf, seen, now)
  seen = ends
  if (!fresh.length) return
  const looks = outfits(shelf)
  for (const { s, role } of fresh) {
    const o = looks.get(s.id)!
    const look = lookOf(s, now)
    // the card's own Raster; a pane that is closed or on another page denies the blit, which stops it
    playOnce($, `pet-${s.id}`, mailFrames(o, look, role), petRest(o, look).cells, MAIL_FRAME_MS)
  }
}

// ─── shelf ───────────────────────────────────────────────────────────────────

// Reading the shelf off disk: every transcript under ~/.claude/projects, the
// registry of running sessions under ~/.claude/sessions, and, for the opened
// pet, its whole conversation, its subagents and its git. Nothing leaves this
// machine.

/** How many closed pets the graveyard holds (live ones always show); how far back it looks is a setting. */
const MAX_CLOSED = 150
/** How many of the newest transcripts are read besides the live ones, and per shell. */
const CANDIDATES = 150
const BATCH = 16
/** A transcript read from its start is grepped whole: fewer of those per shell. */
const FRESH_BATCH = 2
/** A transcript this big is read after every smaller one, on a first read. */
const BIG_BYTES = 8_000_000
/** Subagents' transcripts are small: many to a shell. */
const SUB_BATCH = 64
/** A read on is backed up this far, so a line cut by the last read is read whole. */
const OVERLAP_BYTES = 65_536
/** A session that never got a reply (a scripted one-shot, a quit) leaves the shelf. */
const EGG_SHOWN_MS = 15 * 60_000
const TAIL_BYTES = 131_072
/** How much of an opened pet's transcript is read for its conversation. */
const CONVO_BYTES = 2 * 1024 * 1024
/** A subagent counts as running while it has not finished and has written in this long. */
const AGENT_RUNNING_MS = 10 * 60_000
export const isAgentRunning = (a: Agent, now: number) => !a.isDone && now - a.mtimeMs < AGENT_RUNNING_MS
/** How often disk use is measured again. */
const DISK_MS = 60_000
/** An unchanged shelf is drawn again this often all the same, so its ages move on. */
const REDRAW_MS = 60_000
/** How many checkouts a pet's git section shows, newest commit first. */
const GIT_TREES = 4
/** Claude's own temp dir (`/tmp/claude-<uid>`), the only place a clean may delete in. */
export const TEMP_DIR = /^\/[^\x00-\x1f]*\/claude-\d+$/
/** A project's folder name in it, as Claude Code writes them (`-home-me-src-repo`). */
export const PROJECT_DIR = /^[\w.-]+$/
/** A tmux pane as the registry names it, `session:@window.%pane`. */
const TMUX_PANE = /^[^:\n]+:@\d+\.%\d+$/
/** Session ids are uuids: any other file is not a transcript, and its name never reaches a command. */
export const SESSION_ID = /^[\w-]+$/

type Transcript = { path: string; id: string; mtimeMs: number; size: number; stamp: string }

// Parsed transcripts by path, kept while the file's mtime and size hold, with
// the facts read so far, the API calls found, and up to which byte. A module
// variable on purpose: a reload just reads them again.
const cache = new Map<string, {
  stamp: string; size: number; facts: Record<string, string>; calls: Map<string, Call>; mail: Map<string, MailFact>; compacts: Map<string, number>; session: TamaSession
}>()
// The same for subagents' transcripts, whose API calls count to their pet.
const subCache = new Map<string, { stamp: string; size: number; calls: Map<string, Call> }>()
// A closed pet's subagents, listed once: they write no more.
const closedSubs = new Map<string, Transcript[]>()
// How many times API calls have been read, and each pet's spend as of then.
let callsRead = 0
let spent: { key: string; byId: Map<string, Spend> } = { key: '', byId: new Map() }

// Every transcript, one line each: mtime in seconds, size, path. One process
// rather than a listing per project folder, of which there are hundreds. GNU
// find prints them itself; BSD find (macOS) has stat print them.
const LIST_SCRIPT = `if find "$1" -maxdepth 0 -printf '' 2>/dev/null; then
  find "$1" -mindepth 2 -maxdepth 2 -name '*.jsonl' -printf '%T@\\t%s\\t%p\\n'
else
  find "$1" -mindepth 2 -maxdepth 2 -name '*.jsonl' -exec stat -f '%m%t%z%t%N' {} +
fi`

// What the read script's one pass over a transcript's new bytes says of it,
// besides the other passes' lines: the newest custom title (a /rename, or an
// SDK run naming itself) and ai-title, the last model, and the context of the
// last reply (its input, cache read and cache write), each as a fact line.
// One pass: a transcript of many MB is read once, not once per fact.
const FACTS_AWK = String.raw`function lastOf(s, re,  out) { out = ""; while (match(s, re)) { out = substr(s, RSTART, RLENGTH); s = substr(s, RSTART + RLENGTH) } return out }
function ctxOf(s,  n, i, p, k) { n = 0; split("input_tokens cache_read_input_tokens cache_creation_input_tokens", k, " ")
  for (i = 1; i <= 3; i++) { p = index(s, "\"" k[i] "\":"); if (p) n += substr(s, p + length(k[i]) + 3) + 0 }
  return n }
index($0, "\"customTitle\":\"") { v = lastOf($0, "\"customTitle\":\"([^\"\\\\]|\\\\.)*\""); if (v != "") custom = v }
index($0, "\"aiTitle\":\"") { v = lastOf($0, "\"aiTitle\":\"([^\"\\\\]|\\\\.)*\""); if (v != "") ai = v }
index($0, "\"model\":\"claude-") { v = lastOf($0, "\"model\":\"claude-[^\"]*\""); if (v != "") model = v }
index($0, "\"type\":\"assistant\"") && !index($0, "\"isSidechain\":true") && index($0, "\"usage\"") { ctx = ctxOf($0); hasCtx = 1 }
END { if (custom != "") print custom; if (ai != "") print ai; if (model != "") print model; if (hasCtx) printf "\"contextTokens\":\"%d\"\n", ctx }`

// One shell per batch of changed transcripts, given as pairs: a path, and the
// byte its facts were read up to (0 for a file not read yet, or rewritten).
// For each: its path, then one `"key":"value"` line per fact found past that
// byte (so none can shift another): when read from the start, what it was
// born with, the first timestamp, folder and branch (a session may cd and
// check out as it works; its looks stay those it was born with); the newest
// custom title (a /rename, or an SDK run naming
// itself); the newest ai-title (written early, out of reach of the tail); and
// the last model (a tail full of one big tool result holds no reply, and would
// hatch the pet back into an egg); the last reply's context, for the same
// reason (a prompt snapshot written after a reply can outgrow the tail
// alone); a line per API call (spend.ts); each line
// about a message to or from another session, and the time of the last prompt
// you typed (mail.ts). Then the tail
// itself. A busy transcript is so read only where it grew, not whole at every
// poll.
const READ_SCRIPT = `while [ $# -gt 1 ]; do
  f="$1"; off="$2"; shift 2
  printf '\\036%s\\n' "$f"
  if [ "$off" -eq 0 ]; then
    grep -m 1 -o '"timestamp":"[^"]*"' "$f"
    grep -m 1 -o '"cwd":"[^"]*"' "$f"
    grep -m 1 -o '"gitBranch":"[^"]*"' "$f"
  fi
  tail -c +$((off + 1)) "$f" | awk '${FACTS_AWK}
${MAIL_AWK}
${PROMPT_AWK}
${USAGE_AWK}
${COMPACT_AWK}'
  printf '\\037\\n'
  tail -c ${TAIL_BYTES} "$f"
  printf '\\n'
done`

// The API calls in subagents' transcripts, each read on from where it was.
const USAGE_SCRIPT = `while [ $# -gt 1 ]; do
  f="$1"; off="$2"; shift 2
  printf '\\036%s\\n' "$f"
  tail -c +$((off + 1)) "$f" | awk '${USAGE_AWK}'
done`

// Whether each subagent given has finished: a last reply, or a background
// agent's hand-back to its pet, in its last two lines.
const DONE_SCRIPT = `for f in "$@"; do
  printf '\\036%s\\n' "$f"
  tail -n 2 "$f" | grep -c -e '"stop_reason":"end_turn"' -e '"name":"SubagentHandback"'
done`

// The opened pet's subagents given (its newest, however old, and any written
// lately enough to be at work still): for each, its path, mtime, whether it
// has finished (as above), its model, and its .meta.json (agent type and task
// description) on one line.
const AGENTS_SCRIPT = `for f in "$@"; do
  printf '\\036%s\\n' "$f"
  date -r "$f" +%s
  tail -n 2 "$f" | grep -c -e '"stop_reason":"end_turn"' -e '"name":"SubagentHandback"'
  printf '%s\\n' "$(tail -c 262144 "$f" | grep -o '"model":"claude-[^"]*"' | tail -n 1)"
  head -c 4000 "\${f%.jsonl}.meta.json" 2>/dev/null
  printf '\\n'
done`

// Every git checkout the opened pet has worked in: its own folder ($1), and
// each folder its transcript ($2) and its last day's subagents ($3) name as a
// cwd, or in a command they ran as a \`cd <dir>\` or a \`git -C <dir>\` (never
// a path a tool merely printed), resolved to the checkout holding it. For
// each: its path, newest commit time, \`status -sb\` (in its own checkout
// alone, as status may run a repo's own filter commands; elsewhere only the
// branch), then its last commits. Git runs read-only: no index lock taken, and
// none of the commands a repo's own config could otherwise have it run (an
// fsmonitor, or a signature checker named by gpg.program when log.showSignature
// is on): a folder a session cd'd into may be any clone.
const GIT_SCRIPT = `export GIT_OPTIONAL_LOCKS=0
g() { git -c core.fsmonitor=false -c core.untrackedCache=false -c log.showSignature=false -c gpg.program=false "$@"; }
home=$(g -C "$1" rev-parse --show-toplevel 2>/dev/null)
{
  printf '%s\\n' "$1"
  { tail -c 4000000 "$2"; find "$3" -maxdepth 1 -name 'agent-*.jsonl' -mtime -1 -exec tail -c 1000000 {} \\; 2>/dev/null; } |
    grep -o -E '"cwd":"[^"]*"|"command":"cd [^ "&;|]+|"command":"[^"]*git -C [^ "&;|]+' |
    sed -E 's/^"cwd":"//; s/"$//; s/^"command":"cd //; s/^"command":".*git -C //'
} | awk '!seen[$0]++' | tail -n 80 | while read -r d; do
  case "$d" in "~"*) d="$HOME\${d#\\~}" ;; /*) ;; *) continue ;; esac
  g -C "$d" rev-parse --show-toplevel 2>/dev/null
done | awk '!seen[$0]++' | while read -r top; do
  printf '\\036%s\\n' "$top"
  g -C "$top" log -1 --format=%ct 2>/dev/null || echo 0
  if [ "$top" = "$home" ]; then g -C "$top" status -sb 2>/dev/null
  else printf '## %s\\n' "$(g -C "$top" rev-parse --abbrev-ref HEAD 2>/dev/null)"; fi
  printf '\\037\\n'
  g -C "$top" log -3 --pretty=format:'%h %s · %cr' 2>/dev/null
  printf '\\n'
done`

// Disk use: Claude's temp dir and the transcripts' dir as wholes, then, for
// each pet ("<project>/<session id>"), its folder in the temp dir, its
// transcript and its folder of subagents. Two du runs, as one run counts a
// file only once however many of its arguments hold it. The temp dir is
// under $TMPDIR, or /tmp where it is not (macOS, whose $TMPDIR Claude Code
// does not use).
const DISK_SCRIPT = `p="$1"; shift
b="\${CLAUDE_CODE_TMPDIR:-\${TMPDIR:-/tmp}}"
t="\${b%/}/claude-$(id -u)"
[ -d "$t" ] || t="/tmp/claude-$(id -u)"
printf '%s\\n' "$t"
du -sk "$t" "$p" 2>/dev/null
printf '\\037\\n'
for s in "$@"; do printf '%s\\n%s\\n%s\\n' "$t/$s" "$p/$s.jsonl" "$p/$s"; done | tr '\\n' '\\0' | xargs -0 -r du -sk 2>/dev/null
true`

export async function claudeDir($: EngineInterface): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) || `${await $.env.get('HOME')}/.claude`
}

/** A process where there is no /proc (macOS): its parent, and its start as `ps -o lstart` prints it in UTC. */
type Proc = { ppid: number; start: string }
// The process table, read once for a poll's checks; null where ps fails.
let procs: Promise<Map<number, Proc> | null> | null = null
/** The next check reads the process table again (a poll, a kill). */
export const forgetProcesses = () => { procs = null }

/** Where there is no /proc, the registry writes a process's start as ps does in UTC: `Thu Oct 22 22:10:12 2026`. */
const LSTART = /^[A-Z][a-z]{2} [A-Z][a-z]{2} +\d{1,2} \d\d:\d\d:\d\d \d{4}$/
const sameStart = (a: string, b: string) => a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' ')

/** Every process by pid, from one ps run: one process a poll, rather than one per pid. */
function processes($: EngineInterface): Promise<Map<number, Proc> | null> {
  if (!procs) procs = readProcesses($)
  return procs
}

async function readProcesses($: EngineInterface): Promise<Map<number, Proc> | null> {
  const r = await $.process.run(['env', 'TZ=UTC0', 'LC_ALL=C', 'ps', '-A', '-o', 'pid=,ppid=,lstart=']).catch(() => null)
  if (!r || r.exitCode !== 0) return null
  const out = new Map<number, Proc>()
  for (const l of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(l)
    if (m) out.set(Number(m[1]), { ppid: Number(m[2]), start: m[3]! })
  }
  return out
}

/** Whether a pid still runs and is still the process the registry saw start. */
export async function isRunning($: EngineInterface, pid: number, procStart: string | null): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) return false
  // a start written as ps prints it was written where there is no /proc: straight to the table
  const isPsStart = !!procStart && LSTART.test(procStart)
  const stat = procStart && !isPsStart ? await $.fs.read(`/proc/${pid}/stat`).catch(() => '') : ''
  if (!stat) {
    if (!isPsStart && await $.fs.exists(`/proc/${pid}`)) return true
    if (!isPsStart && await $.fs.exists('/proc/self')) return false
    // no /proc at all (macOS): ask the process table, whose start times the
    // registry writes alike
    const table = await processes($)
    if (!table) return (await $.process.run(['kill', '-0', String(pid)]).catch(() => null))?.exitCode === 0
    const p = table.get(pid)
    return !!p && (!procStart || !LSTART.test(procStart) || sameStart(p.start, procStart))
  }
  // the start time is field 22; the name before it, in parentheses, may hold spaces
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] === procStart
}

/**
 * Whether a pid's start time can be checked here, so that a pid freed and
 * given to a newer process is told apart: from /proc, or from ps where the
 * registry wrote the start as ps prints it.
 */
export async function canTellApart($: EngineInterface, procStart: string | null): Promise<boolean> {
  if (!procStart) return false
  if (await $.fs.exists('/proc/self')) return true
  return LSTART.test(procStart) && !!(await processes($))
}

/** A process's parent: from /proc, or the process table; 0 when unknown. */
export async function parentOf($: EngineInterface, pid: number): Promise<number> {
  const stat = await $.fs.read(`/proc/${pid}/stat`).catch(() => '')
  if (stat) return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) || 0
  return (await processes($))?.get(pid)?.ppid ?? 0
}

// This machine, as Claude Code's registry names it (`linux:<machine id>:pid:[<pid
// namespace>]` on Linux, `darwin` on a Mac), read once. A home folder shared
// between machines holds the registry entries of all of them; a pid means
// something only on its own.
let machine: Promise<{ key: string; domain: string | null }> | null = null

const MACHINE_SCRIPT = `cat /etc/machine-id 2>/dev/null; echo; readlink /proc/self/ns/pid 2>/dev/null
ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | sed -n 's/.*"IOPlatformUUID" = "\\(.*\\)".*/\\1/p'`

/**
 * This machine, from what MACHINE_SCRIPT prints: a key for the files the mod
 * shares on it, and its registry domain (null where unknown). A Mac's
 * registry entries all say `darwin`, so one Mac cannot tell another's apart,
 * only a Linux machine's.
 */
export function machineFrom(stdout: string): { key: string; domain: string | null } {
  const lines = stdout.split('\n').map(l => l.trim())
  const id = lines.find(l => /^[0-9a-f]{8,}$/.test(l))
  const ns = lines.find(l => /^pid:\[\d+\]$/.test(l))
  const mac = lines.find(l => /^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i.test(l))
  return id && ns ? { key: id.slice(0, 12), domain: `linux:${id}:${ns}` }
    : mac ? { key: mac.replace(/-/g, '').slice(0, 12).toLowerCase(), domain: 'darwin' }
    : { key: 'local', domain: null }
}

/** This machine, read once. */
function machineOf($: EngineInterface) {
  if (!machine) machine = readMachine($)
  return machine
}

async function readMachine($: EngineInterface): Promise<{ key: string; domain: string | null }> {
  const r = await $.process.run(['sh', '-c', MACHINE_SCRIPT]).catch(() => null)
  return r ? machineFrom(r.stdout) : { key: 'local', domain: null }
}

/**
 * The machine a registry entry's `pidDomain` names, as the key its files of
 * the mod carry (`lease-<key>-v6.json`); null for a Mac's `darwin`, which
 * names no machine in particular.
 */
export function machineKeyOf(domain: string): string | null {
  const m = /^linux:([0-9a-f]{12,}):/.exec(domain)
  return m ? m[1]!.slice(0, 12) : null
}

/**
 * When each machine sharing this home folder last renewed a lease, under any
 * version of the mod: a session on it reading for it, until then. Read off
 * the lease files' times, which hold whatever the version wrote inside.
 */
export function leaseTimes(files: { name: string; kind: string; mtimeMs: number }[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const f of files) {
    const m = /^lease-([0-9a-f]{12})(?:-v\d+)?\.json$/.exec(f.name)
    if (f.kind === 'file' && m) out.set(m[1]!, Math.max(out.get(m[1]!) ?? 0, f.mtimeMs))
  }
  return out
}

/**
 * A lease not renewed for this long: no session on its machine runs the mod
 * any more (the machine is down, or rebooted under a new machine id, as some
 * cluster nodes do). Far past a lease's own few polls, for the clocks of two
 * machines and the caches of a network file system.
 */
export const LAPSED_MS = 5 * 60_000

/**
 * Whether a session on another machine still counts as running. Its pid
 * cannot be checked from here, so: not if its machine's lease lapsed after the
 * entry was last written (a session there that ran the mod last saw it, and
 * none has since); else while the entry was written within the graveyard's window.
 */
export function isAliveElsewhere(updatedMs: number, leaseMs: number | undefined, now: number, windowMs: number): boolean {
  if (leaseMs !== undefined && now - leaseMs > LAPSED_MS && updatedMs <= leaseMs + LAPSED_MS) return false
  return now - updatedMs < windowMs
}

// Registry entries by file name, as last read: one whose file has not changed
// is not read again, and one whose process had ended stays ended (a crashed
// session leaves its entry behind for good).
const registry = new Map<string, { stamp: string; id: string | null; live: Live; hasEnded: boolean; updatedMs: number; machine: string | null }>()

/**
 * Running sessions by id, from Claude Code's own registry of live processes.
 * One on another machine (a shared home folder) cannot be checked from here:
 * it counts as running while its entry was written within the graveyard's
 * window, marked as elsewhere, and nothing here acts on it.
 */
export async function readLive($: EngineInterface): Promise<Map<string, Live>> {
  const dir = `${await claudeDir($)}/sessions`
  const { domain } = await machineOf($)
  const out = new Map<string, Live>()
  const seen = new Set<string>()
  forgetProcesses()
  let leases: Map<string, number> | null = null
  for (const f of await $.fs.list(dir).catch(() => [])) {
    if (f.kind !== 'file' || !f.name.endsWith('.json')) continue
    seen.add(f.name)
    const stamp = `${f.mtimeMs}:${f.size}`
    let e = registry.get(f.name)
    if (e?.stamp !== stamp) {
      try {
        const reg = JSON.parse(await $.fs.read(`${dir}/${f.name}`))
        const isElsewhere = !!domain && typeof reg.pidDomain === 'string' && reg.pidDomain !== domain
        e = {
          stamp, id: typeof reg.sessionId === 'string' ? reg.sessionId : null, hasEnded: false,
          updatedMs: typeof reg.updatedAt === 'number' ? reg.updatedAt : 0,
          machine: isElsewhere ? machineKeyOf(reg.pidDomain) : null,
          live: {
            isElsewhere,
            pid: reg.pid, procStart: typeof reg.procStart === 'string' ? reg.procStart : null,
            status: typeof reg.status === 'string' ? reg.status : null,
            waitingFor: typeof reg.waitingFor === 'string' ? reg.waitingFor : null,
            // a pane on another machine is not this tmux server's to reach
            tmux: typeof reg.tmux === 'string' && TMUX_PANE.test(reg.tmux) && !isElsewhere ? reg.tmux : null,
            // a background session (claude --bg): `claude attach <job>` opens it
            job: typeof reg.jobId === 'string' && SESSION_ID.test(reg.jobId) && !isElsewhere ? reg.jobId : null,
            name: typeof reg.name === 'string' ? reg.name : null,
            // written when /remote-control connects, cleared when it stops
            isRemote: typeof reg.bridgeSessionId === 'string' && reg.bridgeSessionId !== '',
            cwd: typeof reg.cwd === 'string' ? reg.cwd : null,
            startedMs: typeof reg.startedAt === 'number' ? reg.startedAt : null,
            socket: typeof reg.messagingSocketPath === 'string' && !isElsewhere ? reg.messagingSocketPath : null,
          },
        }
        registry.set(f.name, e)
      } catch {
        // half-written, or gone between the list and the read: read again next time
        continue
      }
    }
    if (!e.id || e.hasEnded) continue
    if (e.live.isElsewhere) {
      if (e.machine) leases ??= leaseTimes(await $.fs.list(`${await claudeDir($)}/tamaclaudchi`).catch(() => []))
      if (isAliveElsewhere(e.updatedMs, e.machine ? leases?.get(e.machine) : undefined, Date.now(), settings.windowMs)) out.set(e.id, merged(out.get(e.id), e.live))
      continue
    }
    if (!(await isRunning($, e.live.pid, e.live.procStart))) {
      e.hasEnded = true
      continue
    }
    out.set(e.id, merged(out.get(e.id), e.live))
  }
  for (const name of registry.keys()) if (!seen.has(name)) registry.delete(name)
  return out
}

/**
 * Two live entries for one session id. One here beats one elsewhere: a
 * session resumed on this machine leaves the entry of its last run on another
 * behind (or on this one, before a reboot gave it a new machine id).
 */
function merged(a: Live | undefined, b: Live): Live {
  if (a && a.isElsewhere !== b.isElsewhere) return a.isElsewhere ? b : a
  return joined(a, b)
}

/**
 * Two live entries for one session: a background session (claude --bg), and a
 * `claude attach` showing it, which registers with the same id, as a session
 * of its own, with its tmux pane but no job. The background process is the
 * session; the attach lends it its pane, where a jump finds it.
 */
function joined(a: Live | undefined, b: Live): Live {
  const bg = a?.job ? a : b.job ? b : null
  if (!a || !bg) return b
  return { ...bg, tmux: bg.tmux ?? (bg === a ? b : a).tmux }
}

/** The transcripts worth reading, newest first: the recent ones, and every live one. */
async function listTranscripts($: EngineInterface, root: string, now: number, live: Map<string, Live>): Promise<Transcript[]> {
  const files: Transcript[] = []
  const found = await $.process.run(['sh', '-c', LIST_SCRIPT, 'sh', root], { timeoutMs: 30_000 }).catch(() => null)
  if (found?.exitCode === 0) {
    for (const l of found.stdout.split('\n')) {
      const [secs = '', size = '', path = ''] = l.split('\t')
      const id = path.slice(path.lastIndexOf('/') + 1, -'.jsonl'.length)
      const mtimeMs = Math.round(Number(secs) * 1000)
      if (!path.startsWith(`${root}/`) || !SESSION_ID.test(id) || !mtimeMs) continue
      if (now - mtimeMs > settings.windowMs && !live.has(id)) continue
      files.push({ path, id, mtimeMs, size: Number(size), stamp: `${mtimeMs}:${size}` })
    }
  } else for (const dir of await $.fs.list(root).catch(() => [])) {
    // no find that prints (not GNU): a listing per folder
    if (dir.kind !== 'dir') continue
    for (const f of await $.fs.list(`${root}/${dir.name}`).catch(() => [])) {
      const id = f.name.slice(0, -'.jsonl'.length)
      if (f.kind !== 'file' || !f.name.endsWith('.jsonl') || !SESSION_ID.test(id)) continue
      if (now - f.mtimeMs > settings.windowMs && !live.has(id)) continue
      files.push({ path: `${root}/${dir.name}/${f.name}`, id, mtimeMs: f.mtimeMs, size: f.size, stamp: `${f.mtimeMs}:${f.size}` })
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files.filter((f, i) => i < CANDIDATES || live.has(f.id))
}

/** The read script's facts, one `"key":"value"` a line. */
function factsOf(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of text.split('\n')) {
    try { Object.assign(out, JSON.parse(`{${l}}`)) } catch {}
  }
  return out
}

/** The byte a grown file is read on from, backed up a little; a file that shrank was rewritten, and is read from the start. */
const readFrom = (c: { size: number } | undefined, f: Transcript) => (c && f.size >= c.size ? Math.max(0, c.size - OVERLAP_BYTES) : 0)

/** Parses a batch of changed transcripts into the cache, each read on from where it was. */
async function readBatch($: EngineInterface, batch: Transcript[], now: number) {
  const byPath = new Map(batch.map(f => [f.path, f]))
  const res = await $.process.run(['sh', '-c', READ_SCRIPT, 'sh', ...batch.flatMap(f => [f.path, String(readFrom(cache.get(f.path), f))])], { timeoutMs: 120_000 })
    .catch((err: unknown) => {
      logOnce($, `tamaclaudchi: could not read ${batch.length} transcripts: ${String(err)}`)
      return null
    })
  if (!res) return
  const { stdout } = res
  for (const chunk of stdout.split('\x1e').slice(1)) {
    const nl = chunk.indexOf('\n')
    const f = byPath.get(chunk.slice(0, nl))
    if (!f) continue
    // one transcript with something unexpected in it must not stop the shelf
    try {
      const sep = chunk.indexOf('\x1f\n', nl)
      // read on: the facts found before stand, the newer ones over them; rewritten: start again
      const c = cache.get(f.path)
      const isReadOn = !!c && f.size >= c.size
      const head = chunk.slice(nl + 1, sep)
      const facts = { ...(isReadOn ? c.facts : {}), ...factsOf(head) }
      const calls = isReadOn ? c.calls : new Map<string, Call>()
      const had = isReadOn ? calls.size : -1
      readCalls(head, calls)
      // the spend is counted again only when a call was found (or the file rewritten)
      if (calls.size !== had) callsRead++
      const mail = isReadOn ? c.mail : new Map<string, MailFact>()
      readMail(head, mail)
      const compacts = isReadOn ? c.compacts : new Map<string, number>()
      readCompacts(head, compacts)
      const dropped = [...compacts.values()]
      const born = Date.parse(facts.timestamp ?? '')
      const s = parseSession(f.id, chunk.slice(sep + 2), facts.aiTitle ?? null, f.mtimeMs, now, Number.isNaN(born) ? null : born)
      const model = s.model ?? facts.model ?? null
      // the last reply's context, however far back: a big line after it (a
      // prompt snapshot, a tool result) can push it out of the tail
      const contextTokens = Number(facts.contextTokens) || s.contextTokens
      // its own folder, where it was born: what its colour and git go by
      const cwd = facts.cwd || s.cwd
      const looks = { cwd, repo: repoOf(cwd || f.id), bornBranch: facts.gitBranch || null }
      // your last prompt, however far back: the tail may hold none
      const lastPromptMs = Date.parse(facts.lastPrompt ?? '') || null
      cache.set(f.path, {
        stamp: f.stamp, size: f.size, facts, calls, mail, compacts,
        session: {
          ...s, ...looks, title: facts.customTitle ?? s.title, model, contextTokens, path: f.path, lastPromptMs,
          compactions: dropped.length, droppedTokens: dropped.reduce((a, n) => a + n, 0),
        },
      })
    } catch (err) {
      logOnce($, `tamaclaudchi: skipped ${f.path}: ${String(err)}`)
    }
  }
}

/** How many read shells run at once: a first read is bound by awk, one core each. */
const PARALLEL = 4
/** How long a poll spends on transcripts not read yet before it draws what it has. */
const FRESH_BUDGET_MS = 2000
// transcripts are left to read: the next poll comes at once
let hasMore = false
// when this poll stops starting first reads (transcripts, then subagents')
let deadline = 0
const isPastDeadline = () => Date.now() > deadline

const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size))

/** Runs `f` on the items in order, PARALLEL at a time, starting no new one once `isDone`; how many it started. */
async function inParallel<T>(items: T[], f: (item: T) => Promise<void>, isDone = () => false): Promise<number> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, async () => {
    while (next < items.length && !isDone()) await f(items[next++]!)
  }))
  return next
}

let isReading = false
// asked for while a read ran (after a kill, a hatch, a clean): read again once it ends
let askedAgain: { everyMs?: number } | null = null
// the shelf as last drawn, and when
let drawn = { text: '', at: 0, shelf: null as TamaSession[] | null }
// this session held the lease at its last poll
let isLeading = false

/**
 * Brings the shelf up to date and redraws it if it changed: read here, or
 * taken from the session reading for the machine (the shared section). `everyMs` is
 * how often this session polls. After a kill or a clean, the reading session
 * sees the change at its next poll: a follower reading for itself would start
 * from an empty cache, every transcript whole.
 */
export async function refresh($: EngineInterface, opts: { everyMs?: number } = {}) {
  if (isReading) {
    askedAgain = opts
    return
  }
  isReading = true
  // a loop, not a call to itself: the directory's scan follows no cycles
  const loop = async () => {
    for (let next: { everyMs?: number } | null = opts; next; ) {
      hasMore = false
      await readOnce($, next)
      // a first read cut short by its budget goes on, the shelf drawn between
      next = askedAgain ?? (hasMore ? next : null)
      askedAgain = null
    }
  }
  try {
    // the first read after a start or a reload takes seconds: the egg rocks meanwhile
    if (isWarm) await loop()
    else await busy($, WAKING, loop).then(() => { isWarm = true })
  } finally {
    isReading = false
  }
}
/** This copy of the module has read the shelf once (a reload starts over). */
let isWarm = false
const WAKING = 'waking your pets'

// An error said once in the conversation; again only in the debug log, so a
// poll failing every few seconds does not fill the transcript with rows.
const said = new Set<string>()
function logOnce($: EngineInterface, text: string) {
  const key = text.slice(0, 200)
  $.ui.log(text, said.has(key) ? { to: 'debug' } : undefined)
  said.add(key)
}

// what this session last shared, as its shelf's text and disk: unchanged, not written again
let shared = { text: '', used: '' }

/** One pass of refresh. */
async function readOnce($: EngineInterface, opts: { everyMs?: number }) {
  try {
    const now = await $.clock.now()
    const dir = await claudeDir($)
    windows = await readWindows($, dir)
    const mine = await read($, me)
    const everyMs = opts.everyMs ?? settings.pollMs
    const paths = sharedPaths(dir, (await machineOf($)).key)
    const other = await followed($, paths, mine, now, everyMs)
    // Taking over: claim the lease before a first read that may take seconds,
    // so the other sessions keep following the shelf as last shared rather
    // than each starting the same read.
    if (!other && mine && !isLeading) {
      takeOver()
      await claim($, paths, { by: mine, at: now, everyMs })
    }
    isLeading = !other && !!mine
    const { shelf, used } = other ? { shelf: other.sessions, used: other.disk } : await readShelf($, dir, now)
    windowsByCwd = await readProjectWindows($, shelf, now)
    // a follower handed the very shelf it had: nothing to compare
    const text = shelf === drawn.shelf ? drawn.text : JSON.stringify(shelf)
    // until this session knows its id, it reads for itself, holds no lease and
    // raises no notification; the lease is stamped when renewed, as a cold
    // read can take longer than the lease lasts. What the sessions said stays
    // out of the shared file: each session reads that for the pet it opens.
    const isReader = !other && !!mine
    if (isReader) {
      await claim($, paths, { by: mine, at: await $.clock.now(), everyMs })
      // the shelf as shared: built again when it changed, its disk did, or a takeover wants it whole
      const usedText = JSON.stringify(used)
      if (!written || text !== shared.text || usedText !== shared.used) {
        await share($, paths, JSON.stringify(shelf.map(s => ({ ...s, recent: [] }))), used)
        shared = { text, used: usedText }
      }
    }
    if (text !== drawn.text || now - drawn.at > REDRAW_MS) {
      drawn = { text, at: now, shelf }
      await update($, sessions, () => shelf)
    }
    drawn.shelf = shelf
    if (used && JSON.stringify(used) !== JSON.stringify(await read($, disk))) await update($, disk, () => used)
    await announce($, shelf, mine, isReader)
    playMail($, shelf, now)

    // the opened pet said something new: read its conversation again
    const pick = await read($, selected)
    const opened = pick ? shelf.find(s => s.id === pick) : undefined
    if (opened && (await read($, showConvo)) && (await read($, convo))?.mtimeMs !== opened.mtimeMs) await readConvo($, opened)
    if (opened) await readAgents($, opened, other ? undefined : subListed.get(opened.id))
    // a message sent or received since: read the texts the page shows again
    if (opened) await readMailText($, [opened])
    else if (await read($, showMailroom)) await readMailText($, shelf)
  } catch (err) {
    logOnce($, `tamaclaudchi: could not read the shelf: ${String(err)}`)
  }
}

/** Reads the shelf off disk: what changed in the transcripts since the last read, the registry, disk and spend. */
async function readShelf($: EngineInterface, dir: string, now: number): Promise<{ shelf: TamaSession[]; used: Disk | null }> {
  const live = await readLive($)
  if (now - prunedAt > PRUNE_MS) {
    prunedAt = now
    await pruneMarkers($, dir, live)
  }
  const root = `${dir}/projects`
  const files = await listTranscripts($, root, now, live)
  const stale = files.filter(f => cache.get(f.path)?.stamp !== f.stamp)
  const fresh = stale.filter(f => !cache.has(f.path)), grown = stale.filter(f => cache.has(f.path))
  await inParallel(chunks(grown, BATCH), b => readBatch($, b, now))
  // Those not read yet, for so long a poll: the rest at the next one, which
  // comes at once. So a first read of hundreds draws the shelf in seconds and
  // fills it in, not after a minute. The small ones first, live then closed,
  // then the big ones (one holds its whole batch up for seconds), each the
  // smallest first.
  deadline = Date.now() + FRESH_BUDGET_MS
  const isBig = (f: Transcript) => f.size > BIG_BYTES
  const order = [...fresh].sort((a, b) => Number(isBig(a)) - Number(isBig(b)) || Number(live.has(b.id)) - Number(live.has(a.id)) || a.size - b.size)
  const done = await inParallel(chunks(order, FRESH_BATCH), b => readBatch($, b, now), isPastDeadline)
  hasMore = done < Math.ceil(order.length / FRESH_BATCH)
  const kept = new Set(files.map(f => f.path))
  for (const path of cache.keys()) if (!kept.has(path)) cache.delete(path)

  const shelf: TamaSession[] = []
  let closed = 0
  for (const f of files) {
    const cached = cache.get(f.path)
    if (!cached) continue
    const s = rederive(cached.session, now)
    const l = live.get(s.id) ?? null
    if (!s.model && !l && now - s.mtimeMs >= EGG_SHOWN_MS) continue
    if (!l && ++closed > MAX_CLOSED) continue
    shelf.push(withLive(s, l))
  }
  // a session not yet spoken to has no transcript: an egg from its registry, so a
  // freshly hatched pet can be opened and messaged at once
  const onShelf = new Set(shelf.map(s => s.id))
  for (const [id, l] of live) {
    if (onShelf.has(id) || !SESSION_ID.test(id) || !l.cwd) continue
    const born = l.startedMs ?? now
    shelf.push(withLive({ ...parseSession(id, '', null, born, now, born), cwd: l.cwd, repo: repoOf(l.cwd) }, l))
  }
  // who messaged whom: each pet's messages, both ends named where known
  const mail = mailEdges(shelf.map(s => ({ id: s.id, facts: cache.get(s.path)?.mail.values() })), live, now - settings.windowMs)
  for (const s of shelf) s.mail = mail.get(s.id) ?? null
  const subLists = await listSubagents($, shelf)
  const working = await readSubagents($, shelf.filter(s => s.live), subLists, now)
  subListed = subLists
  const owner = await readSubagentCalls($, subLists)
  if (now - diskAt > DISK_MS) await readDisk($, root, shelf, now)
  const slots = await stickyLooks($, shelf, now)
  for (const s of shelf) {
    s.subagents = working.get(s.id)?.working ?? 0
    s.subagentsEver = working.get(s.id)?.ever ?? 0
    s.disk = diskById.get(s.id) ?? null
    s.skinSlot = slots.repo[repoKey(s)]?.[0] ?? null
    s.itemSlot = slots.item[itemKey(s)]?.[0] ?? null
  }
  // Each API call counts to one pet, by its message id: a forked subagent
  // carries its pet's calls, and a resumed or forked session its parent's.
  // The oldest pet holding a call keeps it. Counted again only when a call,
  // the shelf or the day has changed.
  const byAge = [...shelf].sort((a, b) => (a.bornMs ?? a.mtimeMs) - (b.bornMs ?? b.mtimeMs))
  const key = `${callsRead}|${lastDays(now, 1)[0]}|${windowDays()}|${byAge.map(s => s.path).join('|')}`
  if (key !== spent.key) {
    spent = { key, byId: new Map() }
    const subCalls = subagentCalls(owner)
    const counted = new Set<string>()
    for (const s of byAge) {
      const own = cache.get(s.path)?.calls
      if (!own) continue
      const calls = new Map<string, Call>()
      for (const source of [own, subCalls.get(s.id) ?? new Map<string, Call>()]) {
        for (const [id, c] of source) if (!counted.has(id)) calls.set(id, c)
      }
      for (const id of calls.keys()) counted.add(id)
      spent.byId.set(s.id, spendOf(calls.values(), now, windowDays()))
    }
  }
  for (const s of shelf) s.spend = spent.byId.get(s.id) ?? null
  return { shelf: shelf.sort(shelfOrder), used: diskWhole }
}

/**
 * Each pet's subagents' transcripts, by pet: listed at every poll while the
 * pet runs, once for a closed one. What both the counts and the spend go by.
 */
async function listSubagents($: EngineInterface, shelf: TamaSession[]): Promise<Map<string, Transcript[]>> {
  const out = new Map<string, Transcript[]>()
  for (const s of shelf) {
    if (!s.path) continue
    const dir = `${dirOf(s)}/subagents`
    let list = s.live ? undefined : closedSubs.get(dir)
    if (!list) {
      list = (await $.fs.list(dir).catch(() => []))
        .filter(f => f.kind === 'file' && /^agent-[\w-]+\.jsonl$/.test(f.name))
        .map(f => ({ path: `${dir}/${f.name}`, id: s.id, mtimeMs: f.mtimeMs, size: f.size, stamp: `${f.mtimeMs}:${f.size}` }))
      if (s.live) closedSubs.delete(dir)
      else closedSubs.set(dir, list)
    }
    out.set(s.id, list)
  }
  const dirs = new Set(shelf.filter(s => s.path).map(s => `${dirOf(s)}/subagents`))
  for (const dir of closedSubs.keys()) if (!dirs.has(dir)) closedSubs.delete(dir)
  return out
}

/** Reads on each pet's subagents' transcripts for their API calls, from where each was; gives each file's pet. */
async function readSubagentCalls($: EngineInterface, lists: Map<string, Transcript[]>): Promise<Map<string, string>> {
  const owner = new Map<string, string>()
  const files: Transcript[] = []
  for (const [id, list] of lists) for (const f of list) { files.push(f); owner.set(f.path, id) }
  for (const path of subCache.keys()) if (!owner.has(path)) { subCache.delete(path); callsRead++ }
  const stale = files.filter(f => subCache.get(f.path)?.stamp !== f.stamp)
  // a pet with a thousand subagents is read over a few polls, as transcripts are (readShelf)
  const batches = chunks(stale, SUB_BATCH)
  const done = await inParallel(batches, async batch => {
    const res = await $.process.run(['sh', '-c', USAGE_SCRIPT, 'sh', ...batch.flatMap(f => [f.path, String(readFrom(subCache.get(f.path), f))])], { timeoutMs: 120_000 }).catch(() => null)
    if (!res) return
    const byPath = new Map(batch.map(f => [f.path, f]))
    for (const [path, body] of records(res.stdout)) {
      const f = byPath.get(path)
      if (!f) continue
      const c = subCache.get(f.path)
      const calls = c && f.size >= c.size ? c.calls : new Map<string, Call>()
      const had = calls === c?.calls ? calls.size : -1
      readCalls(body, calls)
      if (calls.size !== had) callsRead++
      subCache.set(f.path, { stamp: f.stamp, size: f.size, calls })
    }
  }, isPastDeadline)
  if (done < batches.length) hasMore = true
  return owner
}

/** The subagents' calls by pet, from what readSubagentCalls has read (`owner`: each file's pet). */
function subagentCalls(owner: Map<string, string>): Map<string, Map<string, Call>> {
  const out = new Map<string, Map<string, Call>>()
  for (const [path, c] of subCache) {
    const id = owner.get(path)!
    const calls = out.get(id) ?? new Map<string, Call>()
    for (const [msg, call] of c.calls) calls.set(msg, call)
    out.set(id, calls)
  }
  return out
}

const SLOTS_KEY = 'looks-v1'

/** Gives a pet's repo the colour you chose, for every pet of it; the repo that had that colour takes its old one. */
async function chooseColour($: EngineInterface, s: TamaSession, slot: number) {
  const kept = ((await $.store.get(SLOTS_KEY).catch(() => undefined)) ?? {}) as Partial<Slots>
  const repo = chooseSlot(kept.repo ?? {}, repoKey(s), slot, await $.clock.now())
  await $.store.set(SLOTS_KEY, { repo, item: kept.item ?? {} }).catch(() => undefined)
  await update($, pickingColour, () => null)
  void refresh($)
}

/**
 * Each repo's colour and each branch's item, kept once given: in the store, so
 * every session on this machine draws a pet alike, and a newcomer takes a free
 * slot rather than moving anyone else's.
 */
async function stickyLooks($: EngineInterface, shelf: TamaSession[], now: number): Promise<Slots> {
  const kept = ((await $.store.get(SLOTS_KEY).catch(() => undefined)) ?? {}) as Partial<Slots>
  const slots: Slots = {
    repo: stickySlots(shelf.map(repoKey), SKIN_COUNT, kept.repo ?? {}, now),
    item: stickySlots(shelf.map(itemKey), ITEM_COUNT, kept.item ?? {}, now),
  }
  if (JSON.stringify(slots) !== JSON.stringify({ repo: kept.repo ?? {}, item: kept.item ?? {} })) await $.store.set(SLOTS_KEY, slots).catch(() => undefined)
  return slots
}

let diskAt = 0
/** Has the next poll measure disk again (after a clean). */
export const measureDiskSoon = () => { diskAt = 0 }
const diskById = new Map<string, { tempKb: number; logKb: number }>()
let diskWhole: Disk | null = null

/** Measures what Claude keeps on disk, as a whole and pet by pet. */
async function readDisk($: EngineInterface, root: string, shelf: TamaSession[], now: number) {
  diskAt = now
  const pets = shelf.filter(s => s.path).map(s => ({ id: s.id, key: s.path.slice(root.length + 1, -'.jsonl'.length) }))
  const res = await $.process.run(['sh', '-c', DISK_SCRIPT, 'sh', root, ...pets.map(p => p.key)], { timeoutMs: 30_000 }).catch(() => null)
  if (!res) return
  const [head = '', each = ''] = res.stdout.split('\x1f\n')
  const [tempDir = '', ...wholes] = head.split('\n')
  if (!/^\/[^\x00-\x1f]*$/.test(tempDir)) return
  const kb = new Map<string, number>()
  for (const l of [...wholes, ...each.split('\n')]) {
    const tab = l.indexOf('\t')
    if (tab > 0) kb.set(l.slice(tab + 1), Number(l.slice(0, tab)) || 0)
  }
  diskById.clear()
  for (const p of pets) {
    diskById.set(p.id, {
      tempKb: kb.get(`${tempDir}/${p.key}`) ?? 0,
      logKb: (kb.get(`${root}/${p.key}.jsonl`) ?? 0) + (kb.get(`${root}/${p.key}`) ?? 0),
    })
  }
  diskWhole = { tempDir, tempKb: kb.get(tempDir) ?? 0, logKb: kb.get(root) ?? 0 }
}

// Whether each subagent had finished, by path, as of its stamp: a file looked
// at again only when it has changed.
const doneCache = new Map<string, { stamp: string; isDone: boolean }>()

/**
 * How many subagents each live pet has still at work (written to in the last
 * ten minutes, so one cut off mid-task is not counted forever, and not
 * finished), and has launched in all, by session id.
 */
async function readSubagents($: EngineInterface, pets: TamaSession[], lists: Map<string, Transcript[]>, now: number): Promise<Map<string, { working: number; ever: number }>> {
  const recent = new Map(pets.map(s => [s.id, (lists.get(s.id) ?? []).filter(f => now - f.mtimeMs < AGENT_RUNNING_MS)]))
  const changed = [...recent.values()].flat().filter(f => doneCache.get(f.path)?.stamp !== f.stamp)
  await inParallel(chunks(changed, SUB_BATCH), async batch => {
    const res = await $.process.run(['sh', '-c', DONE_SCRIPT, 'sh', ...batch.map(f => f.path)]).catch(() => null)
    const byPath = new Map(batch.map(f => [f.path, f]))
    for (const [path, count] of records(res?.stdout)) {
      const f = byPath.get(path)
      if (f) doneCache.set(path, { stamp: f.stamp, isDone: count.trim() !== '0' })
    }
  })
  const out = new Map<string, { working: number; ever: number }>()
  for (const s of pets) {
    const working = recent.get(s.id)!.filter(f => doneCache.get(f.path)?.isDone === false).length
    out.set(s.id, { working, ever: lists.get(s.id)?.length ?? 0 })
  }
  // only the recent ones are looked at again: the rest are let go
  const looked = new Set([...recent.values()].flat().map(f => f.path))
  for (const path of doneCache.keys()) if (!looked.has(path)) doneCache.delete(path)
  return out
}

/** Shows the opened pet's next page of older subagents. */
async function showMoreAgents($: EngineInterface, s: TamaSession) {
  await update($, agentsMore, n => n + AGENTS_MORE)
  await readAgents($, s)
}

/** The opened pet's conversation, every message whole, from the end of its transcript. */
export async function readConvo($: EngineInterface, s: TamaSession) {
  if (!s.path) return
  const out = await $.process.run(['tail', '-c', String(CONVO_BYTES), s.path]).catch(() => null)
  if (!out || out.exitCode !== 0) return
  const now = await $.clock.now()
  const said = parseSession(s.id, out.stdout, null, s.mtimeMs, now, null, { recent: Infinity, chars: Infinity }).recent
  // another pet may have been opened while this one was read
  if ((await read($, selected)) === s.id) await update($, convo, () => ({ id: s.id, mtimeMs: s.mtimeMs, said }))
}

const dirOf = (s: TamaSession) => s.path.slice(0, -'.jsonl'.length)

/** A script's output, a record per file, each `\x1e<path>\n<body>`: [path, body] pairs. */
const records = (stdout: string | undefined) => (stdout ?? '').split('\x1e').slice(1).map(chunk => {
  const nl = chunk.indexOf('\n')
  return nl < 0 ? [chunk, ''] as const : [chunk.slice(0, nl), chunk.slice(nl + 1)] as const
})

/** The opened pet's git: every checkout it has worked in, the newest commit first. */
export async function readGit($: EngineInterface, s: TamaSession) {
  const res = await $.process.run(['sh', '-c', GIT_SCRIPT, 'sh', s.cwd, s.path, `${dirOf(s)}/subagents`], { timeoutMs: 20_000 })
    .catch(() => null)
  const lines = (t: string) => t.split('\n').map(l => l.trimEnd()).filter(Boolean)
  const trees: GitTree[] = (res?.stdout.split('\x1e').slice(1) ?? []).map(chunk => {
    const [head = '', log = ''] = chunk.split('\x1f\n')
    const [path = '', ct = '0', ...status] = lines(head)
    const isHome = path === s.cwd || s.cwd.startsWith(path + '/')
    return { path, isHome, lastCommitMs: Number(ct) * 1000 || 0, status, log: lines(log) }
  })
  trees.sort((a, b) => b.lastCommitMs - a.lastCommitMs)
  const info: GitInfo = trees.length
    ? { id: s.id, trees: trees.slice(0, GIT_TREES), error: null }
    : { id: s.id, trees: [], error: 'not a git folder, or it is gone' }
  if ((await read($, selected)) === s.id) await update($, git, () => info)
}

// Each pet's subagents as this session's last read of the shelf listed them (none while following another's).
let subListed = new Map<string, Transcript[]>()
// The opened pet's subagents' files as last read: unchanged, they are not read again.
let agentsSeen = { id: '', stamp: '' }
// and each subagent as last read, by path, as of its stamp
const agentCache = new Map<string, { stamp: string; agent: Agent }>()

/**
 * The opened pet's subagents, however long ago they ran: every running one
 * first, then the newest, as many as the setting shows. Only those are read:
 * a pet may have launched hundreds.
 */
export async function readAgents($: EngineInterface, s: TamaSession, polled?: Transcript[]) {
  if (!s.path) return
  const dir = `${dirOf(s)}/subagents`
  // this poll's listing, where the shelf was read here; else the folder's own
  const listed = polled ?? (await $.fs.list(dir).catch(() => []))
    .filter(f => f.kind === 'file' && /^agent-[\w-]+\.jsonl$/.test(f.name))
    .map(f => ({ path: `${dir}/${f.name}`, id: s.id, mtimeMs: f.mtimeMs, size: f.size, stamp: `${f.mtimeMs}:${f.size}` }))
  // as many as the setting shows, and the more you asked for; read again once a file is added or written
  const cap = settings.agentsShown + (await read($, agentsMore))
  const stamp = `${cap}|${listed.length}|${listed.reduce((n, f) => Math.max(n, f.mtimeMs), 0)}|${listed.reduce((n, f) => n + f.size, 0)}`
  if (agentsSeen.id === s.id && agentsSeen.stamp === stamp && (await read($, agents))?.id === s.id) return
  agentsSeen = { id: s.id, stamp }
  const now = await $.clock.now()
  const files = [...listed].sort((a, b) => b.mtimeMs - a.mtimeMs)
  // the newest, and any that wrote lately enough to be at work still: one waiting on a long
  // tool may have written before several that have since finished, and the running ones
  // are shown first (only reading tells which run); the cap below holds either way
  const picked = files.filter((f, i) => i < cap || now - f.mtimeMs < AGENT_RUNNING_MS)
  // each read again only once it has changed: one at work need not read all its siblings again
  const stampOf = (f: { mtimeMs: number; size: number }) => `${f.mtimeMs}:${f.size}`
  const changed = picked.filter(f => agentCache.get(f.path)?.stamp !== stampOf(f))
  await inParallel(chunks(changed, SUB_BATCH), async batch => {
    const res = await $.process.run(['sh', '-c', AGENTS_SCRIPT, 'sh', ...batch.map(f => f.path)]).catch(() => null)
    const byPath = new Map(batch.map(f => [f.path, f]))
    for (const chunk of res?.stdout.split('\x1e').slice(1) ?? []) {
      const [path = '', mtime = '0', done = '0', modelLine = '', metaLine = ''] = chunk.split('\n')
      let meta: { description?: string; agentType?: string } = {}
      try { meta = JSON.parse(metaLine) } catch {}
      const id = /agent-([\w-]+)\.jsonl$/.exec(path)?.[1]
      const f = byPath.get(path)
      if (!id || !f) continue
      agentCache.set(path, {
        stamp: stampOf(f),
        agent: {
          id, path, description: meta.description ?? 'a subagent', type: meta.agentType ?? 'agent',
          model: /"model":"([^"]+)"/.exec(modelLine)?.[1] ?? null, isDone: done.trim() !== '0', mtimeMs: Number(mtime) * 1000,
        },
      })
    }
  })
  const list = picked.flatMap(f => agentCache.get(f.path)?.agent ?? [])
  // only this pet's picked ones are kept
  const kept = new Set(picked.map(f => f.path))
  for (const path of agentCache.keys()) if (!kept.has(path)) agentCache.delete(path)
  const running = (a: Agent) => isAgentRunning(a, now)
  list.sort((a, b) => Number(running(b)) - Number(running(a)) || b.mtimeMs - a.mtimeMs)
  // every running one, then the newest finished ones, while there is room
  const shown = list.slice(0, Math.max(cap, list.filter(running).length))
  if ((await read($, selected)) !== s.id) return
  await update($, agents, () => ({ id: s.id, list: shown, total: files.length }))
  // the opened agent wrote more: read its trace again
  const pick = await read($, agentPick)
  const opened = pick ? shown.find(a => a.id === pick) : undefined
  if (opened && (await read($, trace))?.mtimeMs !== opened.mtimeMs) await readTrace($, opened)
}

// The lines about messages in each transcript given, however far back: a fixed-string
// grep finds the few among them in a whole transcript of many MB at once, the awk
// pass (mail.ts) keeps those that are a message's.
const MAIL_SCRIPT = `for f in "$@"; do grep -F -e '"kind":"peer"' -e '"name":"SendMessage"' -e '"msg_id"' "$f" | awk '${MAIL_AWK}'; done`
/** How many transcripts the messages page reads the texts from. */
const MAIL_FILES = 30
/** How much of a message a page shows. */
const MAIL_CHARS = 20_000

/**
 * The text of these pets' messages, read from their own transcripts when a
 * page shows them (the shelf, shared between sessions, never holds it); read
 * again only when their messages change.
 */
export async function readMailText($: EngineInterface, pets: TamaSession[]) {
  const { withMail, key } = mailRead(pets)
  if (!key || (await read($, mailText))?.key === key) return
  // the transcripts that messaged last, when there are too many to read
  const latest = (s: TamaSession) => s.mail!.at(-1)!.at
  const paths = [...withMail].sort((a, b) => latest(b) - latest(a)).slice(0, MAIL_FILES).map(s => s.path)
  const res = await $.process.run(['sh', '-c', MAIL_SCRIPT, 'sh', ...paths], { timeoutMs: 20_000 }).catch(() => null)
  if (!res) return
  const facts = new Map<string, MailFact>()
  readMail(res.stdout, facts, MAIL_CHARS)
  const byId: Record<string, string> = {}
  for (const l of lettersOf(facts.values())) if (l.text) byId[l.id] = l.text
  await update($, mailText, () => ({ key, byId }))
}

/** A subagent's whole trace, from the end of its transcript. */
export async function readTrace($: EngineInterface, a: Agent) {
  const out = await $.process.run(['tail', '-c', String(CONVO_BYTES), a.path]).catch(() => null)
  if (!out || out.exitCode !== 0 || (await read($, agentPick)) !== a.id) return
  await update($, trace, () => ({ id: a.id, mtimeMs: a.mtimeMs, steps: traceOf(out.stdout) }))
}

// ─── actions ─────────────────────────────────────────────────────────────────

// What the buttons do: open a pet, play its hover loop, and drive tmux to
// jump to, resurrect, hatch or kill a session.

/** How many of a pet's newest messages its page draws at first, and adds on each ask. */
export const CONVO_PAGE = 30

export const WING = 'ʚɞ' // resurrect: a pair of little wings
const FRAME_MS = 180
const TMUX_TARGET = '#{session_name}:#{window_id}.#{pane_id}'

// Each Raster's latest hover call: an older one still awaiting stops there,
// so a leave read before its enter finishes never leaves a loop running.
const hovers = new Map<string, number>()

/** The session part of a tmux target, `session:@window.%pane`. */
export const tmuxSession = (target: string) => target.split(':')[0]!
/** The pane part, `%12`: which a renamed session keeps (a restarted tmux server counts again from %0). */
const tmuxPane = (target: string) => target.split('.').pop()!
/**
 * Runs a command; one that cannot start at all (no tmux installed) reads as
 * a failed run, so every caller's fallback still happens.
 */
async function run($: EngineInterface, argv: string[], opts: ProcessRunInit = {}) {
  return $.process.run(argv, opts).catch((err: unknown) => (
    { exitCode: 127, stdout: '', stderr: String(err), isStdoutTruncated: false, isStderrTruncated: false }
  ))
}

/** Whether `pane` runs `pid`: its own process, or one of that process's parents (its shell). */
async function paneRuns($: EngineInterface, pane: string, pid: number): Promise<boolean> {
  const shown = await run($, ['tmux', 'display-message', '-p', '-t', pane, '#{pane_pid}'])
  const panePid = Number(shown.stdout.trim())
  if (shown.exitCode !== 0 || !panePid) return false
  // up from the pet's process through its parents, a few at most
  for (let p = pid, n = 0; p > 1 && n < 8; n++) {
    if (p === panePid) return true
    p = await parentOf($, p)
  }
  return false
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** Plays a pet's hover frames into its Raster (`key`, its card's by default) until the pointer leaves. */
export async function hover($: EngineInterface, id: string, isOn: boolean, key = `pet-${id}`) {
  playing.get(key)?.cancel()
  playing.delete(key)
  const turn = (hovers.get(key) ?? 0) + 1
  hovers.set(key, turn)
  const list = await read($, sessions)
  const s = list.find(x => x.id === id)
  if (!s || hovers.get(key) !== turn) return
  const o = outfits(list).get(id)!
  const now = Date.now()
  const look = lookOf(s, now)
  if (!isOn) {
    await $.ui.blit({ requestId: PANE, key, cells: petRest(o, look).cells })
    return
  }
  const frames = petFrames(o, look)
  let n = 0
  const tick = () => {
    n = (n + 1) % frames.length
    void $.ui.blit({ requestId: PANE, key, cells: frames[n]! }).then(r => {
      if (r.deny) { playing.get(key)?.cancel(); playing.delete(key) } // gone from the pane
    })
  }
  tick()
  playing.set(key, $.clock.every(look.halo ? GHOST_FRAME_MS : FRAME_MS, tick))
}

/** Opens a pet's page (null: back to the shelf), reading its git, conversation and subagents. */
export async function select($: EngineInterface, id: string | null) {
  await update($, armed, () => null)
  await update($, renaming, () => null)
  await update($, pickingColour, () => null)
  await update($, agentsMore, () => 0)
  await update($, agentPick, () => null)
  await update($, showGit, () => false)
  await update($, showConvo, () => false)
  await update($, showMail, () => false)
  await update($, mailTab, () => null)
  await update($, convoShown, () => CONVO_PAGE)
  await update($, selected, () => id)
  const list = await read($, sessions)
  if (!id) {
    // back to the messages page, if it was open: its texts, not this pet's
    if (await read($, showMailroom)) await readMailText($, list)
    return
  }
  await markSeen($, [id])
  const s = list.find(x => x.id === id)
  if (s) await Promise.all([readGit($, s), readConvo($, s), readAgents($, s), readMailText($, [s])])
}

/** You have looked at these pets: their letters so far are read, and their cards drop the 💌. */
async function markSeen($: EngineInterface, ids: (string | null)[]) {
  const now = Date.now()
  await update($, mailSeen, seen => ({ ...seen, ...Object.fromEntries(ids.filter(id => id !== null).map(id => [id, now])) }))
}

/** Opens a conversation's tab (null: the latest), its two sessions caught up on. */
export async function openTab($: EngineInterface, key: string | null) {
  await update($, mailTab, () => key)
  const posts = postsOf(await read($, sessions))
  const threads = threadsOf(posts)
  const t = openThread(threads, key)
  if (t) await markSeen($, t.ends.map(e => e.id))
}

/** Opens the page of every message between the sessions (false: back to the shelf), reading their texts. */
export async function openMailroom($: EngineInterface, isOn: boolean) {
  await update($, showMailroom, () => isOn)
  if (!isOn) return
  await openTab($, null)
  await readMailText($, await read($, sessions))
}

/** Opens one of the opened pet's subagents on a page of its own (null: back to the pet). */
export async function openAgent($: EngineInterface, id: string | null) {
  await update($, agentPick, () => id)
  const a = id ? (await read($, agents))?.list.find(x => x.id === id) : undefined
  if (a && (await read($, trace))?.id !== a.id) await readTrace($, a)
}

/** Whether a pet can be jumped to: its tmux pane, or its background session. */
export const canJump = (live: Live | null) => !!live && !live.isElsewhere && !!(live.tmux || live.job)

/** Brings the pet's tmux pane forward, or opens its background session. */
export const jump = ($: EngineInterface, s: TamaSession) => busy($, `attaching to ${nameOf(s)}`, () => jumpNow($, s))
async function jumpNow($: EngineInterface, s: TamaSession) {
  if (!s.live) return
  await markSeen($, [s.id])
  if (s.live.tmux) await jumpTo($, s.live.tmux, s.live.name ?? nameOf(s))
  else if (s.live.job) await attachJob($, s.live.job, s.live.name ?? nameOf(s))
}

/**
 * Opens a background session (claude --bg): `claude attach <job>` in a tmux
 * session of its own, reused while it lasts, then goes there. Outside tmux,
 * the attach command is copied.
 */
async function attachJob($: EngineInterface, job: string, name: string) {
  if ((await clientOf($)) === null) {
    await copyText($, `claude attach ${job}`, 'Not inside tmux here, so the attach command')
    return
  }
  const tmuxName = `bg-${job}`
  if ((await run($, ['tmux', 'has-session', '-t', `=${tmuxName}`])).exitCode !== 0) {
    const made = await run($, ['tmux', 'new-session', '-d', '-s', tmuxName, `claude attach ${job}`])
    if (made.exitCode !== 0) {
      $.ui.toast(`tmux could not open ${name}: ${made.stderr.trim() || 'is tmux installed?'}`)
      return
    }
  }
  await jumpTo($, `${tmuxName}:`, name)
}

/**
 * The tmux client this session is seen in: its own ('') when it runs inside
 * tmux, else, for a background session (claude --bg), the one showing an
 * attach to it; null when none does.
 */
async function clientOf($: EngineInterface): Promise<string | null> {
  if (await $.env.get('TMUX')) return ''
  const mine = await read($, me)
  const job = (await read($, sessions)).find(s => s.id === mine)?.live?.job
  if (!job) return null
  const ps = await run($, ['ps', '-A', '-o', 'pid=,ppid=,args='])
  const panes = await run($, ['tmux', 'list-panes', '-a', '-F', '#{pane_pid} #{session_id}'])
  const clients = await run($, ['tmux', 'list-clients', '-F', '#{client_activity} #{session_id} #{client_name}'])
  if (ps.exitCode !== 0 || panes.exitCode !== 0 || clients.exitCode !== 0) return null
  return attachClient(job, ps.stdout, panes.stdout, clients.stdout)
}

/**
 * The tmux client showing a pane where `claude attach <job>` runs, the most
 * recently used if several do, from `ps -o pid=,ppid=,args=`, panes as
 * `<pane pid> <session id>` and clients as `<activity> <session id> <name>`.
 */
export function attachClient(job: string, ps: string, panes: string, clients: string): string | null {
  const parent = new Map<number, number>()
  const attaches: number[] = []
  for (const l of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l)
    if (!m) continue
    parent.set(Number(m[1]), Number(m[2]))
    const args = m[3]!.trim().split(/\s+/)
    const at = args.indexOf('attach')
    if (at > 0 && /(^|\/)claude$/.test(args[at - 1]!) && args[at + 1] === job) attaches.push(Number(m[1]))
  }
  const sessionOf = new Map(panes.split('\n').filter(Boolean).map(l => {
    const [pid, session] = l.split(' ')
    return [Number(pid), session!] as const
  }))
  // up from each attach through its parents to the pane it runs in
  const shown = new Set<string>()
  for (let p of attaches) {
    for (let n = 0; p > 1 && n < 8; n++, p = parent.get(p) ?? 0) {
      const session = sessionOf.get(p)
      if (session) { shown.add(session); break }
    }
  }
  const seen = clients.split('\n').map(l => l.split(' ')).filter(([, session, name]) => name && shown.has(session!))
    .sort((a, b) => Number(b[0]) - Number(a[0]))
  return seen[0]?.slice(2).join(' ') ?? null
}

/**
 * Switches the tmux client this session is seen in to a pane, found by its id so a renamed session is
 * still found; outside tmux, copies how to attach.
 */
async function jumpTo($: EngineInterface, target: string, name: string) {
  const window = target.split('.')[0]!
  const pane = target.includes('%') ? tmuxPane(target) : window
  // switch only the tmux client this session is seen in: outside tmux, another one would be moved
  const client = await clientOf($)
  if (client === null) {
    await copyText($, `tmux attach -t ${shellQuote(window)} \\; select-pane -t ${shellQuote(pane)}`, 'Not inside tmux here, so the attach command')
    return
  }
  const switched = await run($, ['tmux', 'switch-client', ...(client ? ['-c', client] : []), '-t', pane])
  if (switched.exitCode !== 0) {
    // its pane is gone, or on another tmux server than this one
    $.ui.toast(`Could not jump to ${name}: ${switched.stderr.trim().split('\n')[0] || 'tmux could not switch to its pane'}.`)
    return
  }
  await run($, ['tmux', 'select-window', '-t', pane])
  await run($, ['tmux', 'select-pane', '-t', pane])
  $.ui.toast(`Attached to ${name}`)
}

/**
 * Copies `text` and says so, as `<what> is on your clipboard`; where nothing
 * could be copied, the toast shows the text to copy by hand.
 */
async function copyText($: EngineInterface, text: string, what: string) {
  const copied = await $.ui.copy({ text })
  if (copied.isCopied) $.ui.toast(`${what} is on your clipboard.`)
  else $.ui.toast(`${what} could not be copied (${copied.reason}): ${text}`)
}

/** The job a `claude --bg` names in what it prints (`backgrounded · 1a2b3c4d · its name`); null for none. */
export const jobOf = (printed: string) => /backgrounded · ([\w-]+)/.exec(printed)?.[1] ?? null

/** The first line of what a command said, for a toast. */
const firstLine = (text: string) => text.trim().split('\n').filter(l => !/^Starting background service/.test(l))[0]?.trim() ?? ''

/**
 * Starts `claude --bg` with `args` in `dir`: the job it printed, or why it
 * would not start (a folder not trusted yet, no `claude` on the PATH…). It
 * returns as soon as the session is up, but is given time for a cold start.
 */
async function startBackground($: EngineInterface, dir: string, args: string[]): Promise<{ job: string } | { why: string }> {
  const made = await run($, ['claude', '--bg', ...args], { cwd: dir, timeoutMs: 60_000 })
  const job = made.exitCode === 0 ? jobOf(`${made.stdout}\n${made.stderr}`) : null
  return job ? { job } : { why: firstLine(made.stderr) || firstLine(made.stdout) || `claude --bg ended with code ${made.exitCode}` }
}

/**
 * Brings a closed session back, in its folder: `claude --bg --resume` (the
 * default), opened at once; or `claude --resume` in a tmux session of its own,
 * which is also where a background resume that fails falls back to. Without
 * either, the resume command is copied.
 */
export const resurrect = ($: EngineInterface, s: TamaSession) => busy($, `waking ${nameOf(s)}`, () => resurrectNow($, s))
async function resurrectNow($: EngineInterface, s: TamaSession) {
  // it may be back already, since the shelf was read: go to it instead, as a
  // resume of a running session would start a copy of it
  const now = (await readLive($)).get(s.id)
  if (now) {
    if (now.tmux) await jumpTo($, now.tmux, now.name ?? nameOf(s))
    else if (now.job && !now.isElsewhere) await attachJob($, now.job, now.name ?? nameOf(s))
    else $.ui.toast(`${nameOf(s)} is running already${now.isElsewhere ? ', on another machine' : ''}.`)
    return
  }
  let why = ''
  if (settings.hatchIn === 'background') {
    const bg = await startBackground($, s.cwd, ['--resume', s.id])
    if ('job' in bg) {
      $.ui.toast(`${WING} ${nameOf(s)} is back, in the background (${bg.job}).`)
      await attachJob($, bg.job, nameOf(s))
      void refresh($)
      return
    }
    why = `It could not come back in the background (${bg.why}): `
  }
  // tmux takes neither '.' nor ':' in a session name
  const name = `${s.repo.replace(/[.:\s]/g, '-').slice(0, 24)}-${s.id.slice(0, 4)}`
  const made = await run($, ['tmux', 'new-session', '-d', '-P', '-F', TMUX_TARGET, '-s', name, '-c', s.cwd, `claude --resume ${s.id}`,
  ])
  if (made.exitCode === 0) {
    const target = made.stdout.trim()
    if (target) await jumpTo($, target, name)
    $.ui.toast(`${why}${WING} ${nameOf(s)} is back, in tmux session ${name}.`)
    void refresh($)
  } else if ((await run($, ['tmux', 'has-session', '-t', `=${name}`])).exitCode === 0) {
    await jumpTo($, `${name}:`, name) // brought back already: go to it
  } else {
    if (why) $.ui.toast(`${why}nor in tmux.`)
    await copyResume($, s)
  }
}

/** The models a new pet can be hatched on, as `claude --model` takes them; null is the default. */
export const HATCH_MODELS: (string | null)[] = [null, 'fable', 'opus', 'sonnet', 'haiku']

/**
 * What `claude` is started with for a new pet: its model, a git worktree of
 * its own (named, as `-w` would otherwise take the prompt for its name), and
 * a first prompt, after `--` so one starting with a dash stays a prompt.
 */
export function hatchArgs(h: { model: string | null; worktree: string | null; prompt: string }): string[] {
  return [
    ...(h.model ? ['--model', h.model] : []),
    ...(h.worktree ? ['--worktree', h.worktree] : []),
    ...(h.prompt.trim() ? ['--', h.prompt.trim()] : []),
  ]
}

/**
 * Hatches a pet in `input` with the form's model, worktree and first prompt:
 * `claude --bg` (the default), or `claude` in a tmux session of its own. A
 * background pet given a prompt gets to work where it is; one without is
 * opened, so you can type to it. A folder not trusted yet only an interactive
 * claude can ask about, so it hatches in tmux instead.
 */
/** How many folders the new-pet form offers at once. */
const HINTS_SHOWN = 6

/**
 * Folders for what the new-pet form's folder field holds: the running and
 * recent pets' own folders that hold the text, then those it names the start
 * of (`~/Doc` offers ~/Documents; `~/Documents/` the folders in it).
 */
export async function suggestFolders($: EngineInterface, typed: string, pets: TamaSession[]) {
  const home = (await $.env.get('HOME')) ?? ''
  const short = (d: string) => (home && (d === home || d.startsWith(`${home}/`)) ? `~${d.slice(home.length)}` : d)
  const text = typed.trim()
  const full = text.replace(/^~(?=\/|$)/, home)
  const q = text.toLowerCase()
  // the pets' folders, the one talked to last first
  const known = [...new Set([...pets].sort((a, b) => talkedAt(b) - talkedAt(a)).map(s => s.cwd).filter(Boolean))]
    .map(short).filter(d => !q || d.toLowerCase().includes(q) || d.toLowerCase().includes(full.toLowerCase()))
  let found: string[] = []
  if (full.startsWith('/')) {
    const cut = full.lastIndexOf('/')
    const parent = full.slice(0, cut) || '/', start = full.slice(cut + 1).toLowerCase()
    const res = await $.process.run(['find', '-L', parent, '-mindepth', '1', '-maxdepth', '1', '-type', 'd'], { timeoutMs: 5000 }).catch(() => null)
    found = (res?.stdout ?? '').split('\n').filter(Boolean)
      .filter(d => { const base = d.slice(d.lastIndexOf('/') + 1).toLowerCase(); return base.startsWith(start) && (start.startsWith('.') || !base.startsWith('.')) })
      .sort((a, b) => a.localeCompare(b)).map(short)
  }
  const dirs = [...new Set([...known, ...found])].filter(d => d !== text && `${d}/` !== text).slice(0, HINTS_SHOWN)
  // a later keystroke may have asked again meanwhile: the latest wins
  if ((await read($, hatch)).dir === typed || (typed === '' && (await read($, hatch)).dir === null)) await update($, folderHints, () => ({ for: typed, dirs }))
}

export const spawnPet = ($: EngineInterface, input: string, typed: Partial<Hatch> = {}) => busy($, 'hatching a new pet', () => spawnPetNow($, input, typed))
async function spawnPetNow($: EngineInterface, input: string, typed: Partial<Hatch> = {}) {
  // what was just typed, which the form's state may not hold yet
  const form = { ...(await read($, hatch)), ...typed }
  const home = (await $.env.get('HOME')) ?? ''
  const dir = input.trim().replace(/^~(?=\/|$)/, home) || home
  if ((await $.fs.stat(dir).catch(() => null))?.kind !== 'dir') {
    $.ui.toast(`No folder at ${dir}.`)
    return
  }
  const base = (dir.split('/').filter(Boolean).pop() ?? '').replace(/[^\w-]/g, '-') || 'pet'
  const args = hatchArgs({ ...form, worktree: form.worktree ? `${base.slice(0, 24)}-${Date.now().toString(36).slice(-5)}` : null })
  let why = ''
  if (settings.hatchIn === 'background') {
    const bg = await startBackground($, dir, args)
    if ('job' in bg) {
      await closeHatch($)
      if (form.prompt.trim()) $.ui.toast(`A new pet is hatching in the background (${bg.job}), on your prompt. Its card attaches to it.`)
      else await attachJob($, bg.job, base)
      void refresh($)
      return
    }
    why = `claude --bg could not start it (${bg.why}), so `
  }
  const listed = await run($, ['tmux', 'list-sessions', '-F', '#{session_name}'])
  const taken = new Set(listed.exitCode === 0 ? listed.stdout.split('\n') : [])
  let name = base
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}`
  const made = await run($, ['tmux', 'new-session', '-d', '-P', '-F', TMUX_TARGET, '-s', name, '-c', dir])
  const target = made.stdout.trim()
  if (made.exitCode !== 0 || !target) {
    $.ui.toast(why ? `Could not hatch it: ${why.replace(/, so $/, '')}, nor in tmux.` : `tmux could not start a session: ${made.stderr.trim() || 'is tmux installed?'}`)
    return
  }
  // typed into the shell rather than run as the session's command, so the pane stays when it exits
  await run($, ['tmux', 'send-keys', '-t', tmuxPane(target), ['claude', ...args.map(shellQuote)].join(' '), 'Enter'])
  await closeHatch($)
  await jumpTo($, target, name)
  $.ui.toast(`${why}${why ? 'a' : 'A'} new pet is hatching in tmux session ${name}.`)
  void refresh($)
}

/** Closes the new-pet form, emptied for next time. */
async function closeHatch($: EngineInterface) {
  await update($, isSpawning, () => false)
  await update($, hatch, () => NO_HATCH)
}

/**
 * Ends a pet: its tmux session when the pet's pane is all that session holds,
 * else only its pane (the session's other windows are not the pet's to take),
 * and the process itself as a backstop. Never this session's own pet.
 */
// The pets being killed now: a kill takes seconds (a stop, then a grace
// period), and a press meanwhile must not start a second one on a pet going.
const killing = new Set<string>()

export const killPet = ($: EngineInterface, s: TamaSession) => busy($, `killing ${nameOf(s)}`, () => killPetNow($, s))
async function killPetNow($: EngineInterface, s: TamaSession) {
  await update($, armed, () => null)
  // never this session's own pet, nor one on another machine, whose pid means nothing here
  if (!s.live || s.live.isElsewhere || s.id === (await read($, me)) || killing.has(s.id)) return
  killing.add(s.id)
  try {
    await killNow($, s, s.live)
  } finally {
    killing.delete(s.id)
  }
}

async function killNow($: EngineInterface, s: TamaSession, live: Live) {
  const { pid, procStart, tmux, job } = live
  // a claude started from this session's own shell shares its pane: taking
  // that pane down would take this session with it
  if (tmux && tmuxPane(tmux) === (await $.env.get('TMUX_PANE'))) {
    $.ui.toast(`${nameOf(s)} runs in this session's own tmux pane: close it from there.`)
    return
  }
  const done: string[] = []
  // a background session is stopped as `claude stop` does it: its
  // conversation kept, and the attaches showing it closed with it
  if (job) {
    const stopped = await run($, ['claude', 'stop', job], { timeoutMs: 30_000 })
    if (stopped.exitCode === 0) done.push(`its background session (${job})`)
    // the tmux session opened to attach to it, which an older claude may leave behind
    if ((await run($, ['tmux', 'has-session', '-t', `=bg-${job}`])).exitCode === 0) await run($, ['tmux', 'kill-session', '-t', `=bg-${job}`])
  }
  // its pane, if it still runs this pet: a pane id is only good within one
  // tmux server, and a restarted server gives the old numbers out again
  if (tmux && (await paneRuns($, tmuxPane(tmux), pid))) {
    // the pane's session as it is now, by id: the name the registry keeps may
    // since have been renamed, or given to another session
    const pane = tmuxPane(tmux)
    const where = await run($, ['tmux', 'display-message', '-p', '-t', pane, '#{session_id} #{session_name}'])
    const [sessionId = '', ...rest] = where.exitCode === 0 ? where.stdout.trim().split(' ') : []
    if (sessionId.startsWith('$')) {
      const session = rest.join(' ')
      const panes = await run($, ['tmux', 'list-panes', '-s', '-t', sessionId, '-F', '#{pane_id}'])
      const count = panes.exitCode === 0 ? panes.stdout.split('\n').filter(Boolean).length : 0
      if (count === 1) {
        await run($, ['tmux', 'kill-session', '-t', sessionId])
        done.push(`tmux session ${session}`)
      } else {
        await run($, ['tmux', 'kill-pane', '-t', pane])
        done.push(`its pane (tmux ${session} has ${count} panes, so the others stay)`)
      }
    }
  }
  // Claude Code may outlive its pane for a moment: ask it to stop, then make
  // it, but only while the pid is still that session's (a known start time),
  // never a newer process given its number
  // only where its start time can be read (/proc, or ps on macOS): elsewhere
  // a pid freed and given to another process could not be told apart
  forgetProcesses()
  if ((await canTellApart($, procStart)) && (await isRunning($, pid, procStart))) {
    await run($, ['kill', '-TERM', String(pid)])
    await run($, ['sleep', '2'])
    forgetProcesses()
    if (await isRunning($, pid, procStart)) await run($, ['kill', '-KILL', String(pid)])
    done.push('its process')
  }
  if (!done.length) {
    // nothing left to stop: it ended on its own, or a kill before this one got it
    forgetProcesses()
    if (!(await isRunning($, pid, procStart))) {
      $.ui.toast(`${nameOf(s)} has already ended.`)
      await select($, null)
      void refresh($)
      return
    }
    const why = job ? `claude stop ${job} failed`
      : tmux ? 'its tmux pane is not where the registry says'
      : 'it runs in no tmux pane or background session this mod can close'
    $.ui.toast(`Could not kill ${nameOf(s)}: ${why}, and its process cannot be told apart from a newer one.`)
    return
  }
  $.ui.toast(`✝ ${nameOf(s)} is gone: killed ${done.join(' and ')}.`)
  await select($, null)
  void refresh($)
}

/** A closed pet that wrote this lately is left alone by a clean. */
const RECENT_WRITE_MS = 30 * 60_000
/** A closed pet's temp folder smaller than this (KiB) is not worth a clean. */
export const MIN_CLEAN_KB = 64

/**
 * Frees a closed pet's folder in Claude's temp dir: its scratch files and its
 * background tasks' output. Its transcript stays, so it can still be
 * resurrected. Refused for a running session, one that wrote in the last half
 * hour, and any path that is not exactly `<Claude's temp dir>/<project>/<session id>`.
 */
async function cleanOne($: EngineInterface, s: TamaSession, tempDir: string, running: Set<string>): Promise<'cleaned' | 'running' | 'unsafe' | string> {
  const [project = '', file = ''] = s.path.split('/').slice(-2)
  const isSafe = TEMP_DIR.test(tempDir) && PROJECT_DIR.test(project) && !/^\.+$/.test(project)
    && file === `${s.id}.jsonl` && SESSION_ID.test(s.id)
  if (!isSafe) return 'unsafe'
  // it may have been resurrected since the shelf was read; and one that wrote
  // lately may be running where the registry does not say (an older Claude Code)
  if (s.live || running.has(s.id) || Date.now() - s.mtimeMs < RECENT_WRITE_MS) return 'running'
  const res = await run($, ['rm', '-rf', '--', `${tempDir}/${project}/${s.id}`], { timeoutMs: 120_000 })
  return res.exitCode === 0 ? 'cleaned' : res.stderr.trim().split('\n')[0] || 'rm failed'
}

export const cleanTemp = ($: EngineInterface, s: TamaSession) => busy($, `cleaning ${nameOf(s)}`, () => cleanTempNow($, s))
async function cleanTempNow($: EngineInterface, s: TamaSession) {
  await update($, armed, () => null)
  const d = await read($, disk)
  if (s.live) {
    $.ui.toast('It is running: its temp folder stays.')
    return
  }
  const done = d ? await cleanOne($, s, d.tempDir, new Set((await readLive($)).keys())) : 'unsafe'
  $.ui.toast(done === 'cleaned' ? `Cleaned ${nameOf(s)}: ${bytes(s.disk?.tempKb ?? 0)} freed. Its transcript stays.`
    : done === 'running' ? `${nameOf(s)} may still be running: its temp folder stays.`
    : done === 'unsafe' ? 'Not a temp folder I may delete.'
    : `Could not clean it all: ${done}`)
  measureDiskSoon()
  void refresh($)
}

/** The closed pets whose temp folders a bulk clean would free. */
export const cleanable = (closed: TamaSession[]) => closed.filter(s => !s.live && (s.disk?.tempKb ?? 0) >= MIN_CLEAN_KB)

/** Cleans every closed pet's temp folder at once, with the same care as one. */
export const cleanAll = ($: EngineInterface, closed: TamaSession[]) => busy($, 'cleaning the graveyard', () => cleanAllNow($, closed))
async function cleanAllNow($: EngineInterface, closed: TamaSession[]) {
  await update($, armed, () => null)
  const d = await read($, disk)
  if (!d) return
  const running = new Set((await readLive($)).keys())
  let kb = 0, n = 0, kept = 0, failed = 0
  for (const s of cleanable(closed)) {
    const done = await cleanOne($, s, d.tempDir, running)
    if (done === 'cleaned') { kb += s.disk?.tempKb ?? 0; n++ } else if (done === 'running' || done === 'unsafe') kept++
    else failed++
  }
  $.ui.toast(`Cleaned ${n} temp folder${n === 1 ? '' : 's'}: ${bytes(kb)} freed.`
    + `${kept ? ` ${kept} left alone (written to lately, or running).` : ''}${failed ? ` ${failed} could not be deleted in full.` : ''} Transcripts stay.`)
  measureDiskSoon()
  void refresh($)
}

export async function copyResume($: EngineInterface, s: TamaSession) {
  await copyText($, `cd ${shellQuote(s.cwd)} && claude --resume ${s.id}`, 'The resume command')
}

export async function copyPath($: EngineInterface, path: string) {
  await copyText($, path, 'The path')
}

/** Opens the rename field on a pet, or closes it, and puts the keyboard in it. */
async function startRename($: EngineInterface, id: string) {
  const was = await read($, renaming)
  await update($, renaming, () => (was === id ? null : id))
  // the pane may not hold the keyboard (a click elsewhere): then the field waits for a click
  if (was !== id) await $.ui.focus({ requestId: PANE, key: 'rename-name' }).catch(() => undefined)
}

/**
 * The file a session running the mod leaves, named for it, so another's shelf
 * knows a rename sent there is taken by the mod rather than read by its model.
 */
const markerOf = (dir: string, id: string) => `${dir}/tamaclaudchi/running-${id}`

/** Leaves this session's marker. */
async function markRunning($: EngineInterface, id: string) {
  if (!SESSION_ID.test(id)) return
  const dir = await claudeDir($)
  await run($, ['mkdir', '-p', `${dir}/tamaclaudchi`])
  await $.fs.write(markerOf(dir, id), '').catch(() => undefined)
}

/** Whether a running session runs the mod: its marker was left since its process started. */
async function runsMod($: EngineInterface, s: TamaSession): Promise<boolean> {
  if (!SESSION_ID.test(s.id)) return false
  const st = await $.fs.stat(markerOf(await claudeDir($), s.id)).catch(() => null)
  return !!st && st.kind === 'file' && st.mtimeMs >= (s.live?.startedMs ?? 0)
}

/** Deletes the markers of sessions no longer running; the reading session does it now and then. */
async function pruneMarkers($: EngineInterface, dir: string, live: Map<string, Live>) {
  for (const f of await $.fs.list(`${dir}/tamaclaudchi`).catch(() => [])) {
    const id = f.name.startsWith('running-') ? f.name.slice('running-'.length) : ''
    if (f.kind === 'file' && SESSION_ID.test(id) && !live.has(id)) await run($, ['rm', '-f', `${dir}/tamaclaudchi/${f.name}`])
  }
}
const PRUNE_MS = 10 * 60_000
let prunedAt = 0

/** What leads a message asking a pet to rename itself: its own copy of the mod takes it, its model never reads it. */
export const RENAME_TAG = '[tamaclaudchi rename] '
/** A name as `/rename` takes it: one line, not too long. */
export const cleanName = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 100)

/**
 * Renames a pet as `/rename` would. This session runs it itself; another
 * running one is asked to, its own copy of the mod running it there; a closed
 * one has the title written at the end of its transcript, as `/rename` does.
 */
export async function renamePet($: EngineInterface, s: TamaSession, text: string) {
  await update($, renaming, () => null)
  const name = cleanName(text)
  if (!name || name === nameOf(s)) return
  if (s.id === (await read($, me))) {
    await $.command.run({ command: 'rename', args: name })
  } else if (s.live?.isElsewhere) {
    $.ui.toast(`${nameOf(s)} runs on another machine: rename it there.`)
    return
  } else if (s.live) {
    // a session without the mod (started before it was installed, or with it
    // off) would hand the message to its model, which cannot rename itself
    if (!(await runsMod($, s))) {
      const copied = await $.ui.copy({ text: `/rename ${name}` })
      $.ui.toast(`${nameOf(s)} does not run TamaClaudchi (started before it was installed?): run /rename ${name} in it${copied.isCopied ? ', on your clipboard' : ''}.`)
      return
    }
    const sent = await $.session.send({ to: { sessionId: s.id }, text: RENAME_TAG + name })
    if (!sent.isDelivered) {
      $.ui.toast(`Could not rename ${nameOf(s)}: ${sent.reason}`)
      return
    }
  } else {
    // it may be running again since the shelf was read, here or on another
    // machine: its transcript is then its own to write
    if ((await readLive($)).has(s.id)) {
      $.ui.toast(`${nameOf(s)} is running again: rename it once the shelf shows it awake.`)
      return
    }
    const projects = `${await claudeDir($)}/projects/`
    const isSafe = SESSION_ID.test(s.id) && s.path.startsWith(projects) && !s.path.includes('/../')
      && s.path.endsWith(`/${s.id}.jsonl`)
    const line = JSON.stringify({ type: 'custom-title', customTitle: name, sessionId: s.id })
    const wrote = isSafe ? await run($, ['sh', '-c', 'printf \'%s\\n\' "$1" >> "$2"', 'sh', line, s.path]) : null
    if (wrote?.exitCode !== 0) {
      $.ui.toast(`Could not rename ${nameOf(s)}: its transcript cannot be written.`)
      return
    }
  }
  $.ui.toast(`${nameOf(s)} is now ${name}.`)
  void refresh($)
}

export async function message($: EngineInterface, s: TamaSession, text: string) {
  if (!text.trim() || s.live?.isElsewhere) return
  const sent = await $.session.send({ to: { sessionId: s.id }, text: text.trim() })
  if (sent.isDelivered) await markSeen($, [s.id])
  $.ui.toast(sent.isDelivered ? `Sent to ${nameOf(s)}.` : `Not sent: ${sent.reason}`)
}

/** What a message asking a pet to compact its context is: its own copy of the mod takes it, its model never reads it. */
export const COMPACT_TAG = '[tamaclaudchi compact]'

/** A running pet here whose context is as full as the alert's setting says, between turns or stuck on you. */
export const canCompact = (s: TamaSession) =>
  !!s.live && !s.live.isElsewhere && s.mood !== 'busy' && settings.contextAlertPct > 0
  && ctxOf(s).pct >= settings.contextAlertPct

/**
 * Has a pet compact its context, as `/compact` does, once its turn is over:
 * this session runs it itself; another is asked to, its own copy of the mod
 * running it there, as for a rename.
 */
export async function compactPet($: EngineInterface, s: TamaSession) {
  if (!s.live || s.live.isElsewhere) return
  if (s.id === (await read($, me))) {
    // queued for when this session is idle: not awaited, as that may be a while
    void $.command.run({ command: 'compact' }).catch(err => $.ui.toast(`Could not compact: ${String(err)}`))
  } else if (!(await runsMod($, s))) {
    const copied = await $.ui.copy({ text: '/compact' })
    $.ui.toast(`${nameOf(s)} does not run TamaClaudchi (started before it was installed?): run /compact in it${copied.isCopied ? ', on your clipboard' : ''}.`)
    return
  } else {
    const sent = await $.session.send({ to: { sessionId: s.id }, text: COMPACT_TAG })
    if (!sent.isDelivered) {
      $.ui.toast(`Could not ask ${nameOf(s)} to compact: ${sent.reason}`)
      return
    }
  }
  $.ui.toast(`⇲ ${nameOf(s)} compacts its context once its turn is over.`)
}

/** The pets stuck on you that `next` goes through, the longest stuck first: running here, and not this session. */
export const needing = (list: TamaSession[], mine: string | null) =>
  list.filter(s => s.live && !s.live.isElsewhere && s.mood === 'needs' && s.id !== mine).sort((a, b) => a.mtimeMs - b.mtimeMs)

// The pet `next` last went to: pressed again, it goes on to the one after.
let wentNext: string | null = null

/**
 * Goes to the next pet stuck on you, the longest stuck first: attaches to it,
 * or opens its page where it cannot be attached to. Says where it went.
 */
export async function jumpNext($: EngineInterface): Promise<string> {
  const queue = needing(await read($, sessions), await read($, me))
  if (!queue.length) {
    $.ui.toast('No pet needs you right now.')
    return 'No pet needs you right now.'
  }
  const s = queue[(queue.findIndex(x => x.id === wentNext) + 1) % queue.length]!
  wentNext = s.id
  const said = `${nameOf(s)} needs you${s.live?.waitingFor ? `: ${s.live.waitingFor}` : ''}${queue.length > 1 ? ` (${queue.indexOf(s) + 1} of ${queue.length})` : ''}`
  if (canJump(s.live)) {
    await jump($, s)
  } else {
    await select($, s.id)
    if (!(await read($, isOpen))) await open($, true)
    $.ui.toast(`▲ ${said}: it cannot be attached to from here, so here is its page.`)
  }
  return `▲ ${said}`
}

/** Who a broadcast from this session reaches: every other running pet here (`all`), or those of one repo (`repo:<name>`). */
export const audience = (list: TamaSession[], mine: string | null, to: string) =>
  list.filter(s => s.live && !s.live.isElsewhere && s.id !== mine && (to === 'all' || to === `repo:${s.repo}`))

/**
 * Sends one message from this session to every pet of the broadcast's
 * audience, one by one, as the message box on a pet's page would; says who
 * got it, and who did not.
 */
export async function broadcast($: EngineInterface, text: string) {
  const body = text.trim()
  if (!body) return
  const list = await read($, sessions)
  const mine = await read($, me)
  const to = audience(list, mine, await read($, broadcastTo))
  if (!to.length) {
    $.ui.toast('No other running pet here to tell.')
    return
  }
  const got: TamaSession[] = []
  const missed: string[] = []
  for (const s of to) {
    const sent = await $.session.send({ to: { sessionId: s.id }, text: body }).catch((err: unknown) => ({ isDelivered: false as const, reason: String(err) }))
    if (sent.isDelivered) got.push(s)
    else missed.push(`${nameOf(s)} (${sent.reason})`)
  }
  await markSeen($, got.map(s => s.id))
  await update($, isBroadcasting, () => false)
  const self = list.find(s => s.id === mine)
  $.ui.toast(`📣 From ${self ? nameOf(self) : 'this session'} to ${plural(got.length, 'pet')}${got.length ? `: ${names(got)}` : ''}.${missed.length ? ` Not sent to ${missed.join(', ')}.` : ''}`)
}

// ─── footer ──────────────────────────────────────────────────────────────────

// The footer: at the right of the prompt's footer line, every running pet as
// a little face in its pet's colour. Working ones wave, one that needs you
// blinks a red mark, and the idle ones doze as one face with a count; the
// pointer on an awake face shows whose it is.

/** How long each frame of the faces holds. */
export const FOOTER_FRAME_MS = 700
/** The slot an awake face's name shows in, left of the faces, in cells. */
const NAME_W = 24
/** Awake faces drawn at most; more say `+N`. */
const AWAKE_SHOWN = 6
const RED = '#ff5555'

// Each pair is two frames of one width, so the line never jitters.
const WAVE = ['ᕕ(•ᴗ•)ᕗ', 'ᕙ(•ᴗ•)ᕗ']
const ASKING = '(°ᴗ°)'
const DOZE = ['(-ᴗ-)ᶻ ', '(-ᴗ-)zᶻ']

type Next = (e: RenderInput<'SessionMode'>) => Promise<RenderElement>

/** Runs `f` while the footer's egg shakes, saying `label`: what would otherwise look like a hang. */
async function busy<T>($: EngineInterface, label: string, f: () => Promise<T>): Promise<T> {
  await update($, doing, d => [...d, label])
  try {
    return await f()
  } finally {
    await update($, doing, d => d.filter((x, i) => i !== d.indexOf(label)))
  }
}

/** The egg's frames while something is being carried out: it rocks, rocks, and hatches, over and over until the work is done. */
const EGG = ['🥚 ', ' 🥚', '🥚 ', ' 🥚', '🐣 ']
/** Names longer than a card shows; the footer's name slot is at most this wide. */
const TAG_W = 40

export async function renderFooter($: EngineInterface, e: RenderInput<'SessionMode'>, next: Next) {
  const all = await read($, sessions)
  const list = all.filter(s => s.live)
  const busyWith = await read($, doing)
  // a name cut short on a card shows here whole while its card is hovered, a
  // grave's too while the graveyard is open
  const graves = (await read($, showClosed)) ? all.filter(s => !s.live).slice(0, GRAVES_SHOWN) : []
  const long = [...list, ...graves].filter(s => petName(s).length > CARD_W - 5)
  if (!list.length && !long.length && !busyWith.length) return next(e)
  const { Box, Text } = $.ui.resolve(e)
  // the shelf's own colours, given out over every pet as the shelf gives them;
  // each pet's hue at full strength, which a terminal of 16 colours keeps
  const looks = outfits(all)
  const tint = (s: TamaSession) => (s.live ? vivid(looks.get(s.id)!.skin.body) : GREY)
  const frame = await read($, footerFrame)
  const busy = list.filter(s => s.mood === 'busy')
  const asking = list.filter(s => s.mood === 'needs')
  const asleep = list.filter(s => s.mood !== 'busy' && s.mood !== 'needs')
  const awake = [...asking, ...busy].slice(0, AWAKE_SHOWN)
  const more = asking.length + busy.length - awake.length
  // A pet's name, while the pointer is on its face here or its card on the
  // shelf, shows in a slot left of the faces that is always there: the line
  // keeps its width, so nothing around it moves or wraps. A face, a card and
  // the name share a hover group.
  const named = [...new Map([...awake, ...long].map(s => [s.id, s])).values()]
  const slotW = Math.min(TAG_W, Math.max(NAME_W, ...long.map(s => petName(s).length + 2)))
  return (
    <Box>
      {e.props.modes.length ? <Text dimColor>{e.props.modes.join(' & ')} · </Text> : null}
      {named.length ? (
        <Box position="relative" width={slotW} height={1}>
          {named.map(s => (
            <Box position="absolute" top={0} right={1} display="none" hover={{ scope: faceGroup(s.id), display: 'flex' }}>
              <Text color={tint(s)}>{clip(petName(s), slotW - 2)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {awake.map((s, i) => s.mood === 'needs'
        ? <Text key={`face-${s.id}`} hover={{ scope: faceGroup(s.id), bold: true }}><Text color={tint(s)}>{ASKING}</Text><Text bold color={RED}>{frame % 2 ? ' ' : '!'}</Text> </Text>
        // each waves on its own beat
        : <Text key={`face-${s.id}`} color={tint(s)} hover={{ scope: faceGroup(s.id), bold: true }}>{WAVE[(frame + i) % 2]} </Text>)}
      {more ? <Text dimColor>+{more} </Text> : null}
      {asleep.length ? <Text dimColor>{awake.length ? '· ' : ''}{DOZE[frame % 2]} ×{asleep.length}</Text> : null}
      {/* something pressed is under way: the egg rocks until it is done */}
      {busyWith.length ? <Text dimColor>{list.length ? ' · ' : ''}{EGG[frame % EGG.length]} {busyWith[0]}…</Text> : null}
    </Box>
  )
}

/** A pet's hover group: its face in the footer, its card on the shelf, and its name in the footer's slot. */
const faceGroup = (id: string) => `tama-face-${id}`.slice(0, 64)

// ─── view ────────────────────────────────────────────────────────────────────

// Drawing the pane: the shelf of running pets, the graveyard, one pet's page,
// and the trace of one of its subagents.

type PaneEvent = RenderInput<'Pane'>

/** How many graves the graveyard draws at once; a search narrows the rest. */
const GRAVES_SHOWN = 40
const CARD_W = 24
/** A subagent's card on its pet's page: the half-size pet, its task, its state. */
const AGENT_W = 18
/** A subagent's line on a page with many, in cells; and how many more a press shows. */
const AGENT_LINE_W = 48
const AGENTS_MORE = 20
/** A card shows its pet's disk use from this much (KiB); its page always does. */
const CARD_DISK_KB = 100 * 1024
/** How many steps of a subagent's trace are drawn, the newest. */
const STEPS_SHOWN = 200
/** Cards and conversation tabs opened by a digit key, the first so many: 1 to 9, then 0. */
const DIGITS = 10
const digitKey = (n: number) => String(n % 10)
/** The spend page's top pets and repos. */
const SPEND_TOP = 8
/** A card's height on the terminal: a row of buttons, the pet, six rows of text, the border. */
const CARD_H = 1 + 8 + 6 + 2
/** The hovered card's double outline, as strips over its border cells: [top, left, text]. */
const OUTLINE: [number, number, string][] = [
  [0, 0, '╔' + '═'.repeat(CARD_W - 2) + '╗'],
  [CARD_H - 1, 0, '╚' + '═'.repeat(CARD_W - 2) + '╝'],
  [1, 0, Array(CARD_H - 2).fill('║').join('\n')],
  [1, CARD_W - 1, Array(CARD_H - 2).fill('║').join('\n')],
]

// Each mood's colours: its pill, and the card border.
const MOOD: Record<Mood, { label: string; fg: string; bg: string; border: string | null }> = {
  needs: { label: '▲ needs you?', fg: '#8e1140', bg: '#ffdce6', border: '#ff6188' },
  busy: { label: '● working', fg: '#3b3340', bg: '#fdfbf2', border: '#fc9867' },
  waiting: { label: '◌ waiting for you', fg: '#6e5200', bg: '#ffedc0', border: '#ffd866' },
  idle: { label: '○ idle', fg: '#8b8394', bg: '#fdfbf2', border: null },
}
// The shelf's rows, in order; a pet waiting on you after its turn counts as idle.
const GROUPS: { moods: Mood[]; label: string; color: string }[] = [
  { moods: ['busy'], label: 'Working', color: '#fc9867' },
  { moods: ['needs'], label: 'Needs approval', color: '#ff6188' },
  { moods: ['waiting', 'idle'], label: 'Idle', color: '#ffd866' },
]
const ACCENT = '#e8825a'
const GREY = '#8b8394'
/** Your own card: a cool cyan, apart from every mood's warm border. */
const ME = '#78dce8'
/** A section's header on a pet's or a subagent's page. */
const HEADER = '#78dce8'
/** The hovered card and every card of its repo. Borders get only the 16
 * terminal colours: a paler mint rounds to white, a bluer one to cyan, and
 * this one lands on bright green. */
const HOVER = '#55ff55'
// Every glyph is one cell wide, since one drawn wider than the layout thinks
// leaves copies behind on redraw; but for these, emoji since Unicode 6 with
// emoji presentation, which every terminal agrees are two cells (unlike 🪽,
// too new, or ⚠ and ⏸, text by default).
const HOME = '🏠' // attach: its tmux pane, or its background session
const PHONE = '📱' // on Remote Control
const GRAVE = '🪦' // the graveyard
/** The background pill's fill, on a pet's page. */
const PILL_BG = '#d9d6dc'
const LETTER = '💌' // a message between sessions (✉ is text by default)
const MEGAPHONE = '📣' // a broadcast from this session to the others
/** How many messages the messages page and a pet's page draw, the newest. */
const POSTS_SHOWN = 40

type View = { list: TamaSession[]; mine: string | null; looks: Map<string, Outfit>; now: number; cols: number; seen: Record<string, number>; mod: string; armedId: string | null }

export async function renderPane($: EngineInterface, e: PaneEvent) {
  const list = await read($, sessions)
  const pick = await read($, selected)
  const v: View = {
    list, mine: await read($, me), looks: outfits(list), now: Date.now(), cols: Math.max(CARD_W, e.props.bodyColumns), seen: await read($, mailSeen),
    mod: await read($, version), armedId: await read($, armed),
  }
  const chosen = pick ? list.find(s => s.id === pick) : undefined
  if (!chosen) return shelfPage($, e, v)
  const agentId = await read($, agentPick)
  const known = await read($, agents)
  const agent = agentId && known?.id === chosen.id ? known.list.find(a => a.id === agentId) : undefined
  const crew = known?.id === chosen.id ? known : null
  return agent ? agentPage($, e, v, chosen, agent) : petPage($, e, v, chosen, crew?.list ?? [], crew?.total ?? 0)
}

/** What both pages draw a pet with. */
function kit($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text, Button } = $.ui.resolve(e)
  // On the terminal a pet is a true-colour Raster (Text colours are cut to the
  // terminal's palette, which washes pastels out to white), with an invisible
  // Client over it that reports hover and clicks.
  // `hitId` names the pointer layer: a pet's id, or `agent:<id>` for a subagent's
  const art = (o: Outfit, key: string, hitId: string, look: { faded: boolean; halo?: boolean; sad?: boolean; sleepy?: boolean }, alt: string, isSmall = false) => {
    if (e.surface === 'terminal') {
      const { Raster, Client } = $.ui.resolve(e)
      const rest = isSmall ? petSmall(o, look) : petRest(o, look)
      return (
        <Box key={`${key}-box`} position="relative" width={rest.columns} height={rest.rows}>
          <Raster key={key} columns={rest.columns} rows={rest.rows} cells={rest.cells} />
          <Box position="absolute" top={0} left={0}>
            <Client key={`hit-${hitId}`} module="./pethit.tsx" props={{ id: hitId, columns: rest.columns, rows: rest.rows }} width={rest.columns} height={rest.rows} />
          </Box>
        </Box>
      )
    }
    if (e.surface === 'desktop' || e.surface === 'vscode') {
      const { Svg } = $.ui.resolve(e)
      return <Svg source={petSvg(petPixels(o, look))} alt={alt} width={isSmall ? 21 : 42} />
    }
    return <Text>{alt}</Text>
  }
  // a card's pet opens its page; the big one on that page only plays (`page:<id>`)
  const pet = (s: TamaSession, key: string, isPage = false) =>
    art(v.looks.get(s.id)!, key, isPage ? `page:${s.id}` : s.id, lookOf(s, v.now), `${modelLabel(s.model)} pet`)
  const agentPet = (s: TamaSession, a: Agent, key: string) =>
    art(agentOutfit(v.looks.get(s.id)!, a), key, `agent:${a.id}`, { faded: a.isDone }, `${a.type} agent`, true)
  const modelPill = (s: TamaSession) => <Text bold color={MODEL_SKIN[modelFamily(s.model)]!.body}>{modelLabel(s.model)}</Text>
  // on a card, without the word: `Sonnet 5.5 ●●●●● 100%` is all its 22 cells can hold
  const ctx = (s: TamaSession, isCard = false) => {
    const l = ctxOf(s)
    return <Text><Text color={l.color}>{l.on}</Text><Text dimColor>{l.off} {l.pct}{isCard ? '%' : '% ctx'}</Text></Text>
  }
  // A section's title: larger where the surface has sizes; the terminal has
  // one size, so there it is underlined, bold and cyan instead.
  const title = (text: string, arrow?: string) =>
    <Text bold size="heading" color={HEADER}>{arrow ? `${arrow} ` : ''}<Text underline>{text}</Text></Text>
  const note = (text: string) => <Text dimColor> · {text}</Text>
  const header = (text: string, aside?: string) =>
    <Box marginTop={1}><Text>{title(text)}{aside ? note(aside) : null}</Text></Box>
  // the mod's name, and which copy of it this is, as its plugin.json says
  const brand = <Text><Text bold color={ACCENT}>✿ TamaClaudchi ✿</Text>{v.mod ? <Text color={HEADER}> v{v.mod}</Text> : null}</Text>
  // a page's way back, where the keyboard starts
  const back = (key: string, hotkey: string, onPress: () => void, label = '← back to the shelf') =>
    <Button key={key} hotkey={hotkey} plain label={label} autoFocus onPress={onPress} />
  // a button that does something hard to undo: the first press arms it, the second does it
  const twoPress = (key: string, hotkey: string, armedAs: string, label: string, confirm: string, act: () => void) => v.armedId === armedAs
    ? <Button key={key} hotkey={hotkey} plain label={`✕ press again: ${confirm}`} onPress={act} />
    : <Button key={key} hotkey={hotkey} plain dimColor label={`✕ ${label}`} onPress={() => void update($, armed, () => armedAs)} />
  return { art, pet, agentPet, modelPill, ctx, title, note, header, brand, back, twoPress }
}

/**
 * A regexp that could take ages on a long folder name: a repeated group that
 * repeats inside (`(a+)+`), or a back-reference. Matched as plain text instead,
 * as the search runs at every redraw.
 */
const SLOW_REGEXP = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]|\\[1-9]/

/** The closed pets matching a search: a regexp, or plain text while it does not parse (or might be slow). */
export function searchGraves(closed: TamaSession[], query: string): { found: TamaSession[]; isRegexp: boolean } {
  let re: RegExp | null = null
  try { if (!SLOW_REGEXP.test(query)) re = new RegExp(query, 'i') } catch {}
  const q = query.toLowerCase()
  const found = closed.filter(s =>
    [s.title ?? '', s.repo, s.branch ?? '', s.cwd].some(field => (re ? re.test(field) : field.toLowerCase().includes(q))))
  return { found, isRegexp: re !== null }
}

/** The shelf's groupings, in the order `o` goes through them, and what its button says of each. */
export const GROUPINGS: { by: Grouping; label: string }[] = [
  { by: 'mood', label: 'by mood' }, { by: 'repo', label: 'by repo' }, { by: 'model', label: 'by model' }, { by: 'name', label: 'A to Z' },
]
const FAMILIES = ['fable', 'opus', 'sonnet', 'haiku', 'other']
const latest = (pets: TamaSession[]) => Math.max(...pets.map(s => s.mtimeMs))

/**
 * When you last talked to a pet: the last prompt you typed to it, or its
 * birth; one never talked to, when it last wrote. Unlike when it last wrote,
 * a pet at work does not move for it.
 */
export const talkedAt = (s: TamaSession) => Math.max(s.lastPromptMs ?? 0, s.bornMs ?? 0) || s.mtimeMs

/**
 * The running pets in rows: by mood (working, stuck on you, idle; the
 * default), each row the one you talked to last first; by repo (the one at
 * work latest first) or by model, each row the latest at work first and your
 * own pet ahead; or all in one row by name, A to Z.
 */
export function groupPets(alive: TamaSession[], mine: string | null, by: Grouping, looks: Map<string, Outfit>): { label: string; color: string; pets: TamaSession[] }[] {
  const order = (pets: TamaSession[]) => [...pets].sort((a, b) => Number(b.id === mine) - Number(a.id === mine) || b.mtimeMs - a.mtimeMs)
  if (by === 'name') return alive.length ? [{ label: 'A to Z', color: ACCENT, pets: [...alive].sort((a, b) => petName(a).localeCompare(petName(b), undefined, { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id)) }] : []
  if (by === 'repo') {
    const repos = new Map<string, TamaSession[]>()
    for (const s of alive) repos.get(s.repo)?.push(s) ?? repos.set(s.repo, [s])
    return [...repos].sort(([, a], [, b]) => latest(b) - latest(a))
      .map(([repo, pets]) => ({ label: repo, color: looks.get(pets[0]!.id)?.skin.body ?? GREY, pets: order(pets) }))
  }
  if (by === 'model') {
    return FAMILIES.map(f => ({ label: f === 'other' ? 'Eggs' : MODEL_SKIN[f]!.label, color: MODEL_SKIN[f]!.body, pets: order(alive.filter(s => modelFamily(s.model) === f)) }))
      .filter(g => g.pets.length)
  }
  const byTalk = (pets: TamaSession[]) => pets.sort((a, b) => talkedAt(b) - talkedAt(a) || b.mtimeMs - a.mtimeMs)
  return GROUPS.map(g => ({ label: g.label, color: g.color, pets: byTalk(alive.filter(s => g.moods.includes(s.mood))) })).filter(g => g.pets.length)
}

/** Past this many running pets the shelf is crowded: faces rather than cards, the ones needing you first, the sleepy ones folded. */
export const CROWDED = 12

/**
 * The running pets as the shelf shows them: narrowed to those matching the
 * filter; on a crowded shelf, those that need you in a row of their own first
 * (unless the rows are by mood, which has one), and the sleepy ones folded
 * away (`sleepy`) unless unfolded. Your own pet is never folded.
 */
export function arrangeShelf(
  alive: TamaSession[], mine: string | null, by: Grouping, looks: Map<string, Outfit>, now: number,
  o: { filter: string; showSleepy: boolean },
) {
  const shown = o.filter ? searchGraves(alive, o.filter).found : alive
  const isCrowded = alive.length > CROWDED
  const sleepy = isCrowded && !o.showSleepy ? shown.filter(s => s.id !== mine && isSleepy(s, now, settings.sleepyMs)) : []
  const isSleepyNow = new Set(sleepy)
  const awake = shown.filter(s => !isSleepyNow.has(s))
  const needs = isCrowded && by !== 'mood' ? awake.filter(s => s.mood === 'needs' && s.id !== mine) : []
  const isNeeding = new Set(needs)
  const rest = awake.filter(s => !isNeeding.has(s))
  const groups = [
    ...(needs.length ? [{ label: '▲ Needs you', color: MOOD.needs.border!, pets: needs }] : []),
    ...groupPets(rest, mine, by, looks),
  ]
  return { groups, sleepy, matched: shown.length, isCrowded }
}

/** Moves the shelf on to its next grouping, kept for the sessions to come. */
async function nextGrouping($: EngineInterface) {
  const now = await read($, groupBy)
  const at = GROUPINGS.findIndex(g => g.by === now)
  const by = GROUPINGS[(at + 1) % GROUPINGS.length]!.by
  await update($, groupBy, () => by)
  await $.store.set(GROUPING_KEY, by).catch(() => undefined)
}
const GROUPING_KEY = 'group-by'

/** Flips the shelf between cards and faces, from what it shows now, kept for the sessions to come. */
async function toggleDensity($: EngineInterface, isFaces: boolean) {
  const next = isFaces ? 'cards' : 'faces'
  await update($, density, () => next)
  await $.store.set(DENSITY_KEY, next).catch(() => undefined)
}
const DENSITY_KEY = 'density'

/**
 * The messages the messages page shows: between two sessions both still
 * running. A closed pet's are on its own page.
 */
export const livePosts = (list: TamaSession[]) => {
  const running = new Set(list.filter(s => s.live).map(s => s.id))
  return postsOf(list).filter(p => !!p.from && !!p.to && running.has(p.from) && running.has(p.to))
}

/** What a pet spent over the window, by its days. */
const windowSpend = (s: TamaSession) => Object.values(s.spend?.days ?? {}).reduce((a, b) => a + b, 0)

/** The shelf: running pets in their rows, the graveyard, or the spend page in their place. */
async function shelfPage($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' ? $.ui.resolve(e).Input : null
  const k = kit($, e, v)
  if (await read($, showSpend)) return spendPage($, e, v)
  if (await read($, showHelp)) return helpPage($, e, v)
  if (await read($, showMailroom)) return mailroomPage($, e, v)
  const isGraveOpen = await read($, showClosed)
  const query = await read($, graveQuery)
  const spawning = await read($, isSpawning)
  const used = await read($, disk)

  const self = v.list.find(s => s.id === v.mine)
  const alive = v.list.filter(s => s.live || s.id === v.mine)
  const closed = v.list.filter(s => !s.live && s.id !== v.mine)
  const folders = new Set(alive.map(s => s.repo)).size
  const { found, isRegexp } = searchGraves(closed, query)
  const graveKb = closed.reduce((n, s) => n + (s.disk?.tempKb ?? 0), 0)
  const toClean = cleanable(closed)
  const cleanKb = toClean.reduce((n, s) => n + (s.disk?.tempKb ?? 0), 0)
  const today = dayOf(v.now)
  const spentToday = v.list.reduce((n, s) => n + (s.spend?.days[today] ?? 0), 0)
  const posts = livePosts(v.list).length
  const by = await read($, groupBy)
  const stuck = needing(v.list, v.mine)
  const isTelling = await read($, isBroadcasting)
  const filter = await read($, shelfFilter)
  const isFilterOpen = (await read($, isFiltering)) || !!filter
  const shelf = arrangeShelf(alive, v.mine, by, v.looks, v.now, { filter, showSleepy: await read($, showSleepy) })
  const groups = isGraveOpen
    ? [{ label: `${GRAVE} Graveyard`, color: GREY, pets: found.slice(0, GRAVES_SHOWN) }]
    : shelf.groups
  const onPage = groups.flatMap(g => g.pets)
  // a crowded page draws a line per pet, not a card; or as last chosen with `v`
  const chosen = await read($, density)
  const isFaces = chosen === 'faces' || (chosen === 'auto' && onPage.length > CROWDED)
  // the first pets on the page, in reading order, open with a digit
  const digit = new Map(onPage.slice(0, DIGITS).map((s, i) => [s.id, i + 1]))
  const perRow = Math.max(1, Math.floor(v.cols / CARD_W))
  const rowsOf = (pets: TamaSession[]) =>
    Array.from({ length: Math.ceil(pets.length / perRow) }, (_, i) => pets.slice(i * perRow, (i + 1) * perRow))
  const openGraves = (isOn: boolean) => () => void update($, showClosed, () => isOn)
  const setQuery = (q: string) => void update($, graveQuery, () => q)
  const setFilter = (q: string) => void update($, shelfFilter, () => q)
  const closeFilter = () => { void update($, shelfFilter, () => ''); void update($, isFiltering, () => false) }

  return (
    <Box flexDirection="column">
      {/* the header, top down: title and version; how to open a pet, and help; the
          actions; then the shelf's own section: its legend and how it is laid out */}
      {k.brand}
      <Box columnGap={2} flexWrap="wrap">
        <Text>Click a pet, or press its number, to open it!</Text>
        <Button key="help" hotkey="h" plain label="? help" onPress={() => void update($, showHelp, () => true)} />
      </Box>
      {isGraveOpen
        ? <Button key="graveyard" hotkey="g" plain label="← back to the shelf" onPress={openGraves(false)} />
        : spawning && Input ? hatchForm($, e, v, self, await read($, hatch), await read($, folderHints))
        : isTelling && Input ? broadcastBox($, e, v, self, await read($, broadcastTo), digit)
        : (
          <Box flexDirection="column">
            <Box columnGap={2} flexWrap="wrap">
              <Box columnGap={1}>
                <Button key="spawn" hotkey="n" plain label="+ new pet" onPress={() => { void update($, isSpawning, () => true); void suggestFolders($, '', v.list) }} />
                <Text dimColor>· {alive.length} running across {plural(folders, 'folder')}</Text>
              </Box>
              {closed.length ? <Button key="graveyard" hotkey="g" plain label={`${GRAVE} graveyard · ${closed.length} closed`} onPress={openGraves(true)} /> : null}
            </Box>
            <Box columnGap={2} flexWrap="wrap">
              <Button key="spend" hotkey="s" plain label={`$ credit usage · ${usd(spentToday)} today`} onPress={() => void update($, showSpend, () => true)} />
              {audience(v.list, v.mine, 'all').length && Input ? <Button key="broadcast" hotkey="t" plain label={`${MEGAPHONE} broadcast a message`} onPress={() => void update($, isBroadcasting, () => true)} /> : null}
              {posts ? <Button key="mailroom" hotkey="m" plain label={`${LETTER} ${plural(posts, 'message')}`} onPress={() => void openMailroom($, true)} /> : null}
              {/* the pets stuck on you, one press each, the longest stuck first */}
              {stuck.length ? <Button key="next" hotkey="j" plain label={`▲ next that needs you · ${stuck.length}`} onPress={() => void jumpNext($)} /> : null}
            </Box>
          </Box>
        )}
      {/* what Claude keeps on disk, orange then red past the thresholds in /config: time to clean up */}
      {used ? (
        <Text wrap="truncate">
          <Text dimColor>Claude takes </Text>
          <Text bold color={diskColor(used.tempKb + used.logKb, settings.diskWarnKb / GiB, settings.diskAlarmKb / GiB)}>{bytes(used.tempKb + used.logKb)}</Text>
          <Text dimColor> on disk: {bytes(used.tempKb)} in {used.tempDir}, {bytes(used.logKb)} of transcripts</Text>
        </Text>
      ) : null}
      {isGraveOpen ? null : (
        <Box flexDirection="column" marginTop={1}>
          <Text wrap="truncate">{k.title('Browse your Tamas')}<Text dimColor>  (body = repo · hat = model · item = branch)</Text></Text>
          <Box columnGap={2} flexWrap="wrap">
            <Button key="group" hotkey="o" plain label={`⇅ ${GROUPINGS.find(g => g.by === by)?.label ?? GROUPINGS[0]!.label}`} onPress={() => void nextGrouping($)} />
            <Button key="density" hotkey="v" plain label={isFaces ? '▦ cards view' : '☺ faces view'} onPress={() => void toggleDensity($, isFaces)} />
            {Input && !isFilterOpen ? <Button key="filter" hotkey="f" plain label="⌕ filter" onPress={() => void update($, isFiltering, () => true)} /> : null}
          </Box>
        </Box>
      )}
      {/* the running pets narrowed to those matching: the digits go to the first of them */}
      {!isGraveOpen && isFilterOpen && Input ? (
        <Box flexDirection="column">
          <Input key="shelf-filter" label="filter" placeholder="a regexp over name, repo, branch or folder" value={filter} autoFocus
            onInput={setFilter} onSubmit={setFilter} />
          <Box columnGap={2}>
            <Text dimColor>{filter ? `${shelf.matched} of ${alive.length} match` : 'every running pet'}</Text>
            <Button key="filter-clear" plain dimColor label="✕ clear" onPress={closeFilter} />
          </Box>
        </Box>
      ) : null}
      {isGraveOpen || self ? null : <Text dimColor>Your pet hatches once this session has written its first reply.</Text>}
      {isGraveOpen && !closed.length ? <Text dimColor>No pet has closed {since()}.</Text> : null}
      {isGraveOpen && closed.length && Input ? (
        <Box flexDirection="column" marginTop={1}>
          <Input key="grave-search" label="search" placeholder="a regexp over name, repo, branch or folder" value={query} autoFocus
            onInput={setQuery} onSubmit={setQuery} />
          <Text dimColor>
            {query ? `${found.length} of ${closed.length} match` : `${closed.length} closed ${since()}`}
            {graveKb >= MIN_CLEAN_KB ? ` · ${bytes(graveKb)} in their temp folders` : ''}
            {isRegexp ? '' : ' (not a regexp to run on every redraw: matching it as plain text)'}
            {found.length > GRAVES_SHOWN ? ` · showing the newest ${GRAVES_SHOWN}` : ''}
          </Text>
        </Box>
      ) : null}
      {/* every closed pet's temp folder at once, in two presses; their transcripts stay */}
      {isGraveOpen && toClean.length ? (
        k.twoPress('clean-all', 'x', CLEAN_ALL, `clean every closed pet's temp folder (${bytes(cleanKb)} in ${toClean.length})`,
          `delete ${bytes(cleanKb)} of temp files from ${plural(toClean.length, 'closed pet')} (transcripts stay)`, () => void cleanAll($, closed))
      ) : null}
      {!groups.length && !isGraveOpen && (await read($, doing)).includes(WAKING)
        ? <Box key="waking" marginTop={1}><Text dimColor>🥚 waking your pets… (reading every transcript, a few seconds)</Text></Box> : null}
      {groups.map(g => (
        <Box key={`group-${g.label}`} flexDirection="column" marginTop={1}>
          <Text bold color={g.color}>{g.label} <Text dimColor>· {g.pets.length}</Text></Text>
          {isFaces
            ? <Box key={`faces-${g.label}`} flexDirection="column">{g.pets.map(s => faceLine($, e, v, s, digit.get(s.id)))}</Box>
            : rowsOf(g.pets).map((row, i) => (
              <Box key={`row-${g.label}-${i}`} flexDirection="row">{row.map(s => card($, e, v, s, digit.get(s.id), by !== 'mood'))}</Box>
            ))}
        </Box>
      ))}
      {/* a crowded shelf's sleepy pets, folded into a line: one press shows them */}
      {!isGraveOpen && shelf.sleepy.length ? (
        <Box marginTop={1}>
          <Button key="sleepy" hotkey="w" plain dimColor label={`▸ zzz ${plural(shelf.sleepy.length, 'sleepy pet')}, idle for hours`} onPress={() => void update($, showSleepy, () => true)} />
        </Box>
      ) : !isGraveOpen && shelf.isCrowded && await read($, showSleepy) ? (
        <Box marginTop={1}>
          <Button key="sleepy" hotkey="w" plain dimColor label="▾ fold the sleepy pets away again" onPress={() => void update($, showSleepy, () => false)} />
        </Box>
      ) : null}
    </Box>
  )
}

/** A choice among a few, as radio buttons: `● chosen  ○ another`. */
function choices($: EngineInterface, e: PaneEvent, key: string, options: { value: string; label: string }[], chosen: string, choose: (value: string) => void) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexWrap="wrap" columnGap={2}>
      {options.map(o => (
        <Button key={`${key}-${o.value}`.slice(0, 64)} plain onPress={() => choose(o.value)}>
          {o.value === chosen
            ? <Text bold color={ACCENT}>● {clip(o.label, TAB_W)}</Text>
            : <Text dimColor>○ {clip(o.label, TAB_W)}</Text>}
        </Button>
      ))}
    </Box>
  )
}

/**
 * The new-pet form: its folder, a first prompt, its model and whether it gets
 * a worktree of its own. Enter in either field hatches it; where it runs is a
 * setting (in the background unless it says tmux).
 */
function hatchForm($: EngineInterface, e: PaneEvent, v: View, self: TamaSession | undefined, form: Hatch, hints: { for: string | null; dirs: string[] }) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' ? $.ui.resolve(e).Input : null
  if (!Input) return null
  const dir = form.dir ?? self?.cwd ?? '~'
  const set = (change: Partial<Hatch>) => void update($, hatch, f => ({ ...f, ...change }))
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
      <Text bold color={ACCENT}>+ a new pet, {settings.hatchIn === 'tmux' ? 'in its own tmux session' : 'in the background (claude --bg)'}</Text>
      <Input key="spawn-dir" label="folder" value={dir} autoFocus submitLabel="hatch"
        onInput={d => { set({ dir: d }); void suggestFolders($, d, v.list) }} onSubmit={d => void spawnPet($, d)} />
      {/* folders for what it holds: a press puts one in the field, to hatch there or look inside */}
      {hints.dirs.length ? (
        <Box flexWrap="wrap" columnGap={2}>
          <Text dimColor>try</Text>
          {hints.dirs.map(d => (
            <Button key={`hint-${d}`.slice(0, 64)} plain onPress={() => { set({ dir: `${d}/` }); void suggestFolders($, `${d}/`, v.list) }}>
              <Text color={ACCENT}>{clip(d, TAB_W)}</Text>
            </Button>
          ))}
        </Box>
      ) : null}
      <Input key="spawn-prompt" label="first prompt" value={form.prompt} placeholder="optional: what it should start on" submitLabel="hatch"
        onInput={prompt => set({ prompt })} onSubmit={prompt => void spawnPet($, dir, { prompt })} />
      <Box gap={1}>
        <Text dimColor>model</Text>
        {choices($, e, 'spawn-model', HATCH_MODELS.map(m => ({ value: m ?? '', label: m ?? 'default' })), form.model ?? '', m => set({ model: m || null }))}
      </Box>
      <Button key="spawn-worktree" plain label={`${form.worktree ? '[x]' : '[ ]'} in a git worktree of its own`} onPress={() => set({ worktree: !form.worktree })} />
      <Text dimColor wrap="wrap">
        {form.prompt.trim() && settings.hatchIn !== 'tmux' ? 'It starts on your prompt where it is; its card attaches to it.' : 'Opened once it hatches, for you to talk to.'}
        {' '}A folder not trusted yet hatches in tmux, to ask you.
      </Text>
      <Button key="spawn-cancel" plain dimColor label="cancel" onPress={() => void closeHatch($)} />
    </Box>
  )
}

/**
 * The broadcast box: one message from this session to every other running pet
 * here, or to those of one repo, each named before it goes, so who tells whom
 * is never in doubt.
 */
function broadcastBox($: EngineInterface, e: PaneEvent, v: View, self: TamaSession | undefined, to: string, digit: Map<string, number>) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' ? $.ui.resolve(e).Input : null
  if (!Input) return null
  const everyone = audience(v.list, v.mine, 'all')
  const repos = [...new Set(everyone.map(s => s.repo))].sort()
  const reached = audience(v.list, v.mine, to)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
      <Text bold color={ACCENT}>
        {MEGAPHONE} Broadcast from <Text color={ME}>{self ? clip(petName(self), 30) : 'this session'}</Text><Text dimColor> (★ you, this session)</Text>
      </Text>
      <Box gap={1}>
        <Text dimColor>to</Text>
        {choices($, e, 'broadcast-to', [{ value: 'all', label: `every running pet · ${everyone.length}` },
          ...repos.map(r => ({ value: `repo:${r}`, label: `${r} · ${everyone.filter(s => s.repo === r).length}` }))], to,
          t => void update($, broadcastTo, () => t))}
      </Box>
      <Text wrap="wrap">
        <Text dimColor>→ </Text>
        {/* each pet as its card names it: its number on the shelf, then its name */}
        {reached.length ? reached.map((s, i) => (
          <Text key={`bc-name-${s.id}`}>
            <Text dimColor>{i ? ', ' : ''}{digit.has(s.id) ? `${digit.get(s.id)}: ` : ''}</Text>
            <Text color={v.looks.get(s.id)?.skin.body}>{clip(petName(s), 30)}</Text>
          </Text>
        ))
          : <Text dimColor>no running pet there</Text>}
      </Text>
      <Input key="broadcast-text" label="›" placeholder="your message" autoFocus submitLabel="send"
        onSubmit={text => void broadcast($, text)} />
      <Button key="broadcast-cancel" plain dimColor label="cancel" onPress={() => void update($, isBroadcasting, () => false)} />
    </Box>
  )
}

/** What `armed` holds while the graveyard's clean-all waits for its second press. */
const CLEAN_ALL = '*graves'

/** A face line's columns, in cells: its face, then one word of status; its name, whole, after them. */
const FACE_GLYPH_W = 8
const FACE_STATUS_W = 10

/** What a face line says after the name: subagents at work, a full context, or its mood, in a word. */
export function faceStatus(s: TamaSession, now: number): string {
  if (s.subagents) return `⚙×${s.subagents}`
  if (canCompact(s)) return `${ctxOf(s).pct}% ctx`
  if (!s.live) return 'closed'
  if (s.mood === 'needs') return 'needs you'
  if (s.mood === 'busy') return 'working'
  if (isSleepy(s, now, settings.sleepyMs)) return 'zzz'
  return s.mood === 'waiting' ? 'waiting' : 'idle'
}

/**
 * One pet on a crowded shelf, a line of its own: the footer's face for its mood
 * in its repo's colour, a word of status, and its name in full. The line opens
 * it, as a card's name does, by its digit too.
 */
function faceLine($: EngineInterface, e: PaneEvent, v: View, s: TamaSession, digit?: number) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const o = v.looks.get(s.id)!
  const isMe = s.id === v.mine
  const tint = s.live || isMe ? vivid(o.skin.body) : GREY
  const glyph = s.mood === 'needs' && s.live ? ASKING
    : s.mood === 'busy' && s.live ? WAVE[0]!
    : !s.live && !isMe ? '(-ᴗ-)°'
    : isSleepy(s, v.now, settings.sleepyMs) ? DOZE[0]!.trimEnd()
    : '(•ᴗ•)'
  const status = isMe ? '★ you' : faceStatus(s, v.now)
  // the line's room for the name, past the face, the status and the digit's `1: `
  const room = Math.max(8, v.cols - FACE_GLYPH_W - FACE_STATUS_W - 4)
  const name = clip(petName(s), room)
  const statusColor = isMe ? ME : s.mood === 'needs' && s.live ? RED : s.mood === 'busy' && s.live ? MOOD.busy.border! : undefined
  return (
    <Box key={`face-${s.id}`}>
      <Button key={`name-${s.id}`} plain hotkey={digit ? digitKey(digit) : undefined} onPress={() => void select($, s.id)}>
        <Text color={tint}>{glyph.padEnd(FACE_GLYPH_W)}</Text>
        <Text color={statusColor} dimColor={!statusColor}>{clip(status, FACE_STATUS_W - 1).padEnd(FACE_STATUS_W)}</Text>
        <Text bold={!!s.live || isMe} dimColor={!s.live && !isMe}>{name}</Text>
        {/* its repo after it, where the line has room: a button's text would wrap */}
        {name.length + s.repo.length + 2 <= room ? <Text dimColor>  {s.repo}</Text> : null}
      </Button>
    </Box>
  )
}

/** One pet's card on the shelf; `digit` opens it from the keyboard; `showMood` when its row does not say it. */
function card($: EngineInterface, e: PaneEvent, v: View, s: TamaSession, digit?: number, showMood = false) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const k = kit($, e, v)
  const o = v.looks.get(s.id)!
  const isMe = s.id === v.mine
  const isTerminal = e.surface === 'terminal'
  const size = s.disk ? s.disk.tempKb + s.disk.logKb : 0
  const pct = ctxOf(s).pct
  const isMailed = hasRecentMail(s, v.now, v.seen[s.id])
  const name = petName(s), nameW = CARD_W - 2 - (digit ? 3 : 0)
  return (
    // The card lights with every card of its repo while any is hovered; the
    // hovered one alone also gets the double outline, drawn over its border by
    // the wrapper (inside the card's own border it would be clipped). Only the
    // border cells are covered: a box over the whole card would take the
    // clicks meant for its buttons and pet.
    <Box key={`card-${s.id}`} position="relative" width={CARD_W} hover={{ scope: faceGroup(s.id) }}>
      <Box flexDirection="column" alignItems="center" width={CARD_W} height={isTerminal ? CARD_H : undefined}
        borderStyle={isMe ? 'double' : 'round'} borderColor={isMe ? ME : s.live ? MOOD[s.mood].border ?? o.skin.outline : GREY}
        hover={{ scope: `repo:${s.repo}`.slice(0, 64), borderColor: HOVER }}>
        {/* one line, whatever it holds: the label gives way, cut, to the badges */}
        <Box width={CARD_W - 2} height={1} overflow="hidden" justifyContent="space-between">
          {isMe ? <Text bold color={ME}>★ you</Text>
            : !s.live ? <Button key={`wing-${s.id}`} plain label={`${WING} resurrect`} onPress={() => void resurrect($, s)} />
            : canJump(s.live) ? <Button key={`home-${s.id}`} plain label={`${HOME} attach`} onPress={() => void jump($, s)} />
            : s.live.isElsewhere ? <Text dimColor wrap="truncate">↗ elsewhere</Text>
            : <Text> </Text>}
          <Box gap={1} flexShrink={0}>
            {/* a pet that takes room on disk says how much, orange past 1 GB and red past 5 */}
            {size >= CARD_DISK_KB
              ? <Text key={`disk-${s.id}`} color={size >= GiB ? diskColor(size, 1, 5) : undefined} dimColor={size < GiB}>{bytesShort(size)}</Text>
              : null}
            {s.live?.isRemote ? <Text key={`phone-${s.id}`}>{PHONE}</Text> : null}
            {/* it sent or received a message lately */}
            {isMailed ? <Text key={`letter-${s.id}`}>{LETTER}</Text> : null}
          </Box>
        </Box>
        {k.pet(s, `pet-${s.id}`)}
        {/* its name opens it: by Tab and Enter, its digit, or a click (the pet takes one too, on the terminal) */}
        <Box key={`name-box-${s.id}`} width={CARD_W - 2} justifyContent="center" position="relative">
          <Button key={`name-${s.id}`} plain hotkey={digit ? digitKey(digit) : undefined} onPress={() => void select($, s.id)}>
            {/* one line, cut by hand: a button's text wraps; the room left by `1: ` */}
            <Text bold dimColor={!s.live} color={isMe ? ME : undefined}>{clip(name, nameW)}</Text>
          </Button>
          {/* a name cut short shows whole in the footer while the card is hovered; elsewhere
              than the terminal, under it too; a surface with no hover never shows it */}
          {name.length > nameW && !isTerminal ? (
            <Box position="absolute" top={1} left={0} display="none" hover={{ display: 'flex' }}>
              <Text bold backgroundColor={PILL_BG} color="#3b3340"> {name} </Text>
            </Box>
          ) : null}
        </Box>
        <Text color={o.skin.body} wrap="truncate">{s.repo}</Text>
        <Text dimColor wrap="truncate">⎇ {s.branch ?? '—'}</Text>
        <Box gap={1}>{k.modelPill(s)}{k.ctx(s, true)}</Box>
        {/* what it is busy with, what to do about it (a full context), or how long
            it has been stuck on you or left idle; working or waiting for you, when
            the shelf's rows are not by mood to say it */}
        {s.subagents ? <Text color={MOOD.busy.border!}>{plural(s.subagents, 'subagent')} working</Text>
          : canCompact(s) ? <Button key={`compact-${s.id}`} plain label={`⇲ compact · ${pct}% full`} onPress={() => void compactPet($, s)} />
          : isSad(s) ? <Text color={MOOD.needs.border!} wrap="truncate">sad · stuck on you {ago(v.now - s.mtimeMs).replace(' ago', '')}</Text>
          : isSleepy(s, v.now, settings.sleepyMs) ? <Text dimColor wrap="truncate">sleepy · idle {ago(v.now - s.mtimeMs).replace(' ago', '')}</Text>
          : showMood && s.live && (s.mood === 'busy' || s.mood === 'waiting') ? <Text color={MOOD[s.mood].border!} wrap="truncate">{MOOD[s.mood].label}</Text>
          : s.subagentsEver ? <Text dimColor>{plural(s.subagentsEver, 'subagent')} launched</Text>
          : <Text> </Text>}
        <Text dimColor>{s.bornMs ? `born ${ago(v.now - s.bornMs)}` : 'born ?'}</Text>
      </Box>
      {/* unkeyed on purpose: their hover is the card's, the nearest keyed Box */}
      {isTerminal ? OUTLINE.map(([top, left, text]) => (
        <Box position="absolute" top={top} left={left} display="none" hover={{ display: 'flex' }}>
          <Text color={HOVER}>{text}</Text>
        </Box>
      )) : null}
    </Box>
  )
}

/** The professor who teaches the help page: a wizard's hat and a spellbook. */
const PROFESSOR: Outfit = { skin: REPO_SKINS[0]!, hat: 'wizard', item: 'spellbook', isEgg: false }

/** The help page: what a pet shows, how pets message each other, and every key, by what it is for. */
function helpPage($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text } = $.ui.resolve(e)
  const k = kit($, e, v)
  const row = (keys: string, what: string) => (
    <Text key={`help-${keys}-${what.slice(0, 12)}`} wrap="wrap"><Text bold color={ACCENT}>{keys.padEnd(8)}</Text>{what}</Text>
  )
  const section = (title: string, rows: JSX.Element[]) => (
    <Box key={`help-${title}`} flexDirection="column" marginTop={1}>{k.title(title)}{rows}</Box>
  )
  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        {k.back('help-back', 'h', () => void update($, showHelp, () => false))}
      </Box>
      <Box columnGap={2} marginTop={1} alignItems="center">
        {/* `page:` so a click on the professor opens no pet */}
        {k.art(PROFESSOR, 'help-pet', 'page:help', { faded: false }, 'the professor')}
        <Box flexDirection="column" flexShrink={1}>
          <Text bold>Welcome to class!</Text>
          <Text wrap="wrap">Every Claude Code session on this machine is a pet. Keep them busy, keep them unstuck, and give the sleepy ones a nudge.</Text>
          <Text dimColor wrap="wrap">There will be no exam. Probably.</Text>
        </Box>
      </Box>
      {section('Reading a pet', [
        row('body', 'its repo\'s colour'),
        row('hat', 'its model: wizard Fable · crown Opus · poet\'s hat Sonnet · fox mask Haiku'),
        row('item', 'what it holds is its branch'),
        row('lights', 'how full its context is, up to auto-compact'),
        row('mood', 'egg: not replied yet · frown and tear: stuck on you · eyes shut: idle for hours · halo: closed'),
        row('💌', 'it sent or got a message you haven\'t looked at yet'),
      ])}
      {section('Passing notes', [
        <Text key="help-notes" wrap="wrap">Your pets can talk to each other, and you can talk to them without leaving this session. A message lands in the other session as a note from this one: its Claude reads it, gets to work on it, and can write back. Only sessions on this machine can be reached.</Text>,
        row('page', 'open a pet, then type in the "message this session" box at the bottom of its page'),
        row('t', 'broadcast one message to every running pet, or only to one repo\'s'),
        row('m', 'the messages page: every conversation between your sessions, a tab per pair (1–9 switch tabs)'),
      ])}
      {section('Shortcuts: getting around', [
        row('1–9, 0', 'open a pet (Tab reaches the rest)'),
        row('j', 'hop to the next pet that needs you, the longest stuck first'),
        row('h', 'this page, and back'),
      ])}
      {section('Shortcuts: your pets', [
        row('n', 'hatch a new pet: a folder, a first prompt, a model, a worktree if you like'),
        row('g', 'the graveyard: closed pets, searchable'),
        row('x ×2', 'in the graveyard: clean every closed pet\'s temp files'),
        row('s', 'credit usage: what your pets would cost at API prices'),
      ])}
      {section('Shortcuts: arranging the shelf', [
        row('o', 'sort: by mood (last talked to first), repo, model, or A to Z'),
        row('v', 'cards or faces, a line each'),
        row('f', 'filter by name, repo, branch or folder'),
        row('w', 'show or fold the sleepy pets on a crowded shelf'),
      ])}
      {section('Shortcuts: on a pet\'s page', [
        row('b', 'back to the shelf'),
        row('a', 'attach: go to its tmux pane or background session'),
        row('r', 'resurrect a closed pet'),
        row('e', 'rename it'),
        row('p', 'change its repo\'s colour'),
        row('c', 'copy its resume command'),
        row('z', 'compact its context when it gets full'),
        row('k ×2', 'kill it'),
        row('d ×2', 'clean up a closed pet\'s temp files (its transcript stays)'),
      ])}
    </Box>
  )
}

/**
 * What the pets spent over the graveyard's window, at API list prices: day by
 * day, by repo, and the pets that spent most (each opens on a press).
 */
async function spendPage($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const k = kit($, e, v)
  const pets = v.list.filter(s => s.spend)
  const days = lastDays(v.now, windowDays())
  const byDay = days.map(d => ({ label: d.slice(5), usd: pets.reduce((n, s) => n + (s.spend!.days[d] ?? 0), 0) }))
  const repos = new Map<string, number>()
  for (const s of pets) repos.set(s.repo, (repos.get(s.repo) ?? 0) + windowSpend(s))
  const byRepo = [...repos].map(([label, usd]) => ({ label, usd })).filter(r => r.usd > 0).sort((a, b) => b.usd - a.usd).slice(0, SPEND_TOP)
  const top = pets.map(s => ({ s, usd: windowSpend(s) })).filter(p => p.usd > 0).sort((a, b) => b.usd - a.usd).slice(0, SPEND_TOP)
  const total = byDay.reduce((n, d) => n + d.usd, 0)
  const unpriced = pets.reduce((n, s) => n + s.spend!.unpriced, 0)
  const labelW = Math.min(24, Math.max(6, ...byRepo.map(r => r.label.length), ...top.map(p => petName(p.s).length)))
  const barW = Math.max(8, v.cols - labelW - 14)
  // one row of a chart: its label, a bar against the biggest, the sum
  const bars = (rows: { label: string; usd: number; color?: string }[], prefix: string) => {
    const max = Math.max(...rows.map(r => r.usd), 0.000001)
    return rows.map((r, i) => (
      <Text key={`${prefix}-${i}`} wrap="truncate">
        <Text dimColor>{clip(r.label, labelW).padEnd(labelW)} </Text>
        <Text color={r.color ?? ACCENT}>{'█'.repeat(Math.round((r.usd / max) * barW)) || (r.usd ? '▏' : '')}</Text>
        <Text> {usd(r.usd)}</Text>
      </Text>
    ))
  }
  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        {k.back('spend-back', 's', () => void update($, showSpend, () => false))}
      </Box>
      <Text dimColor wrap="wrap">What these sessions' API calls, their subagents' included, would cost at API list prices. A subscription is not billed this way.</Text>
      <Box marginTop={1}><Text><Text bold>{usd(byDay[0]?.usd ?? 0)}</Text><Text dimColor> today · </Text><Text bold>{usd(total)}</Text><Text dimColor> {since()}{unpriced ? ` · ${plural(unpriced, 'call')} to models with no price here, left out` : ''}</Text></Text></Box>
      {k.header('By day', 'today first')}
      {bars(byDay, 'day')}
      {byRepo.length ? k.header('By repo') : null}
      {bars(byRepo.map(r => ({ ...r, color: v.looks.get(pets.find(s => s.repo === r.label)!.id)?.skin.body })), 'repo')}
      {top.length ? k.header('Pets that spent most', 'press one to open it') : null}
      {top.map(({ s, usd: spent }) => (
        <Button key={`spend-pet-${s.id}`} plain onPress={() => void select($, s.id)}>
          <Text color={v.looks.get(s.id)!.skin.body}>{clip(petName(s), labelW).padEnd(labelW)}</Text>
          <Text dimColor> {s.repo} · {modelLabel(s.model)}{s.live ? '' : ' · closed'} · </Text>
          <Text bold>{usd(spent)}</Text>
        </Button>
      ))}
      {total ? null : <Text dimColor>Nothing spent {since()}.</Text>}
    </Box>
  )
}

/** One end of a message: its pet's name, which opens it, or the name it went by. */
function mailEnd($: EngineInterface, e: PaneEvent, v: View, id: string | null, name: string | null, key: string) {
  const { Text, Button } = $.ui.resolve(e)
  const s = id ? v.list.find(x => x.id === id) : undefined
  if (!s) return <Text key={key} dimColor>{clip(name ?? 'another session', 30)}</Text>
  return (
    <Button key={key} plain onPress={() => void select($, s.id)}>
      <Text bold color={v.looks.get(s.id)!.skin.body}>{clip(petName(s), 30)}</Text>
    </Button>
  )
}

/** A conversation's end as its tab and its bubbles name it: its pet's name, or the name its messages gave it. */
function endName(v: View, end: End) {
  const s = end.id ? v.list.find(x => x.id === end.id) : undefined
  return s ? petName(s) : end.name ?? 'another session'
}
const endColor = (v: View, end: End) => (end.id ? v.looks.get(end.id)?.skin.body : undefined) ?? GREY

/** A tab's label, in cells at most. */
const TAB_W = 34

/**
 * The conversations' tabs, as a line of labels over a thin rule: the open one
 * bold, underlined and in the headers' cyan, the others dim; the first ten
 * opened with a digit (the tenth with 0). There is no tab element: each tab is a button.
 */
function mailTabs($: EngineInterface, e: PaneEvent, v: View, threads: Thread[], open: Thread, label: (t: Thread) => string) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap" columnGap={3}>
        {threads.map((t, i) => {
          const isOpen = t.key === open.key
          // the button shows its digit itself
          const text = `${clip(label(t), TAB_W)} · ${t.posts.length}`
          return (
            <Button key={`mail-tab-${t.key}`} plain hotkey={i < DIGITS ? digitKey(i + 1) : undefined} onPress={() => void openTab($, t.key)}>
              {isOpen ? <Text bold underline color={HEADER}>{text}</Text> : <Text dimColor>{text}</Text>}
            </Button>
          )
        })}
      </Box>
      <Text dimColor wrap="truncate">{'─'.repeat(v.cols)}</Text>
    </Box>
  )
}

/** The texts a page has, and whether they are all there is: read for this page's messages, not another's. */
type Told = { texts: Record<string, string>; isRead: boolean }
async function told($: EngineInterface, pets: TamaSession[]): Promise<Told> {
  const got = await read($, mailText)
  return { texts: got?.byId ?? {}, isRead: !!got && got.key === mailRead(pets).key }
}

/**
 * One conversation as a chat, oldest first: the `left` end's messages on the
 * left, the other's on the right. A text the read did not find (too far back
 * in a long transcript) says so, rather than reading on forever.
 */
function threadView($: EngineInterface, e: PaneEvent, v: View, t: Thread, left: 0 | 1, { texts, isRead }: Told) {
  const { Box, Text } = $.ui.resolve(e)
  const maxW = Math.max(16, Math.floor(v.cols * 0.75))
  const shown = t.posts.slice(-POSTS_SHOWN)
  return (
    <Box flexDirection="column">
      {t.posts.length > shown.length ? <Text dimColor>{plural(t.posts.length - shown.length, 'older message')} not shown</Text> : null}
      {shown.map(p => {
        const by = isFrom(p, t.ends[0]) ? 0 : 1
        const writer = t.ends[by]
        const text = texts[p.id]
        return (
          <Box key={`mail-post-${p.id}`} flexDirection="column" alignItems={by === left ? 'flex-start' : 'flex-end'} marginTop={1}>
            <Text>
              <Text bold color={endColor(v, writer)}>{clip(endName(v, writer), 30)}</Text>
              <Text dimColor> · {when(p.at)}{p.ok ? '' : ' · ✕ not sent'}</Text>
            </Text>
            <Box borderStyle="round" borderColor={endColor(v, writer)} paddingX={1} width={text ? Math.min(maxW, widest(tidy(text)) + 4) : undefined}>
              <Text wrap="wrap" dimColor={!text}>{text ? tidy(text) : isRead ? 'its text is too far back in its transcript' : 'reading…'}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** The conversation whose tab is open: the one asked for, or the latest. */
const openThread = (threads: Thread[], tab: string | null) => threads.find(t => t.key === tab) ?? threads[0]

/** Every conversation between the sessions over the graveyard's window, a tab each, the latest first. */
async function mailroomPage($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const k = kit($, e, v)
  const threads = threadsOf(livePosts(v.list))
  const open = openThread(threads, await read($, mailTab))
  const texts = await told($, v.list)
  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        {k.back('mailroom-back', 'm', () => void openMailroom($, false))}
      </Box>
      <Text dimColor wrap="wrap">What your running sessions told each other {since()}: a tab per conversation, the latest first. A closed pet's are on its own page.</Text>
      {!open ? <Text dimColor>No messages {since()}.</Text> : (
        <Box flexDirection="column" marginTop={1}>
          {mailTabs($, e, v, threads, open, t => `${clip(endName(v, t.ends[0]), 16)} ↔ ${clip(endName(v, t.ends[1]), 16)}`)}
          <Box gap={1} marginTop={1}>
            {mailEnd($, e, v, open.ends[0].id, open.ends[0].name, 'mail-end-0')}
            <Text dimColor>↔</Text>
            {mailEnd($, e, v, open.ends[1].id, open.ends[1].name, 'mail-end-1')}
            <Text dimColor>· {plural(open.posts.length, 'message')} · press a name to open its pet</Text>
          </Box>
          {threadView($, e, v, open, 0, texts)}
        </Box>
      )}
    </Box>
  )
}

/** One pet, opened: its actions, its card, its subagents, its git, and the conversation. */
async function petPage($: EngineInterface, e: PaneEvent, v: View, s: TamaSession, crew: Agent[], launched: number) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' ? $.ui.resolve(e).Input : null
  const k = kit($, e, v)
  const o = v.looks.get(s.id)!
  const working = crew.filter(a => isAgentRunning(a, v.now)).length
  const gitRead = await read($, git)
  // a record written by an older version of the mod has no trees: read it again
  const info = gitRead?.id === s.id && Array.isArray(gitRead.trees) ? gitRead : null
  const isRenaming = (await read($, renaming)) === s.id
  const isPicking = (await read($, pickingColour)) === s.id
  const talk = await read($, convo)
  const isGitOpen = await read($, showGit)
  const isConvoOpen = await read($, showConvo)
  const isMailOpen = await read($, showMail)
  const texts = await told($, [s])
  const mail = s.mail ?? []
  // its conversations: every message it sent or got, a thread per other session
  const talks = threadsOf(postsOf(v.list).filter(p => p.from === s.id || p.to === s.id))
  const openTalk = openThread(talks, await read($, mailTab))
  const otherEnd = (t: Thread): 0 | 1 => (t.ends[0].id === s.id ? 1 : 0)
  const shownN = await read($, convoShown) || CONVO_PAGE
  const newestCommit = info?.trees.find(t => t.lastCommitMs)?.lastCommitMs ?? 0
  // the whole conversation once it is read; the shelf's short preview until then
  const said = talk?.id === s.id ? talk.said : s.recent
  const tmux = s.live?.tmux ? tmuxSession(s.live.tmux) : null
  const mood = !s.live ? { ...MOOD.idle, label: '✝ closed' }
    : isSleepy(s, v.now, settings.sleepyMs) ? { ...MOOD.idle, label: `zzz sleepy: idle for ${ago(v.now - s.mtimeMs).replace(' ago', '')}` }
    : isAsleep(s, v.now) ? { ...MOOD.idle, label: 'zzz asleep' }
    : s.mood === 'needs' && s.live.waitingFor ? { ...MOOD.needs, label: `▲ needs you: ${s.live.waitingFor}` }
    : MOOD[s.mood]
  const petTint = MODEL_SKIN[modelFamily(s.model)]!.body
  // a bubble hugs short lines and stops at three quarters of the pane
  const maxW = Math.max(16, Math.floor(v.cols * 0.75))
  const bubbleW = (text: string) => Math.min(maxW, widest(tidy(text)) + 4)
  const lifeLine = [
    s.live ? `running${s.live.isElsewhere ? ' on another machine' : tmux ? ` in tmux ${tmux}` : s.live.job ? ` in the background (${s.live.job})` : ''}${s.live.isRemote ? ` · ${PHONE} on Remote Control` : ''}` : 'closed',
    `last seen ${ago(v.now - s.mtimeMs)}`,
    s.bornMs ? `born ${ago(v.now - s.bornMs)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Box flexDirection="column">
      {/* the header: where you are and how to leave it, then what can be done to the pet */}
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        {k.back('back', 'b', () => void select($, null))}
        {canJump(s.live) ? <Button key="jump" hotkey="a" plain label={`${HOME} attach to pet`} onPress={() => void jump($, s)} /> : null}
        {s.live ? null : <Button key="resurrect" hotkey="r" plain label={`${WING} resurrect`} onPress={() => void resurrect($, s)} />}
      </Box>
      <Box columnGap={2} flexWrap="wrap">
        {Input && !s.live?.isElsewhere ? <Button key="rename" hotkey="e" plain label="✎ rename" onPress={() => void startRename($, s.id)} /> : null}
        <Button key="colour" hotkey="p" plain label={isPicking ? '◐ keep its colour' : '◐ change colour'}
          onPress={() => void update($, pickingColour, () => (isPicking ? null : s.id))} />
        {s.live && !s.live.isElsewhere && s.id !== v.mine ? (
          k.twoPress('kill', 'k', s.id, 'kill pet', s.live.job ? 'stop its background session' : `kill it${tmux ? ' and its tmux pane' : ''}`, () => void killPet($, s))
        ) : null}
        <Button key="resume" hotkey="c" plain label="⧉ copy resume command" onPress={() => void copyResume($, s)} />
        {/* a closed pet's temp folder: scratch files and task output, often big */}
        {!s.live && s.disk && s.disk.tempKb >= MIN_CLEAN_KB ? (
          k.twoPress('clean', 'd', s.id, `clean up temp on disk (${bytes(s.disk.tempKb)})`, `delete ${bytes(s.disk.tempKb)} of temp files (its transcript stays)`, () => void cleanTemp($, s))
        ) : null}
        {canCompact(s) ? <Button key="compact" hotkey="z" plain label={`⇲ compact · ${ctxOf(s).pct}% full`} onPress={() => void compactPet($, s)} /> : null}
      </Box>
      <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor={MOOD[s.mood].border ?? o.skin.outline} paddingX={1}>
        {k.pet(s, 'detail-pet', true)}
        {isRenaming && Input ? (
          <Box width={Math.min(maxW, 50)} flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
            <Text color={ACCENT} bold>✎ new name</Text>
            <Input key="rename-name" label="›" value={petName(s)} placeholder="type a name" autoFocus submitLabel="rename" onSubmit={name => void renamePet($, s, name)} />
            <Text dimColor>Enter renames · Esc leaves the field</Text>
            <Button key="rename-cancel" plain dimColor label="cancel" onPress={() => void update($, renaming, () => null)} />
          </Box>
        ) : <Text bold wrap="truncate">{petName(s)}</Text>}
        <Text color={o.skin.body} wrap="truncate">{s.repo}{s.branch ? ` · ${s.branch}` : ''}</Text>
        {isPicking ? (
          <Box flexDirection="column" alignItems="center">
            <Text dimColor>the colour of every pet of {s.repo}:</Text>
            <Box columnGap={1}>
              {REPO_SKINS.map((skin, i) => (
                <Button key={`colour-${i}`} plain onPress={() => void chooseColour($, s, i)}>
                  <Text color={skin.body}>{i === s.skinSlot ? '◆' : '■'}</Text>
                </Button>
              ))}
            </Box>
          </Box>
        ) : null}
        <Box gap={1}>
          {k.modelPill(s)}{k.ctx(s)}<Text color={mood.fg} backgroundColor={mood.bg}> {mood.label} </Text>
          {/* started with claude --bg: no terminal of its own, attach opens one */}
          {s.live?.job ? <Text color="#3b3340" backgroundColor={PILL_BG}> ◐ background </Text> : null}
        </Box>
        <Text dimColor wrap="truncate-start">{s.cwd}</Text>
        <Text dimColor>{lifeLine}</Text>
        {/* the lights' figures: how far it has come to where Claude Code auto-compacts it */}
        {s.contextTokens ? <Text dimColor>context: {tokenCount(s.contextTokens)} of the {tokenCount(compactAtOf(s))} where Claude Code auto-compacts it</Text> : null}
        {/* what the compactions took out, back: the conversation since it was born */}
        {s.compactions ? (
          <Text dimColor>whole conversation: about {tokenCount(s.contextTokens + s.droppedTokens)}, compacted {s.compactions === 1 ? 'once' : `${s.compactions} times`}</Text>
        ) : null}
        {s.disk ? (
          <Text dimColor>
            on disk: <Text bold dimColor={false} color={diskColor(s.disk.tempKb + s.disk.logKb, 1, 5)}>{bytes(s.disk.tempKb + s.disk.logKb)}</Text>
            {' '}({bytes(s.disk.tempKb)} in its temp folder, {bytes(s.disk.logKb)} of logs)
          </Text>
        ) : null}
        {/* at API list prices: its own calls and its subagents' */}
        {s.spend?.calls ? (
          <Text dimColor>
            spent <Text bold dimColor={false}>{usd(s.spend.usd)}</Text> at API prices
            {s.spend.days[dayOf(v.now)] ? ` (${usd(s.spend.days[dayOf(v.now)]!)} today)` : ''}
            {' '}over {plural(s.spend.calls, 'call')}{s.spend.unpriced ? `, ${s.spend.unpriced} not priced` : ''}
          </Text>
        ) : null}
      </Box>
      {crew.length ? (
        <Box flexDirection="column">
          {k.header('Subagents', `${working} working · ${Math.max(0, launched - working)} done${launched > crew.length ? ` · showing ${crew.length} of ${launched}` : ''} · click one for its trace`)}
          {/* many: a line each, the running ones first, rather than a card each */}
          {crew.length > CROWDED ? (
            <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
              {crew.map(a => {
                const running = isAgentRunning(a, v.now)
                return (
                  <Box key={`agent-line-${a.id}`} width={AGENT_LINE_W}>
                    <Button key={`agent-${a.id}`} plain onPress={() => void openAgent($, a.id)}>
                      <Text color={running ? MOOD.busy.border! : GREY}>{running ? '● ' : '✓ '}</Text>
                      <Text dimColor={!running}>{clip(a.description, AGENT_LINE_W - 12).padEnd(AGENT_LINE_W - 12)} </Text>
                      <Text dimColor>{running ? 'working' : ago(v.now - a.mtimeMs).replace(' ago', '')}</Text>
                    </Button>
                  </Box>
                )
              })}
            </Box>
          ) : (
          <Box flexDirection="row" flexWrap="wrap">
            {crew.map(a => {
              const running = isAgentRunning(a, v.now)
              return (
                <Box key={`agent-card-${a.id}`} flexDirection="column" alignItems="center" width={AGENT_W}
                  borderStyle="round" borderColor={running ? MOOD.busy.border! : GREY}>
                  {k.agentPet(s, a, `agent-pet-${a.id}`)}
                  <Button key={`agent-${a.id}`} plain dimColor={!running} label={clip(a.description, AGENT_W - 2)} onPress={() => void openAgent($, a.id)} />
                  <Text dimColor={!running} color={running ? MOOD.busy.border! : undefined}>{running ? '● working' : `✓ ${ago(v.now - a.mtimeMs)}`}</Text>
                </Box>
              )
            })}
          </Box>
          )}
          {/* the older finished ones, a page at a time */}
          {launched > crew.length ? (
            <Button key="agents-more" plain dimColor label={`▸ ${Math.min(AGENTS_MORE, launched - crew.length)} more of the ${launched - crew.length} not shown`} onPress={() => void showMoreAgents($, s)} />
          ) : null}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Button key="git-toggle" plain onPress={() => void update($, showGit, x => !x)}>
          {k.title('Git Activity', isGitOpen ? '▾' : '▸')}
          {k.note(!info ? 'reading…' : info.error ?? `${plural(info.trees.length, 'checkout')} it worked in${newestCommit ? `, newest commit ${ago(v.now - newestCommit)}` : ''}`)}
        </Button>
      </Box>
      {isGitOpen ? (
        <Box flexDirection="column">
          {!info ? <Text dimColor>reading git…</Text>
            : info.error ? <Text dimColor>{info.error}</Text>
            : info.trees.map((t, i) => (
              <Box key={`git-tree-${i}`} flexDirection="column" marginTop={i ? 1 : 0}>
                <Text wrap="truncate">
                  <Text color={o.skin.body}>⎇ {(t.status[0] ?? '').replace(/^## /, '')}</Text>
                  <Text dimColor> · {t.isHome ? 'its folder' : t.path.split('/').pop()}</Text>
                </Text>
                {t.status.length > 1
                  ? <Text dimColor wrap="truncate">{plural(t.status.length - 1, 'changed file')}: {t.status.slice(1, 4).map(l => l.slice(3)).join(', ')}{t.status.length > 4 ? ', …' : ''}</Text>
                  : <Text dimColor>clean</Text>}
                {t.log.map((l, j) => <Text key={`git-log-${i}-${j}`} wrap="truncate"><Text color={ACCENT}>{l.split(' ')[0]}</Text> {l.slice(l.indexOf(' ') + 1)}</Text>)}
              </Box>
            ))}
        </Box>
      ) : null}
      {/* what it told the other sessions, and they it: sent on the right, as its own words */}
      {mail.length ? (
        <Box marginTop={1}>
          <Button key="mail-toggle" plain onPress={() => void update($, showMail, x => !x)}>
            {k.title('Messages', isMailOpen ? '▾' : '▸')}
            {k.note(`${mail.filter(m => m.dir === 'out').length} sent · ${mail.filter(m => m.dir === 'in').length} received, the last ${ago(v.now - mail.at(-1)!.at)}`)}
          </Button>
        </Box>
      ) : null}
      {/* a tab per session it talked to; its own messages on the right, as its words */}
      {isMailOpen && openTalk ? (
        <Box flexDirection="column">
          {mailTabs($, e, v, talks, openTalk, t => endName(v, t.ends[otherEnd(t)]))}
          <Box gap={1} marginTop={1}>
            <Text dimColor>with</Text>
            {mailEnd($, e, v, openTalk.ends[otherEnd(openTalk)].id, openTalk.ends[otherEnd(openTalk)].name, 'mail-with')}
            <Text dimColor>· {plural(openTalk.posts.length, 'message')}</Text>
          </Box>
          {threadView($, e, v, openTalk, otherEnd(openTalk), texts)}
        </Box>
      ) : null}
      {/* on the right, where your side of the conversation is */}
      {s.live && !s.live.isElsewhere && Input ? (
        <Box flexDirection="column" alignItems="flex-end" marginTop={1}>
          <Box width={maxW}>
            <Input key="msg" placeholder="message this session…" submitLabel="send" onSubmit={text => void message($, s, text)} />
          </Box>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Button key="convo-toggle" plain onPress={() => { void update($, showConvo, x => !x); if (!isConvoOpen) void readConvo($, s) }}>
          {k.title('Conversation preview', isConvoOpen ? '▾' : '▸')}
          {k.note(`newest first · ${plural(said.length, 'message')}${said.at(-1)?.at ? `, the last ${ago(v.now - said.at(-1)!.at!)}` : ''}`)}
        </Button>
      </Box>
      {isConvoOpen ? (
        <Box flexDirection="column">
          {said.length ? null : <Text dimColor>Nothing said yet.</Text>}
          {[...said].reverse().slice(0, shownN).map((m, i) => {
            const isYou = m.role === 'user'
            const tint = isYou ? ACCENT : petTint
            const meta = [
              m.at ? when(m.at) : null,
              `${isYou ? '~' : ''}${tokenCount(m.tokens)} tok`,
              isYou ? null : m.costUsd === null ? 'cost ?' : usd(m.costUsd),
            ].filter(Boolean).join(' · ')
            return (
              <Box key={`said-${i}`} flexDirection="column" alignItems={isYou ? 'flex-end' : 'flex-start'} marginTop={i ? 1 : 0}>
                <Text><Text bold color={tint}>{isYou ? 'you' : modelLabel(s.model)}</Text><Text dimColor> · {meta}</Text></Text>
                <Box borderStyle="round" borderColor={tint} paddingX={1} width={bubbleW(m.text)}>
                  <Text wrap="wrap">{tidy(m.text)}</Text>
                </Box>
              </Box>
            )
          })}
          {/* a long conversation is drawn a page at a time, the newest first */}
          {said.length > shownN
            ? <Button key="convo-more" plain dimColor label={`show ${Math.min(CONVO_PAGE, said.length - shownN)} older of ${said.length - shownN} more`} onPress={() => void update($, convoShown, n => (n || CONVO_PAGE) + CONVO_PAGE)} />
            : null}
          {/* the same as the top row's jump, for whoever has scrolled down here: j presses that one */}
          {canJump(s.live) ? <Button key="jump-bottom" plain label="a: attach to see the full conversation" onPress={() => void jump($, s)} /> : null}
        </Box>
      ) : null}
    </Box>
  )
}

/** One subagent, opened: its task, and its trace, newest first. */
async function agentPage($: EngineInterface, e: PaneEvent, v: View, s: TamaSession, a: Agent) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const k = kit($, e, v)
  const read$ = await read($, trace)
  const steps = read$?.id === a.id ? read$.steps : null
  const running = isAgentRunning(a, v.now)
  const tint = MODEL_SKIN[modelFamily(a.model)]!.body
  const maxW = Math.max(16, Math.floor(v.cols * 0.75))
  const bubbleW = (text: string) => Math.min(maxW, widest(tidy(text)) + 4)
  const shown = (steps ?? []).slice(-STEPS_SHOWN).reverse()
  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        {k.back('agent-back', 'b', () => void openAgent($, null), `← back to ${clip(petName(s), 30)}`)}
        {canJump(s.live) ? <Button key="jump" hotkey="a" plain label={`${HOME} attach to its pet`} onPress={() => void jump($, s)} /> : null}
      </Box>
      <Box flexDirection="row" gap={2} borderStyle="round" borderColor={running ? MOOD.busy.border! : GREY} paddingX={1}>
        {k.agentPet(s, a, 'agent-detail-pet')}
        <Box flexDirection="column">
          <Text bold wrap="truncate">{a.description}</Text>
          <Text><Text bold color={tint}>{modelLabel(a.model)}</Text><Text dimColor> · {a.type} · a subagent of {petName(s)}</Text></Text>
          <Text color={running ? MOOD.busy.border! : undefined} dimColor={!running}>
            {running ? '● working' : a.isDone ? '✓ done' : '◌ quiet'} · last wrote {ago(v.now - a.mtimeMs)}
          </Text>
          {/* its whole log, which the trace below only shows the end of */}
          <Box gap={1}>
            <Text bold>Log:</Text>
            <Button key="agent-log" hotkey="c" plain label="copy path" onPress={() => void copyPath($, a.path)} />
            <Text dimColor wrap="truncate-start">{a.path}</Text>
          </Box>
        </Box>
      </Box>
      {k.header('Trace', `newest first${steps && steps.length > STEPS_SHOWN ? ` · the last ${STEPS_SHOWN} of ${steps.length} steps` : ''}`)}
      {!steps ? <Text dimColor>reading its trace…</Text> : steps.length ? null : <Text dimColor>Nothing yet.</Text>}
      {shown.map((st, i) => {
        const meta = st.at ? <Text dimColor> · {when(st.at)}</Text> : null
        if (st.kind === 'tool') {
          return <Text key={`step-${i}`} wrap="truncate"><Text color={ACCENT}>▸ </Text><Text dimColor>{st.text}</Text></Text>
        }
        const isTask = st.kind === 'prompt'
        const color = isTask ? ACCENT : tint
        return (
          <Box key={`step-${i}`} flexDirection="column" alignItems={isTask ? 'flex-end' : 'flex-start'} marginY={1}>
            <Text><Text bold color={color}>{isTask ? 'its task' : modelLabel(a.model)}</Text>{meta}</Text>
            <Box borderStyle="round" borderColor={color} paddingX={1} width={bubbleW(st.text)}>
              <Text wrap="wrap">{tidy(st.text)}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

// ─── register ────────────────────────────────────────────────────────────────

const TITLE = 'TamaClaudchi'
/** With the pane closed and no alerts to raise, only the footer shows the pets: read them this many polls apart. */
const CLOSED_POLLS = 4
/** With every face dozing, the footer moves one frame in this many. */
const DOZE_FRAMES = 3

/** How often this session polls: every poll while its pane is open or alerts are on, else a few polls apart. */
const everyMs = (isPaneOpen: boolean) => (!isPaneOpen && settings.alerts === 'off' ? settings.pollMs * CLOSED_POLLS : settings.pollMs)

async function open($: EngineInterface, focus: boolean) {
  await update($, isOpen, () => true)
  // not awaited: a cold read draws the shelf as it goes, the egg rocking meanwhile
  void refresh($)
  return $.ui.open(focus ? { id: PANE, title: TITLE, focus: true } : { id: PANE, title: TITLE })
}

export const register: Register = (on, options) => {
  applyOptions(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tama', description: 'Open the TamaClaudchi shelf: every session, across folders, as a pet' })
    await $.command.register({ name: 'tama-next', description: 'Go to the next pet that needs you (a permission prompt), the longest stuck first' })
    await update($, me, () => null)
    // The host keeps these across a reload of the mod, when an older version
    // may have written them in another shape: start again from the shelf.
    await update($, selected, () => null)
    await update($, agentPick, () => null)
    await update($, git, () => null)
    await update($, convo, () => null)
    await update($, agents, () => null)
    await update($, trace, () => null)
    await update($, showGit, () => false)
    await update($, showConvo, () => false)
    await update($, armed, () => null)
    await update($, isSpawning, () => false)
    await update($, hatch, () => NO_HATCH)
    await update($, isBroadcasting, () => false)
    await update($, broadcastTo, () => 'all')
    await update($, renaming, () => null)
    await update($, pickingColour, () => null)
    await update($, folderHints, () => ({ for: null, dirs: [] }))
    await update($, shelfFilter, () => '')
    await update($, isFiltering, () => false)
    await update($, showSleepy, () => false)
    await update($, agentsMore, () => 0)
    await update($, showClosed, () => false)
    await update($, showSpend, () => false)
    await update($, showHelp, () => false)
    await update($, doing, () => [])
    await update($, showMail, () => false)
    await update($, showMailroom, () => false)
    await update($, mailTab, () => null)
    await update($, mailSeen, () => ({}))
    await update($, mailText, () => null)
    await update($, graveQuery, () => '')
    await update($, disk, () => null)
    await update($, sessions, () => [])
    // the shelf's grouping, as last chosen on this machine
    const by = await $.store.get(GROUPING_KEY).catch(() => undefined)
    await update($, groupBy, () => (GROUPINGS.some(g => g.by === by) ? by as Grouping : 'mood'))
    // and its cards or faces, as last chosen
    const dense = await $.store.get(DENSITY_KEY).catch(() => undefined)
    await update($, density, () => (dense === 'cards' || dense === 'faces' ? dense : 'auto'))
    void $.session.id().then(async id => {
      await update($, me, () => id)
      if (id) await markRunning($, id)
    })
    await update($, version, () => '')
    // the version as its manifest says, shown in the shelf's legend
    void $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).then(text => {
      const v: unknown = JSON.parse(text).version
      if (typeof v === 'string') return update($, version, () => v)
    }).catch(() => undefined)
    // Unasked, a pane seats from 144 columns and waits below that, so on a
    // wide terminal your pet greets you at start, as the logo would.
    if (settings.autoOpen) void open($, false)
    else void refresh($, { everyMs: everyMs(false) })
    // Alerts need the moods at every poll; the footer alone can wait longer.
    // Only one session on the machine reads the transcripts (the shared section).
    let polls = 0
    $.clock.every(settings.pollMs, () => void read($, isOpen).then(o => {
      const ms = everyMs(o)
      if (ms === settings.pollMs || ++polls % CLOSED_POLLS === 0) return refresh($, { everyMs: ms })
    }))
    // the footer's faces move: its next frame, while there are any (the footer
    // alone reads the frame, so nothing else is drawn again); dozing faces
    // alone snore slower, so an idle machine redraws less
    let frames = 0
    $.clock.every(FOOTER_FRAME_MS, () => void Promise.all([read($, sessions), read($, doing)]).then(([list, busyWith]) => {
      const live = list.filter(s => s.live)
      if (busyWith.length || live.some(s => s.mood === 'busy' || s.mood === 'needs')) return update($, footerFrame, n => n + 1)
      if (live.length && ++frames % DOZE_FRAMES === 0) return update($, footerFrame, n => n + 1)
    }))
    return next(e)
  })

  on('command.run', { command: 'tama' }, async ($, e) => {
    await open($, true)
    // the main screen (tmux's default) seats the pane above the prompt, not docked on the right
    if (!e.presentation.isFullscreen) $.ui.toast('Shown above the prompt: run /tui fullscreen (or set "tui": "fullscreen" in settings) to dock it on the right.', { timeoutMs: 8000 })
    return { text: 'TamaClaudchi shelf opened.' }
  })

  // from any session: straight to the next pet stuck on you, the pane closed or not
  on('command.run', { command: 'tama-next' }, async $ => ({ text: await jumpNext($) }))

  // the pointer layer over each pet (pethit.tsx): hover plays it, a click opens it
  on('ui.message', async ($, e) => {
    if (!e.module.endsWith('pethit.tsx')) return {}
    const d = e.data as { id?: string; hover?: boolean; open?: boolean }
    if (!d.id) return {}
    // a subagent's little pet: a click opens its trace
    // the big pet on its own page: it plays, and a click there opens nothing new
    if (d.id.startsWith('page:')) {
      if (d.hover !== undefined) await hover($, d.id.slice('page:'.length), d.hover, 'detail-pet')
      return {}
    }
    if (d.id.startsWith('agent:')) {
      if (d.open) await openAgent($, d.id.slice('agent:'.length))
      return {}
    }
    if (d.open) {
      await hover($, d.id, false)
      await select($, d.id)
    } else if (d.hover !== undefined) {
      await hover($, d.id, d.hover)
    }
    return {}
  })

  // another session's shelf asks this one's pet to rename itself, or to
  // compact its context (the actions section)
  on('session.receive', async ($, e, next) => {
    if (e.origin.kind !== 'peer' || e.origin.plugin !== 'tamaclaudchi') return next(e)
    // found anywhere in it, as a rename's tag is: the text may come wrapped
    if (e.text.includes(COMPACT_TAG)) {
      // queued for when the session is idle, as a rename is
      void $.command.run({ command: 'compact' }).catch(err => $.ui.log(`tamaclaudchi: could not compact: ${String(err)}`))
      return { consumed: 'a compact asked from another session\'s shelf' }
    }
    const at = e.text.indexOf(RENAME_TAG)
    if (at < 0) return next(e)
    const name = cleanName(e.text.slice(at + RENAME_TAG.length).split('\n')[0]!)
    // queued for when the session is idle: not awaited, as this delivery waits on the hook
    if (name) void $.command.run({ command: 'rename', args: name }).catch(err => $.ui.log(`tamaclaudchi: could not rename: ${String(err)}`))
    return { consumed: 'a rename asked from another session\'s shelf' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, isOpen, () => false)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => renderPane($, e))

  // the footer, right of the prompt: every running pet as a little face
  on('ui.render', { component: 'SessionMode' }, ($, e, next) => renderFooter($, e, next))
}
