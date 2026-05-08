import stateManager from '../../core/state/app-state.js';
import {
    getCurrentDayIndex,
    getCurrentTripId,
    getCurrentUser,
    getEditingItemIndex,
    getIsEditing,
    getIsGuestMode,
    getIsReadOnlyMode,
    getIsSaving,
    getTargetDayIndex,
    getTravelData,
    getViewingItemIndex
} from '../../core/state/state-selectors.js';
import {
    setCurrentDayIndex,
    setCurrentTripId,
    setCurrentUser,
    setEditingItemIndex,
    setIsEditing,
    setIsGuestMode,
    setIsReadOnlyMode,
    setIsSaving,
    setTargetDayIndex,
    setTravelData,
    setViewingItemIndex,
    updateMetaState,
    updateTimelineItemState,
    updateTripDateState
} from '../../core/state/state-actions.js';

let isInstalled = false;

function defineCompatProperty(name, getter, setter) {
    const existing = Object.getOwnPropertyDescriptor(window, name);
    if (existing && existing.configurable === false) return;

    Object.defineProperty(window, name, {
        get: getter,
        set: setter,
        configurable: true
    });
}

export function installLegacyStateCompat() {
    if (isInstalled || typeof window === 'undefined') return;
    isInstalled = true;

    defineCompatProperty('travelData', getTravelData, setTravelData);
    defineCompatProperty('currentDayIndex', getCurrentDayIndex, setCurrentDayIndex);
    defineCompatProperty('currentTripId', getCurrentTripId, setCurrentTripId);
    defineCompatProperty('currentUser', getCurrentUser, setCurrentUser);
    defineCompatProperty('isEditing', getIsEditing, setIsEditing);
    defineCompatProperty('isSaving', getIsSaving, setIsSaving);
    defineCompatProperty('isReadOnlyMode', getIsReadOnlyMode, setIsReadOnlyMode);
    defineCompatProperty('isGuestMode', getIsGuestMode, setIsGuestMode);
    defineCompatProperty('viewingItemIndex', getViewingItemIndex, setViewingItemIndex);
    defineCompatProperty('editingItemIndex', getEditingItemIndex, setEditingItemIndex);
    defineCompatProperty('targetDayIndex', getTargetDayIndex, setTargetDayIndex);

    const stateDescriptor = Object.getOwnPropertyDescriptor(window, 'state');
    if (!stateDescriptor || stateDescriptor.configurable !== false) {
        Object.defineProperty(window, 'state', {
            value: stateManager,
            configurable: true
        });
    }

    window.updateMetaState = updateMetaState;
    window.updateTripDateState = updateTripDateState;
    window.updateTimelineItemState = updateTimelineItemState;
    window.setCurrentDayIndex = setCurrentDayIndex;
    window.setTargetDayIndex = setTargetDayIndex;
    window.setCurrentTripId = setCurrentTripId;
    window.setTravelData = setTravelData;
}
