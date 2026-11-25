/**
 * The Compendium (experimental): a screen on the map with every equality, proposition
 * and tactic of the game. What the player has unlocked is shown as its card, with a
 * page of its own: whether it is an axiom or a theorem, what the game said about it,
 * and the level it came from. The rest is there too, greyed out and unnamed.
 */
import * as React from 'react'
import { GameIdContext } from '../app'
import type { GameInfo } from '../state/api'
import { selectCompleted, selectEntered, selectProgress } from '../state/progress'
import { store } from '../state/store'
import { useAppSelector } from '../hooks'
import { Markdown } from '../components/markdown'
import {
  buildCompendium, isEntryUnlocked, VISUAL_TACTIC_NAMES, worldOrder,
  type CompendiumEntry, type CompendiumLevel,
} from './compendiumData'
import { UnlockCard, useTheoremDocs, type TheoremDoc } from './LevelInterstitial'
import { useLevelMeta } from './levelMeta'
import { bonusAnchorsOf, computeVisualProgressFrontier, isVisualLevelUnlocked } from './visualWorldProgress'

const entryKey = (entry: CompendiumEntry) => `${entry.type}:${entry.name}`

export interface CompendiumState {
  entries: CompendiumEntry[]
  /** `entryKey`s of what the player has. */
  unlocked: ReadonlySet<string>
}

/** The game's Compendium and what this player has unlocked of it; empty until the
 * levels' data has arrived. */
export function useCompendium(gameInfo: GameInfo | undefined, fullComplete: boolean): CompendiumState {
  const gameId = React.useContext(GameIdContext)
  const meta = useLevelMeta(gameId, gameInfo?.visualPathMap ? gameInfo.worldSize : undefined)
  // Progress lives in the store; reading it here keeps the list current.
  const progress = useAppSelector(selectProgress(gameId))
  const nodes = gameInfo?.worlds?.nodes
  const edges = gameInfo?.worlds?.edges
  const worldSize = gameInfo?.worldSize
  const entries = React.useMemo(() => {
    if (!meta || !nodes || !worldSize) return []
    const levels: Record<string, CompendiumLevel> = {}
    for (const [key, level] of Object.entries(meta)) {
      if (level.compendium) levels[key] = level.compendium
    }
    return buildCompendium({
      levels,
      worldSize,
      order: worldOrder(Object.keys(nodes), edges ?? []),
      isTactic: name => VISUAL_TACTIC_NAMES.has(name),
    })
  }, [edges, meta, nodes, worldSize])
  const unlocked = React.useMemo(() => {
    if (!nodes || !worldSize || entries.length === 0) return new Set<string>()
    const frontier = computeVisualProgressFrontier({
      worldIds: Object.keys(nodes),
      edges: edges ?? [],
      worldSizes: worldSize,
      skippedLevels: gameInfo?.skippedLevels ?? {},
      completionNeutralLevels: gameInfo?.completionNeutralLevels ?? {},
      bonusAnchors: bonusAnchorsOf(nodes),
      isCompleted: (world, level) => fullComplete || selectCompleted(gameId, world, level)(store.getState()),
      isEntered: (world, level) => selectEntered(gameId, world, level)(store.getState()),
    })
    return new Set(entries
      .filter(entry => isEntryUnlocked(
        entry,
        (world, level) => fullComplete || selectCompleted(gameId, world, level)(store.getState()),
        (world, level) => isVisualLevelUnlocked(frontier, world, level),
      ))
      .map(entryKey))
    // `progress` isn't read, but a change of it is what makes the answer change.
  }, [edges, entries, fullComplete, gameId, gameInfo?.completionNeutralLevels, gameInfo?.skippedLevels, nodes, progress, worldSize])
  return { entries, unlocked }
}

type Section = 'equality' | 'proposition' | 'tactic'
const SECTIONS: ReadonlyArray<{ id: Section; title: string; about: string }> = [
  { id: 'equality', title: 'Equalities', about: 'The rules of Rewrite Mode.' },
  { id: 'proposition', title: 'Propositions', about: 'The cards of Proposition Mode.' },
  { id: 'tactic', title: 'Tactics', about: 'The cards you drop on a statement to take it apart.' },
]

