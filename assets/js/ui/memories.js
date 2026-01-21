import {
    travelData, targetDayIndex, setTargetDayIndex,
    viewingItemIndex, setViewingItemIndex, currentTripId
} from '../state.js';
import { showLoading, hideLoading, ensureMemoryModal } from './modals.js';
import { BACKEND_URL } from '../config.js';

// 순환 참조 방지를 위해 window 객체 함수 사용
const autoSave = (immediate = false) => {
    if (window.autoSave) return window.autoSave(immediate);
    console.error("Critical: window.autoSave is missing. Data not saved to server.");
};
const renderItinerary = () => window.renderItinerary && window.renderItinerary();

// [Helper] 이미지 압축 함수
async function compressImage(file, maxWidth = 1024, quality = 0.7) {
    let objectUrl = null;
    let sourceFile = file;

    try {
        // [HEIC Conversion] 아이폰 HEIC 포맷을 JPG로 변환
        if ((file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) && window.heic2any) {
            try {
                const convertedBlob = await window.heic2any({
                    blob: file,
                    toType: "image/jpeg",
                    quality: 0.8
                });
                sourceFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
            } catch (e) {
                console.warn("HEIC conversion failed, trying original:", e);
            }
        }

        // [Stable Fix] 모바일 호환성을 위해 createImageBitmap 대신 표준 Image 객체 사용
        objectUrl = URL.createObjectURL(sourceFile);
        const imageSource = await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(new Error("이미지 로드 실패 (Image load error)"));
            img.src = objectUrl;
        });

        const canvas = document.createElement('canvas');
        let width = imageSource.width;
        let height = imageSource.height;

        if (width > maxWidth) {
            const ratio = maxWidth / width;
            width = maxWidth;
            height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // [Fix] 투명 배경(PNG)이 검은색으로 나오는 문제 해결을 위해 흰색 배경 채우기
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(imageSource, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);

        // [Safety Check] 데이터가 너무 작으면(빈 이미지/손상) 에러 처리
        if (dataUrl.length < 1000) throw new Error("압축 결과가 비정상적입니다 (Canvas Error).");
        return dataUrl;

    } finally {
        // 메모리 해제 (중요)
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

export function getTripStatus(data) {
    if (!data || !data.days || data.days.length === 0) return 'planning';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDayStr = data.days[data.days.length - 1].date;
    if (!lastDayStr) return 'planning';

    const lastDay = new Date(lastDayStr);
    lastDay.setHours(0, 0, 0, 0);

    if (today > lastDay) return 'completed';
    return 'planning';
}

export function addMemoryItem(index, dayIndex) {
    setViewingItemIndex(index);
    setTargetDayIndex(dayIndex);

    ensureMemoryModal(); // [Added] 모달 DOM이 없으면 생성
    const modal = document.getElementById('memory-modal');
    if (modal) {
        // [Fix] 모달 내부에서 요소를 찾아 엉뚱한 요소를 조작하는 문제 방지
        const imgPreview = modal.querySelector('#memory-photo-img');
        const input = modal.querySelector('#memory-photo-input');
        const comment = modal.querySelector('#memory-comment');
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
        if (comment) comment.value = "";

        // [Enhanced] 다중 이미지 미리보기 그리드 제거
        if (previewContainer) {
            const existingGrid = previewContainer.querySelector('.preview-grid');
            if (existingGrid) existingGrid.remove();
        }

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
    const modal = document.getElementById('memory-modal');
    if (!modal) return;

    const input = modal.querySelector('#memory-photo-input');
    const commentEl = modal.querySelector('#memory-comment');
    const comment = commentEl ? commentEl.value : "";

    // 사진도 없고 코멘트도 없으면 경고
    if ((!input || !input.files || input.files.length === 0) && !comment) {
        alert("사진이나 코멘트 중 하나는 입력해야 합니다.");
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
        const uploadedUrls = [];

        if (files && files.length > 0) {
            // [Performance] 디바이스별 최적화 설정
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            const optimalMaxWidth = isMobile ? 800 : 1024;
            const optimalQuality = isMobile ? 0.65 : 0.7;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const timestamp = Date.now();
                const fileName = `memory_${targetDayIndex}_${viewingItemIndex}_${timestamp}_${i}.jpg`;

                let base64Data;
                try {
                    // 1차 시도: 디바이스 최적화된 설정
                    base64Data = await compressImage(file, optimalMaxWidth, optimalQuality);
                } catch (err) {
                    console.warn("1st compression failed:", err);
                    try {
                        // 2차 시도: 600px, 0.6
                        base64Data = await compressImage(file, 600, 0.6);
                    } catch (err2) {
                        console.warn("2nd compression failed:", err2);
                        try {
                            // 3차 시도: 400px, 0.5
                            base64Data = await compressImage(file, 400, 0.5);
                        } catch (err3) {
                            console.warn("All compression attempts failed:", err3);
                            if (file.size > 7 * 1024 * 1024) {
                                throw new Error(`이미지 압축에 실패했습니다. 원본 용량(${Math.round(file.size / 1024 / 1024)}MB)이 너무 커서 업로드할 수 없습니다.`);
                            }
                            base64Data = await new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = (e) => resolve(e.target.result);
                                reader.onerror = (e) => reject(new Error("파일 읽기 실패"));
                                reader.readAsDataURL(file);
                            });
                        }
                    }
                }

                if (base64Data.length > 9.5 * 1024 * 1024) {
                    throw new Error("이미지 용량이 너무 큽니다 (압축 실패). 더 작은 사진을 선택해주세요.");
                }

                const response = await fetch(`${BACKEND_URL}/upload-memory`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        base64Data: base64Data,
                        fileName: fileName,
                        tripId: currentTripId
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || 'Upload failed');
                }
                const result = await response.json();
                uploadedUrls.push(result.url);
            }
        }

        const day = travelData.days[targetDayIndex];
        const item = day ? day.timeline[viewingItemIndex] : null;

        if (!item) throw new Error("Timeline item not found.");
        if (!item.memories) item.memories = [];

        if (uploadedUrls.length > 0) {
            uploadedUrls.forEach((url, idx) => {
                // 코멘트는 첫 번째 사진에만 첨부 (중복 방지)
                const memComment = (idx === 0) ? comment : "";
                item.memories.push({
                    photoUrl: url,
                    comment: memComment,
                    createdAt: new Date().toISOString()
                });
            });
        } else if (comment) {
            item.memories.push({
                photoUrl: null,
                comment: comment,
                createdAt: new Date().toISOString()
            });
        }

        await autoSave(true); // 즉시 저장
        renderItinerary();
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
            }
        }
    );
}
window.deleteMemory = deleteMemory;

export function toggleMemoryLock() {
    travelData.meta.memoryLocked = !travelData.meta.memoryLocked;
    autoSave(true);
    renderItinerary();
}

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
        img.src = mem.photoUrl;
        img.className = 'w-full h-full object-cover transition-transform duration-500 group-hover:scale-110';
        img.alt = mem.comment || '추억 사진';

        img.onclick = (e) => {
            e.stopPropagation();
            if (window.openLightbox) {
                window.openLightbox(itemIndex, dayIndex, memIdx);
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
        deleteBtn.className = 'absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-10';
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
