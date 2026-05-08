import { travelData, setInsertingItemIndex, setTargetDayIndex, setViewingItemIndex, insertingItemIndex, targetDayIndex, viewingItemIndex, uiState, setUiState } from '../state.js';
import { Z_INDEX } from './constants.js';
import { readMemoryComment } from '../features/memories/memory-helpers.js';

// ✅ [React Migration] 의존성 주입(DI): modals.js가 필요한 함수들을 받음
// modals.js는 UI 로직만 담당하고, 실제 액션은 주입된 핸들러를 통해 실행
let injectedHandlers = {
    addTimelineItem: null,
    addMemoryItem: null,
    addNoteItem: null,
    addFastestTransitItem: null,
    addTransitItem: null,
    openCopyItemModal: null,
    openPlanBModal: null
};

export function injectModalHandlers(handlers) {
    injectedHandlers = Object.assign(injectedHandlers, handlers);
}

// 📌 [Fix] Body scroll lock 카운팅: 여러 모달 동시 사용 시 스크롤 잠김 버그 방지
// React: useState로 변환 가능하도록 상태 분리
let scrollLockCount = 0;
export const getScrollLockCount = () => scrollLockCount;
export const setScrollLockCount = (count) => { scrollLockCount = count; };

export function lockBodyScroll() {
    scrollLockCount++;
    if (scrollLockCount === 1) {
        document.body.classList.add('modal-open');
    }
}

export function unlockBodyScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
        document.body.classList.remove('modal-open');
    }
}

// 🔍 디버그: 현재 스크롤 잠금 상태 확인 (개발 중용)
export function debugScrollLock() {
    const isLocked = document.body.classList.contains('modal-open');
    return { count: scrollLockCount, locked: isLocked };
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
    // 명시적으로 insertingItemIndex를 설정
    const numIndex = (index !== undefined && index !== null) ? Number(index) : -1;
    setInsertingItemIndex(numIndex);
    
    if (dayIndex !== null) setTargetDayIndex(dayIndex);
    const el = document.getElementById('add-selection-modal');
    if (el) {
        el.classList.remove('hidden');
        if (window.pushModalState) window.pushModalState();
    }
    lockBodyScroll();
}

/**
 * 일정 추가 선택 모달 닫기
 * @param {boolean} shouldResetIndex - insertingItemIndex를 초기화할지 여부 (기본값: true)
 *
 * ✅ [FIX] insertingItemIndex는 모달 닫기와 무관하게 유지되어야 함
 * 왜냐하면 selectAddType에서 addFastestTransitItem 등을 호출할 때 необходимо
 */
