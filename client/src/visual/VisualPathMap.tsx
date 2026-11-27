/**
 * @fileOverview The path-style world map (`VisualPathMap`): every level is a
 * node on a path, worlds are coloured paths that split and join, and bonus
 * levels sprout off the side. Finished stretches are filled in their world's
 * colour, the levels waiting to be played are hollow rings, and everything
 * further on is an uncoloured outline. Text-only levels (`VisualTextLevel`) open
 * in a dialog over the map; closing it completes them.
 */
import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { GameIdContext } from '../app'
import type { GameInfo } from '../state/api'
import { levelCompleted, levelEntered, selectCompleted, selectEntered, selectProgress } from '../state/progress'
import { store } from '../state/store'
import { useAppDispatch, useAppSelector } from '../hooks'
import { useMapLevelTooltip } from '../components/map_level_tooltip'
import { plainLevelTitle } from '../components/annotated_level_title'
import { Markdown } from '../components/markdown'
import {
  computePathMapLayout,
  PATH_MAP_BOSS_NODE_RADIUS,
  PATH_MAP_CORNER_RADIUS,
  PATH_MAP_LABEL_LINE_HEIGHT,
  PATH_MAP_NODE_RADIUS,
  roundedPathData,
  type PathMapNode,
} from './pathMapLayout'
import { visualInterfaceScale } from './interfaceScale'
import { useLevelMeta, type LevelMeta } from './levelMeta'
import { bonusAnchorsOf, computeVisualProgressFrontier, isVisualLevelUnlocked } from './visualWorldProgress'
import { CLASSIC_COLOR_OF_SCHEME, NEUTRAL_WORLD_COLOR, WORLD_SCHEMES } from './worldScheme'

/** The named world colours. Their fill and edge are in the palette (palette.css),
 * as `--pal-world-<name>` and `--pal-world-<name>-edge`. */
const WORLD_COLOR_NAMES = new Set([
  'grey', 'purple', 'blue', 'sky', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'indigo', 'lime',
])
/** The schemes of the neutral palette, which only that palette has colours for. */
const WORLD_SCHEME_NAMES = new Set<string>(WORLD_SCHEMES)

/** The map's own colours, from the palette of the scheme in use. */
const THEME = {
  background: 'rgb(var(--pal-bg-start))',
  /** Outline of paths and levels not reached yet. */
  shadow: 'rgb(var(--pal-track))',
  lockedText: 'rgb(var(--pal-inactive))',
  /** The number of a finished level, on its world's colour. */
  completedText: 'rgb(var(--pal-on-solid))',
}
type PathMapTheme = typeof THEME

const PATH_OUTER_WIDTH = 16
const PATH_INNER_WIDTH = 10
const MAP_PADDING = 48

/** With the neutral palette a world is drawn in its scheme, and a world with a plain
 * colour or none in grey, as its levels are. */
function worldColor(name: string, neutral: boolean) {
  const known = neutral
    ? (WORLD_SCHEME_NAMES.has(name) ? name : NEUTRAL_WORLD_COLOR)
    : WORLD_COLOR_NAMES.has(name) ? name : 'purple'
  return { fill: `rgb(var(--pal-world-${known}))`, edge: `rgb(var(--pal-world-${known}-edge))` }
}

