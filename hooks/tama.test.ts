import { expect, mock, test } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'

import type { TamaSession } from '../types'

import { ANIM_H, modelLabel, outfits, stickySlots, PET_H, PET_W, petCells, petFrames, petPixels, petRest } from './pets'
import { isSad, parseSession, rederive, withLive } from './sessions'
import { costOf } from './pricing'
import { vivid } from './format'
import { MODEL_SKIN, REPO_SKINS } from './sprites'
import { dayOf, readCalls, spendOf, type Call } from './spend'
import { canTellApart, followed, forgetProcesses, isRunning, parentOf } from './register'
import { machineFrom, newMail, news, searchGraves } from './plain'
import { hasRecentMail, isFrom, mailEdges, postsOf, readMail, threadsOf, type MailFact } from './mail'
import { mailFrames } from './pets'
import { settings } from './config'

const NOW = 1_800_000_000_000
/** Dollars equal to the nanodollar, the way float sums allow. */
const near = (a: number | null | undefined, b: number) => expect(Math.abs((a ?? NaN) - b) < 1e-9).toBe(true)
const line = (o: object) => JSON.stringify(o)
const assistant = (stop: string, model = 'claude-opus-5-5') =>
  line({
    type: 'assistant', cwd: '/home/x/src/acorn/.claude/worktrees/feat', gitBranch: 'feat',
    message: { role: 'assistant', model, stop_reason: stop, usage: { input_tokens: 10, cache_read_input_tokens: 90_000 } },
  })

test('model ids read as TamaClaudchi labels them', async () => {
  expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelLabel(null)).toBe('egg')
})

test('a transcript tail gives repo, branch, model, context and mood', async () => {
  const tail = 'cut-off-half-line"}\n' + assistant('end_turn') + '\n'
  const s = parseSession('abc', tail, 'Fix the thing', NOW - 1000, NOW)
  expect(s.repo).toBe('acorn')
  expect(s.branch).toBe('feat')
  expect(s.model).toBe('claude-opus-5-5')
  expect(s.contextTokens).toBe(90_010)
  expect(s.mood).toBe('waiting')
  expect(s.title).toBe('Fix the thing')
})

test('a tool call left unanswered for a while may need you', async () => {
  expect(parseSession('a', assistant('tool_use'), null, NOW - 5_000, NOW).mood).toBe('busy')
  expect(parseSession('a', assistant('tool_use'), null, NOW - 60_000, NOW).mood).toBe('needs')
})

test('a quiet turn waits, a quiet tool call may need you', async () => {
  const thinking = parseSession('a', line({ type: 'user', message: { role: 'user', content: 'go' } }), null, NOW, NOW)
  expect(thinking.mood).toBe('busy')
  expect(rederive(thinking, NOW + 60_000).mood).toBe('busy')
  expect(rederive(thinking, NOW + 10 * 60_000).mood).toBe('waiting')
  const tool = parseSession('a', assistant('tool_use'), null, NOW, NOW)
  expect(rederive(tool, NOW + 60_000).mood).toBe('needs')
})

test('a running pet is as its registry says, however long its tool call takes', async () => {
  const live = (status: string | null, waitingFor: string | null = null) =>
    ({ pid: 1, procStart: null, status, waitingFor, tmux: null, name: null, isRemote: false, isElsewhere: false, cwd: null, startedMs: null, socket: null })
  // a commit hook running for minutes: the tool call is old, but the session is busy
  const slow = parseSession('a', assistant('tool_use'), null, NOW - 5 * 60_000, NOW)
  expect(slow.mood).toBe('needs') // what the transcript alone would guess
  expect(withLive(slow, live('busy')).mood).toBe('busy')
  expect(withLive(slow, live('waiting', 'permission prompt')).mood).toBe('needs')
  expect(withLive(slow, live('idle')).mood).toBe('waiting')
  expect(withLive(slow, live(null)).mood).toBe('needs') // an older Claude Code: the guess stands
  expect(withLive(slow, null).mood).toBe('idle') // closed
})

test('a dead pet wears a halo, and on hover only blinks while it glows', async () => {
  const s = parseSession('a', assistant('end_turn'), null, NOW, NOW)
  const o = outfits([s]).get('a')!
  expect(petRest(o, { halo: true }).cells).not.toBe(petRest(o).cells)
  const ghost = petFrames(o, { halo: true })
  expect(ghost.length).toBe(16)
  expect(new Set(ghost).size).toBeGreaterThan(8) // the glow changes smoothly, frame to frame
  // no hop: the body never leaves its rest row, so the frames differ only in
  // the halo's row (the first) and the eyes, never in the legs (the last)
  const rows = (cells: string) => {
    const words = new Uint32Array(new Uint8Array(Array.from(atob(cells), c => c.charCodeAt(0))).buffer)
    const per = PET_W * 3
    return Array.from({ length: words.length / per }, (_, r) => words.slice(r * per, (r + 1) * per).join(','))
  }
  const restRows = rows(ghost[0]!)
  for (const f of ghost) expect(rows(f).at(-1)).toBe(restRows.at(-1))
})

test('a hovered pet has four frames of motion, and they differ', async () => {
  const s = parseSession('a', assistant('end_turn'), null, NOW, NOW)
  const o = outfits([s]).get('a')!
  const frames = petFrames(o)
  const rest = petRest(o)
  expect(frames.length).toBe(4)
  expect(rest.rows).toBe(ANIM_H / 2)
  expect(rest.columns).toBe(PET_W)
  expect(frames[0]).toBe(rest.cells)
  expect(frames[1]).not.toBe(frames[0])
  expect(frames[2]).not.toBe(frames[0]) // the blink
})

test('the preview keeps prompts and replies, not the narration between tool calls', async () => {
  const say = (stop: string, text: string) => line({ type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text }] } })
  const tail = [
    line({ type: 'user', message: { role: 'user', content: 'fix it' } }),
    say('tool_use', 'Let me look at the file first.'),
    line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
    say('end_turn', 'Fixed.'),
  ].join('\n')
  const recent = parseSession('a', tail, null, NOW, NOW).recent
  expect(recent.map(m => [m.role, m.text])).toEqual([['user', 'fix it'], ['assistant', 'Fixed.']])
})

test('list prices: the longest model prefix wins, and an hour-long cache write costs double', async () => {
  expect(costOf('claude-opus-5-5', { input_tokens: 1_000_000 })).toBe(4)
  expect(costOf('claude-opus-5', { input_tokens: 1_000_000 })).toBe(5)
  expect(costOf('claude-haiku-4-5-20251001', { output_tokens: 1_000_000 })).toBe(5)
  expect(costOf('claude-opus-5-5', {
    cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 0 },
  })).toBe(8)
  expect(costOf('some-other-model', { input_tokens: 10 })).toBe(null)
  // Opus 4 and 4.1 cost three times what Opus 4.5 and later do
  expect(costOf('claude-opus-4-1-20250805', { input_tokens: 1_000_000 })).toBe(15)
  expect(costOf('claude-opus-4-5', { input_tokens: 1_000_000 })).toBe(5)
})

test("a reply carries its turn's time, tokens and cost, each API call counted once", async () => {
  const call = (id: string, stop: string, content: object[], at: string) => line({
    type: 'assistant', timestamp: at,
    message: { id, role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, content, usage: { input_tokens: 1000, output_tokens: 1000 } },
  })
  const tail = [
    line({ type: 'user', timestamp: '2026-10-09T10:00:00Z', message: { role: 'user', content: 'go fix it please' } }),
    call('m1', 'tool_use', [{ type: 'thinking', thinking: '' }], '2026-10-09T10:00:01Z'),
    call('m1', 'tool_use', [{ type: 'tool_use', name: 'Bash' }], '2026-10-09T10:00:01Z'), // the same call, again
    line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
    call('m2', 'end_turn', [{ type: 'text', text: 'Done.' }], '2026-10-09T10:00:09Z'),
  ].join('\n')
  const [you, pet] = parseSession('a', tail, null, NOW, NOW).recent
  expect(you).toMatchObject({ role: 'user', tokens: 4, costUsd: null, at: Date.parse('2026-10-09T10:00:00Z') })
  expect(pet).toMatchObject({ role: 'assistant', tokens: 4000, at: Date.parse('2026-10-09T10:00:09Z') })
  // two calls, each 1k in at $4/M and 1k out at $20/M
  expect(Math.abs(pet!.costUsd! - 2 * (0.004 + 0.02)) < 1e-9).toBe(true)
})

test('no reply yet is an egg', async () => {
  const s = parseSession('a', line({ type: 'user', cwd: '/r', message: { role: 'user', content: 'hi' } }), null, NOW, NOW)
  expect(s.model).toBe(null)
  expect(outfits([s]).get('a')?.isEgg).toBe(true)
})

