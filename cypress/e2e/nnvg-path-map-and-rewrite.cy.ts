// The Natural Numbers Video Game (Lean4Game/NNVG) against the native dev relay:
// the path-style world map, the opening text level, Rewrite-only levels played with
// rule-card clicks and the check mark, Proposition World on the canvas, the one
// scheme and each world's page, large windows, and what's painted frame by frame.
const base = Cypress.env('LEAN4GAME_MOUNT') ?? ''
const MAP = `${base}/g/local/NNVG/visual`
const level = (world: string, n: number) => `${base}/g/local/NNVG/world/${world}/level/${n}/visual`
const LOAD_TIMEOUT = Number(Cypress.env('VISUAL_TIMEOUT') ?? 180000)

type HarnessWindow = Cypress.AUTWindow & {
  __visualTestHarness?: {
    rewriteGoalInTransform(theoremName: string, workingSide?: 'left' | 'right', path?: number[], isReverse?: boolean): Promise<void>
    runPlayerTactic(tactic: string): Promise<unknown>
    dragHypToGoal(hypName: string): Promise<void>
    dragHypToHyp(sourceName: string, targetName: string): Promise<void>
    dragTheoremToGoal(theoremName: string): Promise<void>
    dragTheoremToHyp(theoremName: string, hypName: string): Promise<void>
    dragTacticToHyp(tacticName: string, hypName: string): Promise<void>
    clickGoal(playTactic?: string): Promise<void>
    clickHyp(hypName: string): Promise<void>
    getCurrentStreamSnapshot(): { goalType: string }
    getProofAudit(): { completed: boolean; processing: boolean }
    openHypTransform(hypName: string): void
    openGoalTransform(): void
  }
}

/** What the player sees in one animation frame. */
interface PaintedFrame {
  theme: string | null
  header: boolean
  loading: boolean
  canvas: boolean
  overlay: boolean
  expression: boolean
  rules: boolean
  map: boolean
  firstLabel: string | null
  bossDrawn: boolean
}

type FrameWindow = Cypress.AUTWindow & { __frames: PaintedFrame[] }

function isShown(win: Window, element: Element | null) {
  if (!element) return false
  const box = element.getBoundingClientRect()
  return box.width > 0 && box.height > 0 && win.getComputedStyle(element).visibility !== 'hidden'
}

function recordFrames(win: Cypress.AUTWindow) {
  const frames: PaintedFrame[] = []
  ;(win as FrameWindow).__frames = frames
  const tick = () => {
    const doc = win.document
    frames.push({
      theme: doc.querySelector('.app')?.getAttribute('data-visual-theme') ?? null,
      header: isShown(win, doc.querySelector('.visual-header')),
      loading: !!doc.querySelector('.visual-loading'),
      canvas: isShown(win, doc.querySelector('[data-testid="goal-card"]')),
      overlay: !!doc.querySelector('.tr-transformation-overlay'),
      expression: isShown(win, doc.querySelector('.tr-expr-wrapper')),
      rules: isShown(win, doc.querySelector('.tr-rule-card')),
      map: !!doc.querySelector('[data-testid="visual-path-map"]'),
      firstLabel: doc.querySelector('[data-world="Intro"] .path-map-level-label')?.textContent ?? null,
      bossDrawn: !!doc.querySelector('[data-world="Rewrite"][data-level="6"][data-boss="true"]'),
    })
    win.requestAnimationFrame(tick)
  }
  win.requestAnimationFrame(tick)
}

/** Check the frames recorded since the last `clearFrames`. Animation frames can be rare
 * once a page is idle, so each check needs something a frame has to show, and this retries
 * until it does. A frame that breaks a check stays recorded, so that still fails. */
function framesShould(check: (frames: PaintedFrame[]) => void) {
  cy.window({ timeout: 30000 }).should(win => check((win as FrameWindow).__frames))
}

function clearFrames() {
  cy.window().then(win => { (win as FrameWindow).__frames.length = 0 })
}

/** `screens`: with the screens before and after the levels, which the tests of the
 * levels themselves play without. */
function visit(url: string, options: { fresh?: boolean, record?: boolean, screens?: boolean } = {}) {
  cy.visit(url, {
    onBeforeLoad(win) {
      if (options.fresh) win.localStorage.clear()
      win.localStorage.setItem('telemetryConsent', 'refused')
      if (!options.screens) win.localStorage.setItem('visual_interstitials', 'off')
      if (options.record) recordFrames(win)
    },
  })
}

/** Open the map, or `url`, with every level of these worlds (name to size) finished. */
function visitWithProgress(worlds: Record<string, number>, url = MAP) {
  const data = Object.fromEntries(Object.entries(worlds).map(([world, size]) => [world, Object.fromEntries(
    Array.from({ length: size }, (_, index) => [index + 1, { code: '', selections: [], completed: true, help: [] }]),
  )]))
  cy.visit(url, {
    onBeforeLoad(win) {
      win.localStorage.clear()
      win.localStorage.setItem('telemetryConsent', 'refused')
      win.localStorage.setItem('game_progress', JSON.stringify({
        games: { 'g/local/nnvg': { inventory: [], difficulty: 2, readIntro: true, data } },
      }))
    },
  })
}

function mapLevel(world: string, n: number) {
  return cy.get(`[data-testid="path-map-level"][data-world="${world}"][data-level="${n}"]`, { timeout: LOAD_TIMEOUT })
}

function relationText($row: JQuery<HTMLElement>) {
  return $row.children('[data-expr-text]').toArray().map(side => side.getAttribute('data-expr-text')).join(' = ')
}

/** The relation shown in Rewrite Mode, as its two sides print. */
function relationShouldBe(text: string) {
  cy.get('.tr-expr-wrapper', { timeout: LOAD_TIMEOUT }).should($row => {
    expect(relationText($row)).to.equal(text)
  })
}

function lessonsShouldContain(text: string) {
  cy.get('[data-testid="rewrite-lessons"]', { timeout: LOAD_TIMEOUT }).should('contain.text', text)
}

/** A hint is on the page. (Hints let clicks through, so Cypress counts them as
 * covered by whatever is under them; their text is what matters here.) */
function hintShouldContain(text: string) {
  cy.contains(text, { timeout: LOAD_TIMEOUT }).should('exist')
}

/** Click the rule card labelled `label`, rewriting with the direction button set to
 * `reverse`, as a player does. */
function clickRuleInDirection(label: string, reverse: boolean) {
  notProcessing()
  cy.get('.tr-direction-btn').then($button => {
    if ($button.hasClass('active-reverse') !== reverse) cy.wrap($button).click()
  })
  clickRule(label)
}

/** The tip of an instruction arrow stops short of `target`, rather than running into it. */
function arrowStopsShortOf(arrow: string, target: string) {
  cy.get(`${arrow} polygon`, { timeout: LOAD_TIMEOUT }).should($polygon => {
    const [x, y] = $polygon.attr('points')!.split(' ')[0]!.split(',').map(Number)
    const box = Cypress.$(target)[0]!.getBoundingClientRect()
    const inside = x! > box.left && x! < box.right && y! > box.top && y! < box.bottom
    expect(inside, `arrow tip (${x}, ${y}) inside ${target}`).to.equal(false)
    const distance = Math.max(box.left - x!, x! - box.right, box.top - y!, y! - box.bottom)
    expect(distance, 'gap between the arrow tip and its target').to.be.within(2, 30)
  })
}

function notProcessing() {
  cy.window({ timeout: LOAD_TIMEOUT }).should(win => {
    const harness = (win as HarnessWindow).__visualTestHarness
    expect(harness, 'visual test harness').to.exist
    expect(harness!.getProofAudit().processing).to.equal(false)
  })
}

/** Bring up the tab of Rewrite Mode's lower menu that has the rule labelled `label`:
 * the game has no tab that lists everything (`VisualNoAllTab`), so a rule is on the
 * Hypotheses tab or on the tab its theorem is filed under. */
function showRule(label: string, tab = 0) {
  cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
  cy.get('body').then($body => {
    if ($body.find(`.tr-rule-card[data-rule-label="${label}"]`).filter(':visible').length > 0) return
    const tabs = $body.find('.tr-transformation-overlay .tr-dock-tabs .tr-tab-btn')
    if (tab >= tabs.length) return
    cy.wrap(tabs[tab]!).click()
    showRule(label, tab + 1)
  })
}

function clickRule(label: string) {
  notProcessing()
  showRule(label)
  cy.get(`.tr-rule-card[data-rule-label="${label}"]`, { timeout: LOAD_TIMEOUT }).filter(':visible').first().click()
}

/** Click a brick of the specialization view, on the tab it is on: variables, numbers
 * (and `False`), or functions and connectives. */
function clickBrick(id: string) {
  const tab = id.startsWith('var_') ? 'variables' : id.startsWith('fn_') ? 'functions' : 'numbers'
  cy.get(`.tr-construction-overlay .tr-tab-btn[data-tab="${tab}"]`, { timeout: LOAD_TIMEOUT }).click()
  cy.get(`[data-brick-id="${id}"]`).click()
}

function check() {
  notProcessing()
  cy.get('[data-testid="rewrite-check"]', { timeout: LOAD_TIMEOUT }).should('be.visible').click()
  cy.get('[data-testid="rewrite-check"]', { timeout: LOAD_TIMEOUT }).should('have.class', 'completed')
}

/** The check mark on a goal of a level with a canvas: it closes the goal and takes the
 * player back to Proposition Mode. */
function checkBackToCanvas() {
  notProcessing()
  cy.get('[data-testid="rewrite-check"]', { timeout: LOAD_TIMEOUT }).should('be.visible').click()
  cy.get('.tr-transformation-overlay', { timeout: LOAD_TIMEOUT }).should('not.exist')
}

function openRewriteLevel(n: number, world = 'Rewrite') {
  visit(level(world, n))
  expectRewriteOnlyLevel()
}

/** Rewrite with a rule at `path` on one side, as dragging it onto that term does. */
function rewrite(rule: string, side: 'left' | 'right', path: number[] = [], isReverse = false) {
  notProcessing()
  let before = ''
  cy.get('.tr-expr-wrapper', { timeout: LOAD_TIMEOUT }).then($row => { before = relationText($row) })
  cy.window().then(win => (win as HarnessWindow).__visualTestHarness!.rewriteGoalInTransform(rule, side, path, isReverse))
  // The next move has to see this one's result.
  cy.get('.tr-expr-wrapper', { timeout: LOAD_TIMEOUT }).should($row => {
    expect(relationText($row)).not.to.equal(before)
  })
}

function harness<T>(run: (harness: NonNullable<HarnessWindow['__visualTestHarness']>) => T) {
  notProcessing()
  cy.window().then(win => run((win as HarnessWindow).__visualTestHarness!))
}

function goalShouldBe(text: string) {
  cy.window({ timeout: LOAD_TIMEOUT }).should(win => {
    const current = (win as HarnessWindow).__visualTestHarness!
    expect(current.getProofAudit().processing).to.equal(false)
    expect(current.getCurrentStreamSnapshot().goalType).to.equal(text)
  })
}

function goalHintShouldContain(text: string) {
  cy.contains(text, { timeout: LOAD_TIMEOUT }).should('be.visible')
}

function shouldBeCompleted() {
  cy.window({ timeout: LOAD_TIMEOUT }).should(win => {
    expect((win as HarnessWindow).__visualTestHarness!.getProofAudit().completed).to.equal(true)
  })
}

/** Drag with the pointer, as a player does, from one element onto another. The
 * events come from the app's own window, with time for React to commit between
 * them, as in the playthrough driver. */
