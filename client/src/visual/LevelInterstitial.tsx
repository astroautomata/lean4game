/**
 * The screens 'between' levels (experimental): before a level, what it is about or what
 * it brings; after it, what the player has earned. The level stays in view behind,
 * dimmed, and a button moves on: to the screen's next page if it has one, and then to
 * the level or away from it.
 */
import * as React from 'react'
import { Markdown } from '../components/markdown'
import { getDataBaseUrl } from '../utils/url'
import { inferAtomicReductionForms } from './existsDisplay'
import { buildPropositionTheoremDisplay } from './quantifiedStatement'
import { PropositionTheoremPreviewCard } from './PropositionTheoremCard'
import { parseTheoremStatement } from './TransformationView'
import { EqualityRulePreviewCard } from './TransformRuleCard'
import { VisualTacticPreviewCard } from './VisualTacticCard'
import {
  itemNames, screenPages,
  type InterstitialPage, type InterstitialScreen, type InterstitialSymbol, type InventoryTileSummary,
} from './collectionData'

/** The time the screen takes to fade out before it is gone, as in `visual.css`. */
const FADE_OUT_MS = 220

/** A setting for tests and for comparing with and without: `off` plays the levels with
 * no screens between them. */
export function interstitialsEnabled(): boolean {
  try {
    return window.localStorage.getItem('visual_interstitials') !== 'off'
  } catch {
    return true
  }
}

/** A theorem or tactic to show as its card. */
export interface Unlock {
  type: 'theorem' | 'tactic'
  /** The full name, as the game's data knows it. */
  name: string
  /** The name on its card. */
  label: string
  category?: string
  text?: string
}

export interface TheoremDoc {
  statement?: string
  theoremKind?: 'equality' | 'proposition'
}

const theoremDocs = new Map<string, Promise<TheoremDoc | null>>()
/** The pages that have arrived: a screen opened after them has its cards at once. */
const loadedTheoremDocs = new Map<string, TheoremDoc>()

/** A theorem's statement and kind, from its page of the game's documentation. */
export function loadTheoremDoc(gameId: string, name: string): Promise<TheoremDoc | null> {
  const key = `${gameId}/${name}`
  let request = theoremDocs.get(key)
  if (!request) {
    const base = getDataBaseUrl().replace(/\/$/u, '')
    request = fetch(`${base}/${gameId}/doc__Theorem__${name}.json`)
      .then(response => response.ok ? response.json() as Promise<TheoremDoc> : null)
      .catch(() => null)
    // A page that didn't arrive is asked for again the next time.
    void request.then(doc => {
      if (doc) loadedTheoremDocs.set(key, doc)
      else theoremDocs.delete(key)
    })
    theoremDocs.set(key, request)
  }
  return request
}

export function useTheoremDocs(gameId: string, names: readonly string[]): Record<string, TheoremDoc> {
  const [docs, setDocs] = React.useState<Record<string, TheoremDoc>>(() => Object.fromEntries(
    names.flatMap(name => {
      const doc = loadedTheoremDocs.get(`${gameId}/${name}`)
      return doc ? [[name, doc]] : []
    })))
  const wanted = names.join('\n')
  React.useEffect(() => {
    let active = true
    for (const name of wanted ? wanted.split('\n') : []) {
      void loadTheoremDoc(gameId, name).then(doc => {
        if (active && doc) setDocs(current => current[name] ? current : { ...current, [name]: doc })
      })
    }
    return () => { active = false }
  }, [gameId, wanted])
  return docs
}

/** One page of a screen with the cards for what it names. */
export interface ScreenPage {
  page: InterstitialPage
  unlocks: Unlock[]
}

/** A screen's pages, each with the theorems and tactics it names as cards. */
export function resolveScreen(
  screen: InterstitialScreen,
  lemmas: readonly InventoryTileSummary[],
  tactics: readonly InventoryTileSummary[],
): ScreenPage[] {
  return screenPages(screen).map(page => ({ page, unlocks: resolveUnlocks(page, lemmas, tactics) }))
}

