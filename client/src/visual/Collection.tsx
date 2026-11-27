/**
 * The Collection (experimental): a screen on the map with every symbol, equality,
 * proposition and tactic of the game, in two panes. On the left a list within a list:
 * the kinds, and the equalities and the propositions each under the tabs the game files
 * them in. What the player has unlocked is a line with its name and what it says, and
 * picking it shows it on the right: its card, whether it is an axiom or a theorem, what
 * the game said about it, and the level it came from. The rest is in the list too,
 * greyed out and unnamed.
 */
import * as React from 'react'
import { GameIdContext } from '../app'
import type { GameInfo } from '../state/api'
import { selectCompleted, selectEntered, selectProgress } from '../state/progress'
import { store } from '../state/store'
import { useAppSelector } from '../hooks'
import { Markdown } from '../components/markdown'
import { colorizeFormula } from './colorizeFormula'
import {
  axiomTest, buildCollection, isEntryUnlocked, tabOrder, VISUAL_TACTIC_NAMES, worldOrder,
  type CollectionEntry, type CollectionLevel,
} from './collectionData'
import { formatFormulaText } from './expr-engine'
import { SymbolCard, theoremStatementText, UnlockCard, useTheoremDocs, type TheoremDoc } from './LevelInterstitial'
import { useLevelMeta } from './levelMeta'
import { bonusAnchorsOf, computeVisualProgressFrontier, isVisualLevelUnlocked } from './visualWorldProgress'

const entryKey = (entry: CollectionEntry) => `${entry.type}:${entry.name}`

export interface CollectionState {
  entries: CollectionEntry[]
  /** The tabs theorems are filed under, in the game's order. */
  tabs: string[]
  /** `entryKey`s of what the player has. */
  unlocked: ReadonlySet<string>
}

/** The game's Collection and what this player has unlocked of it; empty until the
 * levels' data has arrived. */
