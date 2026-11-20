import type { InteractiveGoalWithHints, ProofState } from '../components/infoview/rpc_api'
import type { CanvasState, GoalStream, HypCard } from './types'
import {
  isDerivedTheoremName,
  isHiddenDerivedTheoremName,
} from './theoremNames'
import { sanitizeLeanDisplayName } from './expr-engine'
import { currentVisualInterfaceScale } from './interfaceScale'

/** `VisualTypeColumn`: on a desktop and a phone held sideways the level's variables are
 * listed in a column at the left of the canvas, so the grid of the other cards starts
 * to the right of it and doesn't count them. Set by the proof page for its game. */
let typeColumnLayout = false

export function setTypeColumnLayout(enabled: boolean) {
  typeColumnLayout = enabled
}

/** Whether the variables are in their column just now, rather than on the canvas. */
export function variablesAreListed(): boolean {
  return typeColumnLayout && !isPhonePortraitViewport()
}

/** Where the grid of fresh cards starts, before the interface's scale: past the
 * variables' column (9.5rem, and the gap the collision pass keeps from it) if it is there. */
export function canvasGridStartX(): number {
  return variablesAreListed() ? 200 : 80
}

export function proofStateToCanvas(proof: ProofState | null | undefined): CanvasState {
  const steps = Array.isArray(proof?.steps) ? proof.steps : []
  // Take the last step: current proof state after all tactics
  const lastStep = steps[steps.length - 1]

  // `completed` is the proof runner's authoritative result. Some visual RPC
  // responses retain the previously focused goal in their final step even
  // after the submitted script has closed every metavariable.
  if (proof?.completed) {
    return { streams: [], completed: true }
  }

  const streams = interactiveGoalsToStreams(lastStep?.goals ?? [])

  return {
    streams,
    completed: false,
  }
}

export function interactiveGoalsToStreams(goals: InteractiveGoalWithHints[]): GoalStream[] {
  return goals.map((goalWithHints, streamIndex) => {
    const goal = goalWithHints.goal
    const usedDisplayNames = new Set<string>()

    // Unbundle multi-name hypothesis bundles (e.g. "h1 h2 : Nat" -> two cards)
    let cardIndex = 0
    const listsVariables = variablesAreListed()
    const hyps: HypCard[] = goal.hyps.flatMap((hyp) => {
      const filteredNames = hyp.names
        .map((name, nameIndex) => ({ name, nameIndex }))
        .filter(({ name }) => name !== '[anonymous]')
        .filter(({ name }) => !isHiddenDerivedTheoremName(name))
      const cards = filteredNames.map(({ name, nameIndex }, filteredIndex) => {
        const isTheorem = isDerivedTheoremName(name)
        // A variable in the column takes no place in the grid.
        const listed = listsVariables && !isTheorem && !hyp.isAssumption
        const displayBase = sanitizeLeanDisplayName(name)
        let displayName = displayBase
        if (usedDisplayNames.has(displayName)) {
          let suffix = 2
          while (usedDisplayNames.has(`${displayBase}${suffix}`)) suffix += 1
          displayName = `${displayBase}${suffix}`
        }
        usedDisplayNames.add(displayName)
        return {
          id: hyp.fvarIds?.[nameIndex] ?? crypto.randomUUID(),
          isTheorem,
          hyp: {
            ...hyp,
            names: [displayName],
            ...(displayName !== name ? { playName: name } : {}),
          },
          position: gridPosition(streamIndex, listed ? 0 : listsVariables ? cardIndex + filteredIndex : cardIndex + nameIndex),
        }
      })
      if (!listsVariables || hyp.isAssumption || filteredNames.some(({ name }) => isDerivedTheoremName(name))) {
        cardIndex += filteredNames.length
      }
      return cards
    })

    return {
      id: goal.mvarId ?? crypto.randomUUID(),
      goal,
      hyps,
      equalityTree: goalWithHints.equalityTree,
      existsInfo: goalWithHints.existsInfo,
      reductionForms: goalWithHints.reductionForms ?? goal.reductionForms,
    }
  })
}

/**
 * Scatter layout matching the combining-mode canvas:
 * cards arranged left-to-right in rows of 3, starting from the top-left.
 * Column width and row height are generous to prevent overlap.
 * streamIndex offsets each subgoal's block horizontally.
 */
function isCompactLandscapeViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth > window.innerHeight && window.innerHeight <= 500
}

function isPhonePortraitViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth <= 720 && window.innerHeight >= window.innerWidth
}

function gridPosition(streamIndex: number, cardIndex: number): { x: number; y: number } {
  const compactLandscape = isCompactLandscapeViewport()
  const phonePortrait = isPhonePortraitViewport()
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
  const phoneCols = viewportWidth >= 360 ? 2 : 1
  const phoneGap = 16
  const phoneStartX = 20
  const phoneColW = phoneCols === 1
    ? 0
    : Math.max(156, (viewportWidth - phoneStartX * 2 - phoneGap) / phoneCols)
  const scale = currentVisualInterfaceScale()
  const COL_W = phonePortrait ? phoneColW : compactLandscape ? 180 : 280 * scale
  const ROW_H = phonePortrait ? 96 : compactLandscape ? 92 : 110 * scale
  const columnShift = variablesAreListed()
  const START_X = phonePortrait ? phoneStartX : columnShift ? canvasGridStartX() * scale : compactLandscape ? 28 : 80 * scale
  // On phone portrait, place hyps just below a typical goal card; the
  // collision resolver pushes them further down when the goal stack grows
  // (e.g. a tutorial info callout appears beneath the goal card).
  const START_Y = phonePortrait ? 196 : compactLandscape ? 96 : 130 * scale
  const cols = phonePortrait
    ? phoneCols
    : compactLandscape
      ? (viewportWidth >= 760 && !columnShift ? 3 : 2)
      : 3
  const col = cardIndex % cols
  const row = Math.floor(cardIndex / cols)
  void streamIndex
  return {
    x: col * COL_W + START_X,
    y: row * ROW_H + START_Y,
  }
}
