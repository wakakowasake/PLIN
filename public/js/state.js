/**
 * ✅ State Management - compat facade
 *
 * 기존 import 경로와 export 이름은 유지하면서,
 * canonical selector/action/uiState/window compat는 새 계층으로 위임한다.
 */

import stateManager from './state-manager.js';
import defaultTravelData from './state-defaults.js';
import { installLegacyStateCompat } from './legacy/compat/legacy-state-compat.js';
import {
    getCurrentDayIndex,
    getCurrentTab,
    getCurrentTripId,
    getCurrentTripUnsubscribe,
    getCurrentUser,
    getEditingItemIndex,
    getFacadeStateSnapshot,
    getInsertingItemIndex,
    getIsEditing,
    getIsEditingFromDetail,
    getIsGuestMode,
    getIsReadOnlyMode,
    getIsSaving,
    getNewTripDataTemp,
    getPendingTransitCallback,
    getTargetDayIndex,
    getTravelData,
    getViewingItemIndex
} from './core/state/state-selectors.js';
import {
    setCurrentDayIndex as setCurrentDayIndexAction,
    setCurrentTab as setCurrentTabAction,
    setCurrentTripId as setCurrentTripIdAction,
    setCurrentTripUnsubscribe as setCurrentTripUnsubscribeAction,
    setCurrentUser as setCurrentUserAction,
    setEditingItemIndex as setEditingItemIndexAction,
    setInsertingItemIndex as setInsertingItemIndexAction,
    setIsEditing as setIsEditingAction,
    setIsEditingFromDetail as setIsEditingFromDetailAction,
    setIsGuestMode as setIsGuestModeAction,
    setIsReadOnlyMode as setIsReadOnlyModeAction,
    setIsSaving as setIsSavingAction,
    setNewTripDataTemp as setNewTripDataTempAction,
    setPendingTransitCallback as setPendingTransitCallbackAction,
    setTargetDayIndex as setTargetDayIndexAction,
    setTravelData as setTravelDataAction,
    setViewingItemIndex as setViewingItemIndexAction,
    updateMetaState as updateMetaStateAction,
    updateTimelineItemState as updateTimelineItemStateAction,
    updateTripDateState as updateTripDateStateAction
} from './core/state/state-actions.js';
import { getUiState, setUiState, uiState } from './core/state/ui-state.js';

export { defaultTravelData, uiState, setUiState, getUiState };

export let travelData = getTravelData();
export let currentDayIndex = getCurrentDayIndex();
export let targetDayIndex = getTargetDayIndex();
export let currentTripId = getCurrentTripId();
export let newTripDataTemp = getNewTripDataTemp();
export let pendingTransitCallback = getPendingTransitCallback();
export let editingItemIndex = getEditingItemIndex();
export let viewingItemIndex = getViewingItemIndex();
export let currentTripUnsubscribe = getCurrentTripUnsubscribe();
export let isEditing = getIsEditing();
export let currentUser = getCurrentUser();
export let insertingItemIndex = getInsertingItemIndex();
export let isEditingFromDetail = getIsEditingFromDetail();
export let isReadOnlyMode = getIsReadOnlyMode();
export let isGuestMode = getIsGuestMode();
export let currentTab = getCurrentTab();
export let isSaving = getIsSaving();

function syncFacadeState() {
    const snapshot = getFacadeStateSnapshot();
    travelData = snapshot.travelData;
    currentDayIndex = snapshot.currentDayIndex;
    targetDayIndex = snapshot.targetDayIndex;
    currentTripId = snapshot.currentTripId;
    newTripDataTemp = snapshot.newTripDataTemp;
    pendingTransitCallback = snapshot.pendingTransitCallback;
    editingItemIndex = snapshot.editingItemIndex;
    viewingItemIndex = snapshot.viewingItemIndex;
    currentTripUnsubscribe = snapshot.currentTripUnsubscribe;
    isEditing = snapshot.isEditing;
    currentUser = snapshot.currentUser;
    insertingItemIndex = snapshot.insertingItemIndex;
    isEditingFromDetail = snapshot.isEditingFromDetail;
    isReadOnlyMode = snapshot.isReadOnlyMode;
    isGuestMode = snapshot.isGuestMode;
    currentTab = snapshot.currentTab;
    isSaving = snapshot.isSaving;
}

syncFacadeState();
stateManager.subscribe(() => {
    syncFacadeState();
});

export const setTravelData = (value) => setTravelDataAction(value);
export const setCurrentDayIndex = (value) => setCurrentDayIndexAction(value);
export const setTargetDayIndex = (value) => setTargetDayIndexAction(value);
export const setCurrentTripId = (value) => setCurrentTripIdAction(value);
export const setNewTripDataTemp = (value) => setNewTripDataTempAction(value);
export const setPendingTransitCallback = (value) => setPendingTransitCallbackAction(value);
export const setEditingItemIndex = (value) => setEditingItemIndexAction(value);
export const setViewingItemIndex = (value) => setViewingItemIndexAction(value);
export const setCurrentTripUnsubscribe = (value) => setCurrentTripUnsubscribeAction(value);
export const setIsEditing = (value) => setIsEditingAction(value);
export const setCurrentUser = (value) => setCurrentUserAction(value);
export const setInsertingItemIndex = (value) => setInsertingItemIndexAction(value);
export const setIsEditingFromDetail = (value) => setIsEditingFromDetailAction(value);
export const setIsReadOnlyMode = (value) => setIsReadOnlyModeAction(value);
export const setIsGuestMode = (value) => setIsGuestModeAction(value);
export const setCurrentTab = (value) => setCurrentTabAction(value);
export const setIsSaving = (value) => setIsSavingAction(value);

export const subscribe = (listener) => stateManager.subscribe(listener);
export const updateMetaState = (key, value) => updateMetaStateAction(key, value);
export const updateTripDateState = (dayIndex, newDate) => updateTripDateStateAction(dayIndex, newDate);
export const updateTimelineItemState = (dayIndex, itemIndex, key, value) => updateTimelineItemStateAction(dayIndex, itemIndex, key, value);

export const useStateManager = () => stateManager;
export { stateManager as state };

installLegacyStateCompat();
