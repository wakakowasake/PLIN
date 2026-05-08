import {
    countTripTitleLength,
    TRIP_TITLE_MAX_LENGTH,
    truncateTripTitle
} from '../../../../shared/features/trips/trip-title.js';

function getWizardInput(id) {
    return document.getElementById(id);
}

export { buildTripCreatePayload } from '../../../../shared/features/trips/trip-create-helpers.js';

function getTripCreateTitleCounter() {
    return document.getElementById('new-trip-title-counter');
}

export function syncTripCreateTitleCounter() {
    const titleInput = getWizardInput('new-trip-title');
    const counter = getTripCreateTitleCounter();
    if (!counter) {
        return;
    }

    counter.textContent = `${countTripTitleLength(titleInput?.value || '')}/${TRIP_TITLE_MAX_LENGTH}`;
}

export function bindTripCreateTitleInput() {
    const titleInput = getWizardInput('new-trip-title');
    if (!titleInput) {
        return;
    }

    if (titleInput.dataset.tripTitleBound !== 'true') {
        titleInput.addEventListener('input', () => {
            const nextValue = truncateTripTitle(titleInput.value, TRIP_TITLE_MAX_LENGTH);
            if (titleInput.value !== nextValue) {
                titleInput.value = nextValue;
            }
            syncTripCreateTitleCounter();
        });
        titleInput.dataset.tripTitleBound = 'true';
    }

    syncTripCreateTitleCounter();
}

export function openTripCreateModalFlow({ setNewTripDataTemp, ensureNewTripModal, syncDateConstraint }) {
    setNewTripDataTemp({});
    ensureNewTripModal();

    const modal = document.getElementById('new-trip-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    document.querySelectorAll('[id^="wizard-step-"]').forEach((el) => el.classList.add('hidden'));
    document.getElementById('wizard-step-1')?.classList.remove('hidden');

    modal.querySelectorAll('input').forEach((input) => {
        input.value = '';
    });

    const startInput = getWizardInput('new-trip-start');
    const endInput = getWizardInput('new-trip-end');
    if (startInput && endInput) {
        const weekLater = new Date();
        weekLater.setDate(weekLater.getDate() + 7);
        const weekLaterPlus2 = new Date(weekLater);
        weekLaterPlus2.setDate(weekLaterPlus2.getDate() + 2);

        startInput.value = weekLater.toISOString().split('T')[0];
        endInput.value = weekLaterPlus2.toISOString().split('T')[0];
        syncDateConstraint(startInput, endInput);
    }

    bindTripCreateTitleInput();

    setTimeout(() => {
        getWizardInput('new-trip-location')?.focus();
    }, 100);
}

export function closeTripCreateModalFlow() {
    const modal = document.getElementById('new-trip-modal');
    if (modal) modal.classList.add('hidden');
}

export function validateTripDateRange(startInput, endInput, { showToast, showMessage = true } = {}) {
    const startDate = startInput?.value || '';
    const endDate = endInput?.value || '';

    if (!startDate || !endDate) {
        if (showMessage) showToast?.("시작일과 종료일을 입력해주세요.", 'warning');
        if (!startDate) startInput?.focus();
        else endInput?.focus();
        return false;
    }

    if (endDate < startDate) {
        if (showMessage) showToast?.("종료일은 시작일보다 이전일 수 없어요.", 'warning');
        endInput?.focus();
        return false;
    }

    return true;
}

export function syncTripDateConstraint(startInput, endInput) {
    if (!startInput || !endInput) return;

    const sync = () => {
        endInput.min = startInput.value || '';
        if (startInput.value && endInput.value && endInput.value < startInput.value) {
            endInput.value = startInput.value;
        }
    };

    if (startInput.dataset.dateConstraintBound !== 'true') {
        startInput.addEventListener('change', sync);
        startInput.addEventListener('input', sync);
        startInput.dataset.dateConstraintBound = 'true';
    }

    sync();
}

export function showTripWizardStep(step, { validateStepTwo, onStepShown } = {}) {
    if (step === 2 && typeof validateStepTwo === 'function' && !validateStepTwo()) {
        return false;
    }

    document.querySelectorAll('[id^="wizard-step-"]').forEach((el) => el.classList.add('hidden'));
    document.getElementById(`wizard-step-${step}`)?.classList.remove('hidden');

    if (typeof onStepShown === 'function') {
        onStepShown(step);
    }

    return true;
}

export function readTripCreateFormValues(newTripDataTemp) {
    const titleInput = getWizardInput('new-trip-title');
    const startInput = getWizardInput('new-trip-start');
    const endInput = getWizardInput('new-trip-end');
    const locationInput = getWizardInput('new-trip-location');

    return {
        titleInput,
        startInput,
        endInput,
        locationInput,
        title: titleInput?.value.trim() || '',
        startDate: startInput?.value || '',
        endDate: endInput?.value || '',
        location: newTripDataTemp.locationName || locationInput?.value.trim() || ''
    };
}
