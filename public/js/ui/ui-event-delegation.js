/**
 * UI Event Delegation - 이벤트 위임 방식의 중앙 관리자
 * 
 * 목표: onclick="..." 문자열 제거하고, data-* 속성으로 이벤트 처리
 * 리액트로 이사할 때 쉽게 변환 가능한 구조
 * 
 * 사용 예시:
 *   HTML: <div data-action="view-item" data-index="0" data-day="1">클릭</div>
 *   처리: delegateEvent를 초기화하면 자동으로 이벤트 처리
 */

// 🔵 [React Migration] 의존성 주입(DI): ui-event-delegation.js이 actionHandlers를 통해
// window 함수들을 호출하는데, 이를 injectedHandlers로 변경하여 React 전환 시 props로 전달 가능하게
let injectedHandlers = {
    // State getters
    isEditing: false,
    categoryList: [],
    
    // Timeline item handlers
    editTimelineItem: null,
    viewTimelineItem: null,
    deleteTimelineItem: null,
    openAddModal: null,
    selectAddType: null,
    viewRouteDetail: null,
    
    // Memory handlers
    openLightbox: null,
    
    // List handlers
    toggleListCheck: null,
    deleteListItem: null,
    openShoppingListModal: null,
    openChecklistModal: null,
    
    // Attachment handlers
    openAttachment: null,
    deleteAttachment: null,
    
    // Weather handlers
    navigateWeatherWeek: null,
    selectWeatherDate: null,
    
    // Detail modal handlers
    editCurrentItem: null,
    deleteCurrentItem: null,
    closeDetailModal: null,
    closeAttachmentLightbox: null,
    
    // Context menu handlers
    handleContextAction: null,
    closeContextMenu: null,
    
    // Expense handlers
    addExpenseFromDetail: null,
    deleteExpenseFromDetail: null,
    
    // Memo handlers
    closeMemoModal: null,
    deleteCurrentMemo: null,
    editCurrentMemo: null,
    
    // Map handlers
    openGoogleMapsExternal: null,
    findDirectionsToPlace: null,
    openGoogleMapsRouteFromPrev: null,
    
    // Wizard handlers
    nextWizardStep: null,
    finishNewTripWizard: null,
    useManualInput: null,
    
    // Trip handlers
    closeNewTripModal: null,
    openTrip: null,
    toggleTripMenu: null,
    openShareModal: null,
    openRevisionHistory: null,
    duplicateTrip: null,
    deleteTrip: null,
    createNewTrip: null,
    closeCopyOptionsModal: null,
    executeDuplicate: null,
    
    // Navigation handlers
    backToMain: null,
    loginWithGuestData: null,
    openUserMenu: null,
    openUserSettings: null,
    openUserProfile: null,
    confirmLogout: null,
    switchTab: null,
    
    // Global UI handlers
    toggleGlobalEditMode: null,
    openRouteModal: null,
    openWeatherDetailModal: null,
    openExpenseDetailModal: null,
    openHeroContextMenu: null,
    openTripInfoEditor: null,
    
    // Profile handlers
    enableProfileEdit: null,
    cancelProfileEdit: null,
    saveProfileChanges: null,
    confirmWithdrawal: null,
    closeTripSelectionModal: null,
    
    // Modal handlers
    saveNewItem: null,
    savePlanB: null,
    closeModal: null,
    closePlanBModal: null,
    closeDayPlanManagerModal: null,
    createDayPlan: null,
    switchDayPlan: null,
    deleteDayPlan: null,
    openCategoryModal: null,
    openTimeModal: null,
    setDuration: null,
    
    // AI handlers
    openAiRecommendModal: null,
    
    // Special: Auth object
    Auth: null
};

export function injectEventHandlers(handlers) {
    injectedHandlers = Object.assign(injectedHandlers, handlers);
}

/**
 * 액션별 핸들러 등록
 */
