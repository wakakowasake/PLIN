import { travelData, setInsertingItemIndex, setTargetDayIndex, setViewingItemIndex, insertingItemIndex, targetDayIndex, viewingItemIndex } from '../state.js';
import { Z_INDEX } from './constants.js';

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
    if (el) {
        el.classList.remove('hidden');
        if (window.pushModalState) window.pushModalState();
    }
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
    delete newItem.memories;      // 추억 사진/코멘트
    delete newItem.expenses;      // 지출 내역 (배열)
    delete newItem.budget;        // 예산/지출 금액
    delete newItem.attachments;   // 첨부파일 (티켓 등)

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
    // 모달을 닫으면 insertingItemIndex가 null로 초기화되므로 미리 저장
    const currentIndex = insertingItemIndex;
    const currentDay = targetDayIndex;

    closeAddModal();

    // 상태 의존적인 함수들을 위해 값 복구 (필요한 경우)
    setInsertingItemIndex(currentIndex);

    if (type === 'place' || type === 'activity') {
        if (window.addTimelineItem) window.addTimelineItem(currentIndex, currentDay);
    } else if (type === 'memo' || type === 'note') {
        if (window.addNoteItem) window.addNoteItem(currentIndex);
    } else if (type === 'fastest') {
        if (window.addFastestTransitItem) window.addFastestTransitItem();
    } else if (type === 'copy') {
        if (window.openCopyItemModal) window.openCopyItemModal();
    } else if (type === 'transit') {
        // Transit types: airplane, train, bus, car, walk
        if (window.addTransitItem) window.addTransitItem(currentIndex, subtype, currentDay);
    } else {
        // Fallback (기존 호환성)
        if (window.addTransitItem) window.addTransitItem(currentIndex, type, currentDay);
    }
}

// [General Delete Modal Logic]
let pendingGeneralDeleteIndex = null;
let pendingGeneralDeleteDayIndex = null;

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
                    <button type="button" onclick="closeGeneralDeleteModal()" class="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl transition-colors">취소</button>
                    <button type="button" onclick="confirmGeneralDelete()" class="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 shadow-lg transition-colors">삭제</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

export function openGeneralDeleteModal(index, dayIndex) {
    ensureGeneralDeleteModal();
    pendingGeneralDeleteIndex = index;
    pendingGeneralDeleteDayIndex = dayIndex;
    document.getElementById('general-delete-modal').classList.remove('hidden');
    if (window.pushModalState) window.pushModalState();
    lockBodyScroll();
}

export function closeGeneralDeleteModal() {
    const modal = document.getElementById('general-delete-modal');
    if (modal) modal.classList.add('hidden');
    pendingGeneralDeleteIndex = null;
    pendingGeneralDeleteDayIndex = null;
    unlockBodyScroll();
}

