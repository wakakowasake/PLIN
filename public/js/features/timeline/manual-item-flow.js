import { buildNoteTimelineItem, getDefaultTimelineStartTime } from './timeline-item-helpers.js';

let manualInputCallback = null;

export function openManualInputModalFlow(initialValue, callback, title = '직접 입력', label = '장소명 / 위치') {
    manualInputCallback = callback;

    const input = document.getElementById('manual-input-value');
    const modal = document.getElementById('manual-input-modal');
    if (!input || !modal) return;

    input.value = initialValue || '';
    input.onkeydown = (event) => {
        if (event.key === 'Enter') {
            confirmManualInputFlow();
        }
    };

    modal.querySelector('h3').innerText = title;
    modal.querySelector('label').innerText = label;
    modal.classList.remove('hidden');

    setTimeout(() => input.focus(), 100);
}

export function closeManualInputModalFlow() {
    document.getElementById('manual-input-modal')?.classList.add('hidden');
    manualInputCallback = null;
}

export function confirmManualInputFlow() {
    const input = document.getElementById('manual-input-value');
    if (!input) return;

    const value = input.value.trim();
    if (!value) {
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 300);
        input.focus();
        return;
    }

    manualInputCallback?.(value);
    closeManualInputModalFlow();
}

export function useManualInputFlow(type, {
    closeModal,
    finishNewTripWizard,
    getNewTripDataTemp,
    renderItinerary,
    updateMeta
} = {}) {
    let initialValue = '';
    if (type === 'item') {
        initialValue = document.getElementById('place-search')?.value || '';
    } else if (type === 'new-trip') {
        initialValue = document.getElementById('new-trip-location')?.value || '';
    }

    openManualInputModalFlow(initialValue, (value) => {
        const searchMode = window.searchMode;

        if (type === 'item') {
            if (searchMode === 'trip') {
                updateMeta?.('title', value);
                updateMeta?.('subInfo', value);
                renderItinerary?.();
                closeModal?.();
            } else {
                document.getElementById('item-title').value = value;
                document.getElementById('item-location').value = value;
                document.getElementById('item-title')?.focus();
            }
            return;
        }

        if (type === 'new-trip') {
            const newTripDataTemp = getNewTripDataTemp?.();
            document.getElementById('new-trip-location').value = value;
            if (newTripDataTemp) {
                newTripDataTemp.locationName = value;
                newTripDataTemp.address = value;
            }
            if (document.getElementById('wizard-step-1') && !document.getElementById('wizard-step-1').classList.contains('hidden')) {
                window.nextWizardStep?.(2);
            } else {
                finishNewTripWizard?.();
            }
        }
    });
}

export function addNoteItemFlow(insertIndex, {
    autoSave,
    parseDurationStr,
    parseTimeStr,
    formatTimeStr,
    renderItinerary,
    targetDayIndex,
    travelData
} = {}) {
    const timeline = travelData?.days?.[targetDayIndex]?.timeline;
    if (!Array.isArray(timeline)) return;

    const defaultTime = getDefaultTimelineStartTime(timeline, insertIndex, {
        parseTimeStr,
        parseDurationStr,
        formatTimeStr
    });

    openManualInputModalFlow('', (value) => {
        const newItem = buildNoteTimelineItem(value, defaultTime);

        if (insertIndex !== null && insertIndex !== -1) {
            timeline.splice(insertIndex + 1, 0, newItem);
        } else {
            timeline.push(newItem);
        }

        renderItinerary?.();
        autoSave?.();
    }, '메모 추가', '메모 내용');
}