function dragWithPointer(source: string, target: string) {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  cy.get(source, { timeout: LOAD_TIMEOUT }).should('be.visible')
  cy.get(target, { timeout: LOAD_TIMEOUT }).should('be.visible')
  cy.window().then(async win => {
    const sourceRect = win.document.querySelector(source)!.getBoundingClientRect()
    const targetRect = win.document.querySelector(target)!.getBoundingClientRect()
    const startX = sourceRect.left + sourceRect.width / 2
    const startY = sourceRect.top + sourceRect.height / 2
    const endX = targetRect.left + targetRect.width / 2
    const endY = targetRect.top + targetRect.height / 2
    const Pointer = (win as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent
    const event = (type: string, clientX: number, clientY: number, buttons: number) => new Pointer(type, {
      bubbles: true, cancelable: true, pointerId: 91, pointerType: 'mouse', isPrimary: true, button: 0, buttons, clientX, clientY,
    })
    win.document.querySelector(source)!.dispatchEvent(event('pointerdown', startX, startY, 1))
    win.document.body.dispatchEvent(event('pointermove', startX + 12, startY + 12, 1))
    await sleep(100)
    win.document.body.dispatchEvent(event('pointermove', endX, endY, 1))
    await sleep(200)
    win.document.body.dispatchEvent(event('pointermove', endX + 1, endY + 1, 1))
    await sleep(200)
    win.document.body.dispatchEvent(event('pointerup', endX + 1, endY + 1, 0))
  })
}

function expectRewriteOnlyLevel() {
  // Rewrite-only: the level opens in Rewrite Mode with no way back.
  cy.get('.tr-transformation-overlay', { timeout: LOAD_TIMEOUT }).should('be.visible')
  cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
  cy.get('.tr-back-btn').should('not.exist')
}

/** Move to the unsolved proof branch with the arrow buttons. */
function nextUnsolvedBranch() {
  notProcessing()
  cy.get('[data-testid^="stream-nav-"].toward-incomplete:not(:disabled)', { timeout: LOAD_TIMEOUT })
    .filter(':visible').first().click()
}

function openCanvasLevel(world: string, n: number) {
  visit(level(world, n))
  cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
}

/** Whether the theorem tray has the card labelled `label`. The tray renders one page
 * of one tab at a time, and the game has no tab for everything (`VisualNoAllTab`), so
 * this goes through the tabs, and through each from its first page. It stops on the page
 * that has the card. */
function trayShouldHaveCard(label: string, expected: boolean) {
  const card = `[data-testid="theorem-tray-card"][data-theorem-label="${label}"]`
  const indicator = '.theorem-tray-panel .tr-page-indicator'
  const tabs = '[data-testid="theorem-category-tabs"] .tr-tab-btn'
  // Turn the page, and wait until the tray shows the new one.
  const turn = ($button: JQuery<HTMLElement>, $tray: JQuery<HTMLElement>) => {
    const before = $tray.find('.tr-page-indicator').text()
    cy.wrap($button.first()).click()
    cy.get(indicator).should('not.have.text', before)
  }
  const look = (remainingPages: number, done: (found: boolean) => void): void => {
    cy.get('.theorem-tray-panel', { timeout: LOAD_TIMEOUT }).then($tray => {
      if ($tray.find(card).length > 0) {
        done(true)
        return
      }
      const $next = $tray.find('.tr-nav-btn[aria-label="Next"]')
      if ($next.length === 0 || $next.is(':disabled') || remainingPages <= 0) {
        done(false)
        return
      }
      turn($next, $tray)
      look(remainingPages - 1, done)
    })
  }
  const rewind = (remainingPages: number): void => {
    cy.get('.theorem-tray-panel', { timeout: LOAD_TIMEOUT }).then($tray => {
      const $previous = $tray.find('.tr-nav-btn[aria-label="Previous"]')
      if ($previous.length === 0 || $previous.is(':disabled') || remainingPages <= 0) return
      turn($previous, $tray)
      rewind(remainingPages - 1)
    })
  }
  const lookInTab = (tab: number): void => {
    cy.get('.theorem-tray-panel', { timeout: LOAD_TIMEOUT }).then($tray => {
      const $tabs = $tray.find(tabs)
      if ($tabs.length > 0) cy.wrap($tabs[tab]!).click()
      rewind(40)
      look(40, found => {
        if (found) expect(expected, `theorem card ${label}`).to.equal(true)
        else if (tab + 1 < $tabs.length) lookInTab(tab + 1)
        else expect(expected, `theorem card ${label}`).to.equal(false)
      })
    })
  }
  lookInTab(0)
}

function headerShouldNameLevel(number: string, title: string) {
  cy.get('.visual-header-level', { timeout: LOAD_TIMEOUT }).filter(':visible').first().should('contain.text', `- ${number}`)
  cy.get('.visual-header-title', { timeout: LOAD_TIMEOUT }).filter(':visible').first().should('contain.text', title)
}

/** Drag the card of this type onto the card of that type, with the pointer. */
function dragCard(sourceType: string, targetType: string) {
  notProcessing()
  dragWithPointer(`[data-testid="hyp-card"][data-hyp-type="${sourceType}"]`, `[data-testid="hyp-card"][data-hyp-type="${targetType}"]`)
}

function dragCardToGoal(sourceType: string) {
  notProcessing()
  dragWithPointer(`[data-testid="hyp-card"][data-hyp-type="${sourceType}"]`, '[data-testid="goal-card"]')
}

function clickGoal(playTactic?: string) {
  harness(h => h.clickGoal(playTactic))
}

function clickHyp(name: string) {
  harness(h => h.clickHyp(name))
}

function dragToGoal(name: string) {
  harness(h => h.dragHypToGoal(name))
}

function hypShouldExist(name: string) {
  notProcessing()
  cy.get(`[data-testid="hyp-card"][data-hyp-name="${name}"]`, { timeout: LOAD_TIMEOUT }).should('exist')
}

describe('Natural Numbers Video Game', () => {
  beforeEach(() => {
    cy.intercept({ url: /\/v[12]\/(events|feedback)/u }, { statusCode: 204 })
  })

  it('opens on a path map where only the welcome text can be played', () => {
    visit(MAP, { fresh: true })
    mapLevel('Intro', 1).should('be.visible')
    // The opening is centred on the map, however lopsided the map is further down.
    cy.get('[data-testid="visual-world-map"]').then($scroller => {
      const scroller = $scroller[0]!.getBoundingClientRect()
      mapLevel('Intro', 1).find('circle').then($circle => {
        const circle = $circle[0]!.getBoundingClientRect()
        expect(circle.left + circle.width / 2).to.be.closeTo(scroller.left + scroller.width / 2, 8)
      })
    })
    // A world's title is grey until one of its levels can be played.
    const titleOf = (text: string) => cy.contains('[data-testid="path-map-world-label"]', text)
    // The grey of what can't be used yet (`--pal-inactive` in the neutral palette).
    const lockedTitle = 'rgb(141, 151, 159)'
    titleOf('Rewrite World').should('have.attr', 'data-unlocked', 'false').and('have.css', 'fill', lockedTitle)
    titleOf('Proposition World').should('have.attr', 'data-unlocked', 'false').and('have.css', 'fill', lockedTitle)
    titleOf('Successor World').should('have.attr', 'data-unlocked', 'false').and('have.css', 'fill', lockedTitle)
    cy.get('[data-testid="path-map-world-label"]').then($labels => {
      // A long title is on two lines, so it is read from its attribute.
      expect([...$labels].map(label => label.getAttribute('data-title'))).to.have.members([
        'Rewrite World',
        'Proposition World',
        'Successor World',
        'Induction World',
        '≠ World',
        'Multiplication and Exponentiation World',
        'Logic World',
        '≤ World',
        'Advanced Multiplication World',
      ])
    })
    mapLevel('Intro', 1).should('have.attr', 'data-state', 'frontier').and('have.attr', 'data-text-level', 'true')
    mapLevel('Rewrite', 1).should('have.attr', 'data-state', 'locked')
    mapLevel('Proposition', 1).should('have.attr', 'data-state', 'locked')
    mapLevel('RewriteBonus', 1).should('have.attr', 'data-state', 'locked')
    cy.get('[data-segment="edge:Intro:Rewrite:in"]').should('have.attr', 'data-lit', 'false')

    // A text level opens over the map; closing it completes the level.
    mapLevel('Intro', 1).click()
    cy.get('[data-testid="text-level-dialog"]').should('contain.text', 'Welcome to the Natural Numbers Video Game!')
    cy.get('[data-testid="text-level-dialog"] em').should('have.text', 'is')
    cy.location('pathname').should('match', /\/g\/local\/NNVG\/visual$/u)
    cy.contains('button', 'Continue').click()
    cy.get('[data-testid="text-level-dialog"]').should('not.exist')
    mapLevel('Intro', 1).should('have.attr', 'data-state', 'completed')
    mapLevel('Rewrite', 1).should('have.attr', 'data-state', 'frontier')
    mapLevel('Proposition', 1).should('have.attr', 'data-state', 'frontier')
    mapLevel('Rewrite', 2).should('have.attr', 'data-state', 'locked')
    cy.get('[data-segment="edge:Intro:Rewrite:in"]').should('have.attr', 'data-lit', 'true')
    cy.get('[data-segment="edge:Intro:Proposition:in"]').should('have.attr', 'data-lit', 'true')
    titleOf('Rewrite World').should('have.attr', 'data-unlocked', 'true').and('not.have.css', 'fill', lockedTitle)
    titleOf('Proposition World').should('have.attr', 'data-unlocked', 'true').and('not.have.css', 'fill', lockedTitle)
    titleOf('Successor World').should('have.attr', 'data-unlocked', 'false').and('have.css', 'fill', lockedTitle)
  })

  it('draws the larger structure: forks, joins, bonus rows and boss levels', () => {
    visit(MAP, { fresh: true })
    mapLevel('Intro', 1).should('be.visible')
    // Boss levels are drawn larger, once the level data has loaded.
    mapLevel('Rewrite', 6).should('have.attr', 'data-boss', 'true')
    mapLevel('Successor', 3).should('have.attr', 'data-boss', 'true')
    mapLevel('SuccessorJoined', 3).should('have.attr', 'data-boss', 'true')
    mapLevel('PropositionRight', 8).should('have.attr', 'data-boss', 'true')
    mapLevel('NeqJoined', 1).should('have.attr', 'data-boss', 'true')
    // Multiplication and Exponentiation World: a miniboss at its level 6, before the
    // levels about powers begin, and its boss at the end.
    mapLevel('Multiplication', 7).should('have.attr', 'data-boss', 'true')
    mapLevel('Multiplication', 8).should('not.exist')
    mapLevel('Power', 9).should('have.attr', 'data-boss', 'true')
    mapLevel('PowerBonus', 1).should('have.attr', 'data-boss', 'true')
    mapLevel('PowerBonusA', 2).should('not.have.attr', 'data-boss')
    mapLevel('PowerBonusA', 3).should('not.exist')
    // Induction World has a miniboss past the ≠ World, and its boss at the end.
    mapLevel('InductionJoined', 2).should('not.have.attr', 'data-boss')
    mapLevel('InductionJoined', 4).should('have.attr', 'data-boss', 'true')
    mapLevel('InductionDouble', 2).should('have.attr', 'data-boss', 'true')
    mapLevel('InductionDouble', 3).should('not.exist')
    mapLevel('LessOrEqualBoss', 1).should('have.attr', 'data-boss', 'true')
    mapLevel('AdvMultiplication', 5).should('have.attr', 'data-boss', 'true')
    mapLevel('AdvMultiplication', 10).should('have.attr', 'data-boss', 'true')
    mapLevel('Rewrite', 5).should('not.have.attr', 'data-boss')
    mapLevel('Rewrite', 5).find('circle').then($small => {
      mapLevel('Rewrite', 6).find('circle').then($boss => {
        expect(Number($boss.attr('r'))).to.be.greaterThan(Number($small.attr('r')))
      })
    })
    // Rewrite World leads to Successor World; Proposition World forks into it too.
    // Successor World forks into Induction World and the ≠ World, which all of
    // Proposition World joins. Induction World's first part rejoins the ≠ World for its
    // boss, which Induction World then waits for in turn, and ≤ World for both.
    for (const segment of [
      'edge:Rewrite:Successor:in',
      'edge:Successor:SuccessorJoined:in',
      'edge:Proposition:SuccessorJoined:in',
      'edge:Proposition:PropositionRight:in',
      'edge:SuccessorJoined:Induction:in',
      'edge:SuccessorJoined:Neq:in',
      'edge:PropositionRight:Neq:in',
      'edge:Neq:NeqJoined:in',
      'edge:Induction:NeqJoined:in',
      'edge:Induction:Multiplication:in',
      'edge:Multiplication:Power:in',
      // Induction World carries on down its column: the game lists no edge for that,
      // since the way round by the ≠ World's boss implies it.
      'edge:Induction:InductionJoined:in',
      'edge:NeqJoined:InductionJoined:in',
      'edge:InductionJoined:InductionDouble:in',
      // ≤ World follows the ≠ World, and waits for all of Induction World at its level 6.
      'edge:NeqJoined:LessOrEqual:in',
      'edge:LessOrEqual:LessOrEqualJoined:in',
      'edge:InductionDouble:LessOrEqualJoined:in',
      'edge:LessOrEqualJoined:LessOrEqualBoss:in',
      'edge:LessOrEqualBoss:AdvMultiplication:in',
      'edge:Multiplication:AdvMultiplication:in',
      // Logic World follows two bonus branches and the ≠ World.
      'edge:PropositionBonusB:Logic:in',
      'edge:PropositionBonusC:Logic:in',
      'edge:NeqJoined:Logic:in',
      // The End is joined by the final bosses of two worlds.
      'edge:Power:Outro:in',
      'edge:AdvMultiplication:Outro:in',
      'bonus:Power:9:PowerBonus',
      // The level before it has two bonus levels of its own.
      'bonus:Power:8:PowerBonusA',
      // ≤ World's boss has a row of bonus levels.
      'bonus:LessOrEqualBoss:1:LessOrEqualBonus',
      // Two bonuses leave Rewrite World's level 2, neither needing the other.
      'bonus:Rewrite:3:RewriteBonus',
      'bonus:Rewrite:3:RewriteBonusB',
      'bonus:PropositionRight:2:PropositionBonus',
      // And two leave Proposition World's boss.
      'bonus:PropositionRight:8:PropositionBonusB',
      'bonus:PropositionRight:8:PropositionBonusC',
    ]) {
      cy.get(`[data-segment="${segment}"]`).should('exist')
    }
    cy.get('[data-segment="edge:Power:AdvMultiplication:in"]').should('not.exist')
    cy.get('[data-segment="edge:NeqJoined:Outro:in"]').should('not.exist')
    // Logic World leads nowhere, and nothing waits for Induction World's level 7 alone.
    cy.get('[data-segment="edge:Logic:Outro:in"]').should('not.exist')
    cy.get('[data-segment="edge:InductionJoined:LessOrEqualJoined:in"]').should('not.exist')
    // Multiplication and Exponentiation World's path to Advanced Multiplication World
    // runs down Induction World's column, below that world's last level. The row of
    // ≤ World's bonus levels crosses it, with a bridge, on the way to its last level,
    // which is right above the bonus boss about Fermat. Higher up, Induction World's
    // path to ≤ World's level 7 crosses it too.
    cy.get('[data-testid="path-map-bridge"]').should('have.length', 2)
    cy.get('[data-segment="edge:LessOrEqualBonus:PowerBonus:in"]').should('exist')
    cy.get('[data-segment="edge:LessOrEqualBoss:PowerBonus:in"]').should('not.exist')
    // The bonus levels off level 14 wait for all of the ≠ World too, and ask for no path
    // from there (`VisualNoPathFrom`): it would cross the whole map.
    cy.get('[data-segment="edge:Neq:PowerBonusA:in"]').should('not.exist')
    cy.get('[data-segment="edge:NeqJoined:PowerBonusA:in"]').should('not.exist')
    // Successor World has no bonus levels.
    cy.get('[data-segment^="bonus:Successor"]').should('not.exist')
    // Numbering restarts per stream, and bonuses are numbered as in the spec.
    mapLevel('RewriteBonus', 1).should('contain.text', 'A0')
    mapLevel('RewriteBonus', 2).should('contain.text', 'A1')
    mapLevel('RewriteBonusB', 1).should('contain.text', 'B0')
    // The path's next levels are listed beside the branches, one row each.
    const top = (world: string, n: number) =>
      Cypress.$(`[data-testid="path-map-level"][data-world="${world}"][data-level="${n}"]`)[0]!.getBoundingClientRect().top
    cy.wrap(null).should(() => {
      expect(Math.abs(top('Rewrite', 4) - top('RewriteBonus', 1)), 'level 3 beside A').to.be.lessThan(2)
      expect(Math.abs(top('Rewrite', 5) - top('RewriteBonusB', 1)), 'level 4 beside B').to.be.lessThan(2)
      expect(Math.abs(top('PropositionRight', 3) - top('PropositionBonus', 1)), 'level 10 beside A').to.be.lessThan(2)
    })
    // Both branch off to the same side, one row below the other.
    mapLevel('RewriteBonus', 1).then($a => {
      mapLevel('RewriteBonusB', 1).then($b => {
        const [a, b] = [$a[0]!.getBoundingClientRect(), $b[0]!.getBoundingClientRect()]
        expect(Math.abs(a.left - b.left), 'same column').to.be.lessThan(2)
        expect(b.top, 'B below A').to.be.greaterThan(a.bottom)
      })
    })
    // They leave the main path once, down a stem beside it, and fan out from the stem:
    // only A's path starts at the level, and B's carries the stem on.
    const startX = (segment: string) =>
      Number(/^M\s*(-?[\d.]+)/u.exec(Cypress.$(`[data-segment="${segment}"]`).attr('d')!)![1])
    for (const [world, n, first, second] of [
      ['Rewrite', 3, 'RewriteBonus', 'RewriteBonusB'],
      // Both of these lead on to Logic World, and the longer one, B, is listed first.
      ['PropositionRight', 8, 'PropositionBonusB', 'PropositionBonusC'],
    ] as const) {
      mapLevel(world, n).find('circle').then($anchor => {
        const anchorX = Number($anchor.attr('cx'))
        expect(startX(`bonus:${world}:${n}:${first}`), `${first} leaves the level`).to.equal(anchorX)
        expect(Math.abs(startX(`bonus:${world}:${n}:${second}`) - anchorX), `${second} leaves the stem`).to.be.greaterThan(22)
      })
    }
    // A lone branch with a level beside it leaves its level sideways too, by a
    // stem that is clear of that level.
    mapLevel('PropositionRight', 2).find('circle').then($anchor => {
      const d = Cypress.$('[data-segment="bonus:PropositionRight:2:PropositionBonus"]').attr('d')!
      const [, x0, y0, x1, y1] = /^M\s*(-?[\d.]+)\s+(-?[\d.]+)\s+L\s*(-?[\d.]+)\s+(-?[\d.]+)/u.exec(d)!.map(Number)
      expect(x0, 'starts at the level').to.equal(Number($anchor.attr('cx')))
      expect(y1, 'and leaves it level').to.equal(y0)
      expect(x1, 'to the side').not.to.equal(x0)
    })
    mapLevel('PropositionBonusB', 1).should('contain.text', 'B0')
    mapLevel('PropositionBonusB', 3).should('contain.text', 'B2')
    mapLevel('PropositionBonusC', 1).should('contain.text', 'C0')
    mapLevel('Proposition', 7).should('contain.text', '6')
    mapLevel('Proposition', 8).should('contain.text', '7')
    mapLevel('PropositionRight', 1).should('contain.text', '8')
    mapLevel('PropositionRight', 7).should('contain.text', '14')
    mapLevel('PropositionRight', 8).should('contain.text', '15')
    mapLevel('PropositionBonus', 1).should('contain.text', 'A0')
    // The LEM branch is C0 alone.
    mapLevel('PropositionBonusC', 2).should('not.exist')
    // Successor World counts from zero too, across its barrier.
    mapLevel('Successor', 1).should('contain.text', '0')
    mapLevel('SuccessorJoined', 1).should('contain.text', '3')
    mapLevel('SuccessorJoined', 3).should('contain.text', '5')
    mapLevel('Neq', 1).should('contain.text', '0')
    mapLevel('Neq', 9).should('contain.text', '8')
    mapLevel('NeqJoined', 1).should('contain.text', '9')
    // Induction World, Multiplication and Exponentiation World, ≤ World and Advanced
    // Multiplication World count from zero, across the Lean worlds they are split into.
    mapLevel('Induction', 1).should('contain.text', '0')
    mapLevel('Induction', 4).should('contain.text', '3')
    mapLevel('InductionJoined', 1).should('contain.text', '4')
    mapLevel('InductionDouble', 2).should('contain.text', '9')
    mapLevel('Multiplication', 1).should('contain.text', '0')
    mapLevel('Multiplication', 7).should('contain.text', '6')
    mapLevel('Power', 1).should('contain.text', '7')
    mapLevel('Power', 9).should('contain.text', '15')
    mapLevel('LessOrEqual', 1).should('contain.text', '0')
    mapLevel('LessOrEqual', 7).should('contain.text', '6')
    mapLevel('LessOrEqualJoined', 1).should('contain.text', '7')
    mapLevel('AdvMultiplication', 1).should('contain.text', '0')
    mapLevel('AdvMultiplication', 10).should('contain.text', '9')
    mapLevel('LessOrEqualBoss', 1).should('contain.text', '11')
    mapLevel('Logic', 1).should('contain.text', 'A0')
    mapLevel('PowerBonusA', 1).should('contain.text', 'A0')
    mapLevel('PowerBonusA', 2).should('contain.text', 'A1')
    mapLevel('PowerBonus', 1).should('contain.text', 'B0')
    mapLevel('LessOrEqualBonus', 1).should('contain.text', 'A0')
    mapLevel('LessOrEqualBonus', 5).should('contain.text', 'A4')
    mapLevel('Outro', 1).should('have.attr', 'data-text-level', 'true')
    // The barrier: nothing leads past Successor World's boss yet.
    mapLevel('SuccessorJoined', 1).should('have.attr', 'data-state', 'locked')
  })

  it('lays out the later worlds with ≤ World to the right and The End at the bottom', () => {
    visit(MAP, { fresh: true })
    mapLevel('Outro', 1).should('exist')
    const centre = (world: string, n: number) => {
      const box = Cypress.$(`[data-testid="path-map-level"][data-world="${world}"][data-level="${n}"] circle`)[0]!
        .getBoundingClientRect()
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    }
    cy.get('[data-testid="path-map-level"]').should('have.length', 105).then($levels => {
      // ≤ World carries on below the ≠ World's boss on the right, in three stretches,
      // and Advanced Multiplication World below it.
      expect(centre('LessOrEqual', 1).x).to.be.closeTo(centre('NeqJoined', 1).x, 1)
      expect(centre('LessOrEqual', 1).y).to.be.greaterThan(centre('NeqJoined', 1).y)
      expect(centre('LessOrEqualJoined', 1).x).to.be.closeTo(centre('LessOrEqual', 7).x, 1)
      expect(centre('LessOrEqualBoss', 1).x).to.be.closeTo(centre('LessOrEqual', 7).x, 1)
      expect(centre('AdvMultiplication', 1).x).to.be.closeTo(centre('LessOrEqualBoss', 1).x, 1)
      expect(centre('AdvMultiplication', 1).y).to.be.greaterThan(centre('LessOrEqualBoss', 1).y)
      // Induction World carries on down its own column, below the ≠ World's boss, and
      // its last level is above ≤ World's level 6, which waits for it.
      expect(centre('InductionJoined', 1).x).to.be.closeTo(centre('Induction', 4).x, 1)
      expect(centre('InductionJoined', 1).y).to.be.greaterThan(centre('NeqJoined', 1).y)
      expect(centre('InductionDouble', 2).y).to.be.lessThan(centre('LessOrEqualJoined', 1).y)
      // Logic World is two columns to the right of ≤ World, below the bonus branches it
      // follows: between the last level of the lower one (C) and that of the upper (B),
      // whose paths join above it.
      expect(centre('Logic', 1).x).to.be.greaterThan(centre('LessOrEqual', 1).x + 100)
      expect(centre('Logic', 1).y).to.be.greaterThan(centre('PropositionBonusC', 1).y)
      expect(centre('Logic', 1).x).to.be.greaterThan(centre('PropositionBonusC', 1).x)
      expect(centre('Logic', 1).x).to.be.lessThan(centre('PropositionBonusB', 3).x)
      // It is right under bonus B1, and so is the path the two branches join into.
      expect(centre('Logic', 1).x).to.be.closeTo(centre('PropositionBonusB', 2).x, 1)
      const joined = Cypress.$('[data-segment="edge:PropositionBonusC:Logic:in"]')[0]!.getBoundingClientRect()
      expect(joined.left + joined.width / 2).to.be.closeTo(centre('PropositionBonusB', 2).x, 2)
      // ≤ World's bonus levels go left from below its boss, towards the middle, and
      // the bonus about Fermat goes right from below the last level about powers: it is
      // right under the last of them, so the path between the two drops straight down.
      expect(centre('PowerBonus', 1).x).to.be.closeTo(centre('LessOrEqualBonus', 5).x, 1)
      expect(centre('PowerBonus', 1).y).to.be.greaterThan(centre('LessOrEqualBonus', 5).y + 20)
      const drop = Cypress.$('[data-segment="edge:LessOrEqualBonus:PowerBonus:in"]')[0]!.getBoundingClientRect()
      expect(drop.width).to.be.lessThan(drop.height / 4)
      expect(drop.left + drop.width / 2).to.be.closeTo(centre('PowerBonus', 1).x, 2)
      expect(centre('LessOrEqualBonus', 1).x).to.be.lessThan(centre('LessOrEqualBoss', 1).x - 20)
      expect(centre('LessOrEqualBonus', 5).x).to.be.lessThan(centre('LessOrEqualBonus', 1).x - 100)
      expect(centre('LessOrEqualBonus', 5).y).to.be.closeTo(centre('LessOrEqualBonus', 1).y, 1)
      // The five of them are evenly spaced: the last isn't pulled away from the others.
      const steps = [1, 2, 3, 4].map(index => centre('LessOrEqualBonus', index).x - centre('LessOrEqualBonus', index + 1).x)
      expect(steps[1], 'A1 to A2 as A0 to A1').to.be.closeTo(steps[0]!, 1)
      expect(steps[2], 'A2 to A3 as A0 to A1').to.be.closeTo(steps[0]!, 1)
      expect(steps[3], 'A3 to A4 as A0 to A1').to.be.closeTo(steps[0]!, 1)
      expect(centre('PowerBonus', 1).x).to.be.greaterThan(centre('Power', 9).x + 20)
      // The two bonus levels off level 14 go the other way, out to the left.
      expect(centre('PowerBonusA', 1).x).to.be.lessThan(centre('Power', 8).x - 20)
      expect(centre('PowerBonusA', 2).x).to.be.lessThan(centre('PowerBonusA', 1).x - 20)
      expect(centre('PowerBonusA', 2).y).to.be.closeTo(centre('PowerBonusA', 1).y, 1)
      // The levels about powers carry on below those about multiplication, on the far left.
      expect(centre('Power', 1).x).to.be.closeTo(centre('Multiplication', 7).x, 1)
      expect(centre('Multiplication', 1).x).to.be.lessThan(centre('Induction', 1).x - 50)
      // The End is in the middle, below everything.
      const end = centre('Outro', 1)
      expect(end.x).to.be.closeTo(centre('Intro', 1).x, 1)
      for (const level of $levels.toArray()) {
        if (level.getAttribute('data-world') === 'Outro') continue
        const box = level.querySelector('circle')!.getBoundingClientRect()
        expect(box.bottom, `${level.getAttribute('data-world')} ${level.getAttribute('data-level')}`).to.be.lessThan(end.y)
      }
    })
    mapLevel('Outro', 1).should('contain.text', '?')
  })

  it('keeps every world title clear of the paths and the levels', () => {
    visit(MAP, { fresh: true })
    mapLevel('Outro', 1).should('exist')
    cy.get('[data-testid="path-map-world-label"]').should('have.length', 9).then($labels => {
      const svg = Cypress.$('[data-testid="visual-path-map"]')[0] as unknown as SVGSVGElement
      // Points along every path, and every level's circle, in the map's own units
      // (whatever the window scales it to).
      const points: { x: number, y: number, segment: string }[] = []
      for (const path of Array.from(svg.querySelectorAll<SVGPathElement>('[data-testid="path-map-segment"]'))) {
        const length = path.getTotalLength()
        for (let at = 0; at <= length; at += 4) {
          const point = path.getPointAtLength(at)
          points.push({ x: point.x, y: point.y, segment: path.getAttribute('data-segment')! })
        }
      }
      const circles = Array.from(svg.querySelectorAll<SVGCircleElement>('[data-testid="path-map-level"] circle'))
        .map(circle => ({ x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')), r: Number(circle.getAttribute('r')) }))
      for (const label of $labels.toArray() as unknown as SVGTextElement[]) {
        const box = label.getBBox()
        const gapTo = (x: number, y: number) => Math.hypot(
          Math.max(box.x - x, 0, x - (box.x + box.width)),
          Math.max(box.y - y, 0, y - (box.y + box.height)))
        let nearest = { gap: Infinity, segment: '' }
        for (const point of points) {
          // A path is 16 wide, so its edge is 8 from its middle.
          const gap = gapTo(point.x, point.y) - 8
          if (gap < nearest.gap) nearest = { gap, segment: point.segment }
        }
        expect(nearest.gap, `gap between “${label.textContent}” and ${nearest.segment}`).to.be.greaterThan(3)
        const levelGap = Math.min(...circles.map(circle => gapTo(circle.x, circle.y) - circle.r))
        expect(levelGap, `gap between “${label.textContent}” and the nearest level`).to.be.greaterThan(3)
      }
    })
    // Multiplication and Exponentiation World's title is long, so it is on two lines,
    // and fits above its column like the others. Advanced Multiplication World's is to
    // the right of its path, just above its first level: the other world's path turns in
    // above it from the left. ≤ World's is to the right of the path from the ≠ World's
    // boss, which forks to both sides just above it, and Logic World's is to the right of
    // the path that comes down to it from the bonus branches.
    const titleOf = (text: string) => cy.get(`[data-testid="path-map-world-label"][data-title="${text}"]`)
    titleOf('Multiplication and Exponentiation World').should('have.attr', 'data-anchor', 'middle')
      .find('tspan').should('have.length', 2)
    titleOf('Advanced Multiplication World').should('have.attr', 'data-anchor', 'start')
      .find('tspan').should('have.length', 1)
    titleOf('≤ World').should('have.attr', 'data-anchor', 'start')
    titleOf('Logic World').should('have.attr', 'data-anchor', 'start')
    titleOf('Rewrite World').should('have.attr', 'data-anchor', 'middle')
  })

  it('names a locked level with a lock, world bosses with their world, and nothing with a chili pepper', () => {
    visit(MAP, { fresh: true })
    mapLevel('Outro', 1).should('exist')
    const tooltipOf = (world: string, n: number) => {
      // Focus shows the name, as hovering does.
      mapLevel(world, n).focus()
      return cy.get('.map-level-name-tooltip')
    }
    const leave = (world: string, n: number) => {
      mapLevel(world, n).blur()
      cy.get('.map-level-name-tooltip').should('not.exist')
    }
    // The opening level can be played; everything else starts locked.
    tooltipOf('Intro', 1).should('have.text', 'Welcome')
    leave('Intro', 1)
    for (const [world, n, title] of [
      ['Rewrite', 6, 'On The Count of Three (Rewriting World Boss)'],
      ['PropositionRight', 8, 'The De Morgan\'s Law That Is Intuitionistically Valid (Proposition World Boss)'],
      ['SuccessorJoined', 3, 'Plug and Chug (Successor World Boss)'],
      ['NeqJoined', 1, 'Zero or No Zero (≠ World Boss)'],
      ['InductionDouble', 2, 'Equality in ℕ is Decidable (Induction World Boss)'],
      ['Power', 9, 'FOILed Again (Multiplication and Exponentiation World Boss)'],
      ['LessOrEqualBoss', 1, '≤ is Total (≤ World Boss)'],
      ['AdvMultiplication', 10, 'mul_left_cancel (Advanced Multiplication World Boss)'],
      // Bosses that aren't their world's last word keep a plain title.
      ['Successor', 3, 'Counting to Four (Miniboss)'],
      ['InductionJoined', 2, 'add_right_eq_self'],
      ['InductionJoined', 4, 'add_right_eq_zero (Miniboss)'],
      ['Multiplication', 7, 'mul_assoc (Miniboss)'],
      ['AdvMultiplication', 5, 'le_mul_right'],
      ['LessOrEqualJoined', 1, 'Nothing Smaller than Zero'],
      ['LessOrEqualJoined', 2, '≤ Add Right Cancel'],
      ['LessOrEqualJoined', 3, 'Antisymmetry of ≤'],
      ['LessOrEqual', 6, 'Transitivity of ≤'],
      ['LessOrEqual', 7, 'Eliminating Addition is Decreasing'],
      ['LessOrEqualBonus', 5, 'Trichotomy'],
      ['Logic', 1, 'Double Elimination is Equivalent To LEM'],
      ['Outro', 1, 'The End'],
    ] as const) {
      tooltipOf(world, n).should('have.text', `🔒 ${title}`)
      leave(world, n)
    }
    // A bonus level that waits for a world besides the one it branches off says which,
    // as well as having a path from there.
    tooltipOf('PowerBonus', 1).should('have.text', "🔒 Refute Fermat's Last Theorem? (needs ≤ World Bonus)")
    leave('PowerBonus', 1)
    // Or having none, where the bonus world asked for none.
    tooltipOf('PowerBonusA', 1).should('have.text', '🔒 Exponentiation is Not Commutative (needs ≠ World)')
    leave('PowerBonusA', 1)
    tooltipOf('RewriteBonus', 1).should('have.text', '🔒 Fast Rewriting')
    leave('RewriteBonus', 1)
    // No level's title has a pepper.
    cy.request('/data/g/local/NNVG/game.json').then(({ body }) => {
      const sizes = body.worldSize as Record<string, number>
      for (const [world, size] of Object.entries(sizes)) {
        for (let n = 1; n <= size; n += 1) {
          cy.request(`/data/g/local/NNVG/level__${world}__${n}.json`).then(({ body: level }) => {
            expect(level.title, `${world} ${n}`).not.to.contain('🌶')
          })
        }
      }
    })
  })

  it('opens The End once the two bosses before it are done, and Logic World after its two bonus branches', () => {
    visit(MAP, { fresh: true })
    mapLevel('Outro', 1).should('have.attr', 'data-state', 'locked')
    const done = {
      Intro: 1, Rewrite: 6, Proposition: 8, PropositionRight: 8, Successor: 3, SuccessorJoined: 3, Induction: 4,
      Neq: 9, NeqJoined: 1, InductionJoined: 4, InductionDouble: 2, Multiplication: 7, Power: 9,
      LessOrEqual: 7, LessOrEqualJoined: 4, LessOrEqualBoss: 1, AdvMultiplication: 10,
    }
    // The bonus boss off the last level about powers waits for ≤ World's bonus levels
    // as well.
    visitWithProgress({ ...done, LessOrEqualBonus: 4 })
    mapLevel('Power', 9).should('have.attr', 'data-state', 'completed')
    mapLevel('PowerBonus', 1).should('have.attr', 'data-state', 'locked')
    cy.get('[data-segment="bonus:Power:9:PowerBonus"]').should('have.attr', 'data-lit', 'true')
    cy.get('[data-segment="edge:LessOrEqualBonus:PowerBonus:in"]').should('have.attr', 'data-lit', 'false')
    visitWithProgress({ ...done, LessOrEqualBonus: 5 })
    mapLevel('PowerBonus', 1).should('have.attr', 'data-state', 'frontier')
    cy.get('[data-segment="edge:LessOrEqualBonus:PowerBonus:in"]').should('have.attr', 'data-lit', 'true')
    visitWithProgress(done)
    // ≤ World's bonus levels open with its boss.
    mapLevel('LessOrEqualBonus', 1).should('have.attr', 'data-state', 'frontier')
    mapLevel('LessOrEqualBonus', 2).should('have.attr', 'data-state', 'locked')
    // Induction World's last level leads on to ≤ World's level 6.
    cy.get('[data-segment="edge:InductionDouble:LessOrEqualJoined:in"]').should('have.attr', 'data-lit', 'true')
    // Logic World waits for both bonus branches off Proposition World's boss, and The
    // End doesn't wait for Logic World.
    mapLevel('Logic', 1).should('have.attr', 'data-state', 'locked')
    cy.get('[data-segment="edge:NeqJoined:Logic:in"]').should('have.attr', 'data-lit', 'true')
    mapLevel('Outro', 1).should('have.attr', 'data-state', 'frontier')
    visitWithProgress({ ...done, PropositionBonusC: 1 })
    mapLevel('Logic', 1).should('have.attr', 'data-state', 'locked')
    visitWithProgress({ ...done, PropositionBonusB: 3, PropositionBonusC: 1 })
    mapLevel('Logic', 1).should('have.attr', 'data-state', 'frontier')
    // Without Advanced Multiplication World's boss The End stays locked.
    visitWithProgress({ ...done, AdvMultiplication: 9 })
    mapLevel('Outro', 1).should('have.attr', 'data-state', 'locked')
    cy.get('[data-segment="edge:AdvMultiplication:Outro:in"]').should('have.attr', 'data-lit', 'false')
    cy.get('[data-segment="edge:Power:Outro:in"]').should('have.attr', 'data-lit', 'true')
    visitWithProgress(done)
    // The map is drawn once the level data is in, which takes a moment after a visit.
    cy.get('[data-segment="edge:AdvMultiplication:Outro:in"]', { timeout: LOAD_TIMEOUT }).should('have.attr', 'data-lit', 'true')
    mapLevel('Outro', 1).should('have.attr', 'data-state', 'frontier').click()
    cy.get('[data-testid="text-level-dialog"]').should('be.visible').and('contain.text', 'Thank you for playing!')
    cy.contains('.path-map-text-close', 'Continue').click()
    mapLevel('Outro', 1).should('have.attr', 'data-state', 'completed')
  })

  it('plays the first Rewrite World levels with clicks and the check mark', () => {
    // Progress is saved on a short delay, so move between levels the way a
    // player does (map, Next, Back to map) instead of reloading pages.
    visit(MAP, { fresh: true })
    mapLevel('Intro', 1).click()
    cy.contains('button', 'Continue').click()
    mapLevel('Rewrite', 1).should('have.attr', 'data-state', 'frontier').click()

    // Level 0: substitutions, then the check mark; no direction button yet.
    expectRewriteOnlyLevel()
    cy.get('.tr-direction-btn').should('not.exist')
    // Rewrite World hides the swap-sides button throughout, and has no tabs.
    cy.get('.tr-swap-btn').should('not.exist')
    cy.get('.tr-tab-btn').should('not.exist')
    // Its rules are the level's own hypotheses, grey as on the canvas.
    cy.get('.tr-rule-card[data-rule-label="hypothesis1"]').should('have.attr', 'data-rule-kind', 'hyp')
      .and('have.class', 'tr-hyp-rule-card')
    lessonsShouldContain('Drag a hypothesis onto a term')
    relationShouldBe('x + y = 1 + 2')
    cy.get('[data-testid="rewrite-check"]').should('not.exist')
    // Cards show Lean's `hypothesis_1` the way Visual Lean shows such names.
    clickRule('hypothesis1')
    relationShouldBe('1 + y = 1 + 2')
    // The hint stays up after the first substitution, until the next one replaces it.
    lessonsShouldContain('Drag a hypothesis onto a term')
    clickRule('hypothesis2')
    relationShouldBe('1 + 2 = 1 + 2')
    lessonsShouldContain('check mark')
    lessonsShouldContain('by the definition of equality.')
    cy.get('[data-testid="rewrite-lessons"]').should('not.contain.text', 'Drag a hypothesis onto a term')
    // Its arrow stops short of the check mark, once the mark has popped in.
    cy.get('[data-testid="rewrite-check"]').should('be.visible')
    cy.wait(400)
    arrowStopsShortOf('.check-guide-arrow', '[data-testid="rewrite-check"]')
    // A plain button: its mark is the orange of an open goal's card while it waits to be
    // clicked (the world's `-incomplete` in the neutral palette), with no outline of that
    // colour, no glow and no pulsing.
    cy.get('[data-testid="rewrite-check"]').should('have.css', 'color', 'rgb(234, 179, 8)')
      .and('not.have.css', 'border-top-color', 'rgb(234, 179, 8)')
      .and('have.css', 'border-top-width', '1px')
      .and('have.css', 'box-shadow', 'none')
      .and('have.css', 'animation-iteration-count', '1')
    check()
    // Clicked, it lights up in the world's first colour (Rewriting World's lantern red),
    // and so does the finished level's tick.
    cy.get('[data-testid="rewrite-check"]').should('have.css', 'background-color', 'rgb(255, 101, 90)')
    cy.get('.visual-header.completed', { timeout: LOAD_TIMEOUT }).should('exist')
    cy.get('.visual-header-check').filter(':visible').first().should('have.css', 'color', 'rgb(255, 101, 90)')
    // The hint stays up once the level is finished.
    lessonsShouldContain('check mark')

    // Level 1: many substitutions, each click rewriting its only match.
    cy.get('.visual-header-next-btn').filter(':visible').first().should('not.be.disabled').click()
    cy.location('pathname').should('contain', '/world/Rewrite/level/2/visual')
    expectRewriteOnlyLevel()
    lessonsShouldContain('many substitutions')
    // The hint about clicking moved to the bonus level Fast Rewriting.
    cy.get('[data-testid="rewrite-lessons"]').should('not.contain.text', 'reading left to right')
    relationShouldBe('(x + y) + z = 0')
    // The specific hypotheses come first, then the general one.
    cy.get('.tr-rule-card').filter(':visible').then($cards => {
      expect([...$cards].map(card => card.getAttribute('data-rule-label')))
        .to.deep.equal(['hypothesis_x', 'hypothesis_y', 'hypothesis_z', 'zero_add_zero'])
    })
    clickRule('hypothesis_x')
    clickRule('hypothesis_y')
    clickRule('hypothesis_z')
    relationShouldBe('(0 + 0) + 0 = 0')
    clickRule('zero_add_zero')
    relationShouldBe('0 + 0 = 0')
    clickRule('zero_add_zero')
    relationShouldBe('0 = 0')
    check()

    // Level 2: the direction button rewrites backwards.
    cy.get('.visual-header-next-btn').filter(':visible').first().should('not.be.disabled').click()
    cy.location('pathname').should('contain', '/world/Rewrite/level/3/visual')
    expectRewriteOnlyLevel()
    lessonsShouldContain('forwards and backwards')
    cy.get('.tr-direction-btn').should('be.visible').click()
    clickRule('hypothesis_x')
    relationShouldBe('0 + y = 0')
    lessonsShouldContain('forwards and backwards')
    clickRule('hypothesis_y')
    relationShouldBe('0 + 0 = 0')
    cy.get('.tr-direction-btn').click()
    clickRule('zero_add_zero')
    relationShouldBe('0 = 0')
    check()

    // The bonuses sprout after level 2 without holding up level 3.
    cy.get('.visual-header-map-btn').filter(':visible').first().click()
    mapLevel('Rewrite', 3).should('have.attr', 'data-state', 'completed')
    mapLevel('Rewrite', 4).should('have.attr', 'data-state', 'frontier')
    mapLevel('RewriteBonus', 1).should('have.attr', 'data-state', 'frontier')
    mapLevel('RewriteBonusB', 1).should('have.attr', 'data-state', 'frontier')
    cy.get('[data-segment="bonus:Rewrite:3:RewriteBonus"]').should('have.attr', 'data-lit', 'true')
    cy.get('[data-segment="bonus:Rewrite:3:RewriteBonusB"]').should('have.attr', 'data-lit', 'true')
  })

  it('uses a ∀ hypothesis as a rule anywhere it fits', () => {
    openRewriteLevel(4)
    cy.get('.tr-rule-card[data-rule-label="add_comm"] .tr-forall-footer.visual-forall-emphasize').should('exist')
    clickRule('hx')
    clickRule('hy')
    clickRule('hz')
    relationShouldBe('(1 + 2) + 3 = 3 + (2 + 1)')
    // A click rewrites the first match reading left to right: the whole side.
    clickRule('add_comm')
    relationShouldBe('3 + (1 + 2) = 3 + (2 + 1)')
    // Then swap the inner pair where it is.
    notProcessing()
    cy.window().then(win => (win as HarnessWindow).__visualTestHarness!.rewriteGoalInTransform('add_comm', 'left', [2]))
    relationShouldBe('3 + (2 + 1) = 3 + (2 + 1)')
    check()
  })

  it('shows fractions vertically and plays them like any other term', () => {
    openRewriteLevel(5)
    // Both on the goal and on the rule cards.
    cy.get('.tr-expr-wrapper .formula-fraction').should('have.length', 3)
    cy.get('.tr-expr-wrapper .formula-fraction').first().should('have.attr', 'aria-label', '1/2')
    cy.get('.tr-expr-wrapper .formula-fraction').eq(1).should('have.attr', 'aria-label', '1/4')
    cy.get('.tr-rule-card[data-rule-label="h_fourths"] .formula-fraction').should('have.length.at.least', 3)
    relationShouldBe('((frac1over2 + frac1over4) + frac1over4) + (1 + 1) = 3')
    // Associativity on the fractions, where it is dropped (a click would take the
    // whole side, its first match).
    rewrite('add_assoc', 'left', [1])
    relationShouldBe('(frac1over2 + (frac1over4 + frac1over4)) + (1 + 1) = 3')
    rewrite('h_fourths', 'left', [1, 2], true)
    relationShouldBe('(frac1over2 + frac1over2) + (1 + 1) = 3')
    rewrite('h_halves', 'left', [1], true)
    relationShouldBe('1 + (1 + 1) = 3')
    // And backwards on the whole side, to meet `h_three`.
    cy.get('.tr-direction-btn').should('be.visible').click()
    clickRule('add_assoc')
    relationShouldBe('(1 + 1) + 1 = 3')
    cy.get('.tr-direction-btn').click()
    clickRule('h_three')
    relationShouldBe('3 = 3')
    check()
    cy.get('.visual-header.completed', { timeout: LOAD_TIMEOUT }).should('exist')
  })

  it('plays the Rewrite World boss', () => {
    openRewriteLevel(6)
    lessonsShouldContain('final boss of Rewriting World')
    relationShouldBe('((((1 + 1) + 1) + 1) + 1) + 1 = (1 + 2) + 3')
    rewrite('h_two', 'left', [1, 1, 1, 1])
    rewrite('add_comm', 'left', [1, 1, 1])
    rewrite('h_three', 'left', [1, 1, 1])
    rewrite('h_three', 'right', [1])
    relationShouldBe('((3 + 1) + 1) + 1 = 3 + 3')
    rewrite('add_assoc', 'left', [1])
    rewrite('h_two', 'left', [1, 2])
    rewrite('add_assoc', 'left')
    rewrite('add_comm', 'left', [2])
    rewrite('h_three', 'left', [2])
    relationShouldBe('3 + 3 = 3 + 3')
    check()
  })

  // The app leaves StrictMode off when it sees Cypress, so these hide Cypress from
  // it. StrictMode's second run of a mount's effects used to set off a render loop
  // on levels whose cards have to move away from their starting places.
  for (const n of [5, 6]) {
    it(`opens Rewrite World's Lean level ${n} with StrictMode on`, () => {
      cy.visit(level('Rewrite', n), {
        onBeforeLoad(win) {
          win.localStorage.setItem('telemetryConsent', 'refused')
          delete (win as unknown as { Cypress?: unknown }).Cypress
        },
      })
      cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
      cy.contains('Maximum update depth').should('not.exist')
    })
  }

  it('plays Proposition World on the canvas, with a card for `A : Prop`', () => {
    openCanvasLevel('Proposition', 1)
    headerShouldNameLevel('0', 'Basic Propositions')
    cy.contains('Goals can be proven by dragging over a matching proposition!').should('be.visible')
    cy.get('[data-testid="hyp-card"]').should('have.length', 2)
    cy.get('[data-testid="hyp-card"][data-hyp-type="Prop"]').should('have.length', 1)
    cy.get('[data-testid="hyp-card"][data-hyp-name="h"]').should('exist')
    notProcessing()
    cy.window().then(win => (win as HarnessWindow).__visualTestHarness!.dragHypToGoal('h'))
    cy.window({ timeout: LOAD_TIMEOUT }).should(win => {
      expect((win as HarnessWindow).__visualTestHarness!.getProofAudit().completed).to.equal(true)
    })
  })

  it('keeps the `A : Prop` cards clear of the proof graph, and drops the split hint at the split', () => {
    openCanvasLevel('Proposition', 6)
    headerShouldNameLevel('5', 'Conjunction (0)')
    cy.get('[data-testid="hyp-card"]').should('have.length', 4)
    cy.get('[data-testid="hyp-card"][data-hyp-type="Prop"]').should('have.length', 2)
    goalHintShouldContain('split into two proof branches')
    clickGoal()
    goalShouldBe('A')
    // That hint is only for before the split; the proof graph's takes over.
    cy.contains('split into two proof branches').should('not.exist')
    hintShouldContain('The proof is only complete when all proof branches are solved.')
    cy.get('[data-testid="hyp-card"][data-hyp-type="Prop"]').should('have.length', 2)
    // The cards make way for the graph, and stay below the header.
    cy.get('#visual-proof-tree-panel', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.wait(500)
    cy.get('[data-testid="hyp-card"]').should($cards => {
      const panel = Cypress.$('#visual-proof-tree-panel')[0]!.getBoundingClientRect()
      const header = Cypress.$('.visual-header')[0]!.getBoundingClientRect()
      for (const card of $cards.toArray()) {
        const box = card.getBoundingClientRect()
        const overlaps = box.left < panel.right && box.right > panel.left && box.top < panel.bottom && box.bottom > panel.top
        expect(overlaps, `${card.getAttribute('data-hyp-name')} over the proof graph`).to.equal(false)
        expect(box.top, `${card.getAttribute('data-hyp-name')} below the header`).to.be.at.least(header.bottom)
      }
    })
    dragToGoal('hA')
    nextUnsolvedBranch()
    goalShouldBe('B')
    dragToGoal('hB')
    shouldBeCompleted()
  })

  it('proves a goal backwards by dragging onto it', () => {
    openCanvasLevel('Proposition', 5)
    headerShouldNameLevel('4', 'Backwards Implications')
    goalHintShouldContain('You can also prove the goal backwards!')
    // The two hypotheses are given, beside the cards for `A B C : Prop`.
    cy.get('[data-testid="hyp-card"]').should('have.length', 5)
    cy.get('[data-testid="hyp-card"][data-hyp-type="Prop"]').should('have.length', 3)
    goalShouldBe('C')
    dragCardToGoal('(A → B) → C')
    goalShouldBe('A → B')
    clickGoal()
    goalShouldBe('B')
    dragCardToGoal('B')
    shouldBeCompleted()
  })

  it('sends the player back to the map at the fork after Proposition World level 7', () => {
    openCanvasLevel('Proposition', 7)
    headerShouldNameLevel('6', 'Conjunction (1)')
    cy.get('.visual-header-next-btn').filter(':visible').first().should('not.contain.text', 'World Map')
    openCanvasLevel('Proposition', 8)
    headerShouldNameLevel('7', 'If and Only If (Conjunctions)')
    cy.get('.visual-header-next-btn').filter(':visible').first().should('contain.text', 'World Map')
  })

  it('separates an ‘if and only if’ goal with a click, like ∧', () => {
    openCanvasLevel('Proposition', 8)
    headerShouldNameLevel('7', 'If and Only If (Conjunctions)')
    goalHintShouldContain('just means')
    goalHintShouldContain('to separate just like')
    notProcessing()
    cy.get('[data-testid="goal-card"]').filter(':visible').first().click()
    goalShouldBe('(A ∧ B) ∧ C → A ∧ B ∧ C')
    // The hint stays up after the move it describes, until another replaces it.
    goalHintShouldContain('to separate just like')

    clickGoal()
    goalShouldBe('A ∧ B ∧ C')
    clickHyp('h')
    hypShouldExist('left')
    clickHyp('left')
    hypShouldExist('left1')
    clickGoal()
    goalShouldBe('A')
    dragToGoal('left1')
    nextUnsolvedBranch()
    goalShouldBe('B ∧ C')
    clickGoal()
    goalShouldBe('B')
    dragToGoal('right1')
    nextUnsolvedBranch()
    goalShouldBe('C')
    dragToGoal('right')
    nextUnsolvedBranch()

    goalShouldBe('A ∧ B ∧ C → (A ∧ B) ∧ C')
    clickGoal()
    goalShouldBe('(A ∧ B) ∧ C')
    clickHyp('h')
    hypShouldExist('right')
    clickHyp('right')
    hypShouldExist('right1')
    clickGoal()
    goalShouldBe('A ∧ B')
    clickGoal()
    goalShouldBe('A')
    dragToGoal('left')
    nextUnsolvedBranch()
    goalShouldBe('B')
    dragToGoal('left1')
    nextUnsolvedBranch()
    goalShouldBe('C')
    dragToGoal('right1')
    shouldBeCompleted()
  })

  it('keeps every card within reach of a click, whatever order the branches are played in', () => {
    // A fixed, seeded walk through the ∧ associativity level: split goals and
    // hypotheses, finish branches, undo, and jump about the proof graph. A card
    // used to end up under the goal's hint in another branch once a branch had been
    // finished (the finished branch stays on screen, and its goal stack wasn't
    // counted as being in the way), and a click on such a card never reached it.
    cy.viewport(1280, 720)
    openCanvasLevel('Proposition', 8)
    type Snapshot = {
      streamId: string, goalType: string, goalPlayTactic: string | null
      hypTypes: Record<string, string>, hypPlayTactics: Record<string, string | null>
    }
    type Walker = {
      getProofAudit(): { completed: boolean, processing: boolean }
      getCurrentStreamSnapshot(): Snapshot
      dragHypToGoal(name: string): Promise<void>
    }
    cy.window({ timeout: LOAD_TIMEOUT }).then({ timeout: 240000 }, async win => {
      // mulberry32, so the walk is the same every run.
      let state = 53
      const random = () => {
        state = (state + 0x6D2B79F5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      const walker = (win as unknown as { __visualTestHarness: Walker }).__visualTestHarness
      const idle = async () => {
        for (let tries = 0; tries < 400; tries += 1) {
          await sleep(60)
          if (walker.getProofAudit().processing) continue
          await sleep(280)
          if (!walker.getProofAudit().processing) return
        }
        throw new Error('the canvas never came to rest')
      }
      const snapshot = (): Snapshot | null => { try { return walker.getCurrentStreamSnapshot() } catch { return null } }
      const shown = <T extends Element>(selector: string) =>
        Array.from(win.document.querySelectorAll<T>(selector)).filter(el => el.getBoundingClientRect().width > 0)
      const covered: string[] = []
      const refused: string[] = []
      for (let step = 0; step < 64; step += 1) {
        await idle()
        if (walker.getProofAudit().completed) break
        await sleep(450)
        // What the pointer finds at each card: the card itself, or something over it.
        for (const card of shown<HTMLElement>('[data-testid="hyp-card"], [data-testid="goal-card"]')) {
          const box = card.getBoundingClientRect()
          const top = win.document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          if (top && !card.contains(top)) {
            covered.push(`step ${step}: ${card.dataset.hypName ?? 'the goal'} is under ${(top as HTMLElement).className}`)
          }
        }
        const before = snapshot()
        type Action = { name: string, weight: number, changes?: boolean, run: () => Promise<void> | void }
        const actions: Action[] = shown<HTMLButtonElement>('[data-testid^="stream-nav-"]').filter(el => !el.disabled)
          .map(el => ({ name: 'another branch', weight: 1, run: () => el.click() }))
        const undo = shown<HTMLButtonElement>('button[aria-label="Undo"]').find(el => !el.disabled)
        if (undo) actions.push({ name: 'undo', weight: 1.5, run: () => undo.click() })
        for (const leaf of Array.from(win.document.querySelectorAll<SVGElement>('[data-testid="proof-stream-leaf"]'))) {
          actions.push({
            name: 'a branch of the proof graph',
            weight: 2,
            run: () => { leaf.dispatchEvent(new (win as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent('click', { bubbles: true })) },
          })
        }
        if (before) {
          for (const [name, type] of Object.entries(before.hypTypes)) {
            if (before.hypPlayTactics[name]) {
              actions.push({
                name: `click ${name} : ${type}`, weight: 3, changes: true,
                run: () => shown<HTMLElement>('[data-testid="hyp-card"]').find(card => card.dataset.hypName === name)!.click(),
              })
            }
            if (type === before.goalType) {
              actions.push({ name: `drag ${name} to the goal ${type}`, weight: 2, changes: true, run: () => walker.dragHypToGoal(name) })
            }
          }
          if (before.goalPlayTactic) {
            actions.push({
              name: `click the goal ${before.goalType}`, weight: 3, changes: true,
              run: () => shown<HTMLElement>('[data-testid="goal-card"]')[0]!.click(),
            })
          }
        }
        if (actions.length === 0) break
        let pick = random() * actions.reduce((sum, action) => sum + action.weight, 0)
        const action = actions.find(candidate => (pick -= candidate.weight) < 0) ?? actions[0]!
        await action.run()
        await sleep(350)
        await idle()
        const after = snapshot()
        if (action.changes && before && after && after.streamId === before.streamId
          && after.goalType === before.goalType && JSON.stringify(after.hypTypes) === JSON.stringify(before.hypTypes)
          && !walker.getProofAudit().completed) {
          refused.push(`step ${step}: ${action.name} did nothing`)
        }
      }
      return { covered, refused }
    }).then(({ covered, refused }) => {
      expect(covered, 'cards something else is drawn over').to.deep.equal([])
      expect(refused, 'moves that did nothing').to.deep.equal([])
    })
    cy.viewport(1000, 660)
  })

  it('opens the ‘if and only if’ level for disjunctions', () => {
    openCanvasLevel('PropositionRight', 3)
    headerShouldNameLevel('10', 'If and Only If (Disjunctions)')
    goalShouldBe('(A ∨ B) ∨ C ↔ A ∨ B ∨ C')
    clickGoal()
    goalShouldBe('(A ∨ B) ∨ C → A ∨ B ∨ C')
  })

  it('guides an ‘or’ goal past its dead ends', () => {
    openCanvasLevel('PropositionRight', 1)
    headerShouldNameLevel('8', 'Disjunction (0)')
    goalShouldBe('A ∨ B ∨ C')
    goalHintShouldContain('you must choose to prove either the left side or the right side')
    goalHintShouldContain('Be careful not to get stuck in a dead end!')
    // Neither swapping an equation's sides nor its direction is offered in this world.
    cy.get('[data-testid="hyp-card"][data-hyp-name="hB"]').should('exist')

    // Choosing A is a dead end.
    harness(h => h.clickGoal('click_goal_left'))
    goalShouldBe('A')
    goalHintShouldContain("We don't have any way of proving")
    cy.get('button[aria-label="Reset level"]').filter(':visible').should('exist').first().then($reset => {
      const box = $reset[0]!.getBoundingClientRect()
      expect(box.left, 'reset button is on the left').to.be.lessThan(Cypress.config('viewportWidth') / 2)
      expect(box.top, 'reset button is at the bottom').to.be.greaterThan(Cypress.config('viewportHeight') / 2)
    })
    cy.get('button[aria-label="Reset level"]').filter(':visible').first().click()

    // The right side is the way forward, and C is a dead end there.
    harness(h => h.clickGoal('click_goal_right'))
    goalShouldBe('B ∨ C')
    goalHintShouldContain('Be careful not to get stuck in a dead end!')
    harness(h => h.clickGoal('click_goal_right'))
    goalShouldBe('C')
    goalHintShouldContain("We don't have any way of proving")
    notProcessing()
    cy.get('button[aria-label="Undo"]').filter(':visible').first().click()
    goalShouldBe('B ∨ C')
    cy.contains("We don't have any way of proving").should('not.exist')
    // B is what we have: no warning.
    harness(h => h.clickGoal('click_goal_left'))
    goalShouldBe('B')
    cy.contains("We don't have any way of proving").should('not.exist')
    dragToGoal('hB')
    shouldBeCompleted()
  })

  it('warns when the ‘or’ goal is split before the hypothesis', () => {
    openCanvasLevel('PropositionRight', 2)
    headerShouldNameLevel('9', 'Disjunction (1)')
    goalShouldBe('A ∨ B → B ∨ A')
    goalHintShouldContain('hypotheses can be split by')
    harness(h => h.clickGoal())
    goalShouldBe('B ∨ A')
    goalHintShouldContain('reachable from both sides')

    // Splitting the goal before the hypothesis is a dead end.
    harness(h => h.clickGoal('click_goal_left'))
    goalShouldBe('B')
    goalHintShouldContain('depend on which branch')
  })

  it('finishes the ‘or’ level by splitting the hypothesis first', () => {
    visit(level('PropositionRight', 2))
    goalShouldBe('A ∨ B → B ∨ A')
    harness(h => h.clickGoal())
    goalShouldBe('B ∨ A')
    cy.get('[data-testid="hyp-card"]', { timeout: LOAD_TIMEOUT }).filter('[data-hyp-type="A ∨ B"]').first()
      .invoke('attr', 'data-hyp-name').then(name => {
        harness(h => h.clickHyp(name as string))
      })
    hypShouldExist('left')
    // With the hypothesis split, its hint stays up: both branches need finishing.
    goalHintShouldContain('reachable from both sides')
    goalShouldBe('B ∨ A')
    // The side this branch has no proof of is a dead end, and says so.
    harness(h => h.clickGoal('click_goal_left'))
    goalShouldBe('B')
    goalHintShouldContain('any way of proving')
    cy.contains('in this branch').should('be.visible')
    notProcessing()
    cy.get('button[aria-label="Undo"]').filter(':visible').first().click()
    goalShouldBe('B ∨ A')
    goalHintShouldContain('reachable from both sides')
    // The side it does have a proof of: no warning, and no stale hint.
    harness(h => h.clickGoal('click_goal_right'))
    goalShouldBe('A')
    cy.contains('depend on which branch').should('not.exist')
    cy.contains('in this branch').should('not.exist')
    cy.contains('reachable from both sides').should('not.exist')
    harness(h => h.dragHypToGoal('left'))
    nextUnsolvedBranch()
    goalShouldBe('B ∨ A')
    harness(h => h.clickGoal('click_goal_left'))
    goalShouldBe('B')
    harness(h => h.dragHypToGoal('right'))
    shouldBeCompleted()
  })

  it('lets a False hypothesis prove any goal, by dragging it', () => {
    visit(level('PropositionRight', 4))
    headerShouldNameLevel('11', 'The Principle of Explosion')
    goalHintShouldContain('hypothesis can prove')
    cy.contains('em', 'anything').should('be.visible')
    notProcessing()
    dragWithPointer('[data-testid="hyp-card"][data-hyp-type="False"]', '[data-testid="goal-card"]')
    shouldBeCompleted()
  })

  it('treats ¬ goals and cards as implications to False', () => {
    openCanvasLevel('PropositionRight', 5)
    headerShouldNameLevel('12', 'Negation (0)')
    goalHintShouldContain('just means')
    // `A` is given.
    goalShouldBe('¬¬A')
    cy.get('[data-testid="hyp-card"][data-hyp-name="hA"]').should('have.attr', 'data-hyp-type', 'A')
    clickGoal()
    goalShouldBe('False')
    dragCard('A', '¬A')
    dragCardToGoal('False')
    shouldBeCompleted()
  })

  it('plays Negation (1): `A → B` gives `B`, and `¬B` takes nothing else', () => {
    openCanvasLevel('PropositionRight', 6)
    headerShouldNameLevel('13', 'Negation (1)')
    goalShouldBe('A → ¬B → ¬(A → B)')
    clickGoal()
    goalShouldBe('¬B → ¬(A → B)')
    clickGoal()
    goalShouldBe('¬(A → B)')
    clickGoal()
    goalShouldBe('False')
    // `¬B` is `B → False`: `A` isn't its premise.
    dragCard('A', '¬B')
    notProcessing()
    cy.get('[data-testid="hyp-card"][data-hyp-type="False"]').should('not.exist')
    dragCard('A', 'A → B')
    dragCard('B', '¬B')
    dragCardToGoal('False')
    shouldBeCompleted()
  })

  it('plays Negation (2) backwards from the goal, as its hidden hint says', () => {
    openCanvasLevel('PropositionRight', 7)
    headerShouldNameLevel('14', 'Negation (2)')
    goalShouldBe('A → ¬(A ∧ B) → ¬B')
    // The hint is there to be revealed, not shown.
    goalHintShouldContain('Hint:')
    cy.contains('rewrite backwards from the goal').should('not.exist')
    cy.contains('button', 'Click to reveal').click()
    cy.contains('Remember that you can rewrite backwards from the goal!').should('be.visible')
    clickGoal()
    goalShouldBe('¬(A ∧ B) → ¬B')
    clickGoal()
    goalShouldBe('¬B')
    clickGoal()
    goalShouldBe('False')
    dragCardToGoal('¬(A ∧ B)')
    goalShouldBe('A ∧ B')
    clickGoal()
    goalShouldBe('A')
    dragCardToGoal('A')
    nextUnsolvedBranch()
    goalShouldBe('B')
    dragCardToGoal('B')
    shouldBeCompleted()
  })

  it('takes premises in order: `B` is refused on `A → (B → C)`', () => {
    openCanvasLevel('Proposition', 4)
    headerShouldNameLevel('3', 'Implications (2)')
    clickGoal()
    goalShouldBe('(A → B) → (A → B → C) → C')
    clickGoal()
    goalShouldBe('(A → B → C) → C')
    clickGoal()
    goalShouldBe('C')
    dragCard('A', 'A → B')
    cy.get('[data-testid="hyp-card"][data-hyp-type="B"]', { timeout: LOAD_TIMEOUT }).should('exist')
    // Skipping `A` would leave `A → C`, which nobody asked for: refused, whichever card is dragged.
    dragCard('B', 'A → (B → C)')
    dragCard('A → (B → C)', 'B')
    notProcessing()
    cy.get('[data-testid="hyp-card"][data-hyp-type="A → C"]').should('not.exist')
    cy.get('[data-testid="hyp-card"]').should('have.length', 7)
    dragCard('A', 'A → (B → C)')
    cy.get('[data-testid="hyp-card"][data-hyp-type="B → C"]', { timeout: LOAD_TIMEOUT }).should('exist')
    dragCard('B', 'B → C')
    dragCardToGoal('C')
    shouldBeCompleted()
  })

  it('keeps every card clear of the goal and its hint when the proof graph appears', () => {
    visit(level('PropositionRight', 2))
    goalShouldBe('A ∨ B → B ∨ A')
    harness(h => h.clickGoal())
    goalShouldBe('B ∨ A')
    harness(h => h.clickGoal('click_goal_left'))
    goalShouldBe('B')
    cy.get('[data-testid="hyp-card"]', { timeout: LOAD_TIMEOUT }).filter('[data-hyp-type="A ∨ B"]').first()
      .invoke('attr', 'data-hyp-name').then(name => {
        harness(h => h.clickHyp(name as string))
      })
    hypShouldExist('left')
    goalHintShouldContain('in this branch')
    // `B : Prop` makes way for the graph's panel; it used to end up under the hint.
    cy.get('[data-testid="hyp-card"]').should($cards => {
      const stack = Cypress.$('.goal-card-with-info')[0]!.getBoundingClientRect()
      const hidden = [...$cards].filter(element => {
        const box = element.getBoundingClientRect()
        return box.left < stack.right - 4 && box.right > stack.left + 4 && box.top < stack.bottom - 4 && box.bottom > stack.top + 4
      }).map(element => element.getAttribute('data-hyp-type'))
      expect(hidden, 'cards under the goal stack').to.deep.equal([])
    })
  })

  it('plays the Proposition World boss', () => {
    openCanvasLevel('PropositionRight', 8)
    headerShouldNameLevel('15', 'The De Morgan')
    cy.contains('em', 'other').should('be.visible')
    cy.contains('strong', 'not').should('be.visible').and('have.css', 'font-weight', '700')
    goalShouldBe('¬(A ∨ B) ↔ ¬A ∧ ¬B')
    clickGoal()
    goalShouldBe('¬(A ∨ B) → ¬A ∧ ¬B')
    clickGoal()
    goalShouldBe('¬A ∧ ¬B')
    clickGoal()
    goalShouldBe('¬A')
    clickGoal()
    goalShouldBe('False')
    dragToGoal('h')
    goalShouldBe('A ∨ B')
    clickGoal('click_goal_left')
    goalShouldBe('A')
    dragToGoal('h1')
    nextUnsolvedBranch()
    goalShouldBe('¬B')
    clickGoal()
    goalShouldBe('False')
    dragToGoal('h')
    goalShouldBe('A ∨ B')
    clickGoal('click_goal_right')
    goalShouldBe('B')
    dragToGoal('h1')
    nextUnsolvedBranch()

    goalShouldBe('¬A ∧ ¬B → ¬(A ∨ B)')
    clickGoal()
    goalShouldBe('¬(A ∨ B)')
    clickHyp('h')
    hypShouldExist('left')
    clickGoal()
    goalShouldBe('False')
    clickHyp('h')
    hypShouldExist('left1')
    dragToGoal('left')
    goalShouldBe('A')
    dragToGoal('left1')
    nextUnsolvedBranch()
    goalShouldBe('False')
    dragToGoal('right')
    goalShouldBe('B')
    dragToGoal('right1')
    shouldBeCompleted()
  })

  it('plays the other De Morgan’s law, leftwards', () => {
    openCanvasLevel('PropositionBonusB', 1)
    headerShouldNameLevel('B0', 'The Other De Morgan')
    goalHintShouldContain('intuitionistically valid')
    goalShouldBe('¬A ∨ ¬B → ¬(A ∧ B)')
    clickGoal()
    goalShouldBe('¬(A ∧ B)')
    clickGoal()
    goalShouldBe('False')
    clickHyp('h1')
    hypShouldExist('left')
    clickHyp('h')
    hypShouldExist('left1')
    goalShouldBe('False')
    dragToGoal('left1')
    goalShouldBe('A')
    dragToGoal('left')
    nextUnsolvedBranch()
    goalShouldBe('False')
    dragToGoal('right1')
    goalShouldBe('B')
    dragToGoal('right')
    shouldBeCompleted()
  })

  it('plays the other De Morgan’s law, rightwards with excluded middle', () => {
    openCanvasLevel('PropositionBonusB', 2)
    headerShouldNameLevel('B1', 'Law of Excluded Middle')
    goalHintShouldContain('not intuitionistically valid')
    goalHintShouldContain('∀ P, P ∨ ¬P')
    // hA, hB, and the cards for `A B : Prop`.
    cy.get('[data-testid="hyp-card"]').should('have.length', 4)
    clickGoal()
    goalShouldBe('¬A ∨ ¬B')
    clickHyp('hA')
    hypShouldExist('left')
    clickHyp('hB')
    hypShouldExist('left1')
    goalShouldBe('¬A ∨ ¬B')
    clickGoal('click_goal_left')
    goalShouldBe('¬A')
    clickGoal()
    goalShouldBe('False')
    dragToGoal('h')
    goalShouldBe('A ∧ B')
    clickGoal()
    goalShouldBe('A')
    dragToGoal('left')
    nextUnsolvedBranch()
    goalShouldBe('B')
    dragToGoal('left1')
    nextUnsolvedBranch()
    goalShouldBe('¬A ∨ ¬B')
    clickGoal('click_goal_right')
    goalShouldBe('¬B')
    dragToGoal('right')
    nextUnsolvedBranch()
    goalShouldBe('¬A ∨ ¬B')
    clickGoal('click_goal_left')
    goalShouldBe('¬A')
    dragToGoal('right')
    shouldBeCompleted()
  })

  it('plays the other De Morgan’s law, rightwards with weak excluded middle', () => {
    openCanvasLevel('PropositionBonusB', 3)
    headerShouldNameLevel('B2', 'Weak Law of Excluded Middle')
    // A title this long gets its own line, and all of it shows.
    cy.get('.visual-header-title').filter(':visible').first().should($title => {
      expect($title[0]!.scrollWidth).to.be.at.most($title[0]!.clientWidth + 1)
    })
    goalHintShouldContain('do better than requiring')
    clickGoal()
    goalShouldBe('¬A ∨ ¬B')
    clickHyp('hA')
    hypShouldExist('left')
    clickGoal('click_goal_left')
    goalShouldBe('¬A')
    dragToGoal('left')
    nextUnsolvedBranch()
    goalShouldBe('¬A ∨ ¬B')
    clickHyp('hB')
    hypShouldExist('left')
    clickGoal('click_goal_right')
    goalShouldBe('¬B')
    dragToGoal('left')
    nextUnsolvedBranch()
    goalShouldBe('¬A ∨ ¬B')
    clickGoal('click_goal_left')
    goalShouldBe('¬A')
    clickGoal()
    goalShouldBe('False')
    dragToGoal('right1')
    goalShouldBe('¬B')
    clickGoal()
    goalShouldBe('False')
    dragToGoal('h')
    goalShouldBe('A ∧ B')
    clickGoal()
    goalShouldBe('A')
    dragToGoal('h1')
    nextUnsolvedBranch()
    goalShouldBe('B')
    dragToGoal('h2')
    shouldBeCompleted()
  })

  it('plays ¬¬LEM, bonus C0: the hypothesis proves `False` backwards, twice', () => {
    openCanvasLevel('PropositionBonusC', 1)
    headerShouldNameLevel('C0', '¬¬LEM')
    goalHintShouldContain("It's not possible to prove the Law of Excluded Middle")
    goalHintShouldContain('∀ P, P ∨ ¬P')
    cy.contains('em', 'refute').should('be.visible')
    goalShouldBe('∀ (P : Prop), ¬¬(P ∨ ¬P)')
    clickGoal()
    goalShouldBe('¬¬(P ∨ ¬P)')
    clickGoal()
    goalShouldBe('False')
    dragToGoal('h')
    goalShouldBe('P ∨ ¬P')
    clickGoal('click_goal_right')
    goalShouldBe('¬P')
    clickGoal()
    goalShouldBe('False')
    dragToGoal('h')
    goalShouldBe('P ∨ ¬P')
    clickGoal('click_goal_left')
    goalShouldBe('P')
    dragToGoal('h1')
    shouldBeCompleted()
  })

  it('has one scheme: no light mode, a slate map, and a page of its own for each world with colours', () => {
    // A light mode left over from before the game had this look doesn't apply.
    cy.visit(MAP, {
      onBeforeLoad(win) {
        win.localStorage.clear()
        win.localStorage.setItem('telemetryConsent', 'refused')
        win.localStorage.setItem('visual_light_mode/g/local/NNVG', 'true')
        win.localStorage.setItem('visual_style/g/local/NNVG', 'neutral')
        recordFrames(win)
      },
    })
    mapLevel('Intro', 1).should('be.visible')
    cy.get('.app').should('have.attr', 'data-visual-theme', 'dark')
    cy.get('.visual-map-menu-btn').should('be.visible')
    cy.get('.visual-map-theme-toggle').should('not.exist')
    // The map is a blackboard's slate (`--pal-bg-start`), and no frame was light.
    cy.document().its('documentElement').should(html => {
      expect(html.style.backgroundColor).to.equal('rgb(64, 81, 89)')
    })
    framesShould(frames => {
      const themes = frames.map(frame => frame.theme).filter(theme => theme !== null)
      expect(themes.length, 'frames with the app').to.be.greaterThan(0)
      expect(themes.filter(theme => theme !== 'dark'), 'frames in another scheme').to.deep.equal([])
    })

    // A world with colours has a page of its own, a muted one: Proposition World's is
    // `aqueduct`'s blue-grey.
    visit(level('Proposition', 1))
    cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.get('.app').should('have.attr', 'data-visual-theme', 'dark')
      .and('have.attr', 'data-world-scheme', 'aqueduct')
    cy.document().its('documentElement').should(html => {
      expect(html.style.backgroundColor).to.equal('rgb(53, 61, 70)')
    })
    // What is still to do is the world's `-incomplete`, the same orange in every world for now.
    cy.get('.app').should($app => {
      const style = getComputedStyle($app[0]!)
      expect(style.getPropertyValue('--pal-goal').trim(), 'an open goal').to.equal('234, 179, 8')
      expect(style.getPropertyValue('--pal-stream-pending').trim(), 'an open branch').to.equal('234, 179, 8')
      expect(style.getPropertyValue('--pal-surface').trim(), "the world's own panels").to.equal(
        style.getPropertyValue('--pal-world-aqueduct-surface').trim())
    })

    // A world that carries on another's path is played in that world's colours: the
    // levels about powers are `sandstone`, as the ones about multiplication are.
    visit(level('Power', 1))
    cy.get('.visual-header', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.get('.app').should('have.attr', 'data-world-scheme', 'sandstone')
  })

  it('has a Visual Style setting in the map menu: Standard, Standard Black and High Contrast', () => {
    const fillOf = (world: string) => mapLevel(world, 1).find('circle')
    const pageShouldBe = (colour: string) => cy.document().its('documentElement').should(html => {
      expect(html.style.backgroundColor).to.equal(colour)
    })
    const paletteShouldHave = (name: string, value: string) => cy.get('.app').should($app => {
      expect(getComputedStyle($app[0]!).getPropertyValue(name).trim(), name).to.equal(value)
    })
    const setting = () => cy.get('[data-testid="visual-style-setting"]')
    /** Step the setting on, and wait for it to be saved (a moment after it changes). */
    const next = (label: string) => {
      setting().click()
      setting().should('contain.text', 'Visual Style').and('contain.text', label)
      cy.wait(1200)
    }
    visitWithProgress({ Intro: 1, Rewrite: 6, Power: 9, Logic: 1 })
    mapLevel('Intro', 1).should('exist')
    // Standard, the neutral look: a world in its scheme's colour, on the slate. (The
    // levels about powers carry on Multiplication and Exponentiation World's `sandstone`.)
    cy.get('.app').should('have.attr', 'data-visual-style', 'neutral').and('not.have.attr', 'data-visual-backdrop')
    fillOf('Rewrite').should('have.css', 'fill', 'rgb(255, 101, 90)')
    fillOf('Power').should('have.css', 'fill', 'rgb(111, 205, 255)')
    fillOf('Logic').should('have.css', 'fill', 'rgb(169, 220, 255)')
    cy.get('.visual-map-menu-btn').click()
    setting().should('be.visible').and('contain.text', 'Standard').and('not.contain.text', 'Black')

    // Standard Black: the same colours, with black behind them.
    next('Standard Black')
    cy.get('.app').should('have.attr', 'data-visual-style', 'neutral').and('have.attr', 'data-visual-backdrop', 'black')
    pageShouldBe('rgb(0, 0, 0)')
    fillOf('Rewrite').should('have.css', 'fill', 'rgb(255, 101, 90)')
    fillOf('Power').should('have.css', 'fill', 'rgb(111, 205, 255)')
    // In a level too: the world's colours, and black where its own page and panels were.
    visit(level('Rewrite', 1))
    expectRewriteOnlyLevel()
    cy.get('.app').should('have.attr', 'data-world-scheme', 'lantern').and('have.attr', 'data-visual-backdrop', 'black')
    pageShouldBe('rgb(0, 0, 0)')
    paletteShouldHave('--pal-bg-end', '0, 0, 0')
    paletteShouldHave('--pal-surface', '0, 0, 0')
    paletteShouldHave('--pal-first', '255, 101, 90')

    // It is kept, and the map opens in it straight away.
    cy.visit(MAP)
    mapLevel('Intro', 1).should('exist')
    cy.get('.app').should('have.attr', 'data-visual-backdrop', 'black')
    pageShouldBe('rgb(0, 0, 0)')

    // High Contrast: the classic dark map, with each world in a plain colour: amber
    // for `lantern`, purple for `frost`, and orange for `sandstone`, all the way down.
    cy.get('.visual-map-menu-btn').click()
    next('High Contrast')
    cy.get('.app').should('have.attr', 'data-visual-style', 'high-contrast')
      .and('have.attr', 'data-visual-theme', 'dark').and('not.have.attr', 'data-visual-backdrop')
    pageShouldBe('rgb(15, 23, 42)')
    fillOf('Rewrite').should('have.css', 'fill', 'rgb(245, 158, 11)')
    fillOf('Power').should('have.css', 'fill', 'rgb(249, 115, 22)')
    fillOf('Logic').should('have.css', 'fill', 'rgb(139, 92, 246)')
    // Still no light mode.
    cy.get('.visual-map-theme-toggle').should('not.exist')
    // A level is in the classic colours too, with no page of its world's.
    visit(level('Rewrite', 1))
    expectRewriteOnlyLevel()
    cy.get('.app').should('have.attr', 'data-visual-style', 'high-contrast').and('not.have.attr', 'data-world-scheme')
    paletteShouldHave('--pal-accent', '139, 92, 246')
    paletteShouldHave('--pal-bg-start', '15, 23, 42')
    pageShouldBe('rgb(15, 23, 42)')

    // One more step is Standard again.
    cy.visit(MAP)
    mapLevel('Intro', 1).should('exist')
    cy.get('.app').should('have.attr', 'data-visual-style', 'high-contrast')
    cy.get('.visual-map-menu-btn').click()
    setting().click()
    setting().should('contain.text', 'Standard').and('not.contain.text', 'Black')
    cy.get('.app').should('have.attr', 'data-visual-style', 'neutral').and('not.have.attr', 'data-visual-backdrop')
    pageShouldBe('rgb(64, 81, 89)')
    fillOf('Rewrite').should('have.css', 'fill', 'rgb(255, 101, 90)')
  })

  it('has a Full Complete setting in the map menu: every level shown as finished, the progress kept', () => {
    const setting = () => cy.contains('.visual-map-menu-toggle', 'Full Complete')
    const unfinished = ($levels: JQuery<HTMLElement>) =>
      [...$levels].filter(node => node.getAttribute('data-state') !== 'completed')
        .map(node => `${node.getAttribute('data-world')} ${node.getAttribute('data-level')}`)
    visit(MAP, { fresh: true })
    mapLevel('Intro', 1).should('have.attr', 'data-state', 'frontier')
    mapLevel('Rewrite', 1).should('have.attr', 'data-state', 'locked')

    // Switched on, every level is drawn as finished, in its world's colour, and every
    // world's title is lit.
    cy.get('.visual-map-menu-btn').click()
    setting().should('be.visible').and('have.attr', 'aria-pressed', 'false').click()
    setting().should('have.attr', 'aria-pressed', 'true')
    cy.get('[data-testid="path-map-level"]').should($levels => {
      expect($levels.length).to.be.greaterThan(90)
      expect(unfinished($levels), 'levels not shown as finished').to.deep.equal([])
    })
    mapLevel('Rewrite', 1).find('circle').should('have.css', 'fill', 'rgb(255, 101, 90)')
    mapLevel('AdvMultiplication', 10).find('circle').should('have.css', 'fill', 'rgb(255, 138, 99)')
    cy.get('[data-testid="path-map-world-label"]').should($labels => {
      expect([...$labels].filter(label => label.getAttribute('data-unlocked') !== 'true').map(label => label.textContent),
        'titles still grey').to.deep.equal([])
    })
    // The setting is saved a moment after it is changed.
    cy.wait(1200)

    // A level far down the map opens, and its Next button isn't held back.
    cy.get('.visual-map-menu-btn').click()
    mapLevel('Neq', 5).click()
    cy.location('pathname').should('include', '/world/Neq/level/5')
    cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.contains('.visual-header button', 'Next level').should('not.be.disabled')

    // It is kept over a reload. Switched off, the map is the player's own again: nothing
    // was marked as finished in the saved progress.
    visit(MAP)
    mapLevel('Rewrite', 1).should('have.attr', 'data-state', 'completed')
    cy.get('.visual-map-menu-btn').click()
    setting().should('have.attr', 'aria-pressed', 'true').click()
    mapLevel('Intro', 1).should('have.attr', 'data-state', 'frontier')
    mapLevel('Rewrite', 1).should('have.attr', 'data-state', 'locked')
    cy.window().then(win => {
      expect(win.localStorage.getItem('game_progress') ?? '', 'the saved progress').not.to.include('"completed":true')
    })
  })

  it('scales the interface up on large windows, without breaking dragging', () => {
    const rootFont = (doc: Document) => Number.parseFloat(doc.defaultView!.getComputedStyle(doc.documentElement).fontSize)
    const mapWidth = (expected: number) => {
      cy.get('[data-testid="visual-path-map"]', { timeout: LOAD_TIMEOUT }).should($map => {
        expect($map[0]!.getBoundingClientRect().width).to.be.closeTo(expected, 8)
      })
    }
    // The map's natural width is 1325: it fits a small window, and grows on a large one.
    cy.viewport(1280, 720)
    visit(MAP, { fresh: true })
    mapWidth(1232)
    cy.document().should(doc => { expect(rootFont(doc)).to.equal(16) })

    cy.viewport(2560, 1440)
    cy.document().should(doc => { expect(rootFont(doc)).to.be.closeTo(28.44, 0.1) })
    mapWidth(1325 * 28.44 / 16)

    visit(level('Proposition', 1))
    cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.get('.visual-header').then($header => {
      const header = $header[0]!.getBoundingClientRect()
      expect(header.height, 'the header grows too').to.be.closeTo(52 * 28.44 / 16, 2)
      cy.get('.visual-header-map-btn').should($button => {
        expect($button[0]!.getBoundingClientRect().bottom, 'its buttons fit').to.be.at.most(header.bottom)
      })
    })
    dragCardToGoal('A')
    shouldBeCompleted()
    cy.viewport(1000, 660)
  })

  describe('never flashes', () => {
    it('opens a Rewrite-only level straight into Rewrite Mode, complete', () => {
      visit(level('Rewrite', 5), { record: true })
      expectRewriteOnlyLevel()
      framesShould(frames => {
        expect(frames.filter(frame => frame.expression).length, 'frames with the expression').to.be.greaterThan(0)
        expect(frames.filter(frame => frame.canvas && !frame.overlay), 'frames with just the canvas').to.deep.equal([])
        expect(frames.filter(frame => frame.expression && !frame.rules), 'frames with the expression but no rules').to.deep.equal([])
      })
    })

    it('keeps the header on screen from one level to the next', () => {
      visit(level('Rewrite', 5), { record: true })
      expectRewriteOnlyLevel()
      clearFrames()
      cy.get('.visual-header-prev-btn').filter(':visible').first().click()
      cy.location('pathname').should('contain', '/world/Rewrite/level/4/visual')
      expectRewriteOnlyLevel()
      headerShouldNameLevel('3', 'General Rewriting (Commutativity)')
      framesShould(frames => {
        expect(frames.some(frame => frame.loading), 'the level did load').to.equal(true)
        expect(frames.filter(frame => !frame.header), 'frames without the header').to.deep.equal([])
      })
    })

    it('paints the map complete, the first time and on coming back', () => {
      visit(level('Rewrite', 5), { record: true })
      expectRewriteOnlyLevel()
      for (let trip = 0; trip < 2; trip += 1) {
        clearFrames()
        cy.get('.visual-header-map-btn').filter(':visible').first().click()
        mapLevel('Rewrite', 6).should('have.attr', 'data-boss', 'true')
        framesShould(frames => {
          const painted = frames.filter(frame => frame.firstLabel !== null)
          expect(painted.length, 'frames with the map').to.be.greaterThan(0)
          expect(painted.filter(frame => frame.firstLabel !== '?'), 'frames with a provisional label').to.deep.equal([])
          expect(painted.filter(frame => !frame.bossDrawn), 'frames with a small boss').to.deep.equal([])
        })
        // Back to the level, which is still locked on the map.
        cy.go('back')
        expectRewriteOnlyLevel()
      }
    })

    it('enters Rewrite Mode with its rules, from the canvas', () => {
      visit(level('Induction', 1), { record: true })
      cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
      clickGoal()
      goalShouldBe('0 + n = n')
      harness(h => h.dragTacticToHyp('induction', 'n'))
      goalShouldBe('0 + 0 = 0')
      notProcessing()
      clearFrames()
      cy.get('[data-testid="goal-card"]').filter(':visible').first().dblclick()
      cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
      framesShould(frames => {
        expect(frames.filter(frame => frame.expression).length, 'frames with the expression').to.be.greaterThan(0)
        expect(frames.filter(frame => frame.expression && !frame.rules), 'frames with the expression but no rules').to.deep.equal([])
      })
    })

    it('stays in Rewrite Mode through an undo', () => {
      visit(level('Rewrite', 1), { record: true })
      expectRewriteOnlyLevel()
      clickRule('hypothesis1')
      relationShouldBe('1 + y = 1 + 2')
      notProcessing()
      clearFrames()
      cy.get('button[aria-label="Undo"]').filter(':visible').first().click()
      relationShouldBe('x + y = 1 + 2')
      framesShould(frames => {
        expect(frames.length, 'frames since the undo').to.be.greaterThan(0)
        expect(frames.filter(frame => !frame.overlay), 'frames outside Rewrite Mode').to.deep.equal([])
      })
    })
  })

  it('plays Successor World with S, in axiom colours', () => {
    openRewriteLevel(1, 'Successor')
    headerShouldNameLevel('0', 'Counting to Two')
    lessonsShouldContain('‘successor function’')
    relationShouldBe('S(S(0)) = 2')
    cy.get('.tr-rule-card[data-rule-label="one_eq_succ_zero"]').filter(':visible').first()
      .should('have.attr', 'data-rule-axiom', 'true')
      .and('have.class', 'tr-axiom-card')
      .find('.tr-symbol').should('contain.text', 'S(0)')
    // No tabs in this level: its four rules are in one list.
    cy.get('.tr-tab-btn').should('not.exist')
    cy.get('.tr-rule-card[data-rule-kind="theorem"]').filter(':visible').should('have.length.at.least', 3)
    rewrite('MyNat.one_eq_succ_zero', 'left', [1], true)
    relationShouldBe('S(1) = 2')
    rewrite('MyNat.two_eq_succ_one', 'left', [], true)
    relationShouldBe('2 = 2')
    check()
  })

  it('shows a screen before a level, and one after it on the way to the next', () => {
    const screen = '[data-testid="level-interstitial"]'
    const nextButton = () => cy.get('.visual-header-next-btn').filter(':visible').first()
    // Successor World's first level opens with the symbols it brings, each as a card
    // with its name, and what is said about it underneath.
    visitWithProgress({ Intro: 1, Rewrite: 6 }, level('Successor', 1))
    cy.get(screen, { timeout: LOAD_TIMEOUT }).should('have.attr', 'data-kind', 'pre')
    // It waits for the level: the loading screen is gone when it comes up.
    cy.get(screen).then(() => {
      expect(Cypress.$('.tr-transformation-overlay .tr-expr-wrapper').length, 'the level behind it').to.equal(1)
    })
    cy.get(screen).should('have.attr', 'data-page', '1').and('have.attr', 'data-pages', '2')
    cy.get(screen).find('.level-interstitial-title').should('have.text', 'Symbols Unlocked!')
    cy.get(screen).find('[data-testid="symbol-card"]').should($cards => {
      expect([...$cards].map(card => card.getAttribute('data-symbol'))).to.deep.equal(['0', 'S(n)', '+'])
      const tops = [...$cards].map(card => Math.round(card.getBoundingClientRect().top))
      expect(new Set(tops).size, 'one row').to.equal(1)
    })
    // The cards are in columns of one width, whatever is said under each: the middle one
    // is right under the title, and the other two are as far from it on either side.
    cy.get(screen).find('[data-testid="symbol-card"]').should($cards => {
      const centre = (element: Element) => { const box = element.getBoundingClientRect(); return box.left + box.width / 2 }
      const title = centre($cards.closest('.level-interstitial').find('.level-interstitial-title')[0]!)
      const [left, middle, right] = [...$cards].map(centre)
      expect(middle, 'the middle card under the title').to.be.closeTo(title, 2)
      expect(middle! - left!, 'evenly spaced').to.be.closeTo(right! - middle!, 2)
    })
    cy.get(screen).find('[data-unlock="S(n)"]').should('contain.text', 'The Successor Function')
      .and('contain.text', 'Zero to one, one to two, and onwards forever.')
    cy.get(screen).find('[data-unlock="0"]').should('contain.text', 'here, zero is a natural number')
    // The button leads to the screen's next page: the axioms.
    cy.contains(`${screen} button`, 'Start').should('not.exist')
    cy.contains(`${screen} button`, 'Next').click()
    cy.get(screen).should('have.attr', 'data-page', '2')
    cy.get(screen).find('[data-testid="symbol-card"]').should('not.exist')
    cy.get(screen).find('.level-interstitial-title').should('have.text', 'Axiom Equalities Unlocked!')
    cy.get(screen).find('.level-interstitial-item').should('have.length', 4)
    // The axioms are the cards of Rewrite Mode, double outline and all, in one row.
    cy.get(screen).find('[data-unlock="one_eq_succ_zero"] .tr-rule-card.tr-axiom-card')
      .should('contain.text', 'one_eq_succ_zero').and('contain.text', '1 ⇒ S(0)')
      .and('have.css', 'border-top-style', 'double')
    cy.get(screen).find('.level-interstitial-item').should($items => {
      const tops = [...$items].map(item => Math.round(item.getBoundingClientRect().top))
      expect(new Set(tops).size, 'one row').to.equal(1)
      const window = $items.closest('.level-interstitial')[0]!.getBoundingClientRect()
      for (const item of $items) {
        expect(item.getBoundingClientRect().left, 'inside the window').to.be.at.least(window.left)
        expect(item.getBoundingClientRect().right, 'inside the window').to.be.at.most(window.right)
      }
    })
    cy.get(screen).should('contain.text', 'building up facts about the natural numbers from scratch')
    // The level is there behind it, dimmed, and the screen fades in.
    cy.get(screen).should($screen => {
      expect(getComputedStyle($screen[0]!).animationName).to.equal('level-interstitial-in')
      expect(getComputedStyle($screen[0]!).backgroundColor).to.match(/^rgba\(.*, 0\.72\)$/u)
    })
    // The header is part of the screen: the dimming starts under it.
    cy.get(screen).should($screen => {
      const header = [...Cypress.$('.visual-header')].find(element => element.getBoundingClientRect().height > 0)!
      expect($screen[0]!.getBoundingClientRect().top, 'under the header').to.be.closeTo(header.getBoundingClientRect().bottom, 1)
    })
    // It fades out as it faded in, and then it is gone.
    cy.contains(`${screen} button`, 'Start').then($start => {
      $start[0]!.click()
      // React draws the click's change in a microtask, and so before this one.
      return Promise.resolve().then(() => {
        const closing = Cypress.$(screen)[0]!
        expect(closing.className).to.contain('closing')
        expect(getComputedStyle(closing).animationName).to.equal('level-interstitial-out')
      })
    })
    cy.get(screen).should('not.exist')
    expectRewriteOnlyLevel()
    // This level has no screen after it, so its button is the usual one.
    nextButton().should('contain.text', 'Next level').and('not.have.attr', 'data-finish')

    // The next level brings two more axioms, with a word about each.
    visitWithProgress({ Intro: 1, Rewrite: 6, Successor: 1 }, level('Successor', 2))
    cy.get(screen, { timeout: LOAD_TIMEOUT }).find('.level-interstitial-title').should('have.text', 'Axiom Equalities Unlocked!')
    cy.get(screen).find('[data-unlock="add_zero"]').should('contain.text', 'n + 0 ⇒ n')
      .and('contain.text', 'Eliminate added zeroes, but only on the right.')
    cy.get(screen).find('[data-unlock="add_succ"]').should('contain.text', 'Move successor functions out to the right addend.')
    cy.contains(`${screen} button`, 'Start').click()
    cy.get(screen).should('not.exist')
    expectRewriteOnlyLevel()
    // It has a screen after it: the way on says Finish, and is shut until the level is done.
    nextButton().should('contain.text', 'Finish').and('have.attr', 'data-finish', 'true').and('be.disabled')
    rewrite('MyNat.one_eq_succ_zero', 'left', [2])
    rewrite('MyNat.add_succ', 'left')
    rewrite('MyNat.add_zero', 'left', [1])
    check()
    nextButton().should('not.be.disabled').click()
    // The theorem the level proved, and then the next level with its own screen.
    cy.get(screen).should('have.attr', 'data-kind', 'post')
    cy.get(screen).find('.level-interstitial-title').should('have.text', 'Equality Unlocked!')
    cy.get(screen).find('[data-unlock="add_one"]').should('contain.text', 'a + 1 ⇒ S(a)')
      .and('contain.text', 'Quickly collapse added ones.')
    // A theorem the player proved has the plain outline.
    cy.get(screen).find('[data-unlock="add_one"] .tr-rule-card').should('not.have.class', 'tr-axiom-card')
    cy.get(screen).should('contain.text', 'available to you as theorems')
    cy.location('pathname').should('contain', '/world/Successor/level/2/')
    cy.contains(`${screen} button`, 'Continue').click()
    cy.location('pathname', { timeout: LOAD_TIMEOUT }).should('contain', '/world/Successor/level/3/')
    // A boss is announced: no cards, its name as the headline.
    cy.get(`${screen}[data-kind="pre"]`, { timeout: LOAD_TIMEOUT }).find('.level-interstitial').should('have.class', 'announcement')
    cy.get(screen).find('.level-interstitial-title').should('have.text', 'Successor World Miniboss')
    cy.get(screen).find('.level-interstitial-text').should('have.text', 'Counting to Four')
    cy.get(screen).find('.level-interstitial-item').should('not.exist')
    cy.contains(`${screen} button`, 'Start').click()
    cy.get(screen).should('not.exist')
    headerShouldNameLevel('2', 'Counting to Four (Miniboss)')
  })

  it('announces a tactic before the level that brings it', () => {
    visitWithProgress({ Intro: 1, Rewrite: 6, Proposition: 8, Successor: 3, SuccessorJoined: 3 }, level('Induction', 1))
    const screen = '[data-testid="level-interstitial"]'
    cy.get(screen, { timeout: LOAD_TIMEOUT }).find('.level-interstitial-title').should('have.text', 'Tactic Unlocked!')
    cy.get(screen).find('[data-unlock="induction"] .tactic-tray-card').should('contain.text', 'induction')
    cy.contains(`${screen} button`, 'Start').click()
    cy.get(screen).should('not.exist')
    cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.get('.visual-header-next-btn').filter(':visible').first().should('contain.text', 'Finish')
  })

  it('shows a proposition as its card of the lower menu, and code with no patch behind it', () => {
    const screen = '[data-testid="level-interstitial"]'
    const upToNeq = { Intro: 1, Rewrite: 6, Proposition: 8, PropositionRight: 8, Successor: 3, SuccessorJoined: 3 }
    const upToInductionJoined = { ...upToNeq, Induction: 4, Neq: 9, NeqJoined: 1 }
    // The ≠ World's level 4 brings an axiom of Proposition Mode, with a word about it.
    visitWithProgress({ ...upToNeq, Neq: 4 }, level('Neq', 5))
    cy.get(screen, { timeout: LOAD_TIMEOUT }).find('.level-interstitial-title').should('have.text', 'Axiom Proposition Unlocked!')
    cy.get(screen).find('[data-unlock="succ_inj"] .statement-card.theorem-tray-held')
      .should('contain.text', 'succ_inj').and('contain.text', 'S(a) = S(b) → a = b')
    cy.get(screen).find('[data-unlock="succ_inj"]').should('contain.text', 'never maps two different inputs to the same output')
    // A card on its own: what is said about it has more room than under a card in a row.
    cy.get(screen).find('[data-unlock="succ_inj"] .level-interstitial-item-text').should($text => {
      expect($text[0]!.getBoundingClientRect().width, 'room for the text').to.be.greaterThan(19 * 16)
    })
    cy.contains(`${screen} button`, 'Start').click()
    cy.get(screen).should('not.exist')

    // The cases tactic comes with the text that was its level's hint. Code in it is
    // set as code, with no background of its own.
    visitWithProgress({ ...upToInductionJoined, InductionJoined: 2 }, level('InductionJoined', 3))
    cy.get(screen, { timeout: LOAD_TIMEOUT }).find('.level-interstitial-title').should('have.text', 'Tactic Unlocked!')
    cy.get(screen).find('[data-unlock="cases"] .tactic-tray-card').should('contain.text', 'cases')
    cy.get(screen).find('[data-unlock="cases"]').should('contain.text', 'does not give you an inductive hypothesis')
    cy.get(screen).find('[data-unlock="cases"] code').first().should($code => {
      const style = getComputedStyle($code[0]!)
      expect(style.backgroundColor, 'no patch behind it').to.equal('rgba(0, 0, 0, 0)')
      expect(style.fontFamily, 'set as code').to.contain('monospace')
      expect(style.paddingLeft).to.equal('0px')
    })
    cy.contains(`${screen} button`, 'Start').click()
    cy.get(screen).should('not.exist')
    // The level itself no longer says it.
    cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.contains('weaker cousin').should('not.exist')

    // Two propositions after a level, in one row, with one text under both.
    visitWithProgress({ ...upToInductionJoined, InductionJoined: 1 }, level('InductionJoined', 1))
    cy.get('.visual-header-next-btn[data-finish="true"]', { timeout: LOAD_TIMEOUT }).filter(':visible').first().click()
    cy.get(`${screen}[data-kind="post"]`).find('.level-interstitial-title').should('have.text', 'Propositions Unlocked!')
    cy.get(screen).find('.level-interstitial-item').should($items => {
      expect([...$items].map(item => item.getAttribute('data-unlock'))).to.deep.equal(['add_right_cancel', 'add_left_cancel'])
      expect(Math.round($items[0]!.getBoundingClientRect().top), 'one row').to.equal(Math.round($items[1]!.getBoundingClientRect().top))
    })
    cy.get(screen).find('.level-interstitial-text').should('have.text', 'Cancel two added terms from either side of an equality.')
  })

  it('announces every boss level, by its title', () => {
    const screen = '[data-testid="level-interstitial"]'
    const announced = (kind: string, name: string) => {
      cy.get(`${screen}[data-kind="pre"]`, { timeout: LOAD_TIMEOUT }).find('.level-interstitial').should('have.class', 'announcement')
      cy.get(screen).find('.level-interstitial-title').should('have.text', kind)
      cy.get(screen).find('.level-interstitial-text').should('have.text', name)
    }
    // A world's boss says so in its title.
    visitWithProgress({ Intro: 1, Rewrite: 5 }, level('Rewrite', 6))
    announced('Rewriting World Boss', 'On The Count of Three')
    // A miniboss is its world's.
    visitWithProgress({
      Intro: 1, Rewrite: 6, Proposition: 8, PropositionRight: 8, Successor: 3, SuccessorJoined: 3,
      Induction: 4, Neq: 9, NeqJoined: 1, InductionJoined: 3,
    }, level('InductionJoined', 4))
    announced('Induction World Miniboss', 'add_right_eq_zero')
    // Its name is set as code, with no patch behind it.
    cy.get(screen).find('.level-interstitial-text code').should('have.css', 'background-color', 'rgba(0, 0, 0, 0)')
  })

  it('keeps the Collection off the map until something is unlocked, then lists it all in two panes', () => {
    const button = '[data-testid="collection-button"]'
    const entry = (label: string) => `[data-testid="collection-entry"][data-entry="${label}"]`
    const detail = '[data-testid="collection-page"]'
    // A new player has nothing to look up.
    visit(MAP, { fresh: true })
    mapLevel('Outro', 1).should('exist')
    cy.get(button).should('not.exist')
    // With Successor World open, its first axioms and its symbols are the player's, and
    // so is the `∀` that Rewrite World's level 3 brought.
    visitWithProgress({ Intro: 1, Rewrite: 6 })
    mapLevel('Outro', 1).should('exist')
    cy.get(button, { timeout: LOAD_TIMEOUT }).should('have.text', 'Collection').click()
    cy.get('[data-testid="collection"]').should('be.visible')
    cy.get('[data-testid="visual-path-map"]').should('not.exist')
    cy.get('[data-testid="collection-count"]', { timeout: LOAD_TIMEOUT }).should('have.text', '8 of 90 unlocked')
    cy.get('[data-testid="collection"] .collection-title').should('have.text', 'Collection')
    // Two panes side by side: the list on the left, and on the right what is picked in
    // it, which to begin with is the first thing the player has.
    cy.get('[data-testid="collection-list"]').then($list => {
      const list = $list[0]!.getBoundingClientRect()
      const pane = Cypress.$(detail)[0]!.getBoundingClientRect()
      expect(pane.left, 'the detail is to the right of the list').to.be.at.least(list.right)
      expect(pane.width, 'and has room').to.be.greaterThan(300)
      expect(Math.abs(pane.top - list.top), 'side by side').to.be.lessThan(40)
    })
    cy.get('[data-testid="collection-kind"]').should('have.text', 'Symbol')
    cy.get(`${detail} [data-testid="symbol-card"]`).should('have.attr', 'data-symbol', '∀').and('contain.text', 'For All')
    cy.get(detail).should('contain.text', 'for any natural number')
    cy.get('[data-testid="collection-source"]').should('have.text', 'Unlocked in Rewrite World 3')
    cy.get(`[data-section="symbol"] ${entry('∀')}`).should('have.class', 'selected')
    // A list within a list: the kind, the tab the game files it under, and its line
    // with what it says.
    cy.get('[data-section="symbol"] .collection-section-summary').should('contain.text', '4 of 16')
    // A kind has its name and its count, and no line about it.
    cy.get('.collection-section-about').should('not.exist')
    cy.get('[data-section="symbol"] .collection-section-summary').should('not.contain.text', 'written with')
    cy.get('[data-section="symbol"] [data-tab]').should('not.exist')
    cy.get(`[data-section="symbol"] ${entry('S(n)')}`).should('contain.text', 'The Successor Function')
    cy.get('[data-section="equality"] [data-tab="012"]').find(entry('one_eq_succ_zero'))
      .should('contain.text', '1 = S(0)')
    cy.get('[data-section="equality"] [data-tab="012"] .collection-tab-summary').should('contain.text', '4 of 4')
    cy.get('[data-section="equality"] .collection-section-summary').should('contain.text', '4 of 33')
    cy.get('[data-section="equality"] [data-tab]').should($tabs => {
      expect([...$tabs].map(tab => tab.getAttribute('data-tab')).slice(0, 2), 'the tabs in the order of the game').to.deep.equal(['+', '*'])
    })
    cy.get('[data-section="tactic"] [data-tab]').should('not.exist')
    // The lines are one under the other, and a tab folds away.
    cy.get('[data-section="equality"] [data-tab="012"] [data-testid="collection-entry"]').should($lines => {
      const rects = [...$lines].map(line => line.getBoundingClientRect())
      for (let index = 1; index < rects.length; index += 1) {
        expect(rects[index]!.top, 'a line under the last').to.be.at.least(rects[index - 1]!.bottom - 1)
      }
    })
    cy.get('[data-section="equality"] [data-tab="012"] .collection-tab-summary').click()
    cy.get('[data-section="equality"]').find(entry('one_eq_succ_zero')).should('not.be.visible')
    cy.get('[data-section="equality"] [data-tab="012"] .collection-tab-summary').click()
    cy.get('[data-section="equality"]').find(entry('one_eq_succ_zero')).should('be.visible')
    cy.get('[data-section="symbol"] [data-testid="collection-entry"]').should('have.length', 16)
    cy.get('[data-section="equality"] [data-testid="collection-entry"]').should('have.length', 33)
    cy.get('[data-section="proposition"] [data-testid="collection-entry"]').should('have.length', 39)
    cy.get('[data-section="tactic"] [data-testid="collection-entry"]').should('have.length', 2)
    // The rest is there greyed out, with no name.
    cy.get('[data-section="proposition"] [data-testid="collection-entry"][data-locked="true"]').should('have.length', 39)
    cy.get('[data-section="tactic"] [data-testid="collection-entry"][data-locked="true"]').should('have.length', 2)
    cy.get('[data-testid="collection-entry"][data-locked="true"]').first().should('have.text', '???')
    cy.get(entry('add_zero')).should('not.exist')
    // Picking a line shows it on the right, in place of what was there: what it is, and
    // where it came from. Nothing pops up over the list.
    cy.get(`${entry('one_eq_succ_zero')} button`).click()
    cy.get(entry('one_eq_succ_zero')).should('have.class', 'selected')
    cy.get(`[data-section="symbol"] ${entry('∀')}`).should('not.have.class', 'selected')
    cy.get(detail).should('be.visible').and('have.attr', 'data-entry', 'one_eq_succ_zero')
    cy.get('[data-testid="collection-kind"]').should('have.text', 'Axiom')
    cy.get(`${detail} .tr-rule-card.tr-axiom-card`).should('contain.text', '1 ⇒ S(0)')
    cy.get(`${detail} [data-testid="symbol-card"]`).should('not.exist')
    // What the screen said under all four of them is said of each.
    cy.get(detail).should('contain.text', 'These first axioms tell us how to expand numbers')
    cy.get('[data-testid="collection-source"]').should('have.text', 'Unlocked in Successor World 0')
    cy.contains(`${detail} button`, 'Back').should('not.exist')
    cy.get('[data-testid="collection-list"]').should('be.visible')
    cy.contains('[data-testid="collection"] button', 'Map').click()
    cy.get('[data-testid="visual-path-map"]').should('exist')
    cy.get(button).should('exist')

    // Further on: a theorem the player proved, with what its screen said, and a tactic.
    visitWithProgress({ Intro: 1, Rewrite: 6, Proposition: 8, Successor: 3, SuccessorJoined: 3 })
    cy.get(button, { timeout: LOAD_TIMEOUT }).click()
    cy.get(`${entry('add_one')} button`, { timeout: LOAD_TIMEOUT }).click()
    cy.get('[data-testid="collection-kind"]').should('have.text', 'Theorem')
    cy.get(detail).should('contain.text', 'Quickly collapse added ones.')
      .and('contain.text', 'a + 1 ⇒ S(a)')
    cy.get('[data-testid="collection-source"]').should('have.text', 'Proved in Successor World 1')
    cy.get(`${entry('add_zero')} button`).click()
    cy.get('[data-testid="collection-kind"]').should('have.text', 'Axiom')
    cy.get(detail).should('contain.text', 'Eliminate added zeroes, but only on the right.')
      .and('not.contain.text', 'Quickly collapse added ones.')
    // Induction World's first level can be played, so its tactic is the player's.
    cy.get(`[data-section="tactic"] ${entry('induction')} button`).click()
    cy.get('[data-testid="collection-kind"]').should('have.text', 'Tactic')
    cy.get('[data-testid="collection-source"]').should('have.text', 'Unlocked in Induction World 0')
    // `zero_add` is proved there, and that level isn't done.
    cy.get(entry('zero_add')).should('not.exist')
    // Proposition World's symbols came with its levels; a symbol with no name of its
    // own is a line all the same.
    cy.get(`[data-section="symbol"] ${entry('→')} button`).click()
    cy.get('[data-testid="collection-kind"]').should('have.text', 'Symbol')
    cy.get('[data-testid="collection-source"]').should('have.text', 'Unlocked in Proposition World 1')
    cy.get(`[data-section="symbol"] ${entry('↔')}`).should('exist')
    // The `∨` comes with the right-hand branch, which can be played but isn't done.
    cy.get(`[data-section="symbol"] ${entry('∨')}`).should('exist')
    cy.get(`[data-section="symbol"] ${entry('False')}`).should('not.exist')

    // A phone has no room for two panes side by side: what is picked is on top.
    cy.viewport(390, 844)
    cy.get('[data-testid="collection-list"]').should($list => {
      const list = $list[0]!.getBoundingClientRect()
      const pane = Cypress.$(detail)[0]!.getBoundingClientRect()
      expect(pane.bottom, 'the detail is above the list').to.be.at.most(list.top + 1)
      expect(list.height, 'the list keeps most of the room').to.be.greaterThan(pane.height)
    })
    cy.viewport(1000, 660)
  })

  it('proves the theorem level with the axioms', () => {
    openRewriteLevel(2, 'Successor')
    headerShouldNameLevel('1', 'add_one')
    lessonsShouldContain('from only the axioms below (and induction)')
    relationShouldBe('a + 1 = S(a)')
    cy.get('.tr-rule-card[data-rule-label="add_zero"]').should('have.attr', 'data-rule-axiom', 'true')
    cy.get('.tr-rule-card[data-rule-label="add_succ"]').should('have.attr', 'data-rule-axiom', 'true')
    // The tabs are NNG's: the numerals' axioms are filed under 012, not under Axioms.
    // There are no hypotheses before level 4, and no tab for them.
    cy.contains('.tr-tab-btn', 'Axioms').should('not.exist')
    cy.contains('.tr-tab-btn', 'Hypotheses').should('not.exist')
    cy.contains('.tr-tab-btn', '012').should('exist')
    // An axiom has a double border: the theorems' own border, drawn twice.
    cy.get('.tr-rule-card[data-rule-label="add_zero"]').filter(':visible').first().then($card => {
      const border = getComputedStyle($card[0]!)
      expect(border.borderTopStyle).to.equal('double')
      // The theorems' colour: Successor World's second, where the classic palette has blue.
      expect(border.borderTopColor, "the theorems' colour").to.equal('rgba(63, 227, 200, 0.4)')
      expect(getComputedStyle($card[0]!, '::after').content, 'no outline of its own inside').to.equal('none')
    })
    rewrite('MyNat.one_eq_succ_zero', 'left', [2])
    rewrite('MyNat.add_succ', 'left')
    rewrite('MyNat.add_zero', 'left', [1])
    relationShouldBe('S(a) = S(a)')
    check()
  })

  it('offers the proved theorem, not in the axiom colour, in the Successor World boss', () => {
    openRewriteLevel(3, 'Successor')
    headerShouldNameLevel('2', 'Counting to Four')
    // Its hint is gone: the screen after the level before says what it said.
    cy.contains('‘theorem’ levels').should('not.exist')
    // The level opens on the + tab, which holds the theorem next to the two axioms.
    cy.contains('.tr-tab-btn', 'Axioms').should('not.exist')
    cy.contains('.tr-tab-btn', 'Theorems').should('not.exist')
    cy.contains('.tr-tab-btn', 'Hypotheses').should('not.exist')
    cy.get('.tr-tab-btn.active').should($tab => expect($tab.text().trim()).to.equal('+'))
    cy.get('.tr-rule-card[data-rule-label="add_one"]').filter(':visible').first()
      .should('have.class', 'visual-emphasize')
    cy.get('.tr-rule-card[data-rule-label="add_one"]').should('exist').and('not.have.attr', 'data-rule-axiom')
    cy.get('.tr-rule-card[data-rule-label="add_zero"]').filter(':visible').first()
      .should('have.attr', 'data-rule-axiom', 'true').and('have.class', 'tr-axiom-card')
    // The numerals' axioms are on their own tab, and no tab lists everything.
    cy.get('.tr-rule-card[data-rule-label="one_eq_succ_zero"]').should('not.exist')
    cy.contains('.tr-tab-btn', 'Everything').should('not.exist')
    cy.get('.tr-tab-btn').should($tabs => {
      expect([...$tabs].map(tab => tab.textContent?.trim())).to.deep.equal(['+', '012'])
    })
    rewrite('MyNat.add_one', 'left')
    rewrite('MyNat.add_one', 'left', [1])
    rewrite('MyNat.add_one', 'left', [1, 1])
    relationShouldBe('S(S(S(1))) = 4')
    rewrite('MyNat.four_eq_succ_three', 'right')
    rewrite('MyNat.three_eq_succ_two', 'right', [1])
    rewrite('MyNat.two_eq_succ_one', 'right', [1, 1])
    relationShouldBe('S(S(S(1))) = S(S(S(1)))')
    check()
  })

  it('crosses the beams (0): Rewriting Mode on the goal, with `hx` as a rule', () => {
    openCanvasLevel('SuccessorJoined', 1)
    headerShouldNameLevel('3', 'Crossing the Beams (0)')
    cy.get('[data-testid="hyp-card"][data-hyp-type="ℕ"]').should('exist')
    goalShouldBe('x + 1 = 2')
    goalHintShouldContain('We will now put Rewriting Mode and Proposition Mode together!')
    goalHintShouldContain('double-clicking the goal')

    harness(h => h.openGoalTransform())
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    lessonsShouldContain('We can use the hypothesis')
    // Rewrite Mode opens on the Hypotheses tab, where `hx` is a grey card.
    cy.get('.tr-tab-btn.active').should('have.text', 'Hypotheses')
    cy.get('.tr-rule-card').filter(':visible').should('have.length', 1)
      .and('have.attr', 'data-rule-label', 'hx').and('have.class', 'tr-hyp-rule-card')
    cy.get('[data-testid="rewrite-check"]').should('not.exist')
    clickRule('hx')
    relationShouldBe('1 + 1 = 2')
    lessonsShouldContain('Now we can just make both sides match as usual.')
    cy.get('[data-testid="rewrite-lessons"]').should('not.contain.text', 'We can use the hypothesis')
    cy.get('.tr-tab-btn').filter((_, tab) => tab.textContent?.trim() === '+').click()
    clickRule('add_one')
    relationShouldBe('S(1) = 2')
    cy.contains('.tr-tab-btn', '012').click()
    clickRuleInDirection('two_eq_succ_one', true)
    relationShouldBe('2 = 2')
    // The check mark closes the goal and takes the player back to Proposition Mode, to
    // the finished proof. The hint that sent them to Rewriting Mode has been followed, so
    // it isn't there any more.
    checkBackToCanvas()
    shouldBeCompleted()
    cy.get('.visual-header.completed', { timeout: LOAD_TIMEOUT }).should('exist')
    cy.contains('double-clicking the goal').should('not.exist')
  })

  it('crosses the beams (1): Rewriting Mode on a hypothesis, then back to the canvas', () => {
    openCanvasLevel('SuccessorJoined', 2)
    headerShouldNameLevel('4', 'Crossing the Beams (1)')
    goalShouldBe('y = 0')
    hintShouldContain('We can also enter hypotheses in Rewriting Mode.')

    // A look at Rewriting Mode without a rewrite leaves the hint up.
    harness(h => h.openHypTransform('hx'))
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    cy.get('.tr-back-btn').click()
    cy.get('.tr-transformation-overlay').should('not.exist')
    hintShouldContain('We can also enter hypotheses in Rewriting Mode.')

    // Rewrite `hx` into `x = 2`, with a hint for each step.
    harness(h => h.openHypTransform('hx'))
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    relationShouldBe('x = 1 + 1')
    hintShouldContain('We need to match the form')
    cy.get('.tr-tab-btn').filter((_, tab) => tab.textContent?.trim() === '+').click()
    clickRule('add_one')
    relationShouldBe('x = S(1)')
    cy.contains('.tr-tab-btn', '012').click()
    clickRuleInDirection('two_eq_succ_one', true)
    relationShouldBe('x = 2')
    hintShouldContain('return back to Proposition Mode')
    arrowStopsShortOf('.back-guide-arrow', '.tr-back-btn')
    cy.get('.tr-back-btn').click()
    cy.get('.tr-transformation-overlay').should('not.exist')
    // Back in Proposition Mode with `hx` rewritten, the hint that asked for it is gone.
    cy.get('[data-testid="hyp-card"][data-hyp-type="x = 2"]', { timeout: LOAD_TIMEOUT }).should('exist')
    cy.contains('We can also enter hypotheses in Rewriting Mode.').should('not.exist')

    // `x = 2` is what `hy` asks for.
    dragCard('x = 2', 'x = 2 → y = 0')
    dragCardToGoal('y = 0')
    shouldBeCompleted()
  })

  it('opens the Successor World boss with its three hypotheses and a hidden hint', () => {
    openCanvasLevel('SuccessorJoined', 3)
    headerShouldNameLevel('5', 'Plug and Chug')
    goalShouldBe('c + c + c + c = 4')
    for (const name of ['ha', 'hb', 'hc']) hypShouldExist(name)
    goalHintShouldContain('Hint:')
    cy.contains('simplifying the hypotheses').should('not.exist')
    cy.contains('button', 'Click to show').click()
    cy.contains('Try simplifying the hypotheses before editing the goal.').should('be.visible')
  })

  it('walks through Specialization Mode in The Third Mode?', () => {
    openCanvasLevel('Neq', 4)
    headerShouldNameLevel('3', 'The Third Mode?')
    goalShouldBe('y = 0')
    cy.get('[data-testid="hyp-card"][data-hyp-type="3 + 3 = 3 + 3 → y = 0"]').should('exist')
    // A hint above the inventory points at the new theorem.
    hintShouldContain("We've unlocked a new proposition")
    arrowStopsShortOf('.combining-instruction-arrow', '[data-testid="theorem-tray-card"][data-theorem-label="reflection"]')
    notProcessing()
    cy.get('[data-testid="theorem-tray-card"][data-theorem-label="reflection"]').click()

    // Specialization Mode, a step at a time. Its hints sit under the header, in the
    // middle, clear of the Back button.
    hintShouldContain('We\'ve now entered Specialization Mode')
    cy.get('[data-testid="specialize-lessons"]').then($lessons => {
      const lessons = $lessons[0]!.getBoundingClientRect()
      const back = Cypress.$('.tr-construction-overlay .tr-back-btn')[0]!.getBoundingClientRect()
      const header = Cypress.$('.tr-construction-overlay .visual-header')[0]!.getBoundingClientRect()
      expect(lessons.top, 'below the header').to.be.at.least(header.bottom)
      expect(lessons.left, 'clear of Back').to.be.greaterThan(back.right)
      // In the middle of what the open proof sidebar leaves of the page.
      const sidebar = Cypress.$('.proof-sidebar.open .proof-sidebar-inner')[0]?.getBoundingClientRect().right ?? 0
      expect(lessons.left + lessons.width / 2, 'in the middle').to.be.closeTo((sidebar + header.right) / 2, 2)
    })
    clickBrick('fn_add')
    hintShouldContain('so now we can slot in the')
    clickBrick('num_3')
    hintShouldContain('so now we can slot in the')
    clickBrick('num_3')
    hintShouldContain('to return to Proposition Mode')
    arrowStopsShortOf('.specialize-guide-arrow', '[data-testid="specialize-done"]')
    cy.get('[data-testid="specialize-done"]').click()
    cy.get('.tr-construction-overlay', { timeout: LOAD_TIMEOUT }).should('not.exist')
    // Back on the canvas with `3 + 3 = 3 + 3`, the opening hint has been followed and is gone.
    hypShouldExist('thm_h')
    cy.contains("We've unlocked a new proposition").should('not.exist')
    harness(h => h.dragHypToHyp('thm_h', 'hy'))
    cy.get('[data-testid="hyp-card"][data-hyp-type="y = 0"]', { timeout: LOAD_TIMEOUT }).should('exist')
    // `3 + 3 = 3 + 3` has been used up, so the state reads as it did at the start: the
    // hint still doesn't come back, here or once the level is finished.
    notProcessing()
    cy.contains("We've unlocked a new proposition").should('not.exist')
    cy.get('.combining-instruction-arrow').should('not.exist')
    dragCardToGoal('y = 0')
    shouldBeCompleted()
    cy.get('.visual-header.completed', { timeout: LOAD_TIMEOUT }).should('exist')
    cy.contains("We've unlocked a new proposition").should('not.exist')
    cy.get('.combining-instruction-arrow').should('not.exist')
  })

  // A window with room for the level's four propositions beside the open proof sidebar
  // and the variables' column: at this suite's usual 1000x660 the last one has nowhere
  // to go but under the goal.
  it('matches `succ_inj` to the hypothesis it is dragged onto, in Pattern Matching', { viewportWidth: 1280, viewportHeight: 720 }, () => {
    // `succ_inj` comes a level earlier, as level 4.
    openCanvasLevel('Neq', 5)
    headerShouldNameLevel('4', 'succ_inj')
    goalShouldBe('x = 3')
    trayShouldHaveCard('succ_inj', true)

    openCanvasLevel('Neq', 6)
    headerShouldNameLevel('5', 'Pattern Matching')
    goalHintShouldContain('straight onto h to automatically apply it')
    goalShouldBe('x = y')
    cy.get('[data-testid="hyp-card"][data-hyp-type="S(S(S(x))) = S(S(S(y)))"]').should('exist')
    // Each drop peels one successor off both sides, with nothing to specialize by hand.
    harness(h => h.dragTheoremToHyp('MyNat.succ_inj', 'h'))
    cy.get('[data-testid="hyp-card"][data-hyp-type="S(S(x)) = S(S(y))"]', { timeout: LOAD_TIMEOUT }).should('exist')
    cy.get('.tr-construction-overlay').should('not.exist')
    harness(h => h.dragTheoremToHyp('MyNat.succ_inj', 'thm_succ_inj'))
    cy.get('[data-testid="hyp-card"][data-hyp-type="S(x) = S(y)"]', { timeout: LOAD_TIMEOUT }).should('exist')
    harness(h => h.dragTheoremToHyp('MyNat.succ_inj', 'thm_succ_inj1'))
    cy.get('[data-testid="hyp-card"][data-hyp-type="x = y"]', { timeout: LOAD_TIMEOUT }).should('exist')
    dragCardToGoal('x = y')
    shouldBeCompleted()
  })

  it('proves `one_ne_zero` by swapping the hypothesis round for `zero_ne_succ`', () => {
    openCanvasLevel('Neq', 8)
    headerShouldNameLevel('7', 'one_ne_zero')
    goalShouldBe('1 ≠ 0')
    trayShouldHaveCard('zero_ne_succ', true)
    // `zero_ne_one` comes with finishing this level, in the next one.
    trayShouldHaveCard('zero_ne_one', false)
    openCanvasLevel('Neq', 9)
    headerShouldNameLevel('8', '2 ≠ 3')
    goalShouldBe('2 ≠ 3')
    trayShouldHaveCard('zero_ne_one', true)
    trayShouldHaveCard('one_ne_zero', true)
  })

  it('proves an equality as a proposition, with Rewrite Mode off for the goal', () => {
    openCanvasLevel('Neq', 1)
    headerShouldNameLevel('0', 'Equalities are Propositions (0)')
    goalShouldBe('∀ (x : ℕ), x = 1 → x = 1')
    goalHintShouldContain('Equalities are propositions just like any other')
    clickGoal()
    goalShouldBe('x = 1 → x = 1')
    clickGoal()
    goalShouldBe('x = 1')
    // Rewrite Mode on the goal is refused, with a warning in place of the overlay.
    harness(h => h.openGoalTransform())
    cy.get('[data-testid="canvas-warning"]').should('contain.text', 'Rewrite Mode is off for the goal')
    cy.get('.tr-transformation-overlay').should('not.exist')
    dragToGoal('h')
    shouldBeCompleted()
  })

  it('swaps the sides of an equality in Rewriting Mode on a hypothesis, with a hint to the button', () => {
    openCanvasLevel('Neq', 2)
    headerShouldNameLevel('1', 'Equalities are Propositions (1)')
    goalHintShouldContain('reverse the direction of an equality')
    // The two hypotheses are given.
    goalShouldBe('2 = y')
    hypShouldExist('hx')
    hypShouldExist('hy')
    harness(h => h.openHypTransform('hx'))
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    relationShouldBe('1 = x')
    hintShouldContain('Use the swap button')
    arrowStopsShortOf('.swap-guide-arrow', '.tr-swap-btn')
    // The swap button sits left of the direction toggle.
    cy.get('.tr-swap-btn').then($swap => {
      cy.get('.tr-direction-btn').then($direction => {
        expect($swap[0]!.getBoundingClientRect().right).to.be.lessThan($direction[0]!.getBoundingClientRect().left)
      })
    })
    cy.get('.tr-swap-btn').click()
    relationShouldBe('x = 1')
    // Undo swaps back.
    cy.get('.tr-transformation-overlay button[aria-label="Undo"]').click()
    relationShouldBe('1 = x')
    hintShouldContain('Use the swap button')
    cy.get('.tr-swap-btn').click()
    relationShouldBe('x = 1')
    cy.get('.tr-back-btn').click()
    cy.get('.tr-transformation-overlay').should('not.exist')
    // `x = 1` feeds the implication; its result swaps the same way.
    harness(h => h.dragHypToHyp('hx', 'hy'))
    hypShouldExist('h')
    harness(h => h.openHypTransform('h'))
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    relationShouldBe('y = 2')
    cy.get('.tr-swap-btn').click()
    relationShouldBe('2 = y')
    cy.get('.tr-back-btn').click()
    cy.get('.tr-transformation-overlay').should('not.exist')
    dragToGoal('h')
    shouldBeCompleted()
  })

  it('resets Rewriting Mode to how it opened, and the whole level in Rewrite World', () => {
    // On a hypothesis in a Proposition-mode level, Reset undoes what was done since
    // entering, no more, and Undo brings it back.
    openCanvasLevel('SuccessorJoined', 2)
    harness(h => h.openHypTransform('hx'))
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    relationShouldBe('x = 1 + 1')
    // Successor World hides the swap-sides button throughout.
    cy.get('.tr-swap-btn').should('not.exist')
    cy.get('.tr-transformation-overlay button[aria-label="Reset"]').should('be.disabled')
    cy.get('.tr-tab-btn').filter((_, tab) => tab.textContent?.trim() === '+').click()
    clickRule('add_one')
    relationShouldBe('x = S(1)')
    cy.get('.tr-transformation-overlay button[aria-label="Reset"]').should('not.be.disabled').click()
    relationShouldBe('x = 1 + 1')
    cy.get('.tr-transformation-overlay').should('exist')
    cy.get('.tr-transformation-overlay button[aria-label="Reset"]').should('be.disabled')
    cy.get('.tr-transformation-overlay button[aria-label="Undo"]').should('not.be.disabled').click()
    relationShouldBe('x = S(1)')
    cy.get('.tr-transformation-overlay').should('exist')
    cy.get('.tr-back-btn').click()
    cy.get('.tr-transformation-overlay').should('not.exist')
    cy.get('[data-testid="hyp-card"][data-hyp-name="hx"]').should('contain.text', 'S')

    // In Rewrite World, Reset starts the level over.
    openRewriteLevel(1)
    cy.get('button[aria-label="Reset"]').filter(':visible').should('be.disabled')
    clickRule('hypothesis1')
    relationShouldBe('1 + y = 1 + 2')
    cy.get('button[aria-label="Reset"]').filter(':visible').should('not.be.disabled').click()
    relationShouldBe('x + y = 1 + 2')
  })

  it('proves zero_add by induction on the canvas, fixing `n` first', () => {
    visit(level('Induction', 1))
    cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
    headerShouldNameLevel('0', 'zero_add')
    goalShouldBe('∀ (n : ℕ), 0 + n = n')
    goalHintShouldContain('to fix')
    clickGoal()
    goalShouldBe('0 + n = n')
    // One induction per branch: the tactic's count says so.
    const inductionUses = () => cy.get('[data-testid="tactic-uses"][data-tactic-name="induction"]').filter(':visible')
    inductionUses().should('have.text', 'x1')
    cy.get('#visual_tactic_induction').should('not.have.class', 'disabled')
    harness(h => h.dragTacticToHyp('induction', 'n'))
    goalShouldBe('0 + 0 = 0')
    goalHintShouldContain('to enter Rewrite Mode')
    // Spent in the base case and in the inductive step: greyed out, and refused.
    inductionUses().should('have.text', 'x0')
    cy.get('#visual_tactic_induction').should('have.class', 'disabled')
    notProcessing()
    cy.get('[data-testid="stream-nav-next"]:not(:disabled)', { timeout: LOAD_TIMEOUT }).filter(':visible').first().click()
    // Splitting `n` names the new number `n1`, and the proof says so.
    goalShouldBe('0 + S n1 = S n1')
    hypShouldExist('n1')
    hypShouldExist('hn1')
    cy.contains('induction n with n1 hn1').should('exist')
    inductionUses().should('have.text', 'x0')
    harness(h => h.dragTacticToHyp('induction', 'n1'))
    notProcessing()
    goalShouldBe('0 + S n1 = S n1')
    // Undo gives the use back; taking it again spends it again.
    cy.get('button[aria-label="Undo"]').filter(':visible').first().click()
    goalShouldBe('0 + n = n')
    inductionUses().should('have.text', 'x1')
    harness(h => h.dragTacticToHyp('induction', 'n'))
    goalShouldBe('0 + 0 = 0')
    inductionUses().should('have.text', 'x0')

    // The base case: the check mark closes it, and the other branch is left.
    notProcessing()
    cy.get('[data-testid="goal-card"]').filter(':visible').first().dblclick()
    cy.get('.tr-transformation-overlay', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    clickRule('add_zero')
    relationShouldBe('0 = 0')
    notProcessing()
    cy.get('[data-testid="rewrite-check"]').should('be.visible').click()
    cy.get('.tr-transformation-overlay', { timeout: LOAD_TIMEOUT }).should('not.exist')

    // The inductive step.
    nextUnsolvedBranch()
    goalShouldBe('0 + S n1 = S n1')
    notProcessing()
    cy.get('[data-testid="goal-card"]').filter(':visible').first().dblclick()
    cy.get('.tr-transformation-overlay', { timeout: LOAD_TIMEOUT }).should('be.visible')
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    clickRule('add_succ')
    relationShouldBe('S(0 + n1) = S(n1)')
    clickRule('hn1')
    relationShouldBe('S(n1) = S(n1)')
    // Back on the canvas, a click closes a goal `a = a`: it needn't be entered again.
    cy.get('.tr-back-btn').click()
    cy.get('.tr-transformation-overlay').should('not.exist')
    goalShouldBe('S n1 = S n1')
    notProcessing()
    cy.get('[data-testid="goal-card"]').filter(':visible').first().should('have.class', 'clickable').click()
    shouldBeCompleted()
  })

  it('still introduces and splits goals with a click', () => {
    openCanvasLevel('Neq', 3)
    goalShouldBe('∀ (x : ℕ), x = 1 → x = 1 ∧ (S x = 2 ∨ 1 = 0)')
    cy.get('[data-testid="goal-card"]').filter(':visible').first().should('have.class', 'clickable')
    clickGoal()
    goalShouldBe('x = 1 → x = 1 ∧ (S x = 2 ∨ 1 = 0)')
    clickGoal()
    goalShouldBe('x = 1 ∧ (S x = 2 ∨ 1 = 0)')
    clickGoal()
    goalShouldBe('x = 1')
  })

  it('shows the Induction World boss its hint until induction has been done twice, the right way round', () => {
    const hint = 'Don’t forget to apply double induction properly!'
    const inductionUses = () => cy.get('[data-testid="tactic-uses"][data-tactic-name="induction"]').filter(':visible')
    openCanvasLevel('InductionDouble', 2)
    headerShouldNameLevel('9', 'Equality in ℕ is Decidable (Induction World Boss)')
    goalShouldBe('∀ (a b : ℕ), a = b ∨ a ≠ b')
    goalHintShouldContain(hint)
    // Two inductions on each branch of this proof.
    cy.contains('.theorem-tray-panel button', 'Tactics').click()
    inductionUses().should('have.text', 'x2')
    // Fix `a`, induct on it, fix `b`: the hint is still up.
    clickGoal()
    goalShouldBe('∀ (b : ℕ), a = b ∨ a ≠ b')
    harness(h => h.dragTacticToHyp('induction', 'a'))
    goalShouldBe('∀ (b : ℕ), 0 = b ∨ 0 ≠ b')
    inductionUses().should('have.text', 'x1')
    clickGoal()
    goalShouldBe('0 = b ∨ 0 ≠ b')
    goalHintShouldContain(hint)
    // The second induction takes it down, and is the last one here.
    harness(h => h.dragTacticToHyp('induction', 'b'))
    goalShouldBe('0 = 0 ∨ 0 ≠ 0')
    cy.contains(hint).should('not.exist')
    inductionUses().should('have.text', 'x0')
    // It stays down in the other case of `a`, where the hypothesis holds for every `b`.
    clickGoal('click_goal_left')
    goalShouldBe('0 = 0')
    cy.contains(hint).should('not.exist')
  })

  it('brings the Induction World boss its hint back when `b` was fixed before the induction on `a`', () => {
    const hint = 'Don’t forget to apply double induction properly!'
    openCanvasLevel('InductionDouble', 2)
    goalShouldBe('∀ (a b : ℕ), a = b ∨ a ≠ b')
    clickGoal()
    goalShouldBe('∀ (b : ℕ), a = b ∨ a ≠ b')
    clickGoal()
    goalShouldBe('a = b ∨ a ≠ b')
    harness(h => h.dragTacticToHyp('induction', 'a'))
    goalShouldBe('0 = b ∨ 0 ≠ b')
    goalHintShouldContain(hint)
    // In the `S(a1)` case the inductive hypothesis is about this one `b` only.
    notProcessing()
    cy.get('[data-testid="stream-nav-next"]:not(:disabled)', { timeout: LOAD_TIMEOUT }).filter(':visible').first().click()
    goalShouldBe('S a1 = b ∨ S a1 ≠ b')
    goalHintShouldContain(hint)
    harness(h => h.dragTacticToHyp('induction', 'b'))
    goalShouldBe('S a1 = 0 ∨ S a1 ≠ 0')
    goalHintShouldContain(hint)
  })

  it('teaches double induction: induct on `a` before `b` is introduced, or it is a dead end', () => {
    const opening = 'try inducting on'
    const deadEnd = 'This is a dead end'
    openCanvasLevel('InductionDouble', 1)
    headerShouldNameLevel('8', 'Double Induction')
    goalShouldBe('∀ (a b : ℕ), a + a = b + b → a = b')
    goalHintShouldContain(opening)
    // With `a` fixed the advice still holds.
    clickGoal()
    goalShouldBe('∀ (b : ℕ), a + a = b + b → a = b')
    goalHintShouldContain(opening)
    // Fixing `b` as well is going too far, whatever is tried from there.
    clickGoal()
    goalShouldBe('a + a = b + b → a = b')
    goalHintShouldContain(deadEnd)
    cy.contains(opening).should('not.exist')
    harness(h => h.dragTacticToHyp('induction', 'a'))
    goalShouldBe('0 + 0 = b + b → 0 = b')
    goalHintShouldContain(deadEnd)
    // Two undos lead back to where the advice was, and following it clears the hints.
    for (let undo = 0; undo < 2; undo += 1) {
      notProcessing()
      cy.get('button[aria-label="Undo"]').filter(':visible').first().click()
    }
    goalShouldBe('∀ (b : ℕ), a + a = b + b → a = b')
    goalHintShouldContain(opening)
    harness(h => h.dragTacticToHyp('induction', 'a'))
    goalShouldBe('∀ (b : ℕ), 0 + 0 = b + b → 0 = b')
    cy.contains(opening).should('not.exist')
    cy.contains(deadEnd).should('not.exist')
    // Nor do they come back with `b` fixed after the induction, as it should be.
    clickGoal()
    goalShouldBe('0 + 0 = b + b → 0 = b')
    notProcessing()
    cy.contains(opening).should('not.exist')
    cy.contains(deadEnd).should('not.exist')
  })

  it('carries Induction World on past the ≠ World: cancellation, `cases`, and what comes with each level', () => {
    const uses = (tactic: string) => cy.get(`[data-testid="tactic-uses"][data-tactic-name="${tactic}"]`)
    const trayIsLoaded = () => cy.get('[data-testid="theorem-tray-card"]', { timeout: LOAD_TIMEOUT }).should('have.length.greaterThan', 0)
    const tacticsTab = () => cy.get('.theorem-tray-panel .tr-tab-btn[data-tray-tab="tactics"]')
    openCanvasLevel('InductionJoined', 1)
    headerShouldNameLevel('4', 'add_right_cancel')
    goalShouldBe('∀ (a b n : ℕ), a + n = b + n → a = b')
    trayIsLoaded()
    trayShouldHaveCard('add_right_cancel', false)
    // Finishing it gives the theorem and its mirror image. The numbers of the next
    // one are named on its card as they are in its level.
    openCanvasLevel('InductionJoined', 2)
    headerShouldNameLevel('5', 'add_right_eq_self')
    goalShouldBe('∀ (a b : ℕ), a + b = a → b = 0')
    trayIsLoaded()
    trayShouldHaveCard('add_right_cancel', true)
    trayShouldHaveCard('add_left_cancel', true)
    trayShouldHaveCard('add_left_eq_self', false)
    // Level 6 brings the cases card, once, and allows no induction: a tactic is only
    // for the levels that say so.
    openCanvasLevel('InductionJoined', 3)
    headerShouldNameLevel('6', 'Zero or No Zero?')
    goalShouldBe('∀ (n : ℕ), n = 0 ∨ n ≠ 0')
    trayIsLoaded()
    trayShouldHaveCard('add_left_eq_self', true)
    // The Tactics tab glows while a use is left on the branch, selected or not.
    tacticsTab().should('have.class', 'tactics-ready').click()
    tacticsTab().should('have.class', 'tactics-ready')
    uses('cases').filter(':visible').should('have.text', 'x1')
    uses('induction').filter(':visible').should('have.text', 'x0')
    cy.get('#visual_tactic_induction').should('have.class', 'disabled')
    clickGoal()
    goalShouldBe('n = 0 ∨ n ≠ 0')
    harness(h => h.dragTacticToHyp('induction', 'n'))
    notProcessing()
    goalShouldBe('n = 0 ∨ n ≠ 0')
    harness(h => h.dragTacticToHyp('cases', 'n'))
    goalShouldBe('0 = 0 ∨ 0 ≠ 0')
    uses('cases').filter(':visible').should('have.text', 'x0')
    tacticsTab().should('not.have.class', 'tactics-ready')
    // The new number is `n1`, in the proof as on the canvas.
    cy.contains('cases n with n1').should('exist')
    notProcessing()
    cy.get('[data-testid="stream-nav-next"]:not(:disabled)', { timeout: LOAD_TIMEOUT }).filter(':visible').first().click()
    goalShouldBe('S n1 = 0 ∨ S n1 ≠ 0')
    hypShouldExist('n1')
    // Level 7 allows it twice. `add_left_eq_zero` is ≤ World's to give.
    openCanvasLevel('InductionJoined', 4)
    headerShouldNameLevel('7', 'add_right_eq_zero (Miniboss)')
    goalShouldBe('∀ (a b : ℕ), a + b = 0 → a = 0')
    trayIsLoaded()
    trayShouldHaveCard('add_left_eq_zero', false)
    cy.contains('.theorem-tray-panel button', 'Tactics').click()
    uses('cases').filter(':visible').should('have.text', 'x2')
    uses('induction').filter(':visible').should('have.text', 'x0')
    clickGoal()
    goalShouldBe('∀ (b : ℕ), a + b = 0 → a = 0')
    clickGoal()
    goalShouldBe('a + b = 0 → a = 0')
    harness(h => h.dragTacticToHyp('cases', 'b'))
    goalShouldBe('a + 0 = 0 → a = 0')
    uses('cases').filter(':visible').should('have.text', 'x1')
    tacticsTab().should('have.class', 'tactics-ready')
    clickGoal()
    goalShouldBe('a = 0')
    hypShouldExist('h')
    // Past the barrier Induction World has the swap button again.
    harness(h => h.openHypTransform('h'))
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    cy.get('.tr-swap-btn').should('be.visible')
  })

  it('points out a branch whose goal can\'t be true, in `add_right_eq_zero`', () => {
    const hint = 'Sometimes proof branch goals are clearly impossible.'
    openCanvasLevel('InductionJoined', 4)
    for (const goal of ['∀ (b : ℕ), a + b = 0 → a = 0', 'a + b = 0 → a = 0', 'a = 0']) {
      clickGoal()
      goalShouldBe(goal)
    }
    cy.contains(hint).should('not.exist')
    // Splitting `a`: nothing to say about `0 = 0`, but `S(a1) = 0` can't be proved.
    harness(h => h.dragTacticToHyp('cases', 'a'))
    goalShouldBe('0 = 0')
    cy.contains(hint).should('not.exist')
    notProcessing()
    cy.get('[data-testid="stream-nav-next"]:not(:disabled)', { timeout: LOAD_TIMEOUT }).filter(':visible').first().click()
    goalShouldBe('S a1 = 0')
    goalHintShouldContain(hint)
    goalHintShouldContain('create a hypothesis')
    // The hint is for that goal alone: it leaves with it.
    notProcessing()
    cy.get('[data-testid="stream-nav-prev"]:not(:disabled)', { timeout: LOAD_TIMEOUT }).filter(':visible').first().click()
    goalShouldBe('0 = 0')
    cy.contains(hint).should('not.exist')
  })

  it('refutes a careless statement of Fermat in the bonus off the last boss', () => {
    openCanvasLevel('PowerBonus', 1)
    headerShouldNameLevel('B0', "Refute Fermat's Last Theorem?")
    goalShouldBe('(∀ (a b c n : ℕ), n > 2 → a ^ n + b ^ n ≠ c ^ n) → False')
    clickGoal()
    goalShouldBe('False')
    hypShouldExist('h')
    // `0 ^ 3 + 0 ^ 3 = 0 ^ 3`: the numbers the specialization view would be given.
    for (const [name, source, binder, value] of [
      ['thm_a', 'h', 'a', '0'], ['thm_b', 'thm_a', 'b', '0'], ['thm_c', 'thm_b', 'c', '0'], ['thm_n', 'thm_c', 'n', '3'],
    ]) {
      harness(h => h.runPlayerTactic(`specialize_forall_as ${name} ${source} ${binder} (${value})`))
      hypShouldExist(name)
    }
    cy.get('[data-testid="hyp-card"][data-hyp-name="thm_n"]').should('have.attr', 'data-hyp-type', '3 > 2 → (0 ^ 3 + 0 ^ 3 = 0 ^ 3 → False)')
    // It proves `False` backwards. `3 > 2` is `¬ 3 ≤ 2`, so a click assumes `3 ≤ 2`,
    // and that gives a number like any `≤`.
    dragToGoal('thm_n')
    goalShouldBe('3 > 2')
    cy.get('[data-testid="goal-card"]').filter(':visible').first().should('have.class', 'clickable')
    clickGoal()
    goalShouldBe('False')
    cy.get('[data-testid="hyp-card"][data-hyp-name="h1"]').should('have.attr', 'data-hyp-type', '3 ≤ 2')
    clickHyp('h1')
    hypShouldExist('c1')
    cy.get('[data-testid="hyp-card"][data-hyp-type="2 = 3 + c1"]').should('have.attr', 'data-hyp-name', 'h2')
    // Peel the successors off `2 = 3 + c1` until zero is one.
    const play = (tactic: string, expected: string) => {
      harness(h => h.runPlayerTactic(tactic))
      cy.get(`[data-testid="hyp-card"][data-hyp-type="${expected}"]`, { timeout: LOAD_TIMEOUT }).should('exist')
    }
    play('drag_rw_hyp_rhs_at h2 [MyNat.three_eq_succ_two] [1]', '2 = S(2) + c1')
    play('drag_rw_hyp_rhs h2 [MyNat.succ_add]', '2 = S(2 + c1)')
    play('drag_rw_hyp_lhs h2 [MyNat.two_eq_succ_one]', 'S(1) = S(2 + c1)')
    harness(h => h.dragTheoremToHyp('MyNat.succ_inj', 'h2'))
    hypShouldExist('thm_succ_inj')
    play('drag_rw_hyp_rhs_at thm_succ_inj [MyNat.two_eq_succ_one] [1]', '1 = S(1) + c1')
    play('drag_rw_hyp_rhs thm_succ_inj [MyNat.succ_add]', '1 = S(1 + c1)')
    play('drag_rw_hyp_lhs thm_succ_inj [MyNat.one_eq_succ_zero]', 'S(0) = S(1 + c1)')
    harness(h => h.dragTheoremToHyp('MyNat.succ_inj', 'thm_succ_inj'))
    hypShouldExist('thm_succ_inj1')
    play('drag_rw_hyp_rhs_at thm_succ_inj1 [MyNat.one_eq_succ_zero] [1]', '0 = S(0) + c1')
    play('drag_rw_hyp_rhs thm_succ_inj1 [MyNat.succ_add]', '0 = S(0 + c1)')
    harness(h => h.dragTheoremToHyp('MyNat.zero_ne_succ', 'thm_succ_inj1'))
    hypShouldExist('thm_zero_ne_succ')
    dragToGoal('thm_zero_ne_succ')
    // The other branch: the equation, in Rewrite Mode.
    nextUnsolvedBranch()
    goalShouldBe('0 ^ 3 + 0 ^ 3 = 0 ^ 3')
    harness(h => h.openGoalTransform())
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    rewrite('MyNat.three_eq_succ_two', 'left', [1, 2])
    rewrite('MyNat.zero_pow_succ', 'left', [1])
    rewrite('MyNat.three_eq_succ_two', 'left', [2, 2])
    rewrite('MyNat.zero_pow_succ', 'left', [2])
    rewrite('MyNat.add_zero', 'left')
    rewrite('MyNat.three_eq_succ_two', 'right', [2])
    rewrite('MyNat.zero_pow_succ', 'right')
    relationShouldBe('0 = 0')
    checkBackToCanvas()
    shouldBeCompleted()
  })

  it('plays the first of ≤ World\u2019s bonus levels: `>` is a `¬`, so a click assumes the `≤`', () => {
    openCanvasLevel('LessOrEqualBonus', 1)
    headerShouldNameLevel('A0', '>')
    goalShouldBe('∀ (n : ℕ), S n > n')
    goalHintShouldContain('We define')
    // No `cases` and no `induction` here.
    cy.contains('.theorem-tray-panel button', 'Tactics').click()
    cy.get('[data-testid="tactic-uses"][data-tactic-name="induction"]').filter(':visible').should('have.text', 'x0')
    cy.get('[data-testid="tactic-uses"][data-tactic-name="cases"]').filter(':visible').should('have.text', 'x0')
    clickGoal()
    goalShouldBe('S n > n')
    clickGoal()
    goalShouldBe('False')
    cy.get('[data-testid="hyp-card"][data-hyp-name="h"]').should('have.attr', 'data-hyp-type', 'S(n) ≤ n')
    clickHyp('h')
    hypShouldExist('c1')
    const play = (tactic: string, expected: string) => {
      harness(h => h.runPlayerTactic(tactic))
      cy.get(`[data-testid="hyp-card"][data-hyp-type="${expected}"]`, { timeout: LOAD_TIMEOUT }).should('exist')
    }
    cy.get('[data-testid="hyp-card"][data-hyp-type="n = S(n) + c1"]').should('have.attr', 'data-hyp-name', 'h1')
    play('drag_rw_hyp_rhs h1 [MyNat.succ_add]', 'n = S(n + c1)')
    play('drag_rw_hyp_rhs h1 [← MyNat.add_succ]', 'n = n + S(c1)')
    play('symm at h1', 'n + S(c1) = n')
    harness(h => h.dragTheoremToHyp('MyNat.add_right_eq_self', 'h1'))
    hypShouldExist('thm_add_right_eq_self')
    play('symm at thm_add_right_eq_self', '0 = S(c1)')
    harness(h => h.dragTheoremToHyp('MyNat.zero_ne_succ', 'thm_add_right_eq_self'))
    hypShouldExist('thm_zero_ne_succ')
    dragToGoal('thm_zero_ne_succ')
    shouldBeCompleted()
    // The next level has the theorem this one proved.
    openCanvasLevel('LessOrEqualBonus', 2)
    headerShouldNameLevel('A1', 'Irreflexivity of >')
    goalShouldBe('∀ (n : ℕ), ¬n > n')
    cy.get('[data-testid="theorem-tray-card"]', { timeout: LOAD_TIMEOUT }).should('have.length.greaterThan', 0)
    trayShouldHaveCard('lt_succ_self', true)
  })

  it('opens ≤ World with a witness to build: a hint for the right one, and one for any other', () => {
    const opening = 'propose some ‘witness’'
    const wrong = 'We won’t be able to solve the goal with that witness.'
    const right = 'Now we can just finish the level as usual.'
    openCanvasLevel('LessOrEqual', 1)
    headerShouldNameLevel('0', '∃')
    goalShouldBe('∃ n, n + n = 0')
    goalHintShouldContain(opening)
    // A witness that doesn't work: no hint is written for that goal, so the one for
    // every other state shows.
    harness(h => h.runPlayerTactic('refine Exists.intro (1) ?_'))
    goalShouldBe('1 + 1 = 0')
    goalHintShouldContain(wrong)
    goalHintShouldContain('Use the undo button')
    cy.contains(opening).should('not.exist')
    notProcessing()
    cy.get('button[aria-label="Undo"]').filter(':visible').first().click()
    goalShouldBe('∃ n, n + n = 0')
    goalHintShouldContain(opening)
    cy.contains(wrong).should('not.exist')
    // The one that does.
    harness(h => h.runPlayerTactic('refine Exists.intro (0) ?_'))
    goalShouldBe('0 + 0 = 0')
    goalHintShouldContain(right)
    cy.contains(wrong).should('not.exist')
    harness(h => h.openGoalTransform())
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    rewrite('MyNat.add_zero', 'left')
    relationShouldBe('0 = 0')
    checkBackToCanvas()
    shouldBeCompleted()
    cy.contains(wrong).should('not.exist')
  })

  it('defines ≤ as `∃ c, y = x + c`, on every card, and names the numbers it gives c1, c2', () => {
    openCanvasLevel('LessOrEqual', 2)
    headerShouldNameLevel('1', 'leq_refl')
    goalShouldBe('∀ (n : ℕ), n ≤ n')
    goalHintShouldContain('We define')
    goalHintShouldContain('∃ c, y = x + c')
    clickGoal()
    goalShouldBe('n ≤ n')
    cy.get('[data-testid="goal-card"]').filter(':visible').first().find('.statement-atomic-form')
      .should('have.text', '∃ c, n = n + c')
    // `add_left_eq_zero` is given here; Induction World's `add_right_eq_zero` isn't
    // around yet, since this part of ≤ World doesn't wait for it.
    cy.get('[data-testid="theorem-tray-card"]', { timeout: LOAD_TIMEOUT }).should('have.length.greaterThan', 0)
    trayShouldHaveCard('add_left_eq_zero', true)
    trayShouldHaveCard('add_right_eq_zero', false)
    // The theorem this level proves, and the one that comes with it, are for later.
    trayShouldHaveCard('leq_refl', false)
    trayShouldHaveCard('eq_implies_leq', false)
    openCanvasLevel('LessOrEqual', 3)
    headerShouldNameLevel('2', 'Non-negativity of ℕ')
    goalShouldBe('∀ (n : ℕ), 0 ≤ n')
    cy.get('[data-testid="theorem-tray-card"]', { timeout: LOAD_TIMEOUT }).should('have.length.greaterThan', 0)
    trayShouldHaveCard('leq_refl', true)
    trayShouldHaveCard('eq_implies_leq', true)
    cy.get('[data-testid="theorem-tray-card"][data-theorem-label="eq_implies_leq"]')
      .should('contain.text', 'a = b → a ≤ b')

    // Level 4's hint points at the hypothesis to click.
    openCanvasLevel('LessOrEqual', 5)
    headerShouldNameLevel('4', '∃ Hypotheses')
    hintShouldContain('hypothesis to create a witness')

    openCanvasLevel('LessOrEqual', 6)
    headerShouldNameLevel('5', 'Transitivity of ≤')
    goalShouldBe('a ≤ c')
    cy.contains('there-exists hypotheses').should('not.exist')
    // One of the level's numbers is `c`, so the definition's own number takes the next
    // name the card can give it.
    cy.get('[data-testid="goal-card"]').filter(':visible').first().find('.statement-atomic-form')
      .should('have.text', '∃ c2, c = a + c2')
    // A theorem's card writes the definition out the same way.
    cy.get('[data-testid="theorem-tray-card"]', { timeout: LOAD_TIMEOUT }).should('have.length.greaterThan', 0)
    trayShouldHaveCard('leq_refl', true)
    cy.get('[data-testid="theorem-tray-card"][data-theorem-label="leq_refl"] .statement-atomic-form')
      .should('have.text', '∃ c, n = n + c')
    // The numbers the two hypotheses give are `c1` and `c2`: `c` is the level's own.
    clickHyp('hxy')
    hypShouldExist('c1')
    cy.get('[data-testid="hyp-card"][data-hyp-type="b = a + c1"]').should('exist')
    clickHyp('hyz')
    hypShouldExist('c2')
    cy.get('[data-testid="hyp-card"][data-hyp-type="c = b + c2"]').should('exist')
  })

  it('gives a proposition derived in the level a colour of its own, the world\'s fifth', () => {
    // The ≠ World, `riverside`: theorem cards are its third colour, a pale blue-grey,
    // and what the player derives is its fifth, a violet.
    openCanvasLevel('Neq', 7)
    headerShouldNameLevel('6', '≠')
    clickGoal()
    goalShouldBe('∀ (y : ℕ), S x = S y ∧ x ≠ y → False')
    clickGoal()
    goalShouldBe('S x = S y ∧ x ≠ y → False')
    clickGoal()
    goalShouldBe('False')
    hypShouldExist('h')
    clickHyp('h')
    hypShouldExist('left')
    harness(h => h.dragTheoremToHyp('MyNat.succ_inj', 'left'))
    hypShouldExist('thm_succ_inj')
    const borderOf = (selector: string) => cy.get(selector).filter(':visible').first()
      .then($card => getComputedStyle($card[0]!).borderTopColor)
    borderOf('[data-testid="hyp-card"][data-hyp-name="thm_succ_inj"]').should('equal', 'rgba(199, 155, 255, 0.55)')
    borderOf('[data-testid="theorem-tray-card"]').should('equal', 'rgba(213, 220, 234, 0.4)')
    // A hypothesis of the level's own stays grey.
    borderOf('[data-testid="hyp-card"][data-hyp-name="left"]').should('not.contain', '199, 155, 255')
  })

  it('makes the theorem cards of the lower menu one height, whatever they hold', { viewportWidth: 1280, viewportHeight: 720 }, () => {
    // Late in the game the menu holds cards of every kind: a name on a line of its own,
    // a definition under a `≠` or a `≤`, a `∀` line.
    openCanvasLevel('AdvMultiplication', 10)
    cy.get('[data-testid="theorem-tray-card"]', { timeout: LOAD_TIMEOUT }).should('have.length.greaterThan', 0)
    const heights = new Set<number>()
    let cards = 0
    const measure = () => cy.get('[data-testid="theorem-tray-card"]').filter(':visible').each($card => {
      const card = $card[0]!
      const box = card.getBoundingClientRect()
      heights.add(Math.round(box.height))
      cards += 1
      // Nothing is cut off: every line is inside the card.
      for (const line of Array.from(card.children)) {
        const inner = line.getBoundingClientRect()
        expect(inner.top, `${card.getAttribute('data-theorem-label')}: top`).to.be.at.least(box.top)
        expect(inner.bottom, `${card.getAttribute('data-theorem-label')}: bottom`).to.be.at.most(box.bottom)
      }
    })
    const turnPages = (remaining: number): void => {
      measure()
      cy.get('.theorem-tray-panel .tr-nav-btn[aria-label="Next"]').then($next => {
        if ($next.is(':disabled') || remaining <= 0) return
        const before = Cypress.$('.theorem-tray-panel .tr-page-indicator').text()
        cy.wrap($next).click()
        cy.get('.theorem-tray-panel .tr-page-indicator').should('not.have.text', before)
        // The page slides in, and its buttons are back once it has.
        cy.wait(400)
        turnPages(remaining - 1)
      })
    }
    // The game has no tab for all of them (`VisualNoAllTab`): every tab is looked at.
    cy.get('[data-testid="theorem-category-tabs"] .tr-tab-btn').should('have.length.greaterThan', 3).each($tab => {
      cy.wrap($tab).click()
      cy.wait(400)
      turnPages(40)
    })
    cy.contains('[data-testid="theorem-category-tabs"] .tr-tab-btn', 'All').should('not.exist')
    cy.then(() => {
      expect(cards, 'cards looked at').to.be.at.least(30)
      expect([...heights], 'card heights').to.have.length(1)
    })
    // No label of the interface is set in capitals.
    cy.get('.visual-page *, .proof-sidebar *').should($elements => {
      const capitals = [...$elements].filter(element => getComputedStyle(element).textTransform === 'uppercase')
      expect(capitals.map(element => element.className), 'labels in capitals').to.deep.equal([])
    })
    // `succ_inj` is on the Peano tab, where the game files it.
    cy.contains('[data-testid="theorem-category-tabs"] .tr-tab-btn', 'Peano').click()
    cy.get('[data-testid="theorem-tray-card"][data-theorem-label="succ_inj"]').should('exist')
    // On a PC the row of tabs that ends the menu has more room under its labels than the
    // row above it, for the operating system's own bar.
    cy.get('.theorem-tray-panel .tr-dock-tabs').should($rows => {
      expect($rows.length, 'rows of tabs').to.equal(2)
      const [upper, lowest] = [...$rows].map(row => ({
        height: row.getBoundingClientRect().height,
        padding: parseFloat(getComputedStyle(row.querySelector('.tr-tab-btn')!).paddingBottom),
      }))
      expect(lowest!.padding, 'room under the lowest labels').to.be.greaterThan(upper!.padding + 10)
      expect(lowest!.height, 'the lowest row is the taller').to.be.greaterThan(upper!.height + 10)
    })
  })

  it('plays Logic World in its own colours', () => {
    openCanvasLevel('Logic', 1)
    headerShouldNameLevel('A0', 'Double Elimination is Equivalent To LEM')
    goalShouldBe('(∀ (P : Prop), P ∨ ¬P) ↔ ∀ (P : Prop), ¬¬P → P')
    cy.get('.app').should('have.attr', 'data-world-scheme', 'frost')
    cy.document().its('documentElement').should(html => {
      expect(html.style.backgroundColor).to.equal('rgb(62, 68, 76)')
    })
    // The goal separates into its two directions.
    clickGoal()
    goalShouldBe('(∀ (P : Prop), P ∨ ¬P) → ∀ (P : Prop), ¬¬P → P')
  })

  it('plays the bonus off Proposition World level 9 on the canvas', () => {
    openCanvasLevel('PropositionBonus', 1)
    headerShouldNameLevel('A0', 'Many Such Cases')
    clickGoal()
    goalShouldBe('B ∨ (A → C) → A ∧ B ∨ (A ∨ B → C)')
    clickGoal()
    goalShouldBe('A ∧ B ∨ (A ∨ B → C)')
    clickHyp('h')
    clickHyp('h1')
    // Both sides are `A` and `B`: the left of the goal.
    clickGoal('click_goal_left')
    goalShouldBe('A ∧ B')
    clickGoal()
    goalShouldBe('A')
    dragToGoal('left')
    nextUnsolvedBranch()
    goalShouldBe('B')
    dragToGoal('left1')
  })

  /** The level's play log: every move tried, as it was sent to Lean. */
  const playLog = (win: Cypress.AUTWindow) => {
    const key = Object.keys(win.localStorage).find(name => name.startsWith('playlog/'))
    expect(key, 'a play log').to.be.a('string')
    return JSON.parse(win.localStorage.getItem(key!) ?? '[]') as
      Array<{ playTactic: string; leanTactic: string | null; succeeded: boolean }>
  }
  /** The hypothesis of this type that was made last, in the branch on screen. */
  const hypNamed = (win: Cypress.AUTWindow, type: string) => {
    const types = ((win as HarnessWindow).__visualTestHarness!.getCurrentStreamSnapshot() as unknown as
      { hypTypes: Record<string, string> }).hypTypes
    const names = Object.keys(types).filter(name => types[name] === type)
    expect(names, `a hypothesis ${type}`).to.have.length.at.least(1)
    return names.at(-1)!
  }
  /** Wait for the last move to have left a hypothesis of this type, then use its name. */
  const withHyp = (type: string, run: (name: string, win: Cypress.AUTWindow) => unknown) => {
    cy.window({ timeout: LOAD_TIMEOUT }).should(win => {
      expect((win as HarnessWindow).__visualTestHarness!.getProofAudit().processing).to.equal(false)
      hypNamed(win, type)
    })
    cy.window().then(win => run(hypNamed(win, type), win))
  }
  const cardNamed = (name: string) => `[data-testid="hyp-card"][data-hyp-name="${name}"]`
  /** Specialize the `∀` hypothesis of this type to what these bricks build. */
  const specializeTo = (type: string, bricks: string[]) => {
    withHyp(type, name => cy.get(cardNamed(name)).filter(':visible').first().click())
    cy.get('.tr-construction-overlay', { timeout: LOAD_TIMEOUT }).should('be.visible')
    for (const brick of bricks) clickBrick(brick)
    cy.get('[data-testid="specialize-done"]').click()
    cy.get('.tr-construction-overlay', { timeout: LOAD_TIMEOUT }).should('not.exist')
  }
  /** Apply two hypotheses to one another, and drop the `False` that gives on the goal. */
  const contradict = (first: string, second: string) => {
    withHyp(first, (name, win) => (win as HarnessWindow).__visualTestHarness!.dragHypToHyp(name, hypNamed(win, second)))
    withHyp('False', name => dragWithPointer(cardNamed(name), '[data-testid="goal-card"]'))
  }
  const dragTypeToGoal = (type: string) => {
    withHyp(type, (name, win) => (win as HarnessWindow).__visualTestHarness!.dragHypToGoal(name))
  }
  const clickHypOfType = (type: string) => {
    withHyp(type, (name, win) => (win as HarnessWindow).__visualTestHarness!.clickHyp(name))
  }

  it('keeps a level\'s variables in a column of their own, where they only change places', () => {
    openCanvasLevel('Proposition', 3)
    headerShouldNameLevel('2', 'Implications (1)')
    const variables = '[data-testid="type-column"] [data-testid="hyp-card"]'
    const namesShouldBe = (expected: string[]) => cy.get(variables).should($cards => {
      expect([...$cards].map(card => card.getAttribute('data-hyp-name'))).to.deep.equal(expected)
    })
    namesShouldBe(['A', 'B'])
    // The column runs down the left of the canvas, under the header, and the other
    // cards keep clear of it.
    clickGoal()
    goalShouldBe('(A → B) → B')
    hypShouldExist('h')
    cy.get('[data-testid="type-column"]').then($column => {
      const column = $column[0]!.getBoundingClientRect()
      const header = Cypress.$('.visual-header')[0]!.getBoundingClientRect()
      // At the left edge of the canvas, which starts where the open proof sidebar ends.
      const sidebar = Cypress.$('.proof-sidebar.open .proof-sidebar-inner')[0]?.getBoundingClientRect().right ?? 0
      expect(column.left, 'at the left edge').to.be.closeTo(sidebar, 1)
      expect(column.top, 'under the header').to.be.at.least(header.bottom)
      const card = Cypress.$('[data-testid="hyp-card"][data-hyp-name="h"]')[0]!.getBoundingClientRect()
      expect(card.left, 'a proposition is right of the column').to.be.greaterThan(column.right)
    })

    // Dragged far out to the right and down, `A` stays in its column and moves below `B`.
    const drag = (name: string, dx: number, dy: number, during?: () => void) => {
      cy.get(`${variables}[data-hyp-name="${name}"]`).then($card => {
        const rect = $card[0]!.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const y = rect.top + rect.height / 2
        const at = (clientX: number, clientY: number) => ({ clientX, clientY, pointerId: 7, isPrimary: true, button: 0, force: true })
        cy.wrap($card).trigger('pointerdown', at(x, y))
        cy.get('body').trigger('pointermove', at(x + dx / 2, y + dy / 2)).trigger('pointermove', at(x + dx, y + dy))
        during?.()
        cy.get('body').trigger('pointerup', at(x + dx, y + dy))
      })
    }
    // A variable is picked up like any card: the grab cursor, not the up-and-down arrows.
    cy.get(`${variables}[data-hyp-name="A"]`).should('have.css', 'cursor', 'grab')
    drag('A', 500, 95, () => {
      cy.get('.hyp-overlay-card').should('be.visible').then($dragged => {
        const dragged = $dragged[0]!.getBoundingClientRect()
        const column = Cypress.$('[data-testid="type-column"]')[0]!.getBoundingClientRect()
        expect(dragged.left, 'still inside the column').to.be.at.least(column.left)
        expect(dragged.right, 'still inside the column').to.be.at.most(column.right)
      })
    })
    namesShouldBe(['B', 'A'])
    // Dropped over the goal or over a proposition, a variable makes no move in the proof.
    cy.get('[data-testid="goal-card"]').then($goal => {
      const goal = $goal[0]!.getBoundingClientRect()
      const card = Cypress.$(`${variables}[data-hyp-name="B"]`)[0]!.getBoundingClientRect()
      drag('B', goal.left - card.left, goal.top - card.top)
    })
    cy.get(variables).should('have.length', 2)
    cy.window().then(win => {
      const log = JSON.parse(win.localStorage.getItem(
        Object.keys(win.localStorage).find(name => name.startsWith('playlog/'))!) ?? '[]') as Array<{ playTactic: string }>
      expect(log.map(entry => entry.playTactic), 'only the click on the goal').to.deep.equal(['click_goal'])
    })
    goalShouldBe('(A → B) → B')

    // The Proof tab is the first of the controls at the bottom left, before Reset and Undo.
    cy.get('.proof-sidebar-tab').should('not.exist')
    cy.get('.visual-page:not(.tr-overlay) .tr-controls').then($controls => {
      const [tab, reset, undo] = [...$controls.children()].map(child => child.getBoundingClientRect())
      expect($controls.children().first().attr('data-testid')).to.equal('proof-tab')
      expect(tab!.right, 'Proof, then Reset').to.be.at.most(reset!.left)
      expect(reset!.right, 'Reset, then Undo').to.be.at.most(undo!.left)
      const column = Cypress.$('[data-testid="type-column"]')[0]!.getBoundingClientRect()
      expect(tab!.top, 'under the column').to.be.at.least(column.bottom - 1)
      // Tall enough to click easily: nearly twice the buttons beside it.
      expect(tab!.height, 'a tall tab').to.be.at.least(reset!.height * 1.9)
    })
    // It closes the proof sidebar, which starts open on a desktop, and opens it again;
    // the controls stay beside the sidebar's edge either way.
    cy.get('.proof-sidebar').should('have.class', 'open')
    cy.get('[data-testid="proof-tab"]').filter(':visible').first().click()
    cy.get('.proof-sidebar').should('not.have.class', 'open')
    cy.get('[data-testid="proof-tab"]').filter(':visible').first().should($tab => {
      expect($tab[0]!.getBoundingClientRect().left, 'at the left edge').to.be.closeTo(0, 1)
    })
    cy.get('[data-testid="proof-tab"]').filter(':visible').first().click()
    cy.get('.proof-sidebar').should('have.class', 'open')
    cy.get('[data-testid="proof-tab"]').filter(':visible').first().should($tab => {
      const sidebar = Cypress.$('.proof-sidebar.open .proof-sidebar-inner')[0]!.getBoundingClientRect().right
      expect($tab[0]!.getBoundingClientRect().left, 'at the sidebar edge').to.be.closeTo(sidebar, 1)
    })
  })

  it('still takes a tactic dropped on a variable in the column', () => {
    openCanvasLevel('Induction', 1)
    clickGoal()
    goalShouldBe('0 + n = n')
    cy.get('[data-testid="type-column"] [data-testid="hyp-card"][data-hyp-name="n"]').should('be.visible')
    // The hint's arrow runs from the tactic to the variable's card in the column.
    arrowStopsShortOf('.tactic-hyp-instruction-arrow', '[data-testid="type-column"] [data-testid="hyp-card"][data-hyp-name="n"]')
    notProcessing()
    dragWithPointer('[data-tactic-name="induction"]', '[data-testid="type-column"] [data-testid="hyp-card"][data-hyp-name="n"]')
    goalShouldBe('0 + 0 = 0')
  })

  it('draws a dragged card over the proof panel, never behind it', () => {
    openCanvasLevel('Induction', 1)
    clickGoal()
    goalShouldBe('0 + n = n')
    cy.get('.proof-sidebar').should('have.class', 'open')
    cy.get('#visual_tactic_induction').filter(':visible').then($card => {
      const rect = $card[0]!.getBoundingClientRect()
      const panel = Cypress.$('.proof-sidebar.open .proof-sidebar-inner')[0]!.getBoundingClientRect()
      const [x, y] = [rect.left + rect.width / 2, rect.top + rect.height / 2]
      // To the middle of the panel's right edge, so the card lies half over it.
      const [toX, toY] = [panel.right, panel.top + panel.height / 2]
      const at = (clientX: number, clientY: number) => ({ clientX, clientY, pointerId: 7, isPrimary: true, button: 0, force: true })
      cy.wrap($card).trigger('pointerdown', at(x, y))
      cy.get('body').trigger('pointermove', at((x + toX) / 2, (y + toY) / 2)).trigger('pointermove', at(toX, toY))
      cy.get('.tactic-overlay-card').should('be.visible').then($dragged => {
        const dragged = $dragged[0]!.getBoundingClientRect()
        expect(dragged.left, 'over the panel').to.be.lessThan(panel.right)
        // Where it lies over the panel, what is on top belongs to the dragged card's layer.
        const onTop = $dragged[0]!.ownerDocument.elementFromPoint((dragged.left + Math.min(dragged.right, panel.right)) / 2, dragged.top + dragged.height / 2)
        expect(Boolean(onTop?.closest('.visual-drag-layer')), `on top of the panel (found ${onTop?.tagName}.${onTop?.className})`).to.equal(true)
        const layer = $dragged.closest('.visual-drag-layer')
        expect(layer.length, 'in the layer for dragged cards').to.equal(1)
        const above = Number(getComputedStyle(layer[0]!).zIndex)
        expect(above, 'above the panel').to.be.greaterThan(Number(getComputedStyle(Cypress.$('.proof-sidebar')[0]!).zIndex))
        // It looks as it does in the tray it came from.
        expect(getComputedStyle($dragged[0]!).fontSize).to.equal(getComputedStyle($card[0]!).fontSize)
      })
      cy.get('body').trigger('pointerup', at(toX, toY))
    })
    // Let go over the panel, it made no move.
    cy.get('.tactic-overlay-card').should('not.exist')
    goalShouldBe('0 + n = n')
  })

  it('fits the map to the window, a phone\'s included, so it never scrolls sideways', () => {
    const fits = () => {
      cy.get('[data-testid="visual-world-map"]', { timeout: LOAD_TIMEOUT }).should($scroller => {
        const scroller = $scroller[0]!
        expect(scroller.scrollWidth, 'nothing to scroll sideways').to.be.at.most(scroller.clientWidth)
        const map = scroller.querySelector('[data-testid="visual-path-map"]')!.getBoundingClientRect()
        const box = scroller.getBoundingClientRect()
        expect(map.left, 'the map starts inside').to.be.at.least(box.left)
        expect(map.right, 'and ends inside').to.be.at.most(box.right)
      })
    }
    visit(MAP, { fresh: true })
    mapLevel('Intro', 1).should('exist')
    fits()
    for (const [width, height] of [[390, 844], [844, 390], [1024, 600], [2560, 1440]] as const) {
      cy.viewport(width, height)
      cy.wait(300)
      fits()
    }
  })

  it('merges a hypothesis dropped on an identical one', () => {
    openCanvasLevel('Proposition', 3)
    clickGoal()
    goalShouldBe('(A → B) → B')
    clickGoal()
    goalShouldBe('B')
    // `A` applied to `A → B`, twice: two cards `B`.
    harness(h => (h as unknown as { dragHypToHyp(a: string, b: string): Promise<void> }).dragHypToHyp('h', 'h1'))
    hypShouldExist('h2')
    harness(h => (h as unknown as { dragHypToHyp(a: string, b: string): Promise<void> }).dragHypToHyp('h', 'h1'))
    hypShouldExist('h3')
    notProcessing()
    dragWithPointer(cardNamed('h3'), cardNamed('h2'))
    notProcessing()
    // The dragged one goes and the one it was dropped on stays.
    cy.get(cardNamed('h3')).should('not.exist')
    cy.get(cardNamed('h2')).should('be.visible')
    cy.get('[data-testid="hyp-card"][data-hyp-type="B"]').filter(':visible').should('have.length', 1)
    cy.window().then(win => {
      expect(playLog(win).at(-1)).to.include({ playTactic: 'drag_to h3 h2', leanTactic: 'clear h3', succeeded: true })
    })
    dragToGoal('h2')
    shouldBeCompleted()
  })

  it('lets a finished proof be looked over, but not changed', () => {
    openCanvasLevel('SuccessorJoined', 1)
    goalHintShouldContain('double-clicking the goal')
    harness(h => h.openGoalTransform())
    rewrite('hx', 'left', [1])
    rewrite('MyNat.add_one', 'left')
    rewrite('MyNat.two_eq_succ_one', 'right')
    relationShouldBe('S(1) = S(1)')
    checkBackToCanvas()
    shouldBeCompleted()
    const steps = (win: Cypress.AUTWindow) => playLog(win).length
    let finishedSteps = 0
    cy.window().then(win => {
      finishedSteps = steps(win)
      expect(finishedSteps, 'moves in the finished proof').to.equal(4)
    })
    // Its cards still move about: onto the canvas, and off the goal they are dropped on.
    const boxOf = (selector: string) => Cypress.$(selector).filter(':visible')[0]!.getBoundingClientRect()
    let before: DOMRect
    cy.get(cardNamed('hx')).should('be.visible').then(() => { before = boxOf(cardNamed('hx')) })
    dragWithPointer(cardNamed('hx'), '[data-testid="goal-card"]')
    cy.get(cardNamed('hx')).should(() => {
      const card = boxOf(cardNamed('hx'))
      const goal = boxOf('.goal-card-with-info')
      expect(Math.abs(card.left - before.left) + Math.abs(card.top - before.top), 'the card moved').to.be.greaterThan(40)
      const apart = card.right <= goal.left || card.left >= goal.right || card.bottom <= goal.top || card.top >= goal.bottom
      expect(apart, 'and is not left under the goal').to.equal(true)
    })
    // A hypothesis and the goal open in Rewrite Mode, where nothing can be changed.
    cy.get(cardNamed('hx')).filter(':visible').first().dblclick()
    cy.get('.tr-transformation-overlay', { timeout: LOAD_TIMEOUT }).should('be.visible')
    relationShouldBe('x = 1')
    cy.get('.tr-transformation-overlay [aria-label="Undo"]').should('be.disabled')
    cy.get('.tr-transformation-overlay [aria-label="Reset"]').should('be.disabled')
    cy.get('.tr-back-btn').click()
    cy.get('[data-testid="goal-card"]').filter(':visible').first().dblclick()
    cy.get('.tr-transformation-overlay', { timeout: LOAD_TIMEOUT }).should('be.visible')
    relationShouldBe('S(1) = S(1)')
    cy.get('.tr-rule-card').filter(':visible').first().click()
    cy.wait(500)
    relationShouldBe('S(1) = S(1)')
    cy.get('.tr-back-btn').click()
    cy.window().then(win => expect(steps(win), 'no move was made').to.equal(finishedSteps))
    // The level's hint sent the player to Rewriting Mode, where the proof was finished, so
    // it has been gone since.
    cy.contains('double-clicking the goal').should('not.exist')
  })

  it('plays Fast Reversing, bonus A1: a right-click swaps the direction, a swipe sets it', () => {
    openRewriteLevel(2, 'RewriteBonus')
    headerShouldNameLevel('A1', 'Fast Reversing')
    lessonsShouldContain('right-click anywhere on the lower menu')
    relationShouldBe('(((a + b) + a) + b) + a = a')
    const reversed = (expected: boolean) =>
      cy.get('.tr-direction-btn').should(expected ? 'have.class' : 'not.have.class', 'active-reverse')
    /** A finger swiping across the lower menu, between two points of its top edge. */
    const swipe = (from: number, to: number) => cy.get('.tr-rule-dock').then($dock => {
      const box = $dock[0]!.getBoundingClientRect()
      const touch = (x: number) => [{ clientX: box.left + x, clientY: box.top + 6, identifier: 1 }]
      cy.wrap($dock).trigger('touchstart', { touches: touch(from), changedTouches: touch(from), force: true })
        .trigger('touchend', { touches: [], changedTouches: touch(to), force: true })
    })
    clickRule('a_plus_b')
    relationShouldBe('((b + a) + b) + a = a')
    cy.get('.tr-rule-dock').rightclick('topLeft')
    reversed(true)
    clickRule('b_plus_a')
    relationShouldBe('(a + b) + a = a')
    // To the right for left-to-right rules, to the left for right-to-left ones.
    swipe(200, 420)
    reversed(false)
    clickRule('a_plus_b')
    relationShouldBe('b + a = a')
    swipe(420, 200)
    reversed(true)
    swipe(420, 200)
    reversed(true)
    clickRule('b_plus_a')
    relationShouldBe('a = a')
    check()
    shouldBeCompleted()
  })

  it('moves the map tooltip along when the map scrolls under a still mouse', () => {
    visitWithProgress({ Intro: 1 })
    mapLevel('Rewrite', 2).then($level => {
      const box = $level[0]!.getBoundingClientRect()
      const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, pointerType: 'mouse', force: true }
      cy.wrap($level).trigger('pointermove', at).trigger('pointerover', at)
      cy.get('.map-level-name-tooltip').should('have.length', 1).and('contain.text', 'Lots of Rewriting')
      // One row further down, the mouse is over the next level, with no pointer event.
      cy.get('[data-testid="visual-world-map"]').then($scroller => {
        const next = Cypress.$('[data-testid="path-map-level"][data-world="Rewrite"][data-level="3"]')[0]!.getBoundingClientRect()
        $scroller[0]!.scrollTop += next.top - box.top
      })
      cy.get('.map-level-name-tooltip').should('have.length', 1).and('contain.text', 'Reverse Rewriting')
    })
  })

  it('plays Fast Rewriting, bonus A0, with seven clicks', () => {
    openRewriteLevel(1, 'RewriteBonus')
    headerShouldNameLevel('A0', 'Fast Rewriting')
    lessonsShouldContain('you can also click them')
    const sum = (zeros: number): string => zeros === 1 ? '0' : zeros === 2 ? '0 + 0' : `(${sum(zeros - 1)}) + 0`
    relationShouldBe(`${sum(8)} = 0`)
    for (let zeros = 7; zeros >= 1; zeros -= 1) {
      clickRule('zero_add_zero')
      relationShouldBe(`${sum(zeros)} = 0`)
    }
    check()
    shouldBeCompleted()
  })

  it('opens Fixed Point as bonus B0', () => {
    openRewriteLevel(1, 'RewriteBonusB')
    headerShouldNameLevel('B0', 'Fixed Point')
    relationShouldBe('f(x) = 0')
  })

  it('rewrites with `add_zero` backwards, on the term the rule is dropped on', () => {
    openRewriteLevel(2, 'Successor')
    relationShouldBe('a + 1 = S(a)')
    cy.get('.tr-direction-btn').click()
    // `n ⇐ n + 0` fits any term, so the drop says which one. NNVG has no Mathlib,
    // whose `nth_rewrite` this used to be sent as.
    notProcessing()
    showRule('add_zero')
    dragWithPointer('.tr-rule-card[data-rule-label="add_zero"]', '.tr-expr-wrapper [data-expr-text="a"]')
    relationShouldBe('(a + 0) + 1 = S(a)')
    // A click rewrites the first term it fits: the whole left side.
    clickRule('add_zero')
    relationShouldBe('((a + 0) + 1) + 0 = S(a)')
  })

  it('puts Rewrite Mode hints right above the relation, centred across it, leaving room for the check mark', () => {
    const lessonsSitAboveTheRelation = (signOffCentre: boolean) => {
      cy.get('[data-testid="rewrite-lessons"]', { timeout: LOAD_TIMEOUT }).should($lessons => {
        const lessons = $lessons[0]!.getBoundingClientRect()
        const sign = Cypress.$('.tr-relation-op')[0]!.getBoundingClientRect()
        const whole = Cypress.$('.tr-expr-wrapper')[0]!.getBoundingClientRect()
        const view = Cypress.$('.tr-expr-scroller')[0]!.getBoundingClientRect()
        // As much of the relation as is in view: a long one scrolls sideways.
        const row = { left: Math.max(whole.left, view.left), right: Math.min(whole.right, view.right) }
        const centre = (box: { left: number, right: number }) => (box.left + box.right) / 2
        expect(lessons.height, 'lessons are laid out').to.be.greaterThan(20)
        expect(sign.top - lessons.bottom, 'room for the check mark, and no more than that and an arrow').to.be.within(48, 110)
        // Centred on the whole relation, wherever its sign falls.
        expect(Math.abs(centre(lessons) - centre(row)), 'centred on the relation').to.be.lessThan(3)
        if (signOffCentre) expect(Math.abs(centre(sign) - centre(row)), 'the sign is off centre').to.be.greaterThan(40)
      })
    }
    openRewriteLevel(1)
    lessonsShouldContain('Drag a hypothesis onto a term')
    lessonsSitAboveTheRelation(false)
    // A long left side puts the sign well to the right; the hint stays in the middle.
    openRewriteLevel(6)
    lessonsShouldContain('final boss of Rewriting World')
    lessonsSitAboveTheRelation(true)
    // Rewrite Mode opened from a canvas level puts its hints there too.
    openCanvasLevel('SuccessorJoined', 2)
    harness(h => h.openHypTransform('hx'))
    cy.get('.tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    lessonsShouldContain('We need to match the form')
    lessonsSitAboveTheRelation(false)
  })

  it('pages Rewrite Mode rules without overflow on a large window', () => {
    cy.viewport(2560, 1440)
    openCanvasLevel('Multiplication', 5)
    clickGoal()
    goalShouldBe('2 * m = m + m')
    harness(h => h.openGoalTransform())
    cy.get('.tr-transformation-overlay .tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    // The interface is scaled up here, and the gap between the cards with it.
    const pageHoldsItsCards = () => {
      cy.get('.tr-transformation-overlay .tr-rule-page').should($page => {
        const page = $page[0]!.getBoundingClientRect()
        // (A card of another page can be in the document for a moment, out of sight,
        // while the cards are measured.)
        const cards = [...$page.find('.tr-rule-card:not(.tr-rule-card-off-page)')].map(element => element.getBoundingClientRect())
        expect(cards.length, 'cards on the page').to.be.greaterThan(0)
        expect(Math.min(...cards.map(box => box.left)), 'first card').to.be.at.least(page.left - 1)
        expect(Math.max(...cards.map(box => box.right)), 'last card').to.be.at.most(page.right + 1)
      })
    }
    const walk = (remaining: number): void => {
      pageHoldsItsCards()
      cy.get('.tr-transformation-overlay .tr-nav-btn[aria-label="Next rule"]').then($next => {
        if ($next.is(':disabled') || remaining <= 0) return
        const before = Cypress.$('.tr-transformation-overlay .tr-page-indicator').text()
        cy.wrap($next).click()
        cy.get('.tr-transformation-overlay .tr-page-indicator').should('not.have.text', before)
        walk(remaining - 1)
      })
    }
    cy.get('.tr-transformation-overlay .tr-page-indicator').should('contain.text', 'Page 1 of')
    walk(8)
    cy.viewport(1000, 660)
  })

  it('pages Rewrite Mode rules without waiting for a font that never arrives', () => {
    cy.viewport(1920, 1080)
    cy.visit(level('InductionJoined', 1), {
      onBeforeLoad(win) {
        win.localStorage.setItem('telemetryConsent', 'refused')
        // A font that stays loading: the dock used to wait for it with every rule on
        // one row, the first and the last cut off by the edges of the window.
        Object.defineProperty(win.document.fonts, 'status', { get: () => 'loading' })
        Object.defineProperty(win.document.fonts, 'ready', { get: () => new Promise(() => {}) })
      },
    })
    cy.get('[data-testid="goal-card"]', { timeout: LOAD_TIMEOUT }).should('be.visible')
    for (const goal of ['∀ (b n : ℕ), a + n = b + n → a = b', '∀ (n : ℕ), a + n = b + n → a = b', 'a + n = b + n → a = b', 'a = b']) {
      clickGoal()
      goalShouldBe(goal)
    }
    harness(h => h.openGoalTransform())
    cy.get('.tr-transformation-overlay .tr-rule-dock[data-layout-ready="true"]', { timeout: LOAD_TIMEOUT }).should('exist')
    const pageHoldsItsCards = () => {
      cy.get('.tr-transformation-overlay .tr-rule-page').should($page => {
        const page = $page[0]!.getBoundingClientRect()
        const cards = [...$page.find('.tr-rule-card:not(.tr-rule-card-off-page)')].map(element => element.getBoundingClientRect())
        expect(cards.length, 'cards on the page').to.be.greaterThan(0)
        expect(Math.min(...cards.map(box => box.left)), 'first card').to.be.at.least(page.left - 1)
        expect(Math.max(...cards.map(box => box.right)), 'last card').to.be.at.most(page.right + 1)
      })
    }
    pageHoldsItsCards()
    // The game has no tab with every rule on it, so no tab here needs a second page;
    // each of them is looked at, and the other direction: the page fits at once, and
    // stays fitting.
    cy.contains('.tr-transformation-overlay .tr-tab-btn', 'Everything').should('not.exist')
    cy.get('.tr-transformation-overlay .tr-tab-btn.active').should('have.text', 'Hypotheses')
    cy.get('.tr-transformation-overlay .tr-tab-btn').should('have.length.greaterThan', 2).each($tab => {
      cy.wrap($tab).click()
      pageHoldsItsCards()
      cy.wait(500)
      pageHoldsItsCards()
    })
    cy.get('.tr-transformation-overlay .tr-tab-btn').first().click()
    cy.get('.tr-transformation-overlay .tr-rule-dock').rightclick()
    pageHoldsItsCards()
    cy.wait(500)
    pageHoldsItsCards()
    cy.viewport(1000, 660)
  })

  it('survives a phone viewport that shrinks and grows back within a frame', () => {
    cy.viewport(390, 844)
    openRewriteLevel(1)
    lessonsShouldContain('Drag a hypothesis onto a term')
    // A screenshot shrinks the viewport to Cypress's own window and restores it at
    // once. The hints' position used to be an object in state, which that resize
    // sent through layout effects without end ("Maximum update depth exceeded").
    cy.screenshot('nnvg-phone-rewrite-level', { capture: 'viewport', overwrite: true })
    cy.get('.tr-transformation-overlay').should('exist')
    cy.contains('Maximum update depth').should('not.exist')
    clickRule('hypothesis1')
    relationShouldBe('1 + y = 1 + 2')
    cy.viewport(1000, 660)
  })
})
