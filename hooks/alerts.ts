// Announces a pet that has started to need you (a permission prompt), and,
// when asked for, one that has finished its turn. Every session toasts the
// news of the others; the session reading for the machine alone raises the
// native notification, so it comes once, not once per session.
import type { EngineInterface } from 'claude-code'

import type { Mood, TamaSession } from '../types'
import { settings } from './config'
import { petName } from './sessions'

// Each running pet's mood at the last poll; null before the first, which
// announces nothing (a pet already waiting when the session started is old news).
let before: Map<string, Mood> | null = null

/** What changed since the last poll, as lines to announce. */
export function news(shelf: TamaSession[], prev: Map<string, Mood> | null): { needs: TamaSession[]; done: TamaSession[] } {
  const out = { needs: [] as TamaSession[], done: [] as TamaSession[] }
  if (!prev) return out
  for (const s of shelf) {
    if (!s.live) continue
    const was = prev.get(s.id)
    if (s.mood === 'needs' && was !== 'needs') out.needs.push(s)
    else if (settings.alertOnDone && s.mood === 'waiting' && was === 'busy') out.done.push(s)
  }
  return out
}

const names = (list: TamaSession[]) => list.map(petName).join(', ')

export async function announce($: EngineInterface, shelf: TamaSession[], me: string | null, isReader: boolean) {
  const prev = before
  before = new Map(shelf.filter(s => s.live).map(s => [s.id, s.mood]))
  if (settings.alerts === 'off') return
  const { needs, done } = news(shelf, prev)
  if (!needs.length && !done.length) return
  // your own prompt is in front of you here: the toast is for the others
  for (const s of needs) if (s.id !== me) $.ui.toast(`▲ ${petName(s)} needs you${s.live?.waitingFor ? `: ${s.live.waitingFor}` : ''}`)
  for (const s of done) if (s.id !== me) $.ui.toast(`✓ ${petName(s)} has finished and waits for you`)
  if (!isReader) return
  if (settings.alerts === 'toast and notification') {
    const lines = [
      needs.length ? `${needs.length === 1 ? `${petName(needs[0]!)} needs` : `${needs.length} pets need`} you${needs.length > 1 ? `: ${names(needs)}` : needs[0]!.live?.waitingFor ? `: ${needs[0]!.live!.waitingFor}` : ''}` : '',
      done.length ? `${done.length === 1 ? `${petName(done[0]!)} has` : `${names(done)} have`} finished` : '',
    ].filter(Boolean)
    await $.ui.notify(lines.join('\n'), { title: 'TamaClaudchi' }).catch(() => undefined)
  }
}
