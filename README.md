# TamaClaudchi

 <img align="right" src=".claude-plugin/icon.png" width="200" >
 
TamaClaudchi is a cute management for Claude Code sessions on your machine, in a `/tama` pane:
See at a glance which sessions are working, which need you, and which have
gone quiet.

You can also use this plugin to quickly switch between sessions via tmux, send messages across sessions and review their conversations, monitor their subagents etc. It also displays useful info at a glance such that the size of the current context, model used etc.



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

- **Run Claude Code inside tmux** (`tmux new -s work`, then `claude`), so a pet
  can take you to its session, and you can hatch, resurrect and kill pets.
  A background session (`claude --bg`) opens with `claude attach` in a tmux
  session of its own. From inside an attached background session, `j` moves
  the tmux client showing that attach.
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
| body colour | the repo it runs in |
| hat | the model: wizard Fable, crown Opus, poet's hat Sonnet, fox mask Haiku |
| held item | its branch |
| an egg | it hasn't replied yet |
| a halo, faded | it has closed |
| a tear | it has been waiting on you for hours |
| ★ you | this session |
| 💌 | it sent or got a message from another session lately, and you haven't looked yet |

The lights under a pet show how full its context window is. The little faces
at the right of your prompt's footer are the running pets: waving ones are
working, a red `!` needs you.

## Using it

Click a pet (or press its number) to open its page: its subagents, git
activity, its messages to and from other sessions, the conversation, and a box
to message it.

| key | on the shelf | on a pet's page |
|---|---|---|
| `n` | hatch a new pet in a folder you pick | |
| `g` | the graveyard: recently closed sessions | |
| `s` | what the pets would cost at API prices | |
| `m` | your sessions' conversations with each other | |
| `b` | | back |
| `j` | | jump to its tmux pane, or attach its background session |
| `r` | | resurrect it (`claude --resume`) |
| `e` | | rename it |
| `c` | | copy its resume command |
| `k` ×2 | | kill it |
| `x` ×2 | clean every closed pet's temp files (in the graveyard) | clean its temp files |

Cleaning deletes only temp files: the transcript stays, so a pet can still be
resurrected.

When a pet needs you (a permission prompt), your other sessions show a toast
and you get one desktop notification.

When one session [messages another](https://code.claude.com/docs/en/cross-session-messaging),
the sender throws a letter and the receiver catches it. Their messages show as
conversations, a tab for each pair of sessions (`1`–`9` switch tabs): all of
them with `m`, a pet's own on its page.

<img width="569" height="420" alt="image" src="https://github.com/user-attachments/assets/4fe743cc-335f-46bf-8e74-7c8426baa679" />


## Settings

In `/config`, under the plugin:

| setting | default | |
|---|---|---|
| `autoOpen` | on | open the pane at start on a wide terminal |
| `alerts` | toast and notification | or `toast`, or `off` |
| `alertOnDone` | off | also alert when a pet finishes its turn |
| `graveyardDays` | 5 | how far back the graveyard and spend page look |
| `sadAfterMinutes` | 900 | when a waiting pet looks sad (`0`: never) |
| `pollSeconds` | 4 | how often the shelf refreshes |
| `diskWarnGb`, `diskAlarmGb` | 5, 10 | when the disk-use line turns orange, then red |

## Requirements

- Claude Code 2.1.300 or later
- Linux or macOS
- tmux, for jumping, hatching, resurrecting and killing (optional)
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
  and runs `/rename` there (see the hooks below). Those are the only messages
  it sends, and only when you ask.
- A desktop notification when a pet needs you (setting `alerts`), and text
  copied to your clipboard when you press `c` or a copy button.

**Programs it runs, and why.** All with fixed arguments, through Claude Code's
process call, never through a shell with your input in the command:

| program | when | why |
|---|---|---|
| `sh -c <script>` with `find`, `stat`, `grep`, `awk`, `sed`, `tail`, `head`, `tr`, `du`, `xargs`, `id`, `date` | every poll | read the transcripts that changed and the disk use; each script is a fixed string in `hooks/register.tsx` (its shelf section), the paths passed as arguments |
| `env TZ=UTC0 LC_ALL=C ps`, `kill -0` | every poll | whether a session's process is still alive (macOS; Linux reads `/proc`) |
| `git` (read-only: `rev-parse`, `status`, `log`) | a pet's page | its git activity, with fsmonitor and signature programs turned off |
| `tail` | a pet's page | its latest conversation |
| `cat /etc/machine-id`, `readlink`, `ioreg` | once | which machine this is (above) |
| `chmod 700` | once | keep `~/.claude/tamaclaudchi/` to your user |
| `tmux` (`display-message`, `switch-client`, `select-window`, `select-pane`, `new-session`, `has-session`, `list-sessions`, `send-keys`, `list-panes`, `list-clients`, `kill-pane`, `kill-session`) | `j`, `n`, `r`, `k` | jump to a pet (from a background session, `ps` finds the pane its attach runs in), hatch one (`claude` in a new tmux session), resurrect one (`claude --resume <id>`), kill one |
| `claude attach <job>` in a new tmux session (`bg-<job>`) | `j` on a background session | open a session started with `claude --bg` (outside tmux, the command is copied instead) |
| `kill -TERM`, then `kill -KILL` | `k` ×2 | kill a pet not in tmux, only once its process is sure to be that session |
| `rm -rf` | `x` ×2 | clean a closed pet's temp folder (above) |
| `sh -c 'printf … >> <transcript>'` | `e` on a closed pet | the rename line (above) |

**Claude Code commands it runs.** `/rename <name>`, when you rename this
session's pet, or when another session's TamaClaudchi asks this one to rename
itself.

**Its hooks.** It hooks no tool calls, network or process events.

| hook | what it does |
|---|---|
| `session.start` | registers `/tama`, opens the pane on a wide terminal (setting `autoOpen`), starts the poll |
| `command.run` (`/tama`) | opens the pane |
| `ui.render` (its pane, and the prompt's footer) | draws the shelf, and the little faces right of the prompt |
| `ui.message` | the pointer over a pet (from its own `hooks/pethit.tsx`): hover plays it, a click opens it |
| `ui.close` (its pane) | remembers that the pane is closed |
| `session.receive` | takes only a rename sent by TamaClaudchi itself in another of your sessions (above) and runs `/rename`; every other message passes through untouched |

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
