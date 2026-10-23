// The footer: at the right of the prompt's footer line, every running pet as
// a little face in its pet's colour. Working ones wave, one that needs you
// blinks a red mark, and the idle ones doze as one face with a count; the
// pointer on an awake face shows whose it is.
import { atom, read } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { TamaSession } from '../types'
import { clip, vivid } from './format'
import { outfits } from './pets'
import { petName } from './sessions'

// The values this module reads. The engine's scan wants them declared in each
// module that uses them; one plugin and key is one value.
const sessions = atom({ plugin: 'tamaclaudchi', key: 'sessions' } as const, [] as TamaSession[])
const footerFrame = atom({ plugin: 'tamaclaudchi', key: 'footerFrame' } as const, 0)

/** How long each frame of the faces holds. */
export const FOOTER_FRAME_MS = 700
/** The slot an awake face's name shows in, left of the faces, in cells. */
const NAME_W = 24
/** Awake faces drawn at most; more say `+N`. */
const AWAKE_SHOWN = 6
const RED = '#ff5555'

// Each pair is two frames of one width, so the line never jitters.
const WAVE = ['ᕕ(•ᴗ•)ᕗ', 'ᕙ(•ᴗ•)ᕗ']
const ASKING = '(°ᴗ°)'
const DOZE = ['(-ᴗ-)ᶻ ', '(-ᴗ-)zᶻ']

type Next = (e: RenderInput<'SessionMode'>) => Promise<RenderElement>


export async function renderFooter($: EngineInterface, e: RenderInput<'SessionMode'>, next: Next) {
  const all = await read($, sessions)
  const list = all.filter(s => s.live)
  if (!list.length) return next(e)
  const { Box, Text } = $.ui.resolve(e)
  // the shelf's own colours, given out over every pet as the shelf gives them;
  // each pet's hue at full strength, which a terminal of 16 colours keeps
  const looks = outfits(all)
  const tint = (s: TamaSession) => vivid(looks.get(s.id)!.skin.body)
  const frame = await read($, footerFrame)
  const busy = list.filter(s => s.mood === 'busy')
  const asking = list.filter(s => s.mood === 'needs')
  const asleep = list.filter(s => s.mood !== 'busy' && s.mood !== 'needs')
  const awake = [...asking, ...busy].slice(0, AWAKE_SHOWN)
  const more = asking.length + busy.length - awake.length
  // A face's name, while the pointer is on it, shows in a slot left of the
  // faces that is always there: the line keeps its width, so nothing around
  // it moves or wraps. A face and its name share a hover group.
  const group = (s: TamaSession) => `tama-face-${s.id}`.slice(0, 64)
  return (
    <Box>
      {e.props.modes.length ? <Text dimColor>{e.props.modes.join(' & ')} · </Text> : null}
      {awake.length ? (
        <Box position="relative" width={NAME_W} height={1}>
          {awake.map(s => (
            <Box position="absolute" top={0} right={1} display="none" hover={{ scope: group(s), display: 'flex' }}>
              <Text color={tint(s)}>{clip(petName(s), NAME_W - 2)}</Text>
            </Box>
          ))}
        </Box>
      ) : null}
      {awake.map((s, i) => s.mood === 'needs'
        ? <Text key={`face-${s.id}`} hover={{ scope: group(s), bold: true }}><Text color={tint(s)}>{ASKING}</Text><Text bold color={RED}>{frame % 2 ? ' ' : '!'}</Text> </Text>
        // each waves on its own beat
        : <Text key={`face-${s.id}`} color={tint(s)} hover={{ scope: group(s), bold: true }}>{WAVE[(frame + i) % 2]} </Text>)}
      {more ? <Text dimColor>+{more} </Text> : null}
      {asleep.length ? <Text dimColor>{awake.length ? '· ' : ''}{DOZE[frame % 2]} ×{asleep.length}</Text> : null}
    </Box>
  )
}
