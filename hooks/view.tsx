// Drawing the pane: the shelf of running pets, the graveyard, one pet's page,
// and the trace of one of its subagents.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { Agent, GitInfo, Mood, Said, Step, TamaSession } from '../types'
import {
  cleanable, cleanAll, cleanTemp, CONVO_PAGE, copyPath, copyResume, jump, killPet, message, MIN_CLEAN_KB, openAgent,
  openMailroom, openTab, renamePet, resurrect, select, spawnPet, tmuxSession, WING,
} from './actions'
import { hasRecentMail, isFrom, mailRead, postsOf, threadsOf, type End, type Thread } from './mail'
import { settings, since, windowDays } from './config'
import { ago, bytes, bytesShort, clip, diskColor, GiB, lights, plural, tidy, tokenCount, usd, when, widest } from './format'
import { agentOutfit, MODEL_SKIN, modelFamily, modelLabel, outfits, petPixels, petRest, petSmall, petSvg, type Outfit } from './pets'
import { isAsleep, isSad, petName } from './sessions'
import { isAgentRunning as isRunning } from './shelf'
import { dayOf, lastDays } from './spend'

// The values this module reads or writes. The engine's scan wants them
// declared in each module that uses them; one plugin and key is one value.
const convo = atom({ plugin: 'tamaclaudchi', key: 'convo' } as const, null as { id: string; mtimeMs: number; said: Said[] } | null)
const convoShown = atom({ plugin: 'tamaclaudchi', key: 'convoShown' } as const, 0)
const showSpend = atom({ plugin: 'tamaclaudchi', key: 'showSpend' } as const, false)
const showMail = atom({ plugin: 'tamaclaudchi', key: 'showMail' } as const, false)
const showMailroom = atom({ plugin: 'tamaclaudchi', key: 'showMailroom' } as const, false)
const mailTab = atom({ plugin: 'tamaclaudchi', key: 'mailTab' } as const, null as string | null)
const mailSeen = atom({ plugin: 'tamaclaudchi', key: 'mailSeen' } as const, {} as Record<string, number>)
const mailText = atom({ plugin: 'tamaclaudchi', key: 'mailText' } as const, null as { key: string; byId: Record<string, string> } | null)
const version = atom({ plugin: 'tamaclaudchi', key: 'version' } as const, '')
const git = atom({ plugin: 'tamaclaudchi', key: 'git' } as const, null as GitInfo | null)
const graveQuery = atom({ plugin: 'tamaclaudchi', key: 'graveQuery' } as const, '')
const renaming = atom({ plugin: 'tamaclaudchi', key: 'renaming' } as const, null as string | null)
const isSpawning = atom({ plugin: 'tamaclaudchi', key: 'isSpawning' } as const, false)
const armed = atom({ plugin: 'tamaclaudchi', key: 'armed' } as const, null as string | null)
const me = atom({ plugin: 'tamaclaudchi', key: 'me' } as const, null as string | null)
const selected = atom({ plugin: 'tamaclaudchi', key: 'selected' } as const, null as string | null)
const sessions = atom({ plugin: 'tamaclaudchi', key: 'sessions' } as const, [] as TamaSession[])
const showClosed = atom({ plugin: 'tamaclaudchi', key: 'showClosed' } as const, false)
const showGit = atom({ plugin: 'tamaclaudchi', key: 'showGit' } as const, false)
const showConvo = atom({ plugin: 'tamaclaudchi', key: 'showConvo' } as const, false)
const agents = atom({ plugin: 'tamaclaudchi', key: 'agents' } as const, null as { id: string; list: Agent[] } | null)
const agentPick = atom({ plugin: 'tamaclaudchi', key: 'agentPick' } as const, null as string | null)
const disk = atom({ plugin: 'tamaclaudchi', key: 'disk' } as const, null as { tempDir: string; tempKb: number; logKb: number } | null)
const trace = atom({ plugin: 'tamaclaudchi', key: 'trace' } as const, null as { id: string; mtimeMs: number; steps: Step[] } | null)

