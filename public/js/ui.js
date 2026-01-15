// Entry point for UI modules: re-export state and expose functions on window
import { db, auth, provider, firebaseReady } from './firebase.js';
import {
    travelData, currentDayIndex, currentTripId, newTripDataTemp, pendingTransitCallback,
    editingItemIndex, viewingItemIndex, currentTripUnsubscribe, isEditing, currentUser,
    setTravelData, setCurrentDayIndex, setCurrentTripId, setNewTripDataTemp, targetDayIndex, setTargetDayIndex, defaultTravelData,
    setPendingTransitCallback, setEditingItemIndex, setViewingItemIndex,
    setCurrentTripUnsubscribe, setIsEditing, setCurrentUser,
    insertingItemIndex, isEditingFromDetail, setInsertingItemIndex, setIsEditingFromDetail,
    updateMetaState, updateTripDateState, updateTimelineItemState
} from './state.js';

import { parseTimeStr, formatTimeStr, parseDurationStr, formatDuration, minutesTo24Hour, calculateStraightDistance } from './ui-utils.js';
import * as Helpers from './ui/helpers.js';
import { doc, getDoc, updateDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

import * as Modals from './ui/modals.js';
import * as Header from './ui/header.js';
import * as Renderers from './ui/renderers.js';
import * as Auth from './ui/auth.js';
import * as Profile from './ui/profile.js';
import * as Trips from './ui/trips.js';
import * as Memories from './ui/memories.js';
import { fetchWeeklyWeather, fetchHourlyWeatherForDate } from './map.js';
import { BACKEND_URL } from './config.js';


let cachedMapsApiKey = null;
export async function getMapsApiKey() {
    if (cachedMapsApiKey) return cachedMapsApiKey;
    try {
        const response = await fetch(`${BACKEND_URL}/config`);
        const config = await response.json();
        cachedMapsApiKey = config.googleMapsApiKey;
        return cachedMapsApiKey;
    } catch (e) {
        console.error("Failed to fetch Maps API Key", e);
        return "";
    }
}


export async function openTrip(tripId) {
    try {
        Modals.showLoading();
        const docRef = doc(db, "plans", tripId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const fullData = { ...defaultTravelData, ...data, meta: { ...defaultTravelData.meta, ...data.meta } };
            setTravelData(fullData);
            setCurrentTripId(tripId);

            document.getElementById('main-view').classList.add('hidden');
            document.getElementById('detail-view').classList.remove('hidden');
            document.getElementById('back-btn').classList.remove('hidden');

            selectDay(0); // 첫째날로 초기화
        } else {
            console.error("Trip not found:", tripId);
            alert("여행 계획을 찾을 수 없습니다.");
            backToMain();
        }
    } catch (e) {
        console.error("Error opening trip:", e);
        alert("여행 계획을 여는 중 오류가 발생했습니다.");
        backToMain();
    } finally {
        Modals.hideLoading();
    }
}

export function backToMain() {
    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('main-view').classList.remove('hidden');
    document.getElementById('back-btn').classList.add('hidden');
    setCurrentTripId(null);
    // 현재 사용자 정보가 있으면 여행 목록을 다시 로드합니다.
    if (currentUser) {
        loadTripList(currentUser.uid);
    }
}

export const createNewTrip = Trips.createNewTrip;
export const closeNewTripModal = Trips.closeNewTripModal;
export const nextWizardStep = Trips.nextWizardStep;

export const loadTripList = Trips.loadTripList;
export const finishNewTripWizard = Trips.finishNewTripWizard;
export const deleteTrip = Trips.deleteTrip;

export function closeDeleteTripModal() {}
export function confirmDeleteTrip() {}

export function toggleTripMenu(tripId) {
    const menu = document.getElementById(`trip-menu-${tripId}`);
    if (menu) {
        const isHidden = menu.classList.contains('hidden');
        document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));
        if (isHidden) menu.classList.remove('hidden');
    }
}

// [Touch Drag Logic]
let touchLongPressTimer = null;
let longPressTimer = null; // touchEnd에서 사용됨
let isTouchDragging = false;
let touchStartIndex = null;
let draggingIndex = null;

export function touchStart(e, index, type) {
    if (isEditing) return;
    
    // 롱프레스 감지 타이머 시작
    touchLongPressTimer = setTimeout(() => {
        isTouchDragging = true;
        touchStartIndex = index;
        
        // 드래그 시작 시각적 피드백
        const target = e.currentTarget;
        if (target) target.style.opacity = '0.5';
        
        // 햅틱 피드백 (지원 기기)
        if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
}

export function touchMove(e) {
    // 스크롤이 발생하면 롱프레스 취소
    if (touchLongPressTimer) {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
    }
    
    if (isTouchDragging) {
        e.preventDefault(); // 드래그 중 스크롤 방지
        
        // 터치 위치에 따른 드래그 효과 로직 (필요 시 추가 구현)
        // 현재는 touchEnd에서 elementFromPoint로 드롭 처리
    }
}

export function touchEnd(e) {
    clearTimeout(touchLongPressTimer);
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressStartIndex = null;
    }
    
    if (isTouchDragging) {
        isTouchDragging = false;
        e.currentTarget.style.opacity = '1';
        clearDragStyles();

        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetItem = element?.closest('.group\\/timeline-item');
        
        if (targetItem && targetItem.dataset.index) {
            const targetIndex = parseInt(targetItem.dataset.index);
            moveTimelineItem(touchStartIndex, targetIndex, targetDayIndex);
        }
        
        draggingIndex = null;
    }
}

// ==========================================
// [Drag & Drop Logic]
// ==========================================

export function dragStart(e, index, dayIndex) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'single', index: index, dayIndex: dayIndex }));
    e.currentTarget.classList.add('dragging');
    draggingIndex = index; // 드래그 중인 인덱스 저장
}

export function dragEnd(e) {
    // 모든 dragging 클래스 제거
    document.querySelectorAll('.dragging').forEach(el => {
        el.classList.remove('dragging');
    });
    draggingIndex = null;
    clearDragStyles();
}

export function dragOver(e) {
    e.preventDefault(); // 필수: 드롭 허용
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.currentTarget;
    
    // 이미 활성화된 상태면 패스
    const indicator = target.querySelector('.drag-indicator');
    if (indicator && !indicator.classList.contains('hidden')) return;

    // 다른 요소들 스타일 초기화 (하나만 활성화)
    clearDragStyles();

    // 시각적 피드백: 인디케이터 표시
    if (indicator) indicator.classList.remove('hidden');
}

export function dragLeave(e) {
    const target = e.currentTarget;
    // 자식 요소로 들어갈 때는 무시 (relatedTarget이 target 내부에 있으면 리턴)
    if (target.contains(e.relatedTarget)) return;

    const indicator = target.querySelector('.drag-indicator');
    if (indicator) indicator.classList.add('hidden');
}

function clearDragStyles() {
    document.querySelectorAll('.group\\/timeline-item').forEach(el => {
        const indicator = el.querySelector('.drag-indicator');
        if (indicator) indicator.classList.add('hidden');
    });
}

export async function drop(e, targetIndex) {
    e.preventDefault();
    e.stopPropagation();
    clearDragStyles();

    const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    const dropIndex = parseInt(e.currentTarget?.getAttribute('data-drop-index') || targetIndex);
    
    // 드래그한 아이템의 dayIndex 사용 (전달되지 않았으면 targetDayIndex 사용)
    const sourceDayIndex = data.dayIndex !== undefined ? data.dayIndex : targetDayIndex;
    
    if (data.type === 'group' && data.indices && data.indices.length > 0) {
        // 그룹 이동
        moveTransitGroup(data.indices, dropIndex);
    } else if (data.type === 'single' && data.index !== undefined) {
        // 단일 이동
        moveTimelineItem(data.index, dropIndex, sourceDayIndex);
    } else {
        // 호환성 지원 (기존 포맷)
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex)) {
            moveTimelineItem(fromIndex, dropIndex, targetDayIndex);
        }
    }
}

// 타임라인 컨테이너에 드롭 이벤트 추가 (마지막 위치 해결)
export function timelineContainerDrop(e, dayIndex) {
    e.preventDefault();
    e.stopPropagation();
    clearDragStyles();
    
    const data = JSON.parse(e.dataTransfer.getData('text/plain') || '{}');
    const timeline = travelData.days[dayIndex]?.timeline;
    if (!timeline) return;
    
    if (data.type === 'single' && data.index !== undefined) {
        moveTimelineItem(data.index, timeline.length, dayIndex);
    } else {
        // 호환성 지원
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex)) {
            moveTimelineItem(fromIndex, timeline.length, dayIndex);
        }
    }
}

// 순서 변경 공통 로직
export function moveTimelineItem(fromIndex, targetIndex, dayIndex = currentDayIndex) {
    const timeline = travelData.days[dayIndex].timeline;
    
    // 같은 위치면 무시
    if (fromIndex === targetIndex || fromIndex === targetIndex - 1) return;

    const movedItem = timeline[fromIndex];
    const isTransitItem = movedItem.isTransit;
    const originalTime = movedItem.time; // 이동 수단의 기존 시간 저장

    // [Step 1] 순서 변경
    timeline.splice(fromIndex, 1);
    
    // 인덱스 조정 (remove 후 insert 위치 계산)
    let insertIndex = targetIndex;
    if (fromIndex < targetIndex) {
        insertIndex = targetIndex - 1; // 뒤로 옮길 때는 -1
    }
    
    timeline.splice(insertIndex, 0, movedItem);

    // [Step 2] 순서 변경 후 재정렬 (시간 계산 안 함, reorderTimeline에서 이동수단 삭제만 처리)
    reorderTimeline(dayIndex);
}

export function reorderTimeline(dayIndex, sortByTime = false) {
    if (dayIndex === null || dayIndex === -1) return;
    const day = travelData.days[dayIndex];
    if (!day || !day.timeline) return;

    if (sortByTime) {
        day.timeline.sort((a, b) => {
            const ta = parseTimeStr(a.time);
            const tb = parseTimeStr(b.time);
            if (ta === null && tb === null) return 0;
            if (ta === null) return 1;
            if (tb === null) return -1;
            return ta - tb;
        });
    }
    
    renderItinerary();
    autoSave();
}

// 날짜 탭 변경
export function selectDay(index) {
    setCurrentDayIndex(index);
    if (index !== -1) {
        setTargetDayIndex(index);
    }
    
    // 날짜에 맞는 날씨 업데이트
    const day = index !== -1 ? travelData.days[index] : travelData.days[0];
    if (day && day.date && travelData.meta.lat && travelData.meta.lng) {
        fetchWeather(travelData.meta.lat, travelData.meta.lng, day.date);
    }
    
    renderItinerary();
}

// [Detail Modal Logic]
export function viewTimelineItem(index, dayIndex = currentDayIndex) {
    if (isEditing) return;
    
    setTargetDayIndex(dayIndex);
    setViewingItemIndex(index);
    const timeline = travelData.days[dayIndex].timeline;
    const item = timeline[index];
    
    // [메모 아이템인 경우 전용 모달 호출]
    if (item.tag === '메모') {
        Modals.openMemoModal(item);
        return;
    }

    // [Modified] 이동수단인 경우 전용 상세 모달 호출
    if (item.isTransit) {
        // Transit 상세 모달은 ui-transit.js에서만 담당
        return;
    }

    // 추억 잠금 상태에 따라 수정/삭제 버튼 표시/숨김
    const isMemoryLocked = travelData.meta.memoryLocked || false;
    const actionButtons = document.getElementById('detail-action-buttons');
    if (actionButtons) {
        const editBtn = actionButtons.querySelector('button[onclick="editCurrentItem()"]');
        const deleteBtn = actionButtons.querySelector('button[onclick="deleteCurrentItem()"]');
        if (editBtn && deleteBtn) {
            if (isMemoryLocked) {
                editBtn.classList.add('hidden');
                deleteBtn.classList.add('hidden');
            } else {
                editBtn.classList.remove('hidden');
                deleteBtn.classList.remove('hidden');
            }
        }
    }

    // Fill Content
    document.getElementById('detail-tag').innerText = item.tag || '기타';
    const durationText = item.duration !== undefined ? ` (${item.duration}분 체류)` : '';
    document.getElementById('detail-time').innerText = item.time + durationText;
    document.getElementById('detail-title').innerText = item.title;
    
    // [수정] 이동수단일 경우 위치 텍스트를 "출발지 -> 도착지"로 표시
    if (item.isTransit) {
        if (item.tag === '비행기' && item.location && item.location.includes('✈️')) {
            document.getElementById('detail-location-text').innerText = item.location;
        } else {
            const prevItem = index > 0 ? timeline[index - 1] : null;
            const nextItem = index < timeline.length - 1 ? timeline[index + 1] : null;
            const prevLoc = prevItem ? (prevItem.title || "출발지") : "출발지";
            const nextLoc = nextItem ? (nextItem.title || "도착지") : "도착지";
            document.getElementById('detail-location-text').innerText = `${prevLoc} ➡️ ${nextLoc}`;
        }
    } else {
        document.getElementById('detail-location-text').innerText = item.location || '위치 정보 없음';
    }

    document.getElementById('detail-note').value = item.note || '';
    document.getElementById('detail-note').readOnly = true; // 초기엔 읽기 전용
    
    document.getElementById('detail-total-budget').value = item.budget || 0;
    renderExpenseList(item);

    // Attachments
    renderAttachments(item, 'detail-attachment-list');

    // Memories 섹션 숨김 (타임라인 카드로 이동됨)
    document.getElementById('detail-memories-section')?.classList.add('hidden');

    // Map Logic - 맨 밑으로 이동
    const mapSection = document.getElementById('detail-map-section');
    const mapFrame = document.getElementById('detail-map-frame');
    
    // 이동수단이 아니고 위치 정보가 있을 때만 지도 표시
    if (item.location && item.location.length > 1 && item.location !== "위치" && !item.isTransit) {
        mapSection.classList.remove('hidden');
        getMapsApiKey().then(key => {
            mapFrame.src = `https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(item.title + "," + item.location)}`;
        });
    } else {
        mapSection.classList.add('hidden');
        mapFrame.src = "";
    }
    
    document.getElementById('item-detail-modal').classList.remove('hidden');
}

export function openAddModal(index, dayIndex) {
    return Modals.openAddModal(index, dayIndex);
}

export function closeAddModal() {
    return Modals.closeAddModal();
}

export function closeDetailModal() {
    return Modals.closeDetailModal();
}

export function editCurrentItem() {
    if (viewingItemIndex !== null) {
        const idx = viewingItemIndex;
        setIsEditingFromDetail(true);
        closeDetailModal();
        editTimelineItem(idx, targetDayIndex);
    }
}

export function deleteCurrentItem() {
    if (viewingItemIndex !== null) {
        Modals.openGeneralDeleteModal(viewingItemIndex, targetDayIndex);
    }
}

export function openMemoModal(item) {
    const modal = document.getElementById('memo-detail-modal');
    const content = document.getElementById('memo-detail-content');
    const bookmarksContainer = document.getElementById('memo-bookmarks');
    const bookmarksList = document.getElementById('memo-bookmarks-list');
    
    // 내용 초기화 (textarea가 남아있을 경우 대비)
    content.innerHTML = ""; 
    
    // 링크 파싱 및 렌더링
    const { html, links } = processMemoContent(item.title);
    content.innerHTML = html;
    renderBookmarks(links, bookmarksContainer, bookmarksList);

    // 버튼 초기화 (저장 상태에서 닫았다가 다시 열 경우 대비)
    const btnContainer = modal.querySelector('.mt-6'); 
    if (btnContainer) {
        const btn = btnContainer.querySelector('button');
        if (btn) {
            btn.setAttribute('onclick', 'editCurrentMemo()');
            btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
            btn.className = "text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1";
        }
    }

    modal.classList.remove('hidden');
}

export function closeMemoModal() {
    document.getElementById('memo-detail-modal').classList.add('hidden');
    setViewingItemIndex(null);
}

