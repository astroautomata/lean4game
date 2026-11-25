import test from 'node:test'
import assert from 'node:assert/strict'

const { computePathMapLayout, pathMapLabelLines, roundedPathData, PATH_MAP_COLUMN_WIDTH, PATH_MAP_CORNER_RADIUS, PATH_MAP_ROW_HEIGHT } =
  await import('../../tmp-path-map-tests/visual/pathMapLayout.js')

// An earlier map of the Natural Numbers Video Game: a welcome text level, then Rewrite
// World on the left (with a bonus off its third level) and Proposition World on the
// right. Rewrite World leads to Induction World. Proposition World forks: its left
// branch joins the middle of Induction World, and its right branch carries on with a
// bonus. A bonus also leaves the end of Induction World's first part, right where
// Proposition World's branch joins.
const nnvg = {
  worlds: {
    Intro: { title: 'Welcome', shared: true, column: 0 },
    Rewrite: { title: 'Rewrite World', color: 'amber', column: -1 },
    RewriteBonus: { title: 'Rewrite World Bonus', bonusOf: { world: 'Rewrite', level: 3 } },
    Proposition: { title: 'Proposition World', color: 'sky', column: 1 },
    PropositionRight: { title: 'Proposition World', continues: 'Proposition', column: 2 },
    PropositionBonus: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 2 } },
    PropositionBonusB: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 7 } },
    Induction: { title: 'Induction World', color: 'green', column: 0 },
    InductionJoined: { title: 'Induction World', continues: 'Induction', column: 0 },
    InductionBonus: { title: 'Induction World Bonus', bonusOf: { world: 'Induction', level: 3 } },
  },
  edges: [
    ['Rewrite', 'RewriteBonus'],
    ['PropositionRight', 'PropositionBonus'],
    ['PropositionRight', 'PropositionBonusB'],
    ['Induction', 'InductionBonus'],
    ['Intro', 'Proposition'],
    ['Intro', 'Rewrite'],
    ['Rewrite', 'Induction'],
    ['Induction', 'InductionJoined'],
    ['Proposition', 'InductionJoined'],
    ['Proposition', 'PropositionRight'],
  ],
  worldSize: {
    Intro: 1,
    Rewrite: 6,
    RewriteBonus: 2,
    Proposition: 7,
    PropositionRight: 7,
    PropositionBonus: 1,
    PropositionBonusB: 3,
    Induction: 3,
    InductionJoined: 1,
    InductionBonus: 1,
  },
}

const node = (layout, world, level) => layout.nodes.find(n => n.world === world && n.level === level)
const segment = (layout, key) => layout.segments.find(s => s.key === key)

test('worlds are columns of their levels, split after the shared opening', () => {
  const layout = computePathMapLayout(nnvg)
  const intro = node(layout, 'Intro', 1)
  assert.equal(intro.x, 0)
  assert.equal(intro.color, 'grey')
  for (let level = 1; level <= 6; level += 1) {
    assert.equal(node(layout, 'Rewrite', level).x, -PATH_MAP_COLUMN_WIDTH)
    assert.equal(node(layout, 'Proposition', level).x, PATH_MAP_COLUMN_WIDTH)
  }
  // Both worlds start on the same row, below the opening.
  assert.equal(node(layout, 'Rewrite', 1).y, node(layout, 'Proposition', 1).y)
  assert.ok(node(layout, 'Rewrite', 1).y > intro.y)
  // Levels go down the column.
  assert.ok(node(layout, 'Rewrite', 2).y > node(layout, 'Rewrite', 1).y)
})

test('a bonus is a row of levels sprouting from its anchor, beside the next level of the path', () => {
  const layout = computePathMapLayout(nnvg)
  const anchor = node(layout, 'Rewrite', 3)
  const next = node(layout, 'Rewrite', 4)
  const first = node(layout, 'RewriteBonus', 1)
  const second = node(layout, 'RewriteBonus', 2)
  // Outward from a left column, one row below the anchor, where the path's next
  // level is listed too.
  assert.ok(first.x < anchor.x)
  assert.ok(second.x < first.x)
  assert.equal(second.y, first.y)
  assert.equal(first.y, anchor.y + PATH_MAP_ROW_HEIGHT)
  assert.equal(next.y, first.y)
  assert.equal(first.color, 'amber')
  const branch = segment(layout, 'bonus:Rewrite:3:RewriteBonus')
  assert.deepEqual(branch.source, { world: 'Rewrite', level: 3 })
  assert.deepEqual(branch.points.at(-1), { x: first.x, y: first.y })
  // It leaves the anchor sideways and runs down a stem, clear of the next level.
  const stemX = branch.points[1].x
  assert.deepEqual(branch.points.slice(0, 3), [
    { x: anchor.x, y: anchor.y }, { x: stemX, y: anchor.y }, { x: stemX, y: first.y },
  ])
  assert.ok(anchor.x - stemX > 31 + 8, 'the stem is clear of the next level, even a boss')
  assert.ok(stemX - first.x > 22 + PATH_MAP_CORNER_RADIUS, 'the branch has room to turn off the stem')
  // The bonus's own levels are joined along the row.
  assert.deepEqual(segment(layout, 'level:RewriteBonus:1').points, [
    { x: first.x, y: first.y },
    { x: second.x, y: second.y },
  ])
  // The edge MakeGame adds from Rewrite to its bonus is not drawn as a world edge.
  assert.equal(layout.segments.some(s => s.key.startsWith('edge:Rewrite:RewriteBonus')), false)
})

test('bonuses go outwards on the right, and to the left from the centre', () => {
  const layout = computePathMapLayout(nnvg)
  assert.ok(node(layout, 'PropositionBonus', 1).x > node(layout, 'PropositionRight', 1).x)
  assert.ok(node(layout, 'InductionBonus', 1).x < node(layout, 'Induction', 3).x)
})

test('a bonus off the last level of a chain is a row below it', () => {
  const layout = computePathMapLayout(nnvg)
  const boss = node(layout, 'PropositionRight', 7)
  const levels = [1, 2, 3].map(level => node(layout, 'PropositionBonusB', level))
  assert.ok(levels.every(level => level.y > boss.y && level.y === levels[0].y))
  assert.ok(levels[0].x > boss.x && levels[1].x > levels[0].x && levels[2].x > levels[1].x)
  assert.ok(segment(layout, 'bonus:PropositionRight:7:PropositionBonusB'))
  assert.ok(layout.bounds.y2 >= levels[0].y)
})

test('the map is centred on its first level, however lopsided it gets below', () => {
  const layout = computePathMapLayout(nnvg)
  const intro = node(layout, 'Intro', 1)
  assert.equal(layout.bounds.x1 + layout.bounds.x2, 2 * intro.x)
  // Everything still fits: the row off the far-right boss sets the width.
  for (const n of layout.nodes) {
    assert.ok(n.x >= layout.bounds.x1 && n.x <= layout.bounds.x2)
  }
  assert.ok(node(layout, 'PropositionBonusB', 3).x + 22 === layout.bounds.x2)
})

test('world titles have room above the path below them', () => {
  const layout = computePathMapLayout(nnvg)
  for (const label of layout.labels) {
    const source = label.world === 'Induction' ? 'Rewrite' : 'Intro'
    const turnY = segment(layout, `edge:${source}:${label.world}:in`).points[1].y
    // The title's middle, less half of its text, clears the top of the path by 22.
    assert.equal(turnY - 8 - (label.y + 8), 22)
  }
})

test('a split leaves in the shared grey and turns in each world colour', () => {
  const layout = computePathMapLayout(nnvg)
  const out = segment(layout, 'edge:Intro:Rewrite:out')
  const into = segment(layout, 'edge:Intro:Rewrite:in')
  assert.equal(out.color, 'grey')
  assert.equal(into.color, 'amber')
  assert.deepEqual(into.source, { world: 'Intro', level: 1 })
  // The colours change where the curve starts, one corner radius above the turn.
  assert.deepEqual(out.points.at(-1), into.points[0])
  assert.equal(into.points[1].y - into.points[0].y, PATH_MAP_CORNER_RADIUS)
  assert.equal(into.points.length, 4)
})

test('a fork leaves its stem at one point, however far down its targets are', () => {
  const layout = computePathMapLayout(nnvg)
  const left = segment(layout, 'edge:Proposition:InductionJoined:in')
  const right = segment(layout, 'edge:Proposition:PropositionRight:in')
  assert.deepEqual(left.points[0], right.points[0])
  assert.equal(left.points[1].y, right.points[1].y)
  assert.equal(node(layout, 'PropositionRight', 1).y, node(layout, 'InductionJoined', 1).y)
  // The stem runs from Proposition World's last level straight down to the fork.
  const stem = segment(layout, 'edge:Proposition:PropositionRight:out')
  assert.equal(stem.points[0].x, stem.points[1].x)
  assert.ok(stem.points[1].y > node(layout, 'Induction', 3).y)
})

