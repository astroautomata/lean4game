/** The names `cases` and `induction` give to what they bring in when they split a variable. */
export interface SplitNames {
  /** The number whose successor the variable is in the second case. */
  predecessorName: string
  /** The inductive hypothesis, for `induction`. */
  inductionHypName: string
}

function nextFreshName(existing: Set<string>, baseName: string): string {
  if (!existing.has(baseName)) return baseName
  let suffix = 2
  while (existing.has(`${baseName}${suffix}`)) suffix += 1
  return `${baseName}${suffix}`
}

/**
 * Names for the split of `target`, given the names already in the proof state.
 *
 * As in NNG4 they are `d` and `hd` (then `d2`, `hd2`, …), whatever is split. A game
 * with `VisualNumberedSplits` counts on from the variable's own name instead:
 * splitting `a` gives `a1` with the hypothesis `ha1`, and splitting `a1` gives `a2`.
 * A number already in use is skipped.
 */
export function splitNames(existingNames: Iterable<string>, target: string, numbered: boolean): SplitNames {
  const existing = new Set(existingNames)
  if (!numbered) {
    return {
      predecessorName: nextFreshName(existing, 'd'),
      inductionHypName: nextFreshName(existing, 'hd'),
    }
  }
  const match = /^(.*?)(\d+)$/u.exec(target)
  const base = match?.[1] || target
  let index = match?.[1] ? Number(match[2]) + 1 : 1
  while (existing.has(`${base}${index}`) || existing.has(`h${base}${index}`)) index += 1
  return { predecessorName: `${base}${index}`, inductionHypName: `h${base}${index}` }
}