export function editCurrentMemo() {
    if (viewingItemIndex === null) return;
    
    const contentEl = document.getElementById('memo-detail-content');
    const currentText = contentEl.innerText;
    
    // 텍스트 영역으로 변환 (인라인 편집)
    contentEl.innerHTML = `<textarea id="memo-edit-area" class="w-full h-60 bg-white/50 dark:bg-black/20 border-2 border-yellow-300 dark:border-yellow-600/50 rounded-lg p-3 text-gray-800 dark:text-gray-200 resize-none focus:ring-0 outline-none leading-relaxed font-body text-lg placeholder-gray-400" placeholder="메모를 입력하세요">${currentText}</textarea>`;
    
    // 버튼 변경 (수정 -> 저장)
    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    const btn = btnContainer.querySelector('button');
    
    btn.setAttribute('onclick', 'saveCurrentMemo()');
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">save</span> 저장`;
    btn.className = "text-sm bg-primary text-white hover:bg-orange-500 px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-md";

    setTimeout(() => document.getElementById('memo-edit-area').focus(), 50);
}

export function saveCurrentMemo() {
    if (viewingItemIndex === null) return;
    
    const textarea = document.getElementById('memo-edit-area');
    if (!textarea) return;

    const newText = textarea.value;
    
    // 데이터 업데이트
    travelData.days[targetDayIndex].timeline[viewingItemIndex].title = newText;
    
    const { html, links } = processMemoContent(newText);

    // UI 복구 (보기 모드)
    const contentEl = document.getElementById('memo-detail-content');
    contentEl.innerHTML = html;
    renderBookmarks(links, document.getElementById('memo-bookmarks'), document.getElementById('memo-bookmarks-list'));

    // 버튼 복구 (저장 -> 수정)
    const modal = document.getElementById('memo-detail-modal');
    const btnContainer = modal.querySelector('.mt-6');
    const btn = btnContainer.querySelector('button');
    
    btn.setAttribute('onclick', 'editCurrentMemo()');
    btn.innerHTML = `<span class="material-symbols-outlined text-sm">edit</span> 수정`;
    btn.className = "text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-xl font-bold transition-colors flex items-center gap-1";

    renderItinerary();
    autoSave();
}

// [Memo Link & Bookmark Logic]
function processMemoContent(text) {
    if (!text) return { html: '', links: [] };
    
    // URL 정규식
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = [];
    
    // HTML 이스케이프 (보안)
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
    // 중복 제거
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
        } catch (e) {
            // Invalid URL ignored
        }
    });

    list.innerHTML = html;
    container.classList.remove('hidden');
}

export function updateItemNote(value) {
    if (viewingItemIndex === null) return;
    travelData.days[targetDayIndex].timeline[viewingItemIndex].note = value;
    autoSave();
}

// [Invite Link Logic]
export async function checkInviteLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = urlParams.get('invite');
    
    if (inviteId && currentUser) {
        try {
            const planRef = doc(db, "plans", inviteId);
            const planSnap = await getDoc(planRef);
            
            if (planSnap.exists()) {
                const data = planSnap.data();
                if (data.members && data.members[currentUser.uid]) {
                    // 이미 멤버임
                    openTrip(inviteId);
                } else {
                    if(confirm(`'${data.meta.title}' 여행 계획에 참여하시겠습니까?`)) {
                        await updateDoc(planRef, { [`members.${currentUser.uid}`]: 'editor' });
                        alert("여행 계획에 참여했습니다!");
                        openTrip(inviteId);
                    }
                }
            }
            // URL 정리
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error("Invite processing error", e);
        }
    }
}

// [Sharing Logic]
export async function openShareModal(tripId = null) {
    return Header.openShareModal(tripId);
}

export function closeShareModal() {
    return Header.closeShareModal();
}

export async function downloadTripAsPDF() {
    return Header.downloadTripAsPDF();
}

function generatePDFContent() {
    if (!travelData || !travelData.days || travelData.days.length === 0) {
        return '<div style="padding: 20px;"><h1>여행 데이터가 없습니다.</h1></div>';
    }
    
    const title = travelData.meta.title || '여행 계획';
    const subInfo = travelData.meta.subInfo || '';
    const dayCount = travelData.meta.dayCount || '';
    
    let html = `
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif; }
            .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #3579f6; }
            .header h1 { font-size: 32px; font-weight: bold; color: #3579f6; margin-bottom: 12px; }
            .header p { font-size: 14px; color: #666; margin: 5px 0; }
            .day-section { margin-bottom: 30px; page-break-inside: avoid; }
            .day-title { font-size: 20px; font-weight: bold; color: #ee8700; margin-bottom: 15px; padding-left: 12px; border-left: 5px solid #ee8700; }
            .timeline-item { margin-bottom: 15px; padding: 12px; background: #f9f9f9; border-radius: 8px; margin-left: 20px; page-break-inside: avoid; }
            .item-header { margin-bottom: 8px; }
            .item-icon { font-size: 20px; margin-right: 8px; }
            .item-time { font-size: 11px; color: #999; margin-right: 8px; }
            .item-title { font-size: 15px; color: #333; font-weight: bold; }
            .item-tag { margin-left: 8px; font-size: 10px; color: #666; background: #e0e0e0; padding: 3px 8px; border-radius: 4px; display: inline-block; }
            .item-location { font-size: 12px; color: #666; margin-left: 28px; margin-top: 5px; }
            .item-memo { font-size: 11px; color: #555; margin-left: 28px; margin-top: 8px; font-style: italic; padding: 8px; background: white; border-left: 3px solid #3579f6; }
            .memories { margin-left: 28px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #ddd; }
            .memory-title { font-size: 11px; font-weight: bold; color: #ee8700; margin-bottom: 8px; }
            .memory-item { font-size: 11px; color: #444; margin-bottom: 6px; padding-left: 10px; border-left: 3px solid #ffc107; }
            .note-section { margin-top: 30px; padding: 15px; background: #fff9e6; border-left: 5px solid #ffc107; border-radius: 8px; }
            .note-title { font-size: 14px; font-weight: bold; color: #ee8700; margin-bottom: 10px; }
            .note-content { font-size: 12px; color: #555; white-space: pre-wrap; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; text-align: center; }
            .footer p { font-size: 10px; color: #999; }
        </style>
        <div class="header">
            <h1>${title}</h1>
            <p>${subInfo}</p>
            <p style="color: #999; font-size: 12px;">${dayCount}</p>
        </div>
    `;
    
    // 날짜별 일정
    travelData.days.forEach((day, dayIndex) => {
        const dayDate = new Date(day.date);
        const dayLabel = `Day ${dayIndex + 1} - ${dayDate.getMonth() + 1}월 ${dayDate.getDate()}일`;
        
        html += `<div class="day-section"><div class="day-title">${dayLabel}</div>`;
        
        if (day.timeline && day.timeline.length > 0) {
            day.timeline.forEach((item) => {
                const isTransit = item.isTransit || false;
                const icon = isTransit ? '🚗' : '📍';
                const time = item.time || '';
                const itemTitle = item.title || '';
                const location = item.location || '';
                const tag = item.tag || '';
                const memo = item.memo || '';
                
                html += `<div class="timeline-item">`;
                html += `<div class="item-header">`;
                html += `<span class="item-icon">${icon}</span>`;
                html += `<span class="item-time">${time}</span>`;
                html += `<span class="item-title">${itemTitle}</span>`;
                if (tag) {
                    html += `<span class="item-tag">${tag}</span>`;
                }
                html += `</div>`;
                
                if (location) {
                    html += `<div class="item-location">📌 ${location}</div>`;
                }
                
                if (memo) {
                    html += `<div class="item-memo">${memo}</div>`;
                }
                
                // 추억
                if (item.memories && item.memories.length > 0) {
                    html += `<div class="memories">`;
                    html += `<div class="memory-title">💭 추억</div>`;
                    
                    item.memories.forEach((memory) => {
                        if (memory.comment) {
                            const comment = memory.comment.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            html += `<div class="memory-item">${comment}</div>`;
                        }
                    });
                    
                    html += `</div>`;
                }
                
                html += `</div>`;
            });
        }
        
        html += `</div>`;
    });
    
    // 여행 메모
    if (travelData.meta.note) {
        const note = travelData.meta.note.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html += `
            <div class="note-section">
                <div class="note-title">📝 여행 메모</div>
                <div class="note-content">${note}</div>
            </div>
        `;
    }
    
    // 푸터
    html += `
        <div class="footer">
            <p>Made with ♥ by PLIN</p>
        </div>
    `;
    
    return html;
}

export function copyShareLink() {
    return Header.copyShareLink();
}

export function enableNoteEdit() {
    return Header.enableNoteEdit();
}

// [Trip Info Edit Logic]
export function openTripInfoModal() {
    return Header.openTripInfoModal();
}

export function closeTripInfoModal() {
    document.getElementById('trip-info-modal').classList.add('hidden');
}

export function saveTripInfo() {
    const title = document.getElementById('edit-trip-title').value.trim();
    const startStr = document.getElementById('edit-trip-start').value;
    const endStr = document.getElementById('edit-trip-end').value;

    if (!title) return alert("여행 제목을 입력해주세요.");
    if (!startStr || !endStr) return alert("날짜를 선택해주세요.");

    const start = new Date(startStr);
    const end = new Date(endStr);

    if (end < start) return alert("종료일은 시작일보다 빠를 수 없습니다.");

    // 제목 업데이트
    updateMeta('title', title);

    // 날짜 및 기간 업데이트
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const durationText = (diffDays === 0) ? "당일치기" : `${diffDays}박 ${diffDays + 1}일`;
    updateMeta('dayCount', durationText);

    // 서브 정보(날짜 텍스트) 업데이트
    const format = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    let dateStr = format(start);
    if (durationText !== "당일치기") {
        dateStr += ` - ${end.getMonth() + 1}월 ${end.getDate()}일`;
    }
    let prefix = travelData.meta.subInfo && travelData.meta.subInfo.includes('•') ? travelData.meta.subInfo.split('•')[0].trim() : "";
    updateMeta('subInfo', prefix ? `${prefix} • ${dateStr}` : dateStr);

    // Days 배열 재구성
    const totalDays = diffDays + 1;
    const currentTotalDays = travelData.days.length;
    
    // 날짜가 늘어난 경우
    if (totalDays > currentTotalDays) {
        for (let i = currentTotalDays; i < totalDays; i++) {
            travelData.days.push({ date: "", timeline: [] });
        }
    } else if (totalDays < currentTotalDays) {
        // 날짜가 줄어든 경우 뒤에서부터 삭제
        travelData.days.splice(totalDays);
    }

    // 날짜 값 갱신
    travelData.days.forEach((day, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        day.date = d.toISOString().split('T')[0];
    });

    // 현재 인덱스가 범위를 벗어나지 않도록 조정
    if (currentDayIndex >= travelData.days.length) {
        selectDay(travelData.days.length - 1);
    }

    renderItinerary();
    autoSave();
    closeTripInfoModal();
}

export function resetHeroImage() {
    if (confirm("배경 이미지를 초기 설정된 이미지로 되돌리시겠습니까?")) {
        const defaultImg = travelData.meta.defaultMapImage || "https://placehold.co/600x400";
        updateMeta('mapImage', defaultImg);
        renderItinerary();
        autoSave();
    }
}

export function deleteHeroImage() {
    if (confirm("배경 이미지를 삭제하시겠습니까?")) {
        updateMeta('mapImage', "");
        renderItinerary();
        autoSave();
    }
}

// [Expense Logic]
export function renderExpenseList(item) {
    const listEl = document.getElementById('detail-expense-list');
    const totalEl = document.getElementById('detail-total-budget');
    
    if (!item.expenses) item.expenses = [];
    
    let html = '';
    let total = 0;

    item.expenses.forEach((exp, idx) => {
        // 두 형식 모두 지원 (마이그레이션 기간)
        const description = exp.description || exp.desc || '내역 없음';
        const amount = exp.amount || exp.cost || 0;
        
        total += Number(amount);
        html += `
        <div class="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg group">
            <div class="flex items-center gap-2">
                <span class="text-sm text-gray-700 dark:text-gray-300">${description}</span>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-sm font-bold text-text-main dark:text-white">₩${Number(amount).toLocaleString()}</span>
                <button type="button" onclick="deleteExpense(${idx})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><span class="material-symbols-outlined text-sm">delete</span></button>
            </div>
        </div>`;
    });

    if (item.expenses.length === 0) {
        html = '<p class="text-xs text-gray-400 text-center py-2">지출 내역이 없습니다.</p>';
    }

    listEl.innerHTML = html;
    
    // 총 예산 업데이트 (지출 내역 합계)
    totalEl.value = total;
    item.budget = total;
}

export function updateTotalBudget() {
    let total = 0;
    if (travelData.days) {
        travelData.days.forEach(day => {
            if (day.timeline) {
                day.timeline.forEach(item => {
                    // 기존 budget 필드
                    if (item.budget) {
                        total += Number(item.budget);
                    }
                    // expenses 배열 합산
                    if (item.expenses && Array.isArray(item.expenses)) {
                        item.expenses.forEach(exp => {
                            total += Number(exp.amount || 0);
                        });
                    }
                });
            }
        });
    }
    travelData.meta.budget = `₩${total.toLocaleString()}`;
}

export function deleteExpense(expIndex) {
    const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
    item.expenses.splice(expIndex, 1);
    
    renderExpenseList(item);
    updateTotalBudget();
    
    // 예산 카드 업데이트
    const budgetEl = document.getElementById('budget-amount');
    if (budgetEl) {
        budgetEl.textContent = travelData.meta.budget || '₩0';
    }
    
    renderItinerary(); // 전체 예산 갱신
    autoSave();
}

