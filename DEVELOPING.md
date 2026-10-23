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
`tsconfig.json` that extends them (both ignored by git). After that, type-check
with:

```
npx -p typescript tsc -p .
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

| file | role |
|---|---|
| `hooks/register.tsx` | wires the hooks: `/tama`, the pane, the poll |
| `hooks/config.ts` | the settings, from `/config` |
| `hooks/shelf.ts` | reads transcripts, the live registry, git and conversations |
| `hooks/shared.ts` | the lease: one session reads, the others follow |
| `hooks/spend.ts` | each API call's usage, counted once, and a pet's spend |
| `hooks/alerts.ts` | the toasts and the notification when a pet needs you |
| `hooks/sessions.ts` | parses a transcript into a pet's mood, model and words |
| `hooks/view.tsx` | draws the shelf, the graveyard and a pet's page |
| `hooks/actions.ts` | the buttons: tmux, messages, kill and resurrect |
| `hooks/pets.ts`, `hooks/sprites.ts` | the pixel pets and their hover animations |
| `hooks/pethit.tsx` | the invisible layer over each pet that catches the pointer |
| `hooks/footer.tsx` | the little faces at the right of the prompt's footer |
| `hooks/pricing.ts` | API list prices, for each reply's cost |
| `hooks/mail.ts` | messages between sessions: read from both ends, joined by id |
| `hooks/mailfx.ts` | a new message's animation: a letter thrown, a letter caught |
| `hooks/players.ts` | plays a pet's frames, one animation at a time per pet |
| `hooks/format.ts` | text helpers: sizes, ages, prices, colours |
| `hooks/hooks.json` | names the hooks module for Claude Code |
| `hooks/tama.test.ts` | the tests, run by `claude plugin test .` |
| `types/index.d.ts` | the mod's state, typed |