test('a pet packs into half-block cells', async () => {
  const s = parseSession('a', assistant('end_turn'), null, NOW, NOW)
  const o = outfits([s]).get('a')!
  expect(o.hat).toBe('crown')
  const one = petCells(petPixels(o))
  expect(one.columns).toBe(PET_W)
  expect(one.rows).toBe(PET_H / 2)
})

test('a colour once given stays: a newcomer takes a free slot, and moves no one', async () => {
  const first = stickySlots(['repo:a', 'repo:b'], 16, {}, 1)
  const later = stickySlots(['repo:a', 'repo:b', 'repo:0', 'repo:zz'], 16, first, 2)
  expect(later['repo:a']![0]).toBe(first['repo:a']![0])
  expect(later['repo:b']![0]).toBe(first['repo:b']![0])
  const slots = ['repo:a', 'repo:b', 'repo:0', 'repo:zz'].map(k => later[k]![0])
  expect(new Set(slots).size).toBe(4)
  // gone from the shelf, a repo keeps its slot for when it comes back
  const back = stickySlots(['repo:a'], 16, stickySlots(['repo:b'], 16, later, 3), 4)
  expect(back['repo:a']![0]).toBe(first['repo:a']![0])
})

test('five repos on main hold five items; one checkout holds one', async () => {
  const at = (id: string, repo: string, branch: string) =>
    ({ ...parseSession(id, assistant('end_turn'), null, NOW, NOW), repo, branch, cwd: '/r/' + repo })
  const all = ['a', 'b', 'c', 'd', 'e'].map(r => at(r, r, 'main'))
  const looks = outfits([...all, at('a2', 'a', 'main')])
  expect(new Set(all.map(s => looks.get(s.id)!.item)).size).toBe(5)
  expect(looks.get('a2')!.item).toBe(looks.get('a')!.item)
  expect(looks.get('a2')!.skin).toBe(looks.get('a')!.skin)
})

