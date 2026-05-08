// Drag and Drop Module (Enhanced with Custom Ghost & Auto-scroll)
// Handles desktop drag-drop, mobile touch drag with custom visual feedback

import { travelData, setTravelData, uiState, setUiState } from '../state.js';
import { Z_INDEX } from './constants.js';

// ✅ Phase 5.2: State 변수 제거 - 모두 uiState로 마이그레이션
// 대신 이제 uiState.drag 객체를 사용

// Auto-scroll configuration (확대된 영역)
const AUTO_SCROLL_TOP_ZONE = 150;    // 상단 150px
const AUTO_SCROLL_BOTTOM_ZONE = 200; // 하단 200px  
const SCROLL_SPEED_MIN = 5;
const SCROLL_SPEED_MAX = 20;

/**
 * Desktop drag start handler
 */
export function dragStart(ev, itemIndex, dayIndex) {
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'single',
        index: itemIndex,
        dayIndex: dayIndex
    }));

    setUiState('drag.draggingIndex', itemIndex);
    setUiState('drag.dragSourceElement', ev.currentTarget);
    setUiState('drag.isDesktopDragging', true);

    // 원래 자리 효과: 투명도 + 흔들림
    const element = uiState.drag.dragSourceElement;
    element.classList.add('dragging');
    element.classList.add('shake-animation');

    // 웹 자동 스크롤 시작
    startDesktopAutoScroll();
}

/**
 * Desktop drag end handler
 */
export function dragEnd(ev) {
    setUiState('drag.isDesktopDragging', false);
    stopDesktopAutoScroll();

    document.querySelectorAll('.dragging').forEach(el => {
        el.classList.remove('dragging');
        el.classList.remove('shake-animation');
    });

    const dragSourceElement = uiState.drag.dragSourceElement;
    if (dragSourceElement) {
        dragSourceElement.classList.remove('shake-animation');
        setUiState('drag.dragSourceElement', null);
    }

    setUiState('drag.draggingIndex', null);
    clearDragStyles();
}

/**
 * Desktop drag over handler
 */
export function dragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';

    // 마우스 Y 위치 저장 (자동 스크롤용)
    setUiState('drag.lastDragClientY', ev.clientY);

    const target = ev.currentTarget;
    const indicator = target.querySelector('.drag-indicator');
    if (indicator && !indicator.classList.contains('hidden')) return;

    clearDragStyles();
    if (indicator) indicator.classList.remove('hidden');
}

/**
 * Desktop drag leave handler
 */
export function dragLeave(ev) {
    const target = ev.currentTarget;
    if (target.contains(ev.relatedTarget)) return;

    const indicator = target.querySelector('.drag-indicator');
    if (indicator) indicator.classList.add('hidden');
}

/**
 * Clear all drag visual indicators
 */
function clearDragStyles() {
    document.querySelectorAll('.group\\/timeline-item').forEach(el => {
        const indicator = el.querySelector('.drag-indicator');
        if (indicator) indicator.classList.add('hidden');
    });
}

/**
 * 웹 자동 스크롤 시작
 */
function startDesktopAutoScroll() {
    if (uiState.drag.autoScrollAnimationId) return;

    const autoScroll = () => {
        if (!uiState.drag.isDesktopDragging) {
            stopDesktopAutoScroll();
            return;
        }

        const clientY = uiState.drag.lastDragClientY;
        const viewportHeight = window.innerHeight;
        let scrollAmount = 0;

        // 상단 스크롤 영역
        if (clientY < AUTO_SCROLL_TOP_ZONE) {
            const intensity = 1 - (clientY / AUTO_SCROLL_TOP_ZONE);
            scrollAmount = -(SCROLL_SPEED_MIN + (intensity * (SCROLL_SPEED_MAX - SCROLL_SPEED_MIN)));
        }
        // 하단 스크롤 영역
        else if (clientY > viewportHeight - AUTO_SCROLL_BOTTOM_ZONE) {
            const distanceFromBottom = viewportHeight - clientY;
            const intensity = 1 - (distanceFromBottom / AUTO_SCROLL_BOTTOM_ZONE);
            scrollAmount = SCROLL_SPEED_MIN + (intensity * (SCROLL_SPEED_MAX - SCROLL_SPEED_MIN));
        }

        if (scrollAmount !== 0) {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            const currentScroll = window.scrollY || window.pageYOffset;

            if ((scrollAmount > 0 && currentScroll < maxScroll) ||
                (scrollAmount < 0 && currentScroll > 0)) {
                window.scrollBy(0, scrollAmount);
            }
        }

        const animId = requestAnimationFrame(autoScroll);
        setUiState('drag.autoScrollAnimationId', animId);
    };

    const animId = requestAnimationFrame(autoScroll);
    setUiState('drag.autoScrollAnimationId', animId);
}

/**
 * 웹 자동 스크롤 중지
 */
