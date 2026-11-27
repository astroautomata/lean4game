/**
 * The Collection: every symbol, theorem and tactic of a game, with the level it comes
 * from and what the screens before and after the levels say about it. Worked out from the
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

/** A symbol on such a screen (`VisualPreLevelSymbol`): the symbol, what it is called,
 * and what the screen says about it. */
export interface InterstitialSymbol {
  symbol: string
  name?: string
  text?: string
}

/** One page of a screen: a title, what it presents, and a text under it all. */
export interface InterstitialPage {
  title?: string
  symbols?: InterstitialSymbol[]
  items?: InterstitialItem[]
  text?: string
}

/** A screen shown before a level is played or once it is finished (`VisualPreLevel`,
 * `VisualPostLevel`): its first page, and the pages that follow it one by one. */
export interface InterstitialScreen extends InterstitialPage {
  more?: InterstitialPage[]
}

/** A screen's pages in the order they are shown. */
export function screenPages(screen: InterstitialScreen | null | undefined): InterstitialPage[] {
  if (!screen) return []
  const { more, ...first } = screen
  return [first, ...(more ?? [])]
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

/** What the Collection reads from one level. */
export interface CollectionLevel {
  /** The level's label on the map (`VisualLevelNumber`). */
  label?: string
  /** The theorem the level proves, if it is one the game hands on. */
  statementName?: string | null
  lemmas: InventoryTileSummary[]
  tactics: InventoryTileSummary[]
  screens: InterstitialScreen[]
  /** The one of them shown once the level is finished. */
  postScreen?: InterstitialScreen
}

export interface CollectionEntry {
  type: 'theorem' | 'tactic' | 'symbol'
  /** The full name, as Lean and the game's data know it; a symbol is its own name. */
  name: string
  /** The name on its card; a symbol itself. */
  label: string
  /** What a symbol is called (`For All`). */
  symbolName?: string
  category?: string
  /** The level it comes from. */
  world: string
  level: number
  levelLabel: string
  /** Proved in that level, and so the player's once it is finished; otherwise it is
   * handed out there, and the player's as soon as the level can be played. */
  proved: boolean
  /** Handed out on the screen after that level, and so the player's once it is finished. */
  afterLevel?: boolean
  /** Its place among what the same level hands out, where the game says. */
  declIndex?: number
  description?: string
}

/** Whether a screen's item names this theorem or tactic: by its full name, by the name
 * on its card, or by the last part of its full name (`add_zero` for `MyNat.add_zero`). */
export function itemNames(item: string, name: string, displayName?: string): boolean {
  return item === name || item === displayName || name.endsWith(`.${item}`)
}

/** Whether a theorem is one of the game's axioms (`VisualAxioms`), which are listed by
 * their full names or by the last part of them. */
export function axiomTest(axioms: readonly string[] | undefined): (name: string) => boolean {
  const names = new Set((axioms ?? []).map(name => name.split('.').at(-1)!))
  return name => names.has(name.split('.').at(-1)!)
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

export function buildCollection(input: {
  levels: Record<string, CollectionLevel>
  worldSize: Record<string, number>
  /** `worldOrder`'s. */
  order: readonly string[]
  /** The tactics the player sees as such; the others are how the game is built. */
  isTactic: (name: string) => boolean
}): CollectionEntry[] {
  const { levels, worldSize, order, isTactic } = input
  const entries = new Map<string, CollectionEntry>()
  const known = new Map<string, InventoryTileSummary>()
  const keys = order.flatMap(world =>
    Array.from({ length: worldSize[world] ?? 0 }, (_, index) => ({ world, level: index + 1 })))
  const add = (type: CollectionEntry['type'], tile: InventoryTileSummary, world: string, level: number) => {
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
  // A theorem that the screen after a level hands out comes from that level, though the
  // game's data only lists it from the next one on.
  const place = (world: string, level: number) => keys.findIndex(key => key.world === world && key.level === level)
  for (const { world, level } of keys) {
    const source = levels[levelKey(world, level)]
    for (const item of screenPages(source?.postScreen).flatMap(page => page.items ?? [])) {
      const entry = result.find(candidate => candidate.type === 'theorem' && itemNames(item.name, candidate.name, candidate.label))
      if (!entry || entry.proved || place(entry.world, entry.level) <= place(world, level)) continue
      Object.assign(entry, { world, level, levelLabel: source?.label ?? String(level), afterLevel: true })
    }
  }
  // What the screens before and after the levels say about each of them. A page with
  // a text under all and none for any one of them says it about each.
  for (const { world, level } of keys) {
    for (const page of (levels[levelKey(world, level)]?.screens ?? []).flatMap(screenPages)) {
      const items = page.items ?? []
      const shared = items.some(item => item.text) ? undefined : page.text
      for (const item of items) {
        const text = item.text || shared
        if (!text) continue
        const entry = result.find(candidate => candidate.type !== 'symbol' && itemNames(item.name, candidate.name, candidate.label))
        if (entry && !entry.description) entry.description = text
      }
    }
  }
  // The symbols the screens introduce, each from the first level that shows it: the
  // player's as soon as that level can be played, or once it is finished if the screen
  // comes after it.
  for (const { world, level } of keys) {
    const source = levels[levelKey(world, level)]
    for (const screen of source?.screens ?? []) {
      for (const symbol of screenPages(screen).flatMap(page => page.symbols ?? [])) {
        if (!symbol.symbol || result.some(entry => entry.type === 'symbol' && entry.name === symbol.symbol)) continue
        result.push({
          type: 'symbol',
          name: symbol.symbol,
          label: symbol.symbol,
          symbolName: symbol.name || undefined,
          world,
          level,
          levelLabel: source?.label ?? String(level),
          proved: false,
          afterLevel: screen === source?.postScreen || undefined,
          declIndex: result.filter(entry => entry.type === 'symbol').length,
          description: symbol.text || undefined,
        })
      }
    }
  }
  const rank = (entry: CollectionEntry) => order.indexOf(entry.world)
  // What a level proves or hands out comes before what the screen after it adds.
  return result.sort((a, b) => rank(a) - rank(b) || a.level - b.level || Number(Boolean(a.afterLevel)) - Number(Boolean(b.afterLevel))
    || (a.declIndex ?? Infinity) - (b.declIndex ?? Infinity) || a.label.localeCompare(b.label))
}

/** The tabs theorems are filed under, in the order the game shows them: that of the
 * list every level gives its theorems in. */
export function tabOrder(levels: Record<string, CollectionLevel>): string[] {
  const tabs = new Set<string>()
  for (const level of Object.values(levels)) {
    for (const tile of level.lemmas) if (tile.category) tabs.add(tile.category)
    if (tabs.size > 0) break
  }
  return [...tabs]
}

/** The screen that announces a boss level: what kind of boss it is, and its name as the
 * headline. A title ending in brackets says the kind itself, `Plug and Chug (Successor
 * World Boss)`; a bare `(Miniboss)` is its world's, and without brackets the level is
 * its world's boss if it is the last level there, and a miniboss if not. */
export function bossAnnouncement(levelTitle: string, worldTitle: string, lastOfWorld: boolean): InterstitialScreen {
  const named = /^(.*\S)\s*\(([^()]*boss)\)$/iu.exec(levelTitle.trim())
  const kind = named ? named[2]!.trim() : lastOfWorld ? 'Boss' : 'Miniboss'
  return {
    title: /\s/u.test(kind) ? kind : `${worldTitle} ${kind}`.trim(),
    text: named ? named[1]! : levelTitle.trim(),
  }
}

/** Whether the player has it: a theorem proved in a level, or anything handed out on
 * the screen after it, once that level is finished; anything handed out in a level or on
 * the screen before it, once that level can be played. */
export function isEntryUnlocked(
  entry: CollectionEntry,
  isCompleted: (world: string, level: number) => boolean,
  isOpen: (world: string, level: number) => boolean,
): boolean {
  return entry.proved || entry.afterLevel ? isCompleted(entry.world, entry.level) : isOpen(entry.world, entry.level)
}
