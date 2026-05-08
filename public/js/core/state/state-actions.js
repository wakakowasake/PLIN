import stateManager from './app-state.js';
import {
    selectTripDay
} from '../../../../shared/core/state/trip-target-helpers.js';
import {
    buildTimelineItemPatch,
    buildTripMetaPatch
} from '../../../../shared/core/state/trip-patch-helpers.js';
import { adaptTripDataForWeb } from '../../ui-utils.js';

export const setTravelData = (value) => stateManager.set(
    'travelData',
    adaptTripDataForWeb(value)
);
export const setCurrentDayIndex = (value) => stateManager.set('currentDayIndex', value);
export const setTargetDayIndex = (value) => stateManager.set('targetDayIndex', value);
export const setCurrentTripId = (value) => stateManager.set('currentTripId', value);
export const setNewTripDataTemp = (value) => stateManager.set('newTripDataTemp', value);
export const setPendingTransitCallback = (value) => stateManager.set('pendingTransitCallback', value);
export const setEditingItemIndex = (value) => stateManager.set('editingItemIndex', value);
export const setViewingItemIndex = (value) => stateManager.set('viewingItemIndex', value);
export const setCurrentTripUnsubscribe = (value) => stateManager.set('currentTripUnsubscribe', value);
export const setIsEditing = (value) => stateManager.set('isEditing', value);
export const setCurrentUser = (value) => stateManager.set('currentUser', value);
export const setInsertingItemIndex = (value) => stateManager.set('insertingItemIndex', value);
export const setIsEditingFromDetail = (value) => stateManager.set('isEditingFromDetail', value);
export const setIsReadOnlyMode = (value) => stateManager.set('isReadOnlyMode', value);
export const setIsGuestMode = (value) => stateManager.set('isGuestMode', value);
export const setCurrentTab = (value) => stateManager.set('currentTab', value);
export const setIsSaving = (value) => stateManager.set('isSaving', value);

export function updateMetaState(key, value) {
    const patch = buildTripMetaPatch(key, value);
    if (!patch) return;

    stateManager.set(patch.path, patch.value);
}

export function updateTripDateState(dayIndex, newDate) {
    const travelData = stateManager.get('travelData');
    if (selectTripDay(travelData, dayIndex)) {
        stateManager.set(`travelData.days.${dayIndex}.date`, newDate);
    }
}

export function updateTimelineItemState(dayIndex, itemIndex, key, value) {
    const travelData = stateManager.get('travelData');
    const patch = buildTimelineItemPatch(travelData, dayIndex, itemIndex, key, value);
    if (!patch) return;

    stateManager.set(patch.path, patch.value);
}
