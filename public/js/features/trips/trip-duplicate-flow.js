function getDuplicateOption(id) {
    const checkbox = document.getElementById(id);
    if (!checkbox) {
        throw new Error(`사본 만들기 옵션을 찾을 수 없습니다: ${id}`);
    }
    return checkbox.checked;
}

export { buildDuplicatedTripData } from '../../../../shared/features/trips/trip-duplicate-helpers.js';

export function resetDuplicateOptions(modal) {
    if (!modal) return;

    setTimeout(() => {
        modal.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
            checkbox.checked = true;
        });
    }, 300);
}

export function readDuplicateOptions() {
    return {
        optRegion: getDuplicateOption('copy-opt-region'),
        optPlaces: getDuplicateOption('copy-opt-places'),
        optMemos: getDuplicateOption('copy-opt-memos'),
        optBudget: getDuplicateOption('copy-opt-budget'),
        optShopping: getDuplicateOption('copy-opt-shopping'),
        optSupplies: getDuplicateOption('copy-opt-supplies')
    };
}
