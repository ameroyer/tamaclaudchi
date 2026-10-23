// Reading the shelf off disk: every transcript under ~/.claude/projects, the
// registry of running sessions under ~/.claude/sessions, and, for the opened
// pet, its whole conversation, its subagents and its git. Nothing leaves this
// machine.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Agent, GitInfo, GitTree, Live, Said, Spend, Step, TamaSession } from '../types'
import { announce } from './alerts'
import { settings, windowDays } from './config'
import { ITEM_COUNT, itemKey, repoKey, SKIN_COUNT, stickySlots, type Slots } from './pets'
import { parseSession, rederive, repoOf, shelfOrder, traceOf, withLive } from './sessions'
import { claim, followed, share, sharedPaths, takeOver, type Disk } from './shared'
import { lastDays, readCalls, spendOf, USAGE_AWK, type Call } from './spend'
import { lettersOf, MAIL_AWK, mailEdges, mailRead, PROMPT_AWK, readMail, type MailFact } from './mail'
import { playMail } from './mailfx'

// The values this module reads or writes. The engine's scan wants them
// declared in each module that uses them; one plugin and key is one value.
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

/** How many closed pets the graveyard holds (live ones always show); how far back it looks is a setting. */
const MAX_CLOSED = 150
/** How many of the newest transcripts are read besides the live ones, and per shell. */
const CANDIDATES = 150
const BATCH = 16
/** A transcript read from its start is grepped whole: fewer of those per shell. */
const FRESH_BATCH = 4
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
/** A pet's page shows all its running subagents, and finished ones up to this many in all. */
const AGENTS_SHOWN = 6
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
  stamp: string; size: number; facts: Record<string, string>; calls: Map<string, Call>; mail: Map<string, MailFact>; session: TamaSession
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

// One shell per batch of changed transcripts, given as pairs: a path, and the
// byte its facts were read up to (0 for a file not read yet, or rewritten).
// For each: its path, then one `"key":"value"` line per fact found past that
// byte (so none can shift another): when read from the start, what it was
// born with, the first timestamp, folder and branch (a session may cd and
// check out as it works; its looks stay those it was born with); the newest
// custom title (a /rename, or an SDK run naming
// itself); the newest ai-title (written early, out of reach of the tail); and
// the last model (a tail full of one big tool result holds no reply, and would
// hatch the pet back into an egg); a line per API call (spend.ts); each line
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
  tail -c +$((off + 1)) "$f" | grep -o -E '"(customTitle|aiTitle)":"([^"\\\\]|\\\\.)*"|"model":"claude-[^"]*"' |
    awk -F'"' '{ last[$2] = $0 } END { for (k in last) print last[k] }'
  tail -c +$((off + 1)) "$f" | awk '${MAIL_AWK}
${PROMPT_AWK}
${USAGE_AWK}'
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

// Each live pet's subagents written to in the last ten minutes (so one cut
// off mid-task is not counted forever), and whether each one has finished: a
// last reply, or a background agent's hand-back to its pet.
const SUBAGENT_SCRIPT = `for d in "$@"; do
  printf '\\036%s\\n' "$d"
  find "$d" -maxdepth 1 -name 'agent-*.jsonl' -mmin -10 2>/dev/null | while read -r f; do
    tail -n 2 "$f" | grep -c -e '"stop_reason":"end_turn"' -e '"name":"SubagentHandback"'
  done
done`