test('every pet colour, pinks included, keeps its hue at full strength in the footer', async () => {
  for (const { body } of [...REPO_SKINS, ...Object.values(MODEL_SKIN)]) {
    const out = vivid(body)
    expect(out).toMatch(/^#[0-9a-f]{6}$/)
    // the channel that leads stays the one that leads
    const ch = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    const [r, g, b] = ch(body), [r2, g2, b2] = ch(out)
    const lead = (x: number[]) => x.indexOf(Math.max(...x))
    if (new Set([r, g, b]).size === 3) expect(lead([r2!, g2!, b2!])).toBe(lead([r!, g!, b!]))
  }
  // a pink stays a pink: red first, then blue over green
  const [, g, b] = [1, 3, 5].map(i => parseInt(vivid('#f794d2').slice(i, i + 2), 16))
  expect(b!).toBeGreaterThan(g!)
})

test('Haiku 5.5 is priced on its short-prompt card, and its long one past 100K tokens', async () => {
  // up to 100K tokens of prompt, the short card; a million is itself a long prompt
  near(costOf('claude-haiku-5-5', { input_tokens: 100_000 }), 0.01)
  near(costOf('claude-haiku-5-5', { input_tokens: 1_000_000 }), 0.5)
  near(costOf('claude-haiku-5-5', { output_tokens: 1_000_000 }), 0.5)
  near(costOf('claude-haiku-5-5', { input_tokens: 50_000, cache_read_input_tokens: 40_000, output_tokens: 1000 })!,
    50_000 * 0.1e-6 + 40_000 * 0.01e-6 + 1000 * 0.5e-6)
  // over 100K of prompt, the whole call moves to the long card
  near(costOf('claude-haiku-5-5', { input_tokens: 20_000, cache_read_input_tokens: 90_000, output_tokens: 1000 })!,
    20_000 * 0.5e-6 + 90_000 * 0.05e-6 + 1000 * 2.5e-6)
  near(costOf('claude-haiku-4-5-20251001', { input_tokens: 1_000_000 }), 1)
})

test('spend counts each API call once, by its message id, and leaves unpriced models out of the dollars', async () => {
  const at = new Date(NOW).toISOString()
  const calls = new Map<string, Call>()
  // a call written once per content block, its usage on each line
  readCalls([
    `U msg_a claude-opus-5-5 ${at} 10 1000 90000 0 - -`,
    `U msg_a claude-opus-5-5 ${at} 10 1000 90000 0 - -`,
    'not a usage line',
    `U msg_b claude-unknown-9 ${at} 10 10 0 0 - -`,
    `U msg_c - ${at} 0 0 0 0 - -`, // an error's stand-in: nothing moved
    `U msg_d claude-sonnet-5-5 ${at} 0 0 0 2000 0 2000`, // a one-hour cache write
  ].join('\n'), calls)
  expect([...calls.keys()]).toEqual(['msg_a', 'msg_b', 'msg_d'])
  const spend = spendOf(calls.values(), NOW, 1)
  expect(spend.calls).toBe(3)
  expect(spend.unpriced).toBe(1)
  const opus = 10 * 4e-6 + 1000 * 20e-6 + 90_000 * 0.2e-6
  const hour = 2000 * 2e-6 * 2
  near(spend.usd, opus + hour)
  near(spend.days[dayOf(NOW)], opus + hour)
  // a call older than the window counts in all, not by day
  readCalls(`U msg_e claude-opus-5-5 ${new Date(NOW - 3 * 86_400_000).toISOString()} 0 1000 0 0 - -`, calls)
  const later = spendOf(calls.values(), NOW, 1)
  near(later.usd, opus + hour + 1000 * 20e-6)
  expect(Object.keys(later.days)).toEqual([dayOf(NOW)])
})

test('an alert goes out when a pet starts to need you, and on finishing only when asked for', async () => {
  const pet = (id: string, mood: 'busy' | 'needs' | 'waiting' | 'idle') => ({
    ...parseSession(id, '', null, NOW, NOW), mood,
    live: { pid: 1, procStart: null, status: null, waitingFor: null, tmux: null, name: null, isRemote: false, isElsewhere: false, cwd: null, startedMs: null, socket: null },
  })
  const prev = new Map([['a', 'busy' as const], ['b', 'needs' as const], ['c', 'busy' as const]])
  const shelf = [pet('a', 'needs'), pet('b', 'needs'), pet('c', 'waiting'), pet('d', 'needs')]
  // a starts to need you, b already did, d is new and needs you; nothing on the first poll
  expect(news(shelf, null).needs).toEqual([])
  expect(news(shelf, prev).needs.map(s => s.id)).toEqual(['a', 'd'])
  expect(news(shelf, prev).done).toEqual([])
  settings.alertOnDone = true
  try {
    expect(news(shelf, prev).done.map(s => s.id)).toEqual(['c'])
  } finally {
    settings.alertOnDone = false
  }
})

test('a pet left waiting on you for a while looks sad, until it falls asleep', async () => {
  const live = { pid: 1, procStart: null, status: 'idle', waitingFor: null, tmux: null, name: null, isRemote: false, isElsewhere: false, cwd: null, startedMs: null, socket: null }
  const waiting = withLive(parseSession('a', assistant('end_turn'), null, NOW - 45 * 60_000, NOW), live)
  expect(waiting.mood).toBe('waiting')
  expect(isSad(waiting, NOW, 30 * 60_000)).toBe(true)
  expect(isSad(waiting, NOW, 60 * 60_000)).toBe(false)
  expect(isSad(waiting, NOW, 0)).toBe(false) // turned off
  expect(isSad(waiting, NOW + 7 * 3600_000, 30 * 60_000)).toBe(false) // asleep by then
  expect(isSad({ ...waiting, live: null }, NOW, 30 * 60_000)).toBe(false) // closed
  expect(isSad({ ...waiting, mood: 'busy' }, NOW, 30 * 60_000)).toBe(false)
  // the sad face differs from the content one
  const o = outfits([waiting]).get('a')!
  expect(petRest(o, { faded: false, sad: true }).cells).not.toBe(petRest(o, { faded: false }).cells)
})

test('a session follows the shelf another reads while its lease holds, and takes over when it lapses', async () => {
  const paths = { dir: '/h/.claude/tamaclaudchi', lease: '/h/.claude/tamaclaudchi/lease-m.json', shelf: '/h/.claude/tamaclaudchi/shelf-m.json' }
  let lease = { schema: 3, by: 'other', at: NOW, everyMs: 4000 }
  const shelf = { schema: 3, disk: null, sessions: [] }
  // the reads it makes, as the engine's fs would answer them
  const $ = { fs: {
    stat: async () => ({ kind: 'file', size: JSON.stringify(shelf).length, mtimeMs: 1, isLink: false }),
    read: async (path: string) => JSON.stringify(path === paths.lease ? lease : shelf),
  } } as unknown as EngineInterface
  expect(await followed($, paths, 'me', NOW + 1000, 4000)).not.toBeNull()
  // the lease is this session's own
  expect(await followed($, paths, 'other', NOW + 1000, 4000)).toBeNull()
  // not renewed for three of its polls: anyone's
  expect(await followed($, paths, 'me', NOW + 13_000, 4000)).toBeNull()
  // it reads less often than this pane wants
  lease = { ...lease, everyMs: 16_000 }
  expect(await followed($, paths, 'me', NOW + 1000, 4000)).toBeNull()
  // written by another version of the mod: read for yourself
  lease = { ...lease, everyMs: 4000, schema: 99 }
  expect(await followed($, paths, 'me', NOW + 1000, 4000)).toBeNull()
})

test('on a Mac, with no /proc, a process is checked by ps, and a pid given to a newer one is told apart', async () => {
  // ps in UTC, as the registry writes a process's start there; a day of one digit is padded
  let table = '  863 95670 Thu Oct 22 22:09:06 2026\n 1113   863 Thu Oct 22 22:10:12 2026\n 2002     1 Fri Oct  2 09:00:00 2026\n'
  let runs = 0
  const $ = {
    fs: { exists: async () => false, read: async () => { throw new Error('ENOENT') } },
    process: { run: async (argv: string[]) => {
      if (argv.includes('ps')) runs++
      return { exitCode: 0, stdout: argv.includes('ps') ? table : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    } },
  } as unknown as EngineInterface
  forgetProcesses()
  expect(await isRunning($, 1113, 'Thu Oct 22 22:10:12 2026')).toBe(true)
  expect(await isRunning($, 2002, 'Fri Oct 2 09:00:00 2026')).toBe(true)
  expect(await isRunning($, 1113, 'Wed Oct 21 08:00:00 2026')).toBe(false) // its pid, given to a newer process
  expect(await isRunning($, 4242, null)).toBe(false)
  expect(await parentOf($, 1113)).toBe(863) // its shell, up to its tmux pane
  expect(runs).toBe(1) // one ps for a poll's checks
  expect(await canTellApart($, 'Thu Oct 22 22:10:12 2026')).toBe(true)
  expect(await canTellApart($, '777')).toBe(false) // a start time as Linux writes it: nothing to compare here
  expect(await canTellApart($, null)).toBe(false)
  // it has ended since: seen at the next read of the table
  table = '  863 95670 Thu Oct 22 22:09:06 2026\n'
  forgetProcesses()
  expect(await isRunning($, 1113, 'Thu Oct 22 22:10:12 2026')).toBe(false)
})

// Two sessions' transcripts as Claude Code writes a message between them:
// `a` sends with SendMessage and gets the message's id back; `b` receives it,
// with the same id, `a`'s verified pid and name, and its text.
const at = (s: number) => new Date(NOW - s * 1000).toISOString()
const SENT = [
  line({ type: 'assistant', timestamp: at(60), message: { role: 'assistant', content: [
    { type: 'tool_use', id: 'toolu_1', name: 'SendMessage', input: { to: 'bramble', message: 'Schema migration finished\nRebasing is safe now.' } }] } }),
  line({ type: 'user', timestamp: at(59), toolUseResult: { success: true, msg_id: 'm-1' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'sent' }] } }),
  // to a subagent of its own: no session's business
  line({ type: 'assistant', timestamp: at(50), message: { role: 'assistant', content: [
    { type: 'tool_use', id: 'toolu_2', name: 'SendMessage', input: { to: 'researcher', message: 'start on task 1' } }] } }),
  line({ type: 'user', timestamp: at(49), toolUseResult: { success: true, msg_id: 'm-2' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'sent' }] } }),
]
const peerOrigin = (id: string, body: string) => ({ kind: 'peer', from: 'uds:/tmp/cc-socks/10.sock', verifiedPeerPid: 10, msg_id: id, name: 'acorn', body })
const RECEIVED = [
  // into a running turn, as an attachment
  line({ type: 'attachment', timestamp: at(58), attachment: { type: 'queued_command', origin: peerOrigin('m-1', 'Schema migration finished\nRebasing is safe now.') } }),
  // as a turn of its own, on the user's line
  line({ type: 'user', timestamp: at(30), origin: peerOrigin('m-3', 'Are the tests green?'), message: { role: 'user', content: 'Another Claude session sent a message: …' } }),
  // a tool result that merely quotes a message's fields: not a message
  line({ type: 'user', timestamp: at(20), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_9', content: '"kind":"peer","msg_id":"m-9"' }] } }),
]
const asAwk = (lines: string[]) => lines.map(l => `M\t${l}`).join('\n')
const factsOf = (lines: string[]) => {
  const m = new Map<string, MailFact>()
  readMail(asAwk(lines), m)
  return m
}
const liveOf = (pid: number, name: string) =>
  ({ pid, procStart: null, status: 'idle', waitingFor: null, tmux: null, name, isRemote: false, isElsewhere: false, cwd: null, startedMs: null, socket: `/tmp/cc-socks/${pid}.sock` })

test('a message between two sessions is read from both ends, joined by its id, and one to a subagent is left out', async () => {
  const sent = factsOf(SENT), got = factsOf(RECEIVED)
  // read twice (a read backed up over it): the same facts
  readMail(asAwk(RECEIVED), got)
  expect([...got.values()].filter(f => f.kind === 'in').length).toBe(2)
  const live = new Map([['a', liveOf(10, 'acorn')], ['b', liveOf(20, 'bramble')]])
  const edges = mailEdges([{ id: 'a', facts: sent.values() }, { id: 'b', facts: got.values() }], live, NOW - 86_400_000)
  // a sent m-1 to b; its send to the subagent `researcher` is no session's
  expect(edges.get('a')).toEqual([{ id: 'm-1', at: NOW - 60_000, dir: 'out', peer: 'b', peerName: 'bramble', ok: true }])
  // b got m-1 from a, and m-3, whose sender is known by its verified pid
  expect(edges.get('b')!.map(m => [m.id, m.dir, m.peer])).toEqual([['m-1', 'in', 'a'], ['m-3', 'in', 'a']])
  // older than the window: gone
  expect(mailEdges([{ id: 'b', facts: got.values() }], live, NOW - 45_000).get('b')!.map(m => m.id)).toEqual(['m-3'])
  // the messages page: each message once, newest first, both ends named
  const pet = (id: string) => ({ ...parseSession(id, '', null, NOW, NOW), mail: edges.get(id) ?? null })
  expect(postsOf([pet('a'), pet('b')]).map(p => [p.id, p.from, p.to])).toEqual([['m-3', 'a', 'b'], ['m-1', 'a', 'b']])
})

test('a send refused is kept, marked not sent; one to a closed session is matched by the reply socket', async () => {
  const refused = factsOf([
    line({ type: 'assistant', timestamp: at(10), message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'toolu_3', name: 'SendMessage', input: { to: 'uds:/tmp/cc-socks/20.sock', message: 'hello?' } }] } }),
    line({ type: 'user', timestamp: at(9), toolUseResult: { success: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_3', content: 'Not sent' }] } }),
  ])
  const live = new Map([['b', liveOf(20, 'bramble')]])
  expect(mailEdges([{ id: 'a', facts: refused.values() }], live, 0).get('a')).toEqual([
    { id: 'tool:toolu_3', at: NOW - 10_000, dir: 'out', peer: 'b', peerName: null, ok: false },
  ])
})

test('messages fall into conversations, one per pair of sessions whoever wrote, the latest first', async () => {
  const post = (id: string, at: number, from: string | null, to: string | null, fromName: string | null = null) =>
    ({ id, at, from, fromName, to, toName: null, ok: true })
  const threads = threadsOf([
    post('m-1', 1, 'a', 'b'), post('m-2', 2, 'b', 'a'), // a and b, both ways: one conversation
    post('m-3', 3, 'a', 'c'),
    post('m-4', 4, null, 'a', 'remote-worker'), post('m-5', 5, 'a', 'b'), // from a session known only by its name
  ])
  expect(threads.map(t => t.posts.map(p => p.id))).toEqual([['m-1', 'm-2', 'm-5'], ['m-4'], ['m-3']])
  const [ab, remote] = threads
  expect(ab!.ends.map(e => e.id)).toEqual(['a', 'b'])
  // who wrote each: the bubbles' sides
  expect(ab!.posts.map(p => (isFrom(p, ab!.ends[0]) ? 0 : 1))).toEqual([0, 1, 0])
  expect(isFrom(remote!.posts[0]!, { id: null, name: 'remote-worker' })).toBe(true)
})

test("a send to another machine's session is kept, as its result says, and a name's ref is dropped", async () => {
  const send = (toolId: string, to: string, result: Record<string, unknown>) => [
    line({ type: 'assistant', timestamp: at(20), message: { role: 'assistant', content: [{ type: 'tool_use', id: toolId, name: 'SendMessage', input: { to, message: 'hi' } }] } }),
    line({ type: 'user', timestamp: at(19), toolUseResult: result, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content: 'sent' }] } }),
  ]
  const facts = factsOf([
    // over Remote Control, to a session no registry here knows
    ...send('toolu_5', 'remote-worker', { success: true, msg_id: 'm-5', message: '“hi” → remote-worker (a Remote Control session on another machine)' }),
    // two sessions share the name: addressed with its ref
    ...send('toolu_6', 'bramble [3fa9c1]', { success: true, msg_id: 'm-6', message: '“hi” → bramble (another Claude session on this machine)' }),
  ])
  const live = new Map([['b', liveOf(20, 'bramble')]])
  expect(mailEdges([{ id: 'a', facts: facts.values() }], live, 0).get('a')!.map(m => [m.id, m.peer, m.peerName])).toEqual([
    ['m-5', null, 'remote-worker'], ['m-6', 'b', 'bramble'],
  ])
})

