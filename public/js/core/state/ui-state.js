export const uiState = {
    drag: {
        draggingIndex: null,
        dragSourceElement: null,
        isDesktopDragging: false,
        lastDragClientY: 0,
        autoScrollAnimationId: null,
        touchLongPressTimer: null,
        longPressTimer: null,
        isTouchDragging: false,
        touchStartIndex: null,
        customDragGhost: null,
        touchStartX: 0,
        touchStartY: 0
    },
    lightbox: {
        lightboxMemories: [],
        currentLightboxIndex: 0,
        lightboxTouchStartX: 0,
        lightboxTouchStartY: 0,
        lightboxTouchEndX: 0,
        lightboxTouchEndY: 0
    },
    map: {
        mapInstance: null,
        mapContainerElement: null,
        mapMarkers: [],
        mapPolyline: null,
        isMapInitialized: false,
        routeMap: null,
        routePolyline: null,
        routeMarkers: []
    },
    weather: {
        currentWeatherWeekStart: null,
        selectedWeatherDate: null,
        weeklyWeatherData: null
    },
    input: {
        flightInputIndex: null,
        isFlightEditing: false,
        transitInputIndex: null,
        transitInputType: null,
        isTransitEditing: false,
        selectedShoppingLocation: null,
        selectedShoppingItemIndex: null,
        currentTargetId: null,
        manualInputCallback: null
    },
    contextMenu: {
        contextMenuTargetIndex: null,
        contextMenuType: null,
        contextMenuMemoryIndex: null
    },
    utility: {
        pendingDeleteIndex: null,
        pendingDeleteDayIndex: null,
        pendingDuplicateTripId: null,
        pendingRouteInsertIndex: null,
        autoSaveTimeout: null
    }
};

export const setUiState = (path, value) => {
    if (typeof path === 'string') {
        const keys = path.split('.');
        let target = uiState;
        for (let i = 0; i < keys.length - 1; i += 1) {
            target = target[keys[i]];
        }
        target[keys[keys.length - 1]] = value;
        return;
    }

    if (typeof path === 'object' && path !== null) {
        const merge = (target, source) => {
            for (const key in source) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    merge(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
        };

        merge(uiState, path);
    }
};

export const getUiState = (path) => {
    const keys = path.split('.');
    let target = uiState;

    for (const key of keys) {
        target = target[key];
        if (target === undefined) return undefined;
    }

    return target;
};