/** The theorems and tactics a page names, found in the level's own lists. A name the
 * level doesn't know is left out: there is no card to show for it. */
export function resolveUnlocks(
  screen: InterstitialPage | null | undefined,
  lemmas: readonly InventoryTileSummary[],
  tactics: readonly InventoryTileSummary[],
): Unlock[] {
  return (screen?.items ?? []).flatMap((item): Unlock[] => {
    const lemma = lemmas.find(tile => itemNames(item.name, tile.name, tile.displayName))
    if (lemma) {
      return [{ type: 'theorem', name: lemma.name, label: lemma.displayName || item.name, category: lemma.category, text: item.text }]
    }
    const tactic = tactics.find(tile => itemNames(item.name, tile.name, tile.displayName))
    return tactic ? [{ type: 'tactic', name: tactic.name, label: tactic.displayName || tactic.name, text: item.text }] : []
  })
}

/** A theorem's statement on one line, for a list. */
export function theoremStatementText(doc: TheoremDoc | undefined): string | null {
  return doc?.statement ? buildPropositionTheoremDisplay(doc.statement).mainText : null
}

/** A theorem or a tactic as the card the player finds in the game: an equality is a
 * rule of Rewrite Mode, with the axioms' double outline if it is one, a proposition is
 * a card of Proposition Mode's lower menu, and a tactic its card there. A theorem's
 * statement comes from the game's documentation, so until that arrives the card is its
 * name alone. */
export function UnlockCard({ unlock, doc, axiom = false }: { unlock: Unlock; doc?: TheoremDoc; axiom?: boolean }) {
  const rule = React.useMemo(() => unlock.type === 'theorem' && doc?.theoremKind === 'equality' && doc.statement
    ? parseTheoremStatement(doc.statement, unlock.label, unlock.name)
    : null, [doc, unlock.label, unlock.name, unlock.type])
  if (unlock.type === 'tactic') {
    return <VisualTacticPreviewCard tactic={{ id: unlock.name, name: unlock.name, label: unlock.label }} />
  }
  if (rule) {
    return (
      <EqualityRulePreviewCard
        label={rule.label}
        lhsStr={rule.lhsStr}
        rhsStr={rule.rhsStr}
        lhsNode={rule.lhs}
        rhsNode={rule.rhs}
        forallFooter={rule.forallFooter}
        axiom={axiom}
      />
    )
  }
  const display = doc?.statement ? buildPropositionTheoremDisplay(doc.statement) : null
  return (
    <PropositionTheoremPreviewCard fromTray theorem={{
      id: unlock.name,
      theoremName: unlock.name,
      label: unlock.label,
      proposition: display?.mainText ?? '…',
      reductionForms: display ? inferAtomicReductionForms(display.mainText) : undefined,
      forallFooter: display?.forallFooter,
      category: unlock.category,
    }} />
  )
}

/** A symbol as a card: the symbol itself, large, over what it is called. */
export function SymbolCard({ symbol, name }: { symbol: string; name?: string }) {
  // A symbol of several letters (`S(n)`, `False`) is set smaller, to the same card.
  const size = [...symbol].length > 3 ? 'long' : [...symbol].length > 1 ? 'medium' : 'short'
  return (
    <div className="symbol-card" data-testid="symbol-card" data-symbol={symbol} data-size={size}>
      <span className="symbol-card-glyph">{symbol}</span>
      {name && <span className="symbol-card-name">{name}</span>}
    </div>
  )
}

const symbolKey = (symbol: InterstitialSymbol) => `symbol:${symbol.symbol}`

