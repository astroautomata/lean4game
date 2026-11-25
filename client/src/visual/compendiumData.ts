/**
 * The Compendium: every theorem and tactic of a game, with the level it comes from and
 * what the screens before and after the levels say about it. Worked out from the
 * levels' data alone, so it is the same whoever is playing; what a player has unlocked
 * is decided by whoever shows it.
 */

/** The tactics a player of Visual Lean sees as tactics, on their cards. */
export const VISUAL_TACTIC_NAMES: ReadonlySet<string> = new Set(['symm', 'induction', 'cases', 'positivity', 'exfalso'])

/** A theorem or tactic on a screen before or after a level (`VisualPreLevelUnlock`,
 * `VisualPostLevelUnlock`): the name the player knows it by, and what the screen says. */
export interface InterstitialItem {
  name: string
  text?: string
}

/** A screen shown before a level is played or once it is finished (`VisualPreLevel`,
 * `VisualPostLevel`). */
export interface InterstitialScreen {
  title?: string
  items?: InterstitialItem[]
  text?: string
}

/** A theorem or tactic as a level's data lists it. `world` and `level` say where the
 * player gets it, once they have. */
export interface InventoryTileSummary {
  name: string
  displayName?: string
  category?: string
  world?: string | null
  level?: number | null
  /** Its place among what the same level hands out. */
  declIndex?: number | null
  hidden?: boolean
}

/** What the Compendium reads from one level. */
export interface CompendiumLevel {
  /** The level's label on the map (`VisualLevelNumber`). */
  label?: string
  /** The theorem the level proves, if it is one the game hands on. */
  statementName?: string | null
  lemmas: InventoryTileSummary[]
  tactics: InventoryTileSummary[]
  screens: InterstitialScreen[]
}

export interface CompendiumEntry {
  type: 'theorem' | 'tactic'
  /** The full name, as Lean and the game's data know it. */
  name: string
  /** The name on its card. */
  label: string
  category?: string
  /** The level it comes from. */
  world: string
  level: number
  levelLabel: string
  /** Proved in that level, and so the player's once it is finished; otherwise it is
   * handed out there, and the player's as soon as the level can be played. */
  proved: boolean
  /** Its place among what the same level hands out, where the game says. */
  declIndex?: number
  description?: string
}

/** Whether a screen's item names this theorem or tactic: by its full name, by the name
 * on its card, or by the last part of its full name (`add_zero` for `MyNat.add_zero`). */
export function itemNames(item: string, name: string, displayName?: string): boolean {
  return item === name || item === displayName || name.endsWith(`.${item}`)
}

/** The worlds in an order that respects the map's paths, and is otherwise by name. */
export function worldOrder(worlds: readonly string[], edges: readonly (readonly string[])[]): string[] {
  const pending = [...worlds].sort()
  const order: string[] = []
  while (pending.length > 0) {
    const ready = pending.findIndex(world =>
      edges.every(([source, target]) => target !== world || source === world || !pending.includes(source!)))
    order.push(...pending.splice(Math.max(ready, 0), 1))
  }
  return order
}

const levelKey = (world: string, level: number) => `${world}:${level}`

export function buildCompendium(input: {
  levels: Record<string, CompendiumLevel>
  worldSize: Record<string, number>
  /** `worldOrder`'s. */
  order: readonly string[]
  /** The tactics the player sees as such; the others are how the game is built. */
  isTactic: (name: string) => boolean
}): CompendiumEntry[] {
  const { levels, worldSize, order, isTactic } = input
  const entries = new Map<string, CompendiumEntry>()
  const known = new Map<string, InventoryTileSummary>()
  const keys = order.flatMap(world =>
    Array.from({ length: worldSize[world] ?? 0 }, (_, index) => ({ world, level: index + 1 })))
  const add = (type: CompendiumEntry['type'], tile: InventoryTileSummary, world: string, level: number) => {
    const source = levels[levelKey(world, level)]
    entries.set(`${type}:${tile.name}`, {
      type,
      name: tile.name,
      label: tile.displayName || tile.name.split('.').at(-1) || tile.name,
      category: tile.category,
      world,
      level,
      levelLabel: source?.label ?? String(level),
      proved: type === 'theorem' && source?.statementName === tile.name,
      declIndex: tile.declIndex ?? undefined,
    })
  }
  // Every level lists the theorems and tactics the player has by then, each with the
  // level that proved it or handed it out.
  for (const { world, level } of keys) {
    const data = levels[levelKey(world, level)]
    if (!data) continue
    for (const tile of data.lemmas) {
      if (!known.has(tile.name)) known.set(tile.name, tile)
      if (tile.hidden || !tile.world || tile.level == null || entries.has(`theorem:${tile.name}`)) continue
      add('theorem', tile, tile.world, tile.level)
    }
    for (const tile of data.tactics) {
      if (tile.hidden || !isTactic(tile.name) || !tile.world || tile.level == null) continue
      if (!entries.has(`tactic:${tile.name}`)) add('tactic', tile, tile.world, tile.level)
    }
  }
  // A theorem that no later level lists: the one proved at the end of a path.
  for (const { world, level } of keys) {
    const proved = levels[levelKey(world, level)]?.statementName
    const tile = proved ? known.get(proved) : undefined
    if (tile && !tile.hidden && !entries.has(`theorem:${tile.name}`)) add('theorem', tile, world, level)
  }
  const result = [...entries.values()]
  // What the screens before and after the levels say about each of them.
  for (const { world, level } of keys) {
    for (const screen of levels[levelKey(world, level)]?.screens ?? []) {
      for (const item of screen.items ?? []) {
        if (!item.text) continue
        const entry = result.find(candidate => itemNames(item.name, candidate.name, candidate.label))
        if (entry && !entry.description) entry.description = item.text
      }
    }
  }
  const rank = (entry: CompendiumEntry) => order.indexOf(entry.world)
  return result.sort((a, b) => rank(a) - rank(b) || a.level - b.level
    || (a.declIndex ?? Infinity) - (b.declIndex ?? Infinity) || a.label.localeCompare(b.label))
}

/** Whether the player has it: a theorem proved in a level, once that level is finished;
 * anything handed out in a level, once that level can be played. */
export function isEntryUnlocked(
  entry: CompendiumEntry,
  isCompleted: (world: string, level: number) => boolean,
  isOpen: (world: string, level: number) => boolean,
): boolean {
  return entry.proved ? isCompleted(entry.world, entry.level) : isOpen(entry.world, entry.level)
}