export function openGoogleMapsExternal() {
    const loc = document.getElementById('detail-location-text').innerText;
    if (loc && loc !== '위치 정보 없음') {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`, '_blank');
    }
}

// 휠 이벤트 핸들러 (한 칸씩 이동)
function handleTimeWheel(e) {
    e.preventDefault();
    const container = e.currentTarget;
    const direction = Math.sign(e.deltaY);
    
    // 현재 선택된 값 찾기
    let currentVal = getPickerValue(container.id);
    if (currentVal === null) return;
    currentVal = parseInt(currentVal);
    
    // 값 증감 및 순환 (59 -> 0, 12 -> 1)
    let nextVal = currentVal + direction;
    
    if (container.id === 'time-hour-list') {
        if (nextVal > 12) nextVal = 1;
        if (nextVal < 1) nextVal = 12;
    } else {
        if (nextVal > 59) nextVal = 0;
        if (nextVal < 0) nextVal = 59;
    }
    
    // 해당 값의 요소로 스크롤 이동
    setPickerScroll(container.id, nextVal);
}

// 더블 클릭 핸들러 (직접 입력)
function handleTimeDblClick(e) {
    const container = e.currentTarget; // ul
    const parent = container.parentElement; // div.relative...
    
    // 이미 입력 모드면 무시
    if (parent.querySelector('input')) return;

    const currentVal = getPickerValue(container.id);
    
    // UI 전환
    container.classList.add('hidden');
    // 중앙 강조선 숨기기
    const highlight = parent.querySelector('.absolute.inset-x-0');
    if(highlight) highlight.classList.add('hidden');

    const input = document.createElement('input');
    input.type = 'number';
    input.className = "w-full h-full text-center text-2xl font-bold bg-white dark:bg-card-dark border-2 border-primary rounded-xl outline-none z-20 absolute inset-0";
    input.value = currentVal;
    // 클릭 이벤트 전파 방지 (모달 닫힘 방지)
    input.onclick = (ev) => ev.stopPropagation();
    
    // 범위 설정
    if (container.id === 'time-hour-list') {
        input.min = 1; input.max = 12;
    } else {
        input.min = 0; input.max = 59;
    }

    let isFinished = false;
    const finishEdit = () => {
        if (isFinished) return;
        isFinished = true;
        
        let val = parseInt(input.value);
        
        // 유효성 검사 및 범위 보정
        if (!isNaN(val)) {
            if (container.id === 'time-hour-list') {
                if (val < 1) val = 1;
                if (val > 12) val = 12;
            } else {
                if (val < 0) val = 0;
                if (val > 59) val = 59;
            }
            
            // 값 적용 (스크롤 이동)
            const items = Array.from(container.children);
            const index = items.findIndex(item => parseInt(item.dataset.value) === val);
            if (index !== -1) {
                container.scrollTop = index * 40;
            }
        }

        // UI 복구
        input.remove();
        container.classList.remove('hidden');
        if(highlight) highlight.classList.remove('hidden');
    };

    input.onblur = finishEdit;
    input.onkeydown = (ev) => {
        if (ev.key === 'Enter') {
            input.blur();
        }
    };

    parent.appendChild(input);
    input.focus();
}

// 카테고리 선택 모달
export function initCategoryModal() {
    const list = document.getElementById('category-grid');
    if (list.children.length === 0) {
        categoryList.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = "flex flex-col items-center justify-center gap-2 p-3 rounded-2xl bg-gray-50 dark:bg-gray-800 hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/30 transition-all aspect-square group";
            btn.onclick = () => selectCategory(cat);
            btn.innerHTML = `
                <div class="w-12 h-12 rounded-full bg-white dark:bg-gray-700 flex items-center justify-center shadow-sm text-gray-500 dark:text-gray-300 group-hover:text-primary group-hover:scale-110 transition-all">
                    <span class="material-symbols-outlined text-2xl">${cat.icon}</span>
                </div>
                <span class="font-bold text-sm">${cat.name}</span>
            `;
            list.appendChild(btn);
        });
    }
}

export function openCategoryModal() {
    initCategoryModal();
    document.getElementById('category-selection-modal').classList.remove('hidden');
}

export function closeCategoryModal() {
    document.getElementById('category-selection-modal').classList.add('hidden');
}

export function selectCategory(cat) {
    const input = document.getElementById('item-category');
    input.value = cat.name;
    input.dataset.value = cat.code;
    closeCategoryModal();
}

// 시간 선택 모달 (일정 시간용)
export function initTimeModal() {
    const hList = document.getElementById('time-hour-list');
    const mList = document.getElementById('time-minute-list');
    
    if (hList.children.length === 0) {
        for(let i=1; i<=12; i++) {
            const li = document.createElement('li');
            li.className = "h-10 flex items-center justify-center snap-center text-lg font-bold text-gray-600 dark:text-gray-300 cursor-pointer transition-colors";
            li.innerText = String(i).padStart(2, '0');
            li.dataset.value = i;
            hList.appendChild(li);
        }
        // 1분 단위로 변경
        for(let i=0; i<60; i++) {
            const li = document.createElement('li');
            li.className = "h-10 flex items-center justify-center snap-center text-lg font-bold text-gray-600 dark:text-gray-300 cursor-pointer transition-colors";
            li.innerText = String(i).padStart(2, '0');
            li.dataset.value = i;
            mList.appendChild(li);
        }

        // 이벤트 리스너 추가 (휠 & 더블클릭)
        hList.addEventListener('wheel', handleTimeWheel, { passive: false });
        mList.addEventListener('wheel', handleTimeWheel, { passive: false });
        
        hList.addEventListener('dblclick', handleTimeDblClick);
        mList.addEventListener('dblclick', handleTimeDblClick);
    }
}

// 휠 피커 값 설정 헬퍼
function setPickerScroll(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const items = Array.from(el.children);
    const index = items.findIndex(item => parseInt(item.dataset.value) === parseInt(value));
    if (index !== -1) {
        el.scrollTop = index * 40; // h-10 = 40px
    }
}

// 휠 피커 값 가져오기 헬퍼
function getPickerValue(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return null;
    const index = Math.round(el.scrollTop / 40);
    const items = el.children;
    // 범위 체크
    const safeIndex = Math.max(0, Math.min(index, items.length - 1));
    return items[safeIndex] ? items[safeIndex].dataset.value : null;
}

export function openTimeModal() {
    initTimeModal();
    document.getElementById('time-selection-modal').classList.remove('hidden');
    
    // 현재 입력된 값 파싱해서 기본값 설정
    const currentVal = document.getElementById('item-time').value;
    if (currentVal) {
        const isPM = currentVal.includes('오후');
        const timeParts = currentVal.replace(/[^0-9:]/g, '').split(':');
        if (timeParts.length >= 2) {
            setPickerScroll('time-ampm-list', isPM ? '오후' : '오전');
            setPickerScroll('time-hour-list', parseInt(timeParts[0]));
            setPickerScroll('time-minute-list', parseInt(timeParts[1]));
        }
    }
}

export function closeTimeModal() {
    document.getElementById('time-selection-modal').classList.add('hidden');
}

export function confirmTimeSelection() {
    const ampm = getPickerValue('time-ampm-list') || '오전';
    const h = getPickerValue('time-hour-list') || 12;
    const m = getPickerValue('time-minute-list') || 0;
    document.getElementById('item-time').value = `${ampm} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    closeTimeModal();
}

// 이동 수단 추가
export function addTransitItem(index, type, dayIndex = currentDayIndex) {
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const day = travelData.days[dayIndex];
    const tagMap = {
        'airplane': '비행기',
        'train': '기차',
        'bus': '버스',
        'car': '자동차',
        'walk': '도보'
    };

    // 빈 이동수단 아이템 생성
    const newItem = {
        time: "",
        title: "",
        location: "",
        icon: type === 'airplane' ? 'flight' : 'directions_walk',
        tag: tagMap[type] || '도보',
        tagColor: "green",
        isTransit: true,
        detailedSteps: []
    };

    // 타임라인에 추가
    day.timeline.splice(index, 0, newItem);
    autoSave();
    renderItinerary();

    // 바로 상세 모달을 edit 모드로 열기
    setTimeout(() => {
        viewRouteDetail(index, dayIndex, true);
    }, 100);
}

// [Transit Detail Modal Logic]
export function openTransitDetailModal(item, index, dayIndex) {
    setViewingItemIndex(index);
    const modal = document.getElementById('transit-detail-modal');
    
    document.getElementById('transit-detail-icon').innerText = item.icon;
    document.getElementById('transit-detail-title').innerText = item.title;
    document.getElementById('transit-detail-time').innerText = item.time;
    
    // 시간 정보 저장을 위한 hidden input 값 설정
    const tInfo = item.transitInfo || {};
    document.getElementById('transit-detail-start-val').value = tInfo.start || '';
    document.getElementById('transit-detail-end-val').value = tInfo.end || '';
    
    // [Added] 대중교통 상세 정보 (정류장, 방향, 실시간 현황) 표시
    let publicInfoEl = document.getElementById('transit-detail-public-info');
    if (!publicInfoEl) {
        publicInfoEl = document.createElement('div');
        publicInfoEl.id = 'transit-detail-public-info';
        publicInfoEl.className = "w-full mb-6 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 hidden";
        const timeEl = document.getElementById('transit-detail-time').parentElement;
        timeEl.after(publicInfoEl);
    }

    if (['버스', '전철', '기차', '지하철'].some(t => item.tag && item.tag.includes(t)) && (tInfo.depStop || tInfo.arrStop)) {
        publicInfoEl.classList.remove('hidden');
        
        // 실시간 남은 시간 계산 (여행 당일인 경우)
        let statusHtml = '';
        if (tInfo.start) {
            const dayDate = travelData.days[dayIndex].date;
            if (dayDate) {
                const [h, m] = tInfo.start.split(':').map(Number);
                const target = new Date(dayDate);
                target.setHours(h, m, 0, 0);
                const now = new Date();
                
                if (target.toDateString() === now.toDateString()) {
                    const diff = Math.floor((target - now) / 60000);
                    if (diff > 0) statusHtml = `<span class="text-red-500 font-bold animate-pulse">${diff}분 후 도착</span>`;
                    else if (diff > -10) statusHtml = `<span class="text-gray-500 font-bold">도착/출발함</span>`;
                }
            }
        }

        publicInfoEl.innerHTML = `
            <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-center mb-3">
                <div class="flex flex-col items-center min-w-0">
                    <span class="text-[10px] text-gray-400 uppercase font-bold mb-1">출발</span>
                    <span class="font-bold text-sm text-gray-800 dark:text-white leading-tight truncate w-full">${tInfo.depStop || '출발지'}</span>
                    <span class="text-xs text-primary font-bold mt-1">${tInfo.start || '--:--'}</span>
                </div>
                <div class="text-gray-300"><span class="material-symbols-outlined">arrow_forward</span></div>
                <div class="flex flex-col items-center min-w-0">
                    <span class="text-[10px] text-gray-400 uppercase font-bold mb-1">도착</span>
                    <span class="font-bold text-sm text-gray-800 dark:text-white leading-tight truncate w-full">${tInfo.arrStop || '도착지'}</span>
                    <span class="text-xs text-gray-500 mt-1">${tInfo.end || '--:--'}</span>
                </div>
            </div>
            ${tInfo.headsign ? `
            <div class="flex justify-between items-center border-t border-gray-200 dark:border-gray-600 pt-3">
                <span class="text-xs text-gray-500">방향</span>
                <span class="text-sm font-bold text-gray-800 dark:text-white truncate ml-2">${tInfo.headsign}</span>
            </div>` : ''}
            ${statusHtml ? `
            <div class="flex justify-between items-center mt-2">
                <span class="text-xs text-gray-500">실시간 현황</span>
                ${statusHtml}
            </div>` : ''}
        `;
    } else {
        publicInfoEl.classList.add('hidden');
    }

    // [비행기 상세 정보 및 검색 버튼 처리]
    const flightInfoEl = document.getElementById('transit-detail-flight-info');
    const searchBtnEl = document.getElementById('transit-detail-search-btn');
    
    if (item.tag === '비행기') {
        const info = item.transitInfo || {};
        
        document.getElementById('transit-detail-pnr').innerText = info.pnr ? info.pnr.toUpperCase() : '미정';
        document.getElementById('transit-detail-terminal').innerText = info.terminal ? info.terminal.toUpperCase() : '미정';
        document.getElementById('transit-detail-gate').innerText = info.gate ? info.gate.toUpperCase() : '미정';
        
        flightInfoEl.classList.remove('hidden');
        
        // 항공편명 추출 (transitInfo에 없으면 title에서 파싱 시도)
        let flightNum = info.flightNum || (item.title.match(/\(([^)]+)\)/) ? item.title.match(/\(([^)]+)\)/)[1] : '');
        flightNum = flightNum.toUpperCase();
        
        if (flightNum) {
            searchBtnEl.classList.remove('hidden');
            searchBtnEl.innerHTML = `<span class="material-symbols-outlined text-base">search</span> 항공편 검색`;
            searchBtnEl.onclick = () => window.open(`https://www.google.com/search?q=${encodeURIComponent(flightNum + " 항공편")}`, '_blank');
        } else {
            searchBtnEl.classList.add('hidden');
        }
    } else {
        if (flightInfoEl) flightInfoEl.classList.add('hidden');
        
        if (searchBtnEl) {
            const timeline = travelData.days[dayIndex].timeline;
            
            // 유효한 위치 정보를 가진 아이템을 찾는 헬퍼 (앞뒤로 검색)
            const findLocItem = (start, dir) => {
                let i = start;
                while (i >= 0 && i < timeline.length) {
                    const it = timeline[i];
                    if ((it.lat && it.lng) || (!it.isTransit && it.tag !== '메모' && it.location && it.location !== '위치')) {
                        return it;
                    }
                    i += dir;
                }
                return null;
            };

            const originItem = findLocItem(index - 1, -1);
            const destItem = findLocItem(index + 1, 1);

            if (originItem && destItem) {
                searchBtnEl.classList.remove('hidden');
                searchBtnEl.innerHTML = `<span class="material-symbols-outlined text-base">map</span> 경로 보기`;
                searchBtnEl.onclick = () => {
                    const getLocStr = (it) => {
                        // 1. 주소(location) 정보가 유효하면 최우선으로 사용합니다.
                        if (it.location && it.location !== '위치') {
                            return it.location;
                        }
                        // 2. 주소가 없으면 장소명(title)을 사용합니다.
                        if (it.title) {
                            return it.title;
                        }
                        // 3. 둘 다 없으면 최후의 수단으로 좌표를 사용합니다.
                        if (it.lat && it.lng) {
                            return `${it.lat},${it.lng}`;
                        }
                        return ''; // 모든 정보가 없는 경우
                    };
                    const origin = encodeURIComponent(getLocStr(originItem));
                    const destination = encodeURIComponent(getLocStr(destItem));
                    
                    let mode = 'transit';
                    if (item.tag === '도보') mode = 'walking';
                    else if (item.tag === '차량') mode = 'driving';
                    
                    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`, '_blank');
                };
            } else {
                searchBtnEl.classList.add('hidden');
            }
        }
    }

    // Route Text
    const timeline = travelData.days[dayIndex].timeline;
    const prevItem = index > 0 ? timeline[index - 1] : null;
    const nextItem = index < timeline.length - 1 ? timeline[index + 1] : null;
    const prevLoc = prevItem ? (prevItem.title || "출발지") : "출발지";
    const nextLoc = nextItem ? (nextItem.title || "도착지") : "도착지";
    
    let routeText = `${prevLoc} ➡️ ${nextLoc}`;
    if (item.tag === '비행기' && item.location && item.location.includes('✈️')) {
        routeText = item.location;
    }
    document.getElementById('transit-detail-route').innerText = routeText;
    
    document.getElementById('transit-detail-note').innerText = item.note || "메모가 없습니다.";

    // Detailed Steps (Ekispert 등 다단계 경로)
    const stepsContainer = document.getElementById('transit-detail-steps');
    const stepsList = document.getElementById('transit-detail-steps-list');
    
    if (item.detailedSteps && item.detailedSteps.length > 0) {
        console.log('[TransitDetail] detailedSteps:', item.detailedSteps);
        stepsContainer.classList.remove('hidden');
        stepsList.innerHTML = '';
        
        item.detailedSteps.forEach((step, idx) => {
            console.log(`[TransitDetail] step[${idx}]`, step, 'type:', step.type);
            const stepCard = document.createElement('div');
            stepCard.className = 'bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3';
            
            // 태그 색상 처리 (노선명/번호)
            let tagHtml = '';
            if (step.color && step.color.startsWith('rgb')) {
                // RGB 색상값 사용 (Ekispert API 등)
                const bgColor = step.color;
                const txtColor = step.textColor || 'white';
                tagHtml = `<span style="background-color: ${bgColor}; color: ${txtColor};" class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">${step.tag}</span>`;
            } else if (step.tagColor && step.tagColor.startsWith('rgb')) {
                // 하위 호환성
                tagHtml = `<span style="background-color: ${step.tagColor}; color: white;" class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">${step.tag}</span>`;
            } else {
                // Tailwind 클래스 사용
                const colorMap = {
                    'blue': 'bg-blue-500 text-white',
                    'green': 'bg-green-500 text-white',
                    'red': 'bg-red-500 text-white',
                    'orange': 'bg-orange-500 text-white',
                    'purple': 'bg-purple-500 text-white',
                    'gray': 'bg-gray-500 text-white'
                };
                const tagClass = colorMap[step.tagColor] || 'bg-blue-500 text-white';
                tagHtml = `<span class="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${tagClass}">${step.tag}</span>`;
            }
            
            // 이동수단 타입 태그 생성 (오른쪽)
            let typeTagHtml = '';
            if (step.type) {
                const typeMap = {
                    'walk': { label: '도보', class: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
                    'bus': { label: '버스', class: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
                    'subway': { label: '전철', class: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
                    'train': { label: '기차', class: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
                    'airplane': { label: '비행기', class: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' },
                    'ship': { label: '배', class: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300' },
                    'car': { label: '차량', class: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' }
                };
                const typeInfo = typeMap[step.type] || { label: step.type, class: 'bg-gray-100 text-gray-700' };
                typeTagHtml = `<span class="px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${typeInfo.class}">${typeInfo.label}</span>`;
            }
            
            stepCard.innerHTML = `
                <span class="material-symbols-outlined text-gray-600 dark:text-gray-300">${step.icon}</span>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        ${tagHtml}
                        <span class="text-xs text-gray-500 dark:text-gray-400">${step.time}</span>
                    </div>
                    <p class="text-sm font-bold text-gray-800 dark:text-white truncate">${step.title}</p>
                    ${step.transitInfo?.depStop && step.transitInfo?.arrStop ? `
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        ${step.transitInfo.depStop} → ${step.transitInfo.arrStop}
                        ${step.transitInfo.stopCount ? ` (${step.transitInfo.stopCount}정거장)` : ''}
                    </p>
                    ` : ''}
                </div>
                ${typeTagHtml ? `<div class="flex-shrink-0">${typeTagHtml}</div>` : ''}
            `;
            
            stepsList.appendChild(stepCard);
        });
    } else {
        stepsContainer.classList.add('hidden');
    }

    // Attachments
    renderAttachments(item, 'transit-attachment-list');

    modal.classList.remove('hidden');
}

// [Flight Input Modal Logic]
let flightInputIndex = null;
let isFlightEditing = false;

// 주요 공항 데이터 (자동완성용)
const majorAirports = [
    { code: "ICN", name: "인천국제공항" },
    { code: "GMP", name: "김포국제공항" },
    { code: "CJU", name: "제주국제공항" },
    { code: "PUS", name: "김해국제공항" },
    { code: "NRT", name: "나리타 국제공항" },
    { code: "HND", name: "하네다 공항" },
    { code: "KIX", name: "간사이 국제공항" },
    { code: "FUK", name: "후쿠오카 공항" },
    { code: "CTS", name: "신치토세 공항" },
    { code: "OKA", name: "나하 공항" },
    { code: "TPE", name: "타오위안 국제공항" },
    { code: "TSA", name: "송산 공항" },
    { code: "DAD", name: "다낭 국제공항" },
    { code: "HAN", name: "노이바이 국제공항" },
    { code: "SGN", name: "탄손누트 국제공항" },
    { code: "BKK", name: "수완나품 공항" },
    { code: "DMK", name: "돈므앙 국제공항" },
    { code: "HKG", name: "홍콩 국제공항" },
    { code: "SIN", name: "창이 공항" },
    { code: "MNL", name: "니노이 아키노 국제공항" },
    { code: "CEB", name: "막탄 세부 국제공항" },
    { code: "JFK", name: "존 F. 케네디 국제공항" },
    { code: "LAX", name: "로스앤젤레스 국제공항" },
    { code: "SFO", name: "샌프란시스코 국제공항" },
    { code: "LHR", name: "히드로 공항" },
    { code: "CDG", name: "샤를 드 골 공항" },
    { code: "FRA", name: "프랑크푸르트 공항" },
    { code: "FCO", name: "레오나르도 다 빈치 국제공항" },
    { code: "DXB", name: "두바이 국제공항" },
];

export function openFlightInputModal(index, isEdit = false) {
    flightInputIndex = index;
    isFlightEditing = isEdit;

    // 초기화
    const flightNumInput = document.getElementById('flight-number');
    const pnrInput = document.getElementById('flight-pnr');
    const depInput = document.getElementById('flight-dep-airport');
    const arrInput = document.getElementById('flight-arr-airport');
    const depTimeInput = document.getElementById('flight-dep-time');
    const arrTimeInput = document.getElementById('flight-arr-time');
    const terminalInput = document.getElementById('flight-terminal');
    const gateInput = document.getElementById('flight-gate');
    const noteInput = document.getElementById('flight-note');
    const modalTitle = document.querySelector('#flight-input-modal h3');
    const saveBtn = document.querySelector('#flight-input-modal button[onclick="saveFlightItem()"]');

    flightNumInput.value = "";
    pnrInput.value = "";
    depInput.value = "";
    arrInput.value = "";
    depTimeInput.value = "";
    arrTimeInput.value = "";
    terminalInput.value = "";
    gateInput.value = "";
    noteInput.value = "";
    
    // 공항 자동완성 리스트 채우기 (최초 1회)
    const datalist = document.getElementById('airport-list');
    if (datalist && datalist.children.length === 0) {
        majorAirports.forEach(ap => {
            const opt = document.createElement('option');
            opt.value = `${ap.code} (${ap.name})`;
            datalist.appendChild(opt);
        });
    }

    if (isEdit) {
        modalTitle.innerText = "항공편 정보 수정";
        saveBtn.innerText = "수정 완료";
        
        const item = travelData.days[targetDayIndex].timeline[index];
        const info = item.transitInfo || {};

        if (info.flightNum) flightNumInput.value = info.flightNum;
        else if (item.title) {
            const match = item.title.match(/\(([^)]+)\)/);
            if (match) flightNumInput.value = match[1];
        }

        if (info.pnr) pnrInput.value = info.pnr;
        else if (item.note) {
            const match = item.note.match(/예약번호:\s*([^\n]+)/);
            if (match) pnrInput.value = match[1].trim();
        }

        if (info.depAirport) depInput.value = info.depAirport;
        else if (item.location) {
            const parts = item.location.split('✈️');
            if (parts.length === 2) depInput.value = parts[0].trim();
        }

        if (info.arrAirport) arrInput.value = info.arrAirport;
        else if (item.location) {
            const parts = item.location.split('✈️');
            if (parts.length === 2) arrInput.value = parts[1].trim();
        }

        if (info.depTime) depTimeInput.value = info.depTime;
        if (info.arrTime) arrTimeInput.value = info.arrTime;
        if (info.terminal) terminalInput.value = info.terminal;
        if (info.gate) gateInput.value = info.gate;
        if (info.userNote) noteInput.value = info.userNote;
    } else {
        modalTitle.innerText = "항공편 정보 입력";
        saveBtn.innerText = "추가";
    }
    
    // 엔터 키로 검색 가능하게 설정
    flightNumInput.onkeydown = function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchFlightNumber();
        }
    };

    // 공항 입력 필드 엔터 키 자동완성 처리
    const handleAirportEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = e.target.value.trim();
            if (!val) return;

            // 매칭되는 공항 찾기 (코드 또는 이름)
            const match = majorAirports.find(ap => 
                ap.name.includes(val) || 
                ap.code.includes(val.toUpperCase())
            );
            
            if (match) {
                e.target.value = `${match.code} (${match.name})`;
                // 다음 필드로 포커스 이동
                if (e.target.id === 'flight-dep-airport') {
                    arrInput.focus();
                }
            }
        }
    };

    depInput.onkeydown = handleAirportEnter;
    arrInput.onkeydown = handleAirportEnter;

    document.getElementById('flight-input-modal').classList.remove('hidden');
    setTimeout(() => flightNumInput.focus(), 100);
}

export function closeFlightInputModal() {
    document.getElementById('flight-input-modal').classList.add('hidden');
    flightInputIndex = null;
}

export function searchFlightNumber() {
    const flightNum = document.getElementById('flight-number').value.trim();
    if (!flightNum) {
        alert("항공편명을 입력해주세요 (예: KE123)");
        return;
    }
    window.open(`https://www.google.com/search?q=${encodeURIComponent(flightNum + " 항공편")}`, '_blank');
}
window.searchFlightNumber = searchFlightNumber;

export function saveFlightItem() {
    const flightNum = document.getElementById('flight-number').value;
    const pnr = document.getElementById('flight-pnr').value;
    const depAirport = document.getElementById('flight-dep-airport').value;
    const arrAirport = document.getElementById('flight-arr-airport').value;
    const depTime = document.getElementById('flight-dep-time').value;
    const arrTime = document.getElementById('flight-arr-time').value;
    const terminal = document.getElementById('flight-terminal').value;
    const gate = document.getElementById('flight-gate').value;
    const userNote = document.getElementById('flight-note').value;

    // 소요 시간 계산
    let durationStr = "2시간"; // 기본값
    if (depTime && arrTime) {
        const [h1, m1] = depTime.split(':').map(Number);
        const [h2, m2] = arrTime.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60; // 다음날 도착 가정
        
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        durationStr = (h > 0 ? `${h}시간 ` : "") + `${m}분`;
    }

    let sysNote = "";
    if (pnr) sysNote += `예약번호: ${pnr}`;
    if (terminal) sysNote += (sysNote ? "\n" : "") + `터미널: ${terminal}`;
    if (gate) sysNote += (sysNote ? " / " : "") + `게이트: ${gate}`;

    let noteStr = userNote;
    if (sysNote) {
        noteStr = noteStr ? `${noteStr}\n\n${sysNote}` : sysNote;
    }

    const newItem = {
        time: durationStr,
        title: flightNum ? `비행기로 이동 (${flightNum.toUpperCase()})` : "비행기로 이동",
        location: (depAirport && arrAirport) ? `${depAirport.toUpperCase()} ✈️ ${arrAirport.toUpperCase()}` : "공항 이동",
        icon: "flight",
        tag: "비행기",
        isTransit: true,
        image: null,
        note: noteStr,
        transitInfo: { 
            terminal: terminal.toUpperCase(), 
            gate: gate.toUpperCase(),
            flightNum: flightNum.toUpperCase(),
            pnr: pnr.toUpperCase(),
            depAirport: depAirport.toUpperCase(),
            arrAirport: arrAirport.toUpperCase(),
            depTime,
            arrTime,
            userNote
        }
    };

    if (isFlightEditing) {
        travelData.days[targetDayIndex].timeline[flightInputIndex] = newItem;
    } else {
        travelData.days[targetDayIndex].timeline.splice(flightInputIndex + 1, 0, newItem);
    }

    reorderTimeline(targetDayIndex);
    closeFlightInputModal();

    if (isFlightEditing && isEditingFromDetail) {
        const newIndex = travelData.days[targetDayIndex].timeline.indexOf(newItem);
        if (newIndex !== -1) {
            openTransitDetailModal(newItem, newIndex, targetDayIndex);
        }
    }
    isEditingFromDetail = false;
}

// 자동 저장 헬퍼 함수
// AutoSave debouncing
let autoSaveTimeout = null;

export async function autoSave(immediate = false) {
    if (!isEditing && currentUser && currentTripId) {
        const saveTask = async () => {
            try {
                // [핵심] JSON 변환을 통해 undefined 값을 가진 필드를 자동으로 제거함
                const cleanData = JSON.parse(JSON.stringify(travelData));
                await setDoc(doc(db, "plans", currentTripId), cleanData);
            } catch (e) {
                console.error("Auto-save failed", e);
            }
        };

        if (autoSaveTimeout) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = null;
        }
        
        if (immediate) {
            await saveTask();
        } else {
            // Debounce: 500ms 대기 후 저장 (연속 호출 시 마지막 것만 실행)
            autoSaveTimeout = setTimeout(saveTask, 500);
        }
    }
}

