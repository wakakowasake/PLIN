let pendingDeleteIndex = null;
let pendingDeleteDayIndex = null;
let transitRecalculateConfirmCallback = null;
let transitRecalculateCancelCallback = null;

export function openDeleteConfirmModalFlow(index, dayIndex, groupCount, { onDeleteSingle, onDeleteGroup } = {}) {
    pendingDeleteIndex = index;
    pendingDeleteDayIndex = dayIndex;

    const modal = document.getElementById('delete-confirm-modal');
    const message = document.getElementById('delete-confirm-message');
    const deleteSingleBtn = document.getElementById('delete-single-btn');
    const deleteGroupBtn = document.getElementById('delete-group-btn');

    if (!modal || !message || !deleteSingleBtn || !deleteGroupBtn) {
        return false;
    }

    message.textContent = `이 항목은 최적경로 검색으로 생성된 ${groupCount}개 이동 경로의 일부입니다. 전체 경로를 함께 삭제하시겠습니까?`;
    deleteGroupBtn.textContent = `전체 경로 삭제 (${groupCount}개)`;

    deleteSingleBtn.onclick = () => onDeleteSingle?.();
    deleteGroupBtn.onclick = () => onDeleteGroup?.();

    modal.classList.remove('hidden');
    return true;
}

export function closeDeleteConfirmModalFlow() {
    const modal = document.getElementById('delete-confirm-modal');
    if (modal) modal.classList.add('hidden');
    pendingDeleteIndex = null;
    pendingDeleteDayIndex = null;
}

export function getPendingDeleteContext() {
    return {
        pendingDeleteIndex,
        pendingDeleteDayIndex
    };
}

export function showTransitRecalculateModalFlow(time, onConfirm, onCancel) {
    const modal = document.getElementById('transit-recalculate-modal');
    const timeDisplay = document.getElementById('transit-time-display');
    if (!modal || !timeDisplay) return false;

    timeDisplay.innerText = time;
    transitRecalculateConfirmCallback = onConfirm;
    transitRecalculateCancelCallback = onCancel;
    modal.classList.remove('hidden');
    return true;
}

export function closeTransitRecalculateModalFlow(shouldRecalculate) {
    const modal = document.getElementById('transit-recalculate-modal');
    if (modal) modal.classList.add('hidden');

    if (shouldRecalculate && transitRecalculateConfirmCallback) {
        transitRecalculateConfirmCallback();
    } else if (!shouldRecalculate && transitRecalculateCancelCallback) {
        transitRecalculateCancelCallback();
    }

    transitRecalculateConfirmCallback = null;
    transitRecalculateCancelCallback = null;
}
