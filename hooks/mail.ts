// Messages between sessions (cross-session SendMessage), as their transcripts
// record them. The sender's holds its SendMessage call, then the call's result
// with the message's id; the receiver's holds the message with the same id,
// the sender's verified pid, socket and name, and its text. A message seen
// from both ends is one message, joined by its id.
import type { Live, Mail, TamaSession } from '../types'

/**
 * The awk pass the read scripts run over a transcript's new bytes: each line
 * that may be a message's, whole (one past MAIL_LINE characters is left out),
 * for the JSON parse below to tell which really are.
 */
const MAIL_LINE = 262_144
export const MAIL_AWK = String.raw`(index($0, "\"kind\":\"peer\"") || index($0, "\"name\":\"SendMessage\"") || index($0, "\"msg_id\"")) && length($0) <= ${MAIL_LINE} { print "M\t" $0 }`

/**
 * The same pass's note of each prompt you typed (Claude Code marks them
 * `"promptSource":"typed"`), as a `"lastPrompt":"<its timestamp>"` fact: the
 * newest one read wins, however far back it is from the tail.
 */
export const PROMPT_AWK = String.raw`index($0, "\"promptSource\":\"typed\"") && match($0, /"timestamp":"[^"]*"/) { print "\"lastPrompt\"" substr($0, RSTART + 11, RLENGTH - 11) }`

/** What one line says of a message: one arrived, one was sent, or a send's result. */
export type MailFact =
  | { kind: 'in'; id: string; at: number; fromPid: number | null; fromAddr: string | null; fromName: string | null; text: string }
  | { kind: 'out'; toolId: string; at: number; to: string; text: string; isSession: boolean }
  | { kind: 'res'; toolId: string; id: string | null; ok: boolean; isSession: boolean }

/**
 * A send's result that says it went to another Claude session (on this
 * machine, another, or in the cloud), not to a subagent or a teammate.
 */
const SESSION_RESULT = /Claude session|Remote Control|cloud session/i

/** A name as SendMessage addresses it, less the ` [3fa9c1]` ref added when two sessions share it. */
const bareName = (to: string) => to.replace(/ \[[0-9a-f]{4,}\]$/i, '')

/** How much of a message the shelf's cache keeps; a page reads it whole. */
const TEXT_KEPT = 2000

