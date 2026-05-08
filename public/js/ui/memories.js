import {
    travelData, targetDayIndex, setTargetDayIndex,
    viewingItemIndex, setViewingItemIndex, currentTripId, isGuestMode
} from '../state.js';
import { storage } from '../firebase.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';
import { showLoading, hideLoading, ensureMemoryModal } from './modals.js';
import { Z_INDEX } from './constants.js';
import { compressImage, normalizeGooglePhotoUrl } from '../ui-utils.js';
import {
    appendMemoriesToItem,
    getTripStatus,
    hasMemoryContent,
    readMemoryComment
} from '../features/memories/memory-helpers.js';
import { uploadMemoryFiles } from '../features/memories/memory-upload-flow.js';

// 순환 참조 방지를 위해 window 객체 함수 사용
const autoSave = (immediate = false) => {
    if (window.autoSave) return window.autoSave(immediate);
    console.error("Critical: window.autoSave is missing. Data not saved to server.");
};
const renderItinerary = () => window.renderItinerary && window.renderItinerary();

export { getTripStatus };

export function addMemoryItem(index, dayIndex) {
    setViewingItemIndex(index);
    setTargetDayIndex(dayIndex);

    ensureMemoryModal(); // [Added] 모달 DOM이 없으면 생성
    const modal = document.getElementById('memory-modal');
    if (modal) {
        // [Fix] 모달 내부에서 요소를 찾아 엉뚱한 요소를 조작하는 문제 방지
        const imgPreview = modal.querySelector('#memory-photo-img');
        const input = modal.querySelector('#memory-photo-input');
        const placeholder = modal.querySelector('#memory-photo-placeholder');
        const clearBtn = modal.querySelector('#memory-photo-clear');
        const previewContainer = modal.querySelector('#memory-photo-preview');

        // [Enhanced] 단일 이미지 미리보기 초기화
        if (imgPreview) {
            imgPreview.src = "";
            imgPreview.classList.add('hidden');
        }
        if (placeholder) placeholder.classList.remove('hidden');
        if (clearBtn) clearBtn.classList.add('hidden');
        if (input) input.value = "";

        // [Enhanced] 다중 이미지 미리보기 그리드 제거
        if (previewContainer) {
            const existingGrid = previewContainer.querySelector('.preview-grid');
            if (existingGrid) existingGrid.remove();
        }

        // [Fix] Ensure it's at the end of body and has clear hierarchy
        document.body.appendChild(modal);
        modal.classList.add('modal-z-input');
        modal.classList.remove('hidden');
    }
}

export function closeMemoryModal() {
    const modal = document.getElementById('memory-modal');
    if (modal) modal.classList.add('hidden');
    setViewingItemIndex(null);
}

export async function handleMemoryPhotoChange(arg) {
    // 이벤트 객체(e)가 넘어오면 e.target을, 요소 자체가 넘어오면 요소를 사용
    const input = arg.target ? arg.target : arg;

    const modal = document.getElementById('memory-modal');
    const previewContainer = modal.querySelector('#memory-photo-preview');
    const placeholder = modal.querySelector('#memory-photo-placeholder');
    const singleImg = modal.querySelector('#memory-photo-img');
    const clearBtn = modal.querySelector('#memory-photo-clear');

    // Reset UI
    if (placeholder) placeholder.classList.add('hidden');
    if (singleImg) singleImg.classList.add('hidden');
    if (clearBtn) clearBtn.classList.remove('hidden');

    // Remove existing grid if any
    const existingGrid = previewContainer.querySelector('.preview-grid');
    if (existingGrid) existingGrid.remove();

    if (input.files && input.files.length > 0) {
        if (input.files.length === 1) {
            // Single image logic
            let file = input.files[0];
            // [HEIC Preview]
            if ((file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) && window.heic2any) {
                try {
                    const convertedBlob = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.5 });
                    file = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                } catch (e) { console.warn("HEIC preview conversion failed:", e); }
            }

            const reader = new FileReader();
            reader.onload = function (e) {
                if (singleImg) {
                    singleImg.src = e.target.result;
                    singleImg.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        } else {
            // Multiple images - Grid view
            const grid = document.createElement('div');
            grid.className = 'preview-grid w-full h-full overflow-x-auto flex gap-2 p-2 items-center';
            Array.from(input.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.className = 'h-full w-auto object-cover rounded-lg shadow-sm flex-shrink-0 aspect-square';
                    grid.appendChild(img);
                };
                reader.readAsDataURL(file);
            });
            previewContainer.appendChild(grid);
        }
    } else {
        if (placeholder) placeholder.classList.remove('hidden');
        if (clearBtn) clearBtn.classList.add('hidden');
    }
}

