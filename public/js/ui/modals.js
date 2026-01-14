import { setIsEditingFromDetail, setViewingItemIndex, setTargetDayIndex, setInsertingItemIndex, insertingItemIndex, targetDayIndex } from '../state.js';
import { travelData } from '../state.js';

export function lockBodyScroll() {
    document.body.classList.add('modal-open');
}

export function unlockBodyScroll() {
    document.body.classList.remove('modal-open');
}

export function showLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.remove('hidden');
}

export function hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.add('hidden');
}

export function openAddModal(index, dayIndex = null) {
    setInsertingItemIndex(Number(index));
    if (dayIndex !== null) setTargetDayIndex(dayIndex);
    const el = document.getElementById('add-selection-modal');
    if (el) el.classList.remove('hidden');
    lockBodyScroll();
}

export function closeAddModal() {
    const el = document.getElementById('add-selection-modal');
    if (el) el.classList.add('hidden');
    setInsertingItemIndex(null);
    unlockBodyScroll();
}

export function openCopyItemModal() {
    const modal = document.getElementById('copy-item-modal');
    const list = document.getElementById('copy-item-list');
    if (!modal || !list) return;
    list.innerHTML = '';

    let hasItems = false;
    (travelData.days || []).forEach((day, dIdx) => {
        if (!day.timeline || day.timeline.length === 0) return;
        hasItems = true;
        const header = document.createElement('div');
        header.className = "sticky top-0 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-xs font-bold text-gray-500 uppercase border-b border-gray-100 dark:border-gray-700 z-10";
        header.innerText = `${dIdx + 1}일차 • ${day.date}`;
        list.appendChild(header);

        day.timeline.forEach((item, iIdx) => {
            const btn = document.createElement('button');
            btn.className = "w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 flex items-center gap-3 transition-colors group";
            btn.onclick = () => { window.copyItemToCurrent && window.copyItemToCurrent(dIdx, iIdx); };
            let iconColor = "text-gray-400";
            if (item.isTransit) iconColor = "text-blue-400";
            else if (item.tag === '메모') iconColor = "text-yellow-400";
            else iconColor = "text-primary";

            btn.innerHTML = `
                <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-lg ${iconColor}">${item.icon}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-text-main dark:text-white truncate">${item.title}</p>
                    <p class="text-xs text-gray-400 truncate">${item.location || item.time || ''}</p>
                </div>
                <span class="material-symbols-outlined text-gray-300 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-all">add_circle</span>
            `;
            list.appendChild(btn);
        });
    });

    if (!hasItems) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">content_paste_off</span>
                <p class="text-sm">복사할 일정이 없습니다.</p>
            </div>
        `;
    }

    modal.classList.remove('hidden');
    lockBodyScroll();
}

export function closeCopyItemModal() {
    const modal = document.getElementById('copy-item-modal');
    if (modal) modal.classList.add('hidden');
    unlockBodyScroll();
}

export function copyItemToCurrent(dIdx, iIdx) {
    const sourceItem = travelData.days[dIdx].timeline[iIdx];
    const newItem = JSON.parse(JSON.stringify(sourceItem));
    const timeline = travelData.days[window.targetDayIndex || 0].timeline;
    if (typeof window.insertingItemIndex === 'number' && window.insertingItemIndex !== null) {
        timeline.splice(window.insertingItemIndex + 1, 0, newItem);
    } else {
        timeline.push(newItem);
    }
    // call global reorder and autosave if available
    window.reorderTimeline && window.reorderTimeline(window.targetDayIndex || 0);
    closeCopyItemModal();
    window.autoSave && window.autoSave();
}

export function closeDetailModal() {
    const el = document.getElementById('item-detail-modal');
    if (el) el.classList.add('hidden');
    const frame = document.getElementById('detail-map-frame');
    if (frame) frame.src = '';
    setViewingItemIndex(null);
    unlockBodyScroll();
}

export function selectAddType(type) {
    closeAddModal();
    
    if (type === 'place') {
        if (window.addTimelineItem) window.addTimelineItem(insertingItemIndex, targetDayIndex);
    } else if (type === 'memo') {
        if (window.addNoteItem) window.addNoteItem(insertingItemIndex);
    } else if (type === 'fastest') {
        if (window.addFastestTransitItem) window.addFastestTransitItem();
    } else {
        // Transit types: airplane, train, bus, car, walk
        if (window.addTransitItem) window.addTransitItem(insertingItemIndex, type, targetDayIndex);
    }
}

export default {
    lockBodyScroll,
    unlockBodyScroll,
    showLoading,
    hideLoading,
    openAddModal,
    closeAddModal,
    openCopyItemModal,
    closeCopyItemModal,
    copyItemToCurrent,
    closeDetailModal,
    selectAddType
};
