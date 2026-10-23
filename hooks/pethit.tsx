// An invisible layer over a pet: it draws nothing, so the pet's true-colour
// Raster shows through, and tells the hooks module when the pointer comes,
// goes or clicks. The pet itself is repainted from there with $.ui.blit.
import type { ClientModule } from 'claude-code'

type Props = { id: string; w: number; h: number }

const PetHit: ClientModule<Props, true> = (props, surface) => {
  const { Box } = surface.elements
  if (surface.state === undefined) {
    surface.setState(true)
    surface.onPointer(ev => {
      if (ev.type === 'enter') surface.post({ id: props.id, hover: true })
      else if (ev.type === 'leave') surface.post({ id: props.id, hover: false })
      else if (ev.type === 'down') surface.post({ id: props.id, open: true })
    })
  }
  // exactly the pet's box, whatever region the surface measured
  return <Box width={props.w} height={props.h} />
}

export default PetHit