export function closeAddModal(shouldResetIndex = false) {
    // ✅ [변경] 기본값을 false로 변경: 모달 닫기 시 insertingItemIndex를 초기화하지 않음
    // 대신 명시적으로 resetIndex()를 호출해야 함
    const el = document.getElementById('add-selection-modal');
    if (el) el.classList.add('hidden');
    if (shouldResetIndex) {
        setInsertingItemIndex(null);
    }
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
    if (window.pushModalState) window.pushModalState();
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

    // [Fix] 기존 일정 가져올 때 추억, 지출 내역, 첨부파일 초기화
    // ✅ [Design] 복사된 일정은 '깨끗한 상태'로 시작 (기존 일정의 추억/지출/첨부파일은 포함 X)
    // 📝 메모(Note)는 title 필드로 보존됨 (사용자의 노트는 복사됨)
    delete newItem.memories;      // 🚫 추억 사진은 새로 추가하도록 유도
    delete newItem.expenses;      // 🚫 지출 내역 (배열) - 새 일정에서 새로 입력
    delete newItem.budget;        // 🚫 예산/지출 금액 - 새로 계산
    delete newItem.attachments;   // 🚫 첨부파일 (티켓 등) - 새로 첨부

    // [Fix] 모듈 내부 상태 변수 사용 (window 객체 대신)
    const currentTargetDay = targetDayIndex !== null ? targetDayIndex : 0;
    const currentInsertIndex = insertingItemIndex;

    const timeline = travelData.days[currentTargetDay].timeline;
    if (typeof currentInsertIndex === 'number' && currentInsertIndex !== null) {
        timeline.splice(currentInsertIndex + 1, 0, newItem);
    } else {
        timeline.push(newItem);
    }
    // call global reorder and autosave if available
    window.reorderTimeline && window.reorderTimeline(currentTargetDay);
    closeCopyItemModal();
    closeAddModal(); // [Fix] Add 모달도 닫기
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

export function selectAddType(type, subtype) {
    // insertingItemIndex와 targetDayIndex 저장
    const currentIndex = insertingItemIndex;
    const currentDay = targetDayIndex;

    // ✅ [FIX] closeAddModal(false)로 호출 - insertingItemIndex가 보존됨
    closeAddModal(false);

    if (type === 'place' || type === 'activity') {
        injectedHandlers.addTimelineItem?.(currentIndex, currentDay);
    } else if (type === 'memory') {
        injectedHandlers.addMemoryItem?.(currentIndex, currentDay);
    } else if (type === 'memo' || type === 'note') {
        injectedHandlers.addNoteItem?.(currentIndex);
    } else if (type === 'fastest') {
        injectedHandlers.addFastestTransitItem?.(currentIndex, currentDay);
    } else if (type === 'copy') {
        injectedHandlers.openCopyItemModal?.();
    } else if (type === 'plan-b') {
        injectedHandlers.openPlanBModal?.(currentIndex, currentDay);
    } else if (type === 'transit') {
        injectedHandlers.addTransitItem?.(currentIndex, subtype, currentDay);
    } else {
        injectedHandlers.addTransitItem?.(currentIndex, type, currentDay);
    }
}

// [General Delete Modal Logic]
// ✅ Phase 5.2: Pending 변수 제거 - 모두 uiState로 마이그레이션

function ensureGeneralDeleteModal() {
    let modal = document.getElementById('general-delete-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'general-delete-modal';
        modal.className = `hidden fixed inset-0 z-[${Z_INDEX.MODAL_CONFIRM}] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`;
        modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-8 modal-slide-in">
                <div class="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                    <span class="material-symbols-outlined text-4xl text-red-500">delete</span>
                </div>
                <h3 class="text-lg font-bold text-text-main dark:text-white mb-2">항목 삭제</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">정말 이 항목을 삭제하시겠습니까?</p>
                <div class="flex gap-3">
                    <button type="button" class="close-delete-modal flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl transition-colors">취소</button>
                    <button type="button" class="confirm-delete-btn flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 shadow-lg transition-colors">삭제</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

export function openGeneralDeleteModal(index, dayIndex) {
    ensureGeneralDeleteModal();
    setUiState('utility.pendingDeleteIndex', index);
    setUiState('utility.pendingDeleteDayIndex', dayIndex);
    const modal = document.getElementById('general-delete-modal');
    modal.classList.remove('hidden');
    if (window.pushModalState) window.pushModalState();

    // ✅ Phase 5.6 Step 3: onclick 제거, addEventListener 적용
    modal.querySelector('.close-delete-modal')?.addEventListener('click', closeGeneralDeleteModal);
    modal.querySelector('.confirm-delete-btn')?.addEventListener('click', confirmGeneralDelete);

    lockBodyScroll();
}

export function closeGeneralDeleteModal() {
    const modal = document.getElementById('general-delete-modal');
    if (modal) modal.classList.add('hidden');
    setUiState('utility.pendingDeleteIndex', null);
    setUiState('utility.pendingDeleteDayIndex', null);
    unlockBodyScroll();
}

export function confirmGeneralDelete() {
    const pendingDeleteIndex = uiState.utility.pendingDeleteIndex;
    if (pendingDeleteIndex === null) return;

    const dayIndex = uiState.utility.pendingDeleteDayIndex;
    const itemIndex = pendingDeleteIndex;
    const deletedItem = travelData.days[dayIndex].timeline[itemIndex];

    // 삭제 실행
    travelData.days[dayIndex].timeline.splice(itemIndex, 1);

    // UI 업데이트
    if (window.updateTotalBudget) window.updateTotalBudget();
    if (window.renderItinerary) window.renderItinerary();
    if (window.autoSave) window.autoSave();

    closeGeneralDeleteModal();
    closeDetailModal();

    // 실행 취소 토스트 표시
    showUndoToast("항목이 삭제되었습니다.", () => {
        // 복구 로직
        travelData.days[dayIndex].timeline.splice(itemIndex, 0, deletedItem);
        if (window.updateTotalBudget) window.updateTotalBudget();
        if (window.renderItinerary) window.renderItinerary();
        if (window.autoSave) window.autoSave();
    });
}

let toastPositionListenerBound = false;

function getBottomNavigationInset() {
    const nav = document.getElementById('app-nav');
    if (!nav) return 0;

    const style = window.getComputedStyle(nav);
    if (style.display === 'none' || style.visibility === 'hidden') return 0;
    if (!window.matchMedia('(max-width: 767px)').matches) return 0;
    if (style.position !== 'fixed' || style.bottom === 'auto') return 0;

    const rect = nav.getBoundingClientRect();
    if (!rect.height) return 0;

    const isDockedBottom = Math.abs(window.innerHeight - rect.bottom) <= 2;
    if (!isDockedBottom) return 0;

    return Math.ceil(rect.height);
}

function getToastBottomOffset() {
    const baseBottom = 24; // tailwind bottom-6
    const navInset = getBottomNavigationInset();
    if (!navInset) return baseBottom;
    return baseBottom + navInset + 8;
}

function applyToastBottomOffset(toastElement) {
    if (!toastElement) return;
    toastElement.style.bottom = `${getToastBottomOffset()}px`;
}

function refreshVisibleToastOffsets() {
    applyToastBottomOffset(document.getElementById('global-toast'));
    applyToastBottomOffset(document.getElementById('undo-toast'));
}

function ensureToastPositionListeners() {
    if (toastPositionListenerBound) return;
    toastPositionListenerBound = true;

    const update = () => refreshVisibleToastOffsets();
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
}

// [Toast Notification Logic]
export function showToast(message, type = 'info') {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-[${Z_INDEX.MODAL_SYSTEM}] transition-all duration-300 transform translate-y-20 opacity-0 font-bold text-sm pointer-events-none`;
        document.body.appendChild(toast);
    }

    // Reset styles
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-[${Z_INDEX.MODAL_SYSTEM}] transition-all duration-300 transform translate-y-20 opacity-0 font-bold text-sm pointer-events-none`;
    applyToastBottomOffset(toast);
    ensureToastPositionListeners();

    let icon = 'info';
    let bgClass = 'bg-gray-900 text-white';

    switch (type) {
        case 'success':
            icon = 'check_circle';
            bgClass = 'bg-green-600 text-white';
            break;
        case 'warning':
            icon = 'warning';
            bgClass = 'bg-orange-500 text-white';
            break;
        case 'error':
            icon = 'error';
            bgClass = 'bg-red-600 text-white';
            break;
    }

    toast.classList.add(...bgClass.split(' '));
    toast.innerHTML = `<span class="material-symbols-outlined text-lg">${icon}</span><span>${message}</span>`;

    // Show
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-20', 'opacity-0');
    });

    // Hide after 3s
    if (window.globalToastTimeout) clearTimeout(window.globalToastTimeout);
    window.globalToastTimeout = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// [Undo Toast Logic]
export function showUndoToast(message, onUndo) {
    let toast = document.getElementById('undo-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'undo-toast';
        toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 z-[${Z_INDEX.MODAL_SYSTEM}] transition-all duration-300 transform translate-y-20 opacity-0`;
        toast.innerHTML = `
            <span id="undo-toast-msg"></span>
            <button id="undo-toast-btn" class="text-yellow-400 font-bold hover:text-yellow-300 transition-colors">실행 취소</button>
        `;
        document.body.appendChild(toast);
    }

    applyToastBottomOffset(toast);
    ensureToastPositionListeners();

    document.getElementById('undo-toast-msg').innerText = message;

    const btn = document.getElementById('undo-toast-btn');
    btn.onclick = () => {
        onUndo();
        toast.classList.add('translate-y-20', 'opacity-0');
    };

    // 표시
    toast.classList.remove('translate-y-20', 'opacity-0');

    // 기존 타이머 제거 후 재설정
    if (window.undoToastTimeout) clearTimeout(window.undoToastTimeout);
    window.undoToastTimeout = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 4000); // 4초 후 사라짐
}
// [Custom Confirm Modal Logic]
export function showConfirmModal(message, onConfirm, options = {}) {
    const modal = document.getElementById('custom-confirm-modal');
    const messageEl = document.getElementById('custom-confirm-message');
    const iconEl = document.getElementById('custom-confirm-icon');
    const iconWrapperEl = document.getElementById('custom-confirm-icon-wrapper');
    const cancelBtn = document.getElementById('custom-confirm-cancel');
    const okBtn = document.getElementById('custom-confirm-ok');

    if (!modal || !messageEl || !iconEl) return;

    // Set message
    messageEl.textContent = message;

    // Set icon and color
    const icon = options.icon || 'help';
    const iconColor = options.iconColor || 'text-primary';
    const iconBgColor = options.iconBgColor || 'bg-primary/10';
    const confirmBtnColor = options.confirmBtnColor || 'bg-primary hover:opacity-90';

    iconEl.textContent = icon;
    iconEl.className = `material-symbols-outlined text-4xl ${iconColor}`;
    iconWrapperEl.className = `w-16 h-16 rounded-full ${iconBgColor} flex items-center justify-center mx-auto mb-4`;
    okBtn.className = `flex-1 py-3 ${confirmBtnColor} text-white font-bold rounded-2xl shadow-lg transition-all`;

    // Set button handlers
    cancelBtn.onclick = () => {
        modal.classList.add('hidden');
        unlockBodyScroll();
        if (typeof options.onCancel === 'function') {
            options.onCancel();
        }
    };

    okBtn.onclick = () => {
        modal.classList.add('hidden');
        unlockBodyScroll();
        if (onConfirm) onConfirm();
    };

    // Show modal
    modal.classList.remove('hidden');
    if (window.pushModalState) window.pushModalState();
    lockBodyScroll();
}
window.showConfirmModal = showConfirmModal;


// [Enhanced] Lightbox Logic
// ✅ Phase 5.2: Lightbox 변수 제거 - 모두 uiState로 마이그레이션

export function openLightbox(dayIndex, itemIndex, memoryIndex) {
    let modal = document.getElementById('lightbox-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'lightbox-modal';
        modal.className = `fixed inset-0 z-[${Z_INDEX.MODAL_LIGHTBOX}] bg-black/90 hidden flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-300 opacity-0`;
        modal.onclick = (e) => {
            if (e.target === modal || e.target.closest('.close-btn')) closeLightbox();
        };
        modal.innerHTML = `
            <div class="relative w-full h-full flex items-center justify-center">
                <!-- Close Button -->
                <button class="close-btn absolute top-4 left-4 z-[${Z_INDEX.MODAL_INNER + 10}] text-white/80 hover:text-white transition-colors p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm">
                    <span class="material-symbols-outlined text-3xl">close</span>
                </button>

                <!-- Menu Button -->
                <div class="absolute top-4 right-4 z-[${Z_INDEX.MODAL_INNER + 10}]">
                    <button class="lightbox-menu-btn text-white/80 hover:text-white transition-colors p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm">
                        <span class="material-symbols-outlined text-3xl">more_vert</span>
                    </button>
                    <!-- Dropdown Menu -->
                    <div id="lightbox-menu" class="hidden absolute right-0 mt-2 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-xl py-1 overflow-hidden">
                        <button class="delete-lightbox-memory-btn w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                            <span class="material-symbols-outlined text-lg">delete</span> 삭제
                        </button>
                    </div>
                </div>

                <!-- Image Container -->
                <div class="relative max-w-full max-h-full flex flex-col items-center justify-center p-4" 
                     style="touch-action: none;"
                     ontouchstart="handleLightboxTouchStart(event)" 
                     ontouchend="handleLightboxTouchEnd(event)">
                    <img id="lightbox-image" src="" alt="Memory" class="lightbox-image-btn max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl transform transition-transform duration-300 scale-95">
                    
                    <!-- Caption -->
                    <div id="lightbox-caption" class="mt-4 text-white text-center max-w-2xl bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl hidden">
                        <p id="lightbox-comment" class="text-sm md:text-base font-medium"></p>
                        <p id="lightbox-meta" class="text-xs text-white/70 mt-1"></p>
                    </div>
                </div>

                <!-- Navigation Buttons (DOM 순서 변경: 이미지 위에 표시되도록 아래로 이동) -->
                <button class="lightbox-nav-prev absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-[${Z_INDEX.MODAL_INNER + 50}] text-white/90 hover:text-white p-3 bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-md transition-all border border-white/10 shadow-lg">
                    <span class="material-symbols-outlined text-3xl md:text-5xl drop-shadow-md">chevron_left</span>
                </button>
                <button class="lightbox-nav-next absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-[${Z_INDEX.MODAL_INNER + 50}] text-white/90 hover:text-white p-3 bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-md transition-all border border-white/10 shadow-lg">
                    <span class="material-symbols-outlined text-3xl md:text-5xl drop-shadow-md">chevron_right</span>
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // 1. Collect all memories
    const newLightboxMemories = [];
    if (travelData && travelData.days) {
        travelData.days.forEach((day, dIdx) => {
            if (day.timeline) {
                day.timeline.forEach((item, iIdx) => {
                    if (item.memories && item.memories.length > 0) {
                        // [Fix] 이동수단인 경우 "출발지 -> 도착지" 형태로 표시
                        let displayTitle = item.title;
                        if (item.isTransit) {
                            const prevItem = iIdx > 0 ? day.timeline[iIdx - 1] : null;
                            const nextItem = iIdx < day.timeline.length - 1 ? day.timeline[iIdx + 1] : null;
                            const prevTitle = prevItem ? (prevItem.title || "출발지") : "출발지";
                            const nextTitle = nextItem ? (nextItem.title || "도착지") : "도착지";
                            displayTitle = `${prevTitle} ➡️ ${nextTitle}`;
                        }

                        item.memories.forEach((mem, mIdx) => {
                            newLightboxMemories.push({
                                ...mem,
                                dayIndex: dIdx,
                                itemIndex: iIdx,
                                memoryIndex: mIdx,
                                placeTitle: displayTitle,
                                date: day.date
                            });
                        });
                    }
                });
            }
        });
    }
    setUiState('lightbox.lightboxMemories', newLightboxMemories);

    // 2. Find start index
    const currentLightboxIndex = newLightboxMemories.findIndex(m =>
        m.dayIndex === dayIndex && m.itemIndex === itemIndex && m.memoryIndex === memoryIndex
    );

    if (currentLightboxIndex === -1 && newLightboxMemories.length > 0) {
        setUiState('lightbox.currentLightboxIndex', 0);
    } else if (currentLightboxIndex !== -1) {
        setUiState('lightbox.currentLightboxIndex', currentLightboxIndex);
    } else {
        return; // No memories
    }

    updateLightboxImage();

    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    if (window.pushModalState) window.pushModalState();

    // Keyboard navigation
    document.addEventListener('keydown', handleLightboxKeydown);

    // Lightbox button event listeners
    const menuBtn = modal.querySelector('.lightbox-menu-btn');
    if (menuBtn) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.toggleLightboxMenu === 'function') window.toggleLightboxMenu();
        });
    }

    const deleteBtn = modal.querySelector('.delete-lightbox-memory-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.deleteCurrentLightboxMemory === 'function') window.deleteCurrentLightboxMemory();
        });
    }

    const imgBtn = modal.querySelector('.lightbox-image-btn');
    if (imgBtn) {
        imgBtn.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    const prevBtn = modal.querySelector('.lightbox-nav-prev');
    if (prevBtn) {
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.navigateLightbox === 'function') window.navigateLightbox(-1);
        });
    }

    const nextBtn = modal.querySelector('.lightbox-nav-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof window.navigateLightbox === 'function') window.navigateLightbox(1);
        });
    }

    lockBodyScroll();
}