// The opened pet's subagents written to in the last half hour: for each, its
// path, mtime, whether it has finished (as above), its model, and its
// .meta.json (agent type and task description) on one line.
const AGENTS_SCRIPT = `find "$1" -maxdepth 1 -name 'agent-*.jsonl' -mmin -30 2>/dev/null | while read -r f; do
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
  procs ??= $.process.run(['env', 'TZ=UTC0', 'LC_ALL=C', 'ps', '-A', '-o', 'pid=,ppid=,lstart='])
    .then(r => {
      if (r.exitCode !== 0) return null
      const out = new Map<number, Proc>()
      for (const l of r.stdout.split('\n')) {
        const m = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(l)
        if (m) out.set(Number(m[1]), { ppid: Number(m[2]), start: m[3]! })
      }
      return out
    })
    .catch(() => null)
  return procs
}

/** Whether a pid still runs and is still the process the registry saw start. */
export async function isRunning($: EngineInterface, pid: number, procStart: string | null): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) return false
  const stat = procStart ? await $.fs.read(`/proc/${pid}/stat`).catch(() => '') : ''
  if (!stat) {
    if (await $.fs.exists(`/proc/${pid}`)) return true
    if (await $.fs.exists('/proc/self')) return false
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
  machine ??= $.process.run(['sh', '-c', MACHINE_SCRIPT])
    .then(r => machineFrom(r.stdout))
    .catch(() => ({ key: 'local', domain: null }))
  return machine
}

// Registry entries by file name, as last read: one whose file has not changed
// is not read again, and one whose process had ended stays ended (a crashed
// session leaves its entry behind for good).
const registry = new Map<string, { stamp: string; id: string | null; live: Live; hasEnded: boolean; updatedMs: number }>()

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
          live: {
            isElsewhere,
            pid: reg.pid, procStart: typeof reg.procStart === 'string' ? reg.procStart : null,
            status: typeof reg.status === 'string' ? reg.status : null,
            waitingFor: typeof reg.waitingFor === 'string' ? reg.waitingFor : null,
            // a pane on another machine is not this tmux server's to reach
            tmux: typeof reg.tmux === 'string' && TMUX_PANE.test(reg.tmux) && !isElsewhere ? reg.tmux : null,
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
      if (Date.now() - e.updatedMs < settings.windowMs) out.set(e.id, e.live)
      continue
    }
    if (!(await isRunning($, e.live.pid, e.live.procStart))) {
      e.hasEnded = true
      continue
    }
    out.set(e.id, e.live)
  }
  for (const name of registry.keys()) if (!seen.has(name)) registry.delete(name)
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

/**
 * Brings the shelf up to date and redraws it if it changed: read here, or
 * taken from the session reading for the machine (shared.ts). `everyMs` is
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
async function readOnce($: EngineInterface, opts: { everyMs?: number }) {
  try {
    const now = await $.clock.now()
    const dir = await claudeDir($)
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
    const text = JSON.stringify(shelf)
    // until this session knows its id, it reads for itself, holds no lease and
    // raises no notification; the lease is stamped when renewed, as a cold
    // read can take longer than the lease lasts. What the sessions said stays
    // out of the shared file: each session reads that for the pet it opens.
    const isReader = !other && !!mine
    if (isReader) {
      await claim($, paths, { by: mine, at: await $.clock.now(), everyMs })
      await share($, paths, JSON.stringify(shelf.map(s => ({ ...s, recent: [] }))), used)
    }
    if (text !== drawn.text || now - drawn.at > REDRAW_MS) {
      drawn = { text, at: now }
      await update($, sessions, () => shelf)
    }
    if (used && JSON.stringify(used) !== JSON.stringify(await read($, disk))) await update($, disk, () => used)
    await announce($, shelf, mine, isReader)
    playMail($, shelf, now)

    // the opened pet said something new: read its conversation again
    const pick = await read($, selected)
    const opened = pick ? shelf.find(s => s.id === pick) : undefined
    if (opened && (await read($, convo))?.mtimeMs !== opened.mtimeMs) await readConvo($, opened)
    if (opened) await readAgents($, opened)
    // a message sent or received since: read the texts the page shows again
    if (opened) await readMailText($, [opened])
    else if (await read($, showMailroom)) await readMailText($, shelf)
  } catch (err) {
    $.ui.log(`tamaclaudchi: could not read the shelf: ${String(err)}`)
  }
}

/** Reads the shelf off disk: what changed in the transcripts since the last read, the registry, disk and spend. */
async function readShelf($: EngineInterface, dir: string, now: number): Promise<{ shelf: TamaSession[]; used: Disk | null }> {
  const live = await readLive($)
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
  const working = await readSubagents($, shelf.filter(s => s.live))
  const subCalls = await readSubagentCalls($, shelf)
  if (now - diskAt > DISK_MS) await readDisk($, root, shelf, now)
  const slots = await stickyLooks($, shelf, now)
  for (const s of shelf) {
    s.subagents = working.get(s.id) ?? 0
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
 * The API calls each pet's subagents made, by pet: their transcripts listed
 * at every poll while the pet runs (once for a closed one), each read on from
 * where it was.
 */
async function readSubagentCalls($: EngineInterface, shelf: TamaSession[]): Promise<Map<string, Map<string, Call>>> {
  const owner = new Map<string, string>()
  const files: Transcript[] = []
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

const SLOTS_KEY = 'looks-v1'

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

/** How many subagents each pet has still at work, by session id. */
async function readSubagents($: EngineInterface, pets: TamaSession[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const byDir = new Map(pets.filter(s => s.path).map(s => [`${dirOf(s)}/subagents`, s.id]))
  if (!byDir.size) return out
  const res = await $.process.run(['sh', '-c', SUBAGENT_SCRIPT, 'sh', ...byDir.keys()]).catch(() => null)
  for (const chunk of res?.stdout.split('\x1e').slice(1) ?? []) {
    const [dir = '', ...finished] = chunk.split('\n')
    const id = byDir.get(dir)
    if (id) out.set(id, finished.filter(c => c.trim() === '0').length)
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
  if ((await read($, selected)) === s.id) await update($, convo, () => ({ id: s.id, mtimeMs: s.mtimeMs, said }))
}

const dirOf = (s: TamaSession) => s.path.slice(0, -'.jsonl'.length)

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

/** The opened pet's subagents: the running ones first, then the newest. */
// The opened pet's subagents' files as last read: unchanged, they are not read again.
let agentsSeen = { id: '', stamp: '' }

export async function readAgents($: EngineInterface, s: TamaSession) {
  if (!s.path) return
  const dir = `${dirOf(s)}/subagents`
  const stamp = (await $.fs.list(dir).catch(() => [])).map(f => `${f.name}:${f.mtimeMs}:${f.size}`).join('|')
  if (agentsSeen.id === s.id && agentsSeen.stamp === stamp && (await read($, agents))?.id === s.id) return
  agentsSeen = { id: s.id, stamp }
  const res = await $.process.run(['sh', '-c', AGENTS_SCRIPT, 'sh', dir]).catch(() => null)
  const now = await $.clock.now()
  const list: Agent[] = []
  for (const chunk of res?.stdout.split('\x1e').slice(1) ?? []) {
    const [path = '', mtime = '0', done = '0', modelLine = '', metaLine = ''] = chunk.split('\n')
    let meta: { description?: string; agentType?: string } = {}
    try { meta = JSON.parse(metaLine) } catch {}
    const id = /agent-([\w-]+)\.jsonl$/.exec(path)?.[1]
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
  if ((await read($, selected)) !== s.id) return
  await update($, agents, () => ({ id: s.id, list: shown }))
  // the opened agent wrote more: read its trace again
  const pick = await read($, agentPick)
  const opened = pick ? shown.find(a => a.id === pick) : undefined
  if (opened && (await read($, trace))?.mtimeMs !== opened.mtimeMs) await readTrace($, opened)
}

// The lines about messages in each transcript given, from its last few MB.
const MAIL_SCRIPT = `for f in "$@"; do tail -c ${4 * CONVO_BYTES} "$f" | awk '${MAIL_AWK}'; done`
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
