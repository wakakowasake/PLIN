/**
 * ui-timeline.js
 * 
 * 역할: 일정(Timeline) 추가/수정/삭제/이동/정렬/계산에 관련된 모든 함수 관리
 * 
 * 분리 이유:
 * - ui.js (3,942줄)가 너무 크므로 기능별로 모듈화
 * - 일정 CRUD는 가장 자주 사용되는 핵심 기능
 * - React 마이그레이션 시 Timeline 컴포넌트로 직접 변환 가능
 * 
 * 관리 함수:
 * - addTimelineItem(insertIndex, dayIndex)
 * - editTimelineItem(index, dayIndex)
 * - deleteTimelineItem(index, dayIndex)
 * - moveTimelineItem(fromIndex, targetIndex, dayIndex)
 * - reorderTimeline(dayIndex, sortByTime)
 * - recalculateTimeline(dayIndex)
 * - viewTimelineItem(index, dayIndex)
 * - editCurrentItem()
 * - deleteCurrentItem()
 * - 기타 모달 및 헬퍼 함수
 */

import { db, auth, provider, firebaseReady } from '../firebase.js';
import {
    setTravelData, setTargetDayIndex, setEditingItemIndex, setViewingItemIndex,
    setInsertingItemIndex, setIsEditingFromDetail,
    state, setUiState, uiState
} from '../state.js';
import { parseTimeStr, formatTimeStr, parseDurationStr, formatDuration, minutesTo24Hour } from '../ui-utils.js';
import {
    getDefaultTimelineStartTime,
    getTimelineItemCategoryCode,
    recalculateTimelineItems
} from '../features/timeline/timeline-item-helpers.js';
import {
    closeDeleteConfirmModalFlow,
    closeTransitRecalculateModalFlow,
    getPendingDeleteContext,
    openDeleteConfirmModalFlow,
    showTransitRecalculateModalFlow
} from '../features/timeline/timeline-delete-flow.js';
import {
    buildPlanBPayload,
    isPlanBAttachableTimelineItem,
    normalizePlanBForForm,
    resolvePlanBAnchorIndex,
    resolveTimelineDayIndex
} from '../features/timeline/day-branch-flow.js';
import {
    addNoteItemFlow,
    closeManualInputModalFlow,
    confirmManualInputFlow,
    openManualInputModalFlow,
    useManualInputFlow
} from '../features/timeline/manual-item-flow.js';

// 🔵 [React Migration] 의존성 주입(DI): ui-timeline.js이 window 함수들을 호출하는데,
// 이를 injectedHandlers로 변경하여 React 전환 시 props로 전달 가능하게
let injectedHandlers = {
    categoryList: [],
    isGlobalEditMode: false,
    getIsGlobalEditMode: null,
    getMapsApiKey: null,
    renderItinerary: null,
    autoSave: null,
    renderExpenseList: null,
    renderAttachments: null,
    pushModalState: null,
    lockBodyScroll: null,
    popModalState: null,
    unlockBodyScroll: null,
    closeDetailModal: null,
    updateTotalBudget: null,
    viewRouteDetail: null
};

export function injectTimelineHandlers(handlers) {
    injectedHandlers = Object.assign(injectedHandlers, handlers);
}

import { setSearchMode } from '../map.js';
import * as Modals from './modals.js';
import * as TimelineDetail from './timeline-detail.js';
import * as Memories from './memories.js';
import * as DnD from './dnd.js';
import { setupItemAutocomplete } from './trip-info.js';
import { tempItemCoords } from './trip-info.js';
import {
    createDayPlanBranch,
    deleteDayPlanBranch,
    ensureDayPlanBranchState,
    getDayActivePlan,
    getDayPlanCodes,
    switchDayPlan as switchDayPlanBranch
} from './plan-branches.js';

// 편의성 getter 함수들
const getTravelData = () => state.get('travelData');
const getCurrentDayIndex = () => state.get('currentDayIndex');
const getTargetDayIndex = () => state.get('targetDayIndex');
const getEditingItemIndex = () => state.get('editingItemIndex');
const getViewingItemIndex = () => state.get('viewingItemIndex');
const getInsertingItemIndex = () => state.get('insertingItemIndex');
const getIsEditingFromDetail = () => state.get('isEditingFromDetail');
const getIsEditing = () => state.get('isEditing');
const getIsGlobalEditMode = () => state.get('isGlobalEditMode');

// 전역 변수 (Firebase 업데이트와 모달 제어용)
// tempItemCoords는 trip-info.js에서 import하여 공유
let pendingSortDayIndex = null;

// =============================================
// Tier 1: 일정 CRUD 함수
// =============================================

/**
 * 새 일정 아이템 추가 (새 장소 추가 모달 오픈)
 * 
 * @param {number|null} insertIndex - 삽입 위치 (null이면 맨 뒤)
 * @param {number} dayIndex - 대상 날짜 인덱스
 * 
 * 로직:
 * 1. 추가 모드 설정 (editingItemIndex = null)
 * 2. 이전 항목의 종료 시간을 기반으로 기본 시간 계산
 * 3. 모달 UI 초기화 및 오픈
 * 4. 장소 검색 자동완성 설정
 * 
 * 영향:
 * - 모달 오픈: #item-modal
 * - 상태 변경: editingItemIndex, insertingItemIndex, targetDayIndex
 */
