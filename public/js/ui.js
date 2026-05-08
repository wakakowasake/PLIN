// Entry point for UI modules: re-export state and expose functions on window
import { auth, provider, firebaseReady } from './firebase.js';
import logger from './logger.js';
import { initEventDelegation, injectEventHandlers } from './ui/events/delegated-events.js';
import { hydratePlinIcons } from './ui/plin-icons.js';
import { injectTimelineHandlers } from './ui/ui-timeline.js';
import { injectModalHandlers, closeDetailModal as closeDetailModalFromModals, debugScrollLock } from './ui/modals.js';
import {
    createBackToMainHandler,
    popModalState as popModalStateInternal,
    pushModalState as pushModalStateInternal,
    setHeaderEditButtonVisible
} from './app/main/app-shell.js';
import { runMainBootstrap } from './app/main/bootstrap.js';
import { bindMainWindowBridge } from './app/main/window-bridge.js';
import {
    defaultTravelData,
    setTravelData, setCurrentDayIndex, setCurrentTripId, setNewTripDataTemp, setTargetDayIndex,
    setPendingTransitCallback, setEditingItemIndex, setViewingItemIndex, editingItemIndex, viewingItemIndex,
    setCurrentTripUnsubscribe, setIsEditing, setCurrentUser, setIsReadOnlyMode,
    setInsertingItemIndex, setIsEditingFromDetail,
    updateMetaState, updateTripDateState, updateTimelineItemState,
    setIsSaving, state, useStateManager, uiState, setUiState, isReadOnlyMode
} from './state.js';

hydratePlinIcons();

// 편의성 getter 함수들 (상태 조회용)
const getTravelData = () => state.get('travelData');
const getCurrentDayIndex = () => state.get('currentDayIndex');
const getCurrentTripId = () => state.get('currentTripId');
const getNewTripDataTemp = () => state.get('newTripDataTemp');
const getPendingTransitCallback = () => state.get('pendingTransitCallback');
const getEditingItemIndex = () => state.get('editingItemIndex');
const getViewingItemIndex = () => state.get('viewingItemIndex');
const getCurrentTripUnsubscribe = () => state.get('currentTripUnsubscribe');
const getIsEditing = () => state.get('isEditing');
const getCurrentUser = () => state.get('currentUser');
const getInsertingItemIndex = () => state.get('insertingItemIndex');
const getIsEditingFromDetail = () => state.get('isEditingFromDetail');
const getIsReadOnlyMode = () => state.get('isReadOnlyMode');
const getIsGuestMode = () => state.get('isGuestMode');
const getTargetDayIndex = () => state.get('targetDayIndex');
const getIsSaving = () => state.get('isSaving');
window.currentTripPermissions = null;
const TRIP_REVISION_HISTORY_ENABLED = false;

function resolveWebTripPermissions(tripData, user) {
    const uid = user?.uid || '';
    const members = tripData?.members;
    const memberValue = uid && members && typeof members === 'object' && !Array.isArray(members)
        ? members[uid]
        : '';
    const memberRole = typeof memberValue === 'string'
        ? memberValue.trim().toLowerCase()
        : (
            memberValue && typeof memberValue === 'object' && typeof memberValue.role === 'string'
                ? memberValue.role.trim().toLowerCase()
                : ''
        );
    const role = uid
        ? (
            tripData?.createdBy === uid
            || tripData?.userId === uid
            || memberRole === 'owner'
                ? 'owner'
                : (
                    memberRole
                    || (Array.isArray(members) && members.includes(uid) ? 'member' : '')
                )
        )
        : '';

    return {
        role,
        canEditContent: role === 'owner' || role === 'editor',
        canManageShare: role === 'owner' || role === 'editor',
        canDeleteTrip: role === 'owner',
        canPublishCommunity: role === 'owner' || role === 'editor'
    };
}

import {
    parseTimeStr,
    formatTimeStr,
    parseDurationStr,
    formatDuration,
    minutesTo24Hour,
    calculateStraightDistance,
    countTripAttachments,
    normalizeTripMediaUrls,
    sanitizeFileUrl,
    sanitizeImageUrl,
    TRIP_ATTACHMENT_LIMIT
} from './ui-utils.js';
import { readMemoryComment } from './features/memories/memory-helpers.js';
import * as Helpers from './ui/helpers.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';
import { storage } from './firebase.js';

import { showLoading, hideLoading, selectAddType } from './ui/modals.js';
import * as Modals from './ui/modals.js';
import * as Header from './ui/header.js';
import { fetchBackendJson } from './services/backend/api-client.js';
// ... (existing imports) ...

import * as Renderers from './ui/renderers.js';
import * as Auth from './ui/auth.js';
import { confirmLogout } from './ui/auth.js';
import * as Profile from './ui/profile.js';
import { openUserMenu, openUserSettings, openUserProfile, enableProfileEdit, cancelProfileEdit } from './ui/profile.js';
import * as Navigation from './app/main/navigation-controller.js';
import * as Trips from './ui/trips.js';
import * as Memories from './ui/memories.js';
import { openExpenseDetailModal } from './ui/expense-detail.js';
import { saveProfileChanges } from './ui/actions.js';
import { fetchWeeklyWeather, fetchHourlyWeatherForDate, searchMode, setSearchMode, injectMapHandlers } from './map.js';
import { fetchServerConfig } from './config.js';

// ========================================
// Newly Extracted Modules
// ========================================
import * as CategoryPicker from './ui/category-picker.js';
import * as TimePicker from './ui/time-picker.js';
import * as Weather from './ui/weather.js';
import * as ExpenseManager from './ui/expense-manager.js';
import * as TripInfo from './ui/trip-info.js';
import { tempItemCoords } from './ui/trip-info.js';
import * as TimelineDetail from './ui/timeline-detail.js';
import * as UIContext from './ui/ui-context.js';
// import { ensureItemDetailModal } from './ui/timeline-detail.js'; // Removed to avoid duplicate import issues
import * as ExpenseDetail from './ui/expense-detail.js';
import * as ModalManager from './ui/ui-modal-manager.js';
import * as ListManager from './ui/list-manager.js';
import * as DnD from './ui/dnd.js';
import { categoryList } from './ui/constants.js';

// Phase 5.4: 일정(Timeline) 관리 모듈 분리
import * as TimelineManager from './ui/ui-timeline.js';



// [New] 모바일 터치와 마우스 우클릭 구분을 위한 전역 터치 시간 기록
let lastTouchTime = 0;
if (typeof document !== 'undefined') {
    document.addEventListener('touchstart', () => {
        lastTouchTime = Date.now();
    }, { passive: true });
}

let cachedMapsApiKey = null;
export async function getMapsApiKey() {
    if (cachedMapsApiKey) return cachedMapsApiKey;
    try {
        const config = await fetchServerConfig();
        cachedMapsApiKey = config.googleMapsApiKey;
        return cachedMapsApiKey;
    } catch (e) {
        console.error("Failed to fetch Maps API Key", e);
        return "";
    }
}

function createMediaNormalizationPatch(originalData, normalizedData) {
    if (!originalData || !normalizedData) return {};

    const patch = {};
    const originalMeta = originalData.meta || {};
    const normalizedMeta = normalizedData.meta || {};
    if (JSON.stringify(originalMeta) !== JSON.stringify(normalizedMeta)) {
        patch.meta = normalizedMeta;
    }

    const originalDays = Array.isArray(originalData.days) ? originalData.days : [];
    const normalizedDays = Array.isArray(normalizedData.days) ? normalizedData.days : [];
    if (JSON.stringify(originalDays) !== JSON.stringify(normalizedDays)) {
        patch.days = normalizedDays;
    }

    if ((originalData.mapImage || '') !== (normalizedData.mapImage || '')) {
        patch.mapImage = normalizedData.mapImage || "";
    }

    if ((originalData.coverImage || '') !== (normalizedData.coverImage || '')) {
        patch.coverImage = normalizedData.coverImage || "";
    }

    return patch;
}

function persistNormalizedMediaIfNeeded(tripId, originalData, normalizedData) {
    try {
        const patch = createMediaNormalizationPatch(originalData, normalizedData);
        if (!Object.keys(patch).length) {
            console.info("[Media Migration] 이미 정규화된 이미지 URL입니다.");
            return;
        }

        console.info("[Media Migration] 정규화 패치 저장", {
            fields: Object.keys(patch)
        });

        fetchBackendJson(`/plans/${encodeURIComponent(tripId)}/content`, {
            method: 'PUT',
            body: {
                trip: normalizedData,
                sourceClient: 'web'
            }
        }).catch((error) => {
            console.warn("[Media Migration] Failed to persist normalized media URLs:", error);
        });
    } catch (error) {
        console.warn("[Media Migration] Failed to build migration patch:", error);
    }
}