export function useCollection(gameInfo: GameInfo | undefined, fullComplete: boolean): CollectionState {
  const gameId = React.useContext(GameIdContext)
  const meta = useLevelMeta(gameId, gameInfo?.visualPathMap ? gameInfo.worldSize : undefined)
  // Progress lives in the store; reading it here keeps the list current.
  const progress = useAppSelector(selectProgress(gameId))
  const nodes = gameInfo?.worlds?.nodes
  const edges = gameInfo?.worlds?.edges
  const worldSize = gameInfo?.worldSize
  const { entries, tabs } = React.useMemo(() => {
    if (!meta || !nodes || !worldSize) return { entries: [], tabs: [] }
    const levels: Record<string, CollectionLevel> = {}
    for (const [key, level] of Object.entries(meta)) {
      if (level.collection) levels[key] = level.collection
    }
    return {
      entries: buildCollection({
        levels,
        worldSize,
        order: worldOrder(Object.keys(nodes), edges ?? []),
        isTactic: name => VISUAL_TACTIC_NAMES.has(name),
      }),
      tabs: tabOrder(levels),
    }
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
  return { entries, tabs, unlocked }
}

type Section = 'symbol' | 'equality' | 'proposition' | 'tactic'
const SECTIONS: ReadonlyArray<{ id: Section; title: string }> = [
  { id: 'symbol', title: 'Symbols' },
  { id: 'equality', title: 'Equalities' },
  { id: 'proposition', title: 'Propositions' },
  { id: 'tactic', title: 'Tactics' },
]

function sectionOf(entry: CollectionEntry, docs: Record<string, TheoremDoc>): Section | null {
  if (entry.type === 'tactic' || entry.type === 'symbol') return entry.type
  const kind = docs[entry.name]?.theoremKind
  return kind === 'equality' || kind === 'proposition' ? kind : null
}

/** The right pane: the entry picked in the list, as its card with what is known of it. */
function EntryDetail({ entry, doc, axiom, world }: {
  entry: CollectionEntry
  doc?: TheoremDoc
  axiom: boolean
  /** The title of the world it comes from. */
  world: string
}) {
  const kind = entry.type === 'symbol' ? 'Symbol' : entry.type === 'tactic' ? 'Tactic' : axiom ? 'Axiom' : 'Theorem'
  return (
    <>
      <span className={`collection-kind collection-kind-${kind.toLowerCase()}`} data-testid="collection-kind">{kind}</span>
      <div className="collection-page-card">
        {entry.type === 'symbol'
          ? <SymbolCard symbol={entry.label} name={entry.symbolName} />
          : (
            <UnlockCard
              unlock={{ type: entry.type, name: entry.name, label: entry.label, category: entry.category }}
              doc={doc}
              axiom={axiom}
            />
          )}
      </div>
      {entry.description && (
        <div className="collection-page-text"><Markdown>{entry.description}</Markdown></div>
      )}
      <p className="collection-page-source" data-testid="collection-source">
        {entry.proved ? 'Proved in' : 'Unlocked in'} {world} {entry.levelLabel}
      </p>
    </>
  )
}

/** One line of the list: an entry the player has, which shows it on the right, or `???`. */
function EntryLine({ entry, unlocked, selected, doc, onOpen }: {
  entry: CollectionEntry
  unlocked: boolean
  selected: boolean
  doc?: TheoremDoc
  onOpen: () => void
}) {
  if (!unlocked) {
    return (
      <li className="collection-entry locked" data-testid="collection-entry" data-locked="true" aria-label="Not unlocked yet">
        <span className="collection-entry-line">???</span>
      </li>
    )
  }
  const statement = entry.type === 'symbol' ? entry.symbolName : theoremStatementText(doc)
  return (
    <li className={`collection-entry${selected ? ' selected' : ''}`} data-testid="collection-entry" data-entry={entry.label}>
      <button
        type="button"
        className="collection-entry-line"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${entry.label}: show it`}
      >
        <span className="collection-entry-name">{entry.label}</span>
        {statement && (
          <span className="collection-entry-statement">
            {entry.type === 'symbol' ? statement : colorizeFormula(formatFormulaText(statement))}
          </span>
        )}
      </button>
    </li>
  )
}

export function Collection({ gameInfo, state, onClose }: {
  gameInfo: GameInfo
  state: CollectionState
  onClose: () => void
}) {
  const gameId = React.useContext(GameIdContext)
  const { entries, tabs, unlocked } = state
  const docs = useTheoremDocs(gameId, entries.filter(entry => entry.type === 'theorem').map(entry => entry.name))
  const [picked, setPicked] = React.useState<string | null>(null)
  const axiomName = React.useMemo(() => axiomTest(gameInfo.visualAxioms), [gameInfo.visualAxioms])
  const worldTitle = (world: string) => gameInfo.worlds?.nodes?.[world]?.title || world
  const shown = entries.filter(entry => sectionOf(entry, docs) !== null)
  const count = (listed: CollectionEntry[]) =>
    `${listed.filter(entry => unlocked.has(entryKey(entry))).length} of ${listed.length}`
  // The game's tabs in its order; a theorem filed under none of them comes last.
  const tabRank = (tab: string) => tabs.includes(tab) ? tabs.indexOf(tab) : tabs.length
  // The list as it is laid out: the kinds, and under the equalities and the propositions
  // the game's tabs.
  const sections = SECTIONS.flatMap(section => {
    const listed = shown.filter(entry => sectionOf(entry, docs) === section.id)
    if (listed.length === 0) return []
    const tabbed = section.id === 'equality' || section.id === 'proposition'
    const filed = tabbed
      ? [...new Set(listed.map(entry => entry.category ?? ''))].sort((a, b) => tabRank(a) - tabRank(b))
      : ['']
    return [{
      ...section,
      listed,
      tabbed,
      groups: filed.map(tab => ({ tab, entries: tabbed ? listed.filter(entry => (entry.category ?? '') === tab) : listed })),
    }]
  })
  // The right pane always shows something the player has: what they picked, or the
  // first such line of the list.
  const inOrder = sections.flatMap(section => section.groups.flatMap(group => group.entries))
  const openEntry = inOrder.find(entry => entryKey(entry) === picked && unlocked.has(picked))
    ?? inOrder.find(entry => unlocked.has(entryKey(entry)))
  const openKey = openEntry ? entryKey(openEntry) : null
  const lines = (listed: CollectionEntry[]) => (
    <ul className="collection-entries">
      {listed.map(entry => {
        const key = entryKey(entry)
        return (
          <EntryLine
            key={key}
            entry={entry}
            unlocked={unlocked.has(key)}
            selected={key === openKey}
            doc={docs[entry.name]}
            onOpen={() => setPicked(key)}
          />
        )
      })}
    </ul>
  )

  return (
    <div className="collection" data-testid="collection">
      <div className="collection-header">
        <button type="button" className="collection-back" onClick={onClose}>← Map</button>
        <h1 className="collection-title">Collection</h1>
        <span className="collection-count" data-testid="collection-count">{count(shown)} unlocked</span>
      </div>
      <div className="collection-panes">
        <div className="collection-body" data-testid="collection-list">
          {sections.map(section => (
            <details key={section.id} className="collection-section" data-section={section.id} open>
              <summary className="collection-section-summary">
                <span className="collection-section-title">{section.title}</span>
                <span className="collection-section-count">{count(section.listed)}</span>
              </summary>
              {!section.tabbed ? lines(section.listed) : (
                <ul className="collection-tabs">
                  {section.groups.map(group => (
                    <li key={group.tab}>
                      <details className="collection-tab" data-tab={group.tab} open>
                        <summary className="collection-tab-summary">
                          <span className="collection-tab-title">{group.tab || 'Other'}</span>
                          <span className="collection-tab-count">{count(group.entries)}</span>
                        </summary>
                        {lines(group.entries)}
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
        <div
          className="collection-detail"
          data-testid="collection-page"
          data-entry={openEntry?.label}
          aria-live="polite"
          aria-label={openEntry?.label}
        >
          {openEntry ? (
            <EntryDetail
              key={openKey}
              entry={openEntry}
              doc={docs[openEntry.name]}
              axiom={openEntry.type === 'theorem' && axiomName(openEntry.name)}
              world={worldTitle(openEntry.world)}
            />
          ) : (
            <p className="collection-detail-empty">Nothing here yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
