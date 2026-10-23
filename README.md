# TamaClaudchi

A pixel pet for every Claude Code session on your machine, in a `/tama` pane:
see at a glance which sessions are working, which need you, and which have
gone quiet.

<!-- a screenshot or GIF of the shelf here -->

## Install

At a Claude Code prompt:

```
/plugin install tamaclaudchi --marketplace ameroyer/tamaclaudchi
```

Then start a new session and type `/tama`. That's it: every setting has a
default.

Two tips:

- **Run Claude Code inside tmux** (`tmux new -s work`, then `claude`), so a pet
  can take you to its session, and you can hatch, resurrect and kill pets.
- **Use the fullscreen layout** (`/tui fullscreen`) to dock the pane on the
  right. Otherwise it opens above the prompt.

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
| `j` | | jump to its tmux pane |
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
Nothing leaves your machine. Git runs read-only.

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