export function addTimelineItem(insertIndex = null, dayIndex = getCurrentDayIndex()) {
    const travelData = getTravelData();
    
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
    tempItemCoords.lat = null;
    tempItemCoords.lng = null;
    document.getElementById('place-search').value = "";
    document.getElementById('item-title').value = "";
    document.getElementById('item-location').value = "";

    const targetDayIndex = getTargetDayIndex();
    const timeline = travelData.days[targetDayIndex].timeline;
    const defaultTime = getDefaultTimelineStartTime(timeline, insertIndex, {
        parseTimeStr,
        parseDurationStr,
        formatTimeStr
    });

    document.getElementById('item-time').value = defaultTime;
    document.getElementById('item-notes').value = "";
    
    // 카테고리 초기값 설정
    const categoryList = injectedHandlers.categoryList || [];
    document.getElementById('item-category').value = categoryList[5]?.name || '기타';
    document.getElementById('item-category').dataset.value = categoryList[5]?.code || 'custom';

    // 모달 UI 설정 (추가 모드)
    document.querySelector('#item-modal h3').innerText = "새 장소 추가";

    modal.classList.remove('hidden');
    injectedHandlers.lockBodyScroll?.(); // 🔒 스크롤 잠금 (모달 열기)
    setupItemAutocomplete();

    // 장소 검색 입력란에 자동 포커스
    setTimeout(() => {
        const placeSearchInput = document.getElementById('place-search');
        if (placeSearchInput) placeSearchInput.focus();
    }, 100);
}

/**
 * 기존 일정 아이템 수정 (아이템 수정 모달 오픈)
 * 
 * @param {number} index - 수정할 아이템의 인덱스
 * @param {number} dayIndex - 대상 날짜 인덱스
 * 
 * 로직:
 * 1. 이동 수단(isTransit)이면 전용 상세 모달 호출
 * 2. 메모(tag === '메모')이면 메모 모달 호출
 * 3. 일반 장소면 일정 수정 모달 오픈
 * 4. 모달 필드를 기존 데이터로 채움
 * 
 * 영향:
 * - 모달 오픈: #item-modal
 * - 상태 변경: editingItemIndex, targetDayIndex
 */
