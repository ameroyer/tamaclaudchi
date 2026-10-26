// TamaClaudchi: the hooks, and every function that takes the engine interface.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput, Register } from 'claude-code'

import type { TamaSession, Mood, Agent, GitInfo, GitTree, Live, Said, Spend, Step } from '../types'

import { settings, windowDays, since, applyOptions } from './config'
import { petName, isAsleep, isSad, parseSession, rederive, repoOf, shelfOrder, traceOf, withLive, petName as nameOf } from './sessions'
import { mailFrames, outfits, petRest, ITEM_COUNT, itemKey, repoKey, SKIN_COUNT, stickySlots, agentOutfit, MODEL_SKIN, modelFamily, modelLabel, petPixels, petSmall, petSvg, type Slots, type Outfit } from './pets'
import { lastDays, readCalls, spendOf, USAGE_AWK, dayOf, type Call } from './spend'
import { lettersOf, MAIL_AWK, mailEdges, mailRead, PROMPT_AWK, readMail, postsOf, threadsOf, hasRecentMail, isFrom, type MailFact, type End, type Thread } from './mail'
import { bytes, clip, vivid, ago, bytesShort, diskColor, GiB, lights, plural, tidy, tokenCount, usd, when, widest } from './format'
import { ABS_PATH, AGENT_FILE, AGENT_ID, APPEND_LINE_SCRIPT, DOTS_ONLY, HOME_TILDE, PS_LINE, SPEND_SIGN, TMUX_SESSION_SIGIL, ACCENT, AGENTS_SCRIPT, AGENTS_SHOWN, AGENT_W, ASKING, AWAKE_SHOWN, BATCH, CANDIDATES, CARD_DISK_KB, CARD_H, CARD_W, CLEAN_ALL, CLOSED_POLLS, CONVO_BYTES, CONVO_PAGE, DIGITS, DISK_MS, DISK_SCRIPT, DOZE, DOZE_FRAMES, EGG_SHOWN_MS, FOOTER_FRAME_MS, FRESH_BATCH, GIT_SCRIPT, GIT_TREES, GRAVE, GRAVES_SHOWN, GREY, GROUPS, HEADER, HOVER, LEASE_POLLS, LIST_SCRIPT, LSTART, MACHINE_SCRIPT, MAIL_CHARS, MAIL_FILES, MAIL_FRAME_MS, MAIL_SCRIPT, MAX_CLOSED, ME, MIN_CLEAN_KB, MOOD, NAME_W, OUTLINE, PHONE, POSTS_SHOWN, PROJECT_DIR, READ_SCRIPT, RECENT_WRITE_MS, RED, REDRAW_MS, RENAME_TAG, SCHEMA, SESSION_ID, SLOTS_KEY, SPEND_TOP, STEPS_SHOWN, SUBAGENT_SCRIPT, TAB_OPEN, TAB_SHUT, TAB_W, TEMP_DIR, TITLE, TMUX_PANE, TMUX_TARGET, USAGE_SCRIPT, VERSION, WAVE, cache, cleanName, closedSubs, dirOf, diskById, everyMs, factsOf, isAgentRunning, machineFrom, names, newMail, news, openThread, playing, readFrom, registry, sameStart, searchGraves, shellQuote, subCache, tmuxPane, tmuxSession, canJump, joined, attachClient, markerOf, PRUNE_MS, PILL_BG, windowSpend, sharedPaths, cleanable, WING, type Lease, type Shelf, type Paths, type Disk, type Next, type PaneEvent, type Proc, type Told, type Transcript } from './plain'

// The values the mod reads or writes, one plugin and key each.
const convo = atom({ plugin: 'tamaclaudchi', key: 'convo' } as const, null as { id: string; mtimeMs: number; said: Said[] } | null)
const me = atom({ plugin: 'tamaclaudchi', key: 'me' } as const, null as string | null)
const git = atom({ plugin: 'tamaclaudchi', key: 'git' } as const, null as GitInfo | null)
const selected = atom({ plugin: 'tamaclaudchi', key: 'selected' } as const, null as string | null)
const sessions = atom({ plugin: 'tamaclaudchi', key: 'sessions' } as const, [] as TamaSession[])
const agents = atom({ plugin: 'tamaclaudchi', key: 'agents' } as const, null as { id: string; list: Agent[] } | null)
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
const showSpend = atom({ plugin: 'tamaclaudchi', key: 'showSpend' } as const, false)
const modVersion = atom({ plugin: 'tamaclaudchi', key: 'version' } as const, '')
const graveQuery = atom({ plugin: 'tamaclaudchi', key: 'graveQuery' } as const, '')
const showClosed = atom({ plugin: 'tamaclaudchi', key: 'showClosed' } as const, false)
const isOpen = atom({ plugin: 'tamaclaudchi', key: 'isOpen' } as const, false)

// the pane's id, here so the hooks' matchers name it
const PANE = 'tamaclaudchi'

// --- register

// polls and footer frames since start: the timers below count them
let pollCount = 0
let footerTicks = 0

/** Learns this session's id, for the star on its own pet. */
async function learnId($: EngineInterface) {
  const id = await $.session.id()
  await update($, me, () => id)
  if (id) await markRunning($, id)
}

/** One poll: every one while the pane is open or alerts are on, else a few apart. */
async function pollTick($: EngineInterface) {
  const isPaneOpen = await read($, isOpen)
  const ms = everyMs(isPaneOpen)
  if (ms === settings.pollMs || ++pollCount % CLOSED_POLLS === 0) await refresh($, { everyMs: ms })
}

/** The footer's next frame, while any pet runs; dozing faces alone move slower. */
async function footerTick($: EngineInterface) {
  const all = await read($, sessions)
  const live = all.filter(s => s.live)
  if (!live.length) return
  if (live.some(s => s.mood === 'busy' || s.mood === 'needs') || ++footerTicks % DOZE_FRAMES === 0) await update($, footerFrame, n => n + 1)
}

/** Runs /rename here, logging a failure. */
async function renameHere($: EngineInterface, name: string) {
  try {
    await $.command.run({ command: 'rename', args: name })
  } catch (err) {
    $.ui.log(`tamaclaudchi: could not rename: ${String(err)}`)
  }
}

async function openShelf($: EngineInterface, focus: boolean) {
  await update($, isOpen, () => true)
  await refresh($)
  return $.ui.open(focus ? { id: PANE, title: TITLE, focus: true } : { id: PANE, title: TITLE })
}

export const register: Register = (on, options) => {
  applyOptions(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tama', description: 'Open the TamaClaudchi shelf: every session, across folders, as a pet' })
    await update($, me, () => null)
    // kept across a reload, maybe in an older shape: start from the shelf
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
    await update($, renaming, () => null)
    await update($, showClosed, () => false)
    await update($, showSpend, () => false)
    await update($, showMail, () => false)
    await update($, showMailroom, () => false)
    await update($, mailTab, () => null)
    await update($, mailSeen, () => ({}))
    await update($, mailText, () => null)
    await update($, graveQuery, () => '')
    await update($, disk, () => null)
    await update($, sessions, () => [])
    learnId($)
    await update($, modVersion, () => VERSION)
    if (settings.autoOpen) openShelf($, false)
    else refresh($, { everyMs: everyMs(false) })
    pollCount = 0
    $.clock.every(settings.pollMs, () => {
      pollTick($)
    })
    // the footer's faces move; dozing ones alone move slower
    footerTicks = 0
    $.clock.every(FOOTER_FRAME_MS, () => {
      footerTick($)
    })
    return next(e)
  })

  on('command.run', { command: 'tama' }, async ($, e) => {
    await openShelf($, true)
    if (!e.presentation.isFullscreen) $.ui.toast('Shown above the prompt: run /tui fullscreen (or set "tui": "fullscreen" in settings) to dock it on the right.', { timeoutMs: 8000 })
    return { text: 'TamaClaudchi shelf opened.' }
  })

  on('session.receive', async ($, e, next) => {
    const at = e.text.indexOf(RENAME_TAG)
    if (e.origin.kind !== 'peer' || e.origin.plugin !== 'tamaclaudchi' || at < 0) return next(e)
    const name = cleanName(e.text.slice(at + RENAME_TAG.length).split('\n')[0]!)
    // queued for when the session is idle: not awaited, as this delivery waits on the hook
    if (name) renameHere($, name)
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


// --- players

// Pets playing frames into their Rasters, by key: one animation at a time per pet.

/** Paints one frame into a Raster; a pane that no longer draws it denies the blit, which stops the player. */
async function blitFrame($: EngineInterface, key: string, cells: string, stop: () => void) {
  const r = await $.ui.blit({ requestId: PANE, key, cells })
  if (r.deny) stop()
}

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
    blitFrame($, key, cells, stop)
    if (isLast) stop()
  })
  const entry = { cancel: stop }
  playing.set(key, entry)
}

// --- shared

// One session reads the shelf for the whole machine and shares it in a file under
// ~/.claude/tamaclaudchi/; the others follow it while its lease holds (see DEVELOPING.md).

// The shelf file as last parsed, kept while its mtime and size hold; and the
// text this session last wrote there.
let last: { mtimeMs: number; size: number; value: Shelf } | null = null
let written = ''

