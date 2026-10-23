// The pets now playing frames into their Rasters, by Raster key: a hover loop
// (actions.ts) or a message's animation (mailfx.ts). One at a time per pet: a
// new one cancels the one before. A reload drops them, which only stops a pet
// mid-hop.
import type { EngineInterface } from 'claude-code'

export const PANE = 'tamaclaudchi'

export const playing = new Map<string, { cancel: () => void }>()

/** Plays `frames` once into a Raster, `ms` apart, then rests it; unless a hover loop plays there. */
export function playOnce($: EngineInterface, key: string, frames: string[], rest: string, ms: number) {
  if (playing.has(key)) return
  let n = 0
  const stop = () => {
    timer.cancel()
    if (playing.get(key) === entry) playing.delete(key)
  }
  const timer = $.clock.every(ms, () => {
    const isLast = n >= frames.length
    const cells = isLast ? rest : frames[n++]!
    void $.ui.blit({ requestId: PANE, key, cells }).then(r => { if (r.deny) stop() })
    if (isLast) stop()
  })
  const entry = { cancel: stop }
  playing.set(key, entry)
}
