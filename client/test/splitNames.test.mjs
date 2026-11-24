import test from 'node:test'
import assert from 'node:assert/strict'

const { splitNames } = await import('../../tmp-path-map-tests/visual/splitNames.js')

test('without numbered splits the names are NNG4\'s, whatever is split', () => {
  assert.deepEqual(splitNames(['n'], 'n', false), { predecessorName: 'd', inductionHypName: 'hd' })
  assert.deepEqual(splitNames(['a', 'd', 'hd'], 'a', false), { predecessorName: 'd2', inductionHypName: 'hd2' })
})

test('a numbered split counts on from the variable\'s own name', () => {
  assert.deepEqual(splitNames(['a', 'b'], 'a', true), { predecessorName: 'a1', inductionHypName: 'ha1' })
  assert.deepEqual(splitNames(['a1', 'ha1', 'b'], 'a1', true), { predecessorName: 'a2', inductionHypName: 'ha2' })
  assert.deepEqual(splitNames(['x12'], 'x12', true), { predecessorName: 'x13', inductionHypName: 'hx13' })
})

test('a numbered split skips the names already in use', () => {
  // `c1` and `c2` came out of two `≤` hypotheses; splitting `c1` can't give `c2` again.
  assert.equal(splitNames(['c1', 'c2'], 'c1', true).predecessorName, 'c3')
  assert.equal(splitNames(['a', 'a1'], 'a', true).predecessorName, 'a2')
  assert.equal(splitNames(['a', 'ha1'], 'a', true).predecessorName, 'a2')
})

test('a name that is only a number is counted on from as a whole', () => {
  assert.equal(splitNames(['7'], '7', true).predecessorName, '71')
})
