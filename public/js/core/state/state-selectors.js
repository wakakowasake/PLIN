import stateManager from './app-state.js';

export const getState = () => stateManager.getState();
export const getTravelData = () => stateManager.get('travelData');
export const getCurrentDayIndex = () => stateManager.get('currentDayIndex');
export const getTargetDayIndex = () => stateManager.get('targetDayIndex');
export const getCurrentTripId = () => stateManager.get('currentTripId');
export const getNewTripDataTemp = () => stateManager.get('newTripDataTemp');
export const getPendingTransitCallback = () => stateManager.get('pendingTransitCallback');
export const getEditingItemIndex = () => stateManager.get('editingItemIndex');
export const getViewingItemIndex = () => stateManager.get('viewingItemIndex');
export const getCurrentTripUnsubscribe = () => stateManager.get('currentTripUnsubscribe');
export const getIsEditing = () => stateManager.get('isEditing');
export const getCurrentUser = () => stateManager.get('currentUser');
export const getInsertingItemIndex = () => stateManager.get('insertingItemIndex');
export const getIsEditingFromDetail = () => stateManager.get('isEditingFromDetail');
export const getIsReadOnlyMode = () => stateManager.get('isReadOnlyMode');
export const getIsGuestMode = () => stateManager.get('isGuestMode');
export const getCurrentTab = () => stateManager.get('currentTab');
export const getIsSaving = () => stateManager.get('isSaving');

export function getFacadeStateSnapshot() {
    return {
        travelData: getTravelData(),
        currentDayIndex: getCurrentDayIndex(),
        targetDayIndex: getTargetDayIndex(),
        currentTripId: getCurrentTripId(),
        newTripDataTemp: getNewTripDataTemp(),
        pendingTransitCallback: getPendingTransitCallback(),
        editingItemIndex: getEditingItemIndex(),
        viewingItemIndex: getViewingItemIndex(),
        currentTripUnsubscribe: getCurrentTripUnsubscribe(),
        isEditing: getIsEditing(),
        currentUser: getCurrentUser(),
        insertingItemIndex: getInsertingItemIndex(),
        isEditingFromDetail: getIsEditingFromDetail(),
        isReadOnlyMode: getIsReadOnlyMode(),
        isGuestMode: getIsGuestMode(),
        currentTab: getCurrentTab(),
        isSaving: getIsSaving()
    };
}