test('a world joined by two paths waits below both of them', () => {
  const layout = computePathMapLayout(nnvg)
  const joined = node(layout, 'InductionJoined', 1)
  assert.equal(joined.x, node(layout, 'Induction', 3).x)
  assert.ok(joined.y > node(layout, 'Induction', 3).y)
  assert.ok(joined.y > node(layout, 'Proposition', 7).y)
  // Room is left for the bonus off Induction World's last level.
  assert.ok(joined.y > node(layout, 'InductionBonus', 1).y)
  assert.ok(segment(layout, 'edge:Induction:InductionJoined:in'))
  assert.equal(segment(layout, 'edge:Proposition:InductionJoined:in').color, 'green')
})

test('a continuation takes the colour of the world it carries on', () => {
  const layout = computePathMapLayout(nnvg)
  assert.equal(node(layout, 'PropositionRight', 1).color, 'sky')
  assert.equal(node(layout, 'InductionJoined', 1).color, 'green')
  assert.equal(node(layout, 'PropositionBonus', 1).color, 'sky')
  assert.equal(node(layout, 'PropositionBonusB', 1).color, 'sky')
})

test('named worlds are labelled above their streams; the others are not labelled', () => {
  const layout = computePathMapLayout(nnvg)
  const byWorld = Object.fromEntries(layout.labels.map(label => [label.world, label]))
  assert.deepEqual(Object.keys(byWorld).sort(), ['Induction', 'Proposition', 'Rewrite'])
  assert.equal(byWorld.Rewrite.text, 'Rewrite World')
  for (const world of ['Rewrite', 'Proposition', 'Induction']) {
    assert.equal(byWorld[world].x, node(layout, world, 1).x)
    assert.ok(byWorld[world].y < segment(layout, `edge:${world === 'Induction' ? 'Rewrite' : 'Intro'}:${world}:in`).points[1].y)
  }
})

test('without columns, worlds split off one world spread around it', () => {
  const layout = computePathMapLayout({
    worlds: { A: { title: 'A' }, B: { title: 'B' }, C: { title: 'C' }, D: { title: 'D' } },
    edges: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D']],
    worldSize: { A: 1, B: 2, C: 1, D: 1 },
  })
  assert.equal(node(layout, 'A', 1).x, 0)
  assert.equal(node(layout, 'B', 1).x, -PATH_MAP_COLUMN_WIDTH)
  assert.equal(node(layout, 'C', 1).x, PATH_MAP_COLUMN_WIDTH)
  // A merge sits between its sources, below the longer one.
  assert.equal(node(layout, 'D', 1).x, 0)
  assert.ok(node(layout, 'D', 1).y > node(layout, 'B', 2).y)
  // Worlds without a colour get distinct palette colours.
  assert.notEqual(node(layout, 'B', 1).color, node(layout, 'C', 1).color)
})

test('with a default colour, worlds that name none all take it, and their bonuses too', () => {
  const layout = computePathMapLayout({
    worlds: {
      A: { title: 'A', color: 'lantern' },
      B: { title: 'B' },
      C: { title: 'C' },
      Bonus: { title: 'Bonus', bonusOf: { world: 'B', level: 1 } },
    },
    edges: [['A', 'B'], ['A', 'C'], ['B', 'Bonus']],
    worldSize: { A: 1, B: 2, C: 1, Bonus: 1 },
  }, { defaultColor: 'grey' })
  assert.equal(node(layout, 'A', 1).color, 'lantern')
  assert.equal(node(layout, 'B', 1).color, 'grey')
  assert.equal(node(layout, 'C', 1).color, 'grey')
  assert.equal(node(layout, 'Bonus', 1).color, 'grey')
})

test('skipped levels and empty worlds take no place on the map', () => {
  const layout = computePathMapLayout({
    worlds: { A: { title: 'A' }, Hidden: { title: 'Hidden' } },
    edges: [['A', 'Hidden']],
    worldSize: { A: 3, Hidden: 1 },
    skippedLevels: { A: [2], Hidden: [1] },
  })
  assert.deepEqual(layout.nodes.map(n => `${n.world}:${n.level}:${n.index}`), ['A:1:1', 'A:3:2'])
  assert.equal(layout.segments.length, 1)
})

test('corners of a path are rounded', () => {
  const data = roundedPathData([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }], 20)
  assert.equal(data, 'M 0 0 L 0 30 Q 0 50 20 50 L 100 50')
})

test('an end leg gives its whole length to its corner; a shared leg splits between two', () => {
  const wide = roundedPathData([{ x: 0, y: 0 }, { x: 0, y: 26 }, { x: 100, y: 26 }, { x: 100, y: 100 }], 26)
  assert.equal(wide, 'M 0 0 L 0 0 Q 0 26 26 26 L 74 26 Q 100 26 100 52 L 100 100')
  const narrow = roundedPathData([{ x: 0, y: 0 }, { x: 0, y: 26 }, { x: 40, y: 26 }, { x: 40, y: 100 }], 26)
  assert.equal(narrow, 'M 0 0 L 0 6 Q 0 26 20 26 L 20 26 Q 40 26 40 46 L 40 100')
})

test('phones can use narrower columns', () => {
  const layout = computePathMapLayout(nnvg, { columnWidth: 100 })
  assert.equal(node(layout, 'Rewrite', 1).x, -100)
  const rewrite = layout.labels.find(label => label.world === 'Rewrite')
  assert.equal(rewrite.x, -100)
  assert.ok(rewrite.y < node(layout, 'Rewrite', 1).y)
})

test('a path joining from the side turns in below a bonus leaving the level above', () => {
  const layout = computePathMapLayout(nnvg)
  // The bonus leaves Induction World's stem one row below its last level...
  const split = node(layout, 'InductionBonus', 1).y
  // ...and Proposition World's branch turns in on the same stem further down.
  const join = segment(layout, 'edge:Proposition:InductionJoined:in').points[1].y
  assert.ok(join - split >= PATH_MAP_ROW_HEIGHT, `join at ${join}, split at ${split}`)
})

// The map since the 2026-11-09 spec: Successor World (split by Proposition World's
// branch) leads to Induction World on the left and, with all of Proposition World, to
// the ≠ World, whose last levels also wait for Induction World.
const nnvg3 = {
  worlds: {
    Intro: { title: 'Welcome', shared: true, column: 0 },
    Rewrite: { title: 'Rewrite World', color: 'amber', column: -1 },
    RewriteBonus: { title: 'Rewrite World Bonus', bonusOf: { world: 'Rewrite', level: 3 } },
    Proposition: { title: 'Proposition World', color: 'sky', column: 1 },
    PropositionRight: { title: 'Proposition World', continues: 'Proposition', column: 2 },
    PropositionBonus: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 2 } },
    PropositionBonusB: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 7 } },
    Successor: { title: 'Successor World', color: 'green', column: 0 },
    SuccessorJoined: { title: 'Successor World', continues: 'Successor', column: 0 },
    Induction: { title: 'Induction World', color: 'pink', column: -1 },
    Neq: { title: '≠ World', color: 'teal', column: 1 },
    NeqJoined: { title: '≠ World', continues: 'Neq', column: 1 },
  },
  edges: [
    ['Induction', 'NeqJoined'], ['Intro', 'Proposition'], ['Intro', 'Rewrite'], ['Neq', 'NeqJoined'],
    ['Proposition', 'PropositionRight'], ['Proposition', 'SuccessorJoined'], ['PropositionRight', 'Neq'],
    ['PropositionRight', 'PropositionBonus'], ['PropositionRight', 'PropositionBonusB'],
    ['Rewrite', 'RewriteBonus'], ['Rewrite', 'Successor'], ['Successor', 'SuccessorJoined'],
    ['SuccessorJoined', 'Induction'], ['SuccessorJoined', 'Neq'],
  ],
  worldSize: {
    Intro: 1, Rewrite: 6, RewriteBonus: 1, Proposition: 7, PropositionRight: 7, PropositionBonus: 1,
    PropositionBonusB: 3, Successor: 3, SuccessorJoined: 2, Induction: 4, Neq: 8, NeqJoined: 2,
  },
}