function PathMapLevel({ node, meta, state, theme, neutral, waitsFor, onOpen }: {
  node: PathMapNode
  meta?: LevelMeta
  state: 'completed' | 'frontier' | 'locked'
  /** While locked: worlds the level waits for that no path on the map leads from. */
  waitsFor?: string[]
  theme: PathMapTheme
  /** The game has the neutral palette (`VisualNeutralPalette`). */
  neutral: boolean
  /** Undefined while the level is locked. */
  onOpen?: () => void
}) {
  const color = worldColor(node.color, neutral)
  const label = meta?.label ?? String(node.index)
  const title = plainLevelTitle(meta?.title ?? `Level ${label}`)
  const needs = waitsFor?.length ? ` (needs ${waitsFor.join(', ')})` : ''
  const { tooltip, triggerProps } = useMapLevelTooltip(state === 'locked' ? `🔒 ${title}${needs}` : title)
  const activate = () => onOpen?.()
  const stroke = state === 'completed' ? color.edge : state === 'frontier' ? color.fill : theme.shadow
  const fill = state === 'completed' ? color.fill : theme.background
  const textColor = state === 'completed' ? theme.completedText : state === 'frontier' ? color.fill : theme.lockedText
  const radius = meta?.boss ? PATH_MAP_BOSS_NODE_RADIUS : PATH_MAP_NODE_RADIUS
  return (<>
    <g
      className={`path-map-level visual-map-link${onOpen ? '' : ' locked'}`}
      data-testid="path-map-level"
      data-world={node.world}
      data-level={node.level}
      data-state={state}
      data-text-level={meta?.textLevel ? 'true' : undefined}
      data-boss={meta?.boss ? 'true' : undefined}
      role="link"
      tabIndex={0}
      aria-label={`${meta?.textLevel ? 'Read' : 'Open'} ${title}${onOpen ? '' : ' (locked)'}`}
      aria-disabled={onOpen ? undefined : 'true'}
      onClick={activate}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activate()
        }
      }}
      {...triggerProps}
    >
      <circle
        cx={node.x}
        cy={node.y}
        r={state === 'frontier' ? radius - 3.5 : radius - 1.5}
        fill={fill}
        stroke={stroke}
        strokeWidth={state === 'frontier' ? 7 : 3}
      />
      <text
        x={node.x}
        y={node.y}
        dy="0.35em"
        textAnchor="middle"
        className="path-map-level-label"
        fill={textColor}
      >{label}</text>
    </g>
    {tooltip}
  </>)
}

function TextLevelDialog({ title, introduction, onClose }: {
  title: string
  introduction: string
  onClose: () => void
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="path-map-text-backdrop" onClick={onClose}>
      <div
        className="path-map-text-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="text-level-dialog"
        onClick={event => event.stopPropagation()}
      >
        <div className="path-map-text-body">
          <Markdown>{introduction}</Markdown>
        </div>
        <button ref={closeRef} type="button" className="path-map-text-close" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  )
}

