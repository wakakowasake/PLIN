/**
 * StateManager - 중앙화된 상태 관리 시스템
 *
 * Phase 1.5 canonical source for core/state.
 */

import defaultTravelData from './app-state-defaults.js';
import logger from '../logger/logger.js';
import {
    selectTripDay
} from '../../../../shared/core/state/trip-target-helpers.js';
import {
    buildTimelineItemPatch,
    buildTripMetaPatch
} from '../../../../shared/core/state/trip-patch-helpers.js';

class StateManager {
    constructor() {
        this._state = {
            travelData: JSON.parse(JSON.stringify(defaultTravelData)),
            currentDayIndex: -1,
            targetDayIndex: 0,
            currentTab: 'main',
            currentTripId: null,
            newTripDataTemp: {},
            isEditing: false,
            isEditingFromDetail: false,
            isReadOnlyMode: false,
            isGuestMode: false,
            isSaving: false,
            editingItemIndex: null,
            viewingItemIndex: null,
            insertingItemIndex: null,
            currentUser: null,
            pendingTransitCallback: null,
            currentTripUnsubscribe: null
        };

        this._listeners = new Map();
        this._allListeners = new Set();
        this._history = [];
        this._isDev = location.hostname === 'localhost' ||
            location.hostname === '127.0.0.1';
    }

    get(key) {
        const keys = key.split('.');
        let value = this._state;

        for (const k of keys) {
            value = value[k];
            if (value === undefined) {
                logger.warn(`[State] 존재하지 않는 키: ${key}`);
                return undefined;
            }
        }

        return value;
    }

    set(key, value, options = {}) {
        const { skipNotify = false } = options;
        const keys = key.split('.');
        const oldValue = this.get(key);

        if (oldValue === value) {
            return;
        }

        let target = this._state;
        for (let i = 0; i < keys.length - 1; i += 1) {
            const k = keys[i];
            if (!(k in target)) {
                target[k] = {};
            }
            target = target[k];
        }

        const lastKey = keys[keys.length - 1];
        target[lastKey] = value;

        if (this._isDev) {
            this._recordHistory(key, oldValue, value);
        }

        if (!skipNotify) {
            this._notifyListeners(key);
        }
    }

    setBatch(updates, options = {}) {
        const { skipNotify = false } = options;

        for (const [key, value] of Object.entries(updates)) {
            const oldValue = this.get(key);
            if (oldValue !== value) {
                this.set(key, value, { skipNotify: true });
            }
        }

        if (!skipNotify) {
            Object.keys(updates).forEach((key) => this._notifyListeners(key));
        }
    }

    subscribe(keyOrCallback, callback = null) {
        let key;
        let cb;

        if (typeof keyOrCallback === 'function') {
            cb = keyOrCallback;
            this._allListeners.add(cb);
            return () => this._allListeners.delete(cb);
        }

        key = keyOrCallback;
        cb = callback;

        if (!this._listeners.has(key)) {
            this._listeners.set(key, new Set());
        }

        this._listeners.get(key).add(cb);

        return () => {
            this._listeners.get(key).delete(cb);
        };
    }

    getState() {
        return JSON.parse(JSON.stringify(this._state));
    }

    reset() {
        this._state.travelData = JSON.parse(JSON.stringify(defaultTravelData));
        this._state.currentDayIndex = -1;
        this._state.isEditing = false;
        this._notifyListeners('*');
    }

    getHistory(limit = 50) {
        return this._history.slice(-limit);
    }

    _recordHistory(key, oldValue, newValue) {
        this._history.push({
            timestamp: new Date().toISOString(),
            key,
            oldValue: this._serializeForHistory(oldValue),
            newValue: this._serializeForHistory(newValue)
        });

        if (this._history.length > 1000) {
            this._history.shift();
        }
    }

    _serializeForHistory(value) {
        if (value === null || value === undefined) return value;
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            return `{${keys.join(',')}${keys.length > 5 ? '...' : ''}}`;
        }
        return value;
    }

    _notifyListeners(key) {
        this._allListeners.forEach((cb) => {
            try {
                cb(key, this.get(key), this._state);
            } catch (error) {
                logger.error('[State] 리스너 실행 중 오류:', error);
            }
        });

        if (this._listeners.has(key)) {
            this._listeners.get(key).forEach((cb) => {
                try {
                    cb(this.get(key), this._state);
                } catch (error) {
                    logger.error('[State] 리스너 실행 중 오류:', error);
                }
            });
        }
    }

    debug() {
        console.group('[State] 디버그 정보');
        console.table(this._state);
        console.log('리스너 개수:', {
            전체: this._allListeners.size,
            특정키: Array.from(this._listeners.entries())
                .map(([k, v]) => `${k}: ${v.size}`)
                .join(', ')
        });
        console.groupEnd();
    }
}

const stateManager = new StateManager();

export default stateManager;

export const getState = () => stateManager.getState();
export const getTravelData = () => stateManager.get('travelData');
export const getCurrentDayIndex = () => stateManager.get('currentDayIndex');
export const getCurrentTripId = () => stateManager.get('currentTripId');
export const getCurrentUser = () => stateManager.get('currentUser');
export const getIsEditing = () => stateManager.get('isEditing');
export const getIsReadOnlyMode = () => stateManager.get('isReadOnlyMode');
export const getIsGuestMode = () => stateManager.get('isGuestMode');

export const setTravelData = (value) => stateManager.set('travelData', value);
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

export const subscribe = (listener) => stateManager.subscribe(listener);

export const updateMetaState = (key, value) => {
    const patch = buildTripMetaPatch(key, value);
    if (!patch) return;

    stateManager.set(patch.path, patch.value);
};

export const updateTripDateState = (dayIndex, newDate) => {
    const travelData = stateManager.get('travelData');
    if (selectTripDay(travelData, dayIndex)) {
        stateManager.set(`travelData.days.${dayIndex}.date`, newDate);
    }
};

export const updateTimelineItemState = (dayIndex, itemIndex, key, value) => {
    const travelData = stateManager.get('travelData');
    const patch = buildTimelineItemPatch(travelData, dayIndex, itemIndex, key, value);
    if (!patch) return;

    stateManager.set(patch.path, patch.value);
};
