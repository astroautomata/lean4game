import { createSlice } from "@reduxjs/toolkit";

import { gameIdFromLocation, loadGameLightModePreference, loadPreferences, loadVisualAutoBranchSwitchPreference, loadVisualFastExfalsoPreference, loadVisualFullCompletePreference, loadVisualOpenAnyLevelPreference, loadVisualStyleSettingPreference, VISUAL_STYLE_SETTINGS, VisualStyleSetting } from "./local_storage";

export interface PreferencesState {
  layout: "mobile" | "auto" | "desktop";
  isSavePreferences: boolean;
  language: string;
  isSuggestionsMobileMode: boolean;
  isVisualLightMode: boolean;
  isVisualAutoBranchSwitching: boolean;
  isVisualFastExfalso: boolean;
  /** Let the visual map and Next button open levels the player hasn't unlocked. */
  isVisualOpenAnyLevel: boolean;
  /** Show every level as finished: the visual map in full colour, and nothing locked.
   * The player's saved progress is left as it is. */
  isVisualFullComplete: boolean;
  /** How a game with the neutral palette is drawn: in it, in it with black for every
   * background, or in the classic palette's dark scheme. */
  visualStyleSetting: VisualStyleSetting;
}

export function getWindowDimensions() {
  const {innerWidth: width, innerHeight: height } = window
  return {width, height}
}

export const AUTO_SWITCH_THRESHOLD = 800

const defaultPreferencesState: PreferencesState = {
  layout: "auto",
  isSavePreferences: false,
  language: import.meta.env.VITE_CLIENT_DEFAULT_LANGUAGE || "en",
  isSuggestionsMobileMode: 'ontouchstart' in document.documentElement,
  isVisualLightMode: false,
  isVisualAutoBranchSwitching: false,
  isVisualFastExfalso: false,
  isVisualOpenAnyLevel: false,
  isVisualFullComplete: false,
  visualStyleSetting: 'standard',
}

const savedPreferences = loadPreferences()
const savedVisualAutoBranchSwitching = loadVisualAutoBranchSwitchPreference()
const savedVisualFastExfalso = loadVisualFastExfalsoPreference()
const savedVisualOpenAnyLevel = loadVisualOpenAnyLevelPreference()
const savedVisualFullComplete = loadVisualFullCompletePreference()
const savedVisualStyleSetting = loadVisualStyleSettingPreference()
const initialGameId = gameIdFromLocation()

const initialState: PreferencesState = {
  ...defaultPreferencesState,
  ...savedPreferences,
  // Light mode is stored per game, for the games that offer its toggle on their
  // map. A preference stored under the old global key no longer applies, rather
  // than stranding anyone in a theme with no control to leave it by. It's read here
  // for the page's game, so the first frame is right; `App` follows game changes.
  isVisualLightMode: initialGameId ? loadGameLightModePreference(initialGameId) : false,
  isVisualAutoBranchSwitching: savedVisualAutoBranchSwitching ?? savedPreferences?.isVisualAutoBranchSwitching ?? defaultPreferencesState.isVisualAutoBranchSwitching,
  isVisualFastExfalso: savedVisualFastExfalso ?? savedPreferences?.isVisualFastExfalso ?? defaultPreferencesState.isVisualFastExfalso,
  isVisualOpenAnyLevel: savedVisualOpenAnyLevel ?? savedPreferences?.isVisualOpenAnyLevel ?? defaultPreferencesState.isVisualOpenAnyLevel,
  isVisualFullComplete: savedVisualFullComplete ?? savedPreferences?.isVisualFullComplete ?? defaultPreferencesState.isVisualFullComplete,
  visualStyleSetting: savedVisualStyleSetting
    ?? VISUAL_STYLE_SETTINGS.find(setting => setting === savedPreferences?.visualStyleSetting)
    ?? defaultPreferencesState.visualStyleSetting,
}

export const preferencesSlice = createSlice({
  name: "preferences",
  initialState,
  reducers: {
    setLayout: (state, action) => {
      state.layout = action.payload;
    },
    setIsSavePreferences: (state, action) => {
      state.isSavePreferences = action.payload;
    },
    setLanguage: (state, action) => {
      state.language = action.payload;
    },
    setIsSuggestionsMobileMode: (state, action) => {
      state.isSuggestionsMobileMode = action.payload;
    },
    setIsVisualLightMode: (state, action) => {
      state.isVisualLightMode = action.payload;
    },
    setIsVisualAutoBranchSwitching: (state, action) => {
      state.isVisualAutoBranchSwitching = action.payload;
    },
    setIsVisualFastExfalso: (state, action) => {
      state.isVisualFastExfalso = action.payload;
    },
    setIsVisualOpenAnyLevel: (state, action) => {
      state.isVisualOpenAnyLevel = action.payload;
    },
    setIsVisualFullComplete: (state, action) => {
      state.isVisualFullComplete = action.payload;
    },
    setVisualStyleSetting: (state, action) => {
      state.visualStyleSetting = action.payload;
    },
  },
});

export const {
  setLayout,
  setIsSavePreferences,
  setLanguage,
  setIsSuggestionsMobileMode,
  setIsVisualLightMode,
  setIsVisualAutoBranchSwitching,
  setIsVisualFastExfalso,
  setIsVisualOpenAnyLevel,
  setIsVisualFullComplete,
  setVisualStyleSetting,
} = preferencesSlice.actions;
