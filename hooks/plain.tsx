// The parts of TamaClaudchi that never touch Claude Code: the shell scripts
// the shelf runs, and plain functions over what they print. Kept apart from
// register.tsx, which holds every function that takes $.

import type { RenderElement, RenderInput } from 'claude-code'
import type { TamaSession, Mood, Agent, Live } from '../types'
import { settings } from './config'
import { petName } from './sessions'
import { USAGE_AWK, type Call } from './spend'
import { MAIL_AWK, PROMPT_AWK, type MailFact, type Thread } from './mail'

export const playing = new Map<string, { cancel: () => void }>()

export type Disk = { tempDir: string; tempKb: number; logKb: number }

/** Bumped when the files change shape; the files are named for it, so other versions share files of their own. */
export const SCHEMA = 6
export const LEASE_POLLS = 3

/** What changed since the last poll, as lines to announce. */
export function news(shelf: TamaSession[], prev: Map<string, Mood> | null): { needs: TamaSession[]; done: TamaSession[] } {
  const out = { needs: [] as TamaSession[], done: [] as TamaSession[] }
  if (!prev) return out
  for (const s of shelf) {
    if (!s.live) continue
    const was = prev.get(s.id)
    if (s.mood === 'needs' && was !== 'needs') out.needs.push(s)
    else if (settings.alertOnDone && s.mood === 'waiting' && was === 'busy') out.done.push(s)
  }
  return out
}

export const names = (list: TamaSession[]) => list.map(petName).join(', ')

export const MAIL_FRAME_MS = 180
/** A message older than this when first seen is old news: it plays nothing. */
export const FRESH_MS = 2 * 60_000

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

/** How many closed pets the graveyard holds (live ones always show); how far back it looks is a setting. */
export const MAX_CLOSED = 150
/** How many of the newest transcripts are read besides the live ones, and per shell. */
export const CANDIDATES = 150
export const BATCH = 16
/** A transcript read from its start is grepped whole: fewer of those per shell. */
export const FRESH_BATCH = 4
/** A read on is backed up this far, so a line cut by the last read is read whole. */
export const OVERLAP_BYTES = 65_536
/** A session that never got a reply (a scripted one-shot, a quit) leaves the shelf. */
export const EGG_SHOWN_MS = 15 * 60_000
export const TAIL_BYTES = 131_072
/** How much of an opened pet's transcript is read for its conversation. */
export const CONVO_BYTES = 2 * 1024 * 1024
/** A subagent counts as running while it has not finished and has written in this long. */
export const AGENT_RUNNING_MS = 10 * 60_000
export const isAgentRunning = (a: Agent, now: number) => !a.isDone && now - a.mtimeMs < AGENT_RUNNING_MS
/** A pet's page shows all its running subagents, and finished ones up to this many in all. */
export const AGENTS_SHOWN = 6
/** How often disk use is measured again. */
export const DISK_MS = 60_000
/** An unchanged shelf is drawn again this often all the same, so its ages move on. */
export const REDRAW_MS = 60_000
/** How many checkouts a pet's git section shows, newest commit first. */
export const GIT_TREES = 4
/** Claude's own temp dir (`/tmp/claude-<uid>`), the only place a clean may delete in. */
export const TEMP_DIR = /^\/[^\x00-\x1f]*\/claude-\d+$/
/** A project's folder name in it, as Claude Code writes them (`-home-me-src-repo`). */
export const PROJECT_DIR = /^[\w.-]+$/
/** A tmux pane as the registry names it, `session:@window.%pane`. */
export const TMUX_PANE = /^[^:\n]+:@\d+\.%\d+$/
/** Session ids are uuids: any other file is not a transcript, and its name never reaches a command. */
export const SESSION_ID = /^[\w-]+$/

export type Transcript = { path: string; id: string; mtimeMs: number; size: number; stamp: string }