function sectionOf(entry: CompendiumEntry, docs: Record<string, TheoremDoc>): Section | null {
  if (entry.type === 'tactic') return 'tactic'
  const kind = docs[entry.name]?.theoremKind
  return kind === 'equality' || kind === 'proposition' ? kind : null
}

function EntryPage({ entry, doc, axiom, world, onClose }: {
  entry: CompendiumEntry
  doc?: TheoremDoc
  axiom: boolean
  /** The title of the world it comes from. */
  world: string
  onClose: () => void
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const kind = entry.type === 'tactic' ? 'Tactic' : axiom ? 'Axiom' : 'Theorem'
  return (
    <div className="compendium-page-backdrop" onClick={onClose}>
      <div
        className="compendium-page"
        role="dialog"
        aria-modal="true"
        aria-label={entry.label}
        data-testid="compendium-page"
        onClick={event => event.stopPropagation()}
      >
        <span className={`compendium-kind compendium-kind-${kind.toLowerCase()}`} data-testid="compendium-kind">{kind}</span>
        <div className="compendium-page-card">
          <UnlockCard unlock={{ type: entry.type, name: entry.name, label: entry.label, category: entry.category }} doc={doc} />
        </div>
        {entry.description && (
          <div className="compendium-page-text"><Markdown>{entry.description}</Markdown></div>
        )}
        <p className="compendium-page-source" data-testid="compendium-source">
          {entry.proved ? 'Proved in' : 'Unlocked in'} {world} {entry.levelLabel}
        </p>
        <button ref={closeRef} type="button" className="compendium-page-close" onClick={onClose}>Back</button>
      </div>
    </div>
  )
}

export function Compendium({ gameInfo, state, onClose }: {
  gameInfo: GameInfo
  state: CompendiumState
  onClose: () => void
}) {
  const gameId = React.useContext(GameIdContext)
  const { entries, unlocked } = state
  const docs = useTheoremDocs(gameId, entries.filter(entry => entry.type === 'theorem').map(entry => entry.name))
  const [open, setOpen] = React.useState<string | null>(null)
  const axioms = React.useMemo(() => new Set((gameInfo.visualAxioms ?? []).map(name => name.split('.').at(-1)!)), [gameInfo.visualAxioms])
  const isAxiom = (entry: CompendiumEntry) => entry.type === 'theorem' && axioms.has(entry.name.split('.').at(-1)!)
  const worldTitle = (world: string) => gameInfo.worlds?.nodes?.[world]?.title || world
  const openEntry = open ? entries.find(entry => entryKey(entry) === open) : undefined
  const shown = entries.filter(entry => sectionOf(entry, docs) !== null)

  return (
    <div className="compendium" data-testid="compendium">
      <div className="compendium-header">
        <button type="button" className="compendium-back" onClick={onClose}>← Map</button>
        <h1 className="compendium-title">Compendium</h1>
        <span className="compendium-count" data-testid="compendium-count">
          {shown.filter(entry => unlocked.has(entryKey(entry))).length} of {shown.length} unlocked
        </span>
      </div>
      <div className="compendium-body">
        {SECTIONS.map(section => {
          const listed = shown.filter(entry => sectionOf(entry, docs) === section.id)
          if (listed.length === 0) return null
          return (
            <section key={section.id} className="compendium-section" data-section={section.id}>
              <h2 className="compendium-section-title">{section.title}</h2>
              <p className="compendium-section-about">{section.about}</p>
              <ul className="compendium-grid">
                {listed.map(entry => {
                  const key = entryKey(entry)
                  if (!unlocked.has(key)) {
                    return (
                      <li key={key} className="compendium-entry locked" data-testid="compendium-entry" data-locked="true"
                        aria-label="Not unlocked yet">
                        <span className="compendium-locked-card">???</span>
                      </li>
                    )
                  }
                  return (
                    <li key={key} className="compendium-entry" data-testid="compendium-entry" data-entry={entry.label}>
                      <button type="button" className="compendium-entry-button" onClick={() => setOpen(key)}
                        aria-label={`${entry.label}: open its page`}>
                        <UnlockCard unlock={{ type: entry.type, name: entry.name, label: entry.label, category: entry.category }}
                          doc={docs[entry.name]} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
      {openEntry && (
        <EntryPage
          entry={openEntry}
          doc={docs[openEntry.name]}
          axiom={isAxiom(openEntry)}
          world={worldTitle(openEntry.world)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