test('a path joining a world that carries straight on turns in between its levels', () => {
  const layout = computePathMapLayout(nnvg3)
  for (const [key, above, below] of [
    ['edge:Proposition:SuccessorJoined:in', node(layout, 'Successor', 3), node(layout, 'SuccessorJoined', 1)],
    ['edge:Induction:NeqJoined:in', node(layout, 'Neq', 8), node(layout, 'NeqJoined', 1)],
  ]) {
    const turn = segment(layout, key).points[1].y
    assert.ok(turn - above.y >= PATH_MAP_ROW_HEIGHT, `${key} turns in at ${turn}, under the level at ${above.y}`)
    assert.ok(below.y - turn >= PATH_MAP_ROW_HEIGHT / 2, `${key} turns in at ${turn}, on the level at ${below.y}`)
    assert.equal(below.y - above.y, 2 * PATH_MAP_ROW_HEIGHT)
  }
  // A world nothing joins from the side still carries on one row down.
  const straight = computePathMapLayout({
    worlds: { A: { title: 'A', column: 0 }, B: { title: 'A', continues: 'A', column: 0 } },
    edges: [['A', 'B']],
    worldSize: { A: 2, B: 1 },
  })
  assert.equal(node(straight, 'B', 1).y - node(straight, 'A', 2).y, PATH_MAP_ROW_HEIGHT)
})

test('no path runs over the levels of another world', () => {
  const layout = computePathMapLayout(nnvg3)
  for (const seg of layout.segments) {
    for (let index = 0; index + 1 < seg.points.length; index += 1) {
      const [a, b] = [seg.points[index], seg.points[index + 1]]
      for (const n of layout.nodes) {
        const onVertical = a.x === b.x && n.x === a.x && n.y > Math.min(a.y, b.y) && n.y < Math.max(a.y, b.y)
        const onHorizontal = a.y === b.y && n.y === a.y && n.x > Math.min(a.x, b.x) && n.x < Math.max(a.x, b.x)
        assert.ok(!onVertical && !onHorizontal, `${seg.key} runs over ${n.world} ${n.level}`)
      }
    }
  }
})

test('Successor World forks to Induction World and the ≠ World, which Proposition World joins', () => {
  const layout = computePathMapLayout(nnvg3)
  const toInduction = segment(layout, 'edge:SuccessorJoined:Induction:in')
  const toNeq = segment(layout, 'edge:SuccessorJoined:Neq:in')
  assert.deepEqual(toInduction.points[0], toNeq.points[0])
  assert.ok(node(layout, 'Induction', 1).x < node(layout, 'SuccessorJoined', 2).x)
  assert.ok(node(layout, 'Neq', 1).x > node(layout, 'SuccessorJoined', 2).x)
  assert.ok(node(layout, 'Neq', 1).y > node(layout, 'PropositionBonusB', 1).y)
  assert.equal(node(layout, 'NeqJoined', 1).color, 'teal')
  assert.ok(node(layout, 'NeqJoined', 1).y > node(layout, 'Induction', 4).y)
})

// The map since the second 2026-11-10 spec pull: the ≠ boss off to the side, and the
// worlds ported from NNG4 below: Multiplication and Power World on the far left,
// Advanced Addition World in the middle, ≤ World and Advanced Multiplication World under
// Induction World, and the closing text at the bottom.
const nnvg4 = {
  worlds: {
    ...nnvg3.worlds,
    NeqBoss: { title: '≠ World Boss', bonusOf: { world: 'NeqJoined', level: 1 } },
    Multiplication: { title: 'Multiplication World', color: 'orange', column: -2 },
    Power: { title: 'Power World', color: 'red', column: -2 },
    PowerBonus: { title: 'Power World Bonus', bonusOf: { world: 'Power', level: 9 } },
    AdvAddition: { title: 'Advanced Addition World', color: 'purple', column: 0 },
    LessOrEqual: { title: '≤ World', color: 'blue', column: -1 },
    AdvMultiplication: { title: 'Advanced Multiplication World', color: 'indigo', column: -1 },
    Outro: { title: 'Thank you', shared: true, column: 0 },
  },
  edges: [
    ...nnvg3.edges,
    // As MakeGame writes them: the edges a path already implies are left out.
    ['NeqJoined', 'NeqBoss'], ['Power', 'PowerBonus'],
    ['Induction', 'Multiplication'], ['Multiplication', 'Power'],
    ['NeqJoined', 'AdvAddition'],
    ['AdvAddition', 'LessOrEqual'], ['LessOrEqual', 'AdvMultiplication'], ['Power', 'AdvMultiplication'],
    ['AdvMultiplication', 'Outro'],
  ],
  worldSize: {
    ...nnvg3.worldSize, RewriteBonus: 1, Neq: 8, NeqJoined: 1, NeqBoss: 1,
    Multiplication: 9, Power: 9, PowerBonus: 1, AdvAddition: 6, LessOrEqual: 10, AdvMultiplication: 10, Outro: 1,
  },
}

test('the ported worlds and the closing text keep clear of each other', () => {
  const layout = computePathMapLayout(nnvg4)
  for (const seg of layout.segments) {
    for (let index = 0; index + 1 < seg.points.length; index += 1) {
      const [a, b] = [seg.points[index], seg.points[index + 1]]
      for (const n of layout.nodes) {
        const onVertical = a.x === b.x && n.x === a.x && n.y > Math.min(a.y, b.y) && n.y < Math.max(a.y, b.y)
        const onHorizontal = a.y === b.y && n.y === a.y && n.x > Math.min(a.x, b.x) && n.x < Math.max(a.x, b.x)
        assert.ok(!onVertical && !onHorizontal, `${seg.key} runs over ${n.world} ${n.level}`)
      }
    }
  }
  // No two levels share a spot.
  for (const a of layout.nodes) for (const b of layout.nodes) {
    if (a !== b) assert.ok(a.x !== b.x || a.y !== b.y, `${a.world} ${a.level} on ${b.world} ${b.level}`)
  }
  const outro = node(layout, 'Outro', 1)
  for (const n of layout.nodes) if (n.world !== 'Outro') assert.ok(n.y < outro.y, `${n.world} ${n.level} below the closing text`)
  assert.ok(node(layout, 'Multiplication', 1).x < node(layout, 'Induction', 1).x)
  assert.equal(node(layout, 'Power', 1).x, node(layout, 'Multiplication', 9).x)
  assert.ok(node(layout, 'PowerBonus', 1).x < node(layout, 'Power', 9).x)
  assert.ok(node(layout, 'NeqBoss', 1).x > node(layout, 'NeqJoined', 1).x)
  assert.ok(node(layout, 'LessOrEqual', 1).y > node(layout, 'Induction', 4).y)
  assert.equal(node(layout, 'AdvMultiplication', 10).color, 'indigo')
})

// The map of the 2026-11-11 spec pull (The End then followed Advanced Addition World): ≤ World leaves Advanced Addition World to the
// right, and Advanced Multiplication World carries on below it, needing only that and
// Multiplication World, whose path comes across from the far left. The End sits at the
// bottom, joined by Power World, Advanced Addition World and the ≠ boss, whose path runs
// down column 3.
const nnvg5 = {
  worlds: {
    ...nnvg4.worlds,
    NeqBoss: { title: '≠ World Boss', bonusOf: { world: 'NeqJoined', level: 1 }, column: 3 },
    LessOrEqual: { title: '≤ World', color: 'blue', column: 1 },
    AdvMultiplication: { title: 'Advanced Multiplication World', color: 'indigo', column: 1 },
    Outro: { title: 'The End', shared: true, column: 0, bottom: true },
  },
  edges: [
    ...nnvg3.edges,
    ['NeqJoined', 'NeqBoss'], ['Power', 'PowerBonus'],
    ['Induction', 'Multiplication'], ['Multiplication', 'Power'],
    ['NeqJoined', 'AdvAddition'],
    ['AdvAddition', 'LessOrEqual'], ['LessOrEqual', 'AdvMultiplication'], ['Multiplication', 'AdvMultiplication'],
    ['Power', 'Outro'], ['AdvAddition', 'Outro'], ['NeqBoss', 'Outro'],
  ],
  worldSize: { ...nnvg4.worldSize, AdvAddition: 5 },
}

function assertNoPathOverLevels(layout) {
  for (const seg of layout.segments) {
    for (let index = 0; index + 1 < seg.points.length; index += 1) {
      const [a, b] = [seg.points[index], seg.points[index + 1]]
      for (const n of layout.nodes) {
        const onVertical = a.x === b.x && n.x === a.x && n.y > Math.min(a.y, b.y) && n.y < Math.max(a.y, b.y)
        const onHorizontal = a.y === b.y && n.y === a.y && n.x > Math.min(a.x, b.x) && n.x < Math.max(a.x, b.x)
        assert.ok(!onVertical && !onHorizontal, `${seg.key} runs over ${n.world} ${n.level}`)
      }
    }
  }
}

