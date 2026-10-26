export type Mood = 'needs' | 'busy' | 'waiting' | 'idle'

/** One line of the conversation, for the pet's detail view. */
export type Said = {
  role: 'user' | 'assistant'
  text: string
  /** When it was written, ms since the epoch. */
  at: number | null
  /** A reply: every token its turn's API calls moved. A prompt: about chars / 4. */
  tokens: number
  /** A reply: what its turn would cost on the API, in dollars; null for a prompt or an unpriced model. */
  costUsd: number | null
}

/** One git checkout a pet has worked in. */
export type GitTree = {
  path: string
  /** The checkout the session itself runs in. */
  isHome: boolean
  /** Its newest commit, ms since the epoch; 0 for none. */
  lastCommitMs: number
  /** `git status -sb`: the branch line, then a line per changed file. */
  status: string[]
  /** Its last commits, `hash subject · when`. */
  log: string[]
}

/** The checkouts a pet has worked in (its own folder, and wherever it or its
 * subagents ran git or cd'd to), newest commit first; read when its view opens. */
export type GitInfo = { id: string; trees: GitTree[]; error: string | null }

/** A subagent a pet spawned, from <session>/subagents/agent-<id>.jsonl and its .meta.json. */
export type Agent = {
  id: string
  /** Its transcript file. */
  path: string
  /** The short task it was given ("Review PR 294"). */
  description: string
  /** Its agent type ("general-purpose", "Explore"…). */
  type: string
  model: string | null
  /** It has finished: a last reply, or a background agent's hand-back. */
  isDone: boolean
  /** Last write to its transcript, ms since the epoch. */
  mtimeMs: number
}

/** One step of a subagent's trace. */
export type Step = {
  kind: 'prompt' | 'reply' | 'tool'
  text: string
  at: number | null
}

/** A live session, from ~/.claude/sessions/<pid>.json. */
export type Live = {
  pid: number
  /** The process's start time (field 22 of /proc/<pid>/stat), so a reused pid is told apart. */
  procStart: string | null
  /** `busy`, `idle`, or `waiting` on you. */
  status: string | null
  /** What it waits on while `waiting` ("permission prompt"). */
  waitingFor: string | null
  /** It runs on another machine sharing this home folder: nothing here can reach it. */
  isElsewhere: boolean
  /** Its tmux pane, `session:@window.%pane`. */
  tmux: string | null
  /** Its background job, for a session started with `claude --bg`: `claude attach <job>` opens it. */
  job: string | null
  name: string | null
  /** Remote Control is on: Claude Code keeps its bridge session id in the registry while it is. */
  isRemote: boolean
  /** Its folder and start, ms since the epoch: all there is of a session with no transcript yet. */
  cwd: string | null
  startedMs: number | null
  /** Its inbox socket, where other sessions' messages to it go (`/tmp/cc-socks/<pid>.sock`). */
  socket: string | null
}

/** A message between two sessions, as one end of it saw it; never its text, which a page reads when opened. */
export type Mail = {
  /** The message's id, the same at both ends. */
  id: string
  /** When it was sent or arrived, ms since the epoch. */
  at: number
  /** This pet sent it, or received it. */
  dir: 'in' | 'out'
  /** The other end's session id, where known here. */
  peer: string | null
  /** The other end's name, as the message named it. */
  peerName: string | null
  /** It was sent; false: the send was refused. */
  ok: boolean
}

/** What a pet's API calls (its own and its subagents') would cost at list prices. */
export type Spend = {
  usd: number
  tokens: number
  calls: number
  /** Calls to a model with no list price here: not in `usd`. */
  unpriced: number
  /** Dollars by local day (`2026-10-21`), over the graveyard's window. */
  days: Record<string, number>
}