function stopDesktopAutoScroll() {
    const animId = uiState.drag.autoScrollAnimationId;
    if (animId) {
        cancelAnimationFrame(animId);
        setUiState('drag.autoScrollAnimationId', null);
    }
}

/**
 * Desktop drop handler
 */
export function drop(ev, targetIndex, targetDayIndex, moveCallback) {
    ev.preventDefault();
    ev.stopPropagation();
    clearDragStyles();

    const data = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
    const dropIndex = parseInt(ev.currentTarget?.getAttribute('data-drop-index') || targetIndex);
    const sourceDayIndex = data.dayIndex !== undefined ? data.dayIndex : targetDayIndex;

    if (data.type === 'group' && data.indices && data.indices.length > 0) {
        if (moveCallback) moveCallback(data.indices, dropIndex, sourceDayIndex);
    } else if (data.type === 'single' && data.index !== undefined) {
        if (moveCallback) moveCallback(data.index, dropIndex, sourceDayIndex);
    } else {
        const fromIndex = parseInt(ev.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex) && moveCallback) {
            moveCallback(fromIndex, dropIndex, targetDayIndex);
        }
    }
}

/**
 * Timeline container drop handler
 */
export function timelineContainerDrop(ev, dayIndex, moveCallback) {
    ev.preventDefault();
    ev.stopPropagation();
    clearDragStyles();

    const data = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
    const timeline = travelData.days[dayIndex]?.timeline;
    if (!timeline) return;

    if (data.type === 'single' && data.index !== undefined) {
        if (moveCallback) moveCallback(data.index, timeline.length, dayIndex);
    } else {
        const fromIndex = parseInt(ev.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex) && moveCallback) {
            moveCallback(fromIndex, timeline.length, dayIndex);
        }
    }
}

/**
 * 커스텀 드래그 고스트 생성 (카드만 복제)
 */
function createCustomDragGhost(sourceElement) {
    // 카드 부분만 찾기
    const cardSelectors = [
        '.bg-card-light', '.bg-card-dark',
        '.bg-yellow-50', '.bg-blue-50\\/50',
        '[class*="bg-card"]', '[class*="rounded-"]'
    ];

    let card = null;
    for (const selector of cardSelectors) {
        card = sourceElement.querySelector(selector);
        if (card) break;
    }

    if (!card) {
        // 폴백: 두 번째 자식 요소 (아이콘 다음이 카드)
        card = sourceElement.querySelector('[class*="pb-2"]')?.firstElementChild;
    }

    if (!card) return null;

    // 고스트 생성
    const ghost = card.cloneNode(true);
    ghost.id = 'custom-drag-ghost';
    ghost.className = 'drag-ghost';
    ghost.style.opacity = '0.98';
    ghost.style.transform = 'rotate(2deg) scale(1.0)';
    ghost.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.4)';
    ghost.style.maxWidth = '320px';

    return ghost;
}

/**
 * 고스트 위치 업데이트
 */
function updateGhostPosition(clientX, clientY) {
    if (!customDragGhost) return;

    const ghostWidth = customDragGhost.offsetWidth || 280;
    const ghostHeight = customDragGhost.offsetHeight || 100;

    // 손가락/마우스 위에 위치
    const left = clientX - (ghostWidth / 2);
    const top = clientY - (ghostHeight / 2) - 20; // 약간 위로

    customDragGhost.style.left = `${left}px`;
    customDragGhost.style.top = `${top}px`;
}

/**
 * 고스트 제거
 */
function removeDragGhost() {
    const customDragGhost = uiState.drag.customDragGhost;
    if (customDragGhost && customDragGhost.parentNode) {
        customDragGhost.parentNode.removeChild(customDragGhost);
    }
    setUiState('drag.customDragGhost', null);
}

/**
 * Touch drag start handler (long press)
 */
export function touchStart(e, index, type, isEditing) {
    // [Fix] 뷰어 모드(공개 링크)에서는 터치 드래그 로직 완전 차단
    if (document.body.classList.contains('viewer-mode')) return;

    // [New] 수정 모드일 때만 드래그 가능하도록 수정
    // (사용자 요청: 수정 완료 모드일 때는 드래그앤드롭 안 되게)
    if (!isEditing) return;

    const currentTarget = e.currentTarget; // [Fix] 클로저 캡처를 위해 즉시 저장
    const touch = e.touches[0];
    setUiState('drag.touchStartX', touch.clientX);
    setUiState('drag.touchStartY', touch.clientY);

    const touchTimer = setTimeout(() => {
        setUiState('drag.isTouchDragging', true);
        setUiState('drag.touchStartIndex', index);
        setUiState('drag.dragSourceElement', currentTarget);

        // iOS/Android 네이티브 드래그/복사 방지
        e.preventDefault();

        // 원래 자리 효과: 투명도 + 흔들림
        const dragSourceElement = uiState.drag.dragSourceElement;
        if (dragSourceElement) {
            dragSourceElement.classList.add('dragging');
            dragSourceElement.classList.add('shake-animation');
        }

        // 커스텀 드래그 고스트 생성
        const ghost = createCustomDragGhost(dragSourceElement);
        setUiState('drag.customDragGhost', ghost);
        if (ghost) {
            document.body.appendChild(ghost);
            updateGhostPosition(touch.clientX, touch.clientY);
        }

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(50);

    }, 300); // 300ms 롱프레스
    
    setUiState('drag.touchLongPressTimer', touchTimer);
}

