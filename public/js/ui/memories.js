import { 
    travelData, targetDayIndex, setTargetDayIndex, 
    viewingItemIndex, setViewingItemIndex, currentTripId 
} from '../state.js';
import { showLoading, hideLoading } from './modals.js';
import { BACKEND_URL } from '../config.js';

// 순환 참조 방지를 위해 window 객체 함수 사용
const autoSave = (immediate = false) => {
    if (window.autoSave) return window.autoSave(immediate);
    console.error("Critical: window.autoSave is missing. Data not saved to server.");
};
const renderItinerary = () => window.renderItinerary && window.renderItinerary();

// [Helper] 이미지 압축 함수
async function compressImage(file, maxWidth = 1280, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Returns data URL (Base64)
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

export function getTripStatus(data) {
    if (!data || !data.days || data.days.length === 0) return 'planning';
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const lastDayStr = data.days[data.days.length - 1].date;
    if (!lastDayStr) return 'planning';

    const lastDay = new Date(lastDayStr);
    lastDay.setHours(0,0,0,0);
    
    if (today > lastDay) return 'completed';
    return 'planning';
}

export function addMemoryItem(index, dayIndex) {
    setViewingItemIndex(index);
    setTargetDayIndex(dayIndex);
    
    const modal = document.getElementById('memory-modal');
    if (modal) {
        const imgPreview = document.getElementById('memory-photo-img');
        const input = document.getElementById('memory-photo-input');
        const comment = document.getElementById('memory-comment');
        const placeholder = document.getElementById('memory-photo-placeholder');
        const clearBtn = document.getElementById('memory-photo-clear');
        
        if (imgPreview) {
            imgPreview.src = "";
            imgPreview.classList.add('hidden');
        }
        if (placeholder) placeholder.classList.remove('hidden');
        if (clearBtn) clearBtn.classList.add('hidden');
        if (input) input.value = "";
        if (comment) comment.value = "";
        
        modal.classList.remove('hidden');
    }
}

export function closeMemoryModal() {
    const modal = document.getElementById('memory-modal');
    if (modal) modal.classList.add('hidden');
    setViewingItemIndex(null);
}

export function handleMemoryPhotoChange(arg) {
    // 이벤트 객체(e)가 넘어오면 e.target을, 요소 자체가 넘어오면 요소를 사용
    const input = arg.target ? arg.target : arg;

    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgPreview = document.getElementById('memory-photo-img');
            const placeholder = document.getElementById('memory-photo-placeholder');
            const clearBtn = document.getElementById('memory-photo-clear');

            if (imgPreview) {
                imgPreview.src = e.target.result;
                imgPreview.classList.remove('hidden');
            }
            if (placeholder) placeholder.classList.add('hidden');
            if (clearBtn) clearBtn.classList.remove('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

export function clearMemoryPhoto() {
    const input = document.getElementById('memory-photo-input');
    const imgPreview = document.getElementById('memory-photo-img');
    const placeholder = document.getElementById('memory-photo-placeholder');
    const clearBtn = document.getElementById('memory-photo-clear');

    if (input) input.value = "";
    if (imgPreview) {
        imgPreview.src = "";
        imgPreview.classList.add('hidden');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (clearBtn) clearBtn.classList.add('hidden');
}

export async function saveMemoryItem() {
    const input = document.getElementById('memory-photo-input');
    const commentEl = document.getElementById('memory-comment');
    const comment = commentEl ? commentEl.value : "";
    
    // 사진도 없고 코멘트도 없으면 경고
    if ((!input || !input.files || !input.files[0]) && !comment) {
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
        
        let photoUrl = null;
        if (input && input.files && input.files[0]) {
            const file = input.files[0];
            const timestamp = Date.now();
            const fileName = `memory_${targetDayIndex}_${viewingItemIndex}_${timestamp}.jpg`;
            
            let base64Data;
            try {
                // 이미지 압축 시도
                base64Data = await compressImage(file);
            } catch (err) {
                console.warn("Image compression failed, using original file:", err);
                // 압축 실패 시 원본 파일 사용
                base64Data = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(file);
                });
            }

            // [Safety Check] Cloud Functions (Gen 1) 10MB 제한 체크
            // Base64 문자열 길이가 약 10,485,760 (10MB)를 넘으면 서버 도달 전 차단됨
            if (base64Data.length > 10 * 1024 * 1024) {
                throw new Error("이미지 용량이 너무 큽니다 (10MB 제한). 더 작은 사진을 선택해주세요.");
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
                // 서버 에러 메시지 확인
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Upload failed');
            }
            const result = await response.json();
            photoUrl = result.url;
        }
        
        const day = travelData.days[targetDayIndex];
        const item = day ? day.timeline[viewingItemIndex] : null;
        
        if (!item) throw new Error("Timeline item not found.");
        if (!item.memories) item.memories = [];
        
        item.memories.push({
            photoUrl: photoUrl,
            comment: comment,
            createdAt: new Date().toISOString()
        });
        
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
    if (confirm("이 추억을 삭제하시겠습니까?")) {
        const item = travelData.days[dayIndex].timeline[itemIndex];
        if (item && item.memories) {
            item.memories.splice(memoryIndex, 1);
            autoSave(true);
            renderItinerary();
        }
    }
}

export function toggleMemoryLock() {
    travelData.meta.memoryLocked = !travelData.meta.memoryLocked;
    autoSave(true);
    renderItinerary();
}
