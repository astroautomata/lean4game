import test from 'node:test'
import assert from 'node:assert/strict'

const { buildCompendium, isEntryUnlocked, itemNames, worldOrder } =
  await import('../../tmp-path-map-tests/visual/compendiumData.js')

// A small game: one world hands out two axioms and proves a theorem with them, the
// next brings a tactic and proves two theorems, the second of them at the end of the
// path, where no later level lists it.
const tile = (name, world, level, extra = {}) => ({ name, displayName: name.split('.').at(-1), world, level, ...extra })
const lemmas = unlockedBy => [
  tile('N.add_zero', unlockedBy >= 1 ? 'Successor' : null, unlockedBy >= 1 ? 1 : null, { category: '+' }),
  tile('N.add_succ', unlockedBy >= 1 ? 'Successor' : null, unlockedBy >= 1 ? 1 : null, { category: '+' }),
  tile('N.add_one', unlockedBy >= 2 ? 'Successor' : null, unlockedBy >= 2 ? 1 : null, { category: '+' }),
  tile('N.zero_add', unlockedBy >= 3 ? 'Induction' : null, unlockedBy >= 3 ? 1 : null, { category: '+' }),
  tile('N.succ_add', null, null, { category: '+' }),
]
const tactics = unlockedBy => [
  tile('rw', 'Successor', 1),
  tile('trivial', 'Successor', 1, { hidden: true }),
  tile('induction', unlockedBy >= 2 ? 'Induction' : null, unlockedBy >= 2 ? 1 : null),
]
const levels = {
  'Successor:1': {
    label: '0', statementName: 'N.add_one', lemmas: lemmas(1), tactics: tactics(1),
    screens: [
      { title: 'Axioms Unlocked!', items: [{ name: 'add_zero', text: 'Eliminate added zeroes.' }, { name: 'add_succ' }] },
      { title: 'Theorem Unlocked!', items: [{ name: 'add_one', text: 'Quickly collapse added ones.' }] },
    ],
  },
  'Induction:1': {
    label: 'A0', statementName: 'N.zero_add', lemmas: lemmas(2), tactics: tactics(2),
    screens: [{ title: 'Tactic Unlocked!', items: [{ name: 'induction', text: '' }] }],
  },
  'Induction:2': { statementName: 'N.succ_add', lemmas: lemmas(3), tactics: tactics(3), screens: [] },
}
const game = {
  levels,
  worldSize: { Induction: 2, Successor: 1 },
  order: worldOrder(['Induction', 'Successor'], [['Successor', 'Induction']]),
  isTactic: name => name === 'induction',
}

test('worlds are ordered along the paths, and by name where no path says', () => {
  assert.deepEqual(worldOrder(['C', 'B', 'A'], [['C', 'A']]), ['B', 'C', 'A'])
  assert.deepEqual(worldOrder(['B', 'A'], []), ['A', 'B'])
  // A game whose worlds wait for each other still lists them all.
  assert.deepEqual(worldOrder(['A', 'B'], [['A', 'B'], ['B', 'A']]).sort(), ['A', 'B'])
})

test('a screen names a theorem by its card, its full name or the end of it', () => {
  assert.ok(itemNames('add_zero', 'MyNat.add_zero', 'add_zero'))
  assert.ok(itemNames('MyNat.add_zero', 'MyNat.add_zero'))
  assert.ok(itemNames('add_zero', 'MyNat.add_zero'))
  assert.equal(itemNames('zero', 'MyNat.add_zero', 'add_zero'), false)
})

test('every theorem and tactic is listed once, with the level it comes from', () => {
  const entries = buildCompendium(game)
  assert.deepEqual(entries.map(entry => `${entry.type} ${entry.label} ${entry.world} ${entry.level} ${entry.levelLabel} ${entry.proved}`), [
    'theorem add_one Successor 1 0 true',
    'theorem add_succ Successor 1 0 false',
    'theorem add_zero Successor 1 0 false',
    'tactic induction Induction 1 A0 false',
    'theorem zero_add Induction 1 A0 true',
    // Proved in the last level, which nothing follows; the level has no label of its own.
    'theorem succ_add Induction 2 2 true',
  ])
  // A hidden tactic, and one the player never sees as a tactic, are not in it.
  assert.equal(entries.some(entry => entry.name === 'trivial' || entry.name === 'rw'), false)
})

test('what the screens say about a theorem is its description', () => {
  const byLabel = Object.fromEntries(buildCompendium(game).map(entry => [entry.label, entry]))
  assert.equal(byLabel.add_zero.description, 'Eliminate added zeroes.')
  assert.equal(byLabel.add_one.description, 'Quickly collapse added ones.')
  assert.equal(byLabel.add_succ.description, undefined)
  assert.equal(byLabel.induction.description, undefined)
})

test('a proved theorem is the player\'s once its level is done; the rest once the level can be played', () => {
  const byLabel = Object.fromEntries(buildCompendium(game).map(entry => [entry.label, entry]))
  const done = new Set()
  const open = new Set(['Successor:1'])
  const has = entry => isEntryUnlocked(entry, (world, level) => done.has(`${world}:${level}`), (world, level) => open.has(`${world}:${level}`))
  assert.equal(has(byLabel.add_zero), true)
  assert.equal(has(byLabel.add_one), false)
  assert.equal(has(byLabel.induction), false)
  done.add('Successor:1')
  open.add('Induction:1')
  assert.equal(has(byLabel.add_one), true)
  assert.equal(has(byLabel.induction), true)
  assert.equal(has(byLabel.zero_add), false)
})