const actionHandlers = {
    // Timeline item actions
    'view-item': ({ index, dayIndex }) => {
        if (injectedHandlers.isEditing) {
            injectedHandlers.editTimelineItem?.(index, dayIndex);
        } else {
            injectedHandlers.viewTimelineItem?.(index, dayIndex);
        }
    },
    
    'delete-item': ({ index, dayIndex }) => {
        injectedHandlers.deleteTimelineItem?.(index, dayIndex);
    },
    
    'edit-item': ({ index, dayIndex }) => {
        injectedHandlers.editTimelineItem?.(index, dayIndex);
    },
    
    'add-item': ({ index, dayIndex }) => {
        injectedHandlers.openAddModal?.(index, dayIndex);
    },
    
    'add-fastest-item': () => {
        // 자동 추천 경로 버튼은 모달 안에 있으므로, 이미 openAddModal이 호출됨
        // 현재 state의 insertingItemIndex/targetDayIndex를 사용
        injectedHandlers.selectAddType?.('fastest');
    },
    
    'view-route': ({ index, dayIndex }) => {
        injectedHandlers.viewRouteDetail?.(index, dayIndex);
    },
    
    // Memory actions
    'open-lightbox': ({ day, item, mem }) => {
        injectedHandlers.openLightbox?.(day, item, mem);
    },
    
    // List actions
    'toggle-check': ({ type, index }) => {
        injectedHandlers.toggleListCheck?.(type, index);
    },
    
    'delete-list-item': ({ type, index }) => {
        injectedHandlers.deleteListItem?.(type, index);
    },
    
    'open-shopping-list': () => {
        injectedHandlers.openShoppingListModal?.();
    },

    'open-revision-history': () => {
        injectedHandlers.openRevisionHistory?.();
    },
    
    'open-checklist': () => {
        injectedHandlers.openChecklistModal?.();
    },
    
    // Attachment actions
    'open-attachment': ({ url, type }) => {
        injectedHandlers.openAttachment?.(url, type);
    },
    
    'delete-attachment': ({ index, container }) => {
        injectedHandlers.deleteAttachment?.(index, container);
    },
    
    // Weather actions
    'prev-weather': () => {
        injectedHandlers.navigateWeatherWeek?.(-1);
    },
    
    'next-weather': () => {
        injectedHandlers.navigateWeatherWeek?.(1);
    },
    
    'select-weather': ({ date }) => {
        injectedHandlers.selectWeatherDate?.(date);
    },
    
    // Detail modal actions (ui.js)
    'edit-current-item': () => {
        injectedHandlers.editCurrentItem?.();
    },
    
    'delete-current-item': () => {
        injectedHandlers.deleteCurrentItem?.();
    },
    
    'close-detail': () => {
        injectedHandlers.closeDetailModal?.();
    },
    
    'close-lightbox': () => {
        injectedHandlers.closeAttachmentLightbox?.();
    },
    
    'stop-propagation': () => {
        // Already handled by link target="_blank"
    },
    
    // Context menu actions (ui.js)
    'context-edit': () => {
        injectedHandlers.handleContextAction?.('edit');
    },
    
    'context-delete': () => {
        injectedHandlers.handleContextAction?.('delete');
    },
    
    'context-change-hero': () => {
        injectedHandlers.handleContextAction?.('change_hero');
    },
    
    'context-reset-hero': () => {
        injectedHandlers.handleContextAction?.('reset_hero');
    },
    
    'context-delete-hero': () => {
        injectedHandlers.handleContextAction?.('delete_hero');
    },
    
    'context-edit-trip-info': () => {
        injectedHandlers.handleContextAction?.('edit_trip_info');
    },
    
    'context-delete-memory': () => {
        injectedHandlers.handleContextAction?.('delete_memory');
    },

    'close-context-menu': () => {
        injectedHandlers.closeContextMenu?.();
    },
    
    // Expense actions (ui.js)
    'add-expense': ({ day }) => {
        injectedHandlers.addExpenseFromDetail?.(day);
    },
    
    'delete-expense': ({ day, item, expense }) => {
        injectedHandlers.deleteExpenseFromDetail?.(day, item, expense);
    },
    
    // Timeline detail modal actions (timeline-detail.js)
    'open-maps-external': () => {
        injectedHandlers.openGoogleMapsExternal?.();
    },
    
    'find-directions': () => {
        injectedHandlers.findDirectionsToPlace?.();
    },
    
    'upload-attachment-item': () => {
        document.getElementById('attachment-upload-item')?.click();
    },
    
    'close-memo': () => {
        injectedHandlers.closeMemoModal?.();
    },
    
    'delete-memo': () => {
        injectedHandlers.deleteCurrentMemo?.();
    },
    
    'edit-memo': () => {
        injectedHandlers.editCurrentMemo?.();
    },
    
    // Trips list actions (trips.js)
    'next-wizard-step': ({ step }) => {
        injectedHandlers.nextWizardStep?.(step);
    },
    
    'prev-wizard-step': ({ step }) => {
        injectedHandlers.nextWizardStep?.(step);
    },
    
    'finish-wizard': () => {
        injectedHandlers.finishNewTripWizard?.();
    },
    
    'manual-input': ({ mode }) => {
        injectedHandlers.useManualInput?.(mode);
    },
    
    'close-new-trip': () => {
        injectedHandlers.closeNewTripModal?.();
    },
    
    'open-trip': ({ id }) => {
        injectedHandlers.openTrip?.(id);
    },
    
    'toggle-trip-menu': ({ id }) => {
        injectedHandlers.toggleTripMenu?.(id);
    },
    
    'open-share-modal': ({ id }) => {
        injectedHandlers.openShareModal?.(id);
    },
    
    'duplicate-trip': ({ id }) => {
        injectedHandlers.duplicateTrip?.(id);
    },
    
    'delete-trip': ({ id }) => {
        injectedHandlers.deleteTrip?.(id);
    },
    
    'create-trip': () => {
        injectedHandlers.createNewTrip?.();
    },
    
    'close-copy-modal': () => {
        injectedHandlers.closeCopyOptionsModal?.();
    },
    
    'execute-duplicate': () => {
        injectedHandlers.executeDuplicate?.();
    },
    
    // Header/Navigation actions (index.html)
    'back-to-main': () => {
        injectedHandlers.backToMain?.();
    },
    
    'open-share': ({ id }) => {
        if (id) {
            // Trip share
            injectedHandlers.openShareModal?.(id);
        } else {
            // Navigation share
            injectedHandlers.openShareModal?.();
        }
    },
    
    'login-guest': () => {
        injectedHandlers.loginWithGuestData?.();
    },

    'open-login-view': () => {
        injectedHandlers.Auth?.openLoginView?.();
    },

    'dismiss-login-view': () => {
        injectedHandlers.Auth?.dismissLoginView?.();
    },
    
    'open-user-menu': () => {
        injectedHandlers.openUserMenu?.();
    },
    
    'open-user-settings': () => {
        injectedHandlers.openUserSettings?.();
    },
    
    'open-user-profile': () => {
        injectedHandlers.openUserProfile?.();
    },
    
    'logout': () => {
        injectedHandlers.confirmLogout?.();
    },
    
    'logout-nav': () => {
        injectedHandlers.Auth?.openLogoutModal?.();
    },
    
    'switch-tab': ({ tab }) => {
        injectedHandlers.switchTab?.(tab);
    },
    
    // Main area actions (index.html)
    'toggle-edit-mode': () => {
        injectedHandlers.toggleGlobalEditMode?.();
    },
    
    'open-route-modal': () => {
        injectedHandlers.openRouteModal?.();
    },
    
    'open-weather-modal': () => {
        injectedHandlers.openWeatherDetailModal?.();
    },
    
    'open-expense-modal': () => {
        injectedHandlers.openExpenseDetailModal?.();
    },

    'open-hero-context': () => {
        injectedHandlers.openHeroContextMenu?.();
    },

    'open-trip-info-editor': () => {
        injectedHandlers.openTripInfoEditor?.();
    },
    
    // Profile section actions (index.html)
    'enable-profile-edit': () => {
        injectedHandlers.enableProfileEdit?.();
    },
    
    'cancel-profile-edit': () => {
        injectedHandlers.cancelProfileEdit?.();
    },
    
    'save-profile': () => {
        injectedHandlers.saveProfileChanges?.();
    },
    
    'confirm-withdrawal': () => {
        injectedHandlers.confirmWithdrawal?.();
    },
    
    'close-trip-selection': () => {
        injectedHandlers.closeTripSelectionModal?.();
    },
    
    // Add Item modal actions (index.html)
    'save-new-item': () => {
        injectedHandlers.saveNewItem?.();
    },

    'save-plan-b': () => {
        injectedHandlers.savePlanB?.();
    },
    
    'close-modal': () => {
        if (typeof injectedHandlers.closeItemModalWithConfirm === 'function') {
            injectedHandlers.closeItemModalWithConfirm();
            return;
        }
        injectedHandlers.closeModal?.();
    },

    'close-plan-b-modal': () => {
        injectedHandlers.closePlanBModal?.();
    },

    'close-day-plan-manager-modal': () => {
        injectedHandlers.closeDayPlanManagerModal?.();
    },

    'create-day-plan': ({ day, sourcePlanCode }) => {
        injectedHandlers.createDayPlan?.(day, sourcePlanCode);
    },

    'switch-day-plan': ({ day, planCode }) => {
        injectedHandlers.switchDayPlan?.(day, planCode);
    },

    'delete-day-plan': ({ day, planCode }) => {
        injectedHandlers.deleteDayPlan?.(day, planCode);
    },
    
    'use-manual-input': ({ type }) => {
        injectedHandlers.useManualInput?.(type);
    },
    
    'open-category-modal': () => {
        injectedHandlers.openCategoryModal?.();
    },
    
    'open-time-modal': () => {
        injectedHandlers.openTimeModal?.();
    },
    
    'set-duration': ({ duration }) => {
        injectedHandlers.setDuration?.(Number(duration));
    },
    
    'open-maps-route': () => {
        injectedHandlers.openGoogleMapsRouteFromPrev?.();
    },
    
    'select-add-type': ({ type, transitType }) => {
        if (type === 'transit' && transitType) {
            injectedHandlers.selectAddType?.(type, transitType);
        } else {
            injectedHandlers.selectAddType?.(type);
        }
    },
    
    'open-ai-recommend': () => {
        injectedHandlers.openAiRecommendModal?.();
    }
};