// [Modified] Added options parameter for readOnly mode
export async function openTrip(tripId, options = {}) {
    try {
        Modals.showLoading();

        const result = await fetchBackendJson(`/plans/${encodeURIComponent(tripId)}`);
        const tripPayload = result?.trip;

        if (tripPayload) {
            const originalData = tripPayload;
            const data = normalizeTripMediaUrls(originalData);
            const permissions = resolveWebTripPermissions(data, currentUser);
            const nextReadOnlyMode = Boolean(options.readOnly || !permissions.canEditContent);

            window.currentTripPermissions = permissions;
            setIsReadOnlyMode(nextReadOnlyMode); // Set global read-only flag

            // [Migration] Normalize legacy media URLs once when owner/member opens the trip
            if (!nextReadOnlyMode) {
                persistNormalizedMediaIfNeeded(tripId, originalData, data);
            } else {
                console.info("[Media Migration] 읽기 전용 모드라 정규화 저장을 건너뜁니다.");
            }
            // 실제 데이터만 사용 (기본값 병합 제거)
            setTravelData(data);
            setCurrentTripId(tripId);

            document.getElementById('main-view').classList.add('hidden');
            document.getElementById('detail-view').classList.remove('hidden');
            document.getElementById('back-btn').classList.remove('hidden');
            setHeaderEditButtonVisible(permissions.canEditContent);

            // [Fix] 메인 페이지에서 여행 로드 시 항상 상단에서 시작하도록 스크롤 초기화
            window.scrollTo(0, 0);

            // 공유 버튼은 읽기 전용 모드에서는 숨김
            const shareBtn = document.getElementById('share-btn');
            const historyBtn = document.getElementById('history-btn');
            if (!permissions.canManageShare || nextReadOnlyMode) {
                shareBtn.classList.add('hidden');
            } else {
                shareBtn.classList.remove('hidden');
            }

            if (historyBtn) {
                if (!permissions.canEditContent || nextReadOnlyMode) {
                    historyBtn.classList.add('hidden');
                } else {
                    historyBtn.classList.remove('hidden');
                }

                if (!TRIP_REVISION_HISTORY_ENABLED) {
                    historyBtn.classList.add('hidden');
                }
            }

            // [Modified] Push state when opening trip for back button support
            if (options.pushState !== false) {
                history.pushState({ page: 'trip', tripId: tripId }, '', window.location.pathname);
            }

            // [Fix] Recalculate budget on load to fix potential legacy errors
            ExpenseManager.updateTotalBudget(travelData);
            selectDay(-1); // 전체 보기로 초기화

            // [New] Apply Read-Only UI restrictions
            applyReadOnlyUI();

            // [New] If editMode is requested, activate it
            if (options.editMode && !nextReadOnlyMode) {
                window.isGlobalEditMode = true;
                TripInfo.updateGlobalEditModeButton?.(true);
            } else {
                window.isGlobalEditMode = false;
                TripInfo.updateGlobalEditModeButton?.(false);
            }

            renderRouteOnMap();

        } else {
            console.error("Trip not found:", tripId);
            alert("여행 계획을 찾을 수 없습니다.");
            backToMain();
        }
    } catch (e) {
        console.error("Error opening trip:", e);
        alert(e?.message || "여행 계획을 여는 중 오류가 발생했습니다.");
        backToMain();
    } finally {
        Modals.hideLoading();
    }
}

function applyReadOnlyUI() {
    const body = document.body;
    if (isReadOnlyMode) {
        body.classList.add('read-only-mode');
        // CSS로 제어하기 위해 클래스 추가.
        // 추가로 JS로 제어해야 할 부분들:
        // 1. DND 비활성화 (renderers.js에서 처리하거나 CSS pointer-events로 막음)
        // 2. 추가 버튼 숨김 (CSS)
        // 3. 컨텍스트 메뉴 비활성화 (oncontextmenu 이벤트 막기)
    } else {
        body.classList.remove('read-only-mode');
    }
}

const backToMainHandler = createBackToMainHandler({
    setCurrentTripId,
    loadTripList: Trips.loadTripList,
    getCurrentUser,
    setHeaderEditButtonVisible
});

export function backToMain(options = {}) {
    window.currentTripPermissions = null;
    document.getElementById('history-btn')?.classList.add('hidden');
    return backToMainHandler(options);
}

// Note: Trips functions are re-exported in the exports section below


export function closeDeleteTripModal() { }
export function confirmDeleteTrip() { }

export function toggleTripMenu(tripId) {
    const menu = document.getElementById(`trip-menu-${tripId}`);
    if (menu) {
        const isHidden = menu.classList.contains('hidden');
        document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));
        if (isHidden) menu.classList.remove('hidden');
    }
}

// ===================================================================================
// 앱 초기화
// ===================================================================================

runMainBootstrap({
    initDarkMode: Profile.initDarkMode,
    initSwipeHandlers,
    openTrip,
    backToMain
});

/**
 * 열려있는 모든 모달을 닫는 함수
 * @returns {boolean} 모달을 하나라도 닫았는지 여부
 */
const closeAllModalsInternal = () => {
    let closedAny = false;
    const modals = [
        'item-detail-modal', 'memo-detail-modal', 'add-selection-modal',
        'plan-b-modal', 'day-plan-manager-modal', 'copy-item-modal', 'general-delete-modal', 'share-modal',
        'sort-method-modal', 'trip-info-modal', 'invite-modal', 'trip-revision-modal',
        'lightbox-modal', 'expense-modal', 'shopping-selector-modal',
        'transit-detail-modal'
    ];

    modals.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) {
            // 특정 모달 닫기 함수 호출 또는 클래스 명시적 제거
            if (id === 'item-detail-modal') closeDetailModal();
            else if (id === 'memo-detail-modal') closeMemoModal();
            else if (id === 'add-selection-modal') closeAddModal();
            else if (id === 'plan-b-modal') closePlanBModal();
            else if (id === 'day-plan-manager-modal') closeDayPlanManagerModal();
            else if (id === 'copy-item-modal') Modals.closeCopyItemModal();
            else if (id === 'general-delete-modal') Modals.closeGeneralDeleteModal();
            else if (id === 'share-modal') Header.closeShareModal();
            else if (id === 'trip-revision-modal') Header.closeTripRevisionModal();
            else if (id === 'sort-method-modal') closeSortMethodModal();
            else if (id === 'trip-info-modal') Header.closeTripInfoModal ? Header.closeTripInfoModal() : el.classList.add('hidden');
            else if (id === 'invite-modal') closeInviteModal();
            else if (id === 'lightbox-modal') Modals.closeLightbox();
            else if (id === 'expense-modal') Modals.closeExpenseModal();
            else if (id === 'shopping-selector-modal') Modals.closeShoppingListSelector();
            else if (id === 'transit-detail-modal') window.closeRouteDetail ? window.closeRouteDetail() : el.classList.add('hidden');
            else el.classList.add('hidden');

            closedAny = true;
        }
    });

    if (closedAny && Modals.unlockBodyScroll) Modals.unlockBodyScroll();
    return closedAny;
};
export function pushModalState() {
    return pushModalStateInternal();
}

export function popModalState() {
    return popModalStateInternal();
}

// ========================================
// Drag & Drop Logic (Re-exported from module)
// ========================================
export const touchStart = (e, index, type) => DnD.touchStart(e, index, type, isEditing);
export const touchMove = DnD.touchMove;
export const touchEnd = (e) => DnD.touchEnd(e, targetDayIndex, moveTimelineItem);

export const dragStart = DnD.dragStart;
export const dragEnd = DnD.dragEnd;
export const dragOver = DnD.dragOver;
export const dragLeave = DnD.dragLeave;
export const drop = (e, targetIndex) => DnD.drop(e, targetIndex, targetDayIndex, moveTimelineItem);
export const timelineContainerDrop = (e, dayIndex) => DnD.timelineContainerDrop(e, dayIndex, TimelineManager.moveTimelineItem);

// 날짜 탭 변경



// ===================================================================================
// [New] Mobile Swipe Navigation
// ===================================================================================

let touchStartX = 0;
let touchStartY = 0;
const SWIPE_THRESHOLD = 50; // Minimum distance to trigger swipe

export function initSwipeHandlers() {
    // Ensure DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachSwipeListeners);
    } else {
        attachSwipeListeners();
    }
}

function attachSwipeListeners() {
    const container = document.getElementById('timeline-list');
    if (!container) {
        console.warn('Swipe handler: #timeline-list not found. Retrying in 500ms...');
        setTimeout(attachSwipeListeners, 500);
        return;
    }

    // Remove existing listeners to prevent duplicates (if re-initialized)
    container.removeEventListener('touchstart', handleTouchStart);
    container.removeEventListener('touchmove', handleTouchMove);
    container.removeEventListener('touchend', handleTouchEnd);

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    console.debug('Swipe handlers attached to #timeline-list');
}