// Parsed transcripts by path, kept while the file's mtime and size hold, with
// the facts read so far, the API calls found, and up to which byte. A module
// variable on purpose: a reload just reads them again.
export const cache = new Map<string, {
  stamp: string; size: number; facts: Record<string, string>; calls: Map<string, Call>; mail: Map<string, MailFact>; session: TamaSession
}>()
// The same for subagents' transcripts, whose API calls count to their pet.
export const subCache = new Map<string, { stamp: string; size: number; calls: Map<string, Call> }>()
// A closed pet's subagents, listed once: they write no more.
export const closedSubs = new Map<string, Transcript[]>()
// Every transcript, one line each: mtime in seconds, size, path. One process
// rather than a listing per project folder, of which there are hundreds. GNU
// find prints them itself; BSD find (macOS) has stat print them.
export const LIST_SCRIPT = `if find "$1" -maxdepth 0 -printf '' 2>/dev/null; then
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
export const READ_SCRIPT = `while [ $# -gt 1 ]; do
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
export const USAGE_SCRIPT = `while [ $# -gt 1 ]; do
  f="$1"; off="$2"; shift 2
  printf '\\036%s\\n' "$f"
  tail -c +$((off + 1)) "$f" | awk '${USAGE_AWK}'
done`

// Each live pet's subagents written to in the last ten minutes (so one cut
// off mid-task is not counted forever), and whether each one has finished: a
// last reply, or a background agent's hand-back to its pet.
export const SUBAGENT_SCRIPT = `for d in "$@"; do
  printf '\\036%s\\n' "$d"
  printf 'T %s\\n' "$(find "$d" -maxdepth 1 -name 'agent-*.jsonl' 2>/dev/null | wc -l)"
  find "$d" -maxdepth 1 -name 'agent-*.jsonl' -mmin -10 2>/dev/null | while read -r f; do
    tail -n 2 "$f" | grep -c -e '"stop_reason":"end_turn"' -e '"name":"SubagentHandback"'
  done
done`

// The opened pet's subagents written to in the last half hour: for each, its
// path, mtime, whether it has finished (as above), its model, and its
// .meta.json (agent type and task description) on one line.
export const AGENTS_SCRIPT = `find "$1" -maxdepth 1 -name 'agent-*.jsonl' -mmin -30 2>/dev/null | while read -r f; do
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
export const GIT_SCRIPT = `export GIT_OPTIONAL_LOCKS=0
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
export const DISK_SCRIPT = `p="$1"; shift
b="\${CLAUDE_CODE_TMPDIR:-\${TMPDIR:-/tmp}}"
t="\${b%/}/claude-$(id -u)"
[ -d "$t" ] || t="/tmp/claude-$(id -u)"
printf '%s\\n' "$t"
du -sk "$t" "$p" 2>/dev/null
printf '\\037\\n'
for s in "$@"; do printf '%s\\n%s\\n%s\\n' "$t/$s" "$p/$s.jsonl" "$p/$s"; done | tr '\\n' '\\0' | xargs -0 -r du -sk 2>/dev/null
true`

/** A process where there is no /proc (macOS): its parent, and its start as `ps -o lstart` prints it in UTC. */
export type Proc = { ppid: number; start: string }
/** Where there is no /proc, the registry writes a process's start as ps does in UTC: `Thu Oct 22 22:10:12 2026`. */
export const LSTART = /^[A-Z][a-z]{2} [A-Z][a-z]{2} +\d{1,2} \d\d:\d\d:\d\d \d{4}$/
export const sameStart = (a: string, b: string) => a.replace(/\s+/g, ' ') === b.replace(/\s+/g, ' ')

export const MACHINE_SCRIPT = `cat /etc/machine-id 2>/dev/null; echo; readlink /proc/self/ns/pid 2>/dev/null
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

// Registry entries by file name, as last read: one whose file has not changed
// is not read again, and one whose process had ended stays ended (a crashed
// session leaves its entry behind for good).
export const registry = new Map<string, { stamp: string; id: string | null; live: Live; hasEnded: boolean; updatedMs: number }>()

/** The read script's facts, one `"key":"value"` a line. */
export function factsOf(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of text.split('\n')) {
    try { Object.assign(out, JSON.parse(`{${l}}`)) } catch {}
  }
  return out
}

/** The byte a grown file is read on from, backed up a little; a file that shrank was rewritten, and is read from the start. */
export const readFrom = (c: { size: number } | undefined, f: Transcript) => (c && f.size >= c.size ? Math.max(0, c.size - OVERLAP_BYTES) : 0)

export const SLOTS_KEY = 'looks-v1'

export const diskById = new Map<string, { tempKb: number; logKb: number }>()
export const dirOf = (s: TamaSession) => s.path.slice(0, -'.jsonl'.length)

// The lines about messages in each transcript given, from its last few MB.
export const MAIL_SCRIPT = `for f in "$@"; do tail -c ${4 * CONVO_BYTES} "$f" | awk '${MAIL_AWK}'; done`
/** How many transcripts the messages page reads the texts from. */
export const MAIL_FILES = 30
/** How much of a message a page shows. */
export const MAIL_CHARS = 20_000

/** How many of a pet's newest messages its page draws at first, and adds on each ask. */
export const CONVO_PAGE = 30

export const TMUX_TARGET = '#{session_name}:#{window_id}.#{pane_id}'

/** The session part of a tmux target, `session:@window.%pane`. */
export const tmuxSession = (target: string) => target.split(':')[0]!

/** Whether a pet can be jumped to: its tmux pane, or its background session. */
export const canJump = (live: Live | null) => !!live && !live.isElsewhere && !!(live.tmux || live.job)
/** The pane part, `%12`: which a renamed session keeps (a restarted tmux server counts again from %0). */
export const tmuxPane = (target: string) => target.split('.').pop()!
export const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** A closed pet that wrote this lately is left alone by a clean. */
export const RECENT_WRITE_MS = 30 * 60_000
/** A closed pet's temp folder smaller than this (KiB) is not worth a clean. */
export const MIN_CLEAN_KB = 64

/** What leads a message asking a pet to rename itself: its own copy of the mod takes it, its model never reads it. */
export const RENAME_TAG = '[tamaclaudchi rename] '
/** A name as `/rename` takes it: one line, not too long. */
export const cleanName = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 100)

/** How long each frame of the faces holds. */
export const FOOTER_FRAME_MS = 700
/** The slot an awake face's name shows in, left of the faces, in cells. */
export const NAME_W = 24
/** Awake faces drawn at most; more say `+N`. */
export const AWAKE_SHOWN = 6
export const RED = '#ff5555'

// Each pair is two frames of one width, so the line never jitters.
export const WAVE = ['ᕕ(•ᴗ•)ᕗ', 'ᕙ(•ᴗ•)ᕗ']
export const ASKING = '(°ᴗ°)'
export const DOZE = ['(-ᴗ-)ᶻ ', '(-ᴗ-)zᶻ']

export type Next = (e: RenderInput<'SessionMode'>) => Promise<RenderElement>

export type PaneEvent = RenderInput<'Pane'>

/** How many graves the graveyard draws at once; a search narrows the rest. */
export const GRAVES_SHOWN = 40
export const CARD_W = 24
/** A subagent's card on its pet's page: the half-size pet, its task, its state. */
export const AGENT_W = 18
/** A card shows its pet's disk use from this much (KiB); its page always does. */
export const CARD_DISK_KB = 100 * 1024
/** How many steps of a subagent's trace are drawn, the newest. */
export const STEPS_SHOWN = 200
/** Cards and conversation tabs opened by a digit key, the first so many. */
export const DIGITS = 9
/** The spend page's top pets and repos. */
export const SPEND_TOP = 8
/** A card's height on the terminal: a row of buttons, the pet, six rows of text, the border. */
export const CARD_H = 1 + 8 + 6 + 2
/** The hovered card's double outline, as strips over its border cells: [top, left, text]. */
export const OUTLINE: [number, number, string][] = [
  [0, 0, '╔' + '═'.repeat(CARD_W - 2) + '╗'],
  [CARD_H - 1, 0, '╚' + '═'.repeat(CARD_W - 2) + '╝'],
  [1, 0, Array(CARD_H - 2).fill('║').join('\n')],
  [1, CARD_W - 1, Array(CARD_H - 2).fill('║').join('\n')],
]

// Each mood's colours: its pill, and the card border.
export const MOOD: Record<Mood, { label: string; fg: string; bg: string; border: string | null }> = {
  needs: { label: '▲ needs you?', fg: '#8e1140', bg: '#ffdce6', border: '#ff6188' },
  busy: { label: '● working', fg: '#3b3340', bg: '#fdfbf2', border: '#fc9867' },
  waiting: { label: '◌ waiting for you', fg: '#6e5200', bg: '#ffedc0', border: '#ffd866' },
  idle: { label: '○ idle', fg: '#8b8394', bg: '#fdfbf2', border: null },
}
// The shelf's rows, in order; a pet waiting on you after its turn counts as idle.
export const GROUPS: { moods: Mood[]; label: string; color: string }[] = [
  { moods: ['busy'], label: 'Working', color: '#fc9867' },
  { moods: ['needs'], label: 'Needs approval', color: '#ff6188' },
  { moods: ['waiting', 'idle'], label: 'Idle', color: '#ffd866' },
]
export const ACCENT = '#e8825a'
export const GREY = '#8b8394'
/** Your own card: a cool cyan, apart from every mood's warm border. */
export const ME = '#78dce8'
/** A section's header on a pet's or a subagent's page. */
export const HEADER = '#78dce8'
/** The hovered card and every card of its repo. Borders get only the 16
 * terminal colours: a paler mint rounds to white, a bluer one to cyan, and
 * this one lands on bright green. */
export const HOVER = '#55ff55'
export const PHONE = '📱' // on Remote Control
export const GRAVE = '🪦' // the graveyard
/** The background pill's fill, on a pet's page. */
export const PILL_BG = '#d9d6dc'
/** How many messages the messages page and a pet's page draw, the newest. */
export const POSTS_SHOWN = 40

/**
 * A regexp that could take ages on a long folder name: a repeated group that
 * repeats inside (`(a+)+`), or a back-reference. Matched as plain text instead,
 * as the search runs at every redraw.
 */
export const SLOW_REGEXP = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]|\\[1-9]/

/** The closed pets matching a search: a regexp, or plain text while it does not parse (or might be slow). */
export function searchGraves(closed: TamaSession[], query: string): { found: TamaSession[]; isRegexp: boolean } {
  let re: RegExp | null = null
  try { if (!SLOW_REGEXP.test(query)) re = new RegExp(query, 'i') } catch {}
  const q = query.toLowerCase()
  const found = closed.filter(s =>
    [s.title ?? '', s.repo, s.branch ?? '', s.cwd].some(field => (re ? re.test(field) : field.toLowerCase().includes(q))))
  return { found, isRegexp: re !== null }
}

/** What a pet spent over the window, by its days. */
export const windowSpend = (s: TamaSession) => Object.values(s.spend?.days ?? {}).reduce((a, b) => a + b, 0)

/** What `armed` holds while the graveyard's clean-all waits for its second press. */
export const CLEAN_ALL = '*graves'

/** A tab's label, in cells at most. */
export const TAB_W = 34

/** A tab, filled: the open one the headers' cyan with dark text, the others dark grey with light text. */
export const TAB_OPEN = { fg: '#1e1b24', bg: HEADER }
export const TAB_SHUT = { fg: '#d8d4de', bg: '#4a4458' }

/** The texts a page has, and whether they are all there is: read for this page's messages, not another's. */
export type Told = { texts: Record<string, string>; isRead: boolean }
/** The conversation whose tab is open: the one asked for, or the latest. */
export const openThread = (threads: Thread[], tab: string | null) => threads.find(t => t.key === tab) ?? threads[0]

export const TITLE = 'TamaClaudchi'
/** The header says which copy of the mod a pane runs: keep in step with .claude-plugin/plugin.json. */
export const VERSION = '0.1.5'
/** With the pane closed and no alerts to raise, only the footer shows the pets: read them this many polls apart. */
export const CLOSED_POLLS = 4
/** With every face dozing, the footer moves one frame in this many. */
export const DOZE_FRAMES = 3

/** How often this session polls: every poll while its pane is open or alerts are on, else a few polls apart. */
export const everyMs = (isPaneOpen: boolean) => (!isPaneOpen && settings.alerts === 'off' ? settings.pollMs * CLOSED_POLLS : settings.pollMs)

// Text with a dollar sign in it, kept out of register.tsx: the directory reads
// every $ in a file that declares a hook as the engine interface.
/** One `ps -o pid=,ppid=,lstart=` row. */
export const PS_LINE = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/
/** A subagent's transcript file name. */
export const AGENT_FILE = /^agent-[\w-]+\.jsonl$/
/** The subagent id in a transcript path. */
export const AGENT_ID = /agent-([\w-]+)\.jsonl$/
/** An absolute path with no control characters. */
export const ABS_PATH = /^\/[^\x00-\x1f]*$/
/** A leading `~`, alone or before a slash. */
export const HOME_TILDE = /^~(?=\/|$)/
/** A name of dots only (`.`, `..`). */
export const DOTS_ONLY = /^\.+$/
/** tmux session ids start with it (`$3`). */
export const TMUX_SESSION_SIGIL = '$'
/** Appends its first argument as a line to the file its second names. */
export const APPEND_LINE_SCRIPT = 'printf \'%s\\n\' "$1" >> "$2"'
/** The spend page's sign on its button. */
export const SPEND_SIGN = '$'

export type Lease = {
  schema: number
  /** The session holding the lease. */
  by: string
  /** When it last renewed it, ms since the epoch. */
  at: number
  /** How often it reads: a lease is good for LEASE_POLLS of those. */
  everyMs: number
}

export type Shelf = { sessions: TamaSession[]; disk: Disk | null }

export const sharedPaths = (configRoot: string, machine: string) => {
  const dir = `${configRoot}/tamaclaudchi`
  return { dir, lease: `${dir}/lease-${machine}-v${SCHEMA}.json`, shelf: `${dir}/shelf-${machine}-v${SCHEMA}.json` }
}
export type Paths = ReturnType<typeof sharedPaths>

/** The closed pets whose temp folders a bulk clean would free. */
export const cleanable = (closed: TamaSession[]) => closed.filter(s => !s.live && (s.disk?.tempKb ?? 0) >= MIN_CLEAN_KB)

export const WING = 'ʚɞ' // resurrect: a pair of little wings

/**
 * Two live entries for one session: a background session (claude --bg), and a
 * `claude attach` showing it, which registers with the same id, as a session
 * of its own, with its tmux pane but no job. The background process is the
 * session; the attach lends it its pane, where a jump finds it.
 */
export function joined(a: Live | undefined, b: Live): Live {
  const bg = a?.job ? a : b.job ? b : null
  if (!a || !bg) return b
  return { ...bg, tmux: bg.tmux ?? (bg === a ? b : a).tmux }
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
 * The file a session running the mod leaves, named for it, so another's shelf
 * knows a rename sent there is taken by the mod rather than read by its model.
 */
export const markerOf = (dir: string, id: string) => `${dir}/tamaclaudchi/running-${id}`
/** How often the reading session deletes the markers of ended sessions. */
export const PRUNE_MS = 10 * 60_000