/**
 * Touch move handler
 */
export function touchMove(e) {
    // [Fix] 뷰어 모드 차단
    if (document.body.classList.contains('viewer-mode')) return;

    // 롱프레스 타이머 취소 (스크롤 시)
    const touch = e.touches[0];
    const moveX = Math.abs(touch.clientX - uiState.drag.touchStartX);
    const moveY = Math.abs(touch.clientY - uiState.drag.touchStartY);

    if (moveX > 10 || moveY > 10) {
        const timer = uiState.drag.touchLongPressTimer;
        if (timer) {
            clearTimeout(timer);
            setUiState('drag.touchLongPressTimer', null);
        }
    }

    if (uiState.drag.isTouchDragging) {
        e.preventDefault(); // 스크롤 방지
        e.stopPropagation();

        // 고스트 위치 업데이트
        updateGhostPosition(touch.clientX, touch.clientY);

        // 자동 스크롤
        const clientY = touch.clientY;
        const viewportHeight = window.innerHeight;
        let scrollAmount = 0;

        if (clientY < AUTO_SCROLL_TOP_ZONE) {
            const intensity = 1 - (clientY / AUTO_SCROLL_TOP_ZONE);
            scrollAmount = -(SCROLL_SPEED_MIN + (intensity * (SCROLL_SPEED_MAX - SCROLL_SPEED_MIN)));
        } else if (clientY > viewportHeight - AUTO_SCROLL_BOTTOM_ZONE) {
            const distanceFromBottom = viewportHeight - clientY;
            const intensity = 1 - (distanceFromBottom / AUTO_SCROLL_BOTTOM_ZONE);
            scrollAmount = SCROLL_SPEED_MIN + (intensity * (SCROLL_SPEED_MAX - SCROLL_SPEED_MIN));
        }

        if (scrollAmount !== 0) {
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
            const currentScroll = window.scrollY || window.pageYOffset;

            if ((scrollAmount > 0 && currentScroll < maxScroll) ||
                (scrollAmount < 0 && currentScroll > 0)) {
                window.scrollBy(0, scrollAmount);
            }
        }
    }
}

/**
 * Touch end handler
 */
export function touchEnd(e, targetDayIndex, moveCallback) {
    clearTimeout(uiState.drag.touchLongPressTimer);
    const longPressTimer = uiState.drag.longPressTimer;
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        setUiState('drag.longPressTimer', null);
    }

    if (uiState.drag.isTouchDragging) {
        setUiState('drag.isTouchDragging', false);

        // 원래 자리 복원
        const dragSourceElement = uiState.drag.dragSourceElement;
        if (dragSourceElement) {
            dragSourceElement.classList.remove('dragging');
            dragSourceElement.classList.remove('shake-animation');
        }

        // 고스트 제거
        removeDragGhost();
        clearDragStyles();

        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetItem = element?.closest('.group\\/timeline-item');

        if (targetItem && targetItem.dataset.index) {
            const targetIndex = parseInt(targetItem.dataset.index);
            if (moveCallback) {
                moveCallback(uiState.drag.touchStartIndex, targetIndex, targetDayIndex);
            }
        }

        setUiState('drag.draggingIndex', null);
        setUiState('drag.dragSourceElement', null);
    }
}

/**
 * Reorder timeline items
 */
export function reorderTimeline(dayIndex, fromIndex, toIndex) {
    const arr = travelData.days[dayIndex].timeline;
    if (!arr || fromIndex === toIndex) return;
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
    setTravelData(travelData);
}

/**
 * Move timeline item with index adjustment
 */
export function moveTimelineItem(fromIndex, targetIndex, dayIndex, travelData) {
    const timeline = travelData.days[dayIndex].timeline;

    if (fromIndex === targetIndex || fromIndex === targetIndex - 1) return;

    const movedItem = timeline[fromIndex];
    timeline.splice(fromIndex, 1);

    let insertIndex = targetIndex;
    if (fromIndex < targetIndex) {
        insertIndex = targetIndex - 1;
    }

    timeline.splice(insertIndex, 0, movedItem);
}

export default {
    dragStart,
    dragEnd,
    dragOver,
    dragLeave,
    drop,
    timelineContainerDrop,
    touchStart,
    touchMove,
    touchEnd,
    reorderTimeline,
    moveTimelineItem,
    clearDragStyles
};
