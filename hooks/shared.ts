// The shelf is read once for every session on this machine, not once per
// session: whichever session holds the lease reads the transcripts and
// writes what it found to one file, and the others read that file. A lease
// not renewed for a few of its polls is anyone's, so when its session closes
// another takes over within seconds.
//
// Two files, each named for this machine (a home folder shared between
// machines holds one pair per machine): a small lease, renewed at every poll,
// and the shelf itself, written only when it changes. Neither holds what the
// sessions said, only what the shelf's cards show.
import type { EngineInterface } from 'claude-code'

import type { TamaSession } from '../types'

export type Disk = { tempDir: string; tempKb: number; logKb: number }

type Lease = {
  schema: number
  /** The session holding the lease. */
  by: string
  /** When it last renewed it, ms since the epoch. */
  at: number
  /** How often it reads: a lease is good for LEASE_POLLS of those. */
  everyMs: number
}

export type Shelf = { sessions: TamaSession[]; disk: Disk | null }

/** Bumped when the files change shape: a session running another version reads for itself. */
const SCHEMA = 3
const LEASE_POLLS = 3

export const sharedPaths = (claudeDir: string, machine: string) => {
  const dir = `${claudeDir}/tamaclaudchi`
  return { dir, lease: `${dir}/lease-${machine}.json`, shelf: `${dir}/shelf-${machine}.json` }
}
type Paths = ReturnType<typeof sharedPaths>

// The shelf file as last parsed, kept while its mtime and size hold; and the
// text this session last wrote there.
let last: { mtimeMs: number; size: number; value: Shelf } | null = null
let written = ''

/**
 * The shelf another session has read, while its lease holds and it reads at
 * least as often as `everyMs`; null when this session should read for itself.
 */
export async function followed($: EngineInterface, paths: Paths, me: string | null, now: number, everyMs: number): Promise<Shelf | null> {
  let lease: Lease
  try {
    lease = JSON.parse(await $.fs.read(paths.lease)) as Lease
  } catch {
    return null // none yet, or caught mid-write: read for yourself this once
  }
  if (lease?.schema !== SCHEMA || lease.by === me || now - lease.at > LEASE_POLLS * lease.everyMs || lease.everyMs > everyMs) return null
  const st = await $.fs.stat(paths.shelf).catch(() => null)
  if (!st || st.kind !== 'file') return last?.value ?? null
  if (!last || last.mtimeMs !== st.mtimeMs || last.size !== st.size) {
    try {
      const value = JSON.parse(await $.fs.read(paths.shelf)) as Shelf & { schema?: number }
      if (value?.schema !== SCHEMA || !Array.isArray(value.sessions)) return null
      last = { mtimeMs: st.mtimeMs, size: st.size, value }
    } catch {
      // caught mid-write: the last whole read stands until the next poll
      if (!last) return null
    }
  }
  return last.value
}

/** Taking the lease over: the shelf file is another's now, so the next share writes it whole. */
export const takeOver = () => { written = '' }

/** Takes or renews the lease: a few bytes at every poll. */
export async function claim($: EngineInterface, paths: Paths, lease: Omit<Lease, 'schema'>) {
  await $.fs.write(paths.lease, JSON.stringify({ schema: SCHEMA, ...lease })).catch(() => undefined)
}

/** Shares the shelf this session has read, when it differs from what it last wrote. */
export async function share($: EngineInterface, paths: Paths, sessionsJson: string, disk: Disk | null) {
  const text = `{"schema":${SCHEMA},"disk":${JSON.stringify(disk)},"sessions":${sessionsJson}}`
  if (text === written) return
  const isFirst = !written
  await $.fs.write(paths.shelf, text).catch(() => undefined)
  written = text
  // what the shelf shows of every session (names, folders) is for this user alone
  if (isFirst) await $.process.run(['chmod', '700', paths.dir]).catch(() => undefined)
}
