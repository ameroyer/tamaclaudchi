// What the buttons do: open a pet, play its hover loop, and drive tmux to
// jump to, resurrect, hatch or kill a session.
import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Agent, Step, TamaSession } from '../types'
import { GHOST_FRAME_MS, outfits, petFrames, petRest } from './pets'
import { settings } from './config'
import { isAsleep, isSad, petName as nameOf } from './sessions'
import { bytes } from './format'
import { postsOf, threadsOf } from './mail'
import { PANE, playing } from './players'
import {
  canTellApart, claudeDir, forgetProcesses, isRunning, measureDiskSoon, parentOf, PROJECT_DIR, readAgents, readConvo, readGit, readLive,
  readMailText, readTrace, refresh, SESSION_ID, TEMP_DIR,
} from './shelf'

// The values this module reads or writes. The engine's scan wants them
// declared in each module that uses them; one plugin and key is one value.
const isSpawning = atom({ plugin: 'tamaclaudchi', key: 'isSpawning' } as const, false)
const renaming = atom({ plugin: 'tamaclaudchi', key: 'renaming' } as const, null as string | null)
const armed = atom({ plugin: 'tamaclaudchi', key: 'armed' } as const, null as string | null)
const me = atom({ plugin: 'tamaclaudchi', key: 'me' } as const, null as string | null)
const selected = atom({ plugin: 'tamaclaudchi', key: 'selected' } as const, null as string | null)
const sessions = atom({ plugin: 'tamaclaudchi', key: 'sessions' } as const, [] as TamaSession[])
const showGit = atom({ plugin: 'tamaclaudchi', key: 'showGit' } as const, false)
const showConvo = atom({ plugin: 'tamaclaudchi', key: 'showConvo' } as const, false)
const disk = atom({ plugin: 'tamaclaudchi', key: 'disk' } as const, null as { tempDir: string; tempKb: number; logKb: number } | null)
const agents = atom({ plugin: 'tamaclaudchi', key: 'agents' } as const, null as { id: string; list: Agent[] } | null)
const agentPick = atom({ plugin: 'tamaclaudchi', key: 'agentPick' } as const, null as string | null)
const trace = atom({ plugin: 'tamaclaudchi', key: 'trace' } as const, null as { id: string; mtimeMs: number; steps: Step[] } | null)
const convoShown = atom({ plugin: 'tamaclaudchi', key: 'convoShown' } as const, 0)
const showMail = atom({ plugin: 'tamaclaudchi', key: 'showMail' } as const, false)
const showMailroom = atom({ plugin: 'tamaclaudchi', key: 'showMailroom' } as const, false)
const mailTab = atom({ plugin: 'tamaclaudchi', key: 'mailTab' } as const, null as string | null)
const mailSeen = atom({ plugin: 'tamaclaudchi', key: 'mailSeen' } as const, {} as Record<string, number>)

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
async function run($: EngineInterface, argv: string[], opts: { timeoutMs?: number } = {}) {
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
  const look = { faded: isAsleep(s, now), halo: !s.live, sad: isSad(s, now, settings.sadMs) }
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
  const t = threads.find(x => x.key === key) ?? threads[0]
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

/** Brings the pet's tmux pane forward. */
export async function jump($: EngineInterface, s: TamaSession) {
  if (!s.live?.tmux) return
  await markSeen($, [s.id])
  await jumpTo($, s.live.tmux, s.live.name ?? nameOf(s))
}

/**
 * Switches this tmux client to a pane, found by its id so a renamed session is
 * still found; outside tmux, copies how to attach.
 */
async function jumpTo($: EngineInterface, target: string, name: string) {
  const window = target.split('.')[0]!
  const pane = target.includes('%') ? tmuxPane(target) : window
  // switch only this session's own tmux client: outside tmux, another one would be moved
  const isInTmux = !!(await $.env.get('TMUX'))
  if (isInTmux && (await run($, ['tmux', 'switch-client', '-t', pane])).exitCode === 0) {
    await run($, ['tmux', 'select-window', '-t', pane])
    await run($, ['tmux', 'select-pane', '-t', pane])
    $.ui.toast(`Jumped to ${name}`)
    return
  }
  await $.ui.copy({ text: `tmux attach -t ${shellQuote(window)} \\; select-pane -t ${shellQuote(pane)}` })
  $.ui.toast('Not inside tmux here, so the attach command is on your clipboard.')
}

/**
 * Brings a closed session back: `claude --resume` in a tmux session of its
 * own, in its folder, and goes there. Without tmux, the resume command is copied.
 */
export async function resurrect($: EngineInterface, s: TamaSession) {
  // it may be back already, since the shelf was read: go to it instead
  const now = (await readLive($)).get(s.id)
  if (now) {
    if (now.tmux) await jumpTo($, now.tmux, now.name ?? nameOf(s))
    else $.ui.toast(`${nameOf(s)} is running already${now.isElsewhere ? ', on another machine' : ''}.`)
    return
  }
  // tmux takes neither '.' nor ':' in a session name
  const name = `${s.repo.replace(/[.:\s]/g, '-').slice(0, 24)}-${s.id.slice(0, 4)}`
  const made = await run($, ['tmux', 'new-session', '-d', '-P', '-F', TMUX_TARGET, '-s', name, '-c', s.cwd, `claude --resume ${s.id}`,
  ])
  if (made.exitCode === 0) {
    const target = made.stdout.trim()
    if (target) await jumpTo($, target, name)
    $.ui.toast(`${WING} ${nameOf(s)} is back, in tmux session ${name}.`)
    void refresh($)
  } else if ((await run($, ['tmux', 'has-session', '-t', `=${name}`])).exitCode === 0) {
    await jumpTo($, `${name}:`, name) // brought back already: go to it
  } else {
    await copyResume($, s)
  }
}

/**
 * Hatches a pet: `claude` in a new detached tmux session in `input`, named
 * after the folder (with -2, -3… when taken), then goes there. Typed into the
 * shell rather than run as the session's command, so the pane stays when it exits.
 */
export async function spawnPet($: EngineInterface, input: string) {
  const home = (await $.env.get('HOME')) ?? ''
  const dir = input.trim().replace(/^~(?=\/|$)/, home) || home
  if ((await $.fs.stat(dir).catch(() => null))?.kind !== 'dir') {
    $.ui.toast(`No folder at ${dir}.`)
    return
  }
  const base = (dir.split('/').filter(Boolean).pop() ?? '').replace(/[^\w-]/g, '-') || 'pet'
  const listed = await run($, ['tmux', 'list-sessions', '-F', '#{session_name}'])
  const taken = new Set(listed.exitCode === 0 ? listed.stdout.split('\n') : [])
  let name = base
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}`
  const made = await run($, ['tmux', 'new-session', '-d', '-P', '-F', TMUX_TARGET, '-s', name, '-c', dir])
  const target = made.stdout.trim()
  if (made.exitCode !== 0 || !target) {
    $.ui.toast(`tmux could not start a session: ${made.stderr.trim() || 'is tmux installed?'}`)
    return
  }
  await run($, ['tmux', 'send-keys', '-t', tmuxPane(target), 'claude', 'Enter'])
  await update($, isSpawning, () => false)
  await jumpTo($, target, name)
  $.ui.toast(`A new pet is hatching in tmux session ${name}.`)
  void refresh($)
}

/**
 * Ends a pet: its tmux session when the pet's pane is all that session holds,
 * else only its pane (the session's other windows are not the pet's to take),
 * and the process itself as a backstop. Never this session's own pet.
 */
export async function killPet($: EngineInterface, s: TamaSession) {
  await update($, armed, () => null)
  // never this session's own pet, nor one on another machine, whose pid means nothing here
  if (!s.live || s.live.isElsewhere || s.id === (await read($, me))) return
  const { pid, procStart, tmux } = s.live
  // a claude started from this session's own shell shares its pane: taking
  // that pane down would take this session with it
  if (tmux && tmuxPane(tmux) === (await $.env.get('TMUX_PANE'))) {
    $.ui.toast(`${nameOf(s)} runs in this session's own tmux pane: close it from there.`)
    return
  }
  const done: string[] = []
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
    $.ui.toast(`Could not kill ${nameOf(s)}: its tmux pane is not where the registry says, and its process cannot be told apart from a newer one.`)
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

export async function cleanTemp($: EngineInterface, s: TamaSession) {
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
export async function cleanAll($: EngineInterface, closed: TamaSession[]) {
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
  await $.ui.copy({ text: `cd ${shellQuote(s.cwd)} && claude --resume ${s.id}` })
  $.ui.toast('Resume command copied.')
}

export async function copyPath($: EngineInterface, path: string) {
  await $.ui.copy({ text: path })
  $.ui.toast('Path copied.')
}

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