test('a closing level sits below every world, joined by a path from each world it follows', () => {
  const layout = computePathMapLayout(nnvg5)
  assertNoPathOverLevels(layout)
  const end = node(layout, 'Outro', 1)
  assert.equal(end.x, 0)
  for (const n of layout.nodes) {
    if (n.world !== 'Outro') assert.ok(end.y - n.y >= 2 * PATH_MAP_ROW_HEIGHT, `${n.world} ${n.level} is not above The End`)
  }
  for (const source of ['Power', 'AdvAddition', 'NeqBoss']) {
    const into = segment(layout, `edge:${source}:Outro:in`)
    assert.ok(into, `no path from ${source}`)
    assert.deepEqual(into.points.at(-1), { x: end.x, y: end.y })
    assert.equal(into.color, 'grey')
    const out = segment(layout, `edge:${source}:Outro:out`)
    assert.equal(out.color, node(layout, source, 1).color)
    // The path is grey soon after it leaves, not all the way down in its world's colour.
    const last = node(layout, source, nnvg5.worldSize[source])
    assert.ok(into.points[0].y - last.y <= 2.1 * PATH_MAP_ROW_HEIGHT, `the path from ${source} stays coloured`)
  }
  // Advanced Addition World's path runs straight down the middle.
  assert.equal(segment(layout, 'edge:AdvAddition:Outro:in').points.length, 2)
})

test('a path onwards from a bonus level runs down the column of the bonus world', () => {
  const layout = computePathMapLayout(nnvg5)
  const boss = node(layout, 'NeqBoss', 1)
  const out = segment(layout, 'edge:NeqBoss:Outro:out')
  assert.deepEqual(out.points[0], { x: boss.x, y: boss.y })
  assert.deepEqual(out.points[1], { x: 3 * PATH_MAP_COLUMN_WIDTH, y: boss.y })
  const into = segment(layout, 'edge:NeqBoss:Outro:in')
  assert.ok(into.points.slice(0, 2).every(point => point.x === 3 * PATH_MAP_COLUMN_WIDTH))
  assert.deepEqual(out.source, { world: 'NeqBoss', level: 1 })
  // Without a column, it goes straight down from the bonus level.
  const plain = computePathMapLayout({
    ...nnvg5,
    worlds: { ...nnvg5.worlds, NeqBoss: { ...nnvg5.worlds.NeqBoss, column: undefined } },
  })
  const plainBoss = node(plain, 'NeqBoss', 1)
  assert.ok(segment(plain, 'edge:NeqBoss:Outro:in').points.slice(0, 2).every(point => point.x === plainBoss.x))
  // The edge MakeGame adds from the ≠ World to its boss is still not drawn as a world edge.
  assert.equal(layout.segments.some(s => s.key.startsWith('edge:NeqJoined:NeqBoss')), false)
})

test('a path leaves to the side at once when its world carries straight on below', () => {
  const layout = computePathMapLayout(nnvg5)
  const last = node(layout, 'Multiplication', 9)
  const power = node(layout, 'Power', 1)
  const target = node(layout, 'AdvMultiplication', 1)
  // Power World carries on in the same column, with room for the turn in between.
  assert.equal(power.x, last.x)
  assert.equal(power.y - last.y, 2 * PATH_MAP_ROW_HEIGHT)
  const into = segment(layout, 'edge:Multiplication:AdvMultiplication:in')
  const leaveY = into.points[1].y
  assert.ok(leaveY > last.y && leaveY < power.y)
  // It runs down the next column, which is clear, and crosses to its world above it.
  assert.equal(into.points[2].x, last.x + PATH_MAP_COLUMN_WIDTH)
  assert.equal(into.points[2].y, leaveY)
  assert.equal(into.points[3].x, last.x + PATH_MAP_COLUMN_WIDTH)
  assert.ok(target.y - into.points[3].y < PATH_MAP_ROW_HEIGHT)
  assert.deepEqual(into.points.at(-1), { x: target.x, y: target.y })
  assert.equal(into.color, 'indigo')
  // ≤ World leaves Advanced Addition World to the right, and its successor carries on below.
  assert.ok(node(layout, 'LessOrEqual', 1).x > node(layout, 'AdvAddition', 5).x)
  assert.equal(target.x, node(layout, 'LessOrEqual', 10).x)
  assert.equal(target.y - node(layout, 'LessOrEqual', 10).y, 2 * PATH_MAP_ROW_HEIGHT)
})

test('a path crossing another bridges it', () => {
  const layout = computePathMapLayout(nnvg5)
  const bridges = layout.segments.filter(s => s.bridge)
  assert.equal(bridges.length, 1)
  const [bridge] = bridges
  const into = segment(layout, 'edge:Multiplication:AdvMultiplication:in')
  // Over the path from Advanced Addition World down to The End, in the middle column.
  assert.equal((bridge.points[0].x + bridge.points[1].x) / 2, 0)
  assert.equal(bridge.points[0].y, into.points[3].y)
  assert.equal(bridge.color, into.color)
  assert.deepEqual(bridge.source, into.source)
  // Forks and joins are junctions, not crossings.
  assert.equal(computePathMapLayout(nnvg3).segments.some(s => s.bridge), false)
})

test('world titles keep clear of paths, levels and each other', () => {
  const layout = computePathMapLayout(nnvg5)
  const boxOf = label => {
    const width = label.text.length * 9
    const x1 = label.anchor === 'middle' ? label.x - width / 2 : label.anchor === 'end' ? label.x - width : label.x
    return { x1, x2: x1 + width, y1: label.y - 8, y2: label.y + 8 }
  }
  for (const label of layout.labels) {
    const box = boxOf(label)
    for (const seg of layout.segments) {
      for (let index = 0; index + 1 < seg.points.length; index += 1) {
        const [a, b] = [seg.points[index], seg.points[index + 1]]
        const clear = box.x2 < Math.min(a.x, b.x) - 8 || box.x1 > Math.max(a.x, b.x) + 8 ||
          box.y2 < Math.min(a.y, b.y) - 8 || box.y1 > Math.max(a.y, b.y) + 8
        assert.ok(clear, `${label.text} is on ${seg.key}`)
      }
    }
    for (const n of layout.nodes) {
      const dx = Math.max(box.x1 - n.x, 0, n.x - box.x2)
      const dy = Math.max(box.y1 - n.y, 0, n.y - box.y2)
      assert.ok(Math.hypot(dx, dy) > 31, `${label.text} is on ${n.world} ${n.level}`)
    }
    for (const other of layout.labels) {
      if (other === label) continue
      const otherBox = boxOf(other)
      assert.ok(box.x2 < otherBox.x1 || otherBox.x2 < box.x1 || box.y2 < otherBox.y1 || otherBox.y2 < box.y1,
        `${label.text} is on ${other.text}`)
    }
  }
  const byWorld = Object.fromEntries(layout.labels.map(label => [label.world, label]))
  // A world entered from straight above has its title beside the path, on the outer side.
  assert.equal(byWorld.Power.anchor, 'end')
  assert.ok(byWorld.Power.x < node(layout, 'Power', 1).x)
  assert.equal(byWorld.AdvMultiplication.anchor, 'start')
  assert.ok(byWorld.AdvMultiplication.x > node(layout, 'AdvMultiplication', 1).x)
  // One entered round a bend keeps its title above the bend.
  assert.equal(byWorld.LessOrEqual.anchor, 'middle')
  assert.equal(byWorld.LessOrEqual.x, node(layout, 'LessOrEqual', 1).x)
  assert.ok(byWorld.LessOrEqual.y < segment(layout, 'edge:AdvAddition:LessOrEqual:in').points[1].y)
  // The whole map still fits its bounds.
  for (const label of layout.labels) {
    const box = boxOf(label)
    assert.ok(box.x1 >= layout.bounds.x1 - 20 && box.x2 <= layout.bounds.x2 + 20, `${label.text} leaves the map`)
  }
})

// The map since the 2026-11-12 spec pull: The End follows Advanced Multiplication World
// instead of Advanced Addition World, so nothing runs down the middle column below
// Advanced Addition World any more.
const nnvg6 = {
  ...nnvg5,
  edges: [
    ...nnvg5.edges.filter(([source, target]) => !(source === 'AdvAddition' && target === 'Outro')),
    ['AdvMultiplication', 'Outro'],
  ],
}

