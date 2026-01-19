// Drag and Drop Module (Enhanced with Custom Ghost & Auto-scroll)
// Handles desktop drag-drop, mobile touch drag with custom visual feedback

import { travelData, setTravelData } from '../state.js';

// Desktop drag state
let draggingIndex = null;
let dragSourceElement = null;
let isDesktopDragging = false;
let lastDragClientY = 0;
let autoScrollAnimationId = null;

// Touch drag state
let touchLongPressTimer = null;
let longPressTimer = null;
let isTouchDragging = false;
let touchStartIndex = null;
let customDragGhost = null;
let touchStartX = 0;
let touchStartY = 0;

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

    draggingIndex = itemIndex;
    dragSourceElement = ev.currentTarget;
    isDesktopDragging = true;

    // 원래 자리 효과: 투명도 + 흔들림
    dragSourceElement.classList.add('dragging');
    dragSourceElement.classList.add('shake-animation');
    dragSourceElement.style.opacity = '0.4';

    // 웹 자동 스크롤 시작
    startDesktopAutoScroll();
}

/**
 * Desktop drag end handler
 */
export function dragEnd(ev) {
    isDesktopDragging = false;
    stopDesktopAutoScroll();

    document.querySelectorAll('.dragging').forEach(el => {
        el.classList.remove('dragging');
        el.classList.remove('shake-animation');
        el.style.opacity = '';
    });

    if (dragSourceElement) {
        dragSourceElement.classList.remove('shake-animation');
        dragSourceElement.style.opacity = '';
        dragSourceElement = null;
    }

    draggingIndex = null;
    clearDragStyles();
}

/**
 * Desktop drag over handler
 */
export function dragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';

    // 마우스 Y 위치 저장 (자동 스크롤용)
    lastDragClientY = ev.clientY;

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
    if (autoScrollAnimationId) return;

    const autoScroll = () => {
        if (!isDesktopDragging) {
            stopDesktopAutoScroll();
            return;
        }

        const clientY = lastDragClientY;
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

        autoScrollAnimationId = requestAnimationFrame(autoScroll);
    };

    autoScrollAnimationId = requestAnimationFrame(autoScroll);
}

/**
 * 웹 자동 스크롤 중지
 */
function stopDesktopAutoScroll() {
    if (autoScrollAnimationId) {
        cancelAnimationFrame(autoScrollAnimationId);
        autoScrollAnimationId = null;
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
    ghost.style.cssText = `
        position: fixed;
        z-index: 10000;
        opacity: 0.95;
        transform: rotate(2deg) scale(0.98);
        pointer-events: none;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        max-width: 320px;
    `;

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
    if (customDragGhost && customDragGhost.parentNode) {
        customDragGhost.parentNode.removeChild(customDragGhost);
    }
    customDragGhost = null;
}

/**
 * Touch drag start handler (long press)
 */
export function touchStart(e, index, type, isEditing) {
    if (isEditing) return;

    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    touchLongPressTimer = setTimeout(() => {
        isTouchDragging = true;
        touchStartIndex = index;
        dragSourceElement = e.currentTarget;

        // iOS/Android 네이티브 드래그 방지
        e.preventDefault();

        // 원래 자리 효과: 투명도 + 흔들림
        if (dragSourceElement) {
            dragSourceElement.classList.add('dragging');
            dragSourceElement.classList.add('shake-animation');
            dragSourceElement.style.opacity = '0.4';
        }

        // 커스텀 드래그 고스트 생성
        customDragGhost = createCustomDragGhost(dragSourceElement);
        if (customDragGhost) {
            document.body.appendChild(customDragGhost);
            updateGhostPosition(touch.clientX, touch.clientY);
        }

        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(50);

    }, 300); // 300ms 롱프레스
}

/**
 * Touch move handler
 */
export function touchMove(e) {
    // 롱프레스 타이머 취소 (스크롤 시)
    const touch = e.touches[0];
    const moveX = Math.abs(touch.clientX - touchStartX);
    const moveY = Math.abs(touch.clientY - touchStartY);

    if (moveX > 10 || moveY > 10) {
        if (touchLongPressTimer) {
            clearTimeout(touchLongPressTimer);
            touchLongPressTimer = null;
        }
    }

    if (isTouchDragging) {
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
    clearTimeout(touchLongPressTimer);
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }

    if (isTouchDragging) {
        isTouchDragging = false;

        // 원래 자리 복원
        if (dragSourceElement) {
            dragSourceElement.style.opacity = '';
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
                moveCallback(touchStartIndex, targetIndex, targetDayIndex);
            }
        }

        draggingIndex = null;
        dragSourceElement = null;
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
