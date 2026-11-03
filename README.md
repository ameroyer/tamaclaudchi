# TamaClaudchi

 <img align="right" src=".claude-plugin/icon.png" width="200" >
 
TamaClaudchi is a cute management for Claude Code sessions on your machine, in a `/tama` pane:
See at a glance which sessions are working, which need you, and which have
gone quiet.

You can also use this plugin to hatch and attach to sessions (in the background by default, or in tmux), jump to the next one that needs you, send messages across sessions, broadcast to all of them, review their conversations, monitor their subagents etc. It also displays useful info at a glance such that the size of the current context, model used etc.



https://github.com/user-attachments/assets/3bd10063-0885-45bd-b705-cf1589a6e4a0



## QuickStart

Run

```
claude plugin install tamaclaudchi --marketplace ameroyer/tamaclaudchi
```

Then start a new session and type `/tama` if the shelf doesn't pop up automatically

```bash
tmux new -s work
claude
# fullscreen mode allows the TamaClaudchi pane to sets properly on small terminals; Only needed the first time
/tui fullscreen
# to open the shelf
/tama
# to close it, click on the cross in top right
```

#### Tips

- **Pets hatch in the background.** `n` and resurrect start `claude --bg`, so
  a pet needs no terminal of its own and survives the one you close; `claude
  stop` ends it. A folder you have not trusted yet hatches in tmux instead, so
  claude can ask you. Set `hatchIn` to `tmux` for the old way.
- **Run Claude Code inside tmux** (`tmux new -s work`, then `claude`), so a pet
  can take you to its session: a background pet opens with `claude attach` in
  a tmux session of its own. Outside tmux, the attach command is copied for
  you to run. From inside an attached background session, `a` moves the tmux
  client showing that attach.
- **Use the fullscreen layout** (`/tui fullscreen`) to dock the pane on the
  right. Otherwise it opens above the prompt.

#### Configure
To configure: Type `/config` in Claude and you will be able to access a few configuration option for TamaClaudchi
<img width="558" height="119" alt="image" src="https://github.com/user-attachments/assets/9cca0373-59ca-4b64-b7f1-e0cd3f6663f1" />

#### Uninstall
Run `claude plugin uninstall tamaclaudchi@tamaclaudchi `

## Reading a pet

| you see | it means |
|---|---|
| body colour | the repo it runs in (`p` on its page picks another, for every pet of that repo) |
| hat | the model: wizard Fable, crown Opus, poet's hat Sonnet, fox mask Haiku |
| held item | its branch |
| an egg | it hasn't replied yet |
| a halo, faded | it has closed |
| a frown and a tear | it is stuck on you (a permission prompt) |
| eyes shut, a z | it has been idle for hours (`sleepyAfterHours`) |
| ★ you | this session |
| 💌 | it sent or got a message from another session lately, and you haven't looked yet |

The lights under a pet (and its `% ctx`) show how far its context has come to
where Claude Code auto-compacts it, as Claude Code reckons it: the model's
window (1M for Fable, Opus 4.7 and later, Sonnet 5 and later, Haiku 5.5; 200K
for the others), or a narrower `autoCompactWindow` you set (in
`~/.claude/settings.json`, overridden by the pet's project in its
`.claude/settings.json` and `.claude/settings.local.json`, top-level or per
model, as `/autocompact` writes it, or `CLAUDE_CODE_AUTO_COMPACT_WINDOW`),
less 33K Claude Code keeps for the reply and the summary: about 967K for a 1M
model. 100 minus it is Claude Code's own "% until auto-compact". A pet that
has been compacted also shows, on its page, about how long its whole
conversation is: its context plus what each compaction took out. The little faces
at the right of your prompt's footer are the running pets: waving ones are
working, a red `!` needs you. Past `contextAlertPercent` (90%), a pet's card
and page offer `⇲ compact`, which runs `/compact` in it once its turn is over.

## Using it

Click a pet (or press its number: 1 to 9, then 0 for the tenth) to open its
page: its subagents, git activity, its messages to and from other sessions,
the conversation, and a box to message it. From the eleventh on, Tab to it, or
`j` for the next that needs you. A name too long for its card shows whole
while you hover it.

The shelf puts the pet you last typed to first (or its birth, for one you have
not talked to yet), so a pet at work doesn't jump ahead of the one you're
working with; `o` sorts it by mood, repo or model instead, kept for next time.