test('The End follows the last world of each side of the map, and no path crosses another', () => {
  const layout = computePathMapLayout(nnvg6)
  assertNoPathOverLevels(layout)
  const end = node(layout, 'Outro', 1)
  assert.equal(end.x, 0)
  for (const n of layout.nodes) {
    if (n.world !== 'Outro') assert.ok(end.y - n.y >= 2 * PATH_MAP_ROW_HEIGHT, `${n.world} ${n.level} is not above The End`)
  }
  assert.equal(segment(layout, 'edge:AdvAddition:Outro:in'), undefined)
  for (const source of ['Power', 'AdvMultiplication', 'NeqBoss']) {
    const into = segment(layout, `edge:${source}:Outro:in`)
    assert.ok(into, `no path from ${source}`)
    assert.deepEqual(into.points.at(-1), { x: end.x, y: end.y })
    assert.equal(into.color, 'grey')
  }
  // Advanced Multiplication World's path drops from its boss and turns in to the middle,
  // where the ≠ boss's path, coming along the bottom from the right, joins it.
  const boss = node(layout, 'AdvMultiplication', 10)
  const fromBoss = segment(layout, 'edge:AdvMultiplication:Outro:in')
  assert.equal(fromBoss.points[0].x, boss.x)
  const turnY = fromBoss.points.at(-2).y
  assert.equal(fromBoss.points.at(-2).x, end.x)
  assert.equal(segment(layout, 'edge:NeqBoss:Outro:in').points.at(-2).y, turnY)
  assert.equal(segment(layout, 'edge:Power:Outro:in').points.at(-2).y, turnY)
  // Multiplication World's path now comes across an empty middle column.
  assert.equal(layout.segments.some(s => s.bridge), false)
  // The titles sit where they did.
  const byWorld = Object.fromEntries(layout.labels.map(label => [label.world, label]))
  assert.equal(byWorld.Power.anchor, 'end')
  assert.equal(byWorld.AdvMultiplication.anchor, 'start')
  assert.equal(byWorld.LessOrEqual.anchor, 'middle')
  assert.equal(byWorld.AdvAddition.anchor, 'middle')
})

// The map since the 2026-11-18 spec pull: two bonus branches leave Rewrite World's
// level 2 (A and B), and two leave Proposition World's boss (B and C). Proposition
// World forks after its level 7, so its two parts have eight levels each.
const nnvg7 = {
  ...nnvg6,
  worlds: {
    ...nnvg6.worlds,
    RewriteBonusB: { title: 'Rewrite World Bonus', bonusOf: { world: 'Rewrite', level: 3 } },
    PropositionBonusB: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 8 } },
    PropositionBonusC: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 8 } },
  },
  edges: [...nnvg6.edges, ['Rewrite', 'RewriteBonusB'], ['PropositionRight', 'PropositionBonusC']],
  worldSize: { ...nnvg6.worldSize, RewriteBonusB: 1, Proposition: 8, PropositionRight: 8, PropositionBonusC: 1,
    SuccessorJoined: 3 },
}

test('bonus branches off one level leave its path once and fan out from a stem', () => {
  const layout = computePathMapLayout(nnvg7)
  assertNoPathOverLevels(layout)
  for (const [world, level, branches] of [
    ['Rewrite', 3, ['RewriteBonus', 'RewriteBonusB']],
    ['PropositionRight', 8, ['PropositionBonusB', 'PropositionBonusC']],
  ]) {
    const anchor = node(layout, world, level)
    const [first, second] = branches.map(branch => node(layout, branch, 1))
    const [toFirst, toSecond] = branches.map(branch => segment(layout, `bonus:${world}:${level}:${branch}`))
    const side = Math.sign(first.x - anchor.x)
    // One row each, the first above the second, both starting past the stem.
    assert.equal(second.y, first.y + PATH_MAP_ROW_HEIGHT)
    assert.equal(second.x, first.x)
    const stemX = toFirst.points[1].x
    assert.ok(side * (stemX - anchor.x) > 22, 'the stem is clear of the levels on the path')
    assert.ok(side * (first.x - stemX) > 22 + PATH_MAP_CORNER_RADIUS, 'a branch has room to turn off the stem')
    // Only the first branch touches the path it leaves: sideways out of the level,
    // then down the stem.
    assert.deepEqual(toFirst.points, [
      { x: anchor.x, y: anchor.y }, { x: stemX, y: anchor.y }, { x: stemX, y: first.y }, { x: first.x, y: first.y },
    ])
    // The second carries the stem on from the first one's turn.
    assert.deepEqual(toSecond.points, [
      { x: stemX, y: first.y - PATH_MAP_CORNER_RADIUS }, { x: stemX, y: second.y }, { x: second.x, y: second.y },
    ])
    assert.ok(toSecond.points.every(point => point.x !== anchor.x))
    // Both light up with the level they leave.
    assert.deepEqual(toSecond.source, { world, level })
  }
  // A single branch off the last level of its world still drops straight down from it.
  const lone = segment(layout, 'bonus:NeqJoined:1:NeqBoss')
  assert.equal(lone.points[1].x, node(layout, 'NeqJoined', 1).x)
  // One with the path's next level beside it leaves by a stem too.
  const beside = segment(layout, 'bonus:PropositionRight:2:PropositionBonus')
  assert.notEqual(beside.points[1].x, node(layout, 'PropositionRight', 2).x)
  assert.equal(beside.points[1].y, node(layout, 'PropositionRight', 2).y)
})

test('the levels after a branching level are listed beside its branches', () => {
  const layout = computePathMapLayout(nnvg7)
  assertNoPathOverLevels(layout)
  // Rewrite World's levels are a row apart all the way down, bonuses or not.
  for (let level = 1; level < 6; level += 1) {
    assert.equal(node(layout, 'Rewrite', level + 1).y - node(layout, 'Rewrite', level).y, PATH_MAP_ROW_HEIGHT)
  }
  // Its two branches sit beside the two levels after the one they leave.
  assert.equal(node(layout, 'RewriteBonus', 1).y, node(layout, 'Rewrite', 4).y)
  assert.equal(node(layout, 'RewriteBonusB', 1).y, node(layout, 'Rewrite', 5).y)
  // Branches off a world's last level still have their rows below it, and the next
  // world starts below them.
  const boss = node(layout, 'PropositionRight', 8)
  assert.equal(node(layout, 'PropositionBonusC', 1).y, boss.y + 2 * PATH_MAP_ROW_HEIGHT)
  assert.ok(node(layout, 'Neq', 1).y > node(layout, 'PropositionBonusC', 1).y)
})

test('a level with branches of its own waits for the branches above it', () => {
  const layout = computePathMapLayout({
    worlds: {
      Main: { title: 'Main World' },
      First: { title: 'Bonus', bonusOf: { world: 'Main', level: 1 } },
      Second: { title: 'Bonus', bonusOf: { world: 'Main', level: 1 } },
      Third: { title: 'Bonus', bonusOf: { world: 'Main', level: 2 } },
    },
    edges: [['Main', 'First'], ['Main', 'Second'], ['Main', 'Third']],
    worldSize: { Main: 4, First: 1, Second: 1, Third: 1 },
  })
  const rowOf = (world, level) => node(layout, world, level).y / PATH_MAP_ROW_HEIGHT
  assert.deepEqual([rowOf('First', 1), rowOf('Second', 1)], [1, 2])
  // Level 2 would be beside the first branch, but its own branch needs a free row.
  assert.equal(rowOf('Main', 2), 2)
  assert.equal(rowOf('Third', 1), 3)
  assert.deepEqual([rowOf('Main', 3), rowOf('Main', 4)], [3, 4])
})

