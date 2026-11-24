/**
 * @fileOverview Hints that stay up while the proof moves on (`VisualPersistentHints`).
 *
 * A view shows the hints whose conditions match the current state. With
 * persistent hints, when none match, it keeps showing the ones that matched most
 * recently on the way to this state: a hint written for the opening position
 * stays up after the first move, until the next hint replaces it. What matched is
 * recorded by proof step, so an undo brings back the hints of the state it returns
 * to, never those of a later state. Hints that may only show while they match
 * (`onlyWhile`) are dropped from the record, and a matching hint with empty text
 * shows nothing but still replaces the hints before it.
 *
 * A view can also say which steps were taken away from it (`retiredAt`): the
 * canvas' hint that sends the player to Rewrite Mode has been followed once a
 * rewrite was made there, so it isn't kept past that step. Nor does it come back
 * later in the proof, should the state happen to meet its conditions again (given
 * `without`): the player did what it asked. An undo to before the step brings it
 * back like any other.
 */
import { useRef } from 'react'

export interface HintRecord<T> {
  step: number
  /** The hints handed in at `step`, to tell a new state from a repeated render. */
  current: T
  /** Those of `current` that show: all but the ones followed earlier. */
  matched: T
  /** What stays up once nothing matches any more. */
  kept: T
}

/** The hints the player has followed before `step`: those that were up when a step was
 * taken in another view and no longer matched in the first state seen after it. */
function followedHints<T>(
  earlier: readonly HintRecord<T>[],
  step: number,
  current: T,
  isEmpty: (hints: T) => boolean,
  retiredAt: readonly number[],
  without: (hints: T, taken: readonly T[]) => T,
): T[] {
  const timeline = [...earlier.map(record => ({ step: record.step, current: record.current })), { step, current }]
  const followed: T[] = []
  earlier.forEach((record, index) => {
    if (isEmpty(record.kept)) return
    const marks = retiredAt.filter(mark => mark > record.step && mark <= step)
    if (marks.length === 0) return
    const mark = Math.min(...marks)
    // Another hint had already taken its place by then.
    const replaced = earlier.slice(index + 1).find(later => !isEmpty(later.matched))
    if (replaced && replaced.step < mark) return
    const after = timeline.slice(index + 1).find(state => state.step >= mark)
    const gone = after ? without(record.kept, [after.current]) : record.kept
    if (!isEmpty(gone)) followed.push(gone)
  })
  return followed
}

export function persistHints<T>(
  records: readonly HintRecord<T>[],
  step: number,
  current: T,
  isEmpty: (hints: T) => boolean,
  keepAfterwards: (hints: T) => T,
  retiredAt: readonly number[] = [],
  without?: (hints: T, taken: readonly T[]) => T,
): { records: HintRecord<T>[]; shown: T } {
  // Records of later steps belong to moves that have been undone.
  const valid = records.filter(record => record.step <= step)
  const earlier = valid.filter(record => record.step < step)
  const seen = valid.find(record => record.step === step && record.current === current)
  let record = seen
  if (!record) {
    const followed = without ? followedHints(earlier, step, current, isEmpty, retiredAt, without) : []
    const matched = without && followed.length > 0 ? without(current, followed) : current
    record = { step, current, matched, kept: keepAfterwards(matched) }
  }
  if (!isEmpty(record.matched)) {
    return { records: seen ? valid : [...earlier, record], shown: record.matched }
  }
  // Nothing matches. This state is remembered beside what matched at this step in
  // another branch of the proof, which stays the most recent hint.
  const others = valid.filter(other => other !== record && !(other.step === step && isEmpty(other.matched)))
  const last = others.filter(other => !isEmpty(other.matched)).at(-1)
  const retired = last !== undefined && retiredAt.some(mark => mark > last.step && mark <= step)
  return { records: [...others, record], shown: last && !retired ? last.kept : record.matched }
}

/** `current` with persistence when `enabled`; see the file overview. Keep
 * `current` referentially stable (memoised) so that the result is too. */
export function usePersistentHints<T>(
  enabled: boolean,
  step: number,
  current: T,
  isEmpty: (hints: T) => boolean,
  keepAfterwards: (hints: T) => T,
  retiredAt: readonly number[] = [],
  without?: (hints: T, taken: readonly T[]) => T,
): T {
  const recordsRef = useRef<HintRecord<T>[]>([])
  if (!enabled) return current
  const { records, shown } = persistHints(recordsRef.current, step, current, isEmpty, keepAfterwards, retiredAt, without)
  recordsRef.current = records
  return shown
}

/** Drop hints with empty text, which only clear what was there before. */
export function withText<T extends { text: string }>(infos: readonly T[]): T[] {
  return infos.filter(info => info.text.trim().length > 0)
}