export function clearMemoryPhoto() {
    const modal = document.getElementById('memory-modal');
    const input = modal.querySelector('#memory-photo-input');
    const imgPreview = modal.querySelector('#memory-photo-img');
    const placeholder = modal.querySelector('#memory-photo-placeholder');
    const clearBtn = modal.querySelector('#memory-photo-clear');
    const previewContainer = modal.querySelector('#memory-photo-preview');

    if (input) input.value = "";
    if (imgPreview) {
        imgPreview.src = "";
        imgPreview.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');

    const existingGrid = previewContainer.querySelector('.preview-grid');
    if (existingGrid) existingGrid.remove();
}

export async function saveMemoryItem() {
    if (isGuestMode) {
        if (window.openLoginPromptModal) {
            window.openLoginPromptModal("추억 저장");
        } else {
            alert("추억 저장 기능은 로그인 후 이용하실 수 있습니다. ✨");
        }
        return;
    }
    const modal = document.getElementById('memory-modal');
    if (!modal) return;

    const input = modal.querySelector('#memory-photo-input');

    if (!hasMemoryContent(input?.files)) {
        alert("사진을 한 장 이상 선택해 주세요.");
        return;
    }

    if (targetDayIndex === null || viewingItemIndex === null) {
        console.error("Cannot save memory: Item index is missing.");
        closeMemoryModal();
        return;
    }

    if (!currentTripId) {
        alert("여행 ID를 찾을 수 없습니다. 페이지를 새로고침 해주세요.");
        return;
    }

    try {
        showLoading();

        const files = input.files;
        const uploadedUrls = await uploadMemoryFiles({
            files,
            tripId: currentTripId,
            dayIndex: targetDayIndex,
            itemIndex: viewingItemIndex,
            compressImage,
            storage,
            ref,
            uploadBytes,
            getDownloadURL,
            userAgent: navigator.userAgent
        });

        const day = travelData.days[targetDayIndex];
        const item = day ? day.timeline[viewingItemIndex] : null;

        if (!item) throw new Error("Timeline item not found.");
        appendMemoriesToItem(item, uploadedUrls, '', new Date().toISOString());

        await autoSave(true); // 즉시 저장
        renderItinerary();

        // [Fix] 상세 모달이 열려있는 경우 추억 리스트 실시간 갱신
        const detailMemList = document.getElementById('detail-memories-list');
        const routeDetailMemList = document.getElementById('route-detail-memories-list');

        if (detailMemList) {
            renderMemoriesList('detail-memories-list', item, viewingItemIndex, targetDayIndex);
        }
        if (routeDetailMemList) {
            renderMemoriesList('route-detail-memories-list', item, viewingItemIndex, targetDayIndex);
        }

        closeMemoryModal();
    } catch (e) {
        console.error("Error saving memory:", e);
        alert("추억 저장 실패: " + e.message);
    } finally {
        hideLoading();
    }
}

export function deleteMemory(itemIndex, dayIndex, memoryIndex) {
    window.openConfirmationModal(
        "추억 삭제",
        "이 추억을 정말로 삭제하시겠습니까?",
        () => {
            const item = travelData.days[dayIndex].timeline[itemIndex];
            if (item && item.memories) {
                item.memories.splice(memoryIndex, 1);
                autoSave(true);
                renderItinerary();

                // [Fix] 상세 모달이 열려있는 경우 추억 리스트 실시간 갱신
                const detailMemList = document.getElementById('detail-memories-list');
                const routeDetailMemList = document.getElementById('route-detail-memories-list');

                if (detailMemList) {
                    renderMemoriesList('detail-memories-list', item, itemIndex, dayIndex);
                }
                if (routeDetailMemList) {
                    renderMemoriesList('route-detail-memories-list', item, itemIndex, dayIndex);
                }
            }
        }
    );
}
window.deleteMemory = deleteMemory;

// [Deprecated] Replaced by toggleGlobalEditMode in ui.js
// export function toggleMemoryLock() {
//     travelData.meta.memoryLocked = !travelData.meta.memoryLocked;
//     autoSave(true);
//     renderItinerary();
// }

/**
 * Render memories list into a specific container
 * @param {string} containerId - DOM ID of the container to render into
 * @param {object} item - Timeline item object
 * @param {number} itemIndex - Index of the item
 * @param {number} dayIndex - Index of the day
 */
export function renderMemoriesList(containerId, item, itemIndex, dayIndex) {
    const listContainer = document.getElementById(containerId);
    if (!listContainer) return;

    const memories = item.memories || [];

    // Parent section (to show/hide title)
    const section = listContainer.parentElement;
    if (section && section.id.includes('section')) {
        section.classList.remove('hidden');

        // [Header Injection] Add "Add (+)" button to header if not present
        const header = section.querySelector('h4');
        const headerContainerId = `${containerId}-header-wrapper`;
        let headerWrapper = section.querySelector(`#${headerContainerId}`);

        if (header && !headerWrapper) {
            // Create wrapper
            headerWrapper = document.createElement('div');
            headerWrapper.id = headerContainerId;
            headerWrapper.className = "flex justify-between items-center mb-3";

            // Move h4 into wrapper
            header.parentNode.insertBefore(headerWrapper, header);
            headerWrapper.appendChild(header);

            // Create Add Button
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = "text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-xl font-bold transition-colors flex items-center gap-1";
            addBtn.innerHTML = '<span class="material-symbols-outlined text-sm">add_a_photo</span> 추가';
            addBtn.onclick = () => addMemoryItem(itemIndex, dayIndex); // Use global function

            headerWrapper.appendChild(addBtn);

            // Remove margin from h4 as wrapper handles it
            header.classList.remove('mb-3');
        } else if (headerWrapper) {
            // Update button onclick just in case index changed
            const btn = headerWrapper.querySelector('button');
            if (btn) btn.onclick = () => addMemoryItem(itemIndex, dayIndex);
        }
    }

    // Clear existing list content
    listContainer.innerHTML = '';

    // [Layout] Horizontal Scroll, Max 1 Row
    listContainer.className = 'grid grid-rows-1 grid-flow-col gap-3 overflow-x-auto py-2 auto-cols-[9rem] scrollbar-hide';

    if (memories.length === 0) {
        listContainer.className = 'flex flex-col gap-2';
        listContainer.innerHTML = '<div class="text-xs text-center text-gray-400 py-2">등록된 추억이 없습니다.</div>';
        return;
    }

    // Render Photos
    memories.forEach((mem, memIdx) => {
        if (!mem.photoUrl) return;

        const photoDiv = document.createElement('div');
        photoDiv.className = 'relative aspect-square w-36 h-36 rounded-xl overflow-hidden group cursor-pointer bg-gray-100 dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 isolate shrink-0';

        const img = document.createElement('img');
        const normalizedPhotoUrl = normalizeGooglePhotoUrl(mem.photoUrl, 800) || mem.photoUrl;
        const visibleComment = readMemoryComment(mem);
        img.loading = 'eager';
        img.decoding = 'async';
        img.fetchPriority = 'auto';
        img.src = normalizedPhotoUrl;
        img.className = 'w-full h-full object-cover transition-transform duration-500 group-hover:scale-110';
        img.alt = visibleComment || '추억 사진';

        img.onerror = () => {
            img.remove();
            const fallback = document.createElement('div');
            fallback.className = 'w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800';
            fallback.innerHTML = '<span class="material-symbols-outlined text-red-400">broken_image</span>';
            photoDiv.appendChild(fallback);
        };

        img.onclick = (e) => {
            e.stopPropagation();
            if (window.openLightbox) {
                window.openLightbox(dayIndex, itemIndex, memIdx);
            } else {
                addMemoryItem(itemIndex, dayIndex);
            }
        };

        // [New] Context Menu for Memory (Right-click delete)
        photoDiv.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation(); // Stop parent context menu
            if (window.openContextMenu) {
                window.openContextMenu(e, 'memory', itemIndex, dayIndex, memIdx);
            }
        };

        const deleteBtn = document.createElement('button');
        // [Fix] Ensure delete button is always visible on top of photo
        // Set higher than MODAL_INNER(50) to be safe within the isolate context
        deleteBtn.className = `absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-100 hover:bg-red-500 z-[${Z_INDEX.MODAL_INNER + 10}]`;
        deleteBtn.innerHTML = '<span class="material-symbols-outlined text-[10px]">close</span>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteMemory(itemIndex, dayIndex, memIdx);
            setTimeout(() => renderMemoriesList(containerId, travelData.days[dayIndex].timeline[itemIndex], itemIndex, dayIndex), 100);
        };

        photoDiv.appendChild(img);
        photoDiv.appendChild(deleteBtn);
        listContainer.appendChild(photoDiv);
    });
}