/** The shelf another session read, while its lease holds; null: this session reads for itself. */
export async function followed($: EngineInterface, paths: Paths, mine: string | null, now: number, periodMs: number): Promise<Shelf | null> {
  let lease: Lease
  try {
    const text = await $.fs.read(paths.lease)
    lease = JSON.parse(text) as Lease
  } catch {
    return null // none yet, or caught mid-write: read for yourself this once
  }
  if (lease?.schema !== SCHEMA || lease.by === mine || now - lease.at > LEASE_POLLS * lease.everyMs || lease.everyMs > periodMs) return null
  const st = await $.fs.stat(paths.shelf).catch(() => null)
  if (!st || st.kind !== 'file') return last?.value ?? null
  if (!last || last.mtimeMs !== st.mtimeMs || last.size !== st.size) {
    try {
      const text = await $.fs.read(paths.shelf)
      const value = JSON.parse(text) as Shelf & { schema?: number }
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
export async function share($: EngineInterface, paths: Paths, sessionsJson: string, used: Disk | null) {
  const text = `{"schema":${SCHEMA},"disk":${JSON.stringify(used)},"sessions":${sessionsJson}}`
  if (text === written) return
  const isFirst = !written
  await $.fs.write(paths.shelf, text).catch(() => undefined)
  written = text
  // what the shelf shows of every session (names, folders) is for this user alone
  if (isFirst) await $.process.run(['chmod', '700', paths.dir]).catch(() => undefined)
}

// --- alerts

// Toasts, and one desktop notification, when a pet starts to need you (or finishes).

// Each running pet's mood at the last poll; null before the first (old news).
let before: Map<string, Mood> | null = null

export async function announce($: EngineInterface, shelf: TamaSession[], mine: string | null, isReader: boolean) {
  const prev = before
  before = new Map(shelf.filter(s => s.live).map(s => [s.id, s.mood]))
  if (settings.alerts === 'off') return
  const { needs, done } = news(shelf, prev)
  if (!needs.length && !done.length) return
  // your own prompt is in front of you here: the toast is for the others
  for (const s of needs) if (s.id !== mine) $.ui.toast(`▲ ${petName(s)} needs you${s.live?.waitingFor ? `: ${s.live.waitingFor}` : ''}`)
  for (const s of done) if (s.id !== mine) $.ui.toast(`✓ ${petName(s)} has finished and waits for you`)
  if (!isReader) return
  if (settings.alerts === 'toast and notification') {
    const lines = [
      needs.length ? `${needs.length === 1 ? `${petName(needs[0]!)} needs` : `${needs.length} pets need`} you${needs.length > 1 ? `: ${names(needs)}` : needs[0]!.live?.waitingFor ? `: ${needs[0]!.live!.waitingFor}` : ''}` : '',
      done.length ? `${done.length === 1 ? `${petName(done[0]!)} has` : `${names(done)} have`} finished` : '',
    ].filter(Boolean)
    await $.ui.notify(lines.join('\n'), { title: 'TamaClaudchi' }).catch(() => undefined)
  }
}

// --- mailfx

// A new message between sessions, played on the shelf: a letter thrown, a letter caught.

// Each pet's ends of messages at the last poll; null before the first (old news).
let seen: Set<string> | null = null

/** Plays every message new since the last poll on its pets' cards. */
export function playMail($: EngineInterface, shelf: TamaSession[], now: number) {
  const { ends, fresh } = newMail(shelf, seen, now)
  seen = ends
  if (!fresh.length) return
  const looks = outfits(shelf)
  for (const { s, role } of fresh) {
    const o = looks.get(s.id)!
    const look = { faded: isAsleep(s, now), halo: !s.live, sad: isSad(s, now, settings.sadMs) }
    playOnce($, `pet-${s.id}`, mailFrames(o, look, role), petRest(o, look).cells, MAIL_FRAME_MS)
  }
}

// --- shelf

// Reads the transcripts, the live registry, git and conversations into the shelf.

// How many times API calls have been read, and each pet's spend as of then.
let callsRead = 0
let spent: { key: string; byId: Map<string, Spend> } = { key: '', byId: new Map() }

export async function claudeDir($: EngineInterface): Promise<string> {
  const configDir = await $.env.get('CLAUDE_CONFIG_DIR')
  if (configDir) return configDir
  const home = await $.env.get('HOME')
  return `${home}/.claude`
}

// The process table, read once for a poll's checks; null where ps fails.
let procs: Promise<Map<number, Proc> | null> | null = null
/** The next check reads the process table again (a poll, a kill). */
export const forgetProcesses = () => { procs = null }

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
    const m = PS_LINE.exec(l)
    if (m) out.set(Number(m[1]), { ppid: Number(m[2]), start: m[3]! })
  }
  return out
}

/** Whether a pid still runs and is still the process the registry saw start. */
export async function isRunning($: EngineInterface, pid: number, procStart: string | null): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) return false
  let stat = ''
  if (procStart) stat = await $.fs.read(`/proc/${pid}/stat`).catch(() => '')
  if (!stat) {
    const hasPid = await $.fs.exists(`/proc/${pid}`)
    if (hasPid) return true
    const hasProc = await $.fs.exists('/proc/self')
    if (hasProc) return false
    // no /proc (macOS): the process table
    const table = await processes($)
    if (!table) {
      const probe = await $.process.run(['kill', '-0', String(pid)]).catch(() => null)
      return probe?.exitCode === 0
    }
    const p = table.get(pid)
    return !!p && (!procStart || !LSTART.test(procStart) || sameStart(p.start, procStart))
  }
  // the start time is field 22; the name before it, in parentheses, may hold spaces
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] === procStart
}

/** Whether a pid's start time can be checked here (/proc, or ps), so a reused pid is told apart. */
export async function canTellApart($: EngineInterface, procStart: string | null): Promise<boolean> {
  if (!procStart) return false
  const hasProc = await $.fs.exists('/proc/self')
  if (hasProc) return true
  if (!LSTART.test(procStart)) return false
  const table = await processes($)
  return !!table
}

/** A process's parent: from /proc, or the process table; 0 when unknown. */
export async function parentOf($: EngineInterface, pid: number): Promise<number> {
  const stat = await $.fs.read(`/proc/${pid}/stat`).catch(() => '')
  if (stat) return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]) || 0
  const table = await processes($)
  return table?.get(pid)?.ppid ?? 0
}

// this machine, as the registry names it, read once: a pid means something only on its own machine
let machine: Promise<{ key: string; domain: string | null }> | null = null

/** This machine, read once. */
function machineOf($: EngineInterface) {
  if (!machine) machine = readMachine($)
  return machine
}

async function readMachine($: EngineInterface): Promise<{ key: string; domain: string | null }> {
  const r = await $.process.run(['sh', '-c', MACHINE_SCRIPT]).catch(() => null)
  return r ? machineFrom(r.stdout) : { key: 'local', domain: null }
}

