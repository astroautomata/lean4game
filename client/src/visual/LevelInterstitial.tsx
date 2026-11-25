/**
 * The screens 'between' levels (experimental): before a level, what it is about or what
 * it brings; after it, what the player has earned. The level stays in view behind,
 * dimmed, and a button moves on.
 */
import * as React from 'react'
import { Markdown } from '../components/markdown'
import { getDataBaseUrl } from '../utils/url'
import { inferAtomicReductionForms } from './existsDisplay'
import { buildPropositionTheoremDisplay } from './quantifiedStatement'
import { PropositionTheoremPreviewCard } from './PropositionTheoremCard'
import { VisualTacticPreviewCard } from './VisualTacticCard'
import { itemNames, type InterstitialScreen, type InventoryTileSummary } from './compendiumData'

/** The time the screen takes to fade out before it is gone, as in `visual.css`. */
const FADE_OUT_MS = 180

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
    void request.then(doc => { if (!doc) theoremDocs.delete(key) })
    theoremDocs.set(key, request)
  }
  return request
}

export function useTheoremDocs(gameId: string, names: readonly string[]): Record<string, TheoremDoc> {
  const [docs, setDocs] = React.useState<Record<string, TheoremDoc>>({})
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

/** The theorems and tactics a screen names, found in the level's own lists. A name the
 * level doesn't know is left out: there is no card to show for it. */
export function resolveUnlocks(
  screen: InterstitialScreen | null | undefined,
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

/** A theorem or a tactic as the card the player knows it by. A theorem's statement
 * comes from the game's documentation, so the card is its name alone for a moment. */
export function UnlockCard({ unlock, doc }: { unlock: Unlock; doc?: TheoremDoc }) {
  if (unlock.type === 'tactic') {
    return <VisualTacticPreviewCard tactic={{ id: unlock.name, name: unlock.name, label: unlock.label }} />
  }
  const display = doc?.statement ? buildPropositionTheoremDisplay(doc.statement) : null
  return (
    <PropositionTheoremPreviewCard theorem={{
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

export function LevelInterstitial({ gameId, kind, screen, unlocks, buttonLabel, onDone }: {
  gameId: string
  /** Before the level, or after it. */
  kind: 'pre' | 'post'
  screen: InterstitialScreen
  unlocks: Unlock[]
  buttonLabel: string
  /** Called once the screen has faded out. */
  onDone: () => void
}) {
  const [closing, setClosing] = React.useState(false)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const docs = useTheoremDocs(gameId, unlocks.filter(unlock => unlock.type === 'theorem').map(unlock => unlock.name))
  const close = React.useCallback(() => setClosing(true), [])
  React.useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(onDone, FADE_OUT_MS)
    return () => window.clearTimeout(timer)
  }, [closing, onDone])
  React.useEffect(() => {
    buttonRef.current?.focus()
  }, [])
  // With nothing to show but a text, the text is the announcement itself.
  const announcement = unlocks.length === 0

  return (
    <div
      className={`visual-page level-interstitial-backdrop${closing ? ' closing' : ''}`}
      data-testid="level-interstitial"
      data-kind={kind}
    >
      <div
        className={`level-interstitial${announcement ? ' announcement' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={screen.title || (kind === 'pre' ? 'Before the level' : 'Level finished')}
      >
        {screen.title && <h2 className="level-interstitial-title">{screen.title}</h2>}
        {unlocks.length > 0 && (
          <ul className="level-interstitial-items">
            {unlocks.map(unlock => (
              <li key={`${unlock.type}:${unlock.name}`} className="level-interstitial-item" data-unlock={unlock.label}>
                <UnlockCard unlock={unlock} doc={docs[unlock.name]} />
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
          {buttonLabel}
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
