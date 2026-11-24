import test from 'node:test'
import assert from 'node:assert/strict'

const { persistHints } = await import('../../tmp-path-map-tests/visual/hintPersistence.js')

const isEmpty = hints => hints.length === 0
const keep = hints => hints.filter(hint => !hint.onlyWhile)

/** Play the matched hints of each step in turn; return what is shown at each.
 * `retiredAt` are the steps taken in another view. */
const without = (hints, taken) => hints.filter(hint => !taken.some(set => set.includes(hint)))

function play(steps, retiredAt = [], forget = undefined) {
  let records = []
  return steps.map(([step, matched]) => {
    const result = persistHints(records, step, matched, isEmpty, keep, retiredAt.filter(mark => mark <= step), forget)
    records = result.records
    return result.shown.map(hint => hint.text)
  })
}

const first = { text: 'first' }
const second = { text: 'second' }
const onlyWhile = { text: 'only while', onlyWhile: true }

test('a hint stays up after the step it was written for, until the next one', () => {
  assert.deepEqual(play([[0, [first]], [1, []], [2, []], [3, [second]], [4, []]]),
    [['first'], ['first'], ['first'], ['second'], ['second']])
})

test('undo brings back the hint of the state it returns to', () => {
  // Rewrite 0: the opening hint, no hint after one rewrite, the check-mark hint
  // after two. Undoing the second rewrite must not keep the check-mark hint.
  assert.deepEqual(play([[0, [first]], [1, []], [2, [second]], [1, []], [0, [first]]]),
    [['first'], ['first'], ['second'], ['first'], ['first']])
})

test('a different move after an undo forgets the undone hints', () => {
  assert.deepEqual(play([[0, [first]], [1, [second]], [0, [first]], [1, []]]),
    [['first'], ['second'], ['first'], ['first']])
})

test('a hint that only shows while it matches leaves, and does not bring back older ones', () => {
  assert.deepEqual(play([[0, [first]], [1, [onlyWhile]], [2, []]]),
    [['first'], ['only while'], []])
})

test('a hint is not kept past a step taken in another view', () => {
  // The canvas says to open Rewrite Mode; steps 1 and 2 are rewrites made there.
  assert.deepEqual(play([[0, [first]], [2, []], [3, []]], [1, 2]), [['first'], [], []])
  // A hint that matches afterwards shows, and stays up as usual.
  assert.deepEqual(play([[0, [first]], [2, [second]], [3, []]], [1, 2]), [['first'], ['second'], ['second']])
})

test('undoing the step taken in another view brings the hint back', () => {
  assert.deepEqual(play([[0, [first]], [1, []], [0, [first]], [1, []]], [1]).slice(0, 3),
    [['first'], [], ['first']])
  // A move made here instead of there keeps the hint.
  assert.deepEqual(play([[0, [first]], [1, []]]), [['first'], ['first']])
})

test('a hint the player followed in another view does not come back later', () => {
  // The Third Mode?: the hint asks for `reflection` to be specialized (step 1, in the
  // specialization view). Its conditions hold again once that proposition has been
  // used up (step 2) and when the level is finished (step 3).
  assert.deepEqual(play([[0, [first]], [1, []], [2, [first]], [3, [first]]], [1], without),
    [['first'], [], [], []])
  // Another hint that matches then shows as usual, alone.
  assert.deepEqual(play([[0, [first]], [1, []], [2, [first, second]], [3, []]], [1], without),
    [['first'], [], ['second'], ['second']])
  // Undoing the step brings the hint back, and a move made here keeps it.
  assert.deepEqual(play([[0, [first]], [1, []], [2, [first]], [0, [first]]], [1], without),
    [['first'], [], [], ['first']])
  assert.deepEqual(play([[0, [first]], [1, []], [2, [first]]], [], without), [['first'], ['first'], ['first']])
})

test('a hint that still matches after a step in another view was not followed', () => {
  // A hint for the whole level matches before and after a rewrite in Rewrite Mode.
  assert.deepEqual(play([[0, [first]], [1, [first]], [2, [first]]], [1], without),
    [['first'], ['first'], ['first']])
  // The one beside it that the rewrite answered goes, and stays gone.
  assert.deepEqual(play([[0, [first, second]], [1, [first]], [2, [first, second]]], [1], without),
    [['first', 'second'], ['first'], ['first']])
})

test('nothing matching in one branch keeps what matched at the same step in another', () => {
  const none = []
  assert.deepEqual(play([[0, [first]], [1, [second]], [1, none], [1, none], [2, []]]),
    [['first'], ['second'], ['second'], ['second'], ['second']])
})