/** Running sessions by id, from Claude Code's registry; one on another machine is marked elsewhere and left alone. */
export async function readLive($: EngineInterface): Promise<Map<string, Live>> {
  const claudeRoot = await claudeDir($)
  const dir = `${claudeRoot}/sessions`
  const { domain } = await machineOf($)
  const out = new Map<string, Live>()
  const seenIds = new Set<string>()
  forgetProcesses()
  const entries = await $.fs.list(dir).catch(() => [])
  for (const f of entries) {
    if (f.kind !== 'file' || !f.name.endsWith('.json')) continue
    seenIds.add(f.name)
    const stamp = `${f.mtimeMs}:${f.size}`
    let e = registry.get(f.name)
    if (e?.stamp !== stamp) {
      try {
        const text = await $.fs.read(`${dir}/${f.name}`)
        const reg = JSON.parse(text)
        const isElsewhere = !!domain && typeof reg.pidDomain === 'string' && reg.pidDomain !== domain
        e = {
          stamp, id: typeof reg.sessionId === 'string' ? reg.sessionId : null, hasEnded: false,
          updatedMs: typeof reg.updatedAt === 'number' ? reg.updatedAt : 0,
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
      if (Date.now() - e.updatedMs < settings.windowMs) out.set(e.id, joined(out.get(e.id), e.live))
      continue
    }
    const isAlive = await isRunning($, e.live.pid, e.live.procStart)
    if (!isAlive) {
      e.hasEnded = true
      continue
    }
    out.set(e.id, joined(out.get(e.id), e.live))
  }
  for (const name of registry.keys()) if (!seenIds.has(name)) registry.delete(name)
  return out
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
  } else {
    // no find that prints (not GNU): a listing per folder
    const dirs = await $.fs.list(root).catch(() => [])
    for (const dir of dirs) {
      if (dir.kind !== 'dir') continue
      const inDir = await $.fs.list(`${root}/${dir.name}`).catch(() => [])
      for (const f of inDir) {
        const id = f.name.slice(0, -'.jsonl'.length)
        if (f.kind !== 'file' || !f.name.endsWith('.jsonl') || !SESSION_ID.test(id)) continue
        if (now - f.mtimeMs > settings.windowMs && !live.has(id)) continue
        files.push({ path: `${root}/${dir.name}/${f.name}`, id, mtimeMs: f.mtimeMs, size: f.size, stamp: `${f.mtimeMs}:${f.size}` })
      }
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files.filter((f, i) => i < CANDIDATES || live.has(f.id))
}

/** Parses a batch of changed transcripts into the cache, each read on from where it was. */
async function readBatch($: EngineInterface, batch: Transcript[], now: number) {
  const byPath = new Map(batch.map(f => [f.path, f]))
  const res = await $.process.run(['sh', '-c', READ_SCRIPT, 'sh', ...batch.flatMap(f => [f.path, String(readFrom(cache.get(f.path), f))])], { timeoutMs: 120_000 })
    .catch((err: unknown) => {
      $.ui.log(`tamaclaudchi: could not read ${batch.length} transcripts: ${String(err)}`)
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
      readCalls(head, calls)
      callsRead++
      const mail = isReadOn ? c.mail : new Map<string, MailFact>()
      readMail(head, mail)
      const born = Date.parse(facts.timestamp ?? '')
      const s = parseSession(f.id, chunk.slice(sep + 2), facts.aiTitle ?? null, f.mtimeMs, now, Number.isNaN(born) ? null : born)
      const model = s.model ?? facts.model ?? null
      // its own folder, where it was born: what its colour and git go by
      const cwd = facts.cwd || s.cwd
      const looks = { cwd, repo: repoOf(cwd || f.id), bornBranch: facts.gitBranch || null }
      // your last prompt, however far back: the tail may hold none
      const lastPromptMs = Date.parse(facts.lastPrompt ?? '') || null
      cache.set(f.path, {
        stamp: f.stamp, size: f.size, facts, calls, mail,
        session: { ...s, ...looks, title: facts.customTitle ?? s.title, model, path: f.path, lastPromptMs },
      })
    } catch (err) {
      $.ui.log(`tamaclaudchi: skipped ${f.path}: ${String(err)}`)
    }
  }
}

let isReading = false
// asked for while a read ran (after a kill, a hatch, a clean): read again once it ends
let askedAgain: { everyMs?: number } | null = null
// the shelf as last drawn, and when
let drawn = { text: '', at: 0 }
// this session held the lease at its last poll
let isLeading = false

/** Brings the shelf up to date, read here or taken from the reading session; `everyMs` is how often this one polls. */
export async function refresh($: EngineInterface, opts: { everyMs?: number } = {}) {
  if (isReading) {
    askedAgain = opts
    return
  }
  isReading = true
  try {
    // a loop, not a call to itself: the directory's scan follows no cycles
    for (let next: { everyMs?: number } | null = opts; next; ) {
      await readOnce($, next)
      next = askedAgain
      askedAgain = null
    }
  } finally {
    isReading = false
  }
}

/** One pass of refresh. */
async function readOnce($: EngineInterface, opts: { periodMs?: number }) {
  try {
    const now = await $.clock.now()
    const dir = await claudeDir($)
    const mine = await read($, me)
    const periodMs = opts.everyMs ?? settings.pollMs
    const host = await machineOf($)
    const paths = sharedPaths(dir, host.key)
    const other = await followed($, paths, mine, now, periodMs)
    // taking over: claim the lease before a first read that may take seconds
    if (!other && mine && !isLeading) {
      takeOver()
      await claim($, paths, { by: mine, at: now, everyMs: periodMs })
    }
    isLeading = !other && !!mine
    let found: { shelf: TamaSession[]; used: Disk | null } = other ? { shelf: other.sessions, used: other.disk } : { shelf: [], used: null }
    if (!other) found = await readShelf($, dir, now)
    const { shelf, used } = found
    const text = JSON.stringify(shelf)
    // without its id yet, a session reads for itself; what sessions said never goes in the shared file
    const isReader = !other && !!mine
    if (isReader) {
      const at = await $.clock.now()
      await claim($, paths, { by: mine, at, everyMs: periodMs })
      await share($, paths, JSON.stringify(shelf.map(s => ({ ...s, recent: [] }))), used)
    }
    if (text !== drawn.text || now - drawn.at > REDRAW_MS) {
      drawn = { text, at: now }
      await update($, sessions, () => shelf)
    }
    const shownDisk = await read($, disk)
    if (used && JSON.stringify(used) !== JSON.stringify(shownDisk)) await update($, disk, () => used)
    await announce($, shelf, mine, isReader)
    playMail($, shelf, now)

    // the opened pet said something new: read its conversation again
    const pick = await read($, selected)
    const opened = pick ? shelf.find(s => s.id === pick) : undefined
    const shownConvo = await read($, convo)
    if (opened && shownConvo?.mtimeMs !== opened.mtimeMs) await readConvo($, opened)
    if (opened) await readAgents($, opened)
    // a message sent or received since: read the texts the page shows again
    if (opened) await readMailText($, [opened])
    else {
      const isMailroom = await read($, showMailroom)
      if (isMailroom) await readMailText($, shelf)
    }
  } catch (err) {
    $.ui.log(`tamaclaudchi: could not read the shelf: ${String(err)}`)
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
  for (let i = 0; i < grown.length; i += BATCH) await readBatch($, grown.slice(i, i + BATCH), now)
  for (let i = 0; i < fresh.length; i += FRESH_BATCH) await readBatch($, fresh.slice(i, i + FRESH_BATCH), now)
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
  // no transcript yet: an egg from its registry, openable at once
  const onShelf = new Set(shelf.map(s => s.id))
  for (const [id, l] of live) {
    if (onShelf.has(id) || !SESSION_ID.test(id) || !l.cwd) continue
    const born = l.startedMs ?? now
    shelf.push(withLive({ ...parseSession(id, '', null, born, now, born), cwd: l.cwd, repo: repoOf(l.cwd) }, l))
  }
  // who messaged whom: each pet's messages, both ends named where known
  const mail = mailEdges(shelf.map(s => ({ id: s.id, facts: cache.get(s.path)?.mail.values() })), live, now - settings.windowMs)
  for (const s of shelf) s.mail = mail.get(s.id) ?? null
  const working = await readSubagents($, shelf.filter(s => s.live))
  const subCalls = await readSubagentCalls($, shelf)
  if (now - diskAt > DISK_MS) await readDisk($, root, shelf, now)
  const slots = await stickyLooks($, shelf, now)
  for (const s of shelf) {
    s.subagents = working.get(s.id)?.working ?? 0
    s.subagentsEver = working.get(s.id)?.ever ?? 0
    s.disk = diskById.get(s.id) ?? null
    s.skinSlot = slots.repo[repoKey(s)]?.[0] ?? null
    s.itemSlot = slots.item[itemKey(s)]?.[0] ?? null
  }
  // each API call counts once, to the oldest pet holding it (forks and resumes carry their parent's)
  const byAge = [...shelf].sort((a, b) => (a.bornMs ?? a.mtimeMs) - (b.bornMs ?? b.mtimeMs))
  const key = `${callsRead}|${lastDays(now, 1)[0]}|${windowDays()}|${byAge.map(s => s.path).join('|')}`
  if (key !== spent.key) {
    spent = { key, byId: new Map() }
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

/** Each pet's subagents' API calls: listed every poll while it runs, each read on from where it was. */
async function readSubagentCalls($: EngineInterface, shelf: TamaSession[]): Promise<Map<string, Map<string, Call>>> {
  const owner = new Map<string, string>()
  const files: Transcript[] = []
  for (const s of shelf) {
    if (!s.path) continue
    const dir = `${dirOf(s)}/subagents`
    let list = s.live ? undefined : closedSubs.get(dir)
    if (!list) {
      const entries = await $.fs.list(dir).catch(() => [])
      list = entries
        .filter(f => f.kind === 'file' && AGENT_FILE.test(f.name))
        .map(f => ({ path: `${dir}/${f.name}`, id: s.id, mtimeMs: f.mtimeMs, size: f.size, stamp: `${f.mtimeMs}:${f.size}` }))
      if (s.live) closedSubs.delete(dir)
      else closedSubs.set(dir, list)
    }
    for (const f of list) { files.push(f); owner.set(f.path, s.id) }
  }
  for (const path of subCache.keys()) if (!owner.has(path)) { subCache.delete(path); callsRead++ }
  const dirs = new Set(shelf.filter(s => s.path).map(s => `${dirOf(s)}/subagents`))
  for (const dir of closedSubs.keys()) if (!dirs.has(dir)) closedSubs.delete(dir)
  const stale = files.filter(f => subCache.get(f.path)?.stamp !== f.stamp)
  for (let i = 0; i < stale.length; i += BATCH) {
    const batch = stale.slice(i, i + BATCH)
    const res = await $.process.run(['sh', '-c', USAGE_SCRIPT, 'sh', ...batch.flatMap(f => [f.path, String(readFrom(subCache.get(f.path), f))])], { timeoutMs: 120_000 }).catch(() => null)
    if (!res) continue
    const byPath = new Map(batch.map(f => [f.path, f]))
    for (const chunk of res.stdout.split('\x1e').slice(1)) {
      const nl = chunk.indexOf('\n')
      const f = byPath.get(chunk.slice(0, nl))
      if (!f) continue
      const c = subCache.get(f.path)
      const calls = c && f.size >= c.size ? c.calls : new Map<string, Call>()
      readCalls(chunk.slice(nl + 1), calls)
      callsRead++
      subCache.set(f.path, { stamp: f.stamp, size: f.size, calls })
    }
  }
  const out = new Map<string, Map<string, Call>>()
  for (const [path, c] of subCache) {
    const id = owner.get(path)!
    const calls = out.get(id) ?? new Map<string, Call>()
    for (const [msg, call] of c.calls) calls.set(msg, call)
    out.set(id, calls)
  }
  return out
}

/** Each repo's colour and branch's item, kept in the store so every session draws a pet alike. */
async function stickyLooks($: EngineInterface, shelf: TamaSession[], now: number): Promise<Slots> {
  const stored = await $.store.get(SLOTS_KEY).catch(() => undefined)
  const kept = (stored ?? {}) as Partial<Slots>
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
let diskWhole: Disk | null = null

/** Measures what Claude keeps on disk, as a whole and pet by pet. */
async function readDisk($: EngineInterface, root: string, shelf: TamaSession[], now: number) {
  diskAt = now
  const pets = shelf.filter(s => s.path).map(s => ({ id: s.id, key: s.path.slice(root.length + 1, -'.jsonl'.length) }))
  const res = await $.process.run(['sh', '-c', DISK_SCRIPT, 'sh', root, ...pets.map(p => p.key)], { timeoutMs: 30_000 }).catch(() => null)
  if (!res) return
  const [head = '', each = ''] = res.stdout.split('\x1f\n')
  const [tempDir = '', ...wholes] = head.split('\n')
  if (!ABS_PATH.test(tempDir)) return
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

/** How many subagents each pet has still at work, and has launched in all, by session id. */
async function readSubagents($: EngineInterface, pets: TamaSession[]): Promise<Map<string, { working: number; ever: number }>> {
  const out = new Map<string, { working: number; ever: number }>()
  const byDir = new Map(pets.filter(s => s.path).map(s => [`${dirOf(s)}/subagents`, s.id]))
  if (!byDir.size) return out
  const res = await $.process.run(['sh', '-c', SUBAGENT_SCRIPT, 'sh', ...byDir.keys()]).catch(() => null)
  for (const chunk of res?.stdout.split('\x1e').slice(1) ?? []) {
    const [dir = '', total = '', ...finished] = chunk.split('\n')
    const id = byDir.get(dir)
    if (id) out.set(id, { working: finished.filter(c => c.trim() === '0').length, ever: Number(total.replace(/^T\s*/, '')) || 0 })
  }
  return out
}

/** The opened pet's conversation, every message whole, from the end of its transcript. */
export async function readConvo($: EngineInterface, s: TamaSession) {
  if (!s.path) return
  const out = await $.process.run(['tail', '-c', String(CONVO_BYTES), s.path]).catch(() => null)
  if (!out || out.exitCode !== 0) return
  const now = await $.clock.now()
  const said = parseSession(s.id, out.stdout, null, s.mtimeMs, now, null, { recent: Infinity, chars: Infinity }).recent
  // another pet may have been opened while this one was read
  const picked = await read($, selected)
  if (picked === s.id) await update($, convo, () => ({ id: s.id, mtimeMs: s.mtimeMs, said }))
}

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
  const picked = await read($, selected)
  if (picked === s.id) await update($, git, () => info)
}

/** The opened pet's subagents: the running ones first, then the newest. */
// The opened pet's subagents' files as last read: unchanged, they are not read again.
let agentsSeen = { id: '', stamp: '' }

export async function readAgents($: EngineInterface, s: TamaSession) {
  if (!s.path) return
  const dir = `${dirOf(s)}/subagents`
  const entries = await $.fs.list(dir).catch(() => [])
  const stamp = entries.map(f => `${f.name}:${f.mtimeMs}:${f.size}`).join('|')
  const shownAgents = await read($, agents)
  if (agentsSeen.id === s.id && agentsSeen.stamp === stamp && shownAgents?.id === s.id) return
  agentsSeen = { id: s.id, stamp }
  const res = await $.process.run(['sh', '-c', AGENTS_SCRIPT, 'sh', dir]).catch(() => null)
  const now = await $.clock.now()
  const list: Agent[] = []
  for (const chunk of res?.stdout.split('\x1e').slice(1) ?? []) {
    const [path = '', mtime = '0', done = '0', modelLine = '', metaLine = ''] = chunk.split('\n')
    let meta: { description?: string; agentType?: string } = {}
    try { meta = JSON.parse(metaLine) } catch {}
    const id = AGENT_ID.exec(path)?.[1]
    if (!id) continue
    list.push({
      id, path, description: meta.description ?? 'a subagent', type: meta.agentType ?? 'agent',
      model: /"model":"([^"]+)"/.exec(modelLine)?.[1] ?? null, isDone: done.trim() !== '0', mtimeMs: Number(mtime) * 1000,
    })
  }
  const running = (a: Agent) => isAgentRunning(a, now)
  list.sort((a, b) => Number(running(b)) - Number(running(a)) || b.mtimeMs - a.mtimeMs)
  // every running one, then the newest finished ones while there is room
  const atWork = list.filter(running).length
  const shown = list.slice(0, Math.max(atWork, AGENTS_SHOWN))
  const picked = await read($, selected)
  if (picked !== s.id) return
  await update($, agents, () => ({ id: s.id, list: shown }))
  // the opened agent wrote more: read its trace again
  const pick = await read($, agentPick)
  const opened = pick ? shown.find(a => a.id === pick) : undefined
  const shownTrace = await read($, trace)
  if (opened && shownTrace?.mtimeMs !== opened.mtimeMs) await readTrace($, opened)
}

/** The text of these pets' messages, read from their transcripts when a page shows them. */
export async function readMailText($: EngineInterface, pets: TamaSession[]) {
  const { withMail, key } = mailRead(pets)
  const shownText = await read($, mailText)
  if (!key || shownText?.key === key) return
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
  const pickedAgent = await read($, agentPick)
  if (!out || out.exitCode !== 0 || pickedAgent !== a.id) return
  await update($, trace, () => ({ id: a.id, mtimeMs: a.mtimeMs, steps: traceOf(out.stdout) }))
}

// --- actions

// The buttons: tmux, messages, rename, kill, clean and resurrect.

/** Runs a command; one that cannot start (no tmux) reads as a failed run. */
async function runCommand($: EngineInterface, argv: string[], opts: { timeoutMs?: number } = {}) {
  return $.process.run(argv, opts).catch((err: unknown) => (
    { exitCode: 127, stdout: '', stderr: String(err), isStdoutTruncated: false, isStderrTruncated: false }
  ))
}

/** Whether `pane` runs `pid`: its own process, or one of that process's parents (its shell). */
async function paneRuns($: EngineInterface, pane: string, pid: number): Promise<boolean> {
  const shown = await runCommand($, ['tmux', 'display-message', '-p', '-t', pane, '#{pane_pid}'])
  const panePid = Number(shown.stdout.trim())
  if (shown.exitCode !== 0 || !panePid) return false
  // up from the pet's process through its parents, a few at most
  for (let p = pid, n = 0; p > 1 && n < 8; n++) {
    if (p === panePid) return true
    p = await parentOf($, p)
  }
  return false
}

/** Opens a pet's page (null: back to the shelf), reading its git, conversation and subagents. */
export async function select($: EngineInterface, id: string | null) {
  await update($, armed, () => null)
  await update($, renaming, () => null)
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
    const isMailroom = await read($, showMailroom)
    if (isMailroom) await readMailText($, list)
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
  const all = await read($, sessions)
  const posts = postsOf(all)
  const threads = threadsOf(posts)
  const t = threads.find(x => x.key === key) ?? threads[0]
  if (t) await markSeen($, t.ends.map(e => e.id))
}

/** Opens the page of every message between the sessions (false: back to the shelf), reading their texts. */
export async function openMailroom($: EngineInterface, isOn: boolean) {
  await update($, showMailroom, () => isOn)
  if (!isOn) return
  await openTab($, null)
  const all = await read($, sessions)
  await readMailText($, all)
}

/** Opens one of the opened pet's subagents on a page of its own (null: back to the pet). */
export async function openAgent($: EngineInterface, id: string | null) {
  await update($, agentPick, () => id)
  const known = await read($, agents)
  const a = id ? known?.list.find(x => x.id === id) : undefined
  const shownTrace = await read($, trace)
  if (a && shownTrace?.id !== a.id) await readTrace($, a)
}

/** Brings the pet's tmux pane forward, or opens its background session. */
export async function jump($: EngineInterface, s: TamaSession) {
  if (!s.live) return
  await markSeen($, [s.id])
  if (s.live.tmux) await jumpTo($, s.live.tmux, s.live.name ?? nameOf(s))
  else if (s.live.job) await attachJob($, s.live.job, s.live.name ?? nameOf(s))
}

/** Opens a background session: `claude attach <job>` in a tmux session of its own, reused; outside tmux, copied. */
async function attachJob($: EngineInterface, job: string, name: string) {
  const client = await clientOf($)
  if (client === null) {
    await copyText($, `claude attach ${job}`, 'Not inside tmux here, so the attach command')
    return
  }
  const tmuxName = `bg-${job}`
  const found = await runCommand($, ['tmux', 'has-session', '-t', `=${tmuxName}`])
  if (found.exitCode !== 0) {
    const made = await runCommand($, ['tmux', 'new-session', '-d', '-s', tmuxName, `claude attach ${job}`])
    if (made.exitCode !== 0) {
      $.ui.toast(`tmux could not open ${name}: ${made.stderr.trim() || 'is tmux installed?'}`)
      return
    }
  }
  await jumpTo($, `${tmuxName}:`, name)
}

/** Switches this session's tmux client to a pane, by its id; outside tmux, copies how to attach. */
async function jumpTo($: EngineInterface, target: string, name: string) {
  const window = target.split('.')[0]!
  const pane = target.includes('%') ? tmuxPane(target) : window
  // switch only the tmux client this session is seen in: outside tmux, another one would be moved
  const client = await clientOf($)
  if (client === null) {
    await copyText($, `tmux attach -t ${shellQuote(window)} \\; select-pane -t ${shellQuote(pane)}`, 'Not inside tmux here, so the attach command')
    return
  }
  const argv = client ? ['tmux', 'switch-client', '-c', client, '-t', pane] : ['tmux', 'switch-client', '-t', pane]
  const switched = await runCommand($, argv)
  if (switched.exitCode !== 0) {
    // its pane is gone, or on another tmux server than this one
    $.ui.toast(`Could not jump to ${name}: ${switched.stderr.trim().split('\n')[0] || 'tmux could not switch to its pane'}.`)
    return
  }
  await runCommand($, ['tmux', 'select-window', '-t', pane])
  await runCommand($, ['tmux', 'select-pane', '-t', pane])
  $.ui.toast(`Attached to ${name}`)
}

/** The tmux client this session shows in: its own (''), an attach's for a --bg session, or null. */
async function clientOf($: EngineInterface): Promise<string | null> {
  const tmuxEnv = await $.env.get('TMUX')
  if (tmuxEnv) return ''
  const mine = await read($, me)
  const pets = await read($, sessions)
  const job = pets.find(s => s.id === mine)?.live?.job
  if (!job) return null
  const ps = await runCommand($, ['ps', '-A', '-o', 'pid=,ppid=,args='])
  const panes = await runCommand($, ['tmux', 'list-panes', '-a', '-F', '#{pane_pid} #{session_id}'])
  const clients = await runCommand($, ['tmux', 'list-clients', '-F', '#{client_activity} #{session_id} #{client_name}'])
  if (ps.exitCode !== 0 || panes.exitCode !== 0 || clients.exitCode !== 0) return null
  return attachClient(job, ps.stdout, panes.stdout, clients.stdout)
}

/** Copies `text`, as `<what> is on your clipboard`; where nothing was copied, the toast shows the text. */
async function copyText($: EngineInterface, text: string, what: string) {
  const copied = await $.ui.copy({ text })
  if (copied.isCopied) $.ui.toast(`${what} is on your clipboard.`)
  else $.ui.toast(`${what} could not be copied (${copied.reason}): ${text}`)
}

/** Brings a closed session back: `claude --resume` in a tmux session of its own; without tmux, copied. */
export async function resurrect($: EngineInterface, s: TamaSession) {
  // it may be back already, since the shelf was read: go to it instead
  const live = await readLive($)
  const now = live.get(s.id)
  if (now) {
    if (now.tmux) await jumpTo($, now.tmux, now.name ?? nameOf(s))
    else if (now.job && !now.isElsewhere) await attachJob($, now.job, now.name ?? nameOf(s))
    else $.ui.toast(`${nameOf(s)} is running already${now.isElsewhere ? ', on another machine' : ''}.`)
    return
  }
  // tmux takes neither '.' nor ':' in a session name
  const name = `${s.repo.replace(/[.:\s]/g, '-').slice(0, 24)}-${s.id.slice(0, 4)}`
  const made = await runCommand($, ['tmux', 'new-session', '-d', '-P', '-F', TMUX_TARGET, '-s', name, '-c', s.cwd, `claude --resume ${s.id}`,
  ])
  if (made.exitCode === 0) {
    const target = made.stdout.trim()
    if (target) await jumpTo($, target, name)
    $.ui.toast(`${WING} ${nameOf(s)} is back, in tmux session ${name}.`)
    refresh($)
    return
  }
  const has = await runCommand($, ['tmux', 'has-session', '-t', `=${name}`])
  if (has.exitCode === 0) await jumpTo($, `${name}:`, name) // brought back already: go to it
  else await copyResume($, s)
}

/** Hatches a pet: `claude` typed into a new tmux session in `input`, named after the folder, then goes there. */
export async function spawnPet($: EngineInterface, input: string) {
  const homeEnv = await $.env.get('HOME')
  const home = homeEnv ?? ''
  const dir = input.trim().replace(HOME_TILDE, home) || home
  const dirStat = await $.fs.stat(dir).catch(() => null)
  if (dirStat?.kind !== 'dir') {
    $.ui.toast(`No folder at ${dir}.`)
    return
  }
  const base = (dir.split('/').filter(Boolean).pop() ?? '').replace(/[^\w-]/g, '-') || 'pet'
  const listed = await runCommand($, ['tmux', 'list-sessions', '-F', '#{session_name}'])
  const taken = new Set(listed.exitCode === 0 ? listed.stdout.split('\n') : [])
  let name = base
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}`
  const made = await runCommand($, ['tmux', 'new-session', '-d', '-P', '-F', TMUX_TARGET, '-s', name, '-c', dir])
  const target = made.stdout.trim()
  if (made.exitCode !== 0 || !target) {
    $.ui.toast(`tmux could not start a session: ${made.stderr.trim() || 'is tmux installed?'}`)
    return
  }
  await runCommand($, ['tmux', 'send-keys', '-t', tmuxPane(target), 'claude', 'Enter'])
  await update($, isSpawning, () => false)
  await jumpTo($, target, name)
  $.ui.toast(`A new pet is hatching in tmux session ${name}.`)
  refresh($)
}

/** Ends a pet: its tmux session or pane, and its process as a backstop; never this session's own. */
export async function killPet($: EngineInterface, s: TamaSession) {
  await update($, armed, () => null)
  // never this session's own pet, nor one on another machine, whose pid means nothing here
  const mine = await read($, me)
  if (!s.live || s.live.isElsewhere || s.id === mine) return
  const { pid, procStart, tmux } = s.live
  // a claude started from this session's shell shares its pane
  const myPane = await $.env.get('TMUX_PANE')
  if (tmux && tmuxPane(tmux) === myPane) {
    $.ui.toast(`${nameOf(s)} runs in this session's own tmux pane: close it from there.`)
    return
  }
  const done: string[] = []
  // its pane, if it still runs this pet: a restarted server reuses pane ids
  let isPetPane = false
  if (tmux) isPetPane = await paneRuns($, tmuxPane(tmux), pid)
  if (isPetPane) {
    // the pane's session by id: its registry name may be stale
    const pane = tmuxPane(tmux)
    const where = await runCommand($, ['tmux', 'display-message', '-p', '-t', pane, '#{session_id} #{session_name}'])
    const [sessionId = '', ...rest] = where.exitCode === 0 ? where.stdout.trim().split(' ') : []
    if (sessionId.startsWith(TMUX_SESSION_SIGIL)) {
      const session = rest.join(' ')
      const panes = await runCommand($, ['tmux', 'list-panes', '-s', '-t', sessionId, '-F', '#{pane_id}'])
      const count = panes.exitCode === 0 ? panes.stdout.split('\n').filter(Boolean).length : 0
      if (count === 1) {
        await runCommand($, ['tmux', 'kill-session', '-t', sessionId])
        done.push(`tmux session ${session}`)
      } else {
        await runCommand($, ['tmux', 'kill-pane', '-t', pane])
        done.push(`its pane (tmux ${session} has ${count} panes, so the others stay)`)
      }
    }
  }
  // TERM, then KILL, only while the pid is provably still that session's (its start time)
  forgetProcesses()
  let isSure = await canTellApart($, procStart)
  if (isSure) isSure = await isRunning($, pid, procStart)
  if (isSure) {
    await runCommand($, ['kill', '-TERM', String(pid)])
    await runCommand($, ['sleep', '2'])
    forgetProcesses()
    const isStill = await isRunning($, pid, procStart)
    if (isStill) await runCommand($, ['kill', '-KILL', String(pid)])
    done.push('its process')
  }
  if (!done.length) {
    $.ui.toast(`Could not kill ${nameOf(s)}: its tmux pane is not where the registry says, and its process cannot be told apart from a newer one.`)
    return
  }
  $.ui.toast(`✝ ${nameOf(s)} is gone: killed ${done.join(' and ')}.`)
  await select($, null)
  refresh($)
}

/** Frees a closed pet's temp folder, never its transcript; refused for a running or recent pet, or an unexpected path. */
async function cleanOne($: EngineInterface, s: TamaSession, tempDir: string, running: Set<string>): Promise<'cleaned' | 'running' | 'unsafe' | string> {
  const [project = '', file = ''] = s.path.split('/').slice(-2)
  const isSafe = TEMP_DIR.test(tempDir) && PROJECT_DIR.test(project) && !DOTS_ONLY.test(project)
    && file === `${s.id}.jsonl` && SESSION_ID.test(s.id)
  if (!isSafe) return 'unsafe'
  // resurrected since, or running unregistered (an older Claude Code)
  if (s.live || running.has(s.id) || Date.now() - s.mtimeMs < RECENT_WRITE_MS) return 'running'
  const res = await runCommand($, ['rm', '-rf', '--', `${tempDir}/${project}/${s.id}`], { timeoutMs: 120_000 })
  return res.exitCode === 0 ? 'cleaned' : res.stderr.trim().split('\n')[0] || 'rm failed'
}

export async function cleanTemp($: EngineInterface, s: TamaSession) {
  await update($, armed, () => null)
  const d = await read($, disk)
  if (s.live) {
    $.ui.toast('It is running: its temp folder stays.')
    return
  }
  let done = 'unsafe'
  if (d) {
    const live = await readLive($)
    done = await cleanOne($, s, d.tempDir, new Set(live.keys()))
  }
  $.ui.toast(done === 'cleaned' ? `Cleaned ${nameOf(s)}: ${bytes(s.disk?.tempKb ?? 0)} freed. Its transcript stays.`
    : done === 'running' ? `${nameOf(s)} may still be running: its temp folder stays.`
    : done === 'unsafe' ? 'Not a temp folder I may delete.'
    : `Could not clean it all: ${done}`)
  measureDiskSoon()
  refresh($)
}

/** Cleans every closed pet's temp folder at once, with the same care as one. */
export async function cleanAll($: EngineInterface, closed: TamaSession[]) {
  await update($, armed, () => null)
  const d = await read($, disk)
  if (!d) return
  const live = await readLive($)
  const running = new Set(live.keys())
  let kb = 0, n = 0, kept = 0, failed = 0
  for (const s of cleanable(closed)) {
    const done = await cleanOne($, s, d.tempDir, running)
    if (done === 'cleaned') { kb += s.disk?.tempKb ?? 0; n++ } else if (done === 'running' || done === 'unsafe') kept++
    else failed++
  }
  $.ui.toast(`Cleaned ${n} temp folder${n === 1 ? '' : 's'}: ${bytes(kb)} freed.`
    + `${kept ? ` ${kept} left alone (written to lately, or running).` : ''}${failed ? ` ${failed} could not be deleted in full.` : ''} Transcripts stay.`)
  measureDiskSoon()
  refresh($)
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
  if (was !== id) await $.ui.focus({ requestId: PANE, key: 'rename-name' }).catch(() => undefined)
}

/** Leaves this session's marker. */
async function markRunning($: EngineInterface, id: string) {
  if (!SESSION_ID.test(id)) return
  const claudeRoot = await claudeDir($)
  await runCommand($, ['mkdir', '-p', `${claudeRoot}/tamaclaudchi`])
  await $.fs.write(markerOf(claudeRoot, id), '').catch(() => undefined)
}

/** Whether a running session runs the mod: its marker was left since its process started. */
async function runsMod($: EngineInterface, s: TamaSession): Promise<boolean> {
  if (!SESSION_ID.test(s.id)) return false
  const claudeRoot = await claudeDir($)
  const st = await $.fs.stat(markerOf(claudeRoot, s.id)).catch(() => null)
  return !!st && st.kind === 'file' && st.mtimeMs >= (s.live?.startedMs ?? 0)
}

/** Deletes the markers of sessions no longer running; the reading session does it now and then. */
async function pruneMarkers($: EngineInterface, dir: string, live: Map<string, Live>) {
  const entries = await $.fs.list(`${dir}/tamaclaudchi`).catch(() => [])
  for (const f of entries) {
    const id = f.name.startsWith('running-') ? f.name.slice('running-'.length) : ''
    if (f.kind === 'file' && SESSION_ID.test(id) && !live.has(id)) await runCommand($, ['rm', '-f', `${dir}/tamaclaudchi/${f.name}`])
  }
}
let prunedAt = 0

/** Renames a pet as `/rename` would: here, by asking another running one, or in a closed one's transcript. */
export async function renamePet($: EngineInterface, s: TamaSession, text: string) {
  await update($, renaming, () => null)
  const name = cleanName(text)
  if (!name || name === nameOf(s)) return
  const mine = await read($, me)
  if (s.id === mine) {
    await $.command.run({ command: 'rename', args: name })
  } else if (s.live?.isElsewhere) {
    $.ui.toast(`${nameOf(s)} runs on another machine: rename it there.`)
    return
  } else if (s.live) {
    // without the mod, its model would read the rename
    const isModded = await runsMod($, s)
    if (!isModded) {
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
    // running again since? then its transcript is its own to write
    const live = await readLive($)
    if (live.has(s.id)) {
      $.ui.toast(`${nameOf(s)} is running again: rename it once the shelf shows it awake.`)
      return
    }
    const claudeRoot = await claudeDir($)
    const projects = `${claudeRoot}/projects/`
    const isSafe = SESSION_ID.test(s.id) && s.path.startsWith(projects) && !s.path.includes('/../')
      && s.path.endsWith(`/${s.id}.jsonl`)
    const line = JSON.stringify({ type: 'custom-title', customTitle: name, sessionId: s.id })
    let isWritten = false
    if (isSafe) {
      const wrote = await runCommand($, ['sh', '-c', APPEND_LINE_SCRIPT, 'sh', line, s.path])
      isWritten = wrote.exitCode === 0
    }
    if (!isWritten) {
      $.ui.toast(`Could not rename ${nameOf(s)}: its transcript cannot be written.`)
      return
    }
  }
  $.ui.toast(`${nameOf(s)} is now ${name}.`)
  refresh($)
}

export async function message($: EngineInterface, s: TamaSession, text: string) {
  if (!text.trim() || s.live?.isElsewhere) return
  const sent = await $.session.send({ to: { sessionId: s.id }, text: text.trim() })
  if (sent.isDelivered) await markSeen($, [s.id])
  $.ui.toast(sent.isDelivered ? `Sent to ${nameOf(s)}.` : `Not sent: ${sent.reason}`)
}

// --- footer

// The footer right of the prompt: every running pet as a little face.

// The values this module reads. The engine's scan wants them declared in each
// module that uses them; one plugin and key is one value.

export async function renderFooter($: EngineInterface, e: RenderInput<'SessionMode'>, next: Next) {
  const all = await read($, sessions)
  const list = all.filter(s => s.live)
  if (!list.length) return next(e)
  const { Box, Text } = $.ui.resolve(e)
  // the shelf's colours, at full strength for 16-colour terminals
  const looks = outfits(all)
  const tint = (s: TamaSession) => vivid(looks.get(s.id)!.skin.body)
  const frame = await read($, footerFrame)
  const busy = list.filter(s => s.mood === 'busy')
  const asking = list.filter(s => s.mood === 'needs')
  const asleep = list.filter(s => s.mood !== 'busy' && s.mood !== 'needs')
  const awake = [...asking, ...busy].slice(0, AWAKE_SHOWN)
  const more = asking.length + busy.length - awake.length
  const group = (s: TamaSession) => `tama-face-${s.id}`.slice(0, 64)
  return (
    <Box>
      {e.props.modes.length ? <Text dimColor>{e.props.modes.join(' & ')} · </Text> : null}
      {awake.length ? (
        <Box position="relative" width={NAME_W} height={1}>
          {awake.map(s => (
            <Box position="absolute" top={0} right={1} display="none" hover={{ scope: group(s), display: 'flex' }}>
              <Text color={tint(s)}>{clip(petName(s), NAME_W - 2)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {awake.map((s, i) => s.mood === 'needs'
        ? <Text key={`face-${s.id}`} hover={{ scope: group(s), bold: true }}><Text color={tint(s)}>{ASKING}</Text><Text bold color={RED}>{frame % 2 ? ' ' : '!'}</Text> </Text>
        // each waves on its own beat
        : <Text key={`face-${s.id}`} color={tint(s)} hover={{ scope: group(s), bold: true }}>{WAVE[(frame + i) % 2]} </Text>)}
      {more ? <Text dimColor>+{more} </Text> : null}
      {asleep.length ? <Text dimColor>{awake.length ? '· ' : ''}{DOZE[frame % 2]} ×{asleep.length}</Text> : null}
    </Box>
  )
}

// --- view

// The pane: the shelf, the graveyard, the spend and messages pages, and a pet's page.

// one-cell glyphs only, but for these emoji every terminal draws two cells wide
const HOME = '🏠' // attach: its tmux pane, or its background session
const LETTER = '💌' // a message between sessions (✉ is text by default)
type View = { list: TamaSession[]; mine: string | null; looks: Map<string, Outfit>; now: number; cols: number; seen: Record<string, number> }

export async function renderPane($: EngineInterface, e: PaneEvent) {
  const list = await read($, sessions)
  const pick = await read($, selected)
  const mine = await read($, me)
  const seenAt = await read($, mailSeen)
  const v: View = {
    list, mine, looks: outfits(list), now: Date.now(), cols: Math.max(CARD_W, e.props.bodyColumns), seen: seenAt,
  }
  const chosen = pick ? list.find(s => s.id === pick) : undefined
  if (!chosen) return shelfPage($, e, v)
  const agentId = await read($, agentPick)
  const known = await read($, agents)
  const agent = agentId && known?.id === chosen.id ? known.list.find(a => a.id === agentId) : undefined
  if (agent) return agentPage($, e, v, chosen, agent)
  return petPage($, e, v, chosen, known?.id === chosen.id ? known.list : [])
}

/** What both pages draw a pet with. */
function kit($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text } = $.ui.resolve(e)
  const art = (o: Outfit, key: string, look: { faded: boolean; halo?: boolean; sad?: boolean }, alt: string, isSmall = false) => {
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const rest = isSmall ? petSmall(o, look) : petRest(o, look)
      return <Raster key={key} columns={rest.columns} rows={rest.rows} cells={rest.cells} />
    }
    if (e.surface === 'desktop' || e.surface === 'vscode') {
      const { Svg } = $.ui.resolve(e)
      return <Svg source={petSvg(petPixels(o, look))} alt={alt} width={isSmall ? 21 : 42} />
    }
    return <Text>{alt}</Text>
  }
  const pet = (s: TamaSession, key: string) =>
    art(v.looks.get(s.id)!, key, { faded: isAsleep(s, v.now), halo: !s.live, sad: isSad(s, v.now, settings.sadMs) }, `${modelLabel(s.model)} pet`)
  const agentPet = (s: TamaSession, a: Agent, key: string) =>
    art(agentOutfit(v.looks.get(s.id)!, a), key, { faded: a.isDone }, `${a.type} agent`, true)
  const modelPill = (s: TamaSession) => <Text bold color={MODEL_SKIN[modelFamily(s.model)]!.body}>{modelLabel(s.model)}</Text>
  const ctx = (s: TamaSession) => {
    const l = lights(s.contextTokens)
    return <Text><Text color={l.color}>{l.on}</Text><Text dimColor>{l.off} {l.pct}% ctx</Text></Text>
  }
  // a section's title: larger where the surface has sizes, else underlined
  const title = (text: string, arrow?: string) =>
    <Text bold size="heading" color={HEADER}>{arrow ? `${arrow} ` : ''}<Text underline>{text}</Text></Text>
  const note = (text: string) => <Text dimColor> · {text}</Text>
  const header = (text: string, aside?: string) =>
    <Box marginTop={1}><Text>{title(text)}{aside ? note(aside) : null}</Text></Box>
  return { pet, agentPet, modelPill, ctx, title, note, header, brand: <Text bold color={ACCENT}>✿ TamaClaudchi ✿</Text> }
}

/** The shelf: running pets in their rows, the graveyard, or the spend page in their place. */
async function shelfPage($: EngineInterface, e: PaneEvent, v: View) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const Input = 'Input' in elements ? elements.Input : null
  const k = kit($, e, v)
  const isSpend = await read($, showSpend)
  if (isSpend) return spendPage($, e, v)
  const isMailroom = await read($, showMailroom)
  if (isMailroom) return mailroomPage($, e, v)
  const isGraveOpen = await read($, showClosed)
  const query = await read($, graveQuery)
  const spawning = await read($, isSpawning)
  const used = await read($, disk)
  const armedId = await read($, armed)
  const mod = await read($, modVersion)

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
  const posts = postsOf(v.list).length
  // your own pet first in its row, in its cyan frame
  const groups = isGraveOpen
    ? [{ label: `${GRAVE} Graveyard`, color: GREY, pets: found.slice(0, GRAVES_SHOWN) }]
    : GROUPS.map(g => ({
      ...g,
      pets: alive.filter(s => g.moods.includes(s.mood)).sort((a, b) => Number(b.id === v.mine) - Number(a.id === v.mine)),
    })).filter(g => g.pets.length)
  // the first pets on the page, in reading order, open with a digit
  const digit = new Map(groups.flatMap(g => g.pets).slice(0, DIGITS).map((s, i) => [s.id, i + 1]))
  const perRow = Math.max(1, Math.floor(v.cols / CARD_W))
  const rowsOf = (pets: TamaSession[]) =>
    Array.from({ length: Math.ceil(pets.length / perRow) }, (_, i) => pets.slice(i * perRow, (i + 1) * perRow))
  const openGraves = (isOn: boolean) => () => update($, showClosed, () => isOn)
  const setQuery = (q: string) => update($, graveQuery, () => q)

  return (
    <Box flexDirection="column">
      {k.brand}
      <Text dimColor>Click a pet, or press its number, to open it</Text>
      {used ? (
        <Text wrap="truncate">
          <Text dimColor>Claude takes </Text>
          <Text bold color={diskColor(used.tempKb + used.logKb, settings.diskWarnKb / GiB, settings.diskAlarmKb / GiB)}>{bytes(used.tempKb + used.logKb)}</Text>
          <Text dimColor> on disk: {bytes(used.tempKb)} in {used.tempDir}, {bytes(used.logKb)} of transcripts</Text>
        </Text>
      ) : null}
      <Text dimColor>{plural(alive.length, 'running pet')} across {plural(folders, 'folder')}</Text>
      {isGraveOpen
        ? <Button key="graveyard" hotkey="g" plain label="← back to the shelf" onPress={openGraves(false)} />
        : spawning && Input ? (
          <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
            <Text bold color={ACCENT}>+ a new pet, in its own tmux session</Text>
            <Input key="spawn-dir" label="folder" value={self?.cwd ?? '~'} autoFocus submitLabel="hatch" onSubmit={dir => spawnPet($, dir)} />
            <Button key="spawn-cancel" plain dimColor label="cancel" onPress={() => update($, isSpawning, () => false)} />
          </Box>
        ) : (
          <Box columnGap={2} flexWrap="wrap">
            <Button key="spawn" hotkey="n" plain label="+ new pet" onPress={() => update($, isSpawning, () => true)} />
            {closed.length ? <Button key="graveyard" hotkey="g" plain label={`${GRAVE} graveyard · ${closed.length} closed`} onPress={openGraves(true)} /> : null}
            <Button key="spend" hotkey="s" plain label={`${SPEND_SIGN} spend · ${usd(spentToday)} today`} onPress={() => update($, showSpend, () => true)} />
            {posts ? <Button key="mailroom" hotkey="m" plain label={`${LETTER} ${plural(posts, 'message')}`} onPress={() => openMailroom($, true)} /> : null}
          </Box>
        )}
      <Text>{mod ? <Text color={HEADER}>v{mod} </Text> : null}<Text dimColor>Legend: body = repo · hat = model · item = branch</Text></Text>
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
      {isGraveOpen && toClean.length ? (
        armedId === CLEAN_ALL
          ? <Button key="clean-all" hotkey="x" plain label={`✕ press again: delete ${bytes(cleanKb)} of temp files from ${plural(toClean.length, 'closed pet')} (transcripts stay)`} onPress={() => cleanAll($, closed)} />
          : <Button key="clean-all" hotkey="x" plain dimColor label={`✕ clean every closed pet's temp folder (${bytes(cleanKb)} in ${toClean.length})`} onPress={() => update($, armed, () => CLEAN_ALL)} />
      ) : null}
      {groups.map(g => (
        <Box key={`group-${g.label}`} flexDirection="column" marginTop={1}>
          <Text bold color={g.color}>{g.label} <Text dimColor>· {g.pets.length}</Text></Text>
          {rowsOf(g.pets).map((row, i) => (
            <Box key={`row-${g.label}-${i}`} flexDirection="row">{row.map(s => card($, e, v, s, digit.get(s.id)))}</Box>
          ))}
        </Box>
      ))}
    </Box>
  )
}

/** One pet's card on the shelf; `digit` opens it from the keyboard. */
function card($: EngineInterface, e: PaneEvent, v: View, s: TamaSession, digit?: number) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const k = kit($, e, v)
  const o = v.looks.get(s.id)!
  const isMe = s.id === v.mine
  const isTerminal = e.surface === 'terminal'
  const size = s.disk ? s.disk.tempKb + s.disk.logKb : 0
  const sad = isSad(s, v.now, settings.sadMs)
  const isMailed = hasRecentMail(s, v.now, v.seen[s.id])
  return (
    <Box key={`card-${s.id}`} position="relative" width={CARD_W}>
      <Box flexDirection="column" alignItems="center" width={CARD_W} height={isTerminal ? CARD_H : undefined}
        borderStyle={isMe ? 'double' : 'round'} borderColor={isMe ? ME : s.live ? MOOD[s.mood].border ?? o.skin.outline : GREY}
        hover={{ scope: `repo:${s.repo}`.slice(0, 64), borderColor: HOVER }}>
        <Box width={CARD_W - 2} justifyContent="space-between">
          {isMe ? <Text bold color={ME}>★ you</Text>
            : !s.live ? <Button key={`wing-${s.id}`} plain label={`${WING} resurrect`} onPress={() => resurrect($, s)} />
            : canJump(s.live) ? <Button key={`home-${s.id}`} plain label={`${HOME} attach`} onPress={() => jump($, s)} />
            : s.live.isElsewhere ? <Text dimColor>↗ another machine</Text>
            : <Text> </Text>}
          <Box gap={1}>
            {size >= CARD_DISK_KB
              ? <Text key={`disk-${s.id}`} color={size >= GiB ? diskColor(size, 1, 5) : undefined} dimColor={size < GiB}>{bytesShort(size)}</Text>
              : null}
            {s.live?.isRemote ? <Text key={`phone-${s.id}`}>{PHONE}</Text> : null}
            {isMailed ? <Text key={`letter-${s.id}`}>{LETTER}</Text> : null}
          </Box>
        </Box>
        {k.pet(s, `pet-${s.id}`)}
        <Box width={CARD_W - 2} justifyContent="center">
          <Button key={`name-${s.id}`} plain hotkey={digit ? String(digit) : undefined} onPress={() => select($, s.id)}>
            <Text bold dimColor={!s.live} color={isMe ? ME : undefined}>{clip(petName(s), CARD_W - 2 - (digit ? 3 : 0))}</Text>
          </Button>
        </Box>
        <Text color={o.skin.body} wrap="truncate">{s.repo}</Text>
        <Text dimColor wrap="truncate">⎇ {s.branch ?? '—'}</Text>
        <Box gap={1}>{k.modelPill(s)}{k.ctx(s)}</Box>
        {s.subagents ? <Text color={MOOD.busy.border!}>{plural(s.subagents, 'subagent')} working</Text>
          : sad ? <Text color={MOOD.waiting.border!} wrap="truncate">sad · left waiting {ago(v.now - s.mtimeMs).replace(' ago', '')}</Text>
          : s.subagentsEver ? <Text dimColor>{plural(s.subagentsEver, 'subagent')} launched</Text>
          : <Text> </Text>}
        <Text dimColor>{s.bornMs ? `born ${ago(v.now - s.bornMs)}` : 'born ?'}</Text>
      </Box>
      {isTerminal ? OUTLINE.map(([top, left, text]) => (
        <Box position="absolute" top={top} left={left} display="none" hover={{ display: 'flex' }}>
          <Text color={HOVER}>{text}</Text>
        </Box>
      )) : null}
    </Box>
  )
}

/** What the pets spent over the graveyard's window, at API list prices: by day, repo and pet. */
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
        <Button key="spend-back" hotkey="s" plain label="← back to the shelf" autoFocus onPress={() => update($, showSpend, () => false)} />
      </Box>
      <Text dimColor wrap="wrap">What these sessions' API calls, their subagents' included, would cost at API list prices. A subscription is not billed this way.</Text>
      <Box marginTop={1}><Text><Text bold>{usd(byDay[0]?.usd ?? 0)}</Text><Text dimColor> today · </Text><Text bold>{usd(total)}</Text><Text dimColor> {since()}{unpriced ? ` · ${plural(unpriced, 'call')} to models with no price here, left out` : ''}</Text></Text></Box>
      {k.header('By day', 'today first')}
      {bars(byDay, 'day')}
      {byRepo.length ? k.header('By repo') : null}
      {bars(byRepo.map(r => ({ ...r, color: v.looks.get(pets.find(s => s.repo === r.label)!.id)?.skin.body })), 'repo')}
      {top.length ? k.header('Pets that spent most', 'press one to open it') : null}
      {top.map(({ s, usd: spent }) => (
        <Button key={`spend-pet-${s.id}`} plain onPress={() => select($, s.id)}>
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
    <Button key={key} plain onPress={() => select($, s.id)}>
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

/** The conversations' tabs, each a button, the first nine opened with a digit. */
function mailTabs($: EngineInterface, e: PaneEvent, v: View, threads: Thread[], shown: Thread, label: (t: Thread) => string) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap" columnGap={1}>
        {threads.map((t, i) => {
          const isShown = t.key === shown.key
          const look = isShown ? TAB_OPEN : TAB_SHUT
          return (
            <Button key={`mail-tab-${t.key}`} plain hotkey={i < DIGITS ? String(i + 1) : undefined} onPress={() => openTab($, t.key)}>
              <Text bold={isShown} color={look.fg} backgroundColor={look.bg}>
                {' '}{i < DIGITS ? `${i + 1} ` : ''}{clip(label(t), TAB_W)} ({t.posts.length}){' '}
              </Text>
            </Button>
          )
        })}
      </Box>
      <Text color={TAB_OPEN.bg} wrap="truncate">{'━'.repeat(v.cols)}</Text>
    </Box>
  )
}

async function told($: EngineInterface, pets: TamaSession[]): Promise<Told> {
  const got = await read($, mailText)
  return { texts: got?.byId ?? {}, isRead: !!got && got.key === mailRead(pets).key }
}

/** One conversation as a chat, oldest first, the `left` end's messages on the left. */
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

/** Every conversation between the sessions over the graveyard's window, a tab each, the latest first. */
async function mailroomPage($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const k = kit($, e, v)
  const threads = threadsOf(postsOf(v.list))
  const tab = await read($, mailTab)
  const thread = openThread(threads, tab)
  const texts = await told($, v.list)
  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        <Button key="mailroom-back" hotkey="m" plain label="← back to the shelf" autoFocus onPress={() => openMailroom($, false)} />
      </Box>
      <Text dimColor wrap="wrap">What your sessions told each other {since()}: a tab per conversation, the latest first.</Text>
      {!thread ? <Text dimColor>No messages {since()}.</Text> : (
        <Box flexDirection="column" marginTop={1}>
          {mailTabs($, e, v, threads, thread, t => `${clip(endName(v, t.ends[0]), 16)} ↔ ${clip(endName(v, t.ends[1]), 16)}`)}
          <Box gap={1} marginTop={1}>
            {mailEnd($, e, v, thread.ends[0].id, thread.ends[0].name, 'mail-end-0')}
            <Text dimColor>↔</Text>
            {mailEnd($, e, v, thread.ends[1].id, thread.ends[1].name, 'mail-end-1')}
            <Text dimColor>· {plural(thread.posts.length, 'message')} · press a name to open its pet</Text>
          </Box>
          {threadView($, e, v, thread, 0, texts)}
        </Box>
      )}
    </Box>
  )
}

/** One pet, opened: its actions, its card, its subagents, its git, and the conversation. */
async function petPage($: EngineInterface, e: PaneEvent, v: View, s: TamaSession, crew: Agent[]) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const Input = 'Input' in elements ? elements.Input : null
  const k = kit($, e, v)
  const o = v.looks.get(s.id)!
  const gitRead = await read($, git)
  // a record written by an older version of the mod has no trees: read it again
  const info = gitRead?.id === s.id && Array.isArray(gitRead.trees) ? gitRead : null
  const armedId = await read($, armed)
  const renamingId = await read($, renaming)
  const isRenaming = renamingId === s.id
  const talk = await read($, convo)
  const isGitOpen = await read($, showGit)
  const isConvoOpen = await read($, showConvo)
  const isMailOpen = await read($, showMail)
  const texts = await told($, [s])
  const mail = s.mail ?? []
  // its conversations: every message it sent or got, a thread per other session
  const talks = threadsOf(postsOf(v.list).filter(p => p.from === s.id || p.to === s.id))
  const tab = await read($, mailTab)
  const openTalk = openThread(talks, tab)
  const otherEnd = (t: Thread): 0 | 1 => (t.ends[0].id === s.id ? 1 : 0)
  const shownN = await read($, convoShown) || CONVO_PAGE
  const newestCommit = info?.trees.find(t => t.lastCommitMs)?.lastCommitMs ?? 0
  // the whole conversation once it is read; the shelf's short preview until then
  const said = talk?.id === s.id ? talk.said : s.recent
  const tmux = s.live?.tmux ? tmuxSession(s.live.tmux) : null
  const mood = !s.live ? { ...MOOD.idle, label: '✝ closed' }
    : isAsleep(s, v.now) ? { ...MOOD.idle, label: 'zzz asleep' }
    : isSad(s, v.now, settings.sadMs) ? { ...MOOD.waiting, label: `sad: waiting on you for ${ago(v.now - s.mtimeMs).replace(' ago', '')}` }
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
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        <Button key="back" hotkey="b" plain label="back to the shelf" autoFocus onPress={() => select($, null)} />
        {canJump(s.live) ? <Button key="jump" hotkey="a" plain label={`${HOME} attach`} onPress={() => jump($, s)} /> : null}
        {s.live ? null : <Button key="resurrect" hotkey="r" plain label={`${WING} resurrect`} onPress={() => resurrect($, s)} />}
        <Button key="resume" hotkey="c" plain label="copy resume command" onPress={() => copyResume($, s)} />
        {Input && !s.live?.isElsewhere ? <Button key="rename" hotkey="e" plain label="✎ rename" onPress={() => startRename($, s.id)} /> : null}
        {s.live && !s.live.isElsewhere && s.id !== v.mine ? (
          armedId === s.id
            ? <Button key="kill" hotkey="k" plain label={`✕ press again: kill it${tmux ? ' and its tmux pane' : ''}`} onPress={() => killPet($, s)} />
            : <Button key="kill" hotkey="k" plain dimColor label="✕ kill" onPress={() => update($, armed, () => s.id)} />
        ) : null}
        {!s.live && s.disk && s.disk.tempKb >= MIN_CLEAN_KB ? (
          armedId === s.id
            ? <Button key="clean" hotkey="x" plain label={`✕ press again: delete ${bytes(s.disk.tempKb)} of temp files (its transcript stays)`} onPress={() => cleanTemp($, s)} />
            : <Button key="clean" hotkey="x" plain dimColor label={`✕ clean its temp folder (${bytes(s.disk.tempKb)})`} onPress={() => update($, armed, () => s.id)} />
        ) : null}
      </Box>
      <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor={MOOD[s.mood].border ?? o.skin.outline} paddingX={1}>
        {k.pet(s, 'detail-pet')}
        {isRenaming && Input ? (
          <Box width={Math.min(maxW, 50)} flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
            <Text color={ACCENT} bold>✎ new name</Text>
            <Input key="rename-name" label="›" value={petName(s)} placeholder="type a name" autoFocus submitLabel="rename" onSubmit={name => renamePet($, s, name)} />
            <Text dimColor>Enter renames · Esc leaves the field</Text>
            <Button key="rename-cancel" plain dimColor label="cancel" onPress={() => update($, renaming, () => null)} />
          </Box>
        ) : <Text bold wrap="truncate">{petName(s)}</Text>}
        <Text color={o.skin.body} wrap="truncate">{s.repo}{s.branch ? ` · ${s.branch}` : ''}</Text>
        <Box gap={1}>
          {k.modelPill(s)}{k.ctx(s)}<Text color={mood.fg} backgroundColor={mood.bg}> {mood.label} </Text>
          {s.live?.job ? <Text color="#3b3340" backgroundColor={PILL_BG}> ◐ background </Text> : null}
        </Box>
        <Text dimColor wrap="truncate-start">{s.cwd}</Text>
        <Text dimColor>{lifeLine}</Text>
        {s.disk ? (
          <Text dimColor>
            on disk: <Text bold dimColor={false} color={diskColor(s.disk.tempKb + s.disk.logKb, 1, 5)}>{bytes(s.disk.tempKb + s.disk.logKb)}</Text>
            {' '}({bytes(s.disk.tempKb)} in its temp folder, {bytes(s.disk.logKb)} of logs)
          </Text>
        ) : null}
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
          {k.header('Subagents', `${crew.filter(a => isAgentRunning(a, v.now)).length} working · click one for its trace`)}
          <Box flexDirection="row" flexWrap="wrap">
            {crew.map(a => {
              const running = isAgentRunning(a, v.now)
              return (
                <Box key={`agent-card-${a.id}`} flexDirection="column" alignItems="center" width={AGENT_W}
                  borderStyle="round" borderColor={running ? MOOD.busy.border! : GREY}>
                  {k.agentPet(s, a, `agent-pet-${a.id}`)}
                  <Button key={`agent-${a.id}`} plain dimColor={!running} label={clip(a.description, AGENT_W - 2)} onPress={() => openAgent($, a.id)} />
                  <Text dimColor={!running} color={running ? MOOD.busy.border! : undefined}>{running ? '● working' : `✓ ${ago(v.now - a.mtimeMs)}`}</Text>
                </Box>
              )
            })}
          </Box>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Button key="git-toggle" plain onPress={() => update($, showGit, x => !x)}>
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
      {mail.length ? (
        <Box marginTop={1}>
          <Button key="mail-toggle" plain onPress={() => update($, showMail, x => !x)}>
            {k.title('Messages', isMailOpen ? '▾' : '▸')}
            {k.note(`${mail.filter(m => m.dir === 'out').length} sent · ${mail.filter(m => m.dir === 'in').length} received, the last ${ago(v.now - mail.at(-1)!.at)}`)}
          </Button>
        </Box>
      ) : null}
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
      {s.live && !s.live.isElsewhere && Input ? (
        <Box flexDirection="column" alignItems="flex-end" marginTop={1}>
          <Box width={maxW}>
            <Input key="msg" placeholder="message this session…" submitLabel="send" onSubmit={text => message($, s, text)} />
          </Box>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Button key="convo-toggle" plain onPress={() => update($, showConvo, x => !x)}>
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
          {said.length > shownN
            ? <Button key="convo-more" plain dimColor label={`show ${Math.min(CONVO_PAGE, said.length - shownN)} older of ${said.length - shownN} more`} onPress={() => update($, convoShown, n => (n || CONVO_PAGE) + CONVO_PAGE)} />
            : null}
          {canJump(s.live) ? <Button key="jump-bottom" plain label="a: attach to see the full conversation" onPress={() => jump($, s)} /> : null}
        </Box>
      ) : null}
    </Box>
  )
}

/** One subagent, opened: its task, and its trace, newest first. */
async function agentPage($: EngineInterface, e: PaneEvent, v: View, s: TamaSession, a: Agent) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const k = kit($, e, v)
  const shownTrace = await read($, trace)
  const steps = shownTrace?.id === a.id ? shownTrace.steps : null
  const running = isAgentRunning(a, v.now)
  const tint = MODEL_SKIN[modelFamily(a.model)]!.body
  const maxW = Math.max(16, Math.floor(v.cols * 0.75))
  const bubbleW = (text: string) => Math.min(maxW, widest(tidy(text)) + 4)
  const shown = (steps ?? []).slice(-STEPS_SHOWN).reverse()
  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        <Button key="agent-back" hotkey="b" plain label={`back to ${clip(petName(s), 30)}`} autoFocus onPress={() => openAgent($, null)} />
        {canJump(s.live) ? <Button key="jump" hotkey="a" plain label={`${HOME} attach to its pet`} onPress={() => jump($, s)} /> : null}
      </Box>
      <Box flexDirection="row" gap={2} borderStyle="round" borderColor={running ? MOOD.busy.border! : GREY} paddingX={1}>
        {k.agentPet(s, a, 'agent-detail-pet')}
        <Box flexDirection="column">
          <Text bold wrap="truncate">{a.description}</Text>
          <Text><Text bold color={tint}>{modelLabel(a.model)}</Text><Text dimColor> · {a.type} · a subagent of {petName(s)}</Text></Text>
          <Text color={running ? MOOD.busy.border! : undefined} dimColor={!running}>
            {running ? '● working' : a.isDone ? '✓ done' : '◌ quiet'} · last wrote {ago(v.now - a.mtimeMs)}
          </Text>
          <Box gap={1}>
            <Text bold>Log:</Text>
            <Button key="agent-log" hotkey="c" plain label="copy path" onPress={() => copyPath($, a.path)} />
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