export function confirmGeneralDelete() {
    if (pendingGeneralDeleteIndex === null) return;

    const dayIndex = pendingGeneralDeleteDayIndex;
    const itemIndex = pendingGeneralDeleteIndex;
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

// [Enhanced] Lightbox Logic
let lightboxMemories = [];
let currentLightboxIndex = 0;
let lightboxTouchStartX = 0;
let lightboxTouchEndX = 0;

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
                    <button onclick="event.stopPropagation(); toggleLightboxMenu()" class="text-white/80 hover:text-white transition-colors p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm">
                        <span class="material-symbols-outlined text-3xl">more_vert</span>
                    </button>
                    <!-- Dropdown Menu -->
                    <div id="lightbox-menu" class="hidden absolute right-0 mt-2 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-xl py-1 overflow-hidden">
                        <button onclick="event.stopPropagation(); deleteCurrentLightboxMemory()" class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                            <span class="material-symbols-outlined text-lg">delete</span> 삭제
                        </button>
                    </div>
                </div>

                <!-- Navigation Buttons -->
                <button onclick="event.stopPropagation(); navigateLightbox(-1)" class="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-[${Z_INDEX.MODAL_INNER + 5}] text-white/90 hover:text-white p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm transition-all">
                    <span class="material-symbols-outlined text-3xl md:text-5xl">chevron_left</span>
                </button>
                <button onclick="event.stopPropagation(); navigateLightbox(1)" class="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-[${Z_INDEX.MODAL_INNER + 5}] text-white/90 hover:text-white p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm transition-all">
                    <span class="material-symbols-outlined text-3xl md:text-5xl">chevron_right</span>
                </button>

                <!-- Image Container -->
                <div class="relative max-w-full max-h-full flex flex-col items-center justify-center p-4" 
                     style="touch-action: none;"
                     ontouchstart="handleLightboxTouchStart(event)" 
                     ontouchend="handleLightboxTouchEnd(event)">
                    <img id="lightbox-image" src="" alt="Memory" class="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl transform transition-transform duration-300 scale-95">
                    
                    <!-- Caption -->
                    <div id="lightbox-caption" class="mt-4 text-white text-center max-w-2xl bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl hidden">
                        <p id="lightbox-comment" class="text-sm md:text-base font-medium"></p>
                        <p id="lightbox-meta" class="text-xs text-white/70 mt-1"></p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // 1. Collect all memories
    lightboxMemories = [];
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
                            lightboxMemories.push({
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

    // 2. Find start index
    currentLightboxIndex = lightboxMemories.findIndex(m =>
        m.dayIndex === dayIndex && m.itemIndex === itemIndex && m.memoryIndex === memoryIndex
    );

    if (currentLightboxIndex === -1 && lightboxMemories.length > 0) currentLightboxIndex = 0;
    if (currentLightboxIndex === -1) return; // No memories

    updateLightboxImage();

    modal.classList.remove('hidden');
    void modal.offsetWidth;
    modal.classList.remove('opacity-0');
    if (window.pushModalState) window.pushModalState();

    // Keyboard navigation
    document.addEventListener('keydown', handleLightboxKeydown);

    lockBodyScroll();
}

function updateLightboxImage(direction = 0) {
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
        // 사진 없는 경우 (코멘트만)
        img.src = "";
        img.classList.add('hidden');
    }

    // Update Caption
    if (mem.comment || mem.placeTitle) {
        caption.classList.remove('hidden');
        comment.textContent = mem.comment || '';
        meta.textContent = `${mem.date} • ${mem.placeTitle}`;
    } else {
        caption.classList.add('hidden');
    }
}

window.navigateLightbox = function (direction) {
    const newIndex = currentLightboxIndex + direction;
    if (newIndex >= 0 && newIndex < lightboxMemories.length) {
        currentLightboxIndex = newIndex;
        updateLightboxImage(direction);
    }
};

window.toggleLightboxMenu = function () {
    const menu = document.getElementById('lightbox-menu');
    if (menu) menu.classList.toggle('hidden');
};

window.deleteCurrentLightboxMemory = function () {
    const mem = lightboxMemories[currentLightboxIndex];
    if (!mem) return;

    if (confirm("이 소중한 추억을 정말 삭제하시겠습니까? 📸")) {
        // Remove from data
        const item = travelData.days[mem.dayIndex].timeline[mem.itemIndex];
        if (item && item.memories) {
            item.memories.splice(mem.memoryIndex, 1);

            // Remove from lightbox list
            lightboxMemories.splice(currentLightboxIndex, 1);

            // Save & Render
            if (window.autoSave) window.autoSave();
            if (window.renderItinerary) window.renderItinerary();

            // Update Lightbox View
            if (lightboxMemories.length === 0) {
                closeLightbox();
            } else {
                if (currentLightboxIndex >= lightboxMemories.length) {
                    currentLightboxIndex = lightboxMemories.length - 1;
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
    lightboxTouchStartX = e.changedTouches[0].screenX;
};

window.handleLightboxTouchEnd = function (e) {
    lightboxTouchEndX = e.changedTouches[0].screenX;
    handleSwipe();
};

function handleSwipe() {
    const threshold = 50;
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
        modal.className = 'hidden fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';
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
                        <label class="block text-sm font-bold text-text-muted dark:text-gray-400 mb-3 uppercase tracking-wider">사진 (선택사항)</label>
                        <div id="memory-photo-preview" class="w-full h-32 bg-gray-100 dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors mb-3 overflow-hidden relative">
                            <div id="memory-photo-placeholder" class="text-center">
                                <span class="material-symbols-outlined text-4xl text-gray-400 block mb-2">image</span>
                                <p class="text-sm text-gray-500">사진을 클릭하여 업로드</p>
                            </div>
                            <img id="memory-photo-img" src="" alt="Preview" class="hidden w-full h-full object-cover">
                            <button type="button" id="memory-photo-clear" onclick="clearMemoryPhoto()" class="hidden absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600">
                                <span class="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                        <input id="memory-photo-input" type="file" accept="image/*" multiple onchange="handleMemoryPhotoChange(event)" class="hidden">
                    </div>
                    <div>
                        <label for="memory-comment" class="block text-sm font-bold text-text-muted dark:text-gray-400 mb-2 uppercase tracking-wider">코멘트</label>
                        <textarea id="memory-comment" class="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 bg-white dark:bg-gray-800 text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none" placeholder="이 순간의 느낌을 남겨보세요..." rows="4"></textarea>
                    </div>
                </div>
                <div class="p-6 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button type="button" onclick="closeMemoryModal()" class="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 py-3 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">취소</button>
                    <button type="button" onclick="saveMemoryItem()" class="flex-1 bg-primary text-white py-3 rounded-xl font-bold hover:bg-orange-500 transition-colors flex items-center justify-center gap-2">
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

        modal.style.zIndex = Z_INDEX.MODAL_INPUT;
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
        modal.className = 'hidden fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';
        // 배경 클릭 시 닫기
        modal.onclick = (e) => {
            if (e.target === modal) closeMemoModal();
        };
        modal.innerHTML = `
            <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/30 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 p-6 relative" 
                onclick="event.stopPropagation()">
                <button type="button" onclick="Modals.closeMemoModal()" class="absolute top-4 right-4 text-yellow-700 dark:text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 p-1 rounded-full transition-colors">
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
                    <button type="button" onclick="Modals.editCurrentMemo()" class="text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">edit</span> 수정
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
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
    modal.style.zIndex = Z_INDEX.MODAL_VIEW;

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
        modal.className = 'hidden fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';
        modal.style.zIndex = Z_INDEX.MODAL_INPUT;
        modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 modal-slide-in">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700">
                    <h3 class="text-lg font-bold text-text-main dark:text-white">지출 내역 추가</h3>
                </div>
                <div class="p-6 flex flex-col gap-4">
                    <div id="expense-location-container" class="hidden">
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">사용 장소</label>
                        <select id="expense-location-select" class="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer focus:ring-2 focus:ring-primary/50 outline-none">
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">사용 내역</label>
                        <div class="flex gap-2">
                            <input id="expense-desc" type="text" class="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800" placeholder="예: 입장료, 점심 식사">
                            <button type="button" onclick="openShoppingListSelector()" class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" title="쇼핑 리스트에서 선택">
                                <span class="material-symbols-outlined text-gray-600 dark:text-gray-300">shopping_bag</span>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 uppercase mb-1">금액 (원)</label>
                        <div class="relative">
                            <span class="absolute left-3 top-2.5 text-gray-400 font-bold">₩</span>
                            <input id="expense-cost" type="text" inputmode="numeric" class="w-full pl-8 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-800 font-bold" placeholder="0">
                        </div>
                    </div>
                </div>
                <div class="p-5 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button type="button" onclick="closeExpenseModal()" class="flex-1 py-2 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl">취소</button>
                    <button type="button" id="expense-save-btn" onclick="saveExpense()" class="flex-1 py-2 bg-primary text-white font-bold rounded-xl hover:bg-orange-500 shadow-lg">추가</button>
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
    }
}

export function openExpenseModal(dayIdx = null, fromDetail = false) {
    if (dayIdx !== null) setTargetDayIndex(dayIdx);
    ensureExpenseModal();
    window.isAddingFromDetail = !!fromDetail; // [Fix] Force boolean

    const modal = document.getElementById('expense-modal');
    // [Fix] Force highest z-index (Max Int) and move to end of body
    modal.style.zIndex = Z_INDEX.MODAL_INPUT;
    document.body.appendChild(modal);

    // [Fix] Reset Save Button to default behavior (generic expense)
    const saveBtn = document.getElementById('expense-save-btn');
    if (saveBtn) {
        // [Fix] Directly assign function handler to avoid scope issues
        // saveExpense is available in this module scope
        saveBtn.onclick = saveExpense;
        saveBtn.removeAttribute('onclick'); // Clean up HTML attribute to prevent confusion
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

    const selectedLocationIndex = document.getElementById('expense-location-select').value;
    const isGeneral = window.isAddingFromDetail && selectedLocationIndex === "-1";

    let targetItem;
    const dayIndex = (typeof targetDayIndex === 'number' && travelData.days[targetDayIndex]) ? targetDayIndex : 0;
    const currentDay = travelData.days[dayIndex];

    if (!currentDay) {
        showToast("일정 데이터를 찾을 수 없습니다.", 'error');
        return;
    }

    if (window.isAddingFromDetail && selectedLocationIndex !== "-1") {
        targetItem = currentDay.timeline[parseInt(selectedLocationIndex)];
    } else {
        // Fallback to viewingItemIndex (from Detail Modal context)
        const vIndex = (typeof viewingItemIndex === 'number' && currentDay.timeline[viewingItemIndex]) ? viewingItemIndex : 0;
        targetItem = currentDay.timeline[vIndex];
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
    if (!document.getElementById('shopping-selector-modal')) {
        const modal = document.createElement('div');
        modal.id = 'shopping-selector-modal';
        modal.className = `hidden fixed inset-0 z-[${Z_INDEX.MODAL_CONFIRM}] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`;
        modal.innerHTML = `
            <div class="bg-white dark:bg-card-dark rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div class="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-text-main dark:text-white">쇼핑 리스트에서 선택</h3>
                    <button type="button" onclick="closeShoppingListSelector()" class="text-gray-400 hover:text-gray-600">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div id="shopping-selector-list" class="p-4 max-h-96 overflow-y-auto"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }
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
                <button type="button" onclick="selectShoppingItem(${item.originalIndex})" 
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
                    <button type="button" onclick="closeConfirmationModal()" class="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 rounded-2xl transition-colors">취소</button>
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

    newBtn.onclick = () => {
        closeConfirmationModal();
        if (onConfirm) onConfirm();
    };

    modal.classList.remove('hidden');
    lockBodyScroll();
}

export function closeConfirmationModal() {
    const modal = document.getElementById('global-confirmation-modal');
    if (modal) modal.classList.add('hidden');
    unlockBodyScroll();
}

window.openConfirmationModal = openConfirmationModal;
window.closeConfirmationModal = closeConfirmationModal;

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
    selectAddType,
    ensureMemoryModal,
    openMemoModal,
    closeMemoModal,
    editCurrentMemo,
    saveCurrentMemo,
    openLightbox,
    closeLightbox,
    ensureExpenseModal,
    openExpenseModal,
    closeExpenseModal,
    saveExpense,
    ensureShoppingSelectorModal,
    openShoppingListSelector,
    closeShoppingListSelector,
    selectShoppingItem,
    openConfirmationModal,
    closeConfirmationModal
};