type PaneEvent = RenderInput<'Pane'>

/** How many graves the graveyard draws at once; a search narrows the rest. */
const GRAVES_SHOWN = 40
const CARD_W = 24
/** The card's jump button, `🏠 jump to pane`, in cells. */
const JUMP_W = 15
/** A subagent's card on its pet's page: the half-size pet, its task, its state. */
const AGENT_W = 18
/** A card shows its pet's disk use from this much (KiB); its page always does. */
const CARD_DISK_KB = 100 * 1024
/** How many steps of a subagent's trace are drawn, the newest. */
const STEPS_SHOWN = 200
/** Cards opened by a digit key, the first so many on the page. */
const DIGITS = 9
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
const HOME = '🏠' // jump to its tmux pane
const PHONE = '📱' // on Remote Control
const GRAVE = '🪦' // the graveyard
const LETTER = '💌' // a message between sessions (✉ is text by default)
/** How many messages the messages page and a pet's page draw, the newest. */
const POSTS_SHOWN = 40

type View = { list: TamaSession[]; mine: string | null; looks: Map<string, Outfit>; now: number; cols: number; seen: Record<string, number> }

export async function renderPane($: EngineInterface, e: PaneEvent) {
  const list = await read($, sessions)
  const pick = await read($, selected)
  const v: View = {
    list, mine: await read($, me), looks: outfits(list), now: Date.now(), cols: Math.max(CARD_W, e.props.bodyColumns), seen: await read($, mailSeen),
  }
  const chosen = pick ? list.find(s => s.id === pick) : undefined
  if (!chosen) return shelfPage($, e, v)
  const agentId = await read($, agentPick)
  const known = await read($, agents)
  const agent = agentId && known?.id === chosen.id ? known.list.find(a => a.id === agentId) : undefined
  return agent ? agentPage($, e, v, chosen, agent) : petPage($, e, v, chosen, known?.id === chosen.id ? known.list : [])
}