// The map since the 2026-11-23 spec pull (V11): Induction World carries on past the ≠
// World's boss (levels 4 to 7, then 8 and 9), ≤ World waits for it twice, Logic World
// follows two bonus branches and the ≠ World, and The End follows Logic World. The
// game lists no edge from Induction World's first part to its second: the way round by
// the ≠ World implies it.
const nnvg8 = {
  worlds: {
    AdvMultiplication: { title: 'Advanced Multiplication World', color: 'canyon', column: 1 },
    Induction: { title: 'Induction World', color: 'blossom', column: -1 },
    InductionDouble: { title: 'Induction World', column: -1, continues: 'InductionJoined' },
    InductionJoined: { title: 'Induction World', column: -1, continues: 'Induction' },
    Intro: { title: 'Welcome', column: 0, shared: true },
    LessOrEqual: { title: '≤ World', color: 'circuit', column: 1 },
    LessOrEqualBoss: { title: '≤ World', column: 1, continues: 'LessOrEqualJoined' },
    LessOrEqualJoined: { title: '≤ World', column: 1, continues: 'LessOrEqual' },
    Logic: { title: 'Logic World', color: 'frost', column: 2 },
    Multiplication: { title: 'Multiplication World', color: 'sandstone', column: -2 },
    Neq: { title: '≠ World', color: 'riverside', column: 1 },
    NeqJoined: { title: '≠ World', column: 1, continues: 'Neq' },
    Outro: { title: 'The End', column: 0, shared: true, bottom: true },
    Power: { title: 'Power World', color: 'red', column: -2 },
    PowerBonus: { title: 'Power World Bonus', bonusOf: { world: 'Power', level: 9 } },
    Proposition: { title: 'Proposition World', color: 'aqueduct', column: 1 },
    PropositionBonus: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 2 } },
    PropositionBonusB: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 8 } },
    PropositionBonusC: { title: 'Proposition World Bonus', bonusOf: { world: 'PropositionRight', level: 8 } },
    PropositionRight: { title: 'Proposition World', column: 2, continues: 'Proposition' },
    Rewrite: { title: 'Rewrite World', color: 'lantern', column: -1 },
    RewriteBonus: { title: 'Rewrite World Bonus', bonusOf: { world: 'Rewrite', level: 3 } },
    RewriteBonusB: { title: 'Rewrite World Bonus', bonusOf: { world: 'Rewrite', level: 3 } },
    Successor: { title: 'Successor World', color: 'signal', column: 0 },
    SuccessorJoined: { title: 'Successor World', column: 0, continues: 'Successor' },
  },
  edges: [
    ['AdvMultiplication', 'Outro'],
    ['Induction', 'Multiplication'],
    ['Induction', 'NeqJoined'],
    ['InductionDouble', 'LessOrEqualBoss'],
    ['InductionJoined', 'InductionDouble'],
    ['InductionJoined', 'LessOrEqualJoined'],
    ['Intro', 'Proposition'],
    ['Intro', 'Rewrite'],
    ['LessOrEqual', 'LessOrEqualJoined'],
    ['LessOrEqualBoss', 'AdvMultiplication'],
    ['LessOrEqualJoined', 'LessOrEqualBoss'],
    ['Logic', 'Outro'],
    ['Multiplication', 'AdvMultiplication'],
    ['Multiplication', 'Power'],
    ['Neq', 'NeqJoined'],
    ['NeqJoined', 'InductionJoined'],
    ['NeqJoined', 'LessOrEqual'],
    ['NeqJoined', 'Logic'],
    ['Power', 'Outro'],
    ['Power', 'PowerBonus'],
    ['Proposition', 'PropositionRight'],
    ['Proposition', 'SuccessorJoined'],
    ['PropositionBonusB', 'Logic'],
    ['PropositionBonusC', 'Logic'],
    ['PropositionRight', 'Neq'],
    ['PropositionRight', 'PropositionBonus'],
    ['PropositionRight', 'PropositionBonusB'],
    ['PropositionRight', 'PropositionBonusC'],
    ['Rewrite', 'RewriteBonus'],
    ['Rewrite', 'RewriteBonusB'],
    ['Rewrite', 'Successor'],
    ['Successor', 'SuccessorJoined'],
    ['SuccessorJoined', 'Induction'],
    ['SuccessorJoined', 'Neq'],
  ],
  worldSize: { AdvMultiplication: 10, Induction: 4, InductionDouble: 2, InductionJoined: 4, Intro: 1, LessOrEqual: 7, LessOrEqualBoss: 1, LessOrEqualJoined: 3, Logic: 1, Multiplication: 9, Neq: 9, NeqJoined: 1, Outro: 1, Power: 9, PowerBonus: 1, Proposition: 8, PropositionBonus: 1, PropositionBonusB: 1, PropositionBonusC: 3, PropositionRight: 8, Rewrite: 6, RewriteBonus: 2, RewriteBonusB: 1, Successor: 3, SuccessorJoined: 3 },
}

test('a world carries on the path it continues, also where no edge of the game says so', () => {
  const layout = computePathMapLayout(nnvg8, { defaultColor: 'grey' })
  assertNoPathOverLevels(layout)
  assert.equal(nnvg8.edges.some(([source, target]) => source === 'Induction' && target === 'InductionJoined'), false)
  const [last, next] = [node(layout, 'Induction', 4), node(layout, 'InductionJoined', 1)]
  assert.equal(next.x, last.x)
  assert.deepEqual(segment(layout, 'edge:Induction:InductionJoined:out').points[0], { x: last.x, y: last.y })
  assert.deepEqual(segment(layout, 'edge:Induction:InductionJoined:in').points.at(-1), { x: next.x, y: next.y })
  // The ≠ World's boss comes before it, and its path joins from the side above it.
  const boss = node(layout, 'NeqJoined', 1)
  assert.ok(boss.y < next.y)
  const join = segment(layout, 'edge:NeqJoined:InductionJoined:in')
  assert.equal(join.points.at(-2).x, next.x)
  assert.ok(join.points.at(-2).y < next.y - 22)
  // All of Induction World is one colour and has one title.
  for (const world of ['InductionJoined', 'InductionDouble']) assert.equal(node(layout, world, 1).color, 'blossom')
  assert.deepEqual(layout.labels.filter(label => label.text === 'Induction World').map(label => label.world), ['Induction'])
})

test('branches off one level that lead on are listed longest first, so their paths drop clear', () => {
  const layout = computePathMapLayout(nnvg8, { defaultColor: 'grey' })
  const [b, c] = [node(layout, 'PropositionBonusB', 1), node(layout, 'PropositionBonusC', 1)]
  assert.ok(c.y < b.y, 'the three levels of C are above the one of B')
  for (const [source, last] of [['PropositionBonusB', 1], ['PropositionBonusC', 3]]) {
    const from = node(layout, source, last)
    const onward = [...segment(layout, `edge:${source}:Logic:out`).points, ...segment(layout, `edge:${source}:Logic:in`).points]
    assert.deepEqual(onward[0], { x: from.x, y: from.y })
    assert.deepEqual(onward.at(-1), { x: node(layout, 'Logic', 1).x, y: node(layout, 'Logic', 1).y })
    // Straight down from its last level, past no other level.
    assert.equal(onward[1].x, from.x)
    assert.equal(layout.nodes.some(n => n.x === from.x && n.y > from.y && n.y < onward.at(-2).y), false)
  }
  // Branches that lead nowhere keep the order they are listed in.
  assert.ok(node(layout, 'RewriteBonus', 1).y < node(layout, 'RewriteBonusB', 1).y)
})

test('a path that needs a lane keeps off the runs of other paths, leaving a little lower if it must', () => {
  const layout = computePathMapLayout(nnvg8, { defaultColor: 'grey' })
  const uprights = key => {
    const points = [...segment(layout, `${key}:out`).points, ...segment(layout, `${key}:in`).points]
    return points.flatMap((point, index) => {
      const next = points[index + 1]
      return next && next.x === point.x && next.y !== point.y
        ? [{ x: point.x, from: Math.min(point.y, next.y), to: Math.max(point.y, next.y) }] : []
    })
  }
  const edges = [...new Set(layout.segments.filter(s => s.key.startsWith('edge:')).map(s => s.key.replace(/:(out|in)(:bridge.*)?$/u, '')))]
  // Paths out of different worlds never run down the same stretch of a column.
  // (Those out of one world do, until they fork.)
  for (const a of edges) {
    for (const b of edges) {
      if (a >= b || a.split(':')[1] === b.split(':')[1]) continue
      for (const first of uprights(a)) {
        for (const second of uprights(b)) {
          const shared = Math.min(first.to, second.to) - Math.max(first.from, second.from)
          // Two paths into one level share the last stretch above it.
          const joinsOneLevel = a.split(':')[2] === b.split(':')[2]
          assert.ok(first.x !== second.x || shared <= (joinsOneLevel ? PATH_MAP_ROW_HEIGHT : 0), `${a} runs along ${b}`)
        }
      }
    }
  }
  // Multiplication World's path to Advanced Multiplication World can't go down its own
  // column (Power World) or Induction World's (the path from its last level), so it
  // takes the middle one, below the turn of the path into ≤ World's level 7.
  const across = segment(layout, 'edge:Multiplication:AdvMultiplication:in')
  assert.ok(across.points.some(point => point.x === 0))
  const turn = segment(layout, 'edge:InductionJoined:LessOrEqualJoined:in').points.at(-3)
  assert.equal(turn.x, 0)
  assert.ok(across.points[2].y > turn.y + PATH_MAP_CORNER_RADIUS)
  assert.equal(layout.segments.filter(s => s.bridge).length, 2)
})

test('The End follows Power World, Advanced Multiplication World and Logic World', () => {
  const layout = computePathMapLayout(nnvg8, { defaultColor: 'grey' })
  const end = node(layout, 'Outro', 1)
  for (const n of layout.nodes) {
    if (n.world !== 'Outro') assert.ok(end.y - n.y >= 2 * PATH_MAP_ROW_HEIGHT, `${n.world} ${n.level} is not above The End`)
  }
  for (const source of ['Power', 'AdvMultiplication', 'Logic']) {
    const into = segment(layout, `edge:${source}:Outro:in`)
    assert.ok(into, `no path from ${source}`)
    assert.deepEqual(into.points.at(-1), { x: end.x, y: end.y })
    assert.equal(into.color, 'grey')
  }
  // ≤ World is three Lean worlds, joined twice by Induction World, in one column.
  const column = node(layout, 'LessOrEqual', 1).x
  for (const [world, level] of [['LessOrEqualJoined', 1], ['LessOrEqualBoss', 1], ['AdvMultiplication', 1]]) {
    assert.equal(node(layout, world, level).x, column)
  }
  assert.ok(node(layout, 'LessOrEqualJoined', 1).y > node(layout, 'InductionJoined', 4).y)
  assert.ok(node(layout, 'LessOrEqualBoss', 1).y > node(layout, 'InductionDouble', 2).y)
})

