# Developing TamaClaudchi

TamaClaudchi is a Claude Code *mod*: a plugin whose hooks draw their own UI.
There is nothing to build and no server to run.

## Run it from a clone

```
git clone https://github.com/ameroyer/tamaclaudchi.git
claude --plugin-dir ./tamaclaudchi      # this session only
cp -r tamaclaudchi ~/.claude/skills/    # or every session, as tamaclaudchi@skills-dir
```

## Check it

```
claude plugin validate .
claude plugin test .
```

Loading the mod writes its types under `.claude-plugin/types/` and a
`tsconfig.json` that extends them (both ignored by git). After that, with
TypeScript installed, type-check with:

```
tsc -p .
```

## How it works

It only reads what Claude Code already writes: the transcripts under
`~/.claude/projects`, and the registry of running sessions under
`~/.claude/sessions` (or under `$CLAUDE_CONFIG_DIR`). It re-reads only the
transcripts that changed, and only where they grew.

**One session reads for the whole machine.** It holds a lease, renewed at
every poll in a small file under `~/.claude/tamaclaudchi/`, and writes what it
found next to it whenever the shelf changes. The other sessions read that file
instead of the transcripts. The file holds what the cards show (names,
folders, moods, spend), never what the sessions said, and only your user can
read its folder. When the reading session closes, its lease lapses within
seconds and another session takes over. With alerts off and no pane open,
sessions poll four times less often.

**Running or closed.** A session is running while its registry entry's process
is alive and is still the process the registry saw start. That is checked with
`/proc` on Linux and with one `ps` call per poll on macOS, so a pid given to a
newer process is never mistaken for the session. Where neither can say when a
process started, nothing is ever killed.

**A home folder shared between machines** (NFS on a cluster) holds the
sessions of all of them. Each machine reads for itself, with files of its own.
A session on another machine shows on the shelf, marked ↗, but nothing here
kills, cleans, renames, messages or resurrects it. It counts as running while
its registry entry was written within the graveyard's window. Claude Code
names every Mac alike in the registry, so a Mac can tell a Linux machine's
sessions apart, but not another Mac's: those show as closed.

**Messages between sessions.** A sender's transcript holds its `SendMessage`
call and the result, with the message's `msg_id`. The receiver's holds the
message with the same `msg_id`, the sender's verified pid, socket and name,
and the text. Each message is joined by its id when both ends are on the
shelf; otherwise the other end is found in the registry, by pid, by socket or
by name. A send to no session known here, that nobody here received, went to
a subagent or a teammate, and is left out. The shared shelf file holds who
messaged whom and when, never the text: a page reads the text from the
transcripts when it opens.

**Git** runs read-only, and never runs a command a repo's own config names (an
fsmonitor, a signature checker), since a folder a session went into may be any
clone.

**Shell tools.** The data scripts use the usual tools, GNU or BSD: `sh`,
`find`, `stat`, `grep`, `awk`, `sed`, `tail`, `head`, `tr`, `du`, `xargs`,
`id`, `date -r`, `ps`, `kill`.

## Files

The plugin directory accepts `$` (the engine interface) only when it is passed
to a function declared in the same file, so every function that takes it lives
in `hooks/register.tsx`, in sections; the other modules are plain helpers.

| file | role |
|---|---|
| `hooks/register.tsx` | everything that touches Claude Code, in sections: `players` (a pet's animations), `shared` (the lease: one session reads, the others follow), `alerts` (the toasts and the notification), `mailfx` (a message's letter animation), `shelf` (reads transcripts, the live registry, git and conversations), `actions` (the buttons: tmux, messages, kill and resurrect), `footer` (the little faces right of the prompt), `view` (the shelf, the graveyard and a pet's page), and `register` (the hooks: `/tama`, the pane, the poll) |
| `hooks/config.ts` | the settings, from `/config` |
| `hooks/spend.ts` | each API call's usage, counted once, and a pet's spend |
| `hooks/sessions.ts` | parses a transcript into a pet's mood, model and words |
| `hooks/pets.ts`, `hooks/sprites.ts` | the pixel pets and their hover animations |
| `hooks/pethit.tsx` | the invisible layer over each pet that catches the pointer |
| `hooks/pricing.ts` | API list prices, for each reply's cost |
| `hooks/mail.ts` | messages between sessions: read from both ends, joined by id |
| `hooks/format.ts` | text helpers: sizes, ages, prices, colours |
| `hooks/hooks.json` | names the hooks module for Claude Code |
| `hooks/tama.test.ts` | the tests, run by `claude plugin test .` |
| `types/index.d.ts` | the mod's state, typed |