type Line = {
  type?: string
  timestamp?: string
  origin?: Record<string, unknown>
  attachment?: { origin?: Record<string, unknown> }
  message?: { content?: unknown }
  toolUseResult?: unknown
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

/** Reads the awk pass's `M` lines into `into`, keyed so that a line read twice (a read backed up over it) is one fact. */
export function readMail(text: string, into: Map<string, MailFact>, chars = TEXT_KEPT) {
  for (const l of text.split('\n')) {
    if (!l.startsWith('M\t')) continue
    let d: Line
    try { d = JSON.parse(l.slice(2)) } catch { continue }
    const at = Date.parse(d.timestamp ?? '') || 0
    // one arrived: as a turn of its own (the line's origin) or into a running one (an attachment's)
    const o = d.type === 'user' ? d.origin : d.type === 'attachment' ? d.attachment?.origin : undefined
    const id = str(o?.msg_id)
    if (o?.kind === 'peer' && id && str(o.from)) {
      const pid = o.verifiedPeerPid
      into.set(`in:${id}`, {
        kind: 'in', id, at, text: (str(o.body) ?? '').slice(0, chars),
        fromPid: typeof pid === 'number' && Number.isInteger(pid) ? pid : null, fromAddr: str(o.from), fromName: str(o.name),
      })
      continue
    }
    const content = Array.isArray(d.message?.content) ? (d.message!.content as Record<string, unknown>[]) : []
    if (d.type === 'assistant') {
      for (const b of content) {
        const input = b?.input as Record<string, unknown> | undefined
        const to = str(input?.to), toolId = str(b?.id)
        if (b?.type === 'tool_use' && b.name === 'SendMessage' && to && toolId) {
          into.set(`out:${toolId}`, {
            kind: 'out', toolId, at, to, text: (str(input?.message) ?? '').slice(0, chars), isSession: input?.recipient_kind === 'session',
          })
        }
      }
    } else if (d.type === 'user') {
      // a send's result: its message's id, or why it was not sent
      const r = d.toolUseResult as Record<string, unknown> | undefined
      const toolId = str(content.find(b => b?.type === 'tool_result')?.tool_use_id)
      if (toolId && r && typeof r === 'object' && ('msg_id' in r || 'success' in r)) {
        into.set(`res:${toolId}`, {
          kind: 'res', toolId, id: str(r.msg_id), ok: r.success !== false, isSession: SESSION_RESULT.test(str(r.message) ?? ''),
        })
      }
    }
  }
}

/** One message as one pet's transcript tells it, with its text; `isSession`: a send its result says went to a session. */
export type Letter = Omit<Mail, 'peer'> & { text: string; to: string | null; fromPid: number | null; fromAddr: string | null; isSession: boolean }

/** A pet's messages, oldest first: what arrived, and what it sent, joined to each send's result. */
export function lettersOf(facts: Iterable<MailFact>): Letter[] {
  const all = [...facts]
  const results = new Map(all.flatMap(f => (f.kind === 'res' ? [[f.toolId, f] as const] : [])))
  const out: Letter[] = []
  for (const f of all) {
    if (f.kind === 'in') {
      out.push({
        id: f.id, at: f.at, dir: 'in', peerName: f.fromName, ok: true, text: f.text, to: null, fromPid: f.fromPid, fromAddr: f.fromAddr, isSession: true,
      })
    } else if (f.kind === 'out') {
      const r = results.get(f.toolId)
      out.push({
        id: r?.id ?? `tool:${f.toolId}`, at: f.at, dir: 'out', peerName: f.to, ok: r?.ok ?? true, text: f.text, to: f.to, fromPid: null, fromAddr: null,
        isSession: f.isSession || !!r?.isSession,
      })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** How many messages a pet keeps on the shelf, the newest. */
const MAIL_KEPT = 50

/**
 * Every pet's messages since `since`, each end named: by the message's id
 * when both ends are on the shelf, else by the registry (the sender's
 * verified pid, the socket a reply goes to, or a live session's name). A send
 * to no session known here, that nobody here received, went to a subagent or
 * a teammate rather than a session, and is left out.
 */
export function mailEdges(
  pets: { id: string; facts: Iterable<MailFact> | undefined }[], live: Map<string, Live>, since: number,
): Map<string, Mail[]> {
  const byPid = new Map<number, string>(), byAddr = new Map<string, string>(), byName = new Map<string, string | null>()
  for (const [id, l] of live) {
    if (l.isElsewhere) continue
    byPid.set(l.pid, id)
    if (l.socket) byAddr.set(`uds:${l.socket}`, id)
    // a name two sessions share names neither
    if (l.name) byName.set(l.name, byName.has(l.name) ? null : id)
  }
  const letters = pets.map(p => ({ id: p.id, list: lettersOf(p.facts ?? []).filter(m => m.at >= since) }))
  // each message's two ends, by its id
  const ends = new Map<string, { from?: string; to?: string }>()
  for (const p of letters) {
    for (const m of p.list) {
      const e = ends.get(m.id) ?? {}
      if (m.dir === 'out') e.from = p.id
      else e.to = p.id
      ends.set(m.id, e)
    }
  }
  const out = new Map<string, Mail[]>()
  for (const p of letters) {
    const mail: Mail[] = []
    // who wrote from each socket: a reply goes back to its sender's socket, so
    // it is that sender's, even once it has closed
    const bySocket = new Map<string, { peer: string | null; name: string | null }>()
    for (const m of p.list) {
      const e = ends.get(m.id)!
      if (m.dir === 'in') {
        const peer = e.from ?? byPid.get(m.fromPid ?? -1) ?? byAddr.get(m.fromAddr ?? '') ?? byName.get(m.peerName ?? '') ?? null
        if (m.fromAddr) bySocket.set(m.fromAddr, { peer, name: m.peerName })
        mail.push({ id: m.id, at: m.at, dir: 'in', peer, peerName: m.peerName, ok: true })
      } else {
        const to = m.to!, name = bareName(to)
        const isSocket = to.startsWith('uds:')
        const wrote = isSocket ? bySocket.get(to) : undefined
        const peer = e.to ?? byAddr.get(to) ?? byName.get(name) ?? wrote?.peer ?? null
        // to a session on another machine or in the cloud: kept, its result says so
        if (!peer && !isSocket && !m.isSession) continue
        mail.push({ id: m.id, at: m.at, dir: 'out', peer, peerName: isSocket ? wrote?.name ?? null : name, ok: m.ok })
      }
    }
    if (mail.length) out.set(p.id, mail.slice(-MAIL_KEPT))
  }
  return out
}

/** Every message on the shelf once, newest first: its sender and its receiver, each a pet's id where known. */
export type Post = { id: string; at: number; from: string | null; fromName: string | null; to: string | null; toName: string | null; ok: boolean }

export function postsOf(shelf: TamaSession[]): Post[] {
  const byId = new Map<string, Post>()
  for (const s of shelf) {
    for (const m of s.mail ?? []) {
      const p = byId.get(m.id) ?? { id: m.id, at: m.at, from: null, fromName: null, to: null, toName: null, ok: m.ok }
      if (m.dir === 'out') {
        p.from = s.id
        p.to ??= m.peer
        p.toName ??= m.peerName
        p.ok = m.ok
      } else {
        p.to = s.id
        p.from ??= m.peer
        p.fromName ??= m.peerName
      }
      byId.set(m.id, p)
    }
  }
  return [...byId.values()].sort((a, b) => b.at - a.at)
}

/**
 * What a page reads its messages' texts for: the pets with messages, and a
 * key of their messages' ids, the same at the read and at the page. A page
 * whose key the last read holds has read all there is to find.
 */
export function mailRead(pets: TamaSession[]) {
  const withMail = pets.filter(s => s.path && s.mail?.length)
  return { withMail, key: withMail.flatMap(s => s.mail!.map(m => `${s.id}:${m.id}`)).join('|') }
}

/** One end of a conversation: a pet's id where known, and the name its messages gave it. */
export type End = { id: string | null; name: string | null }

/** Every message between the same two sessions, oldest first; `at` is its newest's. */
export type Thread = { key: string; ends: [End, End]; posts: Post[]; at: number }

const endKey = (e: End) => e.id ?? `name:${e.name ?? '?'}`

/** The messages as conversations, one per pair of sessions, the one written in last first. */
export function threadsOf(posts: Post[]): Thread[] {
  const byKey = new Map<string, Thread>()
  for (const p of [...posts].sort((a, b) => a.at - b.at)) {
    // the pair in a fixed order, whichever of the two wrote
    const ends = ([{ id: p.from, name: p.fromName }, { id: p.to, name: p.toName }] as [End, End])
      .sort((a, b) => (endKey(a) < endKey(b) ? -1 : 1))
    const key = ends.map(endKey).join('|')
    const t = byKey.get(key) ?? { key, ends, posts: [], at: 0 }
    // a later message may know an end's name the first did not
    for (const i of [0, 1] as const) t.ends[i].name ??= ends[i].name
    t.posts.push(p)
    t.at = p.at
    byKey.set(key, t)
  }
  return [...byKey.values()].sort((a, b) => b.at - a.at)
}

/** Whether a post was written by this end of its conversation. */
export const isFrom = (p: Post, e: End) => (e.id ? p.from === e.id : !p.from && p.fromName === e.name)

/**
 * Whether a pet sent or received a message lately that you have not caught up
 * on: one since you last typed to it there, or looked at it here (`seenMs`:
 * opened it, jumped to it, messaged it, read its conversation). Its card says so.
 */
const MAIL_RECENT_MS = 10 * 60_000
export function hasRecentMail(s: TamaSession, now: number, seenMs = 0) {
  const caughtUp = Math.max(seenMs, s.lastPromptMs ?? 0)
  return !!s.mail?.some(m => now - m.at < MAIL_RECENT_MS && m.at > caughtUp)
}