function updateLightboxImage(direction = 0) {
    const currentLightboxIndex = uiState.lightbox.currentLightboxIndex;
    const lightboxMemories = uiState.lightbox.lightboxMemories;
    const mem = lightboxMemories[currentLightboxIndex];
    if (!mem) return;

    const img = document.getElementById('lightbox-image');
    const caption = document.getElementById('lightbox-caption');
    const comment = document.getElementById('lightbox-comment');
    const meta = document.getElementById('lightbox-meta');
    const menu = document.getElementById('lightbox-menu');

    // Reset menu
    if (menu) menu.classList.add('hidden');

    // Apply Animation Class
    img.classList.remove('animate-lightbox-next', 'animate-lightbox-prev', 'animate-lightbox-fade');
    void img.offsetWidth; // Trigger reflow to restart animation

    if (direction > 0) img.classList.add('animate-lightbox-next');
    else if (direction < 0) img.classList.add('animate-lightbox-prev');
    else img.classList.add('animate-lightbox-fade');

    // Update Image
    if (mem.photoUrl) {
        img.src = mem.photoUrl;
        img.classList.remove('hidden');
    } else {
        // 사진 없는 경우
        img.src = "";
        img.classList.add('hidden');
    }

    // Update Caption
    const visibleComment = readMemoryComment(mem);
    if (visibleComment || mem.placeTitle) {
        caption.classList.remove('hidden');
        comment.textContent = visibleComment;
        meta.textContent = `${mem.date} • ${mem.placeTitle}`;
    } else {
        caption.classList.add('hidden');
    }
}

