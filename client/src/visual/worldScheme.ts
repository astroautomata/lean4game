/**
 * @fileOverview The colours of a world in a game with the neutral palette
 * (`VisualNeutralPalette`): inside a world's levels, everything that isn't grey
 * takes the five colours of the world's scheme (`VisualWorldColor lantern`).
 * The schemes' colours are in palette.css, as `--pal-world-<scheme>` and
 * `--pal-world-<scheme>-2` to `-5`; visual.css says what each is used for.
 */
import type { VisualWorldNode } from '../state/api'

/** The schemes with colours of their own. A world with any other colour, or
 * none, is played in the greys of the `grey` scheme. */
export const WORLD_SCHEMES = [
  'lantern', 'aqueduct', 'signal', 'blossom', 'riverside', 'sandstone', 'circuit', 'canyon', 'frost',
] as const

/** The colour of worlds without one in a game with the neutral palette. */
export const NEUTRAL_WORLD_COLOR = 'grey'

/** The plain map colour that stands in for each scheme where the neutral palette isn't
 * drawn: with the Visual Style "High Contrast", which is the classic palette's dark scheme. */
export const CLASSIC_COLOR_OF_SCHEME: Record<string, string> = {
  lantern: 'amber',
  aqueduct: 'sky',
  signal: 'green',
  blossom: 'pink',
  riverside: 'teal',
  sandstone: 'orange',
  circuit: 'blue',
  canyon: 'indigo',
  frost: 'purple',
}

/** How a game with the neutral palette is drawn, by the "Visual Style" setting of its
 * map's menu: in it ("Standard"), in it with black for every background ("Standard
 * Black"), or in the classic palette's dark scheme ("High Contrast"). Other games have
 * no style. */
export type GameVisualStyle = 'neutral' | 'neutral-black' | 'high-contrast'

/** The look each choice of the setting gives. */
export const VISUAL_STYLE_OF_SETTING: Record<'standard' | 'black' | 'high-contrast', GameVisualStyle> = {
  standard: 'neutral',
  black: 'neutral-black',
  'high-contrast': 'high-contrast',
}

/** The scheme a world is played in, or undefined for the greys. A bonus world and
 * the continuation of a world take the scheme of the world they extend. */
export function worldSchemeOf(
  worlds: Record<string, VisualWorldNode> | null | undefined,
  worldId: string | undefined,
): string | undefined {
  const seen = new Set<string>()
  let current = worldId
  while (current && worlds?.[current] && !seen.has(current)) {
    seen.add(current)
    const world = worlds[current]!
    if (world.visualSharedPath) return undefined
    if (world.visualColor) {
      return (WORLD_SCHEMES as readonly string[]).includes(world.visualColor) ? world.visualColor : undefined
    }
    current = world.visualBonusOf?.world ?? world.visualContinues
  }
  return undefined
}

function visualStyleKey(gameId: string) {
  return `visual_style/${gameId}`
}

/** The look a game was last seen to have, so that it is there before the game's
 * data arrives: no flash of the other palette on the loading screen. */
export function loadGameVisualStyle(gameId: string): GameVisualStyle | undefined {
  try {
    const style = localStorage.getItem(visualStyleKey(gameId))
    return style === 'neutral' || style === 'neutral-black' || style === 'high-contrast' ? style : undefined
  } catch {
    return undefined
  }
}

export function saveGameVisualStyle(gameId: string, style: GameVisualStyle | undefined) {
  try {
    if (style) localStorage.setItem(visualStyleKey(gameId), style)
    else localStorage.removeItem(visualStyleKey(gameId))
  } catch {
    // Storage is a convenience only.
  }
}