export function renderItinerary() {    
    // 일일 총 지출 계산
    let dailyTotal = 0;
    const calcTimeline = (currentDayIndex === -1) ? [] : (travelData.days[currentDayIndex] ? travelData.days[currentDayIndex].timeline : []);
    if (currentDayIndex !== -1) {
        calcTimeline.forEach(item => { if (item.budget) dailyTotal += Number(item.budget); });
    }

    // 1. 메타 정보 채우기 - 사용자 아이콘 캐싱 적용
    let userImg = travelData.meta.userImage || localStorage.getItem('cachedUserPhotoURL') || "https://placehold.co/100";
    if (userImg.includes('via.placeholder.com')) userImg = localStorage.getItem('cachedUserPhotoURL') || "https://placehold.co/100";
    
    const userAvatarEl = document.getElementById('user-avatar');
    if (userAvatarEl) {
        userAvatarEl.style.backgroundImage = `url('${userImg}')`;
        // 이미지 로드 실패 시 대비
        const testImg = new Image();
        testImg.onload = () => { /* 정상 로드 */ };
        testImg.onerror = () => {
            // 로드 실패 시 캐싱된 이미지 사용
            const cached = localStorage.getItem('cachedUserPhotoURL');
            if (cached && cached !== userImg) {
                userAvatarEl.style.backgroundImage = `url('${cached}')`;
            }
        };
        testImg.src = userImg;
    }
    
    // 지도 로드 여부와 상관없이 배경 이미지 설정 (지도가 로드되지 않았거나 투명할 때 대비)
    let bgImg = travelData.meta.mapImage || "https://placehold.co/600x400";
    if (bgImg.includes('via.placeholder.com')) bgImg = "https://placehold.co/600x400";
    document.getElementById('map-bg').style.backgroundImage = `url('${bgImg}')`;
    const heroEl = document.getElementById('trip-hero');
    if (heroEl) heroEl.style.backgroundImage = `url('${bgImg}')`;

    // Google Map 위치 업데이트 (초기화 확인)
    try {
        if (googleMap && mapMarker) {
            const lat = Number(travelData.meta.lat);
            const lng = Number(travelData.meta.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                const pos = { lat, lng };
                if (googleMap.panTo) googleMap.panTo(pos);
                if (mapMarker.setPosition) mapMarker.setPosition(pos);
            }
        }
    } catch (e) {
        // googleMap이 아직 초기화되지 않았을 수 있음
        console.debug('Map not initialized yet');
    }

    if (isEditing) {
        // Edit Mode: Meta Inputs
        
        // Hero Image Upload Overlay
        if (heroEl) {
            heroEl.innerHTML = `
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer hover:bg-black/50 transition-colors" onclick="document.getElementById('hero-image-upload').click()">
                    <div class="text-white flex flex-col items-center gap-2">
                        <span class="material-symbols-outlined text-4xl">add_a_photo</span>
                        <span class="font-bold text-sm">배경 이미지 변경</span>
                    </div>
                </div>
            `;
        }

        // 기간 입력 (N박 M일)
        document.getElementById('trip-day-count').innerText = travelData.meta.dayCount;
        
        document.getElementById('trip-title').innerHTML = `<input type="text" class="bg-gray-50 border border-gray-300 rounded px-2 py-1 text-2xl font-bold w-full" value="${travelData.meta.title}" onchange="updateMeta('title', this.value)">`;
        
        // 날짜 범위 수정 UI
        const startDate = travelData.days[0]?.date || new Date().toISOString().split('T')[0];
        const endDate = travelData.days[travelData.days.length - 1]?.date || new Date().toISOString().split('T')[0];
        document.getElementById('trip-date-info').innerHTML = `
            <div class="flex items-center gap-2"><input type="date" id="edit-start-date" class="bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm" value="${startDate}" onchange="updateDateRange()"><span class="text-gray-400">~</span><input type="date" id="edit-end-date" class="bg-gray-50 border border-gray-300 rounded px-2 py-1 text-sm" value="${endDate}" onchange="updateDateRange()"></div>`;
        
        // 날씨는 자동 업데이트되므로 편집 모드에서도 수정 불가 (텍스트로 표시)
        document.getElementById('weather-temp').innerText = travelData.meta.weather.temp;
        document.getElementById('weather-range').innerText = `${travelData.meta.weather.minTemp || '-'} / ${travelData.meta.weather.maxTemp || '-'}`;
        document.getElementById('weather-desc').innerText = travelData.meta.weather.desc;
        
        document.getElementById('budget-amount').innerText = `₩${dailyTotal.toLocaleString()}`;
    } else {
        // View Mode: Text
        
        // Reset Hero Overlay
        if (heroEl) {
            heroEl.innerHTML = '<div class="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>';
        }

        // "1일" 또는 "당일"이 포함되면 "당일치기"로 표시
        let durationText = travelData.meta.dayCount;
        if (durationText === "1일" || durationText === "당일") {
            durationText = "당일치기";
        }
        document.getElementById('trip-day-count').innerText = durationText;
        
        document.getElementById('trip-title').innerText = travelData.meta.title;
        
        // 날짜 범위 표시 로직 (시작일 - 종료일)
        let dateDisplay = travelData.meta.subInfo;
        if (travelData.days && travelData.days.length > 0) {
            const start = new Date(travelData.days[0].date);
            const end = new Date(travelData.days[travelData.days.length - 1].date);
            const format = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
            
            let dateStr = format(start);
            if (travelData.meta.dayCount !== "당일치기" && start.getTime() !== end.getTime()) {
                dateStr += ` - ${end.getMonth() + 1}월 ${end.getDate()}일`;
            }
            
            const parts = travelData.meta.subInfo.split('•');
            dateDisplay = parts.length > 1 ? `${parts[0].trim()} • ${dateStr}` : dateStr;
        }
        document.getElementById('trip-date-info').innerText = dateDisplay;

        document.getElementById('weather-temp').innerText = travelData.meta.weather.temp;
        document.getElementById('weather-range').innerText = `${travelData.meta.weather.minTemp || '-'} / ${travelData.meta.weather.maxTemp || '-'}`;
        document.getElementById('weather-desc').innerText = travelData.meta.weather.desc;
        if (currentDayIndex === -1) {
            document.getElementById('budget-amount').innerText = travelData.meta.budget; // 전체 예산
        } else {
            document.getElementById('budget-amount').innerText = `₩${dailyTotal.toLocaleString()}`;
        }
        
    }

    renderLists();
    updateLocalTimeWidget(); // [Added] 시간 위젯 업데이트

    // 2. 날짜 탭 만들기
    const tabsEl = document.getElementById('day-tabs');
    let tabsHtml = '';

    if (!travelData.days) travelData.days = [];
    const isSingleDay = travelData.days.length === 1;

    // 전체 보기 탭 추가
    const isAllActive = currentDayIndex === -1 || isSingleDay;
    const allActiveClass = isAllActive 
        ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" 
        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
    tabsHtml += `
        <button type="button" onclick="selectDay(-1)" class="flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${allActiveClass}">
            <span class="text-xs font-semibold uppercase">전체</span>
        </button>`;
    
    if (!isSingleDay) {
        travelData.days.forEach((day, index) => {
            const isActive = index === currentDayIndex;
            const activeClass = isActive 
                ? "border-b-2 border-primary text-primary bg-primary/5 dark:bg-primary/10" 
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800";
            
            tabsHtml += `
            <button type="button" onclick="selectDay(${index})" class="flex flex-col items-center justify-center px-6 py-3 rounded-t-lg transition-colors ${activeClass}">
                <span class="text-xs font-semibold uppercase">${index + 1}일차</span>
            </button>
            `;
        });
    }

    tabsEl.innerHTML = tabsHtml;

    // 3. 타임라인 리스트 만들기
    const listEl = document.getElementById('timeline-list');
    let html = '';
    
    if (currentDayIndex === -1 || isSingleDay) {
        // 전체 보기 모드
        travelData.days.forEach((day, dayIdx) => {
            // [Modified] 당일치기인 경우 '1일차' 배지 숨김
            const dayBadge = isSingleDay ? '' : `<div class="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-sm">${dayIdx + 1}일차</div>`;

            html += `
                <div class="mb-8">
                    <div class="flex items-center gap-4 mb-4 pl-2">
                        ${dayBadge}
                        <div class="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                        <button type="button" onclick="reorderTimeline(${dayIdx}, true)" class="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1" title="시간순 재정렬">
                            <span class="material-symbols-outlined text-sm">sort</span>
                            <span class="hidden sm:inline">시간순 정렬</span>
                        </button>
                        <div class="text-xs text-gray-400">${day.date}</div>
                    </div>
                    <div class="flex flex-col">
            `;
            
            if (day.timeline && day.timeline.length > 0) {
                day.timeline.forEach((item, index) => {
                    const isLast = index === day.timeline.length - 1;
                    const isFirst = index === 0;
                    html += Renderers.renderTimelineItemHtml(item, index, dayIdx, isLast, isFirst);
                });
            } else {
                html += `<div class="text-center py-4 text-gray-400 text-sm">일정이 없습니다.</div>`;
            }
            
            // 날짜별 일정 추가 버튼 (전체 보기에서도 추가 가능하도록, memoryLocked가 아닐 때만)
            const isMemoryLocked = travelData.meta.memoryLocked || false;
            if (!isMemoryLocked) {
                html += `
                    <div class="flex justify-center mt-2">
                        <button type="button" onclick="openAddModal(${day.timeline.length}, ${dayIdx})" class="text-xs text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">add</span> 일정 추가
                        </button>
                    </div>`;
            }
            html += `
                </div>
            </div>`;
        });
    } else {
        // 단일 날짜 보기 모드
        const currentTimeline = travelData.days[currentDayIndex] ? travelData.days[currentDayIndex].timeline : [];
        const day = travelData.days[currentDayIndex];
        
        // 전체 보기와 동일한 헤더 추가 (날짜 태그 + 정렬 버튼 + 날짜)
        if (currentTimeline.length > 0 && day) {
            html += `
                <div class="mb-8">
                    <div class="flex items-center gap-4 mb-4 pl-2">
                        <div class="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold text-sm">${currentDayIndex + 1}일차</div>
                        <div class="h-px bg-gray-200 dark:bg-gray-700 flex-1"></div>
                        <button type="button" onclick="reorderTimeline(${currentDayIndex}, true)" class="text-xs text-primary hover:bg-primary/10 px-2 py-1 rounded-lg transition-colors flex items-center gap-1" title="시간순 재정렬">
                            <span class="material-symbols-outlined text-sm">sort</span>
                            <span class="hidden sm:inline">시간순 정렬</span>
                        </button>
                        <div class="text-xs text-gray-400">${day.date}</div>
                    </div>
                    <div class="flex flex-col">
            `;
        }
        
        currentTimeline.forEach((item, index) => {
            const isLast = index === currentTimeline.length - 1;
        const isFirst = index === 0;
            html += Renderers.renderTimelineItemHtml(item, index, currentDayIndex, isLast, isFirst);
        });
        
        // [Added] 마지막 위치 드롭 영역 (드래그앤드롭 마지막 아이템 지원)
        if (currentTimeline.length > 0) {
            html += `
                <div 
                    ondragover="dragOver(event)" 
                    ondragleave="dragLeave(event)" 
                    ondrop="timelineContainerDrop(event, ${currentDayIndex})"
                    class="h-8 relative mx-6"
                    style="z-index: 1;"
                >
                    <div class="drag-indicator absolute -top-3 left-0 right-0 h-1 bg-primary rounded-full hidden z-50 shadow-sm pointer-events-none"></div>
                </div>
            `;
        }
        
        // 헤더 닫기 (헤더가 열렸다면)
        if (currentTimeline.length > 0 && day) {
            html += `
                </div>
            </div>`;
        }
        
        // 타임라인이 비어있을 때 안내 메시지
        if (currentTimeline.length === 0) {
            html += `
            <div class="col-span-2 flex flex-col items-center justify-center py-10 text-gray-400">
                <span class="material-symbols-outlined text-4xl mb-2">edit_calendar</span>
                <p class="text-sm">아직 일정이 없습니다. 첫 일정을 추가해보세요!</p>
                <button type="button" onclick="openAddModal(-1, ${currentDayIndex})" class="mt-4 flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-full font-bold shadow-lg hover:bg-orange-500 transition-colors transform hover:scale-105">
                    <span class="material-symbols-outlined">add</span> 일정 시작하기
                </button>
            </div>`;
        }
    }

    listEl.innerHTML = html;
    
    // 추억 잠금 버튼 업데이트 (여행 완료 상태일 때만 표시)
    const memoryLockBtnContainer = document.getElementById('memory-lock-btn-container');
    const memoryLockBtn = document.getElementById('memory-lock-btn');
    if (memoryLockBtnContainer && memoryLockBtn && getTripStatus(travelData) === 'completed') {
        memoryLockBtnContainer.classList.remove('hidden');
        const isLocked = travelData.meta.memoryLocked || false;
        const icon = memoryLockBtn.querySelector('.material-symbols-outlined');
        const text = memoryLockBtn.querySelector('span:last-child');
        
        if (isLocked) {
            // 잠금 상태
            memoryLockBtn.className = 'px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600';
            icon.textContent = 'lock';
            text.textContent = '추억 고치기';
        } else {
            // 해제 상태
            memoryLockBtn.className = 'px-6 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm bg-primary text-white hover:bg-orange-500';
            icon.textContent = 'check_circle';
            text.textContent = '추억 저장 완료';
        }
    } else if (memoryLockBtnContainer) {
        memoryLockBtnContainer.classList.add('hidden');
    }
}

