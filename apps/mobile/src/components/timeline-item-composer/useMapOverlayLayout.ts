import React from 'react';
import { Animated } from 'react-native';

type MapOverlayLayoutInput<SheetSnap extends number> = {
    sheetHeight: Animated.Value;
    manualConfirmOffset: Animated.Value;
    mapModeFabOffset: Animated.Value;
    mapZoomControlsOffset: Animated.Value;
    sheetHeights: Record<SheetSnap, number>;
    sheetSnap: SheetSnap;
    defaultSheetSnap: SheetSnap;
    maxSheetSnap: SheetSnap;
    windowHeight: number;
    topInset: number;
    spacingSm: number;
    searchBarHeight: number;
};

export function useMapOverlayLayout<SheetSnap extends number>({
    sheetHeight,
    manualConfirmOffset,
    mapModeFabOffset,
    mapZoomControlsOffset,
    sheetHeights,
    sheetSnap,
    defaultSheetSnap,
    maxSheetSnap,
    windowHeight,
    topInset,
    spacingSm,
    searchBarHeight
}: MapOverlayLayoutInput<SheetSnap>) {
    const manualConfirmBottom = React.useMemo(
        () => Animated.add(sheetHeight, manualConfirmOffset),
        [manualConfirmOffset, sheetHeight]
    );
    const mapModeFabBottom = React.useMemo(
        () => Animated.add(sheetHeight, mapModeFabOffset),
        [mapModeFabOffset, sheetHeight]
    );
    const mapPlacePreviewBottom = React.useMemo(
        () => Animated.add(sheetHeight, mapModeFabOffset),
        [mapModeFabOffset, sheetHeight]
    );
    const areaSearchButtonBottom = React.useMemo(
        () => Animated.add(sheetHeight, mapModeFabOffset),
        [mapModeFabOffset, sheetHeight]
    );
    const mapZoomControlsBottom = React.useMemo(
        () => Animated.add(sheetHeight, mapZoomControlsOffset),
        [mapZoomControlsOffset, sheetHeight]
    );
    const manualConfirmFadeStart = React.useMemo(
        () => sheetHeights[maxSheetSnap] - Math.max(72, Math.round(windowHeight * 0.08)),
        [maxSheetSnap, sheetHeights, windowHeight]
    );
    const manualConfirmOpacity = React.useMemo(() => sheetHeight.interpolate({
        inputRange: [sheetHeights[defaultSheetSnap], manualConfirmFadeStart, sheetHeights[maxSheetSnap]],
        outputRange: [1, 1, 0],
        extrapolate: 'clamp'
    }), [defaultSheetSnap, manualConfirmFadeStart, maxSheetSnap, sheetHeight, sheetHeights]);
    const mapVisibleInsets = React.useMemo(() => ({
        top: topInset + spacingSm + searchBarHeight + spacingSm,
        right: spacingSm,
        bottom: sheetHeights[sheetSnap] + spacingSm,
        left: spacingSm
    }), [searchBarHeight, sheetHeights, sheetSnap, spacingSm, topInset]);

    return {
        areaSearchButtonBottom,
        manualConfirmBottom,
        manualConfirmOpacity,
        mapModeFabBottom,
        mapPlacePreviewBottom,
        mapVisibleInsets,
        mapZoomControlsBottom
    };
}
