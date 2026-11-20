import * as React from 'react';
import { Outlet, useParams } from "react-router-dom";

import '@fontsource/roboto/300.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';

import './css/reset.css';
import './css/app.css';
// The visual interface's colours, which the page background below is taken from.
import './visual/palette.css';
import { PreferencesContext, WorldLevelIdContext} from './components/infoview/context';
import UsePreferences from "./state/hooks/use_preferences"
import { loadGameLightModePreference } from './state/local_storage'
import { useGetGameInfoQuery } from './state/api'
import { loadGameVisualStyle, saveGameVisualStyle, worldSchemeOf } from './visual/worldScheme'
import i18n from './i18n';
import { Popup } from './components/popup/popup';
import { VisualRpcProvider } from './visual/VisualRpcProvider'

export const GameIdContext = React.createContext<string>(undefined);

/** The short shareable paths (`/visualNNG`) name one fixed game, so they have
 *  no `:owner`/`:repo` params to read. Let a route supply them directly. */
function App({ owner, repo }: { owner?: string, repo?: string } = {}) {

  const params = useParams()
  const gameOwner = owner ?? params.owner
  const gameRepo = repo ?? params.repo
  const gameId = "g/" + gameOwner + "/" + gameRepo
  const levelId = parseInt(params.levelId)
  const worldId = params.worldId

  // A game with the neutral palette (`VisualNeutralPalette`) is drawn in greys and in
  // the colours of the world being played. Until the game's data is here, the look it
  // had last time stands in.
  const gameInfo = useGetGameInfoQuery({ game: gameId }, { skip: !gameOwner || !gameRepo })
  const visualStyle = gameInfo.data
    ? (gameInfo.data.visualNeutralPalette ? 'neutral' : undefined)
    : loadGameVisualStyle(gameId)
  const worldScheme = visualStyle === 'neutral'
    ? worldSchemeOf(gameInfo.data?.worlds?.nodes, worldId)
    : undefined
  React.useEffect(() => {
    if (gameInfo.data) saveGameVisualStyle(gameId, gameInfo.data.visualNeutralPalette ? 'neutral' : undefined)
  }, [gameId, gameInfo.data])

  const {
    mobile,
    layout,
    isSavePreferences,
    language,
    isSuggestionsMobileMode,
    isVisualLightMode,
    isVisualAutoBranchSwitching,
    isVisualFastExfalso,
    isVisualOpenAnyLevel,
    setLayout,
    setIsSavePreferences,
    setLanguage,
    setIsSuggestionsMobileMode,
    setIsVisualLightMode,
    setIsVisualAutoBranchSwitching,
    setIsVisualFastExfalso,
    setIsVisualOpenAnyLevel,
  } = UsePreferences()

  React.useEffect(() => {
    i18n.changeLanguage(language)
  }, [language])

  // Moving to another game, a layout effect so that the old game's theme never paints.
  React.useLayoutEffect(() => {
    setIsVisualLightMode(loadGameLightModePreference(gameId))
  }, [gameId])

  React.useLayoutEffect(() => {
    // The page's own background is the palette's (visual/palette.css), read from
    // the app root that this render gave the scheme to.
    const appRoot = document.querySelector('.app')
    const paletteBackground = appRoot ? getComputedStyle(appRoot).getPropertyValue('--pal-bg-start').trim() : ''
    const background = paletteBackground ? `rgb(${paletteBackground})` : ''
    const scheme = isVisualLightMode ? 'light' : 'dark'
    document.documentElement.style.backgroundColor = background
    document.documentElement.style.colorScheme = scheme
    document.body.style.backgroundColor = background
    let theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!theme) {
      theme = document.createElement('meta')
      theme.name = 'theme-color'
      document.head.appendChild(theme)
    }
    theme.content = background
    let colorScheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
    if (!colorScheme) {
      colorScheme = document.createElement('meta')
      colorScheme.name = 'color-scheme'
      document.head.appendChild(colorScheme)
    }
    colorScheme.content = scheme
  }, [isVisualLightMode, visualStyle])

  return (
    <div
      className="app"
      data-visual-theme={isVisualLightMode ? 'light' : 'dark'}
      data-game-id={gameId}
      data-visual-style={visualStyle}
      data-world-scheme={worldScheme}
    >
      <GameIdContext.Provider value={gameId}>
          <WorldLevelIdContext.Provider value={{worldId, levelId}}>
          <PreferencesContext.Provider value={{
            mobile,
            layout,
            isSavePreferences,
            language,
            isSuggestionsMobileMode,
            isVisualLightMode,
            isVisualAutoBranchSwitching,
            isVisualFastExfalso,
            isVisualOpenAnyLevel,
            setLayout,
            setIsSavePreferences,
            setLanguage,
            setIsSuggestionsMobileMode,
            setIsVisualLightMode,
            setIsVisualAutoBranchSwitching,
            setIsVisualFastExfalso,
            setIsVisualOpenAnyLevel,
          }}>
            <VisualRpcProvider>
              <React.Suspense>
                <Outlet />
              </React.Suspense>
              <Popup />
            </VisualRpcProvider>
          </PreferencesContext.Provider>
          </WorldLevelIdContext.Provider>
      </GameIdContext.Provider>
    </div>
  )
}

export default App