// [Added] 현지 시간 및 시차 계산 위젯 업데이트 함수
let timeUpdateInterval = null;

function updateLocalTimeWidget() {
    const timezone = travelData.meta.timezone;
    const displayEl = document.getElementById('local-time-display');
    const diffEl = document.getElementById('time-diff-display');
    
    if (!displayEl || !timezone) return;

    const update = () => {
        const now = new Date();
        
        // 1. 현지 시간 표시
        const localTimeStr = now.toLocaleTimeString('ko-KR', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        displayEl.innerText = localTimeStr;

        // 2. 시차 계산 (내 위치 vs 여행지)
        // 현재 브라우저 시간과 타겟 타임존의 시간을 비교
        const targetDateStr = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(now);
        const myDateStr = new Intl.DateTimeFormat('en-US', { hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).format(now);
        
        const targetDate = new Date(targetDateStr);
        const myDate = new Date(myDateStr);
        
        const diffMs = targetDate - myDate;
        const diffHours = Math.round(diffMs / (1000 * 60 * 60));
        
        let diffText = "시차 없음";
        if (diffHours > 0) {
            diffText = `내 위치보다 ${Math.abs(diffHours)}시간 빠름`;
        } else if (diffHours < 0) {
            diffText = `내 위치보다 ${Math.abs(diffHours)}시간 느림`;
        }
        diffEl.innerText = diffText;
    };

    update(); // 즉시 실행
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    timeUpdateInterval = setInterval(update, 60000); // 1분마다 갱신
}

export function renderLists() {
    return Renderers.renderLists();
}

export function addListItem(type) {
    if (type === 'shopping') {
        openShoppingAddModal();
    } else {
        openManualInputModal("", (val) => {
            travelData.checklist.push({ text: val, checked: false });
            renderLists();
            autoSave();
        }, "준비물 추가", "내용");
    }
}

export function toggleListCheck(type, index) {
    const list = type === 'shopping' ? travelData.shoppingList : travelData.checklist;
    if (list[index]) {
        list[index].checked = !list[index].checked;
        renderLists();
        autoSave();
    }
}

export function deleteListItem(type, index) {
    const list = type === 'shopping' ? travelData.shoppingList : travelData.checklist;
    list.splice(index, 1);
    renderLists();
    autoSave();
}

let selectedShoppingLocation = null;

export function openShoppingAddModal() {
    selectedShoppingLocation = null;
    const modal = document.getElementById('shopping-add-modal');
    const nameInput = document.getElementById('shopping-item-name');
    const locationList = document.getElementById('shopping-location-list');
    
    nameInput.value = '';
    locationList.innerHTML = '';
    
    // 타임라인에서 모든 장소 추출
    const locations = [];
    if (travelData.days) {
        travelData.days.forEach(day => {
            if (day.timeline) {
                day.timeline.forEach(item => {
                    if (item.title && !item.isTransit && item.tag !== '메모') {
                        const loc = {
                            title: item.title,
                            location: item.location || '',
                            dayDate: day.date
                        };
                        // 중복 제거
                        if (!locations.some(l => l.title === loc.title && l.location === loc.location)) {
                            locations.push(loc);
                        }
                    }
                });
            }
        });
    }
    
    if (locations.length > 0) {
        locations.forEach((loc, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-primary hover:bg-primary/5 transition-colors';
            btn.innerHTML = `
                <div class="font-medium text-sm text-gray-800 dark:text-white">${loc.title}</div>
                ${loc.location ? `<div class="text-xs text-gray-500">${loc.location}</div>` : ''}
            `;
            btn.onclick = () => selectShoppingLocation(idx, loc);
            btn.id = `shopping-loc-${idx}`;
            locationList.appendChild(btn);
        });
    } else {
        locationList.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">등록된 장소가 없습니다.</p>';
    }
    
    modal.classList.remove('hidden');
    setTimeout(() => nameInput.focus(), 100);
    
    nameInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmShoppingAdd();
        }
    };
}

export function selectShoppingLocation(idx, loc) {
    // 기존 선택 해제
    document.querySelectorAll('[id^="shopping-loc-"]').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/10');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
    
    // 새 선택
    const btn = document.getElementById(`shopping-loc-${idx}`);
    if (btn) {
        btn.classList.add('border-primary', 'bg-primary/10');
        btn.classList.remove('border-gray-200', 'dark:border-gray-600');
    }
    
    selectedShoppingLocation = loc;
}

export function skipShoppingLocation() {
    selectedShoppingLocation = null;
    document.querySelectorAll('[id^="shopping-loc-"]').forEach(btn => {
        btn.classList.remove('border-primary', 'bg-primary/10');
        btn.classList.add('border-gray-200', 'dark:border-gray-600');
    });
}

export function closeShoppingAddModal() {
    document.getElementById('shopping-add-modal').classList.add('hidden');
    selectedShoppingLocation = null;
}

export function confirmShoppingAdd() {
    const nameInput = document.getElementById('shopping-item-name');
    const name = nameInput.value.trim();
    
    if (!name) {
        nameInput.classList.add('shake');
        setTimeout(() => nameInput.classList.remove('shake'), 300);
        return;
    }
    
    const item = {
        text: name,
        checked: false
    };
    
    if (selectedShoppingLocation) {
        item.location = selectedShoppingLocation.title;
        item.locationDetail = selectedShoppingLocation.location;
    }
    
    travelData.shoppingList.push(item);
    renderLists();
    autoSave();
    closeShoppingAddModal();
}

// [Autocomplete Logic]
let itemAutocompleteInstance = null;
let tempItemCoords = { lat: null, lng: null };

function setupItemAutocomplete() {
    const input = document.getElementById('place-search');
    if (!input || !window.google) return;

    if (itemAutocompleteInstance) {
        google.maps.event.clearInstanceListeners(itemAutocompleteInstance);
    }

    const options = {
        fields: ["formatted_address", "geometry", "name"],
        strictBounds: false,
    };

    // 장소명 입력란에 엔터 키 이벤트 리스너 추가
    const itemTitleInput = document.getElementById('item-title');
    if (itemTitleInput && !itemTitleInput.dataset.hasEnterListener) {
        itemTitleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveNewItem();
            }
        });
        itemTitleInput.dataset.hasEnterListener = 'true';
    }

    itemAutocompleteInstance = new google.maps.places.Autocomplete(input, options);
    itemAutocompleteInstance.addListener("place_changed", () => {
        const place = itemAutocompleteInstance.getPlace();

        if (!place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        if (searchMode === 'trip') {
            updateMeta('title', place.name);
            updateMeta('subInfo', place.formatted_address);
            updateMeta('lat', lat);
            updateMeta('lng', lng);
            
            if (travelData.days && travelData.days.length > 0) {
                 fetchWeather(lat, lng, travelData.days[0].date);
            }
            renderItinerary();
            closeModal();
        } else {
            tempItemCoords = { lat, lng };
            document.getElementById('item-title').value = place.name;
            document.getElementById('item-location').value = place.formatted_address;
            document.getElementById('item-title').focus();
        }
    });
}

export function openLocationSearch() {
    closeTripInfoModal();
    try {
        setSearchMode('trip');
    } catch (e) {
        console.debug('setSearchMode not available yet');
    }
    const modal = document.getElementById('item-modal');
    
    // 위치 설정 모드: 검색창 외 다른 입력 필드 숨기기
    const gridChildren = modal.querySelectorAll('.grid > div');
    gridChildren.forEach((el, index) => {
        if (index > 0) el.classList.add('hidden');
    });
    document.getElementById('save-item-btn').classList.add('hidden');
    modal.querySelector('h3').innerText = "여행지 위치 설정";

    modal.classList.remove('hidden');
    document.getElementById('place-search').value = "";
    document.getElementById('place-search').focus();
    setupItemAutocomplete();
}

// 카테고리 데이터
const categoryList = [
    { code: 'meal', name: '식사', icon: 'restaurant' },
    { code: 'culture', name: '문화', icon: 'museum' },
    { code: 'sightseeing', name: '관광', icon: 'photo_camera' },
    { code: 'shopping', name: '쇼핑', icon: 'shopping_bag' },
    { code: 'accommodation', name: '숙소', icon: 'hotel' },
    { code: 'custom', name: '기타', icon: 'star' }
];

