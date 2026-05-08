import {
    countTripTitleLength,
    TRIP_TITLE_MAX_LENGTH,
    truncateTripTitle
} from '../../../../shared/features/trips/trip-title.js';

export {
    buildTripDateRangeDetails,
    getTripSubInfoPrefix,
    getTripSubInfoText,
    syncTravelDaysWithRange
} from '../../../../shared/features/trip-info/trip-info-helpers.js';

function getTripInfoTitleInput() {
    return document.getElementById('edit-trip-title');
}

function getTripInfoTitleCounter() {
    return document.getElementById('edit-trip-title-counter');
}

export function syncTripInfoTitleCounter() {
    const titleInput = getTripInfoTitleInput();
    const counter = getTripInfoTitleCounter();
    if (!counter) {
        return;
    }

    counter.textContent = `${countTripTitleLength(titleInput?.value || '')}/${TRIP_TITLE_MAX_LENGTH}`;
}

export function bindTripInfoTitleInput() {
    const titleInput = getTripInfoTitleInput();
    if (!titleInput) {
        return;
    }

    if (titleInput.dataset.tripTitleBound !== 'true') {
        titleInput.addEventListener('input', () => {
            const nextValue = truncateTripTitle(titleInput.value, TRIP_TITLE_MAX_LENGTH);
            if (titleInput.value !== nextValue) {
                titleInput.value = nextValue;
            }
            syncTripInfoTitleCounter();
        });
        titleInput.dataset.tripTitleBound = 'true';
    }

    syncTripInfoTitleCounter();
}

export function readTripInfoFormValues() {
    return {
        title: document.getElementById('edit-trip-title')?.value.trim() || '',
        location: document.getElementById('edit-trip-location')?.value.trim() || '',
        startStr: document.getElementById('edit-trip-start')?.value || '',
        endStr: document.getElementById('edit-trip-end')?.value || ''
    };
}

export function readTripDateRangeFormValues() {
    return {
        startStr: document.getElementById('edit-start-date')?.value || '',
        endStr: document.getElementById('edit-end-date')?.value || ''
    };
}