test("a reply to a closed session's socket joins the conversation it answers", async () => {
  const facts = factsOf([
    RECEIVED[0]!, // from acorn, over uds:/tmp/cc-socks/10.sock
    line({ type: 'assistant', timestamp: at(40), message: { role: 'assistant', content: [
      { type: 'tool_use', id: 'toolu_4', name: 'SendMessage', input: { to: 'uds:/tmp/cc-socks/10.sock', message: 'thanks' } }] } }),
    line({ type: 'user', timestamp: at(39), toolUseResult: { success: true, msg_id: 'm-4' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_4', content: 'sent' }] } }),
  ])
  // acorn has closed: nothing in the registry names its socket
  const mail = mailEdges([{ id: 'b', facts: facts.values() }], new Map(), 0).get('b')!
  expect(mail.map(m => [m.id, m.dir, m.peerName])).toEqual([['m-1', 'in', 'acorn'], ['m-4', 'out', 'acorn']])
  const pet = { ...parseSession('b', '', null, NOW, NOW), mail }
  expect(threadsOf(postsOf([pet])).map(t => t.posts.length)).toEqual([2])
})

test("a pet's letter shows until you catch up on it: typing to it there, or looking at it here", async () => {
  // your last prompt there, as the read script's scan of its "promptSource":"typed" lines found it
  const pet = (promptAgo: number) => ({
    ...parseSession('b', '', null, NOW, NOW), lastPromptMs: NOW - promptAgo * 1000,
    mail: [{ id: 'm-1', at: NOW - 60_000, dir: 'in' as const, peer: 'a', peerName: 'acorn', ok: true }],
  })
  // the message came after your last prompt: news
  expect(hasRecentMail(pet(120), NOW)).toBe(true)
  // you have typed to it since
  expect(hasRecentMail(pet(30), NOW)).toBe(false)
  // you opened it, jumped to it or read its conversation here since
  expect(hasRecentMail(pet(120), NOW, NOW - 10_000)).toBe(false)
  // old news anyway, past ten minutes
  expect(hasRecentMail(pet(3600), NOW + 11 * 60_000)).toBe(false)
})

test('a message plays once on its pets, only when new, and its letter flies', async () => {
  const live = { pid: 1, procStart: null, status: 'idle', waitingFor: null, tmux: null, name: null, isRemote: false, isElsewhere: false, cwd: null, startedMs: null, socket: null }
  const pet = (mail: TamaSession['mail']) => ({ ...parseSession('a', '', null, NOW, NOW), live, mail })
  const old = { id: 'm-1', at: NOW - 60_000, dir: 'out' as const, peer: 'b', peerName: 'bramble', ok: true }
  // the first poll plays nothing: it was sent before the shelf opened
  const first = newMail([pet([old])], null, NOW)
  expect(first.fresh).toEqual([])
  const fresh = { ...old, id: 'm-2', at: NOW - 1000 }
  const next = newMail([pet([old, fresh])], first.ends, NOW)
  expect(next.fresh.map(f => f.role)).toEqual(['send'])
  // seen once: never again
  expect(newMail([pet([old, fresh])], next.ends, NOW).fresh).toEqual([])
  const o = outfits([pet(null)]).get('a')!
  const send = mailFrames(o, {}, 'send'), get = mailFrames(o, {}, 'get')
  expect(send.length).toBeGreaterThan(3)
  expect(new Set(send).size).toBeGreaterThan(3) // the letter moves
  expect(get).not.toEqual(send)
})

test('a machine is known by its machine id and pid namespace on Linux, by its hardware uuid on a Mac', async () => {
  expect(machineFrom('f3c19270a4e148d7\n\npid:[4026531836]\n')).toEqual({ key: 'f3c19270a4e1', domain: 'linux:f3c19270a4e148d7:pid:[4026531836]' })
  expect(machineFrom('\n\n66BFC405-F8E8-5E45-B900-1E418A166570\n')).toEqual({ key: '66bfc405f8e8', domain: 'darwin' })
  expect(machineFrom('\n')).toEqual({ key: 'local', domain: null })
})

test('a search that could run for ages as a regexp is matched as plain text', async () => {
  const pet = { ...parseSession('a', '', null, NOW, NOW), repo: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab', cwd: '/src/x' }
  for (const q of ['(a+)+$', '(x*)*y', '(.+)\\1']) expect(searchGraves([pet], q).isRegexp).toBe(false)
  for (const q of ['kill+ed\\s+ONE', 'lover$', '^feat-(x|y)$']) expect(searchGraves([pet], q).isRegexp).toBe(true)
})

// A reply far past the shelf's 400-character preview: an opened pet shows it whole.
const LONG = 'The suite runs every check twice. '.repeat(40) + 'THE END.'

// Three transcripts in three folders, as the engine's fs and a shell would answer:
// `me` and `b` still run, `c` was killed (no live process behind its registry entry).
const ROOT = '/h/.claude/projects'
const LIVE = '/h/.claude/sessions'
const FILES: Record<string, string> = {
  [`${ROOT}/-src-acorn/me.jsonl`]: assistant('tool_use').replace(/acorn[^"]*/, 'acorn') + '\n',
  [`${ROOT}/-src-bramble/b.jsonl`]: [
    line({ type: 'user', cwd: '/src/bramble', message: { role: 'user', content: 'what does the suite do?' } }),
    line({ type: 'assistant', cwd: '/src/bramble', message: { role: 'assistant', model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn', content: [{ type: 'text', text: LONG }] } }),
    line({ type: 'user', cwd: '/src/bramble', message: { role: 'user', content: 'please fix the flaky test' } }),
    line({
      type: 'assistant', cwd: '/src/bramble', gitBranch: 'fix',
      message: { role: 'assistant', model: 'claude-haiku-4-5-20251001', stop_reason: 'tool_use', content: [{ type: 'text', text: 'Running it now.' }] },
    }),
  ].join('\n') + '\n',
  // c was born in /src/clover and has since cd'd into a folder of it: it stays clover's pet
  [`${ROOT}/-src-clover/c.jsonl`]: line({
    type: 'assistant', cwd: '/src/clover/sub', gitBranch: 'main',
    message: { role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn' },
  }) + '\n',
}
// a transcript with something unexpected in it: it is skipped, the shelf stands
FILES[`${ROOT}/-src-broken/d.jsonl`] = line({ type: 'assistant', cwd: 5, message: { role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn' } }) + '\n'
const TITLES: Record<string, string> = { b: 'Other one', me: 'Mine', c: 'an ai title' }
// a /rename (or an SDK run naming itself) wins over the ai title
const CUSTOM: Record<string, string> = { c: 'Killed one' }
const REGISTRY: Record<string, object> = {
  // a registry entry with a field of the wrong type: read as no tmux pane
  [`${LIVE}/10.json`]: { pid: 10, sessionId: 'me', status: 'busy', tmux: 7 },
  [`${LIVE}/20.json`]: { pid: 20, sessionId: 'b', status: 'waiting', waitingFor: 'permission prompt', tmux: 'bramble:@3.%7', name: 'bramble-1', bridgeSessionId: 'session_01abc', procStart: '777' },
  // c's pid now belongs to a newer process: it started later than c did
  [`${LIVE}/30.json`]: { pid: 30, sessionId: 'c', status: 'idle', procStart: '555' },
  // e runs on another machine sharing this home folder: its pid means nothing here
  [`${LIVE}/40.json`]: { pid: 20, sessionId: 'e', status: 'busy', procStart: '777', pidDomain: 'linux:0ther0machine:pid:[1]', updatedAt: Date.now(), tmux: 'far:@1.%1', cwd: '/src/elsewhere' },
}
// b's subagents: one at work, one done five minutes ago; and the first one's trace
const SUB = `${ROOT}/-src-bramble/b/subagents`
const TRACES: Record<string, string> = {
  [`${SUB}/agent-a1.jsonl`]: [
    line({ type: 'user', isSidechain: true, message: { role: 'user', content: 'Find the flaky test' } }),
    line({ type: 'assistant', isSidechain: true, message: { role: 'assistant', model: 'claude-haiku-4-5-20251001', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'Bash', input: { command: 'pytest -x tests/' } }] } }),
    line({ type: 'assistant', isSidechain: true, message: { role: 'assistant', model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn', content: [{ type: 'text', text: 'It is test_retry: it sleeps on a real clock.' }] } }),
  ].join('\n'),
}
// a Linux machine: /proc is there, so a process's start time can be checked
const ALIVE = new Set(['/proc/self', '/proc/10', '/proc/20', '/proc/30'])
// /proc/<pid>/stat: the start time is field 22, after a name that may hold spaces
const stat = (pid: number, start: string) => `${pid} (claude code) S ${Array(18).fill('0').join(' ')} ${start} 0 0`
const STATS: Record<string, string> = { '/proc/20/stat': stat(20, '777'), '/proc/30/stat': stat(30, '999') }

test('the shelf shows running pets, hides killed ones until asked, and opens a pet', async ($, on) => {
  const now = Date.now()
  const clock = mock.clock(on, { now })
  mock.env(on, { HOME: '/h', TMUX: '/tmp/tmux-1/default,1,0' }) // this session runs in tmux
  const sent: { to: string; text: string }[] = []
  const blits: { key: string; cells: string }[] = []
  on('ui.blit', async (_$, e) => {
    if ('cells' in e) blits.push({ key: e.key, cells: e.cells })
    return { value: {} }
  })
  on('session.id', async () => ({ value: 'me' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.send', async (_$, e) => {
    sent.push({ to: e.to, text: e.text })
    return { isDelivered: true as const }
  })
  on('command.register', async () => ({ value: { command: 'tama' } }))
  on('ui.log', async () => ({ value: undefined }))
  on('ui.toast', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  on('fs.exists', async (_$, e) => ({ value: ALIVE.has(e.path) }))
  on('fs.stat', async (_$, e) => (e.path === '/h/src/bramble' ? { value: { kind: 'dir' as const, size: 0, mtimeMs: now, isLink: false } } : { deny: 'ENOENT' }))
  const reads: string[] = []
  on('fs.read', async (_$, e) => (reads.push(e.path), { value: STATS[e.path] ?? JSON.stringify(REGISTRY[e.path]) }))
  // the shelf this session read, written for the other sessions on the machine
  const written = new Map<string, string>()
  on('fs.write', async (_$, e) => {
    written.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', async (_$, e) => {
    const entry = (name: string, kind: 'file' | 'dir', mtimeMs = now) => ({ name, kind, size: 1, mtimeMs, isLink: false })
    if (e.path === LIVE) return { value: Object.keys(REGISTRY).map(f => entry(f.slice(LIVE.length + 1), 'file')) }
    if (e.path === ROOT) return { value: ['-src-acorn', '-src-bramble', '-src-clover', '-src-broken'].map(d => entry(d, 'dir')) }
    const value = Object.keys(FILES)
      .filter(f => f.startsWith(e.path + '/'))
      // b's tool call has sat unanswered for a minute: it may need you
      // and c, killed, last wrote two hours ago
      .map(f => entry(f.slice(e.path.length + 1), 'file', f.includes('/b.') ? now - 60_000 : f.includes('/c.') ? now - 2 * 3600_000 : now))
    return { value }
  })
  const ran: string[][] = []
  let panesOfB = '%7\n' // b's tmux session holds b's pane alone
  let paneOwner = '20\n'
  on('process.run', async (_$, e) => {
    ran.push([...e.argv])
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    const sec = Math.floor(now / 1000)
    // b's git: its own folder, untouched for two weeks, and a worktree it commits in
    if (e.argv[0] === 'sh' && e.argv[2]!.includes('rev-parse')) return ok(
      `\x1e/src/bramble\n${sec - 14 * 86400}\n## fix...origin/fix [ahead 2]\n M src/a.ts\n?? notes.md\n\x1f\nabc1234 make the test less flaky · 2 weeks ago\ndef5678 add retries · 2 weeks ago\n`
      + `\x1e/src/bramble-wt\n${sec - 60}\n## feat-x\n\x1f\nfff0001 a fresh commit in another worktree · 1 minute ago\n`)
    // disk: Claude's temp dir 12 GiB and transcripts 800 MiB; b alone holds 5.7 GiB of it
    if (e.argv[0] === 'sh' && e.argv[2]!.includes('du -sk')) return ok(
      `/t/claude-1\n${12 * 1024 * 1024}\t/t/claude-1\n${800 * 1024}\t${ROOT}\n\x1f\n`
      + `${6_000_000}\t/t/claude-1/-src-bramble/b\n1000\t${ROOT}/-src-bramble/b.jsonl\n`
      + `${3_000_000}\t/t/claude-1/-src-clover/c\n`)
    if (e.argv[0] === 'sh' && e.argv[2]!.includes('meta.json')) return ok(!e.argv[4]!.includes('/b/') ? '' :
      `\x1e${SUB}/agent-a1.jsonl\n${sec}\n0\n"model":"claude-haiku-4-5-20251001"\n${line({ agentType: 'Explore', description: 'Find the flaky test' })}\n`
      + [2, 3, 4, 5, 6, 7, 8].map(n =>
        `\x1e${SUB}/agent-a${n}.jsonl\n${sec - 60 * n}\n1\n\n${line({ agentType: 'general-purpose', description: n === 2 ? 'Read the CI logs' : `Done task ${n}` })}\n`).join(''))
    if (e.argv[0] === 'tmux' && e.argv[1] === 'new-session') return ok(e.argv.includes('-c') && e.argv.includes('/h/src/bramble') ? 'bramble:@11.%50\n' : 'clover-c:@9.%42\n')
    // b's pane runs b (pid 20), unless the test says the pane went to someone else
    if (e.argv[0] === 'tmux' && e.argv[1] === 'display-message' && e.argv.includes('#{pane_pid}')) return ok(paneOwner)
    if (e.argv[0] === 'tmux' && e.argv[1] === 'display-message') return ok('$3 bramble\n')
    if (e.argv[0] === 'tmux' && e.argv[1] === 'list-panes') return ok(panesOfB)
    if (e.argv[0] === 'tail') return ok(FILES[e.argv[3]!] ?? TRACES[e.argv[3]!] ?? '')
    if (e.argv[0] === 'tmux' && e.argv[1] === 'list-sessions') return ok('main\n')
    // this machine, as the registry names machines
    if (e.argv[0] === 'sh' && e.argv[2]!.includes('machine-id')) return ok('f3c19270a4e148d7\n\npid:[4026531836]\n') // as cat, echo and readlink print them
    // every transcript, as find prints them: b's tool call has sat unanswered for
    // a minute (it may need you), and c, killed, last wrote two hours ago
    if (e.argv[0] === 'sh' && e.argv[2]!.includes('-printf')) return ok(Object.keys(FILES).map(f =>
      `${(f.includes('/b.') ? now - 60_000 : f.includes('/c.') ? now - 2 * 3600_000 : now) / 1000}\t1\t${f}\n`).join(''))
    if (e.argv[0] === 'tmux') return ok('')
    // b's subagents: two mid-task, one done
    if (e.argv[0] === 'sh' && e.argv[2]!.includes('agent-*.jsonl'))
      return ok(e.argv.slice(4).map(d => `\x1e${d}\n${d.includes('/b/') ? '0\n0\n1\n' : ''}`).join(''))
    const paths = e.argv.slice(4)
    const stdout = paths.map(p => {
      const id = p.split('/').pop()!.replace('.jsonl', '')
      // one "key":"value" a line, in any order, as grep and awk print them
      const facts = [
        `"timestamp":"${new Date(now - 3 * 3600_000).toISOString()}"`,
        CUSTOM[id] ? `"customTitle":${JSON.stringify(CUSTOM[id])}` : '',
        id === 'c' ? '"cwd":"/src/clover"' : '',
        `"aiTitle":${JSON.stringify(TITLES[id])}`,
        // b's API calls, as the usage pass prints them: one written twice, as Claude Code does
        ...(id === 'b' ? [1, 1, 2].map(n => `U msg_${n} claude-haiku-4-5-20251001 ${new Date(now - 60_000).toISOString()} 1000 500 0 0 - -`) : []),
        // c, resumed from b's conversation, carries one of b's calls: it counts once, on the machine
        ...(id === 'c' ? [`U msg_1 claude-haiku-4-5-20251001 ${new Date(now - 60_000).toISOString()} 1000 500 0 0 - -`] : []),
      ].filter(Boolean).join('\n')
      return `\x1e${p}\n${facts}\n\x1f\n${FILES[p]}\n`
    }).join('')
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await $.session.start({ cwd: '/src/acorn', surface: 'terminal', isInteractive: true })
  await $.command.run({
    command: 'tama', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 140 },
  })
  await clock.settle()
  let shelfColor: unknown // b's colour on the shelf, which its footer face must match
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'tamaclaudchi', surface, component: 'Pane', requestId: 'tamaclaudchi',
      props: { title: 'TamaClaudchi', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
      viewport: { columns: 140, rows: 40 },
    })
    expect(await ui.find({ type: 'Text', text: /★ you/ })).toBeDefined() // your card, where others have their jump button
    expect(await ui.find({ type: 'Text', text: /Needs approval/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Waiting for you/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /born 3h ago/ })).toBeDefined()
    expect(await ui.find({ key: 'home-b' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Working/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Opus 5.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Other one/ })).toBeDefined()
    shelfColor = (await ui.find({ type: 'Text', text: /^bramble$/ }))?.props.color
    // the groups say working or idle, so the cards carry no mood pill; b has two subagents at work
    expect(await ui.find({ type: 'Text', text: /needs you/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^2 subagents working$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 other running pets across 2 folders/ })).toBeDefined() // b here, e on another machine
    // what Claude keeps on disk, red past 10 GB, and b's share on its card
    expect((await ui.find({ type: 'Text', text: /^12\.8 GB$/ }))?.props.color).toBe('#ff5555')
    expect(await ui.find({ type: 'Text', text: /^5\.7G$/ })).toBeDefined()
    // which copy of the mod this is, as its plugin.json says
    expect(JSON.stringify(await ui.drawn())).toContain('v0.1.0')
    // the shelf was read here, and left for the other sessions on this machine,
    // without what the sessions said
    expect(JSON.parse(written.get('/h/.claude/tamaclaudchi/lease-f3c19270a4e1.json') ?? '{}').by).toBe('me')
    const sharedShelf = JSON.parse(written.get('/h/.claude/tamaclaudchi/shelf-f3c19270a4e1.json') ?? '{}')
    expect(sharedShelf.sessions.find((x: { id: string }) => x.id === 'b').recent).toEqual([])
    // e runs on another machine: on the shelf, but nothing here may jump to, kill or resurrect it
    expect(await ui.find({ type: 'Text', text: /another machine/ })).toBeDefined()
    expect(await ui.find({ key: 'home-e' })).toBeUndefined()
    expect(await ui.find({ key: 'wing-e' })).toBeUndefined()
    // what the pets spent: b's two calls, the one written twice counted once
    const callUsd = 1000 * 1e-6 + 500 * 5e-6
    expect(JSON.stringify(await ui.drawn())).toContain(`$ spend · $${(2 * callUsd).toFixed(4)} today`)
    await ui.press({ key: 'spend' })
    expect(await ui.find({ type: 'Text', text: /^By day$/ })).toBeDefined()
    expect(await ui.find({ key: 'spend-pet-b' })).toBeDefined()
    expect(await ui.find({ key: 'spend-pet-c' })).toBeUndefined() // spent nothing
    await ui.press({ key: 'spend-back' })
    expect(await ui.find({ type: 'Text', text: /^By day$/ })).toBeUndefined()
    // the pet is drawn, with no pointer layer over it in this release
    if (surface === 'terminal') expect(await ui.find({ key: 'pet-b' })).toBeDefined()

    // the killed session waits behind g
    expect(await ui.find({ type: 'Text', text: /Killed one/ })).toBeUndefined()
    expect(await ui.find({ key: 'graveyard' })).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).toContain('🪦 graveyard · 1 closed in the last 5 days')
    await ui.press({ key: 'graveyard' })
    expect(await ui.find({ type: 'Text', text: /Killed one/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /an ai title/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /born 3h ago/ })).toBeDefined()
    // searched by a regexp, as it is typed
    await ui.input({ key: 'grave-search', text: 'nothing like it', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /Killed one/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /0 of 1 match/ })).toBeDefined()
    await ui.input({ key: 'grave-search', text: 'kill+ed\\s+ONE', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /Killed one/ })).toBeDefined()
    await ui.input({ key: 'grave-search', text: '(clover', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /matching it as plain text/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Killed one/ })).toBeUndefined() // no "(" in it
    await ui.input({ key: 'grave-search', text: 'lover$', kind: 'change' })
    expect(await ui.find({ type: 'Text', text: /Killed one/ })).toBeDefined() // its folder, /src/clover
    await ui.input({ key: 'grave-search', text: '', kind: 'change' })
    // every closed pet's temp folder at once, in two presses; never a running one's
    ran.length = 0
    await ui.press({ key: 'clean-all' })
    expect(ran.some(a => a[0] === 'rm')).toBe(false)
    await ui.press({ key: 'clean-all' })
    expect(ran.filter(a => a[0] === 'rm')).toEqual([['rm', '-rf', '--', '/t/claude-1/-src-clover/c']])
    // every glyph is one cell wide: emoji, ⚠ and ⏸ are two in some terminals and
    // one in others, and the drift leaves copies of them behind on redraw
    expect(/[\u{1F000}-\u{1FFFF}\u26A0\u23F8]/u.test(JSON.stringify(await ui.drawn()).replace(/📱|🏠|🪦/gu, ''))).toBe(false) // but 📱, 🏠 and 🪦, see PHONE
    expect(await ui.find({ key: 'wing-c' })).toBeDefined()
    // a dead pet can be brought back, into a new tmux window in its folder
    await ui.press({ key: 'wing-c' })
    expect(ran.find(a => a[0] === 'tmux' && a[1] === 'new-session')).toEqual([
      'tmux', 'new-session', '-d', '-P', '-F', '#{session_name}:#{window_id}.#{pane_id}',
      '-s', 'clover-c', '-c', '/src/clover', 'claude --resume c',
    ])
    expect(ran.some(a => a[0] === 'tmux' && a[1] === 'new-window')).toBe(false)
    // and goes straight to its new pane
    expect(ran.some(a => a[0] === 'tmux' && a[1] === 'select-pane' && a[3] === '%42')).toBe(true)
    // a pet's name opens it on every surface: by a click, Tab and Enter, or its digit
    expect((await ui.find({ key: 'name-c' }))?.props.hotkey).toBe('1')
    // a closed pet's temp folder can be cleaned, in two presses; its transcript stays
    expect(await ui.find({ type: 'Text', text: /2\.9 GB in their temp folders/ })).toBeDefined()
    await ui.press({ key: 'name-c' })
    expect(await ui.find({ key: 'clean' })).toBeDefined()
    ran.length = 0
    await ui.press({ key: 'clean' })
    expect(ran.some(a => a[0] === 'rm')).toBe(false)
    await ui.press({ key: 'clean' })
    expect(ran.filter(a => a[0] === 'rm')).toEqual([['rm', '-rf', '--', '/t/claude-1/-src-clover/c']])
    // b, open, spent at API prices: its page says how much
    expect(await ui.find({ type: 'Text', text: /Claude takes/ })).toBeUndefined()
    // a closed pet's new name goes at the end of its transcript, as /rename writes it
    ran.length = 0
    await ui.press({ key: 'rename' })
    await ui.input({ key: 'rename-name', text: 'Clover, at rest' })
    expect(ran.find(a => a[0] === 'sh' && a[2]!.includes('>>'))?.slice(3)).toEqual(
      ['sh', line({ type: 'custom-title', customTitle: 'Clover, at rest', sessionId: 'c' }), `${ROOT}/-src-clover/c.jsonl`])
    await ui.press({ key: 'back' })
    // the graveyard is a page of its own: the closed pets, not the shelf's
    expect(await ui.find({ type: 'Text', text: /🪦 Graveyard/ })).toBeDefined()
    expect(await ui.find({ key: 'home-b' })).toBeUndefined()
    await ui.press({ key: 'graveyard' })
    expect(await ui.find({ type: 'Text', text: /Killed one/ })).toBeUndefined()
    expect(await ui.find({ key: 'home-b' })).toBeDefined()

    // a running pet's page offers no clean: its temp folder is in use
    expect(await ui.find({ key: 'clean' })).toBeUndefined()
    // open b: its detail view, its words, and a message to it
    await ui.press({ key: 'name-b' })
    expect(await ui.find({ type: 'Text', text: /Conversation preview/ })).toBeDefined()
    // git and the conversation start folded, their headers saying what is inside
    expect(await ui.find({ type: 'Text', text: /make the test less flaky/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /please fix the flaky test/ })).toBeUndefined()
    const folded = JSON.stringify(await ui.drawn())
    expect(folded).toContain('2 checkouts it worked in, newest commit 1m ago')
    expect(folded).toContain('3 messages')
    // git never runs a program a repo's config names: no signature checker
    expect(ran.find(a => a[0] === 'sh' && a[2]!.includes('rev-parse'))?.[2]).toContain('-c log.showSignature=false -c gpg.program=false')
    await ui.press({ key: 'git-toggle' })
    await ui.press({ key: 'convo-toggle' })
    expect(await ui.find({ type: 'Text', text: /fix\.\.\.origin\/fix \[ahead 2\]/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 changed files/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /make the test less flaky/ })).toBeDefined()
    // git covers every checkout it worked in, the newest commit first
    const gitOrder = JSON.stringify(await ui.drawn())
    expect(gitOrder.indexOf('a fresh commit in another worktree')).toBeGreaterThan(-1)
    expect(gitOrder.indexOf('a fresh commit in another worktree')).toBeLessThan(gitOrder.indexOf('make the test less flaky'))
    // its subagents, as little pets: the running one first; one opens on its trace
    expect(await ui.find({ type: 'Text', text: /^ · 1 working · click one for its trace$/ })).toBeDefined()
    expect(await ui.find({ key: 'agent-a2' })).toBeDefined()
    // at most six: every running one, then the newest finished ones
    expect(await ui.find({ key: 'agent-a6' })).toBeDefined()
    expect(await ui.find({ key: 'agent-a7' })).toBeUndefined()
    expect(JSON.stringify(await ui.drawn()).indexOf('"agent-a1"')).toBeLessThan(JSON.stringify(await ui.drawn()).indexOf('"agent-a2"'))
    await ui.press({ key: 'agent-a1' })
    expect(await ui.find({ type: 'Text', text: /^Trace$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Bash · pytest -x tests\// })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /sleeps on a real clock/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^its task$/ })).toBeDefined()
    // where its whole log lies, and a button to copy that path
    expect(await ui.find({ type: 'Text', text: /\/subagents\/agent-a1\.jsonl$/ })).toBeDefined()
    expect(await ui.find({ key: 'agent-log' })).toBeDefined()
    await ui.press({ key: 'agent-back' })
    expect(await ui.find({ type: 'Text', text: /^Trace$/ })).toBeUndefined()
    // a second way to its pane, below the conversation
    const bottom = JSON.stringify(await ui.drawn())
    expect(bottom.indexOf('"jump-bottom"')).toBeGreaterThan(bottom.indexOf('Conversation preview'))
    expect(bottom).toContain('j: see the full conversation on its tmux pane')
    expect(await ui.find({ type: 'Text', text: /please fix the flaky test/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /📱 on Remote Control/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /needs you: permission prompt/ })).toBeDefined()
    // the opened pet's replies are whole, not cut at the shelf's preview length
    expect(await ui.find({ type: 'Text', text: /THE END\./ })).toBeDefined()
    // the actions sit in the top row and the message box comes before the conversation
    const order = JSON.stringify(await ui.drawn())
    expect(order.indexOf('"jump"')).toBeLessThan(order.indexOf('Conversation preview'))
    expect(order.indexOf('"msg"')).toBeLessThan(order.indexOf('Conversation preview'))
    // each bubble is headed with who, when (when known), tokens, and a reply's cost
    expect(await ui.find({ type: 'Text', text: /you · ~\d+ tok/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Running it now/ })).toBeUndefined() // narration, not a reply
    expect(await ui.find({ type: 'Text', text: /% ctx/ })).toBeDefined()
    expect(await ui.find({ key: 'jump' })).toBeDefined()
    await ui.input({ key: 'msg', text: 'how is it going?' })
    expect(sent.at(-1)).toEqual({ to: 'b', text: 'how is it going?' })
    // a running pet is asked to rename itself: its own copy of the mod runs /rename
    await ui.press({ key: 'rename' })
    await ui.input({ key: 'rename-name', text: '  flaky\ntest  hunter ' })
    expect(sent.at(-1)).toEqual({ to: 'b', text: '[tamaclaudchi rename] flaky test hunter' })
    expect(await ui.find({ key: 'rename-name' })).toBeUndefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: /★ you/ })).toBeDefined() // your card, where others have their jump button
    expect(await ui.find({ type: 'Text', text: /Needs approval/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Waiting for you/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /born 3h ago/ })).toBeDefined()
    expect(await ui.find({ key: 'home-b' })).toBeDefined()
    // borders keep their moods; a hovered card lights blue with every card of its repo
    const cards = JSON.stringify(await ui.drawn())
    expect(cards).toContain('"borderColor":"#78dce8"')
    expect(cards).toMatch(/"hover":\{"scope":"repo:[^"]+","borderColor":"#55ff55"\}/)
    // and the hovered card alone gets a thick border on top of that
    if (surface === 'terminal') {
      expect(cards).toContain('╔══════════════════════╗')
      // only over the border cells: nothing hidden lies over a card's buttons and pet
      const hidden = [...cards.matchAll(/"position":"absolute","top":(\d+),"left":(\d+),"display":"none"/g)]
      expect(hidden.length).toBeGreaterThan(0)
      for (const [, top, left] of hidden) expect(top === '0' || top === '16' || left === '0' || left === '23').toBe(true)
      expect(cards).not.toContain('"right":0,"bottom":0')
    }
    // b is on Remote Control, and only b
    expect((await ui.findAll({ type: 'Text', text: /^📱$/ })).length).toBe(1)

    // a new pet: a folder, then claude typed into a fresh tmux session there
    await ui.press({ key: 'spawn' })
    await ui.input({ key: 'spawn-dir', text: '~/src/bramble' })
    const hatched = ran.find(a => a[0] === 'tmux' && a[1] === 'new-session' && a.includes('/h/src/bramble'))
    expect(hatched).toEqual(['tmux', 'new-session', '-d', '-P', '-F', '#{session_name}:#{window_id}.#{pane_id}', '-s', 'bramble', '-c', '/h/src/bramble'])
    expect(ran.some(a => a[0] === 'tmux' && a[1] === 'send-keys' && a.includes('claude'))).toBe(true)

    // killing a pet takes two presses, then its tmux session and its process
    await ui.press({ key: 'name-b' })
    ran.length = 0
    await ui.press({ key: 'kill' })
    expect(ran.some(a => a.includes('kill-session') || a[0] === 'kill')).toBe(false)
    await ui.press({ key: 'kill' })
    // its session found by its pane's id (a renamed session keeps it), then
    // the process asked to stop, and made to while it is still b's
    expect(ran).toContainEqual(['tmux', 'display-message', '-p', '-t', '%7', '#{session_id} #{session_name}'])
    expect(ran).toContainEqual(['tmux', 'kill-session', '-t', '$3'])
    expect(ran.filter(a => a[0] === 'kill')).toEqual([['kill', '-TERM', '20'], ['kill', '-KILL', '20']])
    // a session holding other panes too keeps them: only b's pane goes
    panesOfB = '%7\n%8\n'
    await ui.press({ key: 'name-b' })
    ran.length = 0
    await ui.press({ key: 'kill' })
    await ui.press({ key: 'kill' })
    expect(ran).toContainEqual(['tmux', 'kill-pane', '-t', '%7'])
    expect(ran.some(a => a[1] === 'kill-session')).toBe(false)
    panesOfB = '%7\n'
    // a pane that no longer runs b (its tmux server restarted, its number given out again) is left alone
    paneOwner = '999\n'
    await ui.press({ key: 'name-b' })
    ran.length = 0
    await ui.press({ key: 'kill' })
    await ui.press({ key: 'kill' })
    expect(ran.some(a => a[1] === 'kill-pane' || a[1] === 'kill-session')).toBe(false)
    paneOwner = '20\n'
    expect(await ui.find({ type: 'Text', text: /Working/ })).toBeDefined()
    await ui.unmount()
  }
  // a poll reads no registry entry it has read before, and checks no process it saw end
  reads.length = 0
  await clock.advance(8000)
  await clock.settle()
  expect(reads.filter(r => r.startsWith(LIVE))).toEqual([])
  expect(reads).not.toContain('/proc/30/stat') // c's process ended: its entry stays ended
  expect(reads).toContain('/proc/20/stat') // b runs: still checked at every poll
  // the footer, right of the prompt: the engine's modes kept, then a face per running pet
  const footer = await $.ui.mount({
    plugin: 'tamaclaudchi', surface: 'terminal', component: 'SessionMode', requestId: 'modes',
    props: { modes: ['focus'] }, viewport: { columns: 140, rows: 40 },
  })
  const faces = JSON.stringify(await footer.drawn())
  expect(faces).toContain('"focus"," · "')
  expect(faces).toMatch(/ᕕ\(•ᴗ•\)ᕗ|ᕙ\(•ᴗ•\)ᕗ/) // you, at work
  expect(faces).toContain('(°ᴗ°)') // b, waiting on a permission prompt
  // each face in its pet's own colour, as the shelf draws it, and its name shown on hover
  expect(shelfColor).toBeDefined()
  expect((await footer.find({ type: 'Text', text: /^\(°ᴗ°\)$/ }))?.props.color).toBe(vivid(shelfColor as string))
  // its name waits hidden in a slot of its own, shown while the pointer is on its face
  expect(faces).toContain(`"hover":{"scope":"tama-face-b","display":"flex"}`)
  expect(faces).toContain(`"hover":{"scope":"tama-face-b","bold":true}`)
  expect((await footer.find({ type: 'Text', text: /^Other one$/ }))?.props.color).toBe(vivid(shelfColor as string))
  await footer.unmount()
})

test('a rename asked from another shelf runs /rename here, and never reaches the model', async ($, on) => {
  const ran: { command: string; args: string }[] = []
  on('command.run', { command: 'rename' }, async (_$, e) => {
    ran.push({ command: e.command, args: e.args })
    return { text: '' }
  })
  on('ui.log', async () => ({ value: undefined }))
  on('session.receive', async (_$, e) => ({ text: e.text })) // core: queued as it came
  const asked = await $.session.receive({ origin: { kind: 'peer', plugin: 'tamaclaudchi' }, text: '[tamaclaudchi rename] flaky test hunter' })
  expect(asked.consumed).toBeDefined()
  expect(ran).toEqual([{ command: 'rename', args: 'flaky test hunter' }])
  // any other message passes on as it came
  const chat = await $.session.receive({ origin: { kind: 'peer', plugin: 'tamaclaudchi' }, text: 'how is it going?' })
  expect(chat.text).toBe('how is it going?')
  expect(ran.length).toBe(1)
})

test("the messages page draws a tab per conversation, the open one filled, and a pet's page its own", async ($, on) => {
  const now = Date.now()
  const clock = mock.clock(on, { now })
  mock.env(on, { HOME: '/h' })
  const ago = (s: number) => new Date(now - s * 1000).toISOString()
  // this session (`me`) and `pay` run; `docs` has closed
  const path = (id: string) => `${ROOT}/-src-${id}/${id}.jsonl`
  const reg = (pid: number, id: string, name: string) =>
    ({ pid, sessionId: id, cwd: `/src/${id}`, status: 'idle', name, messagingSocketPath: `/tmp/cc-socks/${pid}.sock` })
  const registry: Record<string, object> = { [`${LIVE}/10.json`]: reg(10, 'me', 'audit'), [`${LIVE}/20.json`]: reg(20, 'pay', 'payments') }
  const from = (pid: number, name: string, id: string, body: string, s: number) =>
    line({ type: 'attachment', timestamp: ago(s), attachment: { origin: { kind: 'peer', from: `uds:/tmp/cc-socks/${pid}.sock`, verifiedPeerPid: pid, msg_id: id, name, body } } })
  const to = (target: string, id: string, body: string, s: number) => [
    line({ type: 'assistant', timestamp: ago(s), message: { role: 'assistant', content: [{ type: 'tool_use', id: `toolu_${id}`, name: 'SendMessage', input: { to: target, message: body } }] } }),
    line({ type: 'user', timestamp: ago(s - 1), toolUseResult: { success: true, msg_id: id, message: 'sent (another Claude session on this machine)' }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_${id}` }] } }),
  ]
  // what each transcript says of its messages, as the read scripts' awk pass prints them
  const MAIL: Record<string, string[]> = {
    me: [...to('payments', 'm-1', 'Schema migration finished', 300), from(20, 'payments', 'm-2', 'Thanks, rebasing now', 200), ...to('docs', 'm-3', 'Docs are stale', 100)],
    pay: [from(10, 'audit', 'm-1', 'Schema migration finished', 299), ...to('uds:/tmp/cc-socks/10.sock', 'm-2', 'Thanks, rebasing now', 201)],
    docs: [from(10, 'audit', 'm-3', 'Docs are stale', 99)],
  }
  const TITLE: Record<string, string> = { me: 'Repository audit', pay: 'Payments API', docs: 'Docs' }
  const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  const idOf = (p: string) => p.split('/').pop()!.replace('.jsonl', '')
  on('session.id', async () => ({ value: 'me' }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: { command: 'tama' } }))
  for (const event of ['ui.log', 'ui.toast', 'fs.write'] as const) on(event, async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  on('ui.blit', async () => ({ value: {} }))
  on('fs.exists', async (_$, e) => ({ value: ['/proc/self', '/proc/10', '/proc/20'].includes(e.path) }))
  on('fs.stat', async () => ({ deny: 'ENOENT' }))
  on('fs.read', async (_$, e) => (registry[e.path] ? { value: JSON.stringify(registry[e.path]) } : { deny: 'ENOENT' }))
  on('fs.list', async (_$, e) => ({
    value: e.path === LIVE ? Object.keys(registry).map(f => ({ name: f.slice(LIVE.length + 1), kind: 'file' as const, size: 1, mtimeMs: now, isLink: false })) : [],
  }))
  on('process.run', async (_$, e) => {
    const script = e.argv[0] === 'sh' ? e.argv[2]! : ''
    const paths = e.argv.slice(4)
    if (script.includes('-printf')) return ok(['me', 'pay', 'docs'].map(id => `${now / 1000}\t1\t${path(id)}\n`).join(''))
    // the messages' texts, read when a page shows them
    if (script.startsWith('for f in')) return ok(paths.flatMap(p => MAIL[idOf(p)]!.map(l => `M\t${l}\n`)).join(''))
    if (script.includes('du -sk') || script.includes('machine-id') || e.argv[0] !== 'sh') return ok('')
    if (script.includes('agent-*.jsonl')) return ok('')
    // the shelf's read: each transcript's facts and messages, then its tail
    return ok(paths.filter((_, i) => i % 2 === 0).map(p => {
      const id = idOf(p)
      const facts = [`"aiTitle":${JSON.stringify(TITLE[id])}`, `"cwd":"/src/${id}"`, ...MAIL[id]!.map(l => `M\t${l}`)].join('\n')
      return `\x1e${p}\n${facts}\n\x1f\n${assistant('end_turn')}\n`
    }).join(''))
  })

  await $.session.start({ cwd: '/src/me', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'tama', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 140 } })
  await clock.settle()
  const ui = await $.ui.mount({
    plugin: 'tamaclaudchi', surface: 'terminal', component: 'Pane', requestId: 'tamaclaudchi',
    props: { title: 'TamaClaudchi', isFocused: true, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 80 }, view: {} },
    viewport: { columns: 140, rows: 80 },
  })
  // the shelf counts the three messages; `m` opens them
  expect(JSON.stringify(await ui.drawn())).toContain('3 messages')
  await ui.press({ key: 'mailroom' })
  await clock.settle()
  // a tab per conversation; the latest, with docs, open and filled in the headers' cyan
  expect(await ui.find({ key: 'mail-tab-docs|me' })).toBeDefined()
  expect(await ui.find({ key: 'mail-tab-me|pay' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /Docs ↔ Repository audit/ }))?.props.backgroundColor).toBe('#78dce8')
  expect((await ui.find({ type: 'Text', text: /Repository audit ↔ Payments API/ }))?.props.backgroundColor).toBe('#4a4458')
  expect(await ui.find({ type: 'Text', text: /Docs are stale/ })).toBeDefined()
  // the other tab: both ways, the reply to a socket in the same conversation
  await ui.press({ key: 'mail-tab-me|pay' })
  expect((await ui.find({ type: 'Text', text: /Repository audit ↔ Payments API/ }))?.props.backgroundColor).toBe('#78dce8')
  expect(await ui.find({ type: 'Text', text: /Schema migration finished/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Thanks, rebasing now/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Docs are stale/ })).toBeUndefined()
  // payments' own page: one tab, its talk with this session, once unfolded
  await ui.press({ key: 'mailroom-back' })
  await ui.press({ key: 'name-pay' })
  await clock.settle()
  expect(await ui.find({ key: 'mail-tab-me|pay' })).toBeUndefined()
  await ui.press({ key: 'mail-toggle' })
  expect(await ui.find({ key: 'mail-tab-me|pay' })).toBeDefined()
  expect(await ui.find({ key: 'mail-tab-docs|me' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Thanks, rebasing now/ })).toBeDefined()
  await ui.unmount()
})