export function addTimelineItem(insertIndex = null, dayIndex = currentDayIndex) {
    setIsEditingFromDetail(false);
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    setEditingItemIndex(null); // 추가 모드
    setInsertingItemIndex(insertIndex); // 삽입 위치 저장
    try {
        setSearchMode('item');
    } catch (e) {
        console.debug('setSearchMode not available yet');
    }
    const modal = document.getElementById('item-modal');
    
    // UI 복구: 모든 필드 표시
    const gridChildren = modal.querySelectorAll('.grid > div');
    gridChildren.forEach(el => el.classList.remove('hidden'));
    document.getElementById('save-item-btn').classList.remove('hidden');

    // 초기화
    tempItemCoords = { lat: null, lng: null };
    document.getElementById('place-search').value = "";
    document.getElementById('item-title').value = "";
    document.getElementById('item-location').value = "";
    
    // 이전 항목 시간 + 10분 자동 설정
    let defaultTime = "오후 12:00";
    const timeline = travelData.days[targetDayIndex].timeline;
    if (timeline.length > 0) {
        // insertIndex가 있으면 해당 위치의 이전 항목, 없으면 마지막 항목
        let referenceIndex = (insertIndex !== null && insertIndex >= 0) ? insertIndex : timeline.length - 1;
        const referenceItem = timeline[referenceIndex];
        if (referenceItem) {
            const refMinutes = parseTimeStr(referenceItem.time);
            if (refMinutes !== null) {
                defaultTime = formatTimeStr(refMinutes + 10);
            }
        }
    }
    
    document.getElementById('item-time').value = defaultTime;
    document.getElementById('item-notes').value = "";
    // 카테고리 초기값 설정
    document.getElementById('item-category').value = categoryList[5].name; // 기타
    document.getElementById('item-category').dataset.value = categoryList[5].code;
    
    // 모달 UI 설정 (추가 모드)
    document.querySelector('#item-modal h3').innerText = "새 장소 추가";
    document.getElementById('save-item-btn').innerText = "일정에 추가";
    
    modal.classList.remove('hidden');
    setupItemAutocomplete();
    
    // 장소 검색 입력란에 자동 포커스
    setTimeout(() => {
        const placeSearchInput = document.getElementById('place-search');
        if (placeSearchInput) placeSearchInput.focus();
    }, 100);
}

export function editTimelineItem(index, dayIndex = currentDayIndex) {
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const item = travelData.days[targetDayIndex].timeline[index];
    
    // 이동 수단(Transit)인 경우 전용 모달 호출
    if (item.isTransit) {
        if (item.tag === '비행기') {
            // ui-transit.js의 함수를 호출 (window 객체에 할당된 경우)
            if (window.openFlightInputModal) window.openFlightInputModal(index, true);
            return;
        }
        // ui-transit.js의 함수를 호출
        if (window.openTransitInputModal) window.openTransitInputModal(index, null);
        return;
    }
    
    setEditingItemIndex(index);
    try {
        setSearchMode('item');
    } catch (e) {
        console.debug('setSearchMode not available yet');
    }
    
    const modal = document.getElementById('item-modal');
    // UI 복구: 모든 필드 표시
    const gridChildren = modal.querySelectorAll('.grid > div');
    gridChildren.forEach(el => el.classList.remove('hidden'));
    document.getElementById('save-item-btn').classList.remove('hidden');
    
    // 데이터 채우기
    tempItemCoords = { lat: item.lat || null, lng: item.lng || null };
    document.getElementById('place-search').value = ""; // 검색창은 초기화
    document.getElementById('item-title').value = item.title;
    document.getElementById('item-location').value = item.location;
    document.getElementById('item-time').value = item.time;
    document.getElementById('item-duration').value = item.duration !== undefined && item.duration !== null ? item.duration : 30;
    document.getElementById('item-notes').value = item.note || "";
    
    const tagToCategory = {
        "식사": "meal",
        "문화": "culture",
        "관광": "sightseeing",
        "쇼핑": "shopping",
        "숙소": "accommodation",
        "기타": "custom"
    };

    let categoryValue = 'custom';
    if (item.tag) categoryValue = tagToCategory[item.tag] || item.tag.toLowerCase();
    
    const categoryObj = categoryList.find(c => c.code === categoryValue) || categoryList[5];
    document.getElementById('item-category').value = categoryObj.name;
    document.getElementById('item-category').dataset.value = categoryObj.code;
    
    // 모달 UI 설정 (수정 모드)
    document.querySelector('#item-modal h3').innerText = "활동 수정";
    document.getElementById('save-item-btn').innerText = "수정 완료";
    
    modal.classList.remove('hidden');
    setupItemAutocomplete();
}

export function openGoogleMapsRouteFromPrev() {
    const timeline = travelData.days[targetDayIndex].timeline;
    let prevItem = null;
    
    // 유효한 이전 장소 찾기 (메모나 이동수단이 아닌 실제 장소)
    let searchIdx = -1;
    if (editingItemIndex !== null) {
        searchIdx = editingItemIndex - 1;
    } else {
        if (insertingItemIndex !== null && typeof insertingItemIndex === 'number') {
            searchIdx = insertingItemIndex;
        } else {
            searchIdx = timeline.length - 1;
        }
    }

    while (searchIdx >= 0) {
        const item = timeline[searchIdx];
        // 좌표가 있거나, 이동수단/메모가 아니면서 위치 정보가 있는 경우
        if ((item.lat && item.lng) || (!item.isTransit && item.tag !== '메모' && item.location && item.location !== '위치')) {
            prevItem = item;
            break;
        }
        searchIdx--;
    }

    if (!prevItem) {
        alert("이전 장소 정보를 찾을 수 없어 경로를 검색할 수 없습니다.");
        return;
    }

    let origin = "";
    if (prevItem.lat && prevItem.lng) {
        const lat = typeof prevItem.lat === 'function' ? prevItem.lat() : prevItem.lat;
        const lng = typeof prevItem.lng === 'function' ? prevItem.lng() : prevItem.lng;
        origin = `${lat},${lng}`;
    } else {
        origin = encodeURIComponent(prevItem.location || prevItem.title);
    }

    let destination = "";
    const currentLocVal = document.getElementById('item-location').value;
    
    if (tempItemCoords && tempItemCoords.lat && tempItemCoords.lng) {
        destination = `${tempItemCoords.lat},${tempItemCoords.lng}`;
    } else if (currentLocVal) {
        destination = encodeURIComponent(currentLocVal);
    } else {
        alert("도착지(현재 장소)를 입력하거나 검색해주세요.");
        return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=transit`;
    window.open(url, '_blank');
}

// [Manual Input Modal Logic]
let manualInputCallback = null;

export function openManualInputModal(initialValue, callback, title = "직접 입력", label = "장소명 / 위치") {
    manualInputCallback = callback;
    const input = document.getElementById('manual-input-value');
    input.value = initialValue || "";
    
    // 엔터 키 처리
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            confirmManualInput();
        }
    };

    const modal = document.getElementById('manual-input-modal');
    modal.querySelector('h3').innerText = title;
    modal.querySelector('label').innerText = label;

    document.getElementById('manual-input-modal').classList.remove('hidden');
    setTimeout(() => input.focus(), 100);
}

export function closeManualInputModal() {
    document.getElementById('manual-input-modal').classList.add('hidden');
    manualInputCallback = null;
}

export function confirmManualInput() {
    const input = document.getElementById('manual-input-value');
    const val = input.value.trim();
    
    if (!val) {
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 300);
        input.focus();
        return;
    }

    if (manualInputCallback) {
        manualInputCallback(val);
    }
    closeManualInputModal();
}

export function useManualInput(type) {
    let initialValue = "";
    if (type === 'item') {
        initialValue = document.getElementById('place-search').value;
    } else if (type === 'new-trip') {
        initialValue = document.getElementById('new-trip-location').value;
    }

    openManualInputModal(initialValue, (val) => {
        if (type === 'item') {
            if (searchMode === 'trip') {
                // 위치 설정 모드
                updateMeta('title', val);
                updateMeta('subInfo', val);
                renderItinerary();
                closeModal();
            } else {
                // 일정 추가/수정 모드
                document.getElementById('item-title').value = val;
                document.getElementById('item-location').value = val;
                document.getElementById('item-title').focus();
            }
        } else if (type === 'new-trip') {
            document.getElementById('new-trip-location').value = val;
            newTripDataTemp.locationName = val;
            newTripDataTemp.address = val;
            nextWizardStep(2);
        }
    });
}

export function addNoteItem(insertIndex) {
    let defaultTime = "오후 12:00";
    const timeline = travelData.days[targetDayIndex].timeline;
    
    let prevItem = null;
    if (insertIndex !== null && insertIndex !== -1) {
        prevItem = timeline[insertIndex];
    } else if (timeline.length > 0) {
        prevItem = timeline[timeline.length - 1];
    }

    if (prevItem) {
        const prevMinutes = parseTimeStr(prevItem.time);
        if (prevMinutes !== null) {
            defaultTime = formatTimeStr(prevMinutes + 10);
        }
    }

    openManualInputModal("", (val) => {
        const newItem = {
            time: defaultTime,
            title: val,
            location: "",
            icon: "sticky_note_2",
            tag: "메모",
            image: null,
            isTransit: false,
            note: ""
        };
        
        if (insertIndex !== null && insertIndex !== -1) {
            timeline.splice(insertIndex + 1, 0, newItem);
        } else {
            timeline.push(newItem);
        }
        
        renderItinerary();
        autoSave();
    }, "메모 추가", "메모 내용");
}

export function closeModal() {
    document.getElementById('item-modal').classList.add('hidden');
    setEditingItemIndex(null);
}

// 잔류 시간 설정 함수
export function setDuration(minutes) {
    const durationInput = document.getElementById('item-duration');
    if (durationInput) {
        durationInput.value = minutes;
    }
}

export async function saveNewItem() {
    const category = document.getElementById('item-category').dataset.value || 'custom';
    let icon = "place";
    
    // 카테고리별 아이콘 매핑
    const icons = {
        meal: "restaurant",
        transit: "train",
        culture: "museum",
        sightseeing: "photo_camera",
        shopping: "shopping_bag",
        accommodation: "hotel",
        custom: "star"
    };
    icon = icons[category] || "place";

    const categoryNames = {
        meal: "식사",
        culture: "문화",
        sightseeing: "관광",
        shopping: "쇼핑",
        accommodation: "숙소",
        custom: "기타"
    };

    const durationValue = document.getElementById('item-duration').value;
    const parsedDuration = parseInt(durationValue);
    
    const newItem = {
        time: document.getElementById('item-time').value,
        title: document.getElementById('item-title').value || "새 활동",
        location: document.getElementById('item-location').value || "위치",
        icon: icon,
        lat: tempItemCoords.lat,
        lng: tempItemCoords.lng,
        tag: categoryNames[category] || category.toUpperCase(),
        image: null,
        isTransit: category === 'transit',
        note: document.getElementById('item-notes').value,
        duration: (!isNaN(parsedDuration) && durationValue !== '') ? parsedDuration : 30 // 잔류 시간 (분)
    };
    
    // 일본어 주소가 있으면 함께 저장
    const jaLocationField = document.getElementById('item-location-ja');
    if (jaLocationField && jaLocationField.value) {
        newItem.locationJa = jaLocationField.value;
        
        // 국가 코드도 저장
        newItem.countryCode = 'JP';
        newItem.address_components = [{
            types: ['country'],
            short_name: 'JP'
        }];
    }

    const timeline = travelData.days[targetDayIndex].timeline;

    if (editingItemIndex !== null) {
        // 수정
        timeline[editingItemIndex] = newItem;
    } else {
        // 추가
        if (typeof insertingItemIndex === 'number' && insertingItemIndex !== null) {
            timeline.splice(insertingItemIndex + 1, 0, newItem);
        } else {
            timeline.push(newItem);
        }
    }

    // 수정 모드였는지 확인하기 위해 미리 저장 (closeModal()이 editingItemIndex를 초기화하므로)
    const wasEditingIndex = editingItemIndex;

    // [핵심] 재정렬 및 이동시간 계산
    reorderTimeline(targetDayIndex);

    closeModal();

    // 상세 페이지에서 수정을 시작했다면 다시 상세 페이지 열기
    if (wasEditingIndex !== null && isEditingFromDetail) {
        // 재정렬로 인해 인덱스가 변경되었을 수 있으므로, 객체 참조로 새 인덱스를 찾음
        const newIndex = travelData.days[targetDayIndex].timeline.indexOf(newItem);
        if (newIndex !== -1) {
            viewTimelineItem(newIndex);
        }
    }
    setIsEditingFromDetail(false); // 리셋

}

export function deleteTimelineItem(index, dayIndex = currentDayIndex) {
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline[index];
    
    // routeGroupId가 있는 경우 그룹 삭제 옵션 제공
    if (item.routeGroupId) {
        const groupItems = timeline.filter(t => t.routeGroupId === item.routeGroupId);
        
        if (groupItems.length > 1) {
            // 커스텀 모달 열기
            openDeleteConfirmModal(index, dayIndex, groupItems.length);
            return;
        } else {
            // 그룹에 1개만 있으면 일반 삭제
            Modals.openGeneralDeleteModal(index, dayIndex);
        }
    } else {
        // routeGroupId 없는 일반 항목
        Modals.openGeneralDeleteModal(index, dayIndex);
    }
}

// 삭제 확인 모달 관련 함수
let pendingDeleteIndex = null;
let pendingDeleteDayIndex = null;

export function openDeleteConfirmModal(index, dayIndex, groupCount) {
    pendingDeleteIndex = index;
    pendingDeleteDayIndex = dayIndex;
    
    const modal = document.getElementById('delete-confirm-modal');
    const message = document.getElementById('delete-confirm-message');
    const deleteSingleBtn = document.getElementById('delete-single-btn');
    const deleteGroupBtn = document.getElementById('delete-group-btn');
    
    message.textContent = `이 항목은 최적경로 검색으로 생성된 ${groupCount}개 이동 경로의 일부입니다. 전체 경로를 함께 삭제하시겠습니까?`;
    deleteGroupBtn.textContent = `전체 경로 삭제 (${groupCount}개)`;
    
    // 버튼 이벤트 리스너 설정
    deleteSingleBtn.onclick = () => {
        executeDelete(false);
        closeDeleteConfirmModal();
    };
    
    deleteGroupBtn.onclick = () => {
        executeDelete(true);
        closeDeleteConfirmModal();
    };
    
    modal.classList.remove('hidden');
}

export function closeDeleteConfirmModal() {
    const modal = document.getElementById('delete-confirm-modal');
    modal.classList.add('hidden');
    pendingDeleteIndex = null;
    pendingDeleteDayIndex = null;
}

// Transit Recalculate Modal
let transitRecalculateConfirmCallback = null;
let transitRecalculateCancelCallback = null;

export function showTransitRecalculateModal(time, onConfirm, onCancel) {
    const modal = document.getElementById('transit-recalculate-modal');
    const timeDisplay = document.getElementById('transit-time-display');
    
    timeDisplay.innerText = time;
    transitRecalculateConfirmCallback = onConfirm;
    transitRecalculateCancelCallback = onCancel;
    
    modal.classList.remove('hidden');
}

export function closeTransitRecalculateModal(shouldRecalculate) {
    const modal = document.getElementById('transit-recalculate-modal');
    modal.classList.add('hidden');
    
    if (shouldRecalculate && transitRecalculateConfirmCallback) {
        transitRecalculateConfirmCallback();
    } else if (!shouldRecalculate && transitRecalculateCancelCallback) {
        transitRecalculateCancelCallback();
    }
    
    transitRecalculateConfirmCallback = null;
    transitRecalculateCancelCallback = null;
}

function executeDelete(deleteGroup) {
    if (pendingDeleteIndex === null) return;
    
    setTargetDayIndex(pendingDeleteDayIndex);
    const timeline = travelData.days[targetDayIndex].timeline;
    const item = timeline[pendingDeleteIndex];
    
    if (deleteGroup && item.routeGroupId) {
        // 그룹 전체 삭제 (뒤에서부터 삭제하여 인덱스 꼬임 방지)
        for (let i = timeline.length - 1; i >= 0; i--) {
            if (timeline[i].routeGroupId === item.routeGroupId) {
                timeline.splice(i, 1);
            }
        }
    } else {
        // 이 항목만 삭제
        timeline.splice(pendingDeleteIndex, 1);
    }
    
    updateTotalBudget();
    renderItinerary();
    autoSave();
}

// [Attachment Logic]
export async function handleAttachmentUpload(input, type) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // 파일 크기 제한: 이미지 5MB, PDF 10MB
        const maxSize = file.type.startsWith('image/') ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            alert(`파일 크기는 ${file.type.startsWith('image/') ? '5MB' : '10MB'} 이하여야 합니다.`);
            input.value = "";
            return;
        }

        try {
            showLoading();
            
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                try {
                    const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
                    if (!item.attachments) item.attachments = [];
                    
                    let fileUrl = null;
                    
                    // Cloud Functions를 통해 Storage에 업로드
                    const timestamp = Date.now();
                    const fileExtension = file.name.split('.').pop();
                    const fileName = `attachment_${targetDayIndex}_${viewingItemIndex}_${timestamp}.${fileExtension}`;
                    
                    const response = await fetch(`${BACKEND_URL}/upload-attachment`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            base64Data: e.target.result,
                            fileName: fileName,
                            tripId: currentTripId,
                            fileType: file.type
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || '업로드 실패');
                    }

                    const result = await response.json();
                    fileUrl = result.url;
                    
                    item.attachments.push({
                        name: file.name,
                        type: file.type,
                        url: fileUrl // URL로 저장
                    });
                    
                    const containerId = type === 'transit' ? 'transit-attachment-list' : 'detail-attachment-list';
                    renderAttachments(item, containerId);
                    await autoSave();
                    input.value = ""; // Reset input
                    
                    hideLoading();
                } catch (error) {
                    console.error("첨부파일 업로드 실패:", error);
                    alert('첨부파일 업로드에 실패했습니다: ' + error.message);
                    hideLoading();
                }
            };
            
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("파일 읽기 실패:", error);
            alert('파일 읽기에 실패했습니다: ' + error.message);
            input.value = "";
            hideLoading();
        }
    }
}

export function renderAttachments(item, containerId) {
    return Renderers.renderAttachments(item, containerId);
}

export async function deleteAttachment(index, containerId) {
    if (confirm("파일을 삭제하시겠습니까?")) {
        const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
        item.attachments.splice(index, 1);
        renderAttachments(item, containerId);
        await autoSave();
    }
}

export function openAttachment(data, type) {
    const win = window.open();
    if (type.startsWith('image/')) {
        win.document.write(`<img src="${data}" style="max-width:100%">`);
    } else {
        // PDF의 경우 iframe으로 열기
        win.document.write(`<iframe src="${data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
    }
}