| key | on the shelf | on a pet's page |
|---|---|---|
| `n` | hatch a new pet in a folder you pick | |
| `g` | the graveyard: recently closed sessions | |
| `s` | what the pets would cost at API prices | |
| `m` | your sessions' conversations with each other | |
| `j` | go to the next pet that needs you, the longest stuck first (also `/tama-next`, from any session) | |
| `t` | broadcast: one message from this session to every other running pet, or those of one repo | |
| `o` | the pet talked to last first, or rows by mood, by repo, by model | |
| `b` | | back |
| `a` | | attach: go to its tmux pane, or open its background session |
| `r` | | resurrect it (`claude --bg --resume`, or in tmux) |
| `e` | | rename it |
| `p` | | pick its repo's colour (the repo that had it takes the old one) |
| `c` | | copy its resume command |
| `k` ×2 | | kill it (`claude stop` for a background one) |
| `z` | | compact its context, once it is full past `contextAlertPercent` |
| `x` ×2 | clean every closed pet's temp files (in the graveyard) | clean its temp files |

Cleaning deletes only temp files: the transcript stays, so a pet can still be
resurrected.

When a pet needs you (a permission prompt), your other sessions show a toast
and you get one desktop notification. When a pet's context fills past
`contextAlertPercent`, they show a toast once.

A new pet (`n`) takes a folder, and optionally a first prompt, a model and a
git worktree of its own. Under the folder, it offers your pets' folders that
hold what you typed, then the folders that start with it (`~/Doc` offers
`~/Documents`); pressing one puts it in the field, and offers what is inside. Given a prompt, it gets to work in the background;
without one, it opens for you to talk to.

A pet's page shows its subagents however long ago they ran: the running ones
first (all of them, however many), then the newest, `subagentsShown` (6) in all.

When one session [messages another](https://code.claude.com/docs/en/cross-session-messaging),
the sender throws a letter and the receiver catches it. Their messages show as
conversations, a tab for each pair of sessions (`1`–`9` switch tabs): those
between running sessions with `m`, a pet's own (a closed one's included) on its
page.

<img width="569" height="420" alt="image" src="https://github.com/user-attachments/assets/4fe743cc-335f-46bf-8e74-7c8426baa679" />


## Settings

In `/config`, under the plugin:

| setting | default | |
|---|---|---|
| `autoOpen` | on | open the pane at start on a wide terminal |
| `alerts` | toast and notification | or `toast`, or `off` |
| `alertOnDone` | off | also alert when a pet finishes its turn |
| `graveyardDays` | 5 | how far back the graveyard and spend page look |
| `sleepyAfterHours` | 12 | when an idle pet looks sleepy (`0`: never); a pet stuck on you looks sad at once |
| `contextAlertPercent` | 90 | when a pet's context is announced as full, and offers a compact (`0`: never) |
| `subagentsShown` | 6 | how many subagents a pet's page shows |
| `hatchIn` | background | where `n` and resurrect start a pet: `background` (`claude --bg`) or `tmux` |
| `pollSeconds` | 4 | how often the shelf refreshes |
| `diskWarnGb`, `diskAlarmGb` | 5, 10 | when the disk-use line turns orange, then red |

## Requirements

- Claude Code 2.1.300 or later
- Linux or macOS
- tmux, for attaching to a pet from the shelf (optional: without it, the attach command is copied)
- git, for a pet's git activity (optional)

## Privacy

TamaClaudchi only reads what Claude Code already writes under `~/.claude`.
Nothing leaves your machine: the mod makes no network requests. Git runs
read-only.

## What it does on your machine

**What it reads.** The transcripts under `~/.claude/projects` and the registry
of running sessions under `~/.claude/sessions` (or under `$CLAUDE_CONFIG_DIR`),
and the environment variables `HOME`, `CLAUDE_CONFIG_DIR`, `TMUX` and
`TMUX_PANE`. It never reads credentials or API keys (`~/.claude/.credentials.json`,
the keychain): it does not need them, and nothing it reads is sent anywhere.
To tell machines apart on a shared home folder it reads the machine's id
(`/etc/machine-id` and its pid namespace on Linux, the hardware UUID from
`ioreg` on macOS); only its first 12 characters are used, as part of a file
name under `~/.claude/tamaclaudchi/`.

**What it writes.**

- `~/.claude/tamaclaudchi/lease-<machine>-v<n>.json` and `shelf-<machine>-v<n>.json`: the
  lease that lets one session read for the whole machine, and what it found
  (names, folders, moods, spend; never what the sessions said). The folder is
  made readable by your user only (`chmod 700`).
- `~/.claude/tamaclaudchi/running-<session id>`: an empty file each session
  running the mod leaves, so another session's shelf only asks it to rename
  itself when its copy of the mod will take the request (rather than its
  model reading it). Deleted once the session has ended.
- Renaming a *closed* pet (`e`) appends one `custom-title` line to the end of
  its transcript, exactly as `/rename` does. Only a `<session id>.jsonl` file
  under `~/.claude/projects/` is ever written.
- Cleaning (`x`) deletes a closed pet's folder in Claude Code's temp dir
  (`rm -rf <temp dir>/<project>/<session id>`), never its transcript, and never
  for a running session or one written in the last half hour.

It writes no settings, start-up, build or instructions file.