/**
 * 중앙 이벤트 위임 시스템
 */
export function initEventDelegation() {
    const timelineContainer = document.getElementById('timeline-list');
    const listContainer = document.getElementById('sidebar-left');
    const weatherContainer = document.getElementById('weekly-weather-container');
    const detailModal = document.getElementById('detail-modal');
    const contextMenu = document.getElementById('context-menu');
    const expensesContainer = document.getElementById('expenses-container');
    
    if (!timelineContainer) {
        console.warn('timeline-list 컨테이너를 찾을 수 없습니다.');
    }
    
    // Helper function to extract params from target element
    const extractParams = (target) => ({
        index: target.dataset.index !== undefined ? Number(target.dataset.index) : undefined,
        dayIndex: target.dataset.day !== undefined ? Number(target.dataset.day) : undefined,
        day: target.dataset.day !== undefined ? Number(target.dataset.day) : undefined,
        item: target.dataset.item !== undefined ? Number(target.dataset.item) : undefined,
        expense: target.dataset.expense !== undefined ? Number(target.dataset.expense) : undefined,
        mem: target.dataset.mem !== undefined ? Number(target.dataset.mem) : undefined,
        type: target.dataset.type || undefined,
        url: target.dataset.url || undefined,
        date: target.dataset.date || undefined,
        container: target.dataset.container || undefined,
        id: target.dataset.id || undefined,
        step: target.dataset.step !== undefined ? Number(target.dataset.step) : undefined,
        mode: target.dataset.mode || undefined,
        transitType: target.dataset.transitType || undefined,
        duration: target.dataset.duration !== undefined ? Number(target.dataset.duration) : undefined,
        tab: target.dataset.tab || undefined,
        planCode: target.dataset.planCode || undefined,
        sourcePlanCode: target.dataset.sourcePlanCode || undefined
    });
    
    // Main click handler for all containers
    const handleClick = (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        const action = target.dataset.action;
        const handler = actionHandlers[action];
        
        if (handler) {
            const params = extractParams(target);
            handler(params);
        } else {
            console.warn(`Unknown action: ${action}`);
        }
    };
    
    // ===== Timeline Container =====
    if (timelineContainer) {
        timelineContainer.addEventListener('click', handleClick);
    }
    
    // ===== List Container =====
    if (listContainer) {
        listContainer.addEventListener('click', handleClick);
    }
    
    // ===== Weather Container =====
    if (weatherContainer) {
        weatherContainer.addEventListener('click', handleClick);
    }
    
    // ===== Detail Modal =====
    if (detailModal) {
        detailModal.addEventListener('click', handleClick);
    }
    
    // ===== Context Menu =====
    if (contextMenu) {
        contextMenu.addEventListener('click', handleClick);
    }
    
    // ===== Expenses Container =====
    if (expensesContainer) {
        expensesContainer.addEventListener('click', handleClick);
    }
    
    // ===== Document-level for globally rendered content =====
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        
        // Avoid double-handling already attached containers
        if (target.closest('#timeline-list') || 
            target.closest('#sidebar-left') || 
            target.closest('#weekly-weather-container') ||
            target.closest('#detail-modal') ||
            target.closest('#context-menu') ||
            target.closest('#expenses-container')) {
            return;
        }
        
        const action = target.dataset.action;
        const handler = actionHandlers[action];
        
        if (handler) {
            const params = extractParams(target);
            handler(params);
        }
    }, true); // Use capture phase
    
}

/**
 * 액션 핸들러 추가/등록 함수
 * 사용: registerActionHandler('custom-action', (idx, day) => { ... })
 */
export function registerActionHandler(action, handler) {
    actionHandlers[action] = handler;
}

/**
 * 액션 핸들러 조회 함수 (테스트용)
 */
export function getActionHandler(action) {
    return actionHandlers[action];
}

export default { initEventDelegation, registerActionHandler, getActionHandler };