export async function handleImageUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        if (file.size > 5 * 1024 * 1024) {
            alert("파일 크기는 5MB 이하여야 합니다.");
            input.value = "";
            return;
        }

        try {
            Modals.showLoading();
            
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                try {
                    const timestamp = Date.now();
                    const fileExtension = file.name.split('.').pop();
                    const fileName = `hero_${currentTripId}_${timestamp}.${fileExtension}`;
                    
                    const response = await fetch(`${BACKEND_URL}/upload-attachment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            base64Data: e.target.result,
                            fileName: fileName,
                            tripId: currentTripId,
                            fileType: file.type
                        })
                    });

                    if (!response.ok) throw new Error('Upload failed');
                    
                    const result = await response.json();
                    updateMeta('mapImage', result.url);
                    
                    input.value = "";
                } catch (error) {
                    console.error("Image upload failed:", error);
                    alert("이미지 업로드에 실패했습니다.");
                } finally {
                    Modals.hideLoading();
                }
            };
            
            reader.readAsDataURL(file);
        } catch (e) {
            console.error(e);
            Modals.hideLoading();
        }
    }
}

// [Route View Logic]
let routeMap = null;
let routePolyline = null;
let routeMarkers = [];
let routePopup = null;

export async function openRouteModal() {
    const modal = document.getElementById('route-modal');
    modal.classList.remove('hidden');

    const container = document.getElementById('route-map-container');
    
    // 지도 초기화 (최초 1회)
    if (!routeMap && window.mapboxgl) {
        routeMap = new mapboxgl.Map({
            container: container,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [126.9780, 37.5665],
            zoom: 10,
            attributionControl: false
        });
    }

    if (!routeMap) return;

    const timeline = travelData.days[currentDayIndex].timeline;
    const bounds = new google.maps.LatLngBounds();
    const path = [];
    const geocoder = new google.maps.Geocoder();
    let lastPlacePos = null;
    let transitBuffer = [];

    // [Modified] 지도 스타일 로드 대기 후 레이어 조작
    const updateMapLayer = () => {
        if (!routeMap.getStyle()) return; // 스타일이 없으면 중단

        // 기존 마커 및 경로 제거
        if (routeMap.getSource('route-path')) {
            routeMap.getSource('route-path').setData({ type: 'FeatureCollection', features: [] });
        }
        routeMarkers.forEach(m => m.remove());
        routeMarkers = [];
        if (routePopup) routePopup.remove();

        // 경로 그리기 로직은 데이터 처리가 끝난 후(아래) 호출됨
    };

    if (routeMap.loaded()) updateMapLayer();
    else routeMap.once('load', updateMapLayer);

    // 좌표 가져오기 헬퍼 (저장된 좌표가 없으면 주소로 검색)
    const getPoint = async (item) => {
        if (item.lat && item.lng) {
            return { lat: Number(item.lat), lng: Number(item.lng) };
        }
        // 이동수단이 아니고 위치 정보가 유효한 경우
        if (item.location && item.location.length > 1 && !item.isTransit && item.location !== "위치") {
            return new Promise((resolve) => {
                geocoder.geocode({ address: item.location }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        resolve(results[0].geometry.location);
                    } else {
                        resolve(null);
                    }
                });
            });
        }
        return null;
    };

    // 순차적으로 좌표 처리 및 마커 생성
    for (let i = 0; i < timeline.length; i++) {
        const item = timeline[i];
        
        if (item.isTransit) {
            transitBuffer.push(item);
            continue;
        }

        try {
            const pos = await getPoint(item);
            if (pos) {
                const lngLat = [pos.lng, pos.lat]; // Mapbox uses [lng, lat]
                path.push(lngLat);
                bounds.extend(lngLat);

                // 장소 마커 생성
                const el = document.createElement('div');
                el.className = 'w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-bold shadow-lg border-2 border-white';
                el.innerText = path.length.toString();

                const marker = new mapboxgl.Marker(el)
                    .setLngLat(lngLat)
                    .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                        <div class="p-2">
                            <h4 class="font-bold text-sm mb-1">${item.title}</h4>
                            <p class="text-xs text-gray-500 mb-2">${item.location}</p>
                            <span class="inline-block bg-purple-50 text-purple-700 border border-purple-100 text-xs font-bold px-2 py-0.5 rounded">${item.time}</span>
                        </div>
                    `))
                    .addTo(routeMap);

                routeMarkers.push(marker);

                // 이전 장소와 현재 장소 사이에 이동수단이 있었다면 중간 지점에 마커 표시
                if (lastPlacePos && transitBuffer.length > 0) {
                    const count = transitBuffer.length;
                    for (let j = 0; j < count; j++) {
                        const tItem = transitBuffer[j];
                        const fraction = (j + 1) / (count + 1);
                        
                        // 선형 보간 (Linear Interpolation)
                        const lat = lastPlacePos.lat + (pos.lat - lastPlacePos.lat) * fraction;
                        const lng = lastPlacePos.lng + (pos.lng - lastPlacePos.lng) * fraction;
                        const transitPos = [lng, lat];

                        const tEl = document.createElement('div');
                        tEl.className = 'w-6 h-6 bg-white text-purple-700 rounded-full flex items-center justify-center shadow-md border border-purple-700';
                        tEl.innerHTML = `<span class="material-symbols-outlined text-[16px]">${tItem.icon}</span>`;

                        const tMarker = new mapboxgl.Marker(tEl)
                            .setLngLat(transitPos)
                            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`
                                <div class="p-2 min-w-[150px]">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="material-symbols-outlined text-primary">${tItem.icon}</span>
                                        <h4 class="font-bold text-sm text-gray-900">${tItem.title}</h4>
                                    </div>
                                    ${tItem.time ? `<span class="inline-block bg-blue-50 text-blue-700 border border-blue-100 text-xs font-bold px-2 py-0.5 rounded mt-1">${tItem.time}</span>` : ''}
                                    ${tItem.note ? `<p class="text-xs text-gray-500 mt-1">📝 ${tItem.note}</p>` : ''}
                                </div>
                            `))
                            .addTo(routeMap);

                        routeMarkers.push(tMarker);
                    }
                }

                lastPlacePos = pos;
                transitBuffer = []; // 버퍼 초기화
            }
        } catch (e) {
            console.error("Route processing error:", e);
        }
    }

    // 경로 그리기
    if (path.length > 0) {
        routePolyline = new google.maps.Polyline({
            path: path,
            geodesic: true,
            strokeColor: '#774b00',
            strokeOpacity: 0.8,
            strokeWeight: 5
        });
        routePolyline.setMap(routeMap);
        routeMap.fitBounds(bounds);

    } else if (travelData.meta.lat && travelData.meta.lng) {
        // 경로가 없으면 여행지 중심으로 이동
        routeMap.setCenter({ lat: Number(travelData.meta.lat), lng: Number(travelData.meta.lng) });
        routeMap.setZoom(12);
    }

    // 모달이 뜬 직후 지도 리사이즈 트리거 (깨짐 방지)
    setTimeout(() => {
        google.maps.event.trigger(routeMap, 'resize');
    }, 100);
}

export function closeRouteModal() {
    document.getElementById('route-modal').classList.add('hidden');
}

// 화면 아무곳이나 클릭하면 열린 메뉴 닫기
window.addEventListener('click', (e) => {
    // 메뉴 버튼이나 메뉴 내부를 클릭한 경우는 제외
    if (!e.target.closest('[id^="trip-menu-"]') && !e.target.closest('button[onclick*="toggleTripMenu"]')) {
        document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));
    }
});

// [State & UI Sync Functions]
export function updateMeta(key, value) {
    updateMetaState(key, value);
    renderItinerary();
    autoSave();
}

export function updateTripDate(dayIndex, newDate) {
    updateTripDateState(dayIndex, newDate);
    // 날씨 업데이트 (map.js의 fetchWeather가 window에 있다면 호출)
    if (window.fetchWeather && travelData.meta.lat && travelData.meta.lng) {
        window.fetchWeather(travelData.meta.lat, travelData.meta.lng, newDate);
    }
    renderItinerary();
    autoSave();
}

export function updateTimeline(dayIndex, itemIndex, key, value) {
    updateTimelineItemState(dayIndex, itemIndex, key, value);
    renderItinerary();
    autoSave();
}

export function updateDateRange() {
    const startStr = document.getElementById('edit-start-date').value;
    const endStr = document.getElementById('edit-end-date').value;
    
    if (!startStr || !endStr) return;
    
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    if (end < start) {
        alert("종료일은 시작일보다 빠를 수 없습니다.");
        return;
    }

    // 기간 업데이트
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const durationText = (diffDays === 0) ? "당일치기" : `${diffDays}박 ${diffDays + 1}일`;
    updateMetaState('dayCount', durationText);
    
    // 날짜 텍스트 업데이트
    const format = d => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    let dateStr = format(start);
    if (durationText !== "당일치기") {
        dateStr += ` - ${end.getMonth() + 1}월 ${end.getDate()}일`;
    }
    
    // 기존 subInfo의 앞부분(위치 등) 유지
    let prefix = "";
    if (travelData.meta.subInfo && travelData.meta.subInfo.includes('•')) {
        prefix = travelData.meta.subInfo.split('•')[0].trim();
    }
    updateMetaState('subInfo', prefix ? `${prefix} • ${dateStr}` : dateStr);

    // Days 배열 재구성
    const totalDays = diffDays + 1;
    const currentTotalDays = travelData.days.length;
    
    if (totalDays > currentTotalDays) {
        for (let i = currentTotalDays; i < totalDays; i++) {
            travelData.days.push({ date: "", timeline: [] });
        }
    } else if (totalDays < currentTotalDays) {
        if(!confirm("기간을 줄이면 일부 일정이 삭제될 수 있습니다. 계속하시겠습니까?")) {
            renderItinerary(); // 입력값 원복을 위해 재렌더링
            return;
        }
        travelData.days.splice(totalDays);
    }

    // 날짜 값 갱신
    travelData.days.forEach((day, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        day.date = d.toISOString().split('T')[0];
    });

    renderItinerary();
    autoSave();
}

// [Memory Logic]
export const getTripStatus = Memories.getTripStatus;
export const addMemoryItem = Memories.addMemoryItem;
export const closeMemoryModal = Memories.closeMemoryModal;
export const handleMemoryPhotoChange = Memories.handleMemoryPhotoChange;
export const clearMemoryPhoto = Memories.clearMemoryPhoto;
export const saveMemoryItem = Memories.saveMemoryItem;
export const deleteMemory = Memories.deleteMemory;
export const toggleMemoryLock = Memories.toggleMemoryLock;

// Window assignments
window.loadTripList = loadTripList;
window.openTrip = openTrip;
window.checkInviteLink = checkInviteLink;
window.createNewTrip = createNewTrip;
window.closeNewTripModal = closeNewTripModal;
window.nextWizardStep = nextWizardStep;
window.finishNewTripWizard = finishNewTripWizard;
window.deleteTrip = deleteTrip;
window.closeDeleteTripModal = closeDeleteTripModal;
window.confirmDeleteTrip = confirmDeleteTrip;
window.toggleTripMenu = toggleTripMenu;
window.backToMain = backToMain;
window.addMemoryItem = addMemoryItem;
window.closeMemoryModal = closeMemoryModal;
window.handleMemoryPhotoChange = handleMemoryPhotoChange;
window.clearMemoryPhoto = clearMemoryPhoto;
window.saveMemoryItem = saveMemoryItem;
window.deleteMemory = deleteMemory;
window.toggleMemoryLock = toggleMemoryLock;
window.login = Auth.login;
window.logout = Auth.logout;
window.openLogoutModal = Auth.openLogoutModal;
window.closeLogoutModal = Auth.closeLogoutModal;
window.confirmLogout = Auth.confirmLogout;
window.initAuthStateObserver = Auth.initAuthStateObserver;
window.updateMeta = updateMeta;
window.updateTimeline = updateTimeline;
window.updateTripDate = updateTripDate;
window.updateDateRange = updateDateRange;
window.handleImageUpload = handleImageUpload;
window.dragStart = dragStart;
window.dragEnd = dragEnd;
window.dragOver = dragOver;
window.drop = drop;
window.selectDay = selectDay;
window.viewTimelineItem = viewTimelineItem;
window.closeDetailModal = closeDetailModal;
window.renderItinerary = renderItinerary;
window.renderLists = renderLists;
window.renderAttachments = renderAttachments;
window.updateItemNote = updateItemNote;
window.openShareModal = Header.openShareModal;
window.closeShareModal = Header.closeShareModal;
window.downloadTripAsPDF = Header.downloadTripAsPDF;
window.copyShareLink = Header.copyShareLink;
window.enableNoteEdit = Header.enableNoteEdit;
window.addListItem = addListItem;
window.toggleListCheck = toggleListCheck;
window.deleteListItem = deleteListItem;
window.openShoppingAddModal = openShoppingAddModal;
window.closeShoppingAddModal = closeShoppingAddModal;
window.confirmShoppingAdd = confirmShoppingAdd;
window.selectShoppingLocation = selectShoppingLocation;
window.skipShoppingLocation = skipShoppingLocation;
window.openExpenseModal = Modals.openExpenseModal;
window.closeExpenseModal = Modals.closeExpenseModal;
window.saveExpense = Modals.saveExpense;
window.deleteExpense = deleteExpense;
window.openShoppingListSelector = Modals.openShoppingListSelector;
window.closeShoppingListSelector = Modals.closeShoppingListSelector;
window.selectShoppingItem = Modals.selectShoppingItem;
// window.selectedShoppingItemIndex = null; // Removed (Moved to modals.js)
window.lastExpenseLocation = null; // 마지막 지출 장소 추적
window.openGoogleMapsExternal = openGoogleMapsExternal;
window.openTimeModal = openTimeModal;
window.closeTimeModal = closeTimeModal;
window.confirmTimeSelection = confirmTimeSelection;
window.openCategoryModal = openCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.selectCategory = selectCategory;
window.openManualInputModal = openManualInputModal;
window.closeManualInputModal = closeManualInputModal;
window.confirmManualInput = confirmManualInput;
window.dragLeave = dragLeave;
window.timelineContainerDrop = timelineContainerDrop;
window.touchStart = touchStart;
window.touchMove = touchMove;
window.touchEnd = touchEnd;
window.openAddModal = openAddModal;
window.closeAddModal = closeAddModal;
window.reorderTimeline = reorderTimeline;
window.selectAddType = Modals.selectAddType;
window.openLocationSearch = openLocationSearch;
window.addTimelineItem = addTimelineItem;
window.editTimelineItem = editTimelineItem;
window.closeModal = closeModal;
window.setDuration = setDuration;
window.addNoteItem = addNoteItem;
window.saveNewItem = saveNewItem;
window.deleteTimelineItem = deleteTimelineItem;
window.closeDeleteConfirmModal = closeDeleteConfirmModal;
window.useManualInput = useManualInput;
window.openGeneralDeleteModal = Modals.openGeneralDeleteModal;
window.closeGeneralDeleteModal = Modals.closeGeneralDeleteModal;
window.confirmGeneralDelete = Modals.confirmGeneralDelete;
window.openUserMenu = Profile.openUserMenu;
window.openUserSettings = Profile.openUserSettings;
window.openUserProfile = Profile.openUserProfile;
window.closeProfileView = Profile.closeProfileView;
window.handleProfilePhotoChange = Profile.handleProfilePhotoChange;
window.saveProfileChanges = Profile.saveProfileChanges;
window.openTripInfoModal = Header.openTripInfoModal;
window.closeTripInfoModal = closeTripInfoModal;
window.saveTripInfo = saveTripInfo;
window.resetHeroImage = resetHeroImage;
window.deleteHeroImage = deleteHeroImage;
window.openRouteModal = openRouteModal;
window.closeRouteModal = closeRouteModal;
window.closeMemoModal = Modals.closeMemoModal;
window.editCurrentMemo = Modals.editCurrentMemo;
window.editCurrentItem = editCurrentItem;
window.deleteCurrentItem = deleteCurrentItem;
window.saveCurrentMemo = Modals.saveCurrentMemo;
window.openCopyItemModal = openCopyItemModal;
window.closeCopyItemModal = closeCopyItemModal;
window.copyItemToCurrent = copyItemToCurrent;
window.handleAttachmentUpload = handleAttachmentUpload;
window.renderExpenseList = renderExpenseList; // [Added] modals.js에서 호출할 수 있도록 노출
window.deleteAttachment = deleteAttachment;
window.openAttachment = openAttachment;
window.openExpenseDetailModal = openExpenseDetailModal;
window.closeExpenseDetailModal = closeExpenseDetailModal;
window.openLightbox = Modals.openLightbox;
window.closeLightbox = Modals.closeLightbox;
window.autoSave = autoSave; // [Fix] 순환 참조 해결을 위한 전역 할당 추가

