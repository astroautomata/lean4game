import test from 'node:test'
import assert from 'node:assert/strict'

const { axiomTest, bossAnnouncement, buildCollection, isEntryUnlocked, itemNames, screenPages, tabOrder, worldOrder } =
  await import('../../tmp-path-map-tests/visual/collectionData.js')

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
  const entries = buildCollection(game)
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
  const byLabel = Object.fromEntries(buildCollection(game).map(entry => [entry.label, entry]))
  assert.equal(byLabel.add_zero.description, 'Eliminate added zeroes.')
  assert.equal(byLabel.add_one.description, 'Quickly collapse added ones.')
  assert.equal(byLabel.add_succ.description, undefined)
  assert.equal(byLabel.induction.description, undefined)
})

test('a text under all of a screen describes each of them, where none has its own', () => {
  const shared = { ...game, levels: { ...levels, 'Induction:2': { ...levels['Induction:2'], screens: [
    { title: 'Equalities Unlocked!', items: [{ name: 'succ_add', text: '' }, { name: 'add_succ' }], text: 'Move successors about.' },
    // Here one of them has a text, so the text under all is about the screen.
    { title: 'Tactic Unlocked!', items: [{ name: 'induction' }, { name: 'zero_add', text: 'Its own.' }], text: 'Well done!' },
  ] } } }
  const byLabel = Object.fromEntries(buildCollection(shared).map(entry => [entry.label, entry]))
  assert.equal(byLabel.succ_add.description, 'Move successors about.')
  assert.equal(byLabel.add_succ.description, 'Move successors about.')
  assert.equal(byLabel.zero_add.description, 'Its own.')
  assert.equal(byLabel.induction.description, undefined)
  // What an earlier screen said about one of them stays.
  assert.equal(byLabel.add_zero.description, 'Eliminate added zeroes.')
})

test('a theorem the screen after a level hands out comes from that level', () => {
  // `add_right` is proved in level 1, whose screen also shows its mirror image, which
  // the game's data lists from level 2 on.
  const list = [tile('N.add_right', 'A', 1), tile('N.add_left', 'A', 2), tile('N.other', 'A', 2)]
  const post = { title: 'Propositions Unlocked!', items: [{ name: 'add_right' }, { name: 'add_left' }], text: 'Cancel.' }
  const entries = buildCollection({
    levels: {
      'A:1': { label: '4', statementName: 'N.add_right', lemmas: list, tactics: [], screens: [post], postScreen: post },
      'A:2': { label: '5', statementName: 'N.next', lemmas: list, tactics: [], screens: [] },
    },
    worldSize: { A: 2 }, order: ['A'], isTactic: () => false,
  })
  assert.deepEqual(entries.map(entry => `${entry.label} ${entry.level} ${entry.levelLabel} ${entry.proved} ${Boolean(entry.afterLevel)}`), [
    'add_right 1 4 true false',
    'add_left 1 4 false true',
    'other 2 5 false false',
  ])
  // It is the player's when the level is finished, not when it can be played.
  const [, left] = entries
  assert.equal(isEntryUnlocked(left, () => false, () => true), false)
  assert.equal(isEntryUnlocked(left, () => true, () => true), true)
})

test('the tabs are in the order of the list each level gives its theorems in', () => {
  const listed = names => ({ lemmas: names.map(([name, category]) => tile(name, null, null, { category })), tactics: [], screens: [] })
  assert.deepEqual(tabOrder({
    'A:1': listed([['N.add_zero', '+'], ['N.mul_one', '*'], ['N.add_one', '+'], ['N.succ_inj', 'Peano']]),
    'A:2': listed([['N.le_refl', '≤']]),
  }), ['+', '*', 'Peano'])
  assert.deepEqual(tabOrder({}), [])
  assert.deepEqual(tabOrder(levels), ['+'])
})

test('a boss level is announced by its title', () => {
  // The title says what kind of boss it is.
  assert.deepEqual(bossAnnouncement('Plug and Chug (Successor World Boss)', 'Successor World', true),
    { title: 'Successor World Boss', text: 'Plug and Chug' })
  assert.deepEqual(bossAnnouncement('On The Count of Three (Rewriting World Boss)', 'Rewrite World', true),
    { title: 'Rewriting World Boss', text: 'On The Count of Three' })
  // A bare kind is the world's.
  assert.deepEqual(bossAnnouncement('`mul_assoc` (Miniboss)', 'Multiplication and Exponentiation World', false),
    { title: 'Multiplication and Exponentiation World Miniboss', text: '`mul_assoc`' })
  // Without brackets: the world's boss if it is the last level there, a miniboss if not.
  assert.deepEqual(bossAnnouncement("Refute Fermat's Last Theorem?", 'Multiplication and Exponentiation World Bonus', true),
    { title: 'Multiplication and Exponentiation World Bonus Boss', text: "Refute Fermat's Last Theorem?" })
  assert.deepEqual(bossAnnouncement('`le_mul_right`', 'Advanced Multiplication World', false),
    { title: 'Advanced Multiplication World Miniboss', text: '`le_mul_right`' })
  // Other brackets are part of the name.
  assert.deepEqual(bossAnnouncement('Implications (0)', 'Proposition World', false),
    { title: 'Proposition World Miniboss', text: 'Implications (0)' })
})

