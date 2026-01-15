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
        modal.className = 'fixed inset-0 z-[300] bg-black/90 hidden flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-300 opacity-0';
        modal.onclick = (e) => {
            if (e.target === modal || e.target.closest('.close-btn')) closeLightbox();
        };
        modal.innerHTML = `
            <div class="relative w-full h-full flex items-center justify-center">
                <!-- Close Button -->
                <button class="close-btn absolute top-4 left-4 z-[310] text-white/80 hover:text-white transition-colors p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm">
                    <span class="material-symbols-outlined text-3xl">close</span>
                </button>

                <!-- Menu Button -->
                <div class="absolute top-4 right-4 z-[310]">
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
                <button onclick="event.stopPropagation(); navigateLightbox(-1)" class="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-[305] text-white/90 hover:text-white p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm transition-all">
                    <span class="material-symbols-outlined text-3xl md:text-5xl">chevron_left</span>
                </button>
                <button onclick="event.stopPropagation(); navigateLightbox(1)" class="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-[305] text-white/90 hover:text-white p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm transition-all">
                    <span class="material-symbols-outlined text-3xl md:text-5xl">chevron_right</span>
                </button>

                <!-- Image Container -->
                <div class="relative max-w-full max-h-full flex flex-col items-center justify-center p-4" 
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
                        item.memories.forEach((mem, mIdx) => {
                            lightboxMemories.push({
                                ...mem,
                                dayIndex: dIdx,
                                itemIndex: iIdx,
                                memoryIndex: mIdx,
                                placeTitle: item.title,
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
    
    // Keyboard navigation
    document.addEventListener('keydown', handleLightboxKeydown);
    
    lockBodyScroll();
}

function updateLightboxImage() {
    const mem = lightboxMemories[currentLightboxIndex];
    if (!mem) return;

    const img = document.getElementById('lightbox-image');
    const caption = document.getElementById('lightbox-caption');
    const comment = document.getElementById('lightbox-comment');
    const meta = document.getElementById('lightbox-meta');
    const menu = document.getElementById('lightbox-menu');

    // Reset menu
    if (menu) menu.classList.add('hidden');

    // Update Image
    img.src = mem.photoUrl;
    img.classList.remove('scale-95');
    img.classList.add('scale-100');

    // Update Caption
    if (mem.comment || mem.placeTitle) {
        caption.classList.remove('hidden');
        comment.textContent = mem.comment || '';
        meta.textContent = `${mem.date} • ${mem.placeTitle}`;
    } else {
        caption.classList.add('hidden');
    }
}

window.navigateLightbox = function(direction) {
    const newIndex = currentLightboxIndex + direction;
    if (newIndex >= 0 && newIndex < lightboxMemories.length) {
        currentLightboxIndex = newIndex;
        updateLightboxImage();
    }
};

window.toggleLightboxMenu = function() {
    const menu = document.getElementById('lightbox-menu');
    if (menu) menu.classList.toggle('hidden');
};

window.deleteCurrentLightboxMemory = function() {
    const mem = lightboxMemories[currentLightboxIndex];
    if (!mem) return;

    if (confirm("이 추억을 삭제하시겠습니까?")) {
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

window.handleLightboxTouchStart = function(e) {
    lightboxTouchStartX = e.changedTouches[0].screenX;
};

window.handleLightboxTouchEnd = function(e) {
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
    openLightbox,
    closeLightbox
};