// 지출 상세 모달
export function openExpenseDetailModal() {
    const modal = document.getElementById('expense-detail-modal');
    
    // 전체 지출 계산
    let totalExpense = 0;
    const expensesByDay = [];
    
    if (travelData.days) {
        travelData.days.forEach((day, dayIdx) => {
            let dayTotal = 0;
            const dayExpenses = [];
            
            if (day.timeline) {
                day.timeline.forEach((item, itemIdx) => {
                    // budget 필드
                    if (item.budget) {
                        const amount = Number(item.budget);
                        dayTotal += amount;
                        dayExpenses.push({
                            title: item.title,
                            description: '예산',
                            amount: amount
                        });
                    }
                    
                    // expenses 배열
                    if (item.expenses && Array.isArray(item.expenses)) {
                        item.expenses.forEach(exp => {
                            const amount = Number(exp.amount || 0);
                            if (amount > 0) { // 0원 더미 데이터 제외
                                dayTotal += amount;
                                
                                // 이동수단인 경우 출발지->도착지 붙이기
                                let displayTitle = item.title;
                                if (item.isTransit) {
                                    const prevItem = itemIdx > 0 ? day.timeline[itemIdx - 1] : null;
                                    const nextItem = itemIdx < day.timeline.length - 1 ? day.timeline[itemIdx + 1] : null;
                                    const from = prevItem && !prevItem.isTransit ? prevItem.title : '출발지';
                                    const to = nextItem && !nextItem.isTransit ? nextItem.title : '도착지';
                                    displayTitle = `${item.title} (${from}→${to})`;
                                }
                                
                                dayExpenses.push({
                                    title: displayTitle,
                                    description: exp.description,
                                    amount: amount
                                });
                            }
                        });
                    }
                });
            }
            
            if (dayTotal > 0) {
                expensesByDay.push({
                    date: day.date,
                    total: dayTotal,
                    expenses: dayExpenses
                });
            }
            
            totalExpense += dayTotal;
        });
    }
    
    // 전체 금액 표시
    document.getElementById('total-expense-amount').textContent = `₩${totalExpense.toLocaleString()}`;
    
    // 일자별 지출 표시
    const dayListEl = document.getElementById('expense-by-day-list');
    if (expensesByDay.length === 0) {
        dayListEl.innerHTML = '<p class="text-center text-gray-400 py-8">지출 내역이 없습니다</p>';
    } else {
        dayListEl.innerHTML = expensesByDay.map((dayData, idx) => `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                <div class="flex justify-between items-center mb-3">
                    <h5 class="font-bold text-gray-800 dark:text-white">${dayData.date}</h5>
                    <p class="text-lg font-bold text-primary">₩${dayData.total.toLocaleString()}</p>
                </div>
                <div class="space-y-2">
                    ${dayData.expenses.map(exp => `
                        <div class="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-900 p-2 rounded-lg">
                            <div class="flex-1 min-w-0">
                                <p class="font-medium text-gray-700 dark:text-gray-300 truncate">${exp.title}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400">${exp.description}</p>
                            </div>
                            <p class="font-bold text-gray-800 dark:text-white ml-2">₩${exp.amount.toLocaleString()}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
    
    // N분의 1 결과 숨기기
    const splitResult = document.getElementById('split-result');
    const splitInput = document.getElementById('split-people-count');
    if (splitResult && splitInput) {
        splitResult.classList.add('hidden');
        splitInput.value = '1';
    }
    
    modal.classList.remove('hidden');
}

export function closeExpenseDetailModal() {
    document.getElementById('expense-detail-modal').classList.add('hidden');
}

export function calculateSplit() {
    const peopleCount = Number(document.getElementById('split-people-count').value);
    if (!peopleCount || peopleCount < 1) {
        alert('인원 수를 입력해주세요.');
        return;
    }
    
    const totalText = document.getElementById('total-expense-amount').textContent;
    const total = Number(totalText.replace(/[^0-9]/g, ''));
    const perPerson = Math.ceil(total / peopleCount);
    
    document.getElementById('per-person-amount').textContent = `₩${perPerson.toLocaleString()}`;
    document.getElementById('split-result').classList.remove('hidden');
}

window.calculateSplit = calculateSplit;

// [Context Menu Logic]
let contextMenuTargetIndex = null;
let contextMenuType = null;

export function openContextMenu(e, type, index, dayIndex = currentDayIndex) {
    e.preventDefault();
    contextMenuTargetIndex = index;
    contextMenuType = type;
    setTargetDayIndex(dayIndex); // 컨텍스트 메뉴 열 때 타겟 날짜 설정

    const menu = document.getElementById('context-menu');
    let html = '';

    if (type === 'item') {
        html = `
            <button onclick="handleContextAction('edit')" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg text-primary">edit</span> 수정
            </button>
            <button onclick="handleContextAction('delete')" class="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg">delete</span> 삭제
            </button>
        `;
    } else if (type === 'hero') {
        html = `
            <button onclick="handleContextAction('change_hero')" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg text-primary">add_a_photo</span> 이미지 변경
            </button>
            <button onclick="handleContextAction('reset_hero')" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg text-blue-600">restart_alt</span> 초기 이미지로 복구
            </button>
            <button onclick="handleContextAction('delete_hero')" class="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg">delete</span> 이미지 삭제
            </button>
        `;
    } else if (type === 'trip_info') {
        html = `
            <button onclick="handleContextAction('edit_trip_info')" class="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                <span class="material-symbols-outlined text-lg text-primary">edit_square</span> 정보 수정
            </button>
        `;
    }

    menu.innerHTML = html;
    menu.classList.remove('hidden');
    
    // 위치 계산 (화면 밖으로 나가지 않도록)
    let x = e.clientX;
    let y = e.clientY;
    
    const menuWidth = 160;
    const menuHeight = type === 'item' ? 88 : 88; // 대략적인 높이

    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y -= menuHeight;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

export function closeContextMenu() {
    const menu = document.getElementById('context-menu');
    if (!menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
}

export function handleContextAction(action) {
    closeContextMenu();
    
    if (action === 'edit') {
        setIsEditingFromDetail(false);
        editTimelineItem(contextMenuTargetIndex, targetDayIndex);
    } else if (action === 'delete') {
        deleteTimelineItem(contextMenuTargetIndex, targetDayIndex);
    } else if (action === 'change_hero') {
        document.getElementById('hero-image-upload').click();
    } else if (action === 'reset_hero') {
        resetHeroImage();
    } else if (action === 'delete_hero') {
        deleteHeroImage();
    } else if (action === 'edit_trip_info') {
        openTripInfoModal();
    }
}

// 전역 클릭 시 컨텍스트 메뉴 닫기
window.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) {
        closeContextMenu();
    }
});

window.openContextMenu = openContextMenu;
window.handleContextAction = handleContextAction;

// [Weather Detail Modal - 주간 날씨 캘린더]
let currentWeatherWeekStart = null;
let selectedWeatherDate = null;
let weeklyWeatherData = null;

export async function openWeatherDetailModal() {
    const modal = document.getElementById('weather-detail-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    
    // 여행 시작일 기준으로 주 시작일 설정
    if (travelData.days && travelData.days.length > 0) {
        const firstDate = new Date(travelData.days[0].date);
        currentWeatherWeekStart = getWeekStart(firstDate);
        selectedWeatherDate = formatDate(firstDate);
    } else {
        // 여행 데이터가 없으면 오늘 기준
        const today = new Date();
        currentWeatherWeekStart = getWeekStart(today);
        selectedWeatherDate = formatDate(today);
    }
    
    // 주간 날씨 데이터 로드 및 렌더링
    await loadAndRenderWeeklyWeather();
}

async function loadAndRenderWeeklyWeather() {
    const location = travelData.meta.title || '위치 정보 없음';
    document.getElementById('weather-location-title').textContent = location;
    
    if (!travelData.meta.lat || !travelData.meta.lng) {
        document.getElementById('weekly-weather-container').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p>위치 정보가 없어 날씨를 표시할 수 없습니다.</p>
            </div>
        `;
        return;
    }
    
    // 주간 날씨 데이터 가져오기 (7일)
    try {
        weeklyWeatherData = await fetchWeeklyWeather(travelData.meta.lat, travelData.meta.lng, currentWeatherWeekStart);
        renderWeeklyWeather();
        
        // 선택된 날짜의 시간별 예보 표시
        await loadAndRenderHourlyWeather(selectedWeatherDate);
    } catch (e) {
        console.error('Failed to load weekly weather:', e);
        document.getElementById('weekly-weather-container').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p>날씨 정보를 불러오는 중 오류가 발생했습니다.</p>
            </div>
        `;
    }
}

function renderWeeklyWeather() {
    const container = document.getElementById('weekly-weather-container');
    if (!container || !weeklyWeatherData) return;
    
    // 주 헤더 (년월 + 네비게이션)
    const weekStartDate = new Date(currentWeatherWeekStart);
    const yearMonth = `${weekStartDate.getFullYear()}년 ${weekStartDate.getMonth() + 1}월`;
    
    let html = `
        <div class="flex items-center justify-between mb-6">
            <button onclick="navigateWeatherWeek(-1)" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <h3 class="text-lg font-bold text-text-main dark:text-white">${yearMonth}</h3>
            <button onclick="navigateWeatherWeek(1)" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                <span class="material-symbols-outlined">chevron_right</span>
            </button>
        </div>
        
        <div class="grid grid-cols-7 gap-2">
    `;
    
    // 여행 기간 확인
    const tripDates = new Set();
    if (travelData.days) {
        travelData.days.forEach(day => tripDates.add(day.date));
    }
    
    // 7일 날씨 카드
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(currentWeatherWeekStart);
        date.setDate(date.getDate() + i);
        const dateStr = formatDate(date);
        const dayName = dayNames[date.getDay()];
        
        const dayData = weeklyWeatherData.find(d => d.date === dateStr);
        const isTripDay = tripDates.has(dateStr);
        const isSelected = dateStr === selectedWeatherDate;
        const isAvailable = dayData && dayData.available;
        
        const cardClass = isSelected 
            ? 'bg-primary text-white' 
            : (isTripDay 
                ? 'bg-orange-50 dark:bg-orange-900/20 border-2 border-primary' 
                : 'bg-card-light dark:bg-card-dark border border-gray-200 dark:border-gray-700');
        
        const textClass = isSelected 
            ? 'text-white' 
            : (isAvailable 
                ? 'text-text-main dark:text-white' 
                : 'text-gray-400');
        
        html += `
            <button 
                onclick="selectWeatherDate('${dateStr}')" 
                class="${cardClass} p-3 rounded-xl text-center cursor-pointer hover:shadow-lg transition-all ${!isAvailable ? 'opacity-50' : ''}">
                <p class="text-xs ${textClass} mb-1">${dayName}</p>
                <p class="text-sm font-bold ${textClass} mb-2">${date.getDate()}</p>
                ${isAvailable && dayData ? `
                    <span class="material-symbols-outlined text-xl ${isSelected ? 'text-white' : 'text-primary'}">${dayData.icon}</span>
                    <p class="text-xs ${textClass} mt-1">${dayData.maxTemp}°</p>
                    <p class="text-xs ${textClass}">${dayData.minTemp}°</p>
                ` : `
                    <span class="material-symbols-outlined text-xl text-gray-400">help</span>
                    <p class="text-xs text-gray-400 mt-1">--</p>
                `}
            </button>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

async function loadAndRenderHourlyWeather(dateStr) {
    const container = document.getElementById('hourly-weather-container');
    if (!container) return;
    
    const selectedDate = new Date(dateStr);
    const dateDisplay = `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`;
    
    document.getElementById('selected-date-title').textContent = dateDisplay;
    
    try {
        const hourlyData = await fetchHourlyWeatherForDate(
            travelData.meta.lat, 
            travelData.meta.lng, 
            dateStr
        );
        
        if (hourlyData && hourlyData.length > 0) {
            let html = '';
            
            hourlyData.forEach(hour => {
                const tempColor = hour.temp >= 25 ? 'text-red-500' : (hour.temp <= 10 ? 'text-blue-500' : 'text-text-main dark:text-white');
                
                html += `
                    <div class="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <div class="flex items-center gap-4 flex-1">
                            <p class="text-sm text-gray-600 dark:text-gray-400 w-16">${hour.time}</p>
                            <span class="material-symbols-outlined text-2xl text-primary">${hour.icon}</span>
                            <p class="text-sm text-gray-600 dark:text-gray-400 flex-1">${hour.weatherDesc}</p>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right">
                                <p class="text-xs text-gray-400">강수</p>
                                <p class="text-sm text-blue-500">${hour.precipitation}%</p>
                            </div>
                            <div class="text-right">
                                <p class="text-xs text-gray-400">습도</p>
                                <p class="text-sm text-gray-600 dark:text-gray-400">${hour.humidity}%</p>
                            </div>
                            <p class="text-xl font-bold ${tempColor} w-16 text-right">${hour.temp}°</p>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <p class="text-sm">해당 날짜의 시간별 예보가 없습니다.</p>
                </div>
            `;
        }
    } catch (e) {
        console.error('Failed to load hourly weather:', e);
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p class="text-sm">시간별 예보를 불러오는 중 오류가 발생했습니다.</p>
            </div>
        `;
    }
}

export async function selectWeatherDate(dateStr) {
    selectedWeatherDate = dateStr;
    renderWeeklyWeather();
    await loadAndRenderHourlyWeather(dateStr);
}

export function openCopyItemModal(...args) { return Modals.openCopyItemModal(...args); }
export function closeCopyItemModal(...args) { return Modals.closeCopyItemModal(...args); }
export function copyItemToCurrent(...args) { return Modals.copyItemToCurrent(...args); }

export async function navigateWeatherWeek(direction) {
    const weekStart = new Date(currentWeatherWeekStart);
    weekStart.setDate(weekStart.getDate() + (direction * 7));
    currentWeatherWeekStart = formatDate(weekStart);
    
    await loadAndRenderWeeklyWeather();
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day; // 일요일 기준
    d.setDate(d.getDate() - diff);
    return formatDate(d);
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function closeWeatherDetailModal() {
    const modal = document.getElementById('weather-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

window.openWeatherDetailModal = openWeatherDetailModal;
window.closeWeatherDetailModal = closeWeatherDetailModal;
window.selectWeatherDate = selectWeatherDate;
window.navigateWeatherWeek = navigateWeatherWeek;