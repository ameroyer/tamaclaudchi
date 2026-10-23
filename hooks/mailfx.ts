// A message between two sessions, played on the shelf as it happens: its
// sender throws a letter, its receiver catches one (pets.ts draws them). Each
// pet plays its own end, so a message seen from both ends plays on both.
import type { EngineInterface } from 'claude-code'

import type { TamaSession } from '../types'
import { settings } from './config'
import { mailFrames, outfits, petRest } from './pets'
import { playOnce } from './players'
import { isAsleep, isSad } from './sessions'

const MAIL_FRAME_MS = 180
/** A message older than this when first seen is old news: it plays nothing. */
const FRESH_MS = 2 * 60_000

// Each pet's ends of messages as of the last poll; null before the first,
// which plays nothing (what was sent before the shelf opened is old news).
let seen: Set<string> | null = null

/** The ends of messages new since the last poll: each its pet, and whether it sent or got the message. */
export function newMail(shelf: TamaSession[], prev: Set<string> | null, now: number) {
  const ends = new Set<string>()
  const fresh: { s: TamaSession; role: 'send' | 'get' }[] = []
  for (const s of shelf) {
    for (const m of s.mail ?? []) {
      const key = `${s.id}:${m.id}:${m.dir}`
      ends.add(key)
      if (prev && !prev.has(key) && s.live && m.ok && now - m.at < FRESH_MS) fresh.push({ s, role: m.dir === 'out' ? 'send' : 'get' })
    }
  }
  return { ends, fresh }
}

/** Plays every message new since the last poll on its pets' cards. */
export function playMail($: EngineInterface, shelf: TamaSession[], now: number) {
  const { ends, fresh } = newMail(shelf, seen, now)
  seen = ends
  if (!fresh.length) return
  const looks = outfits(shelf)
  for (const { s, role } of fresh) {
    const o = looks.get(s.id)!
    const look = { faded: isAsleep(s, now), halo: !s.live, sad: isSad(s, now, settings.sadMs) }
    // the card's own Raster; a pane that is closed or on another page denies the blit, which stops it
    playOnce($, `pet-${s.id}`, mailFrames(o, look, role), petRest(o, look).cells, MAIL_FRAME_MS)
  }
}
