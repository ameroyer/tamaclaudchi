// TamaClaudchi in Claude Code: a pane with a pixel pet for every session on
// this machine, across folders. This module only wires the hooks; the shelf
// is read in shelf.ts, drawn in view.tsx, and driven by actions.ts.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, GitInfo, Said, Step, TamaSession } from '../types'

import { cleanName, hover, openAgent, RENAME_TAG, select } from './actions'
import { applyOptions, settings } from './config'
import { FOOTER_FRAME_MS, renderFooter } from './footer'
import { PANE } from './players'
import { refresh } from './shelf'
import { renderPane } from './view'

// The values this module reads or writes. The engine's scan wants them
// declared in each module that uses them; one plugin and key is one value.
const isOpen = atom({ plugin: 'tamaclaudchi', key: 'isOpen' } as const, false)
const me = atom({ plugin: 'tamaclaudchi', key: 'me' } as const, null as string | null)
const selected = atom({ plugin: 'tamaclaudchi', key: 'selected' } as const, null as string | null)
const agentPick = atom({ plugin: 'tamaclaudchi', key: 'agentPick' } as const, null as string | null)
const git = atom({ plugin: 'tamaclaudchi', key: 'git' } as const, null as GitInfo | null)
const convo = atom({ plugin: 'tamaclaudchi', key: 'convo' } as const, null as { id: string; mtimeMs: number; said: Said[] } | null)
const showSpend = atom({ plugin: 'tamaclaudchi', key: 'showSpend' } as const, false)
const version = atom({ plugin: 'tamaclaudchi', key: 'version' } as const, '')
const armed = atom({ plugin: 'tamaclaudchi', key: 'armed' } as const, null as string | null)
const renaming = atom({ plugin: 'tamaclaudchi', key: 'renaming' } as const, null as string | null)
const isSpawning = atom({ plugin: 'tamaclaudchi', key: 'isSpawning' } as const, false)
const showClosed = atom({ plugin: 'tamaclaudchi', key: 'showClosed' } as const, false)
const graveQuery = atom({ plugin: 'tamaclaudchi', key: 'graveQuery' } as const, '')
const disk = atom({ plugin: 'tamaclaudchi', key: 'disk' } as const, null as { tempDir: string; tempKb: number; logKb: number } | null)
const sessions = atom({ plugin: 'tamaclaudchi', key: 'sessions' } as const, [] as TamaSession[])
const footerFrame = atom({ plugin: 'tamaclaudchi', key: 'footerFrame' } as const, 0)
const showGit = atom({ plugin: 'tamaclaudchi', key: 'showGit' } as const, false)
const showConvo = atom({ plugin: 'tamaclaudchi', key: 'showConvo' } as const, false)
const agents = atom({ plugin: 'tamaclaudchi', key: 'agents' } as const, null as { id: string; list: Agent[] } | null)
const trace = atom({ plugin: 'tamaclaudchi', key: 'trace' } as const, null as { id: string; mtimeMs: number; steps: Step[] } | null)
const showMail = atom({ plugin: 'tamaclaudchi', key: 'showMail' } as const, false)
const showMailroom = atom({ plugin: 'tamaclaudchi', key: 'showMailroom' } as const, false)
const mailTab = atom({ plugin: 'tamaclaudchi', key: 'mailTab' } as const, null as string | null)
const mailSeen = atom({ plugin: 'tamaclaudchi', key: 'mailSeen' } as const, {} as Record<string, number>)
const mailText = atom({ plugin: 'tamaclaudchi', key: 'mailText' } as const, null as { key: string; byId: Record<string, string> } | null)

const TITLE = 'TamaClaudchi'
/** The header says which copy of the mod a pane runs: keep in step with .claude-plugin/plugin.json. */
const VERSION = '0.1.0'
/** With the pane closed and no alerts to raise, only the footer shows the pets: read them this many polls apart. */
const CLOSED_POLLS = 4
/** With every face dozing, the footer moves one frame in this many. */
const DOZE_FRAMES = 3

/** How often this session polls: every poll while its pane is open or alerts are on, else a few polls apart. */
const everyMs = (isPaneOpen: boolean) => (!isPaneOpen && settings.alerts === 'off' ? settings.pollMs * CLOSED_POLLS : settings.pollMs)

async function open($: EngineInterface, focus: boolean) {
  await update($, isOpen, () => true)
  await refresh($)
  return $.ui.open(focus ? { id: PANE, title: TITLE, focus: true } : { id: PANE, title: TITLE })
}

export const register: Register = (on, options) => {
  applyOptions(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'tama', description: 'Open the TamaClaudchi shelf: every session, across folders, as a pet' })
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
    void $.session.id().then(id => update($, me, () => id))
    await update($, version, () => VERSION)
    // Unasked, a pane seats from 144 columns and waits below that, so on a
    // wide terminal your pet greets you at start, as the logo would.
    if (settings.autoOpen) void open($, false)
    else void refresh($, { everyMs: everyMs(false) })
    // Alerts need the moods at every poll; the footer alone can wait longer.
    // Only one session on the machine reads the transcripts (shared.ts).
    let polls = 0
    $.clock.every(settings.pollMs, () => void read($, isOpen).then(o => {
      const ms = everyMs(o)
      if (ms === settings.pollMs || ++polls % CLOSED_POLLS === 0) return refresh($, { everyMs: ms })
    }))
    // the footer's faces move: its next frame, while there are any (the footer
    // alone reads the frame, so nothing else is drawn again); dozing faces
    // alone snore slower, so an idle machine redraws less
    let frames = 0
    $.clock.every(FOOTER_FRAME_MS, () => void read($, sessions).then(list => {
      const live = list.filter(s => s.live)
      if (!live.length) return
      if (live.some(s => s.mood === 'busy' || s.mood === 'needs') || ++frames % DOZE_FRAMES === 0) return update($, footerFrame, n => n + 1)
    }))
    return next(e)
  })

  on('command.run', { command: 'tama' }, async ($, e) => {
    await open($, true)
    // the main screen (tmux's default) seats the pane above the prompt, not docked on the right
    if (!e.presentation.isFullscreen) $.ui.toast('Shown above the prompt: run /tui fullscreen (or set "tui": "fullscreen" in settings) to dock it on the right.', { timeoutMs: 8000 })
    return { text: 'TamaClaudchi shelf opened.' }
  })

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

  // another session's shelf asks this one's pet to rename itself (actions.ts)
  on('session.receive', async ($, e, next) => {
    const at = e.text.indexOf(RENAME_TAG)
    if (e.origin.kind !== 'peer' || e.origin.plugin !== 'tamaclaudchi' || at < 0) return next(e)
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