function handleTouchStart(e) {
    // [Fix] 가로 스크롤이 가능한 요소(예: 추억 사진 갤러리) 내부에서는 일차 스와이프를 무시함
    if (e.target.closest('.overflow-x-auto')) {
        touchStartX = 0;
        touchStartY = 0;
        return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}


function handleTouchMove(e) {
    if (!touchStartX || !touchStartY) return;

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;

    const diffX = touchX - touchStartX; // 방향 수정: 드래그한 거리 (양수=오른쪽으로 당김=이전으로)
    const diffY = touchY - touchStartY;

    // 수직 이동이 더 크면 스크롤 허용 (단, 이미 스와이프 중이면 막음?) -> 간단히 수직이 크면 무시
    if (Math.abs(diffY) > Math.abs(diffX)) return;

    // 수평 이동이 주도적이면 스크롤 방지 및 애니메이션 적용
    if (e.cancelable) {
        e.preventDefault();
    }

    const container = document.getElementById('timeline-list');
    if (container) {
        container.classList.add('carousel-drag');
        container.style.transform = `translateX(${diffX}px)`;
    }
}

function handleTouchEnd(e) {
    if (!touchStartX || !touchStartY) return;

    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchStartX;
    const diffY = touch.clientY - touchStartY;

    const container = document.getElementById('timeline-list');

    // [Fix] 수직 스크롤 중에는 스와이프가 발생하지 않도록 감도 대폭 강화 (50 -> 30)
    if (Math.abs(diffY) > 30) {
        if (container) {
            container.classList.add('carousel-settle');
            container.style.transform = 'translateX(0)';
        }
        touchStartX = 0;
        touchStartY = 0;
        return;
    }

    // Threshold 확인 (민감도 완화: 100 -> 120px)
    const threshold = 120;
    const isNext = diffX < -threshold;
    const isPrev = diffX > threshold;

    if (isNext || isPrev) {
        // 끝까지 밀어내기 효과
        if (container) {
            container.classList.add('carousel-settle');
            container.style.transform = `translateX(${isNext ? '-100%' : '100%'})`;
        }

        // 애니메이션 완료 후 데이터 변경
        setTimeout(() => {
            if (isNext) changeDayWithAnimation('next');
            else changeDayWithAnimation('prev');

            // 데이터 변경 후 위치 복귀는 selectDay나 render에서 초기화되어야 함
            // 하지만 renderItinerary가 DOM을 갈아엎으므로 style은 초기화됨.
            // 다만 slide-in 애니메이션을 위해 changeDayWithAnimation이 클래스를 추가할 것임.
        }, 200);
    } else {
        // 복귀 (Threshold 미달)
        if (container) {
            container.classList.add('carousel-settle');
            container.style.transform = 'translateX(0)';
        }
    }

    touchStartX = 0;
    touchStartY = 0;
}

function changeDayWithAnimation(direction) {
    if (!travelData || !travelData.days) return;

    const maxIndex = travelData.days.length - 1;
    let nextIndex = currentDayIndex;

    // [Fix] 전체 보기(-1) 지원 로직
    if (direction === 'next') {
        if (currentDayIndex === -1) {
            nextIndex = 0; // 전체 -> 1일차
        } else if (currentDayIndex < maxIndex) {
            nextIndex++;
        } else {
            // 바운스 효과 등을 원하면 여기서 처리. 지금은 복귀.
            resetContainerPosition();
            return;
        }
    } else if (direction === 'prev') {
        if (currentDayIndex > 0) {
            nextIndex--;
        } else if (currentDayIndex === 0) {
            nextIndex = -1; // 1일차 -> 전체
        } else {
            resetContainerPosition();
            return;
        }
    }

    const container = document.getElementById('timeline-list');
    if (!container) {
        selectDay(nextIndex);
        return;
    }

    // 이미 handleTouchEnd에서 밀어냈으므로, 여기서는 데이터 변경 후 들어오는 애니메이션 처리
    // 하지만 버튼(화살표)으로 불렸을 수도 있음. 
    // 버튼 클릭 시에는 transform이 0인 상태.

    // 만약 터치 스와이프로 온 게 아니라면(즉시 호출), 밀어내는 애니메이션 필요
    const computedStyle = window.getComputedStyle(container);
    if (computedStyle.transform === 'none' || computedStyle.transform === 'matrix(1, 0, 0, 1, 0, 0)') {
        const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
        container.classList.add('slide-active', outClass);

        setTimeout(() => {
            selectDay(nextIndex);
            // Slide In
            const inClass = direction === 'next' ? 'slide-in-start-right' : 'slide-in-start-left';
            const newContainer = document.getElementById('timeline-list'); // Re-queried
            if (newContainer) {
                newContainer.classList.add(inClass);
                requestAnimationFrame(() => {
                    newContainer.classList.add('slide-active');
                    newContainer.classList.remove(inClass);
                });
            }
        }, 300);
        return;
    }

    // 터치 스와이프 후 진입 (이미 transform 되어 있음)
    // 데이터 변경
    selectDay(nextIndex);

    // Slide In Animation
    // selectDay 호출 후 DOM이 새로 그려졌으므로, 새 DOM에 대해 들어오는 애니메이션 적용
    const newContainer = document.getElementById('timeline-list');
    if (newContainer) {
        // [Fix] Clear any inline transform first (important if container was recycled)
        newContainer.style.transform = '';

        // 들어올 위치 잡기
        const startClass = direction === 'next' ? 'slide-in-start-right' : 'slide-in-start-left';

        // [Fix] flickering 방지를 위해 transform 초기화 상태를 확실히 보장
        newContainer.classList.add('carousel-drag');
        newContainer.classList.add(startClass);

        // 레이아웃 강제 갱신으로 위치 확정
        newContainer.offsetHeight;

        requestAnimationFrame(() => {
            newContainer.classList.add('carousel-settle-cubic');
            newContainer.classList.remove(startClass); // 원위치로 복귀
        });
    }
}

function resetContainerPosition() {
    const container = document.getElementById('timeline-list');
    if (container) {
        container.classList.add('carousel-settle');
        container.style.transform = 'translateX(0)';
    }
}


export function openAddModal(index, dayIndex) {
    return Modals.openAddModal(index, dayIndex);
}

export function closeAddModal() {
    return Modals.closeAddModal();
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

export function deleteCurrentMemo() {
    if (viewingItemIndex === null) return;

    // 메모 아이템 삭제
    const timeline = travelData.days[targetDayIndex].timeline;
    timeline.splice(viewingItemIndex, 1);

    setTravelData(getTravelData());
    closeMemoModal();
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
        return `<a href="${url}" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline break-all" data-action="stop-propagation">${url}</a>`;
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
let pendingInviteId = null;
const PENDING_INVITE_RESUME_KEY = 'plin.pendingInviteAccept';

function buildInviteRoleLabel(roleOnAccept = '') {
    if (roleOnAccept === 'editor') {
        return 'Editor';
    }

    if (roleOnAccept === 'member') {
        return 'Member';
    }

    return 'Viewer';
}

function buildInviteRoleDescription(roleOnAccept = '') {
    if (roleOnAccept === 'editor') {
        return '편집 가능한 멤버';
    }

    if (roleOnAccept === 'member') {
        return '읽기 전용 멤버';
    }

    return '뷰어';
}

function readPendingInviteResume() {
    try {
        return String(sessionStorage.getItem(PENDING_INVITE_RESUME_KEY) || '').trim();
    } catch {
        return '';
    }
}

function setPendingInviteResume(inviteId) {
    try {
        sessionStorage.setItem(PENDING_INVITE_RESUME_KEY, String(inviteId || '').trim());
    } catch {
        // Ignore storage failures and continue with URL-based resume.
    }
}

function clearPendingInviteResume(inviteId = '') {
    try {
        const currentValue = String(sessionStorage.getItem(PENDING_INVITE_RESUME_KEY) || '').trim();
        if (!inviteId || !currentValue || currentValue === inviteId) {
            sessionStorage.removeItem(PENDING_INVITE_RESUME_KEY);
        }
    } catch {
        // Ignore storage failures.
    }
}

async function acceptInvite(inviteId) {
    try {
        Modals.showLoading();
        const result = await fetchBackendJson(`/invites/${encodeURIComponent(inviteId)}/accept`, {
            method: 'POST'
        });

        clearPendingInviteResume(inviteId);
        closeInviteModal();

        const tripId = result?.trip?.id || result?.invite?.tripId || '';
        if (tripId) {
            openTrip(tripId);
        }
    } catch (e) {
        console.error('Error joining trip:', e);
        alert(e?.message || '여행 참여 중 오류가 발생했습니다.');
    } finally {
        Modals.hideLoading();
    }
}

function shouldRedirectInviteToMobileLanding() {
    if (currentUser) {
        return false;
    }

    const userAgent = String(window.navigator?.userAgent || '');
    return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

export async function checkInviteLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteId = String(urlParams.get('invite') || '').trim();

    if (!inviteId) {
        clearPendingInviteResume();
        return;
    }

    if (shouldRedirectInviteToMobileLanding()) {
        window.location.replace(`/v/invite/${encodeURIComponent(inviteId)}`);
        return;
    }

    try {
        const result = await fetchBackendJson(`/invites/${encodeURIComponent(inviteId)}`, {
            requireAuth: false
        });
        const invite = result?.invite || null;

        if (!invite) {
            throw new Error('초대 링크를 확인하지 못했어요.');
        }

        if (invite.alreadyMember && invite.tripId && currentUser) {
            clearPendingInviteResume(inviteId);
            closeInviteModal();
            openTrip(invite.tripId);
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
        }

        if (currentUser && readPendingInviteResume() === inviteId) {
            await acceptInvite(inviteId);
            return;
        }

        openInviteModal(
            invite.title || '공유된 여행',
            inviteId,
            invite.roleOnAccept || 'viewer',
            Boolean(currentUser)
        );
    } catch (e) {
        console.warn('Invite processing error', e);
        const message = e?.message || '';

        clearPendingInviteResume(inviteId);

        if (e?.status === 410) {
            alert(message || '이 초대 링크는 더 이상 사용할 수 없습니다.');
        } else {
            alert(message || '초대 링크를 확인하지 못했어요.');
        }

        window.history.replaceState({}, document.title, window.location.pathname);
    }
}
window.checkInviteLink = checkInviteLink;

// [Share (Read-Only) Link Logic]
export async function checkShareLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');

    if (shareId) {
        window.location.replace(`/v/${encodeURIComponent(shareId)}`);
    }
}
window.checkShareLink = checkShareLink;

export function openInviteModal(title, inviteId, roleOnAccept = 'viewer', isLoggedIn = Boolean(currentUser)) {
    pendingInviteId = inviteId;
    const modal = document.getElementById('invite-modal');
    const titleEl = document.getElementById('invite-trip-title');
    const roleBadgeEl = document.getElementById('invite-role-badge');
    const descEl = document.getElementById('invite-modal-desc');
    const confirmBtn = document.getElementById('invite-confirm-btn');

    if (modal && titleEl) {
        titleEl.textContent = title || '여행 계획';
        if (roleBadgeEl) {
            roleBadgeEl.textContent = buildInviteRoleLabel(roleOnAccept);
        }
        if (descEl) {
            descEl.textContent = isLoggedIn
                ? `이 링크로 참여하면 ${buildInviteRoleDescription(roleOnAccept)} 권한으로 여행에 들어가요.`
                : `먼저 로그인하면 ${buildInviteRoleDescription(roleOnAccept)} 권한으로 이 여행에 참여할 수 있어요.`;
        }
        if (confirmBtn) {
            confirmBtn.textContent = isLoggedIn ? '참여하기' : '로그인하고 참여';
        }
        modal.classList.remove('hidden');
    }
}

export function closeInviteModal({ preserveUrl = false } = {}) {
    pendingInviteId = null;
    const modal = document.getElementById('invite-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    // 사용자가 거절했거나 닫았을 때 URL 파라미터 정리
    if (!preserveUrl) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

export async function confirmJoinTrip() {
    if (!pendingInviteId) return;

    if (!currentUser) {
        setPendingInviteResume(pendingInviteId);
        closeInviteModal({ preserveUrl: true });

        if (window.Auth?.login) {
            try {
                await window.Auth.login(window.travelData);
            } catch (loginError) {
                console.warn('Invite login flow failed', loginError);
            }
        } else {
            alert('로그인이 필요해요.');
        }
        return;
    }

    await acceptInvite(pendingInviteId);
}

// Window assignments
window.openInviteModal = openInviteModal;
window.closeInviteModal = closeInviteModal;
window.confirmJoinTrip = confirmJoinTrip;

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
            body { font-family: 'MemomentKkukkukk', sans-serif; }
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
                    const visibleComments = item.memories
                        .map((memory) => readMemoryComment(memory))
                        .filter(Boolean);

                    if (visibleComments.length > 0) {
                        html += `<div class="memories">`;
                        html += `<div class="memory-title">💭 추억</div>`;

                        visibleComments.forEach((commentText) => {
                            const comment = commentText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                            html += `<div class="memory-item">${comment}</div>`;
                        });

                        html += `</div>`;
                    }
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

export function copyShareLink(inputId) {
    return Header.copyShareLink(inputId);
}

export function enableNoteEdit() {
    return Header.enableNoteEdit();
}

// ========================================
// Trip Info Edit Logic (Re-exported from module)
// ========================================
export function openTripInfoModal() {
    return Header.openTripInfoModal();
}

export const closeTripInfoModal = TripInfo.closeTripInfoModal;

export function saveTripInfo() {
    TripInfo.saveTripInfo(
        travelData,
        currentDayIndex,
        updateMeta,
        selectDay,
        renderItinerary,
        autoSave
    );
}

export function resetHeroImage() {
    TripInfo.resetHeroImage(travelData, updateMeta, renderItinerary, autoSave);
}

export function deleteHeroImage() {
    TripInfo.deleteHeroImage(updateMeta, renderItinerary, autoSave);
}

export const selectDay = TripInfo.selectDay;
export const updateMeta = TripInfo.updateMeta;
export const updateTripDate = TripInfo.updateTripDate;
export const updateDateRange = TripInfo.updateDateRange;
export const openLocationSearch = TripInfo.openLocationSearch;
export const toggleGlobalEditMode = TripInfo.toggleGlobalEditMode;

// ========================================
// Expense Logic (Re-exported from module)
// ========================================
export function renderExpenseList(item) {
    ExpenseManager.renderExpenseList(item);
}

export function updateTotalBudget() {
    ExpenseManager.updateTotalBudget(travelData);
}

export function deleteExpense(expIndex) {
    const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
    ExpenseManager.deleteExpense(expIndex, item, travelData, () => {
        renderExpenseList(item);
        renderItinerary();
        autoSave();
    });
}

export function openGoogleMapsExternal() {
    const loc = document.getElementById('detail-location-text').innerText;
    if (loc && loc !== '위치 정보 없음') {
        window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`, '_blank');
    }
}

export function findDirectionsToPlace() {
    const loc = document.getElementById('detail-location-text').innerText;
    if (loc && loc !== '위치 정보 없음') {
        // [Google Maps Directions API] origin omitted defaults to 'My Location'
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(loc)}`, '_blank');
    } else {
        alert('위치 정보가 없어 길찾기를 실행할 수 없습니다.');
    }
}

// ========================================
// Time Picker Logic (Re-exported from module)
// ========================================
// Removed: handleTimeWheel and handleTimeDblClick are now internal to time-picker.js

// ========================================
// Category Picker (Re-exported from module)
// ========================================
export const initCategoryModal = CategoryPicker.initCategoryModal;
export const openCategoryModal = CategoryPicker.openCategoryModal;
export const closeCategoryModal = CategoryPicker.closeCategoryModal;
export const selectCategory = CategoryPicker.selectCategory;

export const initTimeModal = TimePicker.initTimeModal;
export function openTimeModal(targetId) {
    TimePicker.openTimeModal(targetId);
}
export const closeTimeModal = TimePicker.closeTimeModal;
export const confirmTimeSelection = TimePicker.confirmTimeSelection;

// 이동 수단 추가
export function addTransitItem(index, type, dayIndex = currentDayIndex) {
    const targetDay = dayIndex ?? currentDayIndex;
    
    if (dayIndex !== null) {
        setTargetDayIndex(targetDay);
    }

    const day = travelData.days[targetDay];
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
        tagColor: type === 'airplane' ? "blue" : "green",
        isTransit: true,
        transitType: type,
        detailedSteps: [],
        // 비행기 전용 필드
        ...(type === 'airplane' && {
            flightInfo: {
                departure: "",
                arrival: "",
                flightNumber: "",
                bookingRef: "",
                departureTime: "",
                arrivalTime: "",
                terminal: "",
                gate: ""
            }
        })
    };

    // 타임라인에 추가
    day.timeline.splice(index, 0, newItem);
    autoSave();
    renderItinerary();

    // 모든 이동수단은 route-detail-modal에서 수정 모드로 열기
    setTimeout(() => {
        viewRouteDetail(index, targetDay, true);
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
        logger.debug('[TransitDetail] detailedSteps:', item.detailedSteps);
        stepsContainer.classList.remove('hidden');
        stepsList.innerHTML = '';

        item.detailedSteps.forEach((step, idx) => {
            logger.debug(`[TransitDetail] step[${idx}]`, step, 'type:', step.type);
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

// 자동 저장 헬퍼 함수
// AutoSave debouncing
// ✅ Phase 5.2: autoSaveTimeout 제거 - uiState로 마이그레이션
let lastAutoSaveTripId = null;
let lastAutoSavePayload = null;

export async function autoSave(immediate = false) {
    // [Fix] Read-Only 모드에서는 자동 저장 방지
    if (isReadOnlyMode) {
        console.debug('[AutoSave] Skipped: Read-Only Mode');
        return;
    }

    if (!isEditing && currentUser && currentTripId) {
        const saveTask = async () => {
            // [Fix] Ensure tripId is still valid when timeout fires
            if (!currentTripId) return;
            if (lastAutoSaveTripId !== currentTripId) {
                lastAutoSaveTripId = currentTripId;
                lastAutoSavePayload = null;
            }

            // [Added] 저장 중복 방지 (데이터 일관성)
            if (isSaving) {
                console.warn('AutoSave skipped: Save already in progress');
                // 저장이 진행 중이라면, 잠시 후 다시 시도하도록 예약 (선택 사항)
                const oldTimeout = uiState.utility.autoSaveTimeout;
                if (oldTimeout) clearTimeout(oldTimeout);
                const newTimeout = setTimeout(() => autoSave(true), 1000);
                setUiState('utility.autoSaveTimeout', newTimeout);
                return;
            }

            try {
                const serializedData = JSON.stringify(travelData);
                if (serializedData === lastAutoSavePayload) {
                    console.debug('AutoSave skipped: no data change');
                    return;
                }

                setIsSaving(true);
                // [핵심] JSON 변환을 통해 undefined 값을 가진 필드를 자동으로 제거함
                const cleanData = JSON.parse(serializedData);
                // [Fix] merge: true 옵션을 사용하여 isPublic 등 로컬 state에 없는 필드가 삭제되지 않도록 함
                await fetchBackendJson(`/plans/${encodeURIComponent(currentTripId)}/content`, {
                    method: 'PUT',
                    body: {
                        trip: cleanData,
                        sourceClient: 'web'
                    }
                });
                lastAutoSavePayload = serializedData;
                console.debug('AutoSave completed:', new Date().toLocaleTimeString());
            } catch (e) {
                console.error("Auto-save failed", e);
            } finally {
                setIsSaving(false);
            }
        };

        const oldTimeout = uiState.utility.autoSaveTimeout;
        if (oldTimeout) {
            clearTimeout(oldTimeout);
            setUiState('utility.autoSaveTimeout', null);
        }

        if (immediate) {
            await saveTask();
        } else {
            // Debounce: 1000ms 대기 후 저장 (너무 잦은 저장 방지 - 500ms -> 1000ms로 상향)
            const newTimeout = setTimeout(saveTask, 1000);
            setUiState('utility.autoSaveTimeout', newTimeout);
        }
    }
}

export function renderItinerary() {
    Renderers.renderItinerary();
}

// [Added] 현지 시간 및 시차 계산 위젯 업데이트 함수
let timeUpdateInterval = null;

export function updateLocalTimeWidget() {
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

// ✅ Phase 5.6: List 함수들 완전 모듈화 - list-manager.js 통합
export const renderLists = () => Renderers.renderLists();
export const addListItem = ListManager.addListItem;
export const toggleListCheck = ListManager.toggleListCheck;
export const deleteListItem = ListManager.deleteListItem;

// ✅ Phase 5.2: selectedShoppingLocation 제거 - uiState로 마이그레이션
// ✅ Phase 5.5: setupItemAutocomplete, openLocationSearch -> trip-info.js로 이동

// Note: categoryList is now imported from ./ui/constants.js


// ============================================
// Phase 5.4: Re-export from ui-timeline.js
// ============================================
// 일정 CRUD 함수들은 TimelineManager 모듈로 분리됨
export const addTimelineItem = TimelineManager.addTimelineItem;
export const editTimelineItem = TimelineManager.editTimelineItem;
export const deleteTimelineItem = TimelineManager.deleteTimelineItem;
export const moveTimelineItem = TimelineManager.moveTimelineItem;
export const reorderTimeline = TimelineManager.reorderTimeline;
export const recalculateTimeline = TimelineManager.recalculateTimeline;
export const viewTimelineItem = TimelineManager.viewTimelineItem;
export const editCurrentItem = TimelineManager.editCurrentItem;
export const deleteCurrentItem = TimelineManager.deleteCurrentItem;
export const openDeleteConfirmModal = TimelineManager.openDeleteConfirmModal;
export const closeDeleteConfirmModal = TimelineManager.closeDeleteConfirmModal;
export const showTransitRecalculateModal = TimelineManager.showTransitRecalculateModal;
export const closeTransitRecalculateModal = TimelineManager.closeTransitRecalculateModal;
export const openSortMethodModal = TimelineManager.openSortMethodModal;
export const closeSortMethodModal = TimelineManager.closeSortMethodModal;
export const confirmSort = TimelineManager.confirmSort;
export const closeModal = TimelineManager.closeModal;
// 📌 [Fix] Use closeDetailModal from modals.js (with proper unlock scroll)
export const closeDetailModal = closeDetailModalFromModals;
export const setDuration = TimelineManager.setDuration;
export const openGoogleMapsRouteFromPrev = TimelineManager.openGoogleMapsRouteFromPrev;
export const openManualInputModal = TimelineManager.openManualInputModal;
export const closeManualInputModal = TimelineManager.closeManualInputModal;
export const confirmManualInput = TimelineManager.confirmManualInput;
export const useManualInput = TimelineManager.useManualInput;
export const addNoteItem = TimelineManager.addNoteItem;
export const openDayPlanManagerModal = TimelineManager.openDayPlanManagerModal;
export const closeDayPlanManagerModal = TimelineManager.closeDayPlanManagerModal;
export const switchDayPlan = TimelineManager.switchDayPlan;
export const createDayPlan = TimelineManager.createDayPlan;
export const deleteDayPlan = TimelineManager.deleteDayPlan;
export const createDayPlanB = TimelineManager.createDayPlanB;
export const openPlanBModal = TimelineManager.openPlanBModal;
export const closePlanBModal = TimelineManager.closePlanBModal;
export const savePlanB = TimelineManager.savePlanB;

export function closeItemModalWithConfirm() {
    const itemModal = document.getElementById('item-modal');
    if (!itemModal || itemModal.classList.contains('hidden')) {
        closeModal();
        return;
    }

    const confirmed = window.confirm("작성 중인 내용을 닫을까요? 저장하지 않으면 변경 사항이 사라집니다.");
    if (!confirmed) return;

    closeModal();
}



// ... (existing imports) ...

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

    // [DATA PERSISTENCE] Retrieve existing item to preserve auxiliary data
    const timeline = travelData.days[targetDayIndex].timeline;
    let existingItem = null;
    if (editingItemIndex !== null) {
        existingItem = timeline[editingItemIndex];
    }

    const newItem = {
        id: (existingItem && existingItem.id) ? existingItem.id : crypto.randomUUID(), // Preserve ID or generate new
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

    // [DATA PERSISTENCE] Merge auxiliary data from existing item
    if (existingItem) {
        newItem.expenses = existingItem.expenses || [];
        newItem.memories = existingItem.memories || [];
        newItem.attachments = existingItem.attachments || [];
        newItem.budget = existingItem.budget || 0;
        newItem.planB = existingItem.planB || null;
        // Keep original image if not changing category/type implies keep? 
        // Logic currently sets image to null for new item, let's keep existing image if valid and not replaced
        if (existingItem.image && !newItem.image) newItem.image = existingItem.image;
    }

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

    if (editingItemIndex !== null) {
        // 수정
        timeline[editingItemIndex] = newItem;
    } else {
        // 추가 - state에서 insertingItemIndex 가져오기
        const stateInsertingIndex = state.get('insertingItemIndex');
        if (typeof stateInsertingIndex === 'number' && stateInsertingIndex !== null && stateInsertingIndex !== -1) {
            timeline.splice(stateInsertingIndex + 1, 0, newItem);
        } else {
            timeline.push(newItem);
        }
    }

    // 수정 모드였는지 확인하기 위해 미리 저장 (closeModal()이 editingItemIndex를 초기화하므로)
    const wasEditingIndex = editingItemIndex;

    // [핵심] 재정렬 및 이동시간 계산
    reorderTimeline(targetDayIndex);

    closeModal();
    setInsertingItemIndex(null);  // ✅ [FIX] 일정 추가 완료 후 명시적으로 초기화

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

// [Attachment Logic]
export async function handleAttachmentUpload(input, type) {
    const { isGuestMode } = await import('./state.js');
    if (isGuestMode) {
        if (window.openLoginPromptModal) {
            window.openLoginPromptModal("첨부파일 업로드");
        } else {
            alert("첨부파일 업로드 기능은 로그인 후 이용하실 수 있습니다. ✨");
        }
        input.value = "";
        return;
    }
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (countTripAttachments(travelData) >= TRIP_ATTACHMENT_LIMIT) {
            alert(`첨부파일은 한 여행 계획당 최대 ${TRIP_ATTACHMENT_LIMIT}개까지 추가할 수 있습니다.`);
            input.value = "";
            return;
        }

        // 파일 크기 제한: 이미지 5MB, PDF 10MB
        const maxSize = file.type.startsWith('image/') ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            alert(`파일 크기는 ${file.type.startsWith('image/') ? '5MB' : '10MB'} 이하여야 합니다.`);
            input.value = "";
            return;
        }

        try {
            Modals.showLoading();

            const reader = new FileReader();

            reader.onload = async function (e) {
                try {
                    const item = travelData.days[targetDayIndex].timeline[viewingItemIndex];
                    if (!item.attachments) item.attachments = [];

                    let fileUrl = null;

                    // Cloud Functions 대신 직접 Storage 업로드 (보안 및 대용량 처리를 위해)
                    const timestamp = Date.now();
                    const fileExtension = file.name.split('.').pop();
                    const fileName = `attachment_${targetDayIndex}_${viewingItemIndex}_${timestamp}.${fileExtension}`;
                    const storagePath = `attachments/${currentTripId}/${fileName}`;

                    const storageRef = ref(storage, storagePath);

                    // 파일 메타데이터 설정
                    const metadata = {
                        contentType: file.type,
                    };

                    // Upload directly
                    const snapshot = await uploadBytes(storageRef, file, metadata);
                    fileUrl = await getDownloadURL(snapshot.ref);

                    // Server proxy upload was removed; use Firebase Storage SDK directly.

                    item.attachments.push({
                        name: file.name,
                        type: file.type,
                        url: fileUrl // URL로 저장
                    });

                    const containerId = type === 'transit' ? 'transit-attachment-list' : 'detail-attachment-list';
                    renderAttachments(item, containerId);
                    await autoSave();
                    input.value = ""; // Reset input

                    Modals.hideLoading();
                } catch (error) {
                    console.error("첨부파일 업로드 실패:", error);
                    alert('첨부파일 업로드에 실패했습니다: ' + error.message);
                    Modals.hideLoading();
                }
            };

            reader.readAsDataURL(file);
        } catch (error) {
            console.error("파일 읽기 실패:", error);
            alert('파일 읽기에 실패했습니다: ' + error.message);
            input.value = "";
            Modals.hideLoading();
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
    // 기존 라이트박스 모달 가져오기 또는 생성
    let modal = document.getElementById('attachment-lightbox-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'attachment-lightbox-modal';
        modal.className = `fixed inset-0 bg-black/90 z-[300] hidden flex items-center justify-center p-4`;
        modal.innerHTML = `
            <button data-action="close-lightbox" class="absolute top-4 right-4 text-white hover:text-gray-300 z-10 p-2">
                <span class="material-symbols-outlined text-3xl">close</span>
            </button>
            <div id="attachment-lightbox-content" class="max-w-full max-h-full overflow-auto flex items-center justify-center">
            </div>
        `;
        // 배경 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAttachmentLightbox();
            }
        });
        document.body.appendChild(modal);
    }

    const content = document.getElementById('attachment-lightbox-content');
    const safeType = String(type || '').trim().toLowerCase();
    const safeUrl = safeType.startsWith('image/')
        ? sanitizeImageUrl(data, '')
        : sanitizeFileUrl(data, '');

    const buildActionLink = (href, label, icon, className, { openInNewTab = false, download = false } = {}) => {
        const link = document.createElement('a');
        link.href = href;
        link.className = className;
        if (openInNewTab) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        }
        if (download) {
            link.download = '';
        }

        const iconEl = document.createElement('span');
        iconEl.className = 'material-symbols-outlined';
        iconEl.textContent = icon;
        link.appendChild(iconEl);
        link.append(` ${label}`);
        return link;
    };

    const buildBlockedNotice = () => {
        const wrapper = document.createElement('div');
        wrapper.className = 'bg-white dark:bg-gray-800 p-8 rounded-xl text-center';

        const iconEl = document.createElement('span');
        iconEl.className = 'material-symbols-outlined text-6xl text-amber-400 mb-4 block';
        iconEl.textContent = 'warning';
        wrapper.appendChild(iconEl);

        const textEl = document.createElement('p');
        textEl.className = 'text-gray-600 dark:text-gray-300';
        textEl.textContent = '안전하지 않은 링크는 열 수 없어요.';
        wrapper.appendChild(textEl);

        return wrapper;
    };

    content.replaceChildren();

    if (!safeUrl) {
        content.appendChild(buildBlockedNotice());
    } else if (safeType.startsWith('image/')) {
        const image = document.createElement('img');
        image.src = safeUrl;
        image.className = 'max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl';
        image.alt = '첨부 이미지';
        content.appendChild(image);
    } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'bg-white dark:bg-gray-800 p-8 rounded-xl text-center';

        const iconEl = document.createElement('span');
        iconEl.className = `material-symbols-outlined text-6xl mb-4 block ${safeType === 'application/pdf' ? 'text-red-400' : 'text-gray-400'}`;
        iconEl.textContent = safeType === 'application/pdf' ? 'picture_as_pdf' : 'description';
        wrapper.appendChild(iconEl);

        const textEl = document.createElement('p');
        textEl.className = 'text-gray-600 dark:text-gray-300 mb-6';
        textEl.textContent = safeType === 'application/pdf'
            ? 'PDF 파일은 앱 내에서 직접 볼 수 없습니다.'
            : '이 파일 형식은 미리보기가 지원되지 않습니다.';
        wrapper.appendChild(textEl);

        const actions = document.createElement('div');
        actions.className = 'flex flex-col sm:flex-row gap-3 justify-center';

        if (safeType === 'application/pdf') {
            actions.appendChild(
                buildActionLink(
                    safeUrl,
                    '새 탭에서 열기',
                    'open_in_new',
                    'px-6 py-3 bg-primary text-white rounded-lg font-bold hover:bg-orange-600 transition-colors inline-flex items-center gap-2 justify-center',
                    { openInNewTab: true }
                )
            );
        }

        actions.appendChild(
            buildActionLink(
                safeUrl,
                '다운로드',
                'download',
                `${safeType === 'application/pdf' ? 'px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors inline-flex items-center gap-2 justify-center' : 'px-6 py-3 bg-primary text-white rounded-lg font-bold hover:bg-orange-600 transition-colors inline-flex items-center gap-2'}`,
                { download: true }
            )
        );

        wrapper.appendChild(actions);
        content.appendChild(wrapper);
    }

    modal.classList.remove('hidden');

    // ESC 키로 닫기
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeAttachmentLightbox();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

export function closeAttachmentLightbox() {
    const modal = document.getElementById('attachment-lightbox-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

export async function handleImageUpload(input) {
    if (!input.files || !input.files[0]) return;

    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
        alert("파일 크기는 5MB 이하여야 합니다.");
        input.value = "";
        return;
    }

    try {
        Modals.showLoading();

        // Guest mode keeps local data URL flow.
        if (getIsGuestMode() || !currentUser || !currentTripId) {
            await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    updateMeta('mapImage', e.target.result);
                    renderItinerary();
                    input.value = "";
                    resolve();
                };
                reader.onerror = () => reject(new Error("이미지 로컬 읽기에 실패했습니다."));
                reader.readAsDataURL(file);
            });
            return;
        }

        const timestamp = Date.now();
        const fileExtension = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const fileName = `hero_${timestamp}.${fileExtension}`;
        const storagePath = `attachments/${currentTripId}/${fileName}`;
        const storageRef = ref(storage, storagePath);
        const metadata = { contentType: file.type || 'image/jpeg' };

        const snapshot = await uploadBytes(storageRef, file, metadata);
        const fileUrl = await getDownloadURL(snapshot.ref);

        updateMeta('mapImage', fileUrl);
        renderItinerary();
        input.value = "";
        console.info("[TripImage] Hero image uploaded", { storagePath, fileUrl });
    } catch (error) {
        console.error("Image upload failed:", error);
        alert("이미지 업로드에 실패했습니다.");
    } finally {
        Modals.hideLoading();
    }
}
// [Route View Logic]
let routeMap = null;
let routePolyline = null;
let routeMarkers = [];
let routePopup = null;

// [Modified] Map handling synced with viewer.js
import { transferMapToModal, transferMapToPreview, renderRouteOnMap } from './map.js';

export async function openRouteModal() {
    const modal = document.getElementById('route-modal');
    if (modal) {
        modal.classList.remove('hidden');

        // 1. 지도 이동 (Preview -> Modal)
        transferMapToModal();

        // 2. 경로 데이터 최신화
        await renderRouteOnMap();
    }
}

export function closeRouteModal() {
    const modal = document.getElementById('route-modal');
    if (modal) {
        modal.classList.add('hidden');
        transferMapToPreview();
    }
}



// 화면 아무곳이나 클릭하면 열린 메뉴 닫기
window.addEventListener('click', (e) => {
    // 메뉴 버튼이나 메뉴 내부를 클릭한 경우는 제외
    if (!e.target.closest('[id^="trip-menu-"]') && !e.target.closest('[data-action="toggle-trip-menu"]') && !e.target.closest('button[onclick*="toggleTripMenu"]')) {
        document.querySelectorAll('[id^="trip-menu-"]').forEach(el => el.classList.add('hidden'));
    }
});

// [State & UI Sync Functions]
// ✅ Phase 5.5: updateMeta, updateTripDate -> trip-info.js로 이동

export function updateTimeline(dayIndex, itemIndex, key, value) {
    updateTimelineItemState(dayIndex, itemIndex, key, value);
    renderItinerary();
    autoSave();
}

// ✅ Phase 5.5: updateDateRange -> trip-info.js로 이동

// [Trips Logic]
export const loadTripList = Trips.loadTripList;
// Note: openTrip and checkInviteLink are defined in this file, not in Trips module
export const createNewTrip = Trips.createNewTrip;
export const closeNewTripModal = Trips.closeNewTripModal;
export const nextWizardStep = Trips.nextWizardStep;
export const finishNewTripWizard = Trips.finishNewTripWizard;
export const deleteTrip = Trips.deleteTrip;
export const duplicateTrip = Trips.duplicateTrip;
export const executeDuplicate = Trips.executeDuplicate;
export const closeCopyOptionsModal = Trips.closeCopyOptionsModal;
export const loginWithGuestData = Auth.loginWithGuestData;
export const switchTab = Navigation.switchTab;


// [Memory Logic]
export const getTripStatus = Memories.getTripStatus;
export const addMemoryItem = Memories.addMemoryItem;
export const closeMemoryModal = Memories.closeMemoryModal;
export const handleMemoryPhotoChange = Memories.handleMemoryPhotoChange;
export const clearMemoryPhoto = Memories.clearMemoryPhoto;
export const saveMemoryItem = Memories.saveMemoryItem;
export const deleteMemory = Memories.deleteMemory;
// [New] 전역 수정 모드 (기존 추억 잠금 대체)
// ✅ Phase 5.5: toggleGlobalEditMode -> trip-info.js로 이동
// 📌 [Phase 6.9] Window assignments 제거 - React 마이그레이션 준비
// ✅ Phase 5.5: Weather/Context functions window assignment moved after export const

// [Fix] Touch Violation Warnings (Explicit Non-Passive Registration)
(function () {
    const openHeroContextMenu = () => {
        if (window.isReadOnlyMode || !window.isGlobalEditMode) return;
        const hero = document.getElementById('trip-hero');
        if (!hero) return;
        const rect = hero.getBoundingClientRect();
        UIContext.openContextMenu({
            preventDefault: () => { },
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        }, 'hero');
    };

    const openTripInfoEditor = () => {
        if (window.isReadOnlyMode || !window.isGlobalEditMode) return;
        window.openTripInfoModal?.();
    };

    // 🔄 [DI Pattern] Local function wrappers for injectedHandlers
    const duplicateTrip = (...args) => Trips.duplicateTrip(...args);
    const executeDuplicate = (...args) => Trips.executeDuplicate(...args);
    const closeCopyOptionsModal = (...args) => Trips.closeCopyOptionsModal(...args);
    const openRevisionHistory = (...args) => Header.openTripRevisionHistoryModal(...args);
    const loginWithGuestData = (...args) => Auth.loginWithGuestData(...args);
    const switchTab = (...args) => Navigation.switchTab(...args);

    const attachHandlers = () => {
        // === Phase 4: Initialize Event Delegation ===
        initEventDelegation();
        
        // ✅ [React Migration] Inject handlers into modal for DI pattern
        injectModalHandlers({
            addTimelineItem,
            addMemoryItem,
            addNoteItem,
            addFastestTransitItem: window.addFastestTransitItem,
            addTransitItem,
            openCopyItemModal: Modals.openCopyItemModal,
            openPlanBModal
        });
        
        // ✅ [React Migration] Inject handlers into event delegation for DI pattern
        injectEventHandlers({
            isEditing: state.get('isEditing'),
            categoryList: window.categoryList || [],
            editTimelineItem,
            viewTimelineItem,
            deleteTimelineItem,
            openAddModal,
            selectAddType,
            viewRouteDetail,
            openLightbox,
            toggleListCheck,
            deleteListItem,
            openShoppingListModal,
            openChecklistModal,
            openAttachment,
            deleteAttachment,
            navigateWeatherWeek,
            selectWeatherDate,
            editCurrentItem,
            deleteCurrentItem,
            closeDetailModal,
            closeAttachmentLightbox,
            handleContextAction,
            closeContextMenu,
            addExpenseFromDetail,
            deleteExpenseFromDetail,
            openGoogleMapsExternal,
            findDirectionsToPlace,
            openGoogleMapsRouteFromPrev,
            closeMemoModal,
            deleteCurrentMemo,
            editCurrentMemo,
            nextWizardStep,
            finishNewTripWizard,
            useManualInput,
            closeNewTripModal,
            openTrip,
            toggleTripMenu,
            openShareModal,
            openRevisionHistory,
            duplicateTrip,
            deleteTrip,
            createNewTrip,
            closeCopyOptionsModal,
            executeDuplicate,
            backToMain,
            loginWithGuestData,
            openUserMenu,
            openUserSettings,
            openUserProfile,
            confirmLogout,
            switchTab,
            toggleGlobalEditMode,
            openRouteModal,
            openWeatherDetailModal,
            openExpenseDetailModal,
            openHeroContextMenu,
            openTripInfoEditor,
            enableProfileEdit,
            cancelProfileEdit,
            saveProfileChanges,
            confirmWithdrawal,
            closeTripSelectionModal,
            saveNewItem,
            savePlanB,
            closeModal,
            closePlanBModal,
            closeDayPlanManagerModal,
            createDayPlan,
            switchDayPlan,
            deleteDayPlan,
            closeItemModalWithConfirm,
            openCategoryModal,
            openTimeModal,
            setDuration,
            openAiRecommendModal,
            Auth
        });
        
        // ✅ [React Migration] Inject handlers into map for DI pattern
        injectMapHandlers({
            updateMeta,
            renderItinerary
        });
        
        // ✅ [React Migration] Inject handlers into timeline for DI pattern
        injectTimelineHandlers({
            categoryList: window.categoryList || [],
            getIsGlobalEditMode: () => window.isGlobalEditMode,
            getMapsApiKey,
            renderItinerary,
            autoSave,
            renderExpenseList,
            renderAttachments,
            pushModalState,
            lockBodyScroll: Modals.lockBodyScroll,
            popModalState,
            unlockBodyScroll,
            closeDetailModal,
            updateTotalBudget,
            viewRouteDetail
        });
        
        // ✅ [React Migration] Inject handlers into memory renderer for DI pattern
        Renderers.injectMemoryHandlers({
            openLightbox: Modals.openLightbox,
            openContextMenu: UIContext.openContextMenu
        });
        
        const hero = document.getElementById('trip-hero');
        const info = document.getElementById('trip-info-container');

        if (hero) {
            hero.addEventListener('contextmenu', (e) => {
                if (window.isReadOnlyMode || !window.isGlobalEditMode) return;
                e.preventDefault();
            });
        }
        if (info) {
            info.addEventListener('contextmenu', (e) => {
                if (window.isReadOnlyMode || !window.isGlobalEditMode) return;
                e.preventDefault();
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attachHandlers);
    } else {
        setTimeout(attachHandlers, 100); // UI 렌더링 대기
    }
})();
bindMainWindowBridge({
    Modals,
    Profile,
    Header,
    ExpenseDetail,
    closeTripInfoModal,
    saveTripInfo,
    resetHeroImage,
    deleteHeroImage,
    openRouteModal,
    closeRouteModal,
    editCurrentItem,
    deleteCurrentItem,
    openCopyItemModal,
    closeCopyItemModal,
    copyItemToCurrent,
    handleAttachmentUpload,
    renderExpenseList,
    deleteAttachment,
    openAttachment,
    closeAttachmentLightbox,
    autoSave
});

export function enablePlaceNoteEdit() {
    const textarea = document.getElementById('detail-note');
    if (!textarea) return;

    // Make editable
    textarea.readOnly = false;
    textarea.classList.remove('cursor-pointer');
    textarea.classList.add('ring-2', 'ring-primary', 'bg-white', 'dark:bg-gray-800', 'p-2');

    // Focus and place cursor at end
    textarea.focus();
    const val = textarea.value;
    textarea.value = '';
    textarea.value = val;

    // Handle blur (save & reset)
    const handleBlur = () => {
        textarea.readOnly = true;
        textarea.classList.add('cursor-pointer');
        textarea.classList.remove('ring-2', 'ring-primary', 'bg-white', 'dark:bg-gray-800', 'p-2');

        // Remove event listener to prevent multiple bindings
        textarea.removeEventListener('blur', handleBlur);
    };

    textarea.addEventListener('blur', handleBlur);
}
window.enablePlaceNoteEdit = enablePlaceNoteEdit;


function legacy_openExpenseDetailModal() {
    const modal = document.getElementById('expense-detail-modal');
    if (!modal) return; // Ensure modal exists

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
                        item.expenses.forEach((exp, expIdx) => {
                            const amount = Number(exp.amount || 0);
                            if (amount > 0) {
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
                                    amount: amount,
                                    dayIdx: dayIdx,
                                    itemIdx: itemIdx,
                                    expIdx: expIdx
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
                    expenses: dayExpenses,
                    originalDayIdx: dayIdx // [Added] for add button
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
                    <div class="flex items-center gap-2">
                        <h5 class="font-bold text-gray-800 dark:text-white">${dayData.date}</h5>
                        <button data-action="add-expense" data-day="${dayData.originalDayIdx}" class="text-xs bg-primary/10 hover:bg-primary/20 text-primary px-2 py-1 rounded transition-colors font-bold flex items-center gap-1">
                            <span class="material-symbols-outlined text-sm">add</span> 추가
                        </button>
                    </div>
                    <p class="text-lg font-bold text-primary">₩${dayData.total.toLocaleString()}</p>
                </div>
                <div class="space-y-2">
                    ${dayData.expenses.map(exp => `
                        <div class="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-900 p-2 rounded-lg group">
                            <div class="flex-1 min-w-0">
                                <p class="font-medium text-gray-700 dark:text-gray-300 truncate">${exp.title}</p>
                                <p class="text-xs text-gray-500 dark:text-gray-400">${exp.description}</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <p class="font-bold text-gray-800 dark:text-white ml-2">₩${exp.amount.toLocaleString()}</p>
                                ${(exp.dayIdx !== undefined) ? `
                                <button data-action="delete-expense" data-day="${exp.dayIdx}" data-item="${exp.itemIdx}" data-expense="${exp.expIdx}" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1" title="삭제">
                                    <span class="material-symbols-outlined text-sm">delete</span>
                                </button>` : ''}
                            </div>
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

function legacy_closeExpenseDetailModal() {
    document.getElementById('expense-detail-modal').classList.add('hidden');
}

function legacy_calculateSplit() {
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

// window.calculateSplit = calculateSplit;

// [Added] Add expense from detail view
export function addExpenseFromDetail(dayIdx) {
    Modals.openExpenseModal(dayIdx);
}

// [Added] Delete expense from detail view
export function deleteExpenseFromDetail(dayIdx, itemIdx, expIdx) {
    // [User Request] Remove confirmation
    // if (!confirm('이 지출 내역을 삭제하시겠습니까?')) return;

    // dayIdx 검증
    if (dayIdx < 0 || dayIdx >= travelData.days.length) return;
    const day = travelData.days[dayIdx];

    // itemIdx 검증
    if (itemIdx < 0 || itemIdx >= day.timeline.length) return;
    const item = day.timeline[itemIdx];

    // item 검증 (sparse array 등 대비)
    if (!item) return;

    // expIdx 검증
    if (!item.expenses || expIdx < 0 || expIdx >= item.expenses.length) return;

    // 삭제
    item.expenses.splice(expIdx, 1);

    // 재계산 (budget 필드 업데이트)
    const sum = item.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    item.budget = sum;

    // 전체 예산 재계산
    ExpenseManager.updateTotalBudget(travelData);

    // 화면 갱신
    openExpenseDetailModal();
    renderItinerary();
    autoSave();
};

// [Context Menu Logic]
// ✅ Phase 5.5: Context menu functions -> ui-context.js로 이동

// Window assignment first (avoid TDZ issues)
window.openContextMenu = UIContext.openContextMenu;
window.closeContextMenu = UIContext.closeContextMenu;
window.handleContextAction = UIContext.handleContextAction;

export const openContextMenu = UIContext.openContextMenu;
export const closeContextMenu = UIContext.closeContextMenu;
export const handleContextAction = UIContext.handleContextAction;

// ✅ Phase 5.5: Weather functions -> weather.js로 완전 이동
// Legacy functions removed: legacy_openWeatherDetailModal, loadAndRenderWeeklyWeather, renderWeeklyWeather, loadAndRenderHourlyWeather

// Export and window assignment together (avoid TDZ issues)
window.openWeatherDetailModal = Weather.openWeatherDetailModal;
window.ensureWeatherDetailModal = Weather.ensureWeatherDetailModal;
window.selectWeatherDate = Weather.selectWeatherDate;
window.navigateWeatherWeek = Weather.navigateWeatherWeek;
window.closeWeatherDetailModal = Weather.closeWeatherDetailModal;

export const openWeatherDetailModal = Weather.openWeatherDetailModal;
export const ensureWeatherDetailModal = Weather.ensureWeatherDetailModal;
export const selectWeatherDate = Weather.selectWeatherDate;
export const navigateWeatherWeek = Weather.navigateWeatherWeek;
export const closeWeatherDetailModal = Weather.closeWeatherDetailModal;

export function openCopyItemModal(...args) { return Modals.openCopyItemModal(...args); }
export function closeCopyItemModal(...args) { return Modals.closeCopyItemModal(...args); }
export function copyItemToCurrent(...args) { return Modals.copyItemToCurrent(...args); }



// Expense Modal Bindings
export const ensureExpenseModal = Modals.ensureExpenseModal;
export const openExpenseModal = Modals.openExpenseModal;
export const closeExpenseModal = Modals.closeExpenseModal;

// ✅ Weather bindings moved earlier (line ~2625) to avoid TDZ issues

// [Automated] Window Global Binding
// 모든 export된 함수와 객체를 window 객체에 자동으로 바인딩하여 HTML onclick 등에서 접근 가능하게 함
import * as UI from './ui.js';
Object.keys(UI).forEach(key => {
    if (typeof UI[key] === 'function' || typeof UI[key] === 'object') {
        window[key] = UI[key];
    }
});

window.addExpenseFromDetail = function (dayIdx) {
    if (dayIdx < 0 || dayIdx >= travelData.days.length) return;
    const day = travelData.days[dayIdx];
    if (!day.timeline || day.timeline.length === 0) {
        alert('해당 날짜에 일정이 없어 지출을 추가할 수 없습니다.');
        return;
    }
    // 마지막 일정에 추가
    const itemIdx = day.timeline.length - 1;
    setTargetDayIndex(dayIdx);
    setViewingItemIndex(itemIdx);

    // window.isAddingFromDetail = true; // Handled in openExpenseModal
    Modals.openExpenseModal(dayIdx, true);
};

// 추가적으로 필요한 모듈 바인딩 (import * as 문법으로 가져온 모듈들)
window.Modals = Modals;
// [Fix] Manually bind saveExpense for HTML onclick handlers
window.saveExpense = Modals.saveExpense;
window.Renderers = Renderers;
window.Auth = Auth;
window.Profile = Profile;
window.Trips = Trips;
window.Memories = Memories;
window.ListManager = ListManager;
window.openShoppingListModal = ListManager.openShoppingListModal;
window.openChecklistModal = ListManager.openChecklistModal;
window.closeListModal = ListManager.closeListModal;

// ✅ Phase 5.5: Initialize context menu listeners
UIContext.initContextMenuListeners();

// console.debug('[UI] Window global bindings initialized');

// [Redirect] Legacy Share Link Support
(function () {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    if (shareId) {
        window.location.replace(`/v/${encodeURIComponent(shareId)}`);
    }
})();