export function LevelInterstitial({ gameId, kind, pages, isAxiom, buttonLabel, onDone }: {
  gameId: string
  /** Before the level, or after it. */
  kind: 'pre' | 'post'
  /** The screen's pages, shown one after the other (`resolveScreen`). */
  pages: ScreenPage[]
  /** Whether a theorem is one of the game's axioms (`axiomTest`). */
  isAxiom?: (name: string) => boolean
  /** What the button says on the last page; on the ones before it says "Next". */
  buttonLabel: string
  /** Called once the screen has faded out. */
  onDone: () => void
}) {
  const [closing, setClosing] = React.useState(false)
  const [pageIndex, setPageIndex] = React.useState(0)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  // Every page's statements are asked for at once, so a later page has its cards too.
  const docs = useTheoremDocs(gameId, pages.flatMap(page => page.unlocks)
    .filter(unlock => unlock.type === 'theorem').map(unlock => unlock.name))
  const current = pages[Math.min(pageIndex, pages.length - 1)]
  const screen = current?.page ?? {}
  const unlocks = current?.unlocks ?? []
  const symbols = screen.symbols ?? []
  const lastPage = pageIndex >= pages.length - 1
  const close = React.useCallback(() => {
    if (lastPage) setClosing(true)
    else setPageIndex(index => index + 1)
  }, [lastPage])
  // The page behind draws again while the screen fades, and that mustn't start the
  // wait over.
  const onDoneRef = React.useRef(onDone)
  onDoneRef.current = onDone
  React.useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => onDoneRef.current(), FADE_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [closing])
  React.useEffect(() => {
    buttonRef.current?.focus()
  }, [pageIndex])
  // With nothing to show but a text, the text is the announcement itself.
  const announcement = unlocks.length === 0 && symbols.length === 0

  return (
    <div
      className={`visual-page level-interstitial-backdrop${closing ? ' closing' : ''}`}
      data-testid="level-interstitial"
      data-kind={kind}
      data-page={pageIndex + 1}
      data-pages={pages.length}
    >
      {/* Keyed by its page: the next page comes up as a window of its own. */}
      <div
        key={pageIndex}
        className={`level-interstitial${announcement ? ' announcement' : ''}`}
        role="dialog"
        aria-label={screen.title || (kind === 'pre' ? 'Before the level' : 'Level finished')}
      >
        {screen.title && <h2 className="level-interstitial-title">{screen.title}</h2>}
        {symbols.length > 0 && (
          <ul className="level-interstitial-items level-interstitial-symbols">
            {symbols.map(symbol => (
              <li key={symbolKey(symbol)} className="level-interstitial-item" data-unlock={symbol.symbol}>
                <SymbolCard symbol={symbol.symbol} name={symbol.name} />
                {symbol.text && <div className="level-interstitial-item-text"><Markdown>{symbol.text}</Markdown></div>}
              </li>
            ))}
          </ul>
        )}
        {unlocks.length > 0 && (
          <ul className="level-interstitial-items">
            {unlocks.map(unlock => (
              <li key={`${unlock.type}:${unlock.name}`} className="level-interstitial-item" data-unlock={unlock.label}>
                <UnlockCard unlock={unlock} doc={docs[unlock.name]} axiom={isAxiom?.(unlock.name) ?? false} />
                {unlock.text && <div className="level-interstitial-item-text"><Markdown>{unlock.text}</Markdown></div>}
              </li>
            ))}
          </ul>
        )}
        {screen.text && <div className="level-interstitial-text"><Markdown>{screen.text}</Markdown></div>}
        <button
          ref={buttonRef}
          type="button"
          className="level-interstitial-continue"
          onClick={close}
          disabled={closing}
        >
          {lastPage ? buttonLabel : 'Next'}
        </button>
      </div>
    </div>
  )
}

/** How the button that leaves a level reads and what it does first, for every header
 * of the level page: with a screen after the level it says "Finish" and shows it. */
export const LevelFinishContext = React.createContext<{
  hasPostLevel: boolean
  /** Leave the level by `go`, after the screen that follows it, if it has one. */
  finish: (go: () => void) => void
}>({ hasPostLevel: false, finish: go => go() })