/** What both pages draw a pet with. */
function kit($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text } = $.ui.resolve(e)
  // On the terminal a pet is a true-colour Raster (Text colours are cut to the
  // terminal's palette, which washes pastels out to white), with an invisible
  // Client over it that reports hover and clicks.
  // `hitId` names the pointer layer: a pet's id, or `agent:<id>` for a subagent's
  const art = (o: Outfit, key: string, hitId: string, look: { faded: boolean; halo?: boolean; sad?: boolean }, alt: string, isSmall = false) => {
    if (e.surface === 'terminal') {
      const { Raster, Client } = $.ui.resolve(e)
      const rest = isSmall ? petSmall(o, look) : petRest(o, look)
      return (
        <Box key={`${key}-box`} position="relative" width={rest.columns} height={rest.rows}>
          <Raster key={key} columns={rest.columns} rows={rest.rows} cells={rest.cells} />
          <Box position="absolute" top={0} left={0}>
            <Client key={`hit-${hitId}`} module="./pethit.tsx" props={{ id: hitId, w: rest.columns, h: rest.rows }} width={rest.columns} height={rest.rows} />
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
    art(v.looks.get(s.id)!, key, isPage ? `page:${s.id}` : s.id, { faded: isAsleep(s, v.now), halo: !s.live, sad: isSad(s, v.now, settings.sadMs) }, `${modelLabel(s.model)} pet`)
  const agentPet = (s: TamaSession, a: Agent, key: string) =>
    art(agentOutfit(v.looks.get(s.id)!, a), key, `agent:${a.id}`, { faded: a.isDone }, `${a.type} agent`, true)
  const modelPill = (s: TamaSession) => <Text bold color={MODEL_SKIN[modelFamily(s.model)]!.body}>{modelLabel(s.model)}</Text>
  const ctx = (s: TamaSession) => {
    const l = lights(s.contextTokens)
    return <Text><Text color={l.color}>{l.on}</Text><Text dimColor>{l.off} {l.pct}% ctx</Text></Text>
  }
  // A section's title: larger where the surface has sizes; the terminal has
  // one size, so there it is underlined, bold and cyan instead.
  const title = (text: string, arrow?: string) =>
    <Text bold size="heading" color={HEADER}>{arrow ? `${arrow} ` : ''}<Text underline>{text}</Text></Text>
  const note = (text: string) => <Text dimColor> · {text}</Text>
  const header = (text: string, aside?: string) =>
    <Box marginTop={1}><Text>{title(text)}{aside ? note(aside) : null}</Text></Box>
  return { pet, agentPet, modelPill, ctx, title, note, header, brand: <Text bold color={ACCENT}>✿ TamaClaudchi</Text> }
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
    [s.title ?? '', s.repo, s.branch ?? '', s.cwd].some(h => (re ? re.test(h) : h.toLowerCase().includes(q))))
  return { found, isRegexp: re !== null }
}

/** What a pet spent over the window, by its days. */
const windowSpend = (s: TamaSession) => Object.values(s.spend?.days ?? {}).reduce((a, b) => a + b, 0)

/** The shelf: running pets in their rows, the graveyard, or the spend page in their place. */
async function shelfPage($: EngineInterface, e: PaneEvent, v: View) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' ? $.ui.resolve(e).Input : null
  const k = kit($, e, v)
  if (await read($, showSpend)) return spendPage($, e, v)
  if (await read($, showMailroom)) return mailroomPage($, e, v)
  const isGraveOpen = await read($, showClosed)
  const query = await read($, graveQuery)
  const spawning = await read($, isSpawning)
  const used = await read($, disk)
  const armedId = await read($, armed)
  const mod = await read($, version)

  const self = v.list.find(s => s.id === v.mine)
  const alive = v.list.filter(s => s.live || s.id === v.mine)
  const closed = v.list.filter(s => !s.live && s.id !== v.mine)
  const others = alive.filter(s => s.id !== v.mine)
  const folders = new Set(others.map(s => s.repo)).size
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
  const openGraves = (isOn: boolean) => () => void update($, showClosed, () => isOn)
  const setQuery = (q: string) => void update($, graveQuery, () => q)

  return (
    <Box flexDirection="column">
      {k.brand}
      <Text dimColor>click a pet, or press its number, to open it · body = repo · hat = model · item = branch{mod ? ` · v${mod}` : ''}</Text>
      {/* what Claude keeps on disk, orange then red past the thresholds in /config: time to clean up */}
      {used ? (
        <Text wrap="truncate">
          <Text dimColor>Claude takes </Text>
          <Text bold color={diskColor(used.tempKb + used.logKb, settings.diskWarnKb / GiB, settings.diskAlarmKb / GiB)}>{bytes(used.tempKb + used.logKb)}</Text>
          <Text dimColor> on disk: {bytes(used.tempKb)} in {used.tempDir}, {bytes(used.logKb)} of transcripts</Text>
        </Text>
      ) : null}
      {isGraveOpen ? null : (
        <Box flexDirection="column">
          {self ? null : <Text dimColor>Your pet hatches once this session has written its first reply.</Text>}
          {spawning && Input ? (
            <Box flexDirection="column" borderStyle="round" borderColor={ACCENT} paddingX={1}>
              <Text bold color={ACCENT}>+ a new pet, in its own tmux session</Text>
              <Input key="spawn-dir" label="folder" value={self?.cwd ?? '~'} autoFocus submitLabel="hatch" onSubmit={dir => void spawnPet($, dir)} />
              <Button key="spawn-cancel" plain dimColor label="cancel" onPress={() => void update($, isSpawning, () => false)} />
            </Box>
          ) : (
            <Box columnGap={2} flexWrap="wrap">
              <Button key="spawn" hotkey="n" plain label="+ new pet" onPress={() => void update($, isSpawning, () => true)} />
              <Button key="spend" hotkey="s" plain label={`$ spend · ${usd(spentToday)} today`} onPress={() => void update($, showSpend, () => true)} />
              {posts ? <Button key="mailroom" hotkey="m" plain label={`${LETTER} ${plural(posts, 'message')}`} onPress={() => void openMailroom($, true)} /> : null}
            </Box>
          )}
          <Text dimColor>{plural(others.length, 'other running pet')} across {plural(folders, 'folder')}</Text>
        </Box>
      )}
      {isGraveOpen
        ? <Button key="graveyard" hotkey="g" plain label="← back to the shelf" onPress={openGraves(false)} />
        : closed.length
          ? <Button key="graveyard" hotkey="g" plain dimColor label={`${GRAVE} graveyard · ${closed.length} closed ${since()}`} onPress={openGraves(true)} />
          : null}
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
        armedId === CLEAN_ALL
          ? <Button key="clean-all" hotkey="x" plain label={`✕ press again: delete ${bytes(cleanKb)} of temp files from ${plural(toClean.length, 'closed pet')} (transcripts stay)`} onPress={() => void cleanAll($, closed)} />
          : <Button key="clean-all" hotkey="x" plain dimColor label={`✕ clean every closed pet's temp folder (${bytes(cleanKb)} in ${toClean.length})`} onPress={() => void update($, armed, () => CLEAN_ALL)} />
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

/** What `armed` holds while the graveyard's clean-all waits for its second press. */
const CLEAN_ALL = '*graves'

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
  // the jump button's whole label, a space, and the corner's marks (size,
  // phone, letter: a gap between each) must fit in the card
  const marks = [size >= CARD_DISK_KB ? bytesShort(size).length : 0, s.live?.isRemote ? 2 : 0, isMailed ? 2 : 0].filter(Boolean)
  const crowded = JUMP_W + 1 + marks.reduce((a, b) => a + b, 0) + Math.max(0, marks.length - 1) > CARD_W - 2
  return (
    // The card lights with every card of its repo while any is hovered; the
    // hovered one alone also gets the double outline, drawn over its border by
    // the wrapper (inside the card's own border it would be clipped). Only the
    // border cells are covered: a box over the whole card would take the
    // clicks meant for its buttons and pet.
    <Box key={`card-${s.id}`} position="relative" width={CARD_W}>
      <Box flexDirection="column" alignItems="center" width={CARD_W} height={isTerminal ? CARD_H : undefined}
        borderStyle={isMe ? 'double' : 'round'} borderColor={isMe ? ME : s.live ? MOOD[s.mood].border ?? o.skin.outline : GREY}
        hover={{ scope: `repo:${s.repo}`.slice(0, 64), borderColor: HOVER }}>
        <Box width={CARD_W - 2} justifyContent="space-between">
          {isMe ? <Text bold color={ME}>★ you</Text>
            : !s.live ? <Button key={`wing-${s.id}`} plain label={`${WING} resurrect`} onPress={() => void resurrect($, s)} />
            : s.live.tmux ? <Button key={`home-${s.id}`} plain label={crowded ? `${HOME} jump` : `${HOME} jump to pane`} onPress={() => void jump($, s)} />
            : s.live.isElsewhere ? <Text dimColor>↗ another machine</Text>
            : <Text> </Text>}
          <Box gap={1}>
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
        <Button key={`name-${s.id}`} plain hotkey={digit ? String(digit) : undefined} onPress={() => void select($, s.id)}>
          <Text bold wrap="truncate" dimColor={!s.live} color={isMe ? ME : undefined}>{petName(s)}</Text>
        </Button>
        <Text color={o.skin.body} wrap="truncate">{s.repo}</Text>
        <Text dimColor wrap="truncate">⎇ {s.branch ?? '—'}</Text>
        <Box gap={1}>{k.modelPill(s)}{k.ctx(s)}</Box>
        {/* the shelf's rows already say working or idle; a pet left waiting long says so */}
        {s.subagents ? <Text color={MOOD.busy.border!}>{plural(s.subagents, 'subagent')} working</Text>
          : sad ? <Text color={MOOD.waiting.border!} wrap="truncate">sad · left waiting {ago(v.now - s.mtimeMs).replace(' ago', '')}</Text>
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
        <Button key="spend-back" hotkey="s" plain label="← back to the shelf" autoFocus onPress={() => void update($, showSpend, () => false)} />
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

/** A tab, filled: the open one the headers' cyan with dark text, the others dark grey with light text. */
const TAB_OPEN = { fg: '#1e1b24', bg: HEADER }
const TAB_SHUT = { fg: '#d8d4de', bg: '#4a4458' }

/**
 * The conversations' tabs, standing on a rule of the open one's colour, as a
 * tab strip: each a filled block, the first nine opened with a digit. There
 * is no tab element: each tab is a button.
 */
function mailTabs($: EngineInterface, e: PaneEvent, v: View, threads: Thread[], open: Thread, label: (t: Thread) => string) {
  const { Box, Text, Button } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Box flexWrap="wrap" columnGap={1}>
        {threads.map((t, i) => {
          const isOpen = t.key === open.key
          const look = isOpen ? TAB_OPEN : TAB_SHUT
          return (
            <Button key={`mail-tab-${t.key}`} plain hotkey={i < DIGITS ? String(i + 1) : undefined} onPress={() => void openTab($, t.key)}>
              <Text bold={isOpen} color={look.fg} backgroundColor={look.bg}>
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
  const threads = threadsOf(postsOf(v.list))
  const open = openThread(threads, await read($, mailTab))
  const texts = await told($, v.list)
  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        <Button key="mailroom-back" hotkey="m" plain label="← back to the shelf" autoFocus onPress={() => void openMailroom($, false)} />
      </Box>
      <Text dimColor wrap="wrap">What your sessions told each other {since()}: a tab per conversation, the latest first.</Text>
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
async function petPage($: EngineInterface, e: PaneEvent, v: View, s: TamaSession, crew: Agent[]) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const Input = e.surface !== 'mobile' ? $.ui.resolve(e).Input : null
  const k = kit($, e, v)
  const o = v.looks.get(s.id)!
  const gitRead = await read($, git)
  // a record written by an older version of the mod has no trees: read it again
  const info = gitRead?.id === s.id && Array.isArray(gitRead.trees) ? gitRead : null
  const armedId = await read($, armed)
  const isRenaming = (await read($, renaming)) === s.id
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
    : isAsleep(s, v.now) ? { ...MOOD.idle, label: 'zzz asleep' }
    : isSad(s, v.now, settings.sadMs) ? { ...MOOD.waiting, label: `sad: waiting on you for ${ago(v.now - s.mtimeMs).replace(' ago', '')}` }
    : s.mood === 'needs' && s.live.waitingFor ? { ...MOOD.needs, label: `▲ needs you: ${s.live.waitingFor}` }
    : MOOD[s.mood]
  const petTint = MODEL_SKIN[modelFamily(s.model)]!.body
  // a bubble hugs short lines and stops at three quarters of the pane
  const maxW = Math.max(16, Math.floor(v.cols * 0.75))
  const bubbleW = (text: string) => Math.min(maxW, widest(tidy(text)) + 4)
  const lifeLine = [
    s.live ? `running${s.live.isElsewhere ? ' on another machine' : tmux ? ` in tmux ${tmux}` : ''}${s.live.isRemote ? ` · ${PHONE} on Remote Control` : ''}` : 'closed',
    `last seen ${ago(v.now - s.mtimeMs)}`,
    s.bornMs ? `born ${ago(v.now - s.bornMs)}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        <Button key="back" hotkey="b" plain label="back to the shelf" autoFocus onPress={() => void select($, null)} />
        {tmux ? <Button key="jump" hotkey="j" plain label={`${HOME} jump to its tmux pane`} onPress={() => void jump($, s)} /> : null}
        {s.live ? null : <Button key="resurrect" hotkey="r" plain label={`${WING} resurrect`} onPress={() => void resurrect($, s)} />}
        <Button key="resume" hotkey="c" plain label="copy resume command" onPress={() => void copyResume($, s)} />
        {Input && !s.live?.isElsewhere ? <Button key="rename" hotkey="e" plain label="✎ rename" onPress={() => void update($, renaming, id => id === s.id ? null : s.id)} /> : null}
        {s.live && !s.live.isElsewhere && s.id !== v.mine ? (
          armedId === s.id
            ? <Button key="kill" hotkey="k" plain label={`✕ press again: kill it${tmux ? ' and its tmux pane' : ''}`} onPress={() => void killPet($, s)} />
            : <Button key="kill" hotkey="k" plain dimColor label="✕ kill" onPress={() => void update($, armed, () => s.id)} />
        ) : null}
        {/* a closed pet's temp folder: scratch files and task output, often big */}
        {!s.live && s.disk && s.disk.tempKb >= MIN_CLEAN_KB ? (
          armedId === s.id
            ? <Button key="clean" hotkey="x" plain label={`✕ press again: delete ${bytes(s.disk.tempKb)} of temp files (its transcript stays)`} onPress={() => void cleanTemp($, s)} />
            : <Button key="clean" hotkey="x" plain dimColor label={`✕ clean its temp folder (${bytes(s.disk.tempKb)})`} onPress={() => void update($, armed, () => s.id)} />
        ) : null}
      </Box>
      <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor={MOOD[s.mood].border ?? o.skin.outline} paddingX={1}>
        {k.pet(s, 'detail-pet', true)}
        {isRenaming && Input ? (
          <Box width={Math.min(maxW, 50)} flexDirection="column">
            <Input key="rename-name" label="name" value={petName(s)} autoFocus submitLabel="rename" onSubmit={name => void renamePet($, s, name)} />
            <Button key="rename-cancel" plain dimColor label="cancel" onPress={() => void update($, renaming, () => null)} />
          </Box>
        ) : <Text bold wrap="truncate">{petName(s)}</Text>}
        <Text color={o.skin.body} wrap="truncate">{s.repo}{s.branch ? ` · ${s.branch}` : ''}</Text>
        <Box gap={1}>{k.modelPill(s)}{k.ctx(s)}<Text color={mood.fg} backgroundColor={mood.bg}> {mood.label} </Text></Box>
        <Text dimColor wrap="truncate-start">{s.cwd}</Text>
        <Text dimColor>{lifeLine}</Text>
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
          {k.header('Subagents', `${crew.filter(a => isRunning(a, v.now)).length} working · click one for its trace`)}
          <Box flexDirection="row" flexWrap="wrap">
            {crew.map(a => {
              const running = isRunning(a, v.now)
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
        <Button key="convo-toggle" plain onPress={() => void update($, showConvo, x => !x)}>
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
          {tmux ? <Button key="jump-bottom" plain label="j: see the full conversation on its tmux pane" onPress={() => void jump($, s)} /> : null}
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
  const running = isRunning(a, v.now)
  const tint = MODEL_SKIN[modelFamily(a.model)]!.body
  const maxW = Math.max(16, Math.floor(v.cols * 0.75))
  const bubbleW = (text: string) => Math.min(maxW, widest(tidy(text)) + 4)
  const shown = (steps ?? []).slice(-STEPS_SHOWN).reverse()
  return (
    <Box flexDirection="column">
      <Box columnGap={2} flexWrap="wrap">
        {k.brand}
        <Button key="agent-back" hotkey="b" plain label={`back to ${clip(petName(s), 30)}`} autoFocus onPress={() => void openAgent($, null)} />
        {s.live?.tmux ? <Button key="jump" hotkey="j" plain label={`${HOME} jump to its pet's tmux pane`} onPress={() => void jump($, s)} /> : null}
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
