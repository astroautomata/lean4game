import React, { useState } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks";
import {
    PreferencesState,
    setLayout as setPreferencesLayout,
    setIsSavePreferences as setPreferencesIsSavePreferences,
    setLanguage as setLanguagePreferences,
    setIsSuggestionsMobileMode as setIsSuggestionsMobileModePreferences,
    setIsVisualLightMode as setIsVisualLightModePreferences,
    setIsVisualAutoBranchSwitching as setIsVisualAutoBranchSwitchingPreferences,
    setIsVisualFastExfalso as setIsVisualFastExfalsoPreferences,
    setIsVisualOpenAnyLevel as setIsVisualOpenAnyLevelPreferences,
    setIsVisualFullComplete as setIsVisualFullCompletePreferences,
    setVisualStyleSetting as setVisualStyleSettingPreferences,
    getWindowDimensions,
    AUTO_SWITCH_THRESHOLD
} from "../preferences";


const UsePreferences = () => {
    const dispatch = useAppDispatch()
    const [mobile, setMobile] = React.useState<boolean>()

    const layout = useAppSelector((state) => state.preferences.layout);
    const setLayout = (layout: PreferencesState["layout"]) => dispatch(setPreferencesLayout(layout))

    const isSavePreferences = useAppSelector((state) => state.preferences.isSavePreferences);
    const setIsSavePreferences = (isSave: boolean) => dispatch(setPreferencesIsSavePreferences(isSave))

    const language = useAppSelector((state) => state.preferences.language);
    const setLanguage = (lang: string) => dispatch(setLanguagePreferences(lang))

    const isSuggestionsMobileMode = useAppSelector((state) => state.preferences.isSuggestionsMobileMode);
    const setIsSuggestionsMobileMode = (isSuggestionsMobileMode: boolean) => dispatch(setIsSuggestionsMobileModePreferences(isSuggestionsMobileMode))

    const isVisualLightMode = useAppSelector((state) => state.preferences.isVisualLightMode);
    const setIsVisualLightMode = (isVisualLightMode: boolean) => dispatch(setIsVisualLightModePreferences(isVisualLightMode))
    const isVisualAutoBranchSwitching = useAppSelector((state) => state.preferences.isVisualAutoBranchSwitching);
    const setIsVisualAutoBranchSwitching = (enabled: boolean) => dispatch(setIsVisualAutoBranchSwitchingPreferences(enabled))
    const isVisualFastExfalso = useAppSelector((state) => state.preferences.isVisualFastExfalso);
    const setIsVisualFastExfalso = (enabled: boolean) => dispatch(setIsVisualFastExfalsoPreferences(enabled))
    const isVisualOpenAnyLevel = useAppSelector((state) => state.preferences.isVisualOpenAnyLevel);
    const setIsVisualOpenAnyLevel = (enabled: boolean) => dispatch(setIsVisualOpenAnyLevelPreferences(enabled))
    const isVisualFullComplete = useAppSelector((state) => state.preferences.isVisualFullComplete);
    const setIsVisualFullComplete = (enabled: boolean) => dispatch(setIsVisualFullCompletePreferences(enabled))
    const visualStyleSetting = useAppSelector((state) => state.preferences.visualStyleSetting);
    const setVisualStyleSetting = (setting: PreferencesState["visualStyleSetting"]) => dispatch(setVisualStyleSettingPreferences(setting))

    const automaticallyAdjustLayout = () => {
        const {width} = getWindowDimensions()
        setMobile(width < AUTO_SWITCH_THRESHOLD)
    }

    React.useEffect(()=>{
        if (layout === "auto"){
          void automaticallyAdjustLayout()
          window.addEventListener('resize', automaticallyAdjustLayout)

          return () => window.removeEventListener('resize', automaticallyAdjustLayout)
        } else {
          setMobile(layout === "mobile")
        }
    }, [layout])

    return {
        mobile,
        layout,
        isSavePreferences,
        language,
        isSuggestionsMobileMode,
        isVisualLightMode,
        isVisualAutoBranchSwitching,
        isVisualFastExfalso,
        isVisualOpenAnyLevel,
        isVisualFullComplete,
        visualStyleSetting,
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
    }
}

export default UsePreferences;