export function editTimelineItem(index, dayIndex = getCurrentDayIndex()) {
    const travelData = getTravelData();
    
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const targetDayIndex = getTargetDayIndex();
    const item = travelData.days[targetDayIndex].timeline[index];

    // 이동 수단(Transit)인 경우 전용 모달(상세 모달) 호출
    if (item.isTransit) {
        if (injectedHandlers.viewRouteDetail) {
            injectedHandlers.viewRouteDetail(index, targetDayIndex);
        }
        return;
    }

    // 메모(Memo)인 경우 상세 모달의 수정 모드 호출
    if (item.tag === '메모') {
        if (Modals && Modals.openMemoModal && Modals.editCurrentMemo) {
            Modals.openMemoModal(item, index);
            Modals.editCurrentMemo();
        }
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
    tempItemCoords.lat = item.lat || null;
    tempItemCoords.lng = item.lng || null;
    document.getElementById('place-search').value = "";
    document.getElementById('item-title').value = item.title;
    document.getElementById('item-location').value = item.location;
    document.getElementById('item-time').value = item.time;
    document.getElementById('item-duration').value = item.duration !== undefined && item.duration !== null ? item.duration : 30;
    document.getElementById('item-notes').value = item.note || "";

    // 카테고리 매핑
    const categoryValue = getTimelineItemCategoryCode(item);

    const categoryList = injectedHandlers.categoryList || [];
    const categoryObj = categoryList.find(c => c.code === categoryValue) || categoryList[5];
    document.getElementById('item-category').value = categoryObj?.name || '기타';
    document.getElementById('item-category').dataset.value = categoryObj?.code || 'custom';

    // 모달 UI 설정 (수정 모드)
    document.querySelector('#item-modal h3').innerText = "활동 수정";

    modal.classList.remove('hidden');
    injectedHandlers.lockBodyScroll?.(); // 🔒 스크롤 잠금 (모달 열기)
    setupItemAutocomplete();
}

/**
 * 일정 아이템 삭제 (삭제 확인 모달 오픈)
 * 
 * @param {number} index - 삭제할 아이템의 인덱스
 * @param {number} dayIndex - 대상 날짜 인덱스
 * 
 * 로직:
 * 1. routeGroupId가 있으면 경로 그룹 삭제 확인 모달
 * 2. routeGroupId가 없으면 일반 삭제 확인 모달
 * 
 * 영향:
 * - 모달 오픈: #delete-confirm-modal 또는 일반 삭제 모달
 */
export function deleteTimelineItem(index, dayIndex = getCurrentDayIndex()) {
    const travelData = getTravelData();
    
    if (dayIndex !== null) {
        setTargetDayIndex(dayIndex);
    }

    const targetDayIndex = getTargetDayIndex();
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

// =============================================
// Tier 2: 삭제 확인 모달 함수
// =============================================

/**
 * 경로 그룹 삭제 확인 모달 오픈
 * 
 * 경로 최적화로 생성된 여러 이동 수단이 그룹화되어 있을 때
 * "이 항목만 삭제" vs "전체 경로 삭제" 선택 제공
 */
export function openDeleteConfirmModal(index, dayIndex, groupCount) {
    return openDeleteConfirmModalFlow(index, dayIndex, groupCount, {
        onDeleteSingle: () => {
            executeDelete(false);
            closeDeleteConfirmModal();
        },
        onDeleteGroup: () => {
            executeDelete(true);
            closeDeleteConfirmModal();
        }
    });
}

/**
 * 경로 그룹 삭제 확인 모달 닫기
 */
export function closeDeleteConfirmModal() {
    return closeDeleteConfirmModalFlow();
}

/**
 * 이동 시간 재계산 확인 모달 오픈
 * 
 * 이동 수단 삭제 후 다음 일정의 시간을 자동으로 앞당길지 확인
 */
export function showTransitRecalculateModal(time, onConfirm, onCancel) {
    return showTransitRecalculateModalFlow(time, onConfirm, onCancel);
}

/**
 * 이동 시간 재계산 확인 모달 닫기
 */
export function closeTransitRecalculateModal(shouldRecalculate) {
    return closeTransitRecalculateModalFlow(shouldRecalculate);
}

// =============================================
// Tier 3: 일정 이동/정렬/계산 함수
// =============================================

/**
 * 일정 아이템 이동 (드래그 앤 드롭)
 * 
 * @param {number} fromIndex - 원본 인덱스
 * @param {number} targetIndex - 대상 인덱스
 * @param {number} dayIndex - 날짜 인덱스
 * 
 * 로직:
 * 1. DnD 모듈의 moveTimelineItem() 호출
 * 2. 이동 후 reorderTimeline() 호출하여 렌더링
 * 
 * 영향:
 * - timeline 배열 순서 변경
 * - 화면 리렌더링
 */
export function moveTimelineItem(fromIndex, targetIndex, dayIndex = getCurrentDayIndex()) {
    const travelData = getTravelData();
    
    DnD.moveTimelineItem(fromIndex, targetIndex, dayIndex, travelData);
    reorderTimeline(dayIndex);
}

/**
 * 일정 정렬 (시간순 또는 현재 순서 유지)
 * 
 * @param {number} dayIndex - 날짜 인덱스
 * @param {boolean} sortByTime - true면 시간순 정렬, false면 현재 순서 유지하고 렌더링만
 * 
 * 로직:
 * 1. sortByTime이 true면 timeline을 시간순으로 정렬
 * 2. renderItinerary() 호출하여 화면 리렌더링
 * 3. autoSave() 호출하여 Firebase에 저장
 * 
 * 영향:
 * - timeline 배열 순서 변경 (sortByTime === true일 때)
 * - Firebase 업데이트
 */
export function reorderTimeline(dayIndex, sortByTime = false) {
    const travelData = getTravelData();
    
    if (dayIndex === null || dayIndex === -1) return;
    const day = travelData.days[dayIndex];
    if (!day || !day.timeline) return;

    if (sortByTime) {
        day.timeline.sort((a, b) => {
            // 이동수단은 transitInfo.start 참조, 일반 장소는 item.time 참조
            let ta = null;
            let tb = null;
            
            if (a.isTransit && a.transitInfo?.start) {
                ta = parseTimeStr(a.transitInfo.start);
            } else {
                ta = parseTimeStr(a.time);
            }
            
            if (b.isTransit && b.transitInfo?.start) {
                tb = parseTimeStr(b.transitInfo.start);
            } else {
                tb = parseTimeStr(b.time);
            }
            
            if (ta === null && tb === null) return 0;
            if (ta === null) return 1;
            if (tb === null) return -1;
            return ta - tb;
        });
    }

    injectedHandlers.renderItinerary?.();
    injectedHandlers.autoSave?.();
}

/**
 * 일정 시간 재계산
 * 
 * 첫 번째 아이템의 시작 시간부터 연속으로 모든 아이템의 시간을 재계산
 * 각 아이템의 duration만큼 시간을 더해서 다음 아이템의 시작 시간으로 설정
 * 
 * @param {number} dayIndex - 날짜 인덱스
 * 
 * 로직:
 * 1. 첫 번째 아이템의 시작 시간 찾기 (없으면 09:00으로 기본값)
 * 2. 각 아이템 순회:
 *    - 이동 수단: startTime + duration = endTime, 다음 아이템 startTime
 *    - 장소: startTime + duration(체류시간) = 다음 아이템 startTime
 * 3. 업데이트된 시간을 item.time, item.transitInfo.start/end에 저장
 * 4. 렌더링 및 저장
 * 
 * 영향:
 * - timeline 모든 아이템의 시간 정보 변경
 * - Firebase 업데이트
 */
export function recalculateTimeline(dayIndex) {
    const travelData = getTravelData();
    
    if (dayIndex === null || dayIndex === -1) return;
    const day = travelData.days[dayIndex];
    if (!day || !day.timeline || day.timeline.length === 0) {
        injectedHandlers.renderItinerary?.();
        return;
    }

    recalculateTimelineItems(day.timeline, {
        parseTimeStr,
        parseDurationStr,
        formatDuration,
        formatTimeStr,
        minutesTo24Hour
    });

    injectedHandlers.renderItinerary?.();
    injectedHandlers.autoSave?.();
}

/**
 * 정렬 방법 선택 모달 오픈
 * 
 * "시간순 정렬" vs "시간 자동 재계산" 선택
 */
export function openSortMethodModal(dayIndex) {
    pendingSortDayIndex = dayIndex;
    const modal = document.getElementById('sort-method-modal');
    if (modal) {
        modal.classList.remove('hidden');
        injectedHandlers.pushModalState?.();
        injectedHandlers.lockBodyScroll?.();
    }
}

/**
 * 정렬 방법 선택 모달 닫기
 */
export function closeSortMethodModal() {
    pendingSortDayIndex = null;
    const modal = document.getElementById('sort-method-modal');
    const wasOpen = modal && !modal.classList.contains('hidden');
    if (modal) {
        modal.classList.add('hidden');
    }
    if (wasOpen) {
        injectedHandlers.unlockBodyScroll?.();
    }
}

/**
 * 정렬 방법 확인 (사용자 선택 처리)
 */
export function confirmSort(type) {
    if (pendingSortDayIndex === null) return;

    if (type === 'time') {
        reorderTimeline(pendingSortDayIndex, true);
    } else if (type === 'recalc') {
        recalculateTimeline(pendingSortDayIndex);
    }

    closeSortMethodModal();
}

// =============================================
// Tier 4: 일정 보기/편집 함수
// =============================================

/**
 * 일정 아이템 상세 보기 (상세 모달 오픈)
 * 
 * @param {number} index - 보기할 아이템의 인덱스
 * @param {number} dayIndex - 대상 날짜 인덱스
 * 
 * 로직:
 * 1. 메모(tag === '메모')인 경우 메모 모달 호출
 * 2. 이동 수단(isTransit)인 경우 이동수단 상세 모달 호출
 * 3. 일반 장소: 일정 상세 모달 오픈
 * 4. 모달 필드를 아이템 데이터로 채움 (시간, 장소, 사진, 지도 등)
 * 5. 수정/삭제 버튼을 글로벌 수정 모드에 따라 표시/숨김
 * 
 * 영향:
 * - 모달 오픈: #item-detail-modal
 * - 상태 변경: viewingItemIndex, targetDayIndex
 */
export function viewTimelineItem(index, dayIndex = getCurrentDayIndex()) {
    const travelData = getTravelData();
    const isEditing = getIsEditing();
    
    if (isEditing) return;

    // 동적 모달 생성 확인
    TimelineDetail?.ensureItemDetailModal?.();

    setTargetDayIndex(dayIndex);
    setViewingItemIndex(index);
    const timeline = travelData.days[dayIndex].timeline;
    const item = timeline[index];

    // 메모 아이템인 경우 전용 모달 호출
    if (item.tag === '메모') {
        Modals.openMemoModal(item, index);
        return;
    }

    // 이동수단인 경우 상세 모달 호출
    if (item.isTransit) {
        if (injectedHandlers.viewRouteDetail) {
            injectedHandlers.viewRouteDetail(index, dayIndex);
        }
        return;
    }

    // 콘텐츠 채우기 및 모달 오픈
    document.getElementById('item-detail-modal').classList.remove('hidden');
    injectedHandlers.pushModalState?.();
    injectedHandlers.lockBodyScroll?.();

    const isGlobalEditMode = typeof injectedHandlers.getIsGlobalEditMode === 'function'
        ? Boolean(injectedHandlers.getIsGlobalEditMode())
        : Boolean(window.isGlobalEditMode);

    // 수정/삭제 버튼 hidden 클래스 토글 (event delegation으로 처리)
    const actionButtons = document.getElementById('detail-action-buttons');
    if (actionButtons) {
        const editBtn = actionButtons.querySelector('button[data-action="edit-current-item"]');
        const deleteBtn = actionButtons.querySelector('button[data-action="delete-current-item"]');

        if (isGlobalEditMode) {
            // 수정 모드: 버튼 표시
            editBtn?.classList.remove('hidden');
            deleteBtn?.classList.remove('hidden');
        } else {
            // 보기 모드: 버튼 숨기기
            editBtn?.classList.add('hidden');
            deleteBtn?.classList.add('hidden');
        }
    }

    // 콘텐츠 채우기
    const day = travelData.days[dayIndex];
    const dayMeta = `${dayIndex + 1}일차${day?.date ? ` · ${day.date}` : ''}`;
    const durationText = item.duration !== undefined ? ` (${item.duration}분 체류)` : '';
    const timeLabel = item.time ? item.time + durationText : '시간 미정';
    const itemTitle = String(item.title || '').trim() || String(item.tag || '').trim() || '일정 상세';
    const expenseItems = Array.isArray(item.expenses) ? item.expenses : [];
    const calculatedExpenseTotal = expenseItems.reduce((sum, expense) => (
        sum + (Number(expense?.amount) || 0)
    ), 0);
    const expenseTotal = calculatedExpenseTotal || Number(item.budget || 0);
    const hasExpenseValue = expenseItems.length > 0 || expenseTotal > 0;
    const expenseSummary = expenseItems.length > 0
        ? `총 ${expenseItems.length}건 · 비용 ₩${Math.round(expenseTotal).toLocaleString()}`
        : (
            expenseTotal > 0
                ? `비용 ₩${Math.round(expenseTotal).toLocaleString()}`
                : '지출 내역이 없습니다.'
        );
    const hasAttachments = Array.isArray(item.attachments) && item.attachments.length > 0;
    const hasMemories = Array.isArray(item.memories) && item.memories.length > 0;

    const headerTitleEl = document.getElementById('detail-header-title');
    if (headerTitleEl) headerTitleEl.innerText = '일정 상세';

    document.getElementById('detail-tag').innerText = item.tag || '기타';
    document.getElementById('detail-time').innerText = timeLabel;
    document.getElementById('detail-title').innerText = itemTitle;
    const dayMetaEl = document.getElementById('detail-day-meta');
    if (dayMetaEl) {
        dayMetaEl.innerText = dayMeta;
    }
    const expensePillEl = document.getElementById('detail-expense-pill');
    if (expensePillEl) {
        if (hasExpenseValue) {
            expensePillEl.innerText = `지출 ₩${Math.round(expenseTotal).toLocaleString()}`;
            expensePillEl.classList.remove('hidden');
        } else {
            expensePillEl.classList.add('hidden');
        }
    }
    const expenseSupportEl = document.getElementById('detail-expense-support');
    if (expenseSupportEl) {
        expenseSupportEl.innerText = expenseSummary;
    }
    document.getElementById('detail-location-text').innerText = item.location || '위치 정보 없음';
    document.getElementById('detail-note').value = item.note || '';
    document.getElementById('detail-note').readOnly = true;

    document.getElementById('detail-total-budget').value = (item.budget || 0).toLocaleString();
    injectedHandlers.renderExpenseList?.(item);
    document.getElementById('detail-expense-list')?.classList.toggle('is-readonly', !isGlobalEditMode);

    // 추억(Memories) 렌더링
    const memSection = document.getElementById('detail-memories-section');
    if (memSection) {
        if (hasMemories || isGlobalEditMode) {
            memSection.classList.remove('hidden');
        } else {
            memSection.classList.add('hidden');
        }
        if (!memSection.classList.contains('hidden') && Memories.renderMemoriesList) {
            Memories.renderMemoriesList('detail-memories-list', item, index, dayIndex);
        }
        const memoryAddButton = memSection.querySelector('#detail-memories-list-header-wrapper button');
        memoryAddButton?.classList.toggle('hidden', !isGlobalEditMode);
    }

    const addExpenseButton = document.getElementById('detail-add-expense-btn');
    addExpenseButton?.classList.toggle('hidden', !isGlobalEditMode);
    const expenseSection = document.getElementById('detail-expense-section');
    if (expenseSection) {
        expenseSection.classList.toggle('hidden', !hasExpenseValue && !isGlobalEditMode);
    }

    // 첨부파일 렌더링
    injectedHandlers.renderAttachments?.(item, 'detail-attachment-list');
    const addAttachmentButton = document.getElementById('detail-add-attachment-btn');
    addAttachmentButton?.classList.toggle('hidden', !isGlobalEditMode);
    const attachmentSection = document.getElementById('detail-attachment-section');
    if (attachmentSection) {
        attachmentSection.classList.toggle('hidden', !hasAttachments && !isGlobalEditMode);
    }

    // 지도 표시 (위치 정보가 있을 때만)
    const mapSection = document.getElementById('detail-map-section');
    const mapFrame = document.getElementById('detail-map-frame');

    if (item.location && item.location.length > 1 && item.location !== "위치" && !item.isTransit) {
        mapSection.classList.remove('hidden');
        injectedHandlers.getMapsApiKey?.().then(key => {
            mapFrame.src = `https://www.google.com/maps/embed/v1/place?key=${key}&q=${encodeURIComponent(item.title + "," + item.location)}`;
        });
    } else {
        mapSection.classList.add('hidden');
        mapFrame.src = "";
    }

    document.getElementById('item-detail-modal').classList.remove('hidden');
    injectedHandlers.pushModalState?.();
    // 📌 [Fix] Removed duplicate lockBodyScroll - already called at L659!
}

/**
 * 현재 보기 중인 아이템 편집
 * 
 * viewingItemIndex에 저장된 아이템을 editTimelineItem()으로 수정
 * 상세 모달 닫고 수정 모달 오픈
 */
export function editCurrentItem() {
    const viewingItemIndex = getViewingItemIndex();
    if (viewingItemIndex !== null) {
        const targetDayIndex = getTargetDayIndex();
        setIsEditingFromDetail(true);
        injectedHandlers.closeDetailModal?.();
        editTimelineItem(viewingItemIndex, targetDayIndex);
    }
}

/**
 * 현재 보기 중인 아이템 삭제
 */
export function deleteCurrentItem() {
    const viewingItemIndex = getViewingItemIndex();
    if (viewingItemIndex !== null) {
        const targetDayIndex = getTargetDayIndex();
        Modals.openGeneralDeleteModal(viewingItemIndex, targetDayIndex);
    }
}

// =============================================
// 헬퍼 함수
// =============================================

/**
 * 실제 삭제 실행 (내부 함수)
 * 
 * openDeleteConfirmModal에서 사용자 선택 후 호출
 */
function executeDelete(deleteGroup) {
    const travelData = getTravelData();
    const { pendingDeleteIndex, pendingDeleteDayIndex } = getPendingDeleteContext();

    if (pendingDeleteIndex === null) return;

    setTargetDayIndex(pendingDeleteDayIndex);
    const targetDayIndex = getTargetDayIndex();
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

    injectedHandlers.updateTotalBudget?.();
    injectedHandlers.renderItinerary?.();
    injectedHandlers.autoSave?.();
}

/**
 * 일정 아이템 추가/수정 모달 닫기
 */
export function closeModal() {
    document.getElementById('item-modal').classList.add('hidden');
    injectedHandlers.unlockBodyScroll?.(); // 🔓 스크롤 해제
    setEditingItemIndex(null);
}

/**
 * 상세 모달 닫기
 */
function renderDayPlanManagerModalContent(dayIndex) {
    const travelData = getTravelData();
    const modal = document.getElementById('day-plan-manager-modal');
    const listEl = document.getElementById('day-plan-manager-list');
    const titleEl = document.getElementById('day-plan-manager-title');
    if (!modal || !listEl || !titleEl) return false;

    const day = travelData.days?.[dayIndex];
    if (!day) return false;

    ensureDayPlanBranchState(day);
    const activePlan = getDayActivePlan(day);
    const planCodes = getDayPlanCodes(day);

    titleEl.innerText = `${dayIndex + 1}일차 플랜 관리`;
    modal.dataset.dayIndex = String(dayIndex);

    listEl.innerHTML = planCodes.map((planCode) => {
        const isActive = activePlan === planCode;
        return `
            <div class="rounded-xl border ${isActive ? 'border-primary/40 bg-primary/5' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'} p-3">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-gray-800 dark:text-white">플랜${planCode}</span>
                        ${isActive ? '<span class="text-[10px] px-2 py-1 rounded-full bg-primary text-white font-bold">현재</span>' : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        <button type="button" data-action="switch-day-plan" data-day="${dayIndex}" data-plan-code="${planCode}" class="px-3 py-1.5 rounded-full text-xs font-bold ${isActive ? 'bg-gray-200 text-gray-500 cursor-default dark:bg-gray-700 dark:text-gray-300' : 'bg-primary/10 text-primary hover:bg-primary/20'}" ${isActive ? 'disabled' : ''}>
                            전환
                        </button>
                        <button type="button" data-action="delete-day-plan" data-day="${dayIndex}" data-plan-code="${planCode}" class="px-3 py-1.5 rounded-full text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/40">
                            삭제
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');

    const createBtn = modal.querySelector('[data-action="create-day-plan"]');
    if (createBtn) {
        const defaultSourcePlan = getCurrentDayIndex() === -1 ? 'A' : activePlan;
        createBtn.dataset.day = String(dayIndex);
        createBtn.dataset.sourcePlanCode = defaultSourcePlan;
    }

    return true;
}

export function openDayPlanManagerModal(dayIndex = getCurrentDayIndex()) {
    const travelData = getTravelData();
    if (!Array.isArray(travelData.days) || travelData.days.length === 0) {
        Modals.showToast("플랜을 관리할 일차가 없습니다.", "warning");
        return;
    }

    const resolvedDayIndex = resolveTimelineDayIndex(dayIndex, getCurrentDayIndex());
    if (!travelData.days[resolvedDayIndex]) {
        Modals.showToast("해당 일차를 찾을 수 없습니다.", "error");
        return;
    }

    const modal = document.getElementById('day-plan-manager-modal');
    if (!modal) return;

    const rendered = renderDayPlanManagerModalContent(resolvedDayIndex);
    if (!rendered) return;

    const wasHidden = modal.classList.contains('hidden');
    modal.classList.remove('hidden');
    if (wasHidden) {
        injectedHandlers.pushModalState?.();
        injectedHandlers.lockBodyScroll?.();
    }
}

export function closeDayPlanManagerModal() {
    const modal = document.getElementById('day-plan-manager-modal');
    const wasOpen = modal && !modal.classList.contains('hidden');
    if (modal) modal.classList.add('hidden');
    if (wasOpen) injectedHandlers.unlockBodyScroll?.();
}

export function switchDayPlan(dayIndex = getCurrentDayIndex(), planCode = 'A') {
    const travelData = getTravelData();
    const resolvedDayIndex = resolveTimelineDayIndex(dayIndex, getCurrentDayIndex());
    const day = travelData.days?.[resolvedDayIndex];
    if (!day) return null;

    const activePlan = switchDayPlanBranch(day, planCode);
    setTargetDayIndex(resolvedDayIndex);

    if (typeof window.selectDay === 'function') {
        window.selectDay(resolvedDayIndex, activePlan);
    } else {
        injectedHandlers.renderItinerary?.();
        injectedHandlers.autoSave?.();
    }

    renderDayPlanManagerModalContent(resolvedDayIndex);
    return activePlan;
}

export function createDayPlan(dayIndex = getCurrentDayIndex(), sourcePlanCode = null, targetPlanCode = null) {
    const travelData = getTravelData();
    const resolvedDayIndex = resolveTimelineDayIndex(dayIndex, getCurrentDayIndex());
    const day = travelData.days?.[resolvedDayIndex];
    if (!day) {
        Modals.showToast("해당 일차를 찾을 수 없습니다.", "error");
        return null;
    }

    ensureDayPlanBranchState(day);
    const sourceCode = sourcePlanCode || getDayActivePlan(day);
    const createdPlanCode = createDayPlanBranch(day, sourceCode, targetPlanCode);
    if (!createdPlanCode) {
        Modals.showToast("새 플랜을 더 만들 수 없습니다.", "warning");
        return null;
    }

    switchDayPlan(resolvedDayIndex, createdPlanCode);
    Modals.showToast(`${resolvedDayIndex + 1}일차 플랜${createdPlanCode}를 생성했습니다.`, "success");
    return createdPlanCode;
}

export async function deleteDayPlan(dayIndex = getCurrentDayIndex(), planCode = 'A') {
    const travelData = getTravelData();
    const resolvedDayIndex = resolveTimelineDayIndex(dayIndex, getCurrentDayIndex());
    const day = travelData.days?.[resolvedDayIndex];
    if (!day) {
        Modals.showToast("해당 일차를 찾을 수 없습니다.", "error");
        return false;
    }

    const upperPlanCode = String(planCode || '').toUpperCase();
    const hasCustomConfirmModal = Boolean(document.getElementById('custom-confirm-modal'));
    const confirmed = hasCustomConfirmModal
        ? await new Promise((resolve) => {
            Modals.showConfirmModal(
                `플랜${upperPlanCode}를 삭제할까요?`,
                () => resolve(true),
                {
                    icon: 'delete',
                    iconColor: 'text-red-500',
                    iconBgColor: 'bg-red-50 dark:bg-red-900/20',
                    confirmBtnColor: 'bg-red-500 hover:bg-red-600',
                    onCancel: () => resolve(false)
                }
            );
        })
        : window.confirm(`플랜${upperPlanCode}를 삭제할까요?`);
    if (!confirmed) return false;

    const deleted = deleteDayPlanBranch(day, upperPlanCode);
    if (!deleted) {
        Modals.showToast("삭제할 플랜을 찾을 수 없습니다.", "error");
        return false;
    }

    const activePlan = getDayActivePlan(day);
    setTargetDayIndex(resolvedDayIndex);
    if (typeof window.selectDay === 'function') {
        window.selectDay(resolvedDayIndex, activePlan);
    } else {
        injectedHandlers.renderItinerary?.();
        injectedHandlers.autoSave?.();
    }

    renderDayPlanManagerModalContent(resolvedDayIndex);
    Modals.showToast(`${resolvedDayIndex + 1}일차 플랜${upperPlanCode}를 삭제했습니다.`, "success");
    return true;
}

export function createDayPlanB(dayIndex = getCurrentDayIndex()) {
    const travelData = getTravelData();
    if (!Array.isArray(travelData.days) || travelData.days.length === 0) {
        Modals.showToast("플랜을 분기할 일차가 없습니다.", "warning");
        return;
    }

    const resolvedDayIndex = resolveTimelineDayIndex(dayIndex, getCurrentDayIndex());
    const day = travelData.days[resolvedDayIndex];
    if (!day) {
        Modals.showToast("해당 일차를 찾을 수 없습니다.", "error");
        return;
    }

    ensureDayPlanBranchState(day);
    if (getDayPlanCodes(day).includes('B')) {
        switchDayPlan(resolvedDayIndex, 'B');
        Modals.showToast("이미 Plan B가 있어 Plan B 탭으로 이동했습니다.", "info");
        return;
    }

    createDayPlan(resolvedDayIndex, 'A', 'B');
}

export function openPlanBModal(insertIndex = getInsertingItemIndex(), dayIndex = getTargetDayIndex()) {
    const travelData = getTravelData();
    const resolvedDayIndex = resolveTimelineDayIndex(dayIndex, getCurrentDayIndex());
    const day = travelData.days?.[resolvedDayIndex];
    const timeline = day?.timeline || [];

    const preferredIndex = typeof insertIndex === 'number' ? insertIndex : getInsertingItemIndex();
    const anchorIndex = resolvePlanBAnchorIndex(timeline, preferredIndex);

    if (anchorIndex === null) {
        Modals.showToast("Plan B를 연결할 장소가 없습니다.", "warning");
        return;
    }

    const modal = document.getElementById('plan-b-modal');
    if (!modal) return;

    setTargetDayIndex(resolvedDayIndex);
    setInsertingItemIndex(anchorIndex);

    modal.dataset.dayIndex = String(resolvedDayIndex);
    modal.dataset.anchorIndex = String(anchorIndex);

    const currentPlanB = normalizePlanBForForm(timeline[anchorIndex]?.planB);
    const titleInput = document.getElementById('plan-b-title');
    const locationInput = document.getElementById('plan-b-location');
    const noteInput = document.getElementById('plan-b-note');

    if (titleInput) titleInput.value = currentPlanB.title;
    if (locationInput) locationInput.value = currentPlanB.location;
    if (noteInput) noteInput.value = currentPlanB.note;

    modal.classList.remove('hidden');
    injectedHandlers.pushModalState?.();
    injectedHandlers.lockBodyScroll?.();

    setTimeout(() => {
        titleInput?.focus();
    }, 50);
}

export function closePlanBModal() {
    const modal = document.getElementById('plan-b-modal');
    if (modal) modal.classList.add('hidden');
    injectedHandlers.unlockBodyScroll?.();
}

export function savePlanB() {
    const travelData = getTravelData();
    const modal = document.getElementById('plan-b-modal');
    if (!modal) return;

    const dayIndex = Number(modal.dataset.dayIndex);
    const anchorIndex = Number(modal.dataset.anchorIndex);
    if (!Number.isInteger(dayIndex) || !travelData.days?.[dayIndex]) {
        Modals.showToast("Plan B 저장 대상 일차를 찾을 수 없습니다.", "error");
        return;
    }

    const timeline = travelData.days[dayIndex].timeline || [];
    const resolvedAnchorIndex = resolvePlanBAnchorIndex(timeline, anchorIndex);
    if (resolvedAnchorIndex === null) {
        Modals.showToast("Plan B를 저장할 장소를 찾을 수 없습니다.", "error");
        return;
    }

    const title = (document.getElementById('plan-b-title')?.value || '').trim();
    const location = (document.getElementById('plan-b-location')?.value || '').trim();
    const note = (document.getElementById('plan-b-note')?.value || '').trim();

    if (!title && !location && !note) {
        Modals.showToast("Plan B 내용을 입력해 주세요.", "warning");
        return;
    }

    const anchorItem = timeline[resolvedAnchorIndex];
    if (!isPlanBAttachableTimelineItem(anchorItem)) {
        Modals.showToast("해당 항목에는 Plan B를 추가할 수 없습니다.", "error");
        return;
    }

    anchorItem.planB = buildPlanBPayload(title, location, note);

    injectedHandlers.renderItinerary?.();
    injectedHandlers.autoSave?.();
    closePlanBModal();
    Modals.showToast("Plan B가 저장되었습니다.", "success");
}

export function closeDetailModal() {
    document.getElementById('item-detail-modal').classList.add('hidden');
    setViewingItemIndex(null);
    // Modal state와 body scroll lock 처리
    if (injectedHandlers.popModalState) injectedHandlers.popModalState();
    if (injectedHandlers.unlockBodyScroll) injectedHandlers.unlockBodyScroll();
}

/**
 * 잔류 시간(Duration) 설정
 */
export function setDuration(minutes) {
    const durationInput = document.getElementById('item-duration');
    if (durationInput) {
        durationInput.value = minutes;
    }
}

/**
 * 이전 장소로부터의 경로 Google Maps에서 열기
 */
export function openGoogleMapsRouteFromPrev() {
    const travelData = getTravelData();
    const targetDayIndex = getTargetDayIndex();
    const editingItemIndex = getEditingItemIndex();
    const insertingItemIndex = getInsertingItemIndex();
    
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

/**
 * 직접 입력 모달 함수
 */
export function openManualInputModal(initialValue, callback, title = "직접 입력", label = "장소명 / 위치") {
    return openManualInputModalFlow(initialValue, callback, title, label);
}

export function closeManualInputModal() {
    return closeManualInputModalFlow();
}

export function confirmManualInput() {
    return confirmManualInputFlow();
}

export function useManualInput(type) {
    return useManualInputFlow(type, {
        closeModal,
        finishNewTripWizard: window.finishNewTripWizard,
        getNewTripDataTemp: () => window.newTripDataTemp,
        renderItinerary: window.renderItinerary,
        updateMeta: window.updateMeta
    });
}

/**
 * 메모 아이템 추가
 */
export function addNoteItem(insertIndex) {
    return addNoteItemFlow(insertIndex, {
        autoSave: window.autoSave,
        parseDurationStr,
        parseTimeStr,
        formatTimeStr,
        renderItinerary: window.renderItinerary,
        targetDayIndex: getTargetDayIndex(),
        travelData: getTravelData()
    });
}

/**
 * 아이템 자동완성 설정 (내부 함수)
 */

// =============================================
// Window 글로벌 노출 (legacy compatibility)
// =============================================

// 기존 코드와의 호환성을 위해 일부 함수를 window에 노출
if (typeof window !== 'undefined') {
    window.addTimelineItem = addTimelineItem;
    window.editTimelineItem = editTimelineItem;
    window.deleteTimelineItem = deleteTimelineItem;
    window.moveTimelineItem = moveTimelineItem;
    window.reorderTimeline = reorderTimeline;
    window.recalculateTimeline = recalculateTimeline;
    window.viewTimelineItem = viewTimelineItem;
    window.editCurrentItem = editCurrentItem;
    window.deleteCurrentItem = deleteCurrentItem;
    window.openSortMethodModal = openSortMethodModal;
    window.closeSortMethodModal = closeSortMethodModal;
    window.confirmSort = confirmSort;
    window.closeModal = closeModal;
    // 📌 [Fix] Removed: window.closeDetailModal 할당은 ui.js에서만 관리
    window.setDuration = setDuration;
    window.openManualInputModal = openManualInputModal;
    window.closeManualInputModal = closeManualInputModal;
    window.confirmManualInput = confirmManualInput;
    window.useManualInput = useManualInput;
    window.addNoteItem = addNoteItem;
    window.openDayPlanManagerModal = openDayPlanManagerModal;
    window.closeDayPlanManagerModal = closeDayPlanManagerModal;
    window.switchDayPlan = switchDayPlan;
    window.createDayPlan = createDayPlan;
    window.deleteDayPlan = deleteDayPlan;
    window.createDayPlanB = createDayPlanB;
    window.openPlanBModal = openPlanBModal;
    window.closePlanBModal = closePlanBModal;
    window.savePlanB = savePlanB;
}