// The map since the 2026-11-24 spec pull (V12): Multiplication World and Power World are
// one world, Multiplication and Exponentiation World, whose second part carries on the
// first; ≤ World waits for Induction World a level earlier; and the bonus off the last
// level of the powers also waits for ≤ World, whose path comes across the whole map.
const nnvg9 = {
  worlds: {
    ...nnvg8.worlds,
    Multiplication: { title: 'Multiplication and Exponentiation World', color: 'sandstone', column: -2 },
    Power: { title: 'Multiplication and Exponentiation World', column: -2, continues: 'Multiplication' },
    PowerBonus: { title: 'Multiplication and Exponentiation World Bonus', bonusOf: { world: 'Power', level: 9 } },
  },
  edges: [...nnvg8.edges, ['LessOrEqualBoss', 'PowerBonus']],
  worldSize: { ...nnvg8.worldSize, Multiplication: 8, LessOrEqual: 6, LessOrEqualJoined: 4 },
}

test('a long title is set on two lines of about the same length', () => {
  assert.deepEqual(pathMapLabelLines('≤ World'), ['≤ World'])
  assert.deepEqual(pathMapLabelLines('Advanced Multiplication World'), ['Advanced Multiplication World'])
  assert.deepEqual(pathMapLabelLines('Multiplication and Exponentiation World'), ['Multiplication and', 'Exponentiation World'])
  assert.deepEqual(pathMapLabelLines('Supercalifragilisticexpialidocious'), ['Supercalifragilisticexpialidocious'])
})

test('Multiplication and Exponentiation World is one column of levels under one two-line title', () => {
  const layout = computePathMapLayout(nnvg9, { defaultColor: 'grey' })
  assertNoPathOverLevels(layout)
  const [last, next] = [node(layout, 'Multiplication', 8), node(layout, 'Power', 1)]
  assert.equal(next.x, last.x)
  assert.equal(next.color, 'sandstone')
  // Advanced Multiplication World's path leaves between the two, so they are a column
  // change apart, not one row.
  assert.ok(next.y - last.y > PATH_MAP_ROW_HEIGHT)
  assert.ok(segment(layout, 'edge:Multiplication:AdvMultiplication:out'))
  const titles = layout.labels.filter(label => label.text === 'Multiplication and Exponentiation World')
  assert.deepEqual(titles.map(label => label.world), ['Multiplication'])
  assert.deepEqual(titles[0].lines, ['Multiplication and', 'Exponentiation World'])
  // On two lines it fits above its own column, and the map is no wider for it.
  assert.equal(titles[0].anchor, 'middle')
  assert.equal(titles[0].x, last.x)
  const oneLine = computePathMapLayout({ ...nnvg9, worlds: { ...nnvg9.worlds,
    Multiplication: { ...nnvg9.worlds.Multiplication, title: 'Multiplication World' } } }, { defaultColor: 'grey' })
  assert.equal(layout.bounds.x1, oneLine.bounds.x1)
})

test('a path leads into a bonus world from a world it waits for besides the one it branches off', () => {
  const layout = computePathMapLayout(nnvg9, { defaultColor: 'grey' })
  assertNoPathOverLevels(layout)
  const [boss, bonus] = [node(layout, 'LessOrEqualBoss', 1), node(layout, 'PowerBonus', 1)]
  assert.ok(segment(layout, 'bonus:Power:9:PowerBonus'))
  const out = segment(layout, 'edge:LessOrEqualBoss:PowerBonus:out')
  const into = segment(layout, 'edge:LessOrEqualBoss:PowerBonus:in')
  assert.deepEqual(out.points[0], { x: boss.x, y: boss.y })
  assert.deepEqual(out.source, { world: 'LessOrEqualBoss', level: 1 })
  // It turns away half a row below ≤ World's boss, between the rows of levels, crosses
  // to above the bonus level and drops onto it: in the bonus world's colour all the way.
  const crossY = boss.y + PATH_MAP_ROW_HEIGHT / 2
  assert.deepEqual(into.points.slice(1), [
    { x: boss.x, y: crossY }, { x: bonus.x, y: crossY }, { x: bonus.x, y: bonus.y },
  ])
  assert.equal(into.color, 'sandstone')
  // On the way it bridges the path down the middle column and the levels about powers.
  const bridges = layout.segments.filter(s => s.bridge && s.key.startsWith('edge:LessOrEqualBoss:PowerBonus'))
  assert.deepEqual(bridges.map(s => (s.points[0].x + s.points[1].x) / 2).sort((a, b) => a - b),
    [node(layout, 'Power', 1).x, 0])
  // No such path where the bonus lies above the world it waits for.
  const above = computePathMapLayout({ ...nnvg9, edges: [...nnvg9.edges, ['AdvMultiplication', 'RewriteBonus']] },
    { defaultColor: 'grey' })
  assert.equal(above.segments.some(s => s.key.startsWith('edge:AdvMultiplication:RewriteBonus')), false)
  // ≤ World's second part starts at its level 6 now, below Induction World's level 7.
  assert.ok(node(layout, 'LessOrEqualJoined', 1).y > node(layout, 'InductionJoined', 4).y)
})

// The map since the 2026-11-24 spec pull's V12.1 note: Proposition World's last bonus
// branches (B has three levels now, C one) join into one path down Logic World's
// column, which is a column further right and leads nowhere; ≤ World waits for all of
// Induction World at its level 6 and has four bonus levels sent to the left off its
// boss; and the bonus off the last level about powers is sent to the right, and waits
// for those four bonus levels (not for ≤ World's boss, as in `nnvg9`).
const nnvg10 = {
  worlds: {
    ...nnvg9.worlds,
    Logic: { ...nnvg9.worlds.Logic, column: 3 },
    PropositionBonusB: { ...nnvg9.worlds.PropositionBonusB, column: 3 },
    PropositionBonusC: { ...nnvg9.worlds.PropositionBonusC, column: 3 },
    PowerBonus: { ...nnvg9.worlds.PowerBonus, bonusSide: 'right' },
    LessOrEqualBonus: { title: '≤ World Bonus', bonusOf: { world: 'LessOrEqualBoss', level: 1 }, bonusSide: 'left' },
  },
  edges: [
    ...nnvg9.edges.filter(([source, target]) => !(
      (source === 'Logic' && target === 'Outro') ||
      (source === 'InductionJoined' && target === 'LessOrEqualJoined') ||
      (source === 'InductionDouble' && target === 'LessOrEqualBoss') ||
      (source === 'LessOrEqualBoss' && target === 'PowerBonus'))),
    ['InductionDouble', 'LessOrEqualJoined'],
    ['LessOrEqualBoss', 'LessOrEqualBonus'],
    ['LessOrEqualBonus', 'PowerBonus'],
  ],
  worldSize: { ...nnvg9.worldSize, PropositionBonusB: 3, PropositionBonusC: 1, LessOrEqualBonus: 4 },
}

test('bonus branches that lead to one world and name its column join into one path there', () => {
  const layout = computePathMapLayout(nnvg10, { defaultColor: 'grey' })
  assertNoPathOverLevels(layout)
  const logic = node(layout, 'Logic', 1)
  assert.equal(logic.x, 3 * PATH_MAP_COLUMN_WIDTH)
  // The longer row is listed first, so B's last level is above and beyond C's one.
  const [b, c] = [node(layout, 'PropositionBonusB', 3), node(layout, 'PropositionBonusC', 1)]
  assert.ok(b.y < c.y)
  assert.ok(c.x < logic.x && logic.x < b.x)
  const pathOf = source => [
    ...segment(layout, `edge:${source}:Logic:out`).points, ...segment(layout, `edge:${source}:Logic:in`).points.slice(1)]
  // C runs along its row to the lane. B comes down beside its own levels to that row
  // and runs in from the other side.
  assert.deepEqual(pathOf('PropositionBonusC').slice(0, 2), [{ x: c.x, y: c.y }, { x: logic.x, y: c.y }])
  assert.deepEqual(pathOf('PropositionBonusB').slice(0, 3),
    [{ x: b.x, y: b.y }, { x: b.x, y: c.y }, { x: logic.x, y: c.y }])
  // From where they meet it is one path, straight down onto Logic World.
  for (const source of ['PropositionBonusB', 'PropositionBonusC']) {
    const down = pathOf(source).filter(point => point.y > c.y)
    assert.ok(down.length > 0 && down.every(point => point.x === logic.x))
    assert.deepEqual(down.at(-1), { x: logic.x, y: logic.y })
  }
  // Logic World leads nowhere, and The End follows the other two.
  assert.equal(layout.segments.some(s => s.key.startsWith('edge:Logic:')), false)
  for (const source of ['Power', 'AdvMultiplication']) assert.ok(segment(layout, `edge:${source}:Outro:in`))
})