export function VisualPathMap({ gameInfo, openAnyLevel, fullComplete = false, highContrast = false }: {
  gameInfo: GameInfo
  /** The "Open Any Level" setting: locked levels open too. */
  openAnyLevel: boolean
  /** The "Full Complete" setting: every level is shown as finished, whatever the
   * saved progress. */
  fullComplete?: boolean
  /** The Visual Style "High Contrast" of a game with the neutral palette: the classic
   * palette's dark scheme, with a plain colour for each world. */
  highContrast?: boolean
}) {
  const gameId = React.useContext(GameIdContext)
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const theme = THEME
  const neutral = Boolean(gameInfo.visualNeutralPalette) && !highContrast
  const colorOf = (name: string) => worldColor(name, neutral)
  // Subscribe so completions and imports repaint the map.
  useAppSelector(selectProgress(gameId))
  const meta = useLevelMeta(gameId, gameInfo.worldSize)
  const [{ viewportWidth, viewportHeight }, setViewport] = React.useState(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }))
  React.useEffect(() => {
    const onResize = () => setViewport({ viewportWidth: window.innerWidth, viewportHeight: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // The room the scroller has for the map, less its padding and scroll bar. The map
  // is never wider than this: it zooms out rather than scroll sideways.
  const [availableWidth, setAvailableWidth] = React.useState<number | null>(null)
  React.useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const measure = () => {
      const style = window.getComputedStyle(scroller)
      const room = scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      setAvailableWidth(Number.isFinite(room) && room > 0 ? Math.floor(room) : null)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(scroller)
    return () => observer?.disconnect()
  }, [])

  const nodesById = gameInfo.worlds?.nodes
  // Phones fit the whole map to the screen width: narrower columns keep levels
  // tappable.
  const compact = viewportWidth <= 720
  const layout = React.useMemo(() => computePathMapLayout({
    worlds: Object.fromEntries(Object.entries(nodesById ?? {}).map(([world, node]) => [world, {
      title: node.title,
      bonusOf: node.visualBonusOf,
      bonusSide: node.visualBonusSide,
      noPathFrom: node.visualNoPathFrom,
      // Where the neutral palette isn't drawn, a scheme's world has a plain colour.
      color: neutral ? node.visualColor : CLASSIC_COLOR_OF_SCHEME[node.visualColor ?? ''] ?? node.visualColor,
      column: node.visualMapColumn,
      under: node.visualMapUnder,
      shared: node.visualSharedPath,
      continues: node.visualContinues,
      bottom: node.visualMapBottom,
    }])),
    edges: gameInfo.worlds?.edges ?? [],
    worldSize: gameInfo.worldSize ?? {},
    skippedLevels: gameInfo.skippedLevels,
  }, {
    ...(compact ? { columnWidth: 88 } : {}),
    // With the neutral palette, a world without a colour is grey.
    ...(neutral ? { defaultColor: NEUTRAL_WORLD_COLOR } : {}),
  }),
  [compact, gameInfo.skippedLevels, gameInfo.worldSize, gameInfo.worlds?.edges, neutral, nodesById])

  const frontier = computeVisualProgressFrontier({
    worldIds: Object.keys(nodesById ?? {}),
    edges: gameInfo.worlds?.edges ?? [],
    worldSizes: gameInfo.worldSize ?? {},
    skippedLevels: gameInfo.skippedLevels ?? {},
    completionNeutralLevels: gameInfo.completionNeutralLevels ?? {},
    bonusAnchors: bonusAnchorsOf(nodesById),
    isCompleted: (world, level) => fullComplete || selectCompleted(gameId, world, level)(store.getState()),
    isEntered: (world, level) => selectEntered(gameId, world, level)(store.getState()),
  })
  const isDone = (world: string, level: number) => frontier.mapCompletedLevels[world]?.[level] ?? false
  const stateOf = (node: PathMapNode): 'completed' | 'frontier' | 'locked' =>
    isDone(node.world, node.level)
      ? 'completed'
      : isVisualLevelUnlocked(frontier, node.world, node.level) ? 'frontier' : 'locked'

  // A bonus level can wait for a world besides the one it branches off; its tooltip
  // names it, by the title on the map (a world there can be several of the game's).
  const waitsFor = (world: string) => [...new Set((frontier.bonusWaitsFor[world] ?? [])
    .map(source => nodesById?.[source]?.title || source))]

  // Text level opened from the map, or sent here by its level route (`?text=`).
  const [openText, setOpenText] = React.useState<{ world: string; level: number } | null>(() => {
    const requested = searchParams.get('text')
    const match = requested ? /^(.+)\/(\d+)$/u.exec(requested) : null
    return match ? { world: match[1]!, level: Number(match[2]) } : null
  })
  const openTextMeta = openText ? meta?.[`${openText.world}:${openText.level}`] : undefined
  const closeText = React.useCallback(() => {
    if (!openText) return
    dispatch(levelCompleted({ game: gameId, world: openText.world, level: openText.level }))
    setOpenText(null)
    if (searchParams.has('text')) {
      const next = new URLSearchParams(searchParams)
      next.delete('text')
      setSearchParams(next, { replace: true })
    }
  }, [dispatch, gameId, openText, searchParams, setSearchParams])

  const openLevel = (node: PathMapNode) => {
    const levelMeta = meta?.[`${node.world}:${node.level}`]
    if (levelMeta?.textLevel) {
      dispatch(levelEntered({ game: gameId, world: node.world, level: node.level }))
      setOpenText({ world: node.world, level: node.level })
      return
    }
    window.sessionStorage.setItem(`visual-map-focus:${gameId}`, node.world)
    navigate(`/${gameId}/world/${node.world}/level/${node.level}/visual`)
  }

  // Start scrolled to the levels waiting to be played.
  const scrolledRef = React.useRef(false)
  React.useLayoutEffect(() => {
    if (scrolledRef.current || layout.nodes.length === 0) return
    const scroller = scrollRef.current
    const target = scroller?.querySelector<SVGGElement>('[data-state="frontier"]')
    if (!scroller || !target) return
    scrolledRef.current = true
    const scrollRect = scroller.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const offset = targetRect.top + targetRect.height / 2 - (scrollRect.top + scrollRect.height / 2)
    if (offset > 0) scroller.scrollTop += offset
  })

  const { bounds } = layout
  const viewX = bounds.x1 - MAP_PADDING
  const viewY = bounds.y1 - MAP_PADDING
  const viewWidth = bounds.x2 - bounds.x1 + 2 * MAP_PADDING
  const viewHeight = bounds.y2 - bounds.y1 + 2 * MAP_PADDING
  // Natural size where it fits, larger on a large window, and zoomed out to fit a
  // narrower one, a phone's included: the map never scrolls sideways.
  const displayWidth = Math.min(
    viewWidth * visualInterfaceScale(viewportWidth, viewportHeight),
    // Until the scroller is measured: the window less its padding and scroll bar.
    availableWidth ?? Math.max(240, viewportWidth - (compact ? 16 : 48)),
  )

  // Two passes, outlines then fillings, so overlapping stretches join without
  // seams; lit stretches go last so they cover the outline of an unlit twin.
  const painted = layout.segments.map(segment => ({
    ...segment,
    lit: isDone(segment.source.world, segment.source.level),
    data: roundedPathData(segment.points, PATH_MAP_CORNER_RADIUS),
  })).sort((a, b) => Number(a.lit) - Number(b.lit))
  const segments = painted.filter(segment => !segment.bridge)
  // Where one path crosses another, a bridge is painted over both afterwards,
  // outline and all, so that the path underneath is seen to pass below.
  const bridges = painted.filter(segment => segment.bridge)

  // A world's title is grey until one of its levels can be played.
  const worldUnlocked = (world: string) =>
    layout.nodes.some(node => node.world === world && stateOf(node) !== 'locked')

  return (
    <div className="visual-map-scroll visual-path-map-scroll" ref={scrollRef} data-testid="visual-world-map">
      {meta && <svg
        xmlns="http://www.w3.org/2000/svg"
        className="visual-path-map-svg"
        data-testid="visual-path-map"
        width={displayWidth}
        viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
      >
        <g className="path-map-paths" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {segments.map(segment => (
            <path
              key={`${segment.key}:outer`}
              d={segment.data}
              stroke={segment.lit ? colorOf(segment.color).edge : theme.shadow}
              strokeWidth={PATH_OUTER_WIDTH}
            />
          ))}
          {segments.map(segment => (
            <path
              key={`${segment.key}:inner`}
              data-testid="path-map-segment"
              data-segment={segment.key}
              data-lit={segment.lit ? 'true' : 'false'}
              d={segment.data}
              stroke={segment.lit ? colorOf(segment.color).fill : theme.background}
              strokeWidth={PATH_INNER_WIDTH}
            />
          ))}
        </g>
        <g className="path-map-bridges" fill="none" strokeLinecap="butt">
          {bridges.map(bridge => (
            <React.Fragment key={bridge.key}>
              <path
                d={bridge.data}
                stroke={bridge.lit ? colorOf(bridge.color).edge : theme.shadow}
                strokeWidth={PATH_OUTER_WIDTH}
              />
              <path
                data-testid="path-map-bridge"
                data-segment={bridge.key}
                data-lit={bridge.lit ? 'true' : 'false'}
                d={bridge.data}
                stroke={bridge.lit ? colorOf(bridge.color).fill : theme.background}
                strokeWidth={PATH_INNER_WIDTH}
              />
            </React.Fragment>
          ))}
        </g>
        {layout.labels.map(label => {
          const unlocked = worldUnlocked(label.world)
          return (
            <text
              key={`label:${label.world}`}
              className="path-map-world-label"
              data-testid="path-map-world-label"
              data-unlocked={unlocked ? 'true' : 'false'}
              data-anchor={label.anchor}
              data-title={label.text}
              textAnchor={label.anchor}
              fill={unlocked ? colorOf(label.color).fill : theme.lockedText}
            >
              {/* A long title is on two lines; the last one is at `label.y`. */}
              {label.lines.map((line, index) => (
                <tspan
                  key={index}
                  x={label.x}
                  y={label.y - (label.lines.length - 1 - index) * PATH_MAP_LABEL_LINE_HEIGHT}
                  dy="0.35em"
                >{line}</tspan>
              ))}
            </text>
          )
        })}
        {layout.nodes.map(node => {
          const state = stateOf(node)
          return (
            <PathMapLevel
              key={`${node.world}:${node.level}`}
              node={node}
              meta={meta?.[`${node.world}:${node.level}`]}
              state={state}
              theme={theme}
              neutral={neutral}
              waitsFor={state === 'locked' ? waitsFor(node.world) : undefined}
              onOpen={state !== 'locked' || openAnyLevel ? () => openLevel(node) : undefined}
            />
          )
        })}
      </svg>}
      {openText && openTextMeta && (
        <TextLevelDialog
          title={openTextMeta.title ?? 'Welcome'}
          introduction={openTextMeta.introduction ?? ''}
          onClose={closeText}
        />
      )}
    </div>
  )
}

export default VisualPathMap