/** One session on the shelf, as read from its transcript. */
export type TamaSession = {
  id: string
  /** Its transcript file. */
  path: string
  /** Its own folder: where it was born, whatever it has cd'd to since. */
  cwd: string
  /** The repo (or folder) name the pet's body colour is keyed on. */
  repo: string
  /** The branch it is on now, as its transcript last says. */
  branch: string | null
  /** The branch it was born on: what its held item is keyed on. */
  bornBranch: string | null
  model: string | null
  title: string | null
  mood: Mood
  /** Last write to the transcript, ms since the epoch. */
  mtimeMs: number
  /** When the session wrote its first line, ms since the epoch; null when unknown. */
  bornMs: number | null
  /** Context tokens of the last reply, 0 when unknown. */
  contextTokens: number
  /** The last reply asked for a tool and no result has come back. */
  isToolPending: boolean
  /** Subagents it spawned that are still at work (live pets only). */
  subagents: number
  /** Subagents it has launched in all, finished ones included (live pets only). */
  subagentsEver: number
  /** The last few things said, oldest first. */
  recent: Said[]
  /** Its repo's colour and its branch's item, as slots kept once given; null until assigned. */
  skinSlot: number | null
  itemSlot: number | null
  /** Disk it takes, in KiB: its folder in Claude's temp dir, and its logs (transcript and subagents'); null until measured. */
  disk: { tempKb: number; logKb: number } | null
  /** What it has spent; null until read. */
  spend: Spend | null
  /** Its messages to and from other sessions over the graveyard's window, oldest first; null for none. */
  mail: Mail[] | null
  /** When you last typed a prompt to it, ms since the epoch; null when unknown. */
  lastPromptMs: number | null
  /** Set while its process is alive: what the registry says about it. */
  live: Live | null
}

declare module 'claude-code' {
  interface PluginState {
    tamaclaudchi: {
      sessions: TamaSession[]
      me: string | null
      isOpen: boolean
      /** The pet whose detail view is open, or null for the shelf. */
      selected: string | null
      /** The graveyard page is open in place of the shelf. */
      showClosed: boolean
      /** The graveyard's search, a regexp over each closed pet's name, repo, branch and folder. */
      graveQuery: string
      /** Git details of the opened pet's folder. */
      git: GitInfo | null
      /** The new-pet form is open. */
      isSpawning: boolean
      /** The pet whose rename box is open, or null. */
      renaming: string | null
      /** The pet whose kill (or clean) button was pressed once and waits for the second press. */
      armed: string | null
      /** The opened pet's conversation, every message in full, as of its transcript's mtime. */
      convo: { id: string; mtimeMs: number; said: Said[] } | null
      /** How many of the opened pet's newest messages are drawn; more on asking. */
      convoShown: number
      /** The spend page is open in place of the shelf. */
      showSpend: boolean
      /** This copy of the mod's version, from its plugin.json. */
      version: string
      /** The opened pet's git section is unfolded (folded each time a pet opens). */
      showGit: boolean
      /** The opened pet's conversation is unfolded (folded each time a pet opens). */
      showConvo: boolean
      /** Disk Claude takes on this machine, in KiB: its temp dir, and every transcript. */
      disk: { tempDir: string; tempKb: number; logKb: number } | null
      /** The footer's frame: only the footer reads it, so its tick redraws nothing else. */
      footerFrame: number
      /** The opened pet's subagents, the running ones first. */
      agents: { id: string; list: Agent[] } | null
      /** The subagent whose trace page is open, or null. */
      agentPick: string | null
      /** The opened subagent's trace, as of its transcript's mtime. */
      trace: { id: string; mtimeMs: number; steps: Step[] } | null
      /** The opened pet's messages section is unfolded (folded each time a pet opens). */
      showMail: boolean
      /** The messages page is open in place of the shelf. */
      showMailroom: boolean
      /** When you last looked at each pet here (opened it, jumped to it, messaged it, read its conversation), by id. */
      mailSeen: Record<string, number>
      /** The conversation whose tab is open on the messages page or a pet's page; null: the latest. */
      mailTab: string | null
      /** The text of the messages a page shows, by message id, as read for `key` (the ids it read for). */
      mailText: { key: string; byId: Record<string, string> } | null
    }
  }
}