test('an axiom is named in full or by the end of its name', () => {
  const isAxiom = axiomTest(['MyNat.add_zero', 'succ_inj'])
  assert.equal(isAxiom('MyNat.add_zero'), true)
  assert.equal(isAxiom('add_zero'), true)
  assert.equal(isAxiom('MyNat.succ_inj'), true)
  assert.equal(isAxiom('MyNat.zero_add'), false)
  assert.equal(axiomTest(undefined)('MyNat.add_zero'), false)
})

test('a proved theorem is the player\'s once its level is done; the rest once the level can be played', () => {
  const byLabel = Object.fromEntries(buildCollection(game).map(entry => [entry.label, entry]))
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

test('a screen has its first page and the ones that follow it', () => {
  assert.deepEqual(screenPages(null), [])
  assert.deepEqual(screenPages({ title: 'One', items: [{ name: 'a' }] }), [{ title: 'One', items: [{ name: 'a' }] }])
  assert.deepEqual(
    screenPages({ title: 'Symbols Unlocked!', symbols: [{ symbol: '*' }], more: [{ title: 'Axioms', items: [{ name: 'mul_zero' }] }] }),
    [{ title: 'Symbols Unlocked!', symbols: [{ symbol: '*' }] }, { title: 'Axioms', items: [{ name: 'mul_zero' }] }],
  )
})

test('what a later page of a screen says is read like the first page', () => {
  const paged = { ...game, levels: { ...levels, 'Induction:2': { ...levels['Induction:2'], screens: [{
    title: 'Symbol Unlocked!', symbols: [{ symbol: '*', name: 'Multiplication', text: 'A star.' }],
    more: [{ title: 'Equalities Unlocked!', items: [{ name: 'succ_add', text: 'On the second page.' }] }],
  }] } } }
  const byLabel = Object.fromEntries(buildCollection(paged).map(entry => [entry.label, entry]))
  assert.equal(byLabel.succ_add.description, 'On the second page.')
  assert.equal(byLabel['*'].description, 'A star.')
})

test('a symbol is listed once, from the first level whose screen shows it', () => {
  const pre = { title: 'Symbols Unlocked!', symbols: [
    { symbol: '0', name: 'Zero', text: 'The first natural number.' },
    { symbol: 'False', name: '' },
  ] }
  const post = { title: 'Symbol Unlocked!', symbols: [{ symbol: '>', name: 'Greater Than' }, { symbol: '0', name: 'Again' }] }
  const entries = buildCollection({
    levels: {
      'A:1': { label: '0', lemmas: [], tactics: [], screens: [pre] },
      'A:2': { label: '1', lemmas: [], tactics: [], screens: [post], postScreen: post },
    },
    worldSize: { A: 2 }, order: ['A'], isTactic: () => false,
  })
  assert.deepEqual(entries.map(entry => `${entry.type} ${entry.label} ${entry.symbolName} ${entry.level} ${entry.levelLabel} ${Boolean(entry.afterLevel)}`), [
    'symbol 0 Zero 1 0 false',
    'symbol False undefined 1 0 false',
    'symbol > Greater Than 2 1 true',
  ])
  assert.equal(entries[0].description, 'The first natural number.')
  // One from the screen before a level is the player's once the level can be played;
  // one from the screen after it, once the level is finished.
  assert.equal(isEntryUnlocked(entries[0], () => false, () => true), true)
  assert.equal(isEntryUnlocked(entries[2], () => false, () => true), false)
  assert.equal(isEntryUnlocked(entries[2], () => true, () => true), true)
})

test('a symbol does not take the text of a theorem with its name', () => {
  // `≤` the symbol, and a theorem whose card says `le`: each keeps what was said of it.
  const screen = { title: 'Unlocked!', symbols: [{ symbol: 'le', name: 'A symbol', text: 'About the symbol.' }],
    items: [{ name: 'le', text: 'About the theorem.' }] }
  const entries = buildCollection({
    levels: { 'A:1': { label: '0', lemmas: [tile('N.le', 'A', 1)], tactics: [], screens: [screen] } },
    worldSize: { A: 1 }, order: ['A'], isTactic: () => false,
  })
  assert.deepEqual(entries.map(entry => `${entry.type} ${entry.description}`).sort(),
    ['symbol About the symbol.', 'theorem About the theorem.'])
})
