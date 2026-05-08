// Context Menu Manager Module
// Handles right-click context menus for timeline items, hero images, trip info, and memories

import { setUiState, setTargetDayIndex, uiState } from '../state.js';

function buildContextMenuModel(type, dayIndex, index) {
    if (type === 'item') {
        const item = window.travelData?.days?.[dayIndex]?.timeline?.[index];
        const isOptimalRoute = !!item?.routeGroupId;
        const actions = [];

        if (!isOptimalRoute) {
            actions.push({
                action: 'context-edit',
                label: '수정',
                icon: 'edit',
                tone: 'default'
            });
        }

        actions.push({
            action: 'context-delete',
            label: '삭제',
            icon: 'delete',
            tone: 'danger'
        });

        return { title: '일정 작업', actions };
    }

    if (type === 'hero') {
        return {
            title: '대표 이미지',
            actions: [
                { action: 'context-change-hero', label: '이미지 변경', icon: 'add_a_photo', tone: 'default' },
                { action: 'context-reset-hero', label: '초기 이미지로 복구', icon: 'restart_alt', tone: 'default' },
                { action: 'context-delete-hero', label: '이미지 삭제', icon: 'delete', tone: 'danger' }
            ]
        };
    }

    if (type === 'trip_info') {
        return {
            title: '여행 정보',
            actions: [
                { action: 'context-edit-trip-info', label: '정보 수정', icon: 'edit_square', tone: 'default' }
            ]
        };
    }

    if (type === 'memory') {
        return {
            title: '추억 작업',
            actions: [
                { action: 'context-delete-memory', label: '추억 삭제', icon: 'delete', tone: 'danger' }
            ]
        };
    }

    return { title: '빠른 작업', actions: [] };
}

function renderContextActionButton({ action, label, icon, tone }) {
    const isDanger = tone === 'danger';
    const wrapperClass = isDanger
        ? 'border-red-100 dark:border-red-900/40 bg-red-50/70 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/70';
    const iconClass = isDanger
        ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300'
        : 'bg-primary/10 text-primary';
    const labelClass = isDanger
        ? 'text-red-600 dark:text-red-300'
        : 'text-gray-800 dark:text-gray-100';

    return `
        <button type="button" data-action="${action}" class="w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center gap-3 ${wrapperClass}">
            <span class="w-8 h-8 rounded-full flex items-center justify-center ${iconClass}">
                <span class="material-symbols-outlined text-lg">${icon}</span>
            </span>
            <span class="text-sm font-bold ${labelClass}">${label}</span>
        </button>
    `;
}

/**
 * Open context menu at mouse position
 * @param {MouseEvent} e - Right-click event
 * @param {string} type - Menu type ('item', 'hero', 'trip_info', 'memory')
 * @param {number} index - Item index
 * @param {number} dayIndex - Day index (default: currentDayIndex)
 * @param {number} memoryIndex - Memory index (optional)
 */
export function openContextMenu(e, type, index, dayIndex = window.currentDayIndex, memoryIndex = null) {
    // [Fix] 읽기 전용 모드 또는 수정 모드가 아닐 때는 컨텍스트 메뉴 차단
    if (window.isReadOnlyMode || !window.isGlobalEditMode) {
        e.preventDefault();
        return;
    }

    e.preventDefault();
    setUiState('contextMenu.contextMenuTargetIndex', index);
    setUiState('contextMenu.contextMenuType', type);
    setUiState('contextMenu.contextMenuMemoryIndex', memoryIndex);
    setTargetDayIndex(dayIndex); // 컨텍스트 메뉴 열 때 타겟 날짜 설정

    const menu = document.getElementById('context-menu');
    const titleEl = document.getElementById('context-menu-title');
    const contentEl = document.getElementById('context-menu-content');
    if (!menu || !contentEl) return;

    const model = buildContextMenuModel(type, dayIndex, index);
    if (titleEl) {
        titleEl.innerText = model.title;
    }
    contentEl.innerHTML = model.actions.map(renderContextActionButton).join('');
    menu.classList.remove('hidden');
}

/**
 * Close context menu
 */
export function closeContextMenu() {
    const menu = document.getElementById('context-menu');
    const contentEl = document.getElementById('context-menu-content');
    if (menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
    if (contentEl) {
        contentEl.innerHTML = '';
    }
}

/**
 * Handle context menu action
 * @param {string} action - Action type (edit, delete, change_hero, etc.)
 */
export function handleContextAction(action) {
    closeContextMenu();

    const contextMenuTargetIndex = uiState.contextMenu.contextMenuTargetIndex;
    const contextMenuMemoryIndex = uiState.contextMenu.contextMenuMemoryIndex;

    if (action === 'edit') {
        window.setIsEditingFromDetail?.(false);
        const item = window.travelData?.days[window.targetDayIndex]?.timeline[contextMenuTargetIndex];

        // [User Request] Transit/Flight items should open Route Detail Modal
        if (item?.isTransit && window.viewRouteDetail) {
            // 자동 추천 경로는 편집 모드로 열지 않음
            const isOptimalRoute = !!item.routeGroupId;
            window.viewRouteDetail(contextMenuTargetIndex, window.targetDayIndex, !isOptimalRoute);
        } else {
            window.editTimelineItem?.(contextMenuTargetIndex, window.targetDayIndex);
        }
    } else if (action === 'delete') {
        window.deleteTimelineItem?.(contextMenuTargetIndex, window.targetDayIndex);
    } else if (action === 'change_hero') {
        document.getElementById('hero-image-upload')?.click();
    } else if (action === 'reset_hero') {
        window.resetHeroImage?.();
    } else if (action === 'delete_hero') {
        window.deleteHeroImage?.();
    } else if (action === 'edit_trip_info') {
        window.openTripInfoModal?.();
    } else if (action === 'delete_memory') {
        if (window.deleteMemory) {
            window.deleteMemory(contextMenuTargetIndex, window.targetDayIndex, contextMenuMemoryIndex);
        }
    }
}

/**
 * Initialize context menu event listeners
 */
export function initContextMenuListeners() {
    // 전역 클릭 시 컨텍스트 메뉴 닫기
    window.addEventListener('click', (e) => {
        // [Fix] Hero 클릭으로 메뉴를 연 같은 클릭 이벤트에서 즉시 닫히는 문제 방지
        if (e.target.closest('[data-action="open-hero-context"]')) {
            return;
        }
        if (e.target.id === 'context-menu') {
            closeContextMenu();
            return;
        }
        if (!e.target.closest('#context-menu')) {
            closeContextMenu();
        }
    });
}