window.navigateLightbox = function (direction) {
    const currentLightboxIndex = uiState.lightbox.currentLightboxIndex;
    const lightboxMemories = uiState.lightbox.lightboxMemories;
    const newIndex = currentLightboxIndex + direction;
    if (newIndex >= 0 && newIndex < lightboxMemories.length) {
        setUiState('lightbox.currentLightboxIndex', newIndex);
        updateLightboxImage(direction);
    }
};

window.toggleLightboxMenu = function () {
    const menu = document.getElementById('lightbox-menu');
    if (menu) menu.classList.toggle('hidden');
};

window.deleteCurrentLightboxMemory = function () {
    const currentLightboxIndex = uiState.lightbox.currentLightboxIndex;
    const lightboxMemories = uiState.lightbox.lightboxMemories;
    const mem = lightboxMemories[currentLightboxIndex];
    if (!mem) return;

    if (confirm("이 소중한 추억을 정말 삭제하시겠습니까? 📸")) {
        // Remove from data
        const item = travelData.days[mem.dayIndex].timeline[mem.itemIndex];
        if (item && item.memories) {
            item.memories.splice(mem.memoryIndex, 1);

            // Remove from lightbox list
            const updatedMemories = [...lightboxMemories];
            updatedMemories.splice(currentLightboxIndex, 1);
            setUiState('lightbox.lightboxMemories', updatedMemories);

            // Save & Render
            if (window.autoSave) window.autoSave();
            if (window.renderItinerary) window.renderItinerary();

            // Update Lightbox View
            if (updatedMemories.length === 0) {
                closeLightbox();
            } else {
                if (currentLightboxIndex >= updatedMemories.length) {
                    setUiState('lightbox.currentLightboxIndex', updatedMemories.length - 1);
                }
                // Re-map indices for remaining items (optional but good for consistency if we were to re-fetch)
                // For simple navigation, just showing the next image is enough.
                updateLightboxImage();
            }
        }
    }
    // Hide menu
    document.getElementById('lightbox-menu')?.classList.add('hidden');
};

function handleLightboxKeydown(e) {
    if (e.key === 'ArrowLeft') window.navigateLightbox(-1);
    if (e.key === 'ArrowRight') window.navigateLightbox(1);
    if (e.key === 'Escape') closeLightbox();
}

window.handleLightboxTouchStart = function (e) {
    setUiState('lightbox.lightboxTouchStartX', e.changedTouches[0].screenX);
};

window.handleLightboxTouchEnd = function (e) {
    setUiState('lightbox.lightboxTouchEndX', e.changedTouches[0].screenX);
    handleSwipe();
};

function handleSwipe() {
    const threshold = 50;
    const lightboxTouchEndX = uiState.lightbox.lightboxTouchEndX;
    const lightboxTouchStartX = uiState.lightbox.lightboxTouchStartX;
    if (lightboxTouchEndX < lightboxTouchStartX - threshold) {
        window.navigateLightbox(1); // Swipe Left -> Next
    }
    if (lightboxTouchEndX > lightboxTouchStartX + threshold) {
        window.navigateLightbox(-1); // Swipe Right -> Prev
    }
}

export function closeLightbox() {
    const modal = document.getElementById('lightbox-modal');
    if (modal) {
        document.removeEventListener('keydown', handleLightboxKeydown);
        modal.classList.add('opacity-0');
        const img = modal.querySelector('#lightbox-image');
        if (img) {
            img.classList.remove('scale-100');
            img.classList.add('scale-95');
        }

        setTimeout(() => {
            modal.classList.add('hidden');
            if (img) img.src = '';
            unlockBodyScroll();
        }, 300);
    }
}

// [Memory Modal Logic]
export function ensureMemoryModal() {
    if (!document.getElementById('memory-modal')) {
        const modal = document.createElement('div');
        modal.id = 'memory-modal';
        modal.className = 'hidden fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';
        // 📌 [Fix] Z-Index consistency: Use Z_INDEX.MODAL_INPUT (210)
        modal.style.zIndex = Z_INDEX.MODAL_INPUT;
        modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="p-6 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-2xl font-bold text-text-main dark:text-white flex items-center gap-3">
                        <span class="material-symbols-outlined text-3xl">note_add</span>
                        추억 남기기
                    </h3>
                </div>
                <div class="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div>
                        <label class="block text-sm font-bold text-text-muted dark:text-gray-400 mb-3 uppercase tracking-wider">사진</label>
                        <div id="memory-photo-preview" class="w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors mb-3 overflow-hidden relative">
                            <div id="memory-photo-placeholder" class="text-center">
                                <span class="material-symbols-outlined text-4xl text-gray-400 block mb-2">image</span>
                                <p class="text-sm text-gray-500">사진을 클릭하여 업로드</p>
                            </div>
                            <img id="memory-photo-img" src="" alt="Preview" class="hidden w-full h-full object-cover">
                            <button type="button" id="memory-photo-clear" class="clear-memory-photo-btn hidden absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                                <span class="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        <input id="memory-photo-input" type="file" accept="image/*" multiple class="hidden">
                    </div>
                </div>
                <div class="p-6 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button type="button" class="close-memory-btn flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">취소</button>
                    <button type="button" class="save-memory-btn flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-orange-500 transition-colors flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined">check</span>
                        저장
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 이벤트 리스너 연결
        document.getElementById('memory-photo-preview').addEventListener('click', () => {
            const img = document.getElementById('memory-photo-img');
            if (img.classList.contains('hidden')) {
                document.getElementById('memory-photo-input').click();
            }
        });

        // Memory photo input change event
        document.getElementById('memory-photo-input').addEventListener('change', (e) => {
            if (typeof window.handleMemoryPhotoChange === 'function') {
                window.handleMemoryPhotoChange(e);
            }
        });

        // Clear photo button
        const clearBtn = modal.querySelector('.clear-memory-photo-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (typeof window.clearMemoryPhoto === 'function') window.clearMemoryPhoto();
            });
        }

        // Cancel button
        const cancelBtn = modal.querySelector('.close-memory-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (typeof window.closeMemoryModal === 'function') window.closeMemoryModal();
            });
        }

        // Save button
        const saveBtn = modal.querySelector('.save-memory-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (typeof window.saveMemoryItem === 'function') window.saveMemoryItem();
            });
        }

        modal.classList.add('modal-z-input');
        modal.classList.remove('hidden');
        if (window.pushModalState) window.pushModalState();
        lockBodyScroll();
    }
}