test('a world can be placed right under a level of a bonus row, where its path then comes down', () => {
  // The map since the 2026-11-25 spec pull's V13 note: Logic World, and the one path
  // that Proposition World's last bonus branches join into, are under bonus B1. A bonus
  // row's levels sit between the columns, so the three worlds name that level and no
  // column.
  const under = { world: 'PropositionBonusB', level: 2 }
  const { column: _logic, ...logicWorld } = nnvg10.worlds.Logic
  const { column: _b, ...bonusB } = nnvg10.worlds.PropositionBonusB
  const { column: _c, ...bonusC } = nnvg10.worlds.PropositionBonusC
  const layout = computePathMapLayout({ ...nnvg10, worlds: {
    ...nnvg10.worlds,
    Logic: { ...logicWorld, under },
    PropositionBonusB: { ...bonusB, under },
    PropositionBonusC: { ...bonusC, under },
  } }, { defaultColor: 'grey' })
  assertNoPathOverLevels(layout)
  const before = computePathMapLayout(nnvg10, { defaultColor: 'grey' })
  const [b1, b2, c, logic] = [node(layout, 'PropositionBonusB', 2), node(layout, 'PropositionBonusB', 3),
    node(layout, 'PropositionBonusC', 1), node(layout, 'Logic', 1)]
  // The bonus rows are where they were, and Logic World has moved from its column to
  // under B1, between two columns.
  for (const [world, level] of [['PropositionBonusB', 1], ['PropositionBonusB', 2], ['PropositionBonusB', 3], ['PropositionBonusC', 1]]) {
    assert.deepEqual({ x: node(layout, world, level).x, y: node(layout, world, level).y },
      { x: node(before, world, level).x, y: node(before, world, level).y })
  }
  assert.equal(logic.x, b1.x)
  assert.notEqual(logic.x % PATH_MAP_COLUMN_WIDTH, 0)
  assert.equal(logic.y, node(before, 'Logic', 1).y)
  // C runs along its row to under B1; B comes down beside its own levels to that row
  // and runs in from the other side; from there it is one path straight down.
  const pathOf = source => [
    ...segment(layout, `edge:${source}:Logic:out`).points, ...segment(layout, `edge:${source}:Logic:in`).points.slice(1)]
  assert.deepEqual(pathOf('PropositionBonusC').slice(0, 2), [{ x: c.x, y: c.y }, { x: b1.x, y: c.y }])
  assert.deepEqual(pathOf('PropositionBonusB').slice(0, 3), [{ x: b2.x, y: b2.y }, { x: b2.x, y: c.y }, { x: b1.x, y: c.y }])
  for (const source of ['PropositionBonusB', 'PropositionBonusC']) {
    const down = pathOf(source).filter(point => point.y > c.y)
    assert.ok(down.length > 0 && down.every(point => point.x === b1.x))
    assert.deepEqual(down.at(-1), { x: logic.x, y: logic.y })
  }
  // The ≠ World's path to Logic World turns in above it as before.
  assert.deepEqual(segment(layout, 'edge:NeqJoined:Logic:in').points.at(-1), { x: logic.x, y: logic.y })
  // A level that isn't on the map leaves the world where its column puts it.
  const missing = computePathMapLayout({ ...nnvg10, worlds: {
    ...nnvg10.worlds, Logic: { ...nnvg10.worlds.Logic, under: { world: 'PropositionBonusB', level: 9 } },
  } }, { defaultColor: 'grey' })
  assert.equal(node(missing, 'Logic', 1).x, node(before, 'Logic', 1).x)
})

test('a bonus row can be sent to either side; across the columns its levels sit between them', () => {
  const layout = computePathMapLayout(nnvg10, { defaultColor: 'grey' })
  assertNoPathOverLevels(layout)
  const boss = node(layout, 'LessOrEqualBoss', 1)
  const slot = n => boss.x - (n - 0.5) * PATH_MAP_COLUMN_WIDTH / 2
  const offColumns = x =>
    assert.equal(Math.abs(x - Math.round(x / PATH_MAP_COLUMN_WIDTH) * PATH_MAP_COLUMN_WIDTH), PATH_MAP_COLUMN_WIDTH / 4)
  // The one level off the last level about powers goes right, at a bonus level's usual
  // distance: it doesn't reach the next column.
  const [last, fermat] = [node(layout, 'Power', 9), node(layout, 'PowerBonus', 1)]
  assert.ok(fermat.x > last.x && fermat.x < last.x + PATH_MAP_COLUMN_WIDTH)
  // With nothing waiting for them (here the level about Fermat waits for ≤ World's boss
  // instead), ≤ World's bonus levels go left from below the boss, half a column apart
  // and a quarter of a column from every column they pass, so that a path coming down
  // a column runs midway between two of them.
  const fromBoss = computePathMapLayout({ ...nnvg10, edges: [
    ...nnvg10.edges.filter(([source, target]) => !(source === 'LessOrEqualBonus' && target === 'PowerBonus')),
    ['LessOrEqualBoss', 'PowerBonus'],
  ] }, { defaultColor: 'grey' })
  assertNoPathOverLevels(fromBoss)
  const plain = [1, 2, 3, 4].map(n => node(fromBoss, 'LessOrEqualBonus', n).x)
  assert.deepEqual(plain, [1, 2, 3, 4].map(slot))
  plain.forEach(offColumns)
  // The level about Fermat waits for those bonus levels and lies lower, less than a
  // column past the end of their row. So the last of them is right above it and the
  // path between the two drops straight down; the levels before it are a slot further
  // along than they would be, still off the columns, and the row bridges the path that
  // comes down the column it crosses on the way to its last level.
  const xs = [1, 2, 3, 4].map(n => node(layout, 'LessOrEqualBonus', n).x)
  assert.deepEqual(xs, [slot(2), slot(3), slot(4), fermat.x])
  xs.slice(0, 3).forEach(offColumns)
  assert.ok(xs[2] - xs[3] >= PATH_MAP_COLUMN_WIDTH / 2)
  for (const n of [1, 2, 3, 4]) assert.equal(node(layout, 'LessOrEqualBonus', n).y, boss.y + PATH_MAP_ROW_HEIGHT)
  const lastBonus = node(layout, 'LessOrEqualBonus', 4)
  assert.ok(fermat.y > lastBonus.y)
  const drop = [
    ...segment(layout, 'edge:LessOrEqualBonus:PowerBonus:out').points,
    ...segment(layout, 'edge:LessOrEqualBonus:PowerBonus:in').points.slice(1),
  ]
  assert.deepEqual(drop[0], { x: lastBonus.x, y: lastBonus.y })
  assert.deepEqual(drop.at(-1), { x: fermat.x, y: fermat.y })
  assert.ok(drop.every(point => point.x === fermat.x))
  assert.deepEqual(layout.segments.filter(s => s.bridge).map(s => s.key),
    [`level:LessOrEqualBonus:3:bridge:${-PATH_MAP_COLUMN_WIDTH}`])
  // A level that lies more than a column past the end of the row leaves the row where
  // it is: the path to it carries the row on, out of its last level, along to above the
  // level, and down onto it, over the path that comes down the column in between.
  const shortRow = computePathMapLayout(
    { ...nnvg10, worldSize: { ...nnvg10.worldSize, LessOrEqualBonus: 3 } }, { defaultColor: 'grey' })
  assertNoPathOverLevels(shortRow)
  assert.deepEqual([1, 2, 3].map(n => node(shortRow, 'LessOrEqualBonus', n).x), [1, 2, 3].map(slot))
  const shortLast = node(shortRow, 'LessOrEqualBonus', 3)
  assert.deepEqual(segment(shortRow, 'edge:LessOrEqualBonus:PowerBonus:out').points[0], { x: shortLast.x, y: shortLast.y })
  assert.deepEqual(segment(shortRow, 'edge:LessOrEqualBonus:PowerBonus:in').points.slice(1), [
    { x: fermat.x, y: shortLast.y }, { x: fermat.x, y: fermat.y },
  ])
  assert.deepEqual(shortRow.segments.filter(s => s.bridge).map(s => s.key),
    [`edge:LessOrEqualBonus:PowerBonus:in:bridge:${-PATH_MAP_COLUMN_WIDTH}`])
  // From a main world such a path turns away below that world's own bonus row.
  const crossY = boss.y + 1.5 * PATH_MAP_ROW_HEIGHT
  assert.deepEqual(segment(fromBoss, 'edge:LessOrEqualBoss:PowerBonus:in').points.slice(1), [
    { x: boss.x, y: crossY }, { x: fermat.x, y: crossY }, { x: fermat.x, y: fermat.y },
  ])
  // A bonus row sent outwards is where it always was.
  const [anchor, rewriteBonus] = [node(layout, 'Rewrite', 3), node(layout, 'RewriteBonus', 1)]
  assert.ok(rewriteBonus.x < anchor.x)
})
