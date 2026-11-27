/**
 * What the map, and the Collection on it, need to know about every level of a game:
 * fetched once from the levels' data and kept for the session.
 */
import * as React from 'react'
import { getDataBaseUrl } from '../utils/url'
import type { CollectionLevel, InterstitialScreen, InventoryTileSummary } from './collectionData'

export interface LevelMeta {
  title?: string
  /** `VisualLevelNumber` label shown in the node. */
  label?: string
  textLevel: boolean
  boss: boolean
  introduction?: string
  /** What the Collection reads from the level; absent where the level didn't load. */
  collection?: CollectionLevel
}

interface LevelJson {
  title?: string | null
  introduction?: string | null
  visualLevelNumber?: string | null
  visualTextLevel?: boolean
  visualBossLevel?: boolean
  statementName?: string | null
  lemmas?: InventoryTileSummary[]
  tactics?: InventoryTileSummary[]
  visualPreLevel?: InterstitialScreen | null
  visualPostLevel?: InterstitialScreen | null
}

const tile = ({ name, displayName, category, world, level, declIndex, hidden }: InventoryTileSummary): InventoryTileSummary =>
  ({ name, displayName, category, world, level, declIndex, hidden })

function metaOf(data: LevelJson | null): LevelMeta {
  return {
    title: data?.title ?? undefined,
    label: data?.visualLevelNumber ?? undefined,
    textLevel: Boolean(data?.visualTextLevel),
    boss: Boolean(data?.visualBossLevel),
    introduction: data?.introduction ?? undefined,
    collection: data ? {
      label: data.visualLevelNumber ?? undefined,
      statementName: data.statementName,
      lemmas: (data.lemmas ?? []).map(tile),
      tactics: (data.tactics ?? []).map(tile),
      screens: [data.visualPreLevel, data.visualPostLevel].filter((screen): screen is InterstitialScreen => Boolean(screen)),
      postScreen: data.visualPostLevel ?? undefined,
    } : undefined,
  }
}

/** Each game's level metadata, kept for the session: coming back from a level
 * paints the map complete straight away, with no fetch. */
const levelMetaCache = new Map<string, Record<string, LevelMeta>>()
/** The fetch under way for a game, shared by everything on the page that waits for it. */
const levelMetaRequests = new Map<string, Promise<Record<string, LevelMeta>>>()

function requestLevelMeta(gameId: string, worldSize: Record<string, number>): Promise<Record<string, LevelMeta>> {
  const pending = levelMetaRequests.get(gameId)
  if (pending) return pending
  const base = getDataBaseUrl().replace(/\/$/u, '')
  let complete = true
  const requests = Object.entries(worldSize).flatMap(([world, size]) =>
    Array.from({ length: size }, (_, index) => {
      const level = index + 1
      return fetch(`${base}/${gameId}/level__${world}__${level}.json`)
        .then(response => {
          if (!response.ok) complete = false
          return response.ok ? response.json() as Promise<LevelJson> : null
        })
        .then(data => [`${world}:${level}`, metaOf(data)] as const)
        .catch(() => {
          complete = false
          return [`${world}:${level}`, metaOf(null)] as const
        })
    }))
  const request = Promise.all(requests).then(entries => {
    const next = Object.fromEntries(entries)
    if (complete) levelMetaCache.set(gameId, next)
    // A fetch that missed some levels is tried again the next time the map opens.
    levelMetaRequests.delete(gameId)
    return next
  })
  levelMetaRequests.set(gameId, request)
  return request
}

/** The metadata of every level of a game, or null until it has all arrived. Levels'
 * labels and sizes depend on it, so the map waits rather than paint and correct them. */
export function useLevelMeta(gameId: string, worldSize: Record<string, number> | null | undefined) {
  const [meta, setMeta] = React.useState<Record<string, LevelMeta> | null>(() => levelMetaCache.get(gameId) ?? null)
  React.useEffect(() => {
    if (!worldSize || levelMetaCache.has(gameId)) return
    let active = true
    void requestLevelMeta(gameId, worldSize).then(next => { if (active) setMeta(next) })
    return () => { active = false }
  }, [gameId, worldSize])
  return meta
}
