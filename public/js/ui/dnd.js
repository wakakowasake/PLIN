// Drag and Drop Module (Enhanced)
// Handles desktop drag-drop, mobile touch drag, and timeline item reordering

import { travelData, setTravelData } from '../state.js';

// Touch drag state
let touchLongPressTimer = null;
let longPressTimer = null; // used in touchEnd
let isTouchDragging = false;
let touchStartIndex = null;
let draggingIndex = null;

/**
 * Desktop drag start handler
 * @param {DragEvent} ev - Drag event
 * @param {number} itemIndex - Index of item being dragged
 * @param {number} dayIndex - Day index of item
 */
export function dragStart(ev, itemIndex, dayIndex) {
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'single',
        index: itemIndex,
        dayIndex: dayIndex
    }));
    ev.currentTarget.classList.add('dragging');
    draggingIndex = itemIndex;
}

/**
 * Desktop drag end handler
 * @param {DragEvent} ev - Drag event
 */
export function dragEnd(ev) {
    // Remove all dragging classes
    document.querySelectorAll('.dragging').forEach(el => {
        el.classList.remove('dragging');
    });
    draggingIndex = null;
    clearDragStyles();
}

/**
 * Desktop drag over handler
 * @param {DragEvent} ev - Drag event
 */
export function dragOver(ev) {
    ev.preventDefault(); // Required to allow drop
    ev.dataTransfer.dropEffect = 'move';

    const target = ev.currentTarget;

    // Skip if already active
    const indicator = target.querySelector('.drag-indicator');
    if (indicator && !indicator.classList.contains('hidden')) return;

    // Clear other elements' styles (only one active at a time)
    clearDragStyles();

    // Visual feedback: show indicator
    if (indicator) indicator.classList.remove('hidden');
}

/**
 * Desktop drag leave handler
 * @param {DragEvent} ev - Drag event
 */
export function dragLeave(ev) {
    const target = ev.currentTarget;
    // Ignore if entering child element
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
 * Desktop drop handler
 * @param {DragEvent} ev - Drop event
 * @param {number} targetIndex - Target drop index
 * @param {number} targetDayIndex - Target day index
 * @param {Function} moveCallback - Callback to move item
 */
export function drop(ev, targetIndex, targetDayIndex, moveCallback) {
    ev.preventDefault();
    ev.stopPropagation();
    clearDragStyles();

    const data = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
    const dropIndex = parseInt(ev.currentTarget?.getAttribute('data-drop-index') || targetIndex);

    // Use dragged item's dayIndex (or targetDayIndex if not provided)
    const sourceDayIndex = data.dayIndex !== undefined ? data.dayIndex : targetDayIndex;

    if (data.type === 'group' && data.indices && data.indices.length > 0) {
        // Group move
        if (moveCallback) {
            moveCallback(data.indices, dropIndex, sourceDayIndex);
        }
    } else if (data.type === 'single' && data.index !== undefined) {
        // Single move
        if (moveCallback) {
            moveCallback(data.index, dropIndex, sourceDayIndex);
        }
    } else {
        // Legacy format support
        const fromIndex = parseInt(ev.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex) && moveCallback) {
            moveCallback(fromIndex, dropIndex, targetDayIndex);
        }
    }
}

/**
 * Timeline container drop handler (for dropping at the end)
 * @param {DragEvent} ev - Drop event
 * @param {number} dayIndex - Day index
 * @param {Function} moveCallback - Callback to move item
 */
export function timelineContainerDrop(ev, dayIndex, moveCallback) {
    ev.preventDefault();
    ev.stopPropagation();
    clearDragStyles();

    const data = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
    const timeline = travelData.days[dayIndex]?.timeline;
    if (!timeline) return;

    if (data.type === 'single' && data.index !== undefined) {
        if (moveCallback) {
            moveCallback(data.index, timeline.length, dayIndex);
        }
    } else {
        // Legacy format support
        const fromIndex = parseInt(ev.dataTransfer.getData('text/plain'));
        if (!isNaN(fromIndex) && moveCallback) {
            moveCallback(fromIndex, timeline.length, dayIndex);
        }
    }
}

/**
 * Touch drag start handler (long press)
 * @param {TouchEvent} e - Touch event
 * @param {number} index - Item index
 * @param {string} type - Item type
 * @param {boolean} isEditing - Whether currently editing
 */
export function touchStart(e, index, type, isEditing) {
    if (isEditing) return;

    // Start long press timer
    touchLongPressTimer = setTimeout(() => {
        isTouchDragging = true;
        touchStartIndex = index;

        // Visual feedback
        const target = e.currentTarget;
        if (target) target.style.opacity = '0.5';

        // Haptic feedback (if supported)
        if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
}

/**
 * Touch move handler
 * @param {TouchEvent} e - Touch event
 */
export function touchMove(e) {
    // Cancel long press if scrolling
    if (touchLongPressTimer) {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
    }

    if (isTouchDragging) {
        e.preventDefault(); // Prevent scroll during drag
    }
}

/**
 * Touch end handler
 * @param {TouchEvent} e - Touch event
 * @param {number} targetDayIndex - Target day index
 * @param {Function} moveCallback - Callback to move item
 */
export function touchEnd(e, targetDayIndex, moveCallback) {
    clearTimeout(touchLongPressTimer);
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
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
            if (moveCallback) {
                moveCallback(touchStartIndex, targetIndex, targetDayIndex);
            }
        }

        draggingIndex = null;
    }
}

/**
 * Reorder timeline items
 * @param {number} dayIndex - Day index
 * @param {number} fromIndex - Source index
 * @param {number} toIndex - Target index
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
 * @param {number} fromIndex - Source index
 * @param {number} targetIndex - Target index
 * @param {number} dayIndex - Day index
 * @param {Object} travelData - Travel data object
 */
export function moveTimelineItem(fromIndex, targetIndex, dayIndex, travelData) {
    const timeline = travelData.days[dayIndex].timeline;

    // Ignore if same position
    if (fromIndex === targetIndex || fromIndex === targetIndex - 1) return;

    const movedItem = timeline[fromIndex];

    // [Step 1] Reorder
    timeline.splice(fromIndex, 1);

    // Adjust index (calculate insert position after removal)
    let insertIndex = targetIndex;
    if (fromIndex < targetIndex) {
        insertIndex = targetIndex - 1; // -1 when moving backward
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