// [Memo Detail Modal Logic]
export function ensureMemoModal() {
    if (!document.getElementById('memo-detail-modal')) {
        const modal = document.createElement('div');
        modal.id = 'memo-detail-modal';
        modal.className = 'hidden fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';
        // 📌 [Fix] Z-Index consistency: Use Z_INDEX.MODAL_VIEW (150)
        modal.style.zIndex = Z_INDEX.MODAL_VIEW;
        // 배경 클릭 시 닫기
        modal.onclick = (e) => {
            if (e.target === modal) closeMemoModal();
        };
        modal.innerHTML = `
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/30 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 p-6 relative" 
                onclick="event.stopPropagation()">
                <button type="button" class="close-memo-btn absolute top-4 right-4 text-yellow-700 dark:text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 p-1 rounded-full transition-colors">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="mt-2">
                    <h3 class="text-lg font-bold text-yellow-800 dark:text-yellow-400 mb-4 flex items-center gap-2">
                        <span class="material-symbols-outlined">sticky_note_2</span>
                        메모
                    </h3>
                    <div id="memo-detail-content" class="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed font-body text-lg min-h-[100px] max-h-[60vh] overflow-y-auto pr-2"></div>
                    
                    <div id="memo-bookmarks" class="mt-4 pt-4 border-t border-yellow-200 dark:border-yellow-700/30 hidden">
                        <p class="text-xs font-bold text-yellow-700 dark:text-yellow-500 uppercase mb-2">관련 링크</p>
                        <div id="memo-bookmarks-list" class="flex flex-col gap-2"></div>
                    </div>
                </div>
                 <div class="mt-6 flex justify-end">
                    <button type="button" class="edit-memo-btn text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">edit</span> 수정
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Memo modal button event listeners
        const closeBtn = modal.querySelector('.close-memo-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (typeof window.closeMemoModal === 'function') window.closeMemoModal();
            });
        }

        const editBtn = modal.querySelector('.edit-memo-btn');
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                if (typeof window.editCurrentMemo === 'function') window.editCurrentMemo();
            });
        }
    }
}

export function openMemoModal(item, index = null) {
    if (index !== null) {
        setViewingItemIndex(index);
    }
    ensureMemoModal();
    const modal = document.getElementById('memo-detail-modal');
    const content = document.getElementById('memo-detail-content');
    const bookmarksContainer = document.getElementById('memo-bookmarks');
    const bookmarksList = document.getElementById('memo-bookmarks-list');

    content.innerHTML = "";

    const { html, links } = processMemoContent(item.title);
    content.innerHTML = html;
    renderBookmarks(links, bookmarksContainer, bookmarksList);

    const btnContainer = modal.querySelector('.mt-6');
    if (btnContainer) {
        const btn = btnContainer.querySelector('button');
        if (btn) {
            btn.setAttribute('onclick', 'Modals.editCurrentMemo()');
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
            btn.className = "text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1";
        }
    }

    modal.classList.remove('hidden');
    // [Fix] Ensure it's at the end of body and has highest z-index
    document.body.appendChild(modal);
    modal.classList.add('modal-z-view');

    if (window.pushModalState) window.pushModalState();
    lockBodyScroll();
}

export function closeMemoModal() {
    const modal = document.getElementById('memo-detail-modal');
    if (modal) modal.classList.add('hidden');
    setViewingItemIndex(null);
    unlockBodyScroll();
}

export function editCurrentMemo() {
    if (viewingItemIndex === null) return;

    const contentEl = document.getElementById('memo-detail-content');
    const currentText = contentEl.innerText;

    contentEl.innerHTML = `<textarea id="memo-edit-area" class="w-full h-60 bg-white/50 dark:bg-black/20 border-2 border-yellow-300 dark:border-yellow-600/50 rounded-lg p-3 text-gray-800 dark:text-gray-200 resize-none focus:ring-0 outline-none leading-relaxed font-body text-lg placeholder-gray-400" placeholder="메모를 입력하세요">${currentText}</textarea>`;

    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    const btn = btnContainer.querySelector('button');

    btn.setAttribute('onclick', 'Modals.saveCurrentMemo()');
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">save</span> 저장`;
    btn.className = "text-sm bg-primary text-white hover:bg-orange-500 px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-md";

    setTimeout(() => document.getElementById('memo-edit-area').focus(), 50);
}

export function saveCurrentMemo() {
    if (viewingItemIndex === null) return;

    const textarea = document.getElementById('memo-edit-area');
    if (!textarea) return;

    const newText = textarea.value;

    travelData.days[targetDayIndex].timeline[viewingItemIndex].title = newText;

    const { html, links } = processMemoContent(newText);

    const contentEl = document.getElementById('memo-detail-content');
    contentEl.innerHTML = html;
    renderBookmarks(links, document.getElementById('memo-bookmarks'), document.getElementById('memo-bookmarks-list'));

    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    const btn = btnContainer.querySelector('button');

    btn.setAttribute('onclick', 'editCurrentMemo()');
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
    btn.className = "text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1";

    if (window.renderItinerary) window.renderItinerary();
    if (window.autoSave) window.autoSave();
}

// [Helpers for Memo]
function processMemoContent(text) {
    if (!text) return { html: '', links: [] };
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = [];
    const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = safeText.replace(urlRegex, (url) => {
        links.push(url);
        return `<a href="${url}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline break-all" onclick="event.stopPropagation()">${url}</a>`;
    });
    return { html, links };
}

function renderBookmarks(links, container, list) {
    if (!links || links.length === 0) {
        container.classList.add('hidden');
        list.innerHTML = '';
        return;
    }
    let html = '';
    const uniqueLinks = [...new Set(links)];
    uniqueLinks.forEach(link => {
        try {
            const urlObj = new URL(link);
            html += `
                <a href="${link}" target="_blank" class="flex items-center gap-3 p-3 bg-white/50 dark:bg-black/20 border border-yellow-200 dark:border-yellow-700/30 rounded-xl hover:bg-yellow-100/50 dark:hover:bg-yellow-900/30 transition-colors group">
                    <div class="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center text-yellow-700 dark:text-yellow-500 flex-shrink-0">
                        <span class="material-symbols-outlined">public</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-gray-800 dark:text-gray-200 truncate group-hover:text-primary transition-colors">${urlObj.hostname}</p>
                        <p class="text-xs text-gray-500 truncate opacity-70">${link}</p>
                    </div>
                    <span class="material-symbols-outlined text-gray-400 text-sm">open_in_new</span>
                </a>
            `;
        } catch (e) { }
    });
    list.innerHTML = html;
    container.classList.remove('hidden');
}

// [Expense Modal Logic]
let selectedShoppingItemIndex = null;

export function ensureExpenseModal() {
    if (!document.getElementById('expense-modal')) {
        const modal = document.createElement('div');
        modal.id = 'expense-modal';
        modal.className = 'hidden fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm modal-z-input';
        modal.innerHTML = `
            <div class="modal-surface-card expense-modal-card bg-white dark:bg-card-dark rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 modal-slide-in">
                <div class="modal-surface-header expense-modal-header p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <h3 class="text-lg font-bold text-text-main dark:text-white">지출 내역 추가</h3>
                    <button type="button" class="close-expense-btn modal-icon-button text-gray-400 hover:text-gray-600 transition-colors">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div class="modal-surface-body expense-modal-body p-6 flex flex-col gap-4">
                    <div id="expense-location-container" class="expense-field-group hidden">
                        <label class="modal-field-label block text-xs font-bold text-gray-500 uppercase mb-1">사용 장소</label>
                        <select id="expense-location-select" class="modal-text-input w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer focus:ring-2 focus:ring-primary/50 outline-none">
                        </select>
                    </div>
                    <div class="expense-field-group">
                        <label class="modal-field-label block text-xs font-bold text-gray-500 uppercase mb-1">사용 내역</label>
                        <div class="flex gap-2">
                            <input id="expense-desc" type="text" class="modal-text-input flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800" placeholder="예: 입장료, 점심 식사">
                            <button type="button" class="open-shopping-list-btn modal-icon-button px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0" title="쇼핑 리스트에서 선택">
                                <span class="material-symbols-outlined text-gray-600 dark:text-gray-300">shopping_bag</span>
                            </button>
                        </div>
                    </div>
                    <div class="expense-field-group">
                        <label class="modal-field-label block text-xs font-bold text-gray-500 uppercase mb-1">금액 (원)</label>
                        <div class="relative">
                            <span class="absolute left-3 top-2.5 text-gray-400 font-bold">₩</span>
                            <input id="expense-cost" type="text" inputmode="numeric" class="modal-text-input w-full pl-8 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800 font-bold" placeholder="0">
                        </div>
                    </div>
                </div>
                <div class="modal-surface-footer p-5 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button type="button" class="save-expense-btn modal-primary-button flex-1 py-3 bg-primary text-white font-bold rounded-xl hover:bg-orange-500 shadow-lg active:scale-95 transition-all">지출 추가</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 금액 입력 시 천 단위 콤마 자동 포맷팅
        const costInput = document.getElementById('expense-cost');
        costInput.addEventListener('input', (e) => {
            const value = e.target.value.replace(/[^0-9]/g, '');
            if (value) {
                e.target.value = Number(value).toLocaleString();
            } else {
                e.target.value = '';
            }
        });

        // Expense modal event listeners
        const closeBtn = modal.querySelector('.close-expense-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (typeof window.closeExpenseModal === 'function') window.closeExpenseModal();
            });
        }

        const shoppingBtn = modal.querySelector('.open-shopping-list-btn');
        if (shoppingBtn) {
            shoppingBtn.addEventListener('click', () => {
                if (typeof window.openShoppingListSelector === 'function') window.openShoppingListSelector();
            });
        }

        const saveBtn = modal.querySelector('.save-expense-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (typeof window.saveExpense === 'function') window.saveExpense();
            });
        }
    }
}

export function openExpenseModal(dayIdx = null, fromDetail = false) {
    if (dayIdx !== null) setTargetDayIndex(dayIdx);
    ensureExpenseModal();
    window.isAddingFromDetail = !!fromDetail; // [Fix] Force boolean

    const modal = document.getElementById('expense-modal');
    // 📌 [Fix] Z-Index consistency: Use Z_INDEX.MODAL_INPUT (210)
    // Level: Above item-detail-modal (150), ensuring it displays properly when called from detail modal
    modal.style.zIndex = Z_INDEX.MODAL_INPUT;
    modal.classList.add('modal-z-input');

    if (modal.parentNode !== document.body) {
        document.body.appendChild(modal);
    }

    // [Fix] Ensure saveBtn has correct handler
    const saveBtn = document.getElementById('expense-save-btn');
    if (saveBtn) {
        saveBtn.onclick = saveExpense;
    }

    // [Added] Location Select Logic
    const locContainer = document.getElementById('expense-location-container');
    const locSelect = document.getElementById('expense-location-select');

    if (window.isAddingFromDetail && typeof dayIdx === 'number') {
        locContainer.classList.remove('hidden');
        locSelect.innerHTML = '';

        const day = travelData.days[dayIdx];
        let options = ``; // [User Request] Remove "Unknown Location" option

        if (day && day.timeline) {
            day.timeline.forEach((item, idx) => {
                let title = item.title;
                // [Fix] Handle empty title and 'Walk' specifically
                if (!title || title.trim() === '') {
                    title = (item.tag === '도보') ? '도보' : '이름 없는 장소';
                }

                // [User Request] Add prefix with space for all transit items including Walk
                if (item.isTransit || item.tag === '도보') {
                    title = `[이동수단] ${title}`;
                }
                options += `<option value="${idx}">${title}</option>`;
            });
        }
        locSelect.innerHTML = options;

        // Default to last item if exists (User Request: "기존 장소에서 추가하도록 하고")
        if (day && day.timeline && day.timeline.length > 0) {
            // [Fix] Use viewingItemIndex if available (from Detail Modal), otherwise last item
            if (window.isAddingFromDetail && typeof window.viewingItemIndex === 'number' && window.viewingItemIndex !== null) {
                locSelect.value = window.viewingItemIndex;
            } else {
                locSelect.value = day.timeline.length - 1;
            }
        } else {
            // If no items, ensure select is empty or hidden if no options
            // locSelect.value = "-1"; // No longer needed as "Unknown Location" is removed
        }
    } else {
        if (locContainer) locContainer.classList.add('hidden');
    }

    document.getElementById('expense-desc').value = "";
    document.getElementById('expense-cost').value = "";
    modal.classList.remove('hidden');
    if (window.pushModalState) window.pushModalState();
    setTimeout(() => document.getElementById('expense-desc').focus(), 100);
    lockBodyScroll();
}

export function closeExpenseModal() {
    selectedShoppingItemIndex = null;
    window.isAddingFromDetail = false;
    const modal = document.getElementById('expense-modal');
    if (modal) modal.classList.add('hidden');
    unlockBodyScroll();
}

export function saveExpense() {
    const desc = document.getElementById('expense-desc').value;
    const costRaw = document.getElementById('expense-cost').value;
    const cost = costRaw.replace(/,/g, ''); // 콤마 제거

    if (!desc || !cost) {
        showToast("지출 내역과 금액을 모두 입력해주세요! 💸", 'warning');
        return;
    }

    const selectedLocationIndex = document.getElementById('expense-location-select')?.value;
    const isGeneral = window.isAddingFromDetail && selectedLocationIndex === "-1";

    let targetItem;
    // Current day index fix
    let dayIndex = (typeof targetDayIndex === 'number') ? targetDayIndex : 0;
    if (dayIndex === -1) dayIndex = 0;

    const currentDay = travelData.days[dayIndex];

    if (!currentDay) {
        console.error("SaveExpense: Day not found", dayIndex);
        showToast("일정 데이터를 찾을 수 없습니다.", 'error');
        return;
    }

    if (window.isAddingFromDetail && selectedLocationIndex && selectedLocationIndex !== "-1") {
        targetItem = currentDay.timeline[parseInt(selectedLocationIndex)];
    } else {
        // Fallback hierarchy: viewingItemIndex -> Last item -> First item
        if (typeof viewingItemIndex === 'number' && currentDay.timeline[viewingItemIndex]) {
            targetItem = currentDay.timeline[viewingItemIndex];
        } else if (currentDay.timeline.length > 0) {
            targetItem = currentDay.timeline[currentDay.timeline.length - 1];
        }
    }

    if (!targetItem) {
        showToast("지출을 추가할 장소를 찾을 수 없습니다.", 'error');
        return;
    }

    if (!targetItem.expenses) targetItem.expenses = [];

    const newExpense = {
        description: desc,
        amount: Number(cost),
        isGeneral: isGeneral // Mark as general if no specific item is selected
    };
    targetItem.expenses.push(newExpense);

    // Update item's budget (sum of its expenses)
    targetItem.budget = targetItem.expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);

    // 쇼핑 리스트 연동 처리
    if (selectedShoppingItemIndex !== null && travelData.shoppingList && travelData.shoppingList[selectedShoppingItemIndex]) {
        const shoppingItem = travelData.shoppingList[selectedShoppingItemIndex];
        shoppingItem.checked = true;

        if (!shoppingItem.location && targetItem.title) {
            shoppingItem.location = targetItem.title;
            shoppingItem.locationDetail = targetItem.location || '';
        }

        window.lastExpenseLocation = targetItem.title;
        selectedShoppingItemIndex = null;
        if (window.renderLists) window.renderLists();
    }

    // [Fix] Refresh Detail Modal IMMEDIATELY after data change
    if (typeof window.refreshExpenseDetail === 'function') {
        window.refreshExpenseDetail();
    }

    // These functions are now called after refreshExpenseDetail
    if (window.renderExpenseList) window.renderExpenseList(targetItem);
    closeExpenseModal();

    // [Fix] Force total budget update with the latest travelData
    if (window.updateTotalBudget) {
        window.updateTotalBudget(travelData);
    }

    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = travelData.meta.budget || '₩0';
    }

    if (window.renderItinerary) window.renderItinerary();
    if (window.autoSave) window.autoSave();
}

// [Shopping Selector Modal Logic]
export function ensureShoppingSelectorModal() {
    let modal = document.getElementById('shopping-selector-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'shopping-selector-modal';
        modal.className = `hidden fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`;
        modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-text-main dark:text-white">쇼핑 리스트에서 선택</h3>
                    <button type="button" class="close-shopping-selector-btn text-gray-400 hover:text-gray-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div id="shopping-selector-list" class="p-4 max-h-96 overflow-y-auto"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Shopping selector close button event listener
        const closeBtn = modal.querySelector('.close-shopping-selector-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (typeof window.closeShoppingListSelector === 'function') window.closeShoppingListSelector();
            });
        }
    }
    // [Fix] 항상 최신 Z-Index 적용 (HMR 대응)
    modal.classList.add('modal-z-selector');
}

export function openShoppingListSelector() {
    ensureShoppingSelectorModal();
    const modal = document.getElementById('shopping-selector-modal');
    // [Fix] Move to end of body and ensure visibility
    document.body.appendChild(modal);
    const listContainer = document.getElementById('shopping-selector-list');

    // Get current location context
    const locSelect = document.getElementById('expense-location-select');
    let currentPlaceTitle = '';

    // 1. Try to get from location select (if visible/used)
    if (locSelect && !locSelect.parentElement.classList.contains('hidden') && locSelect.value !== "-1") {
        const itemIdx = parseInt(locSelect.value);
        const dayIdx = (typeof targetDayIndex === 'number' && travelData.days[targetDayIndex]) ? targetDayIndex : 0;
        const item = travelData.days[dayIdx]?.timeline[itemIdx];
        if (item) currentPlaceTitle = item.title;
    }
    // 2. Fallback to viewingItemIndex (Detail Modal context)
    else if (typeof viewingItemIndex === 'number') {
        const dayIdx = (typeof targetDayIndex === 'number' && travelData.days[targetDayIndex]) ? targetDayIndex : 0;
        const item = travelData.days[dayIdx]?.timeline[viewingItemIndex];
        if (item) currentPlaceTitle = item.title;
    }

    if (!travelData.shoppingList || travelData.shoppingList.length === 0) {
        listContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">쇼핑 리스트가 비어있습니다.</p>';
    } else {
        // Filter unchecked items and sort by proximity (location match)
        const items = travelData.shoppingList
            .map((item, idx) => ({ ...item, originalIndex: idx }))
            .filter(item => !item.checked)
            .sort((a, b) => {
                const aLoc = (a.location || '').trim();
                const bLoc = (b.location || '').trim();
                const curLoc = (currentPlaceTitle || '').trim();
                const aMatches = aLoc === curLoc;
                const bMatches = bLoc === curLoc;
                if (aMatches && !bMatches) return -1;
                if (!aMatches && bMatches) return 1;
                return 0;
            });

        if (items.length === 0) {
            listContainer.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">이미 모든 항목을 구매하셨거나<br>남은 쇼핑 리스트가 없습니다.</p>';
        } else {
            listContainer.innerHTML = items.map((item) => {
                const itemLoc = (item.location || '').trim();
                const curLoc = (currentPlaceTitle || '').trim();
                const isMatch = itemLoc !== '' && itemLoc === curLoc;
                return `
                <button type="button" class="shopping-item-btn" data-shopping-index="${item.originalIndex}"
                    class="w-full text-left px-4 py-3 rounded-xl border-2 transition-all mb-2 flex flex-col gap-1 ${isMatch ? 'border-primary bg-primary/5 recommend-float' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}">
                    <div class="flex items-center justify-between">
                        <div class="flex-1 min-w-0">
                            <div class="font-bold text-sm text-text-main dark:text-white truncate">${item.text}</div>
                            ${item.location ? `
                                <div class="flex items-center gap-1 text-[10px] ${isMatch ? 'text-primary' : 'text-gray-500'} font-bold mt-1">
                                    <span class="material-symbols-outlined text-xs">location_on</span>
                                    ${item.location}
                                </div>
                            ` : ''}
                        </div>
                        ${isMatch ? '' : '<span class="material-symbols-outlined text-gray-300">chevron_right</span>'}
                    </div>
                </button>
                `;
            }).join('');
        }
    }

    modal.classList.remove('hidden');
    if (window.pushModalState) window.pushModalState();
    lockBodyScroll();

    // Shopping item click event listeners
    const shoppingItems = modal.querySelectorAll('.shopping-item-btn');
    shoppingItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.shoppingIndex);
            if (typeof window.selectShoppingItem === 'function') window.selectShoppingItem(index);
        });
    });
}

export function closeShoppingListSelector() {
    const modal = document.getElementById('shopping-selector-modal');
    if (modal) modal.classList.add('hidden');
    unlockBodyScroll();
}

export function selectShoppingItem(idx) {
    const item = travelData.shoppingList[idx];
    const descInput = document.getElementById('expense-desc');

    selectedShoppingItemIndex = idx;
    if (descInput) descInput.value = item.text;

    closeShoppingListSelector();
    setTimeout(() => {
        const costInput = document.getElementById('expense-cost');
        if (costInput) costInput.focus();
    }, 100);
}

// [Global Confirmation Modal]
export function openConfirmationModal(title, message, onConfirm) {
    let modal = document.getElementById('global-confirmation-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'global-confirmation-modal';
        modal.className = `hidden fixed inset-0 z-[${Z_INDEX.MODAL_CONFIRM}] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`;
        modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-8 modal-slide-in">
                <div class="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                    <span class="material-symbols-outlined text-4xl text-red-500">priority_high</span>
                </div>
                <h3 id="confirm-modal-title" class="text-lg font-bold text-text-main dark:text-white mb-2"></h3>
                <p id="confirm-modal-message" class="text-sm text-gray-500 dark:text-gray-400 mb-6 whitespace-pre-line"></p>
                <div class="flex gap-3">
                    <button type="button" class="close-confirmation-btn flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl transition-colors">취소</button>
                    <button type="button" id="confirm-modal-btn" class="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 shadow-lg transition-colors">확인</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    document.getElementById('confirm-modal-title').innerText = title;
    document.getElementById('confirm-modal-message').innerText = message;

    const confirmBtn = document.getElementById('confirm-modal-btn');
    const newBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

    newBtn.addEventListener('click', () => {
        if (typeof window.closeConfirmationModal === 'function') window.closeConfirmationModal();
        if (onConfirm) onConfirm();
    });

    // Close button event listener
    const closeBtn = modal.querySelector('.close-confirmation-btn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            if (typeof window.closeConfirmationModal === 'function') window.closeConfirmationModal();
        };
    }

    modal.classList.remove('hidden');
    lockBodyScroll();
}

export function closeConfirmationModal() {
    const modal = document.getElementById('global-confirmation-modal');
    if (modal) modal.classList.add('hidden');
    unlockBodyScroll();
}

// [Guest Mode] Login Prompt Modal Logic
export function openLoginPromptModal(featureName = "이 기능") {
    let modal = document.getElementById('login-prompt-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'login-prompt-modal';
        modal.className = `hidden fixed inset-0 z-[${Z_INDEX.MODAL_CONFIRM}] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`;
        modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-8 modal-slide-in">
                <div class="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                    <span class="material-symbols-outlined text-5xl text-primary">lock</span>
                </div>
                <h3 id="login-prompt-title" class="text-xl font-bold text-text-main dark:text-white mb-2">로그인이 필요합니다</h3>
                <p id="login-prompt-desc" class="text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                    ${featureName}은 로그인 후 이용하실 수 있습니다.<br>지금 로그인하고 소중한 여행 계획을 저장해보세요!
                </p>
                <div class="flex flex-col gap-3">
                    <button type="button" data-provider="google" class="login-prompt-login-btn social-login-button social-login-button--google">
                        <span class="social-login-button__content">
                            <span class="social-login-button__icon-slot" aria-hidden="true">
                                <img src="/images/auth/google-ci-transparent.png" alt="" class="social-login-button__icon social-login-button__icon--google">
                            </span>
                            <span class="social-login-button__label">구글 로그인</span>
                            <span class="social-login-button__icon-slot" aria-hidden="true"></span>
                        </span>
                    </button>
                    <button type="button" data-provider="kakao" class="login-prompt-login-btn social-login-button social-login-button--kakao">
                        <span class="social-login-button__content">
                            <span class="social-login-button__icon-slot social-login-button__icon-slot--kakao" aria-hidden="true">
                                <img src="/images/auth/kakao-ci-transparent.png" alt="" class="social-login-button__icon social-login-button__icon--kakao">
                            </span>
                            <span class="social-login-button__label">카카오 로그인</span>
                            <span class="social-login-button__icon-slot social-login-button__icon-slot--kakao" aria-hidden="true"></span>
                        </span>
                    </button>
                    <button type="button" data-provider="naver" class="login-prompt-login-btn social-login-button social-login-button--naver">
                        <span class="social-login-button__content">
                            <span class="social-login-button__icon-slot social-login-button__icon-slot--naver" aria-hidden="true">
                                <img src="/images/auth/naver-ci-transparent.png" alt="" class="social-login-button__icon social-login-button__icon--naver">
                            </span>
                            <span class="social-login-button__label">네이버 로그인</span>
                            <span class="social-login-button__icon-slot social-login-button__icon-slot--naver" aria-hidden="true"></span>
                        </span>
                    </button>
                    <button type="button" data-provider="apple" class="login-prompt-login-btn social-login-button social-login-button--apple">
                        <span class="social-login-button__content">
                            <span class="social-login-button__icon-slot" aria-hidden="true">
                                <span class="social-login-button__apple-glyph"></span>
                            </span>
                            <span class="social-login-button__label">애플 로그인</span>
                            <span class="social-login-button__icon-slot" aria-hidden="true"></span>
                        </span>
                    </button>
                    <button type="button" data-provider="email" class="login-prompt-login-btn social-login-button social-login-button--email">
                        <span class="social-login-button__content">
                            <span class="social-login-button__icon-slot" aria-hidden="true">
                                <span class="material-symbols-outlined text-[22px]">mail</span>
                            </span>
                            <span class="social-login-button__label">이메일로 로그인</span>
                            <span class="social-login-button__icon-slot" aria-hidden="true"></span>
                        </span>
                    </button>
                    <button type="button" class="close-login-prompt-btn w-full py-3 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl transition-colors">나중에 하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Login prompt button event listeners
        modal.querySelectorAll('.login-prompt-login-btn').forEach((loginBtn) => {
            loginBtn.addEventListener('click', () => {
                const provider = loginBtn.dataset.provider || 'google';
                if (typeof window.handleLoginPromptLogin === 'function') window.handleLoginPromptLogin(provider);
            });
        });

        const cancelBtn = modal.querySelector('.close-login-prompt-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (typeof window.closeLoginPromptModal === 'function') window.closeLoginPromptModal();
            });
        }
    } else {
        const desc = modal.querySelector('#login-prompt-desc');
        if (desc) desc.innerHTML = `${featureName}은 로그인 후 이용하실 수 있습니다.<br>지금 로그인하고 소중한 여행 계획을 저장해보세요!`;
    }

    modal.classList.remove('hidden');
    if (window.pushModalState) window.pushModalState();
    lockBodyScroll();
}

export function closeLoginPromptModal() {
    const modal = document.getElementById('login-prompt-modal');
    if (modal) modal.classList.add('hidden');
    unlockBodyScroll();
}

window.handleLoginPromptLogin = async function (provider = 'google') {
    closeLoginPromptModal();
    if (provider === 'email' && window.Auth?.openEmailAuthModal) {
        window.Auth.openEmailAuthModal('signin', window.travelData);
        return;
    }

    if (window.Auth && window.Auth.login) {
        // 현재 travelData를 넘겨주어 로그인 후 자동 저장되게 함
        await window.Auth.login(provider, window.travelData);
    }
};

window.openLoginPromptModal = openLoginPromptModal;
window.closeLoginPromptModal = closeLoginPromptModal;
window.openConfirmationModal = openConfirmationModal;
window.closeConfirmationModal = closeConfirmationModal;

export default {
    lockBodyScroll,
    unlockBodyScroll,
    showLoading,
    hideLoading,
    openAddModal,
};

// [Fix] Expose to window for inline HTML handlers
window.lockBodyScroll = lockBodyScroll;
window.unlockBodyScroll = unlockBodyScroll;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