**What it sends, and where.** Nothing leaves your machine. Within it:

- A message you type in a pet's box goes to that session, with Claude Code's
  own cross-session messaging (`$.session.send`).
- Renaming a *running* pet sends that session a message starting with
  `[tamaclaudchi rename]`; TamaClaudchi's own copy in that session takes it
  and runs `/rename` there (see the hooks below). A compact asked for a
  running pet is sent the same way, as `[tamaclaudchi compact]`, and runs
  `/compact` there.
- A broadcast (`t`) sends the message you type, from this session, to each
  pet it names before you send it. Those are the only messages it sends, and
  only when you ask.
- A desktop notification when a pet needs you (setting `alerts`), and text
  copied to your clipboard when you press `c` or a copy button.

**Programs it runs, and why.** All with fixed arguments, through Claude Code's
process call, never through a shell with your input in the command:

| program | when | why |
|---|---|---|
| `find -L <folder> -mindepth 1 -maxdepth 1 -type d` | typing in the new-pet form's folder field | offer the folders in the one you are typing in |
| `sh -c <script>` with `find`, `stat`, `grep`, `awk`, `sed`, `tail`, `head`, `tr`, `du`, `xargs`, `id`, `date` | every poll | read the transcripts that changed and the disk use; each script is a fixed string in `hooks/register.tsx` (its shelf section), the paths passed as arguments |
| `env TZ=UTC0 LC_ALL=C ps`, `kill -0` | every poll | whether a session's process is still alive (macOS; Linux reads `/proc`) |
| `git` (read-only: `rev-parse`, `status`, `log`) | a pet's page | its git activity, with fsmonitor and signature programs turned off |
| `tail` | a pet's page | its latest conversation |
| `cat /etc/machine-id`, `readlink`, `ioreg` | once | which machine this is (above) |
| `chmod 700` | once | keep `~/.claude/tamaclaudchi/` to your user |
| `claude --bg` (with `--model`, `--worktree <name>`, `-- <prompt>` as you chose), `claude --bg --resume <id>` | `n`, `r` | hatch or resurrect a pet in the background, in its folder (setting `hatchIn`) |
| `claude stop <job>` | `k` ×2 on a background pet | stop it as claude does: its conversation is kept |
| `tmux` (`display-message`, `switch-client`, `select-window`, `select-pane`, `new-session`, `has-session`, `list-sessions`, `send-keys`, `list-panes`, `list-clients`, `kill-pane`, `kill-session`) | `a`, `j`, `n`, `r`, `k` | attach to a pet (from a background session, `ps` finds the pane its attach runs in), hatch one in tmux (`claude` typed into a new tmux session: `hatchIn` set to `tmux`, or a folder not trusted yet), resurrect one (`claude --resume <id>`), kill one |
| `claude attach <job>` in a new tmux session (`bg-<job>`) | `a` on a background pet, `n`, `r` | open a session started with `claude --bg` (outside tmux, the command is copied instead) |
| `kill -TERM`, then `kill -KILL` | `k` ×2 | kill a pet not in tmux, only once its process is sure to be that session |
| `rm -rf` | `x` ×2 | clean a closed pet's temp folder (above) |
| `sh -c 'printf … >> <transcript>'` | `e` on a closed pet | the rename line (above) |

**Claude Code commands it runs.** `/rename <name>`, when you rename this
session's pet, or when another session's TamaClaudchi asks this one to rename
itself; `/compact`, the same way, when you ask a pet to compact.

**Its hooks.** It hooks no tool calls, network or process events.

| hook | what it does |
|---|---|
| `session.start` | registers `/tama` and `/tama-next`, opens the pane on a wide terminal (setting `autoOpen`), starts the poll |
| `command.run` (`/tama`, `/tama-next`) | opens the pane; goes to the next pet that needs you |
| `ui.render` (its pane, and the prompt's footer) | draws the shelf, and the little faces right of the prompt |
| `ui.message` | the pointer over a pet (from its own `hooks/pethit.tsx`): hover plays it, a click opens it |
| `ui.close` (its pane) | remembers that the pane is closed |
| `session.receive` | takes only a rename or a compact sent by TamaClaudchi itself in another of your sessions (above) and runs `/rename` or `/compact`; every other message passes through untouched |

**Other plugins.** It calls none. The only plugin it answers is itself:
TamaClaudchi in your other sessions.

**What it adds.** One slash command, `/tama`, a pane and a footer entry. No
tools, agents or MCP servers.

## Update or remove

```
claude plugin update tamaclaudchi@tamaclaudchi
claude plugin uninstall tamaclaudchi@tamaclaudchi
```

## Developing

```
git clone https://github.com/ameroyer/tamaclaudchi.git
cd tamaclaudchi
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

How the code fits together is in [DEVELOPING.md](DEVELOPING.md).

## License

MIT
