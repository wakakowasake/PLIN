function getElement(id) {
    return document.getElementById(id);
}

export function setHeaderEditButtonVisible(isVisible) {
    const headerEditButtonContainer = getElement('memory-lock-btn-header-container');
    const navEditButtonContainer = getElement('memory-lock-btn-nav-container');

    if (headerEditButtonContainer) {
        headerEditButtonContainer.classList.toggle('hidden', !isVisible);
    }

    if (navEditButtonContainer) {
        navEditButtonContainer.classList.toggle('is-visible', !!isVisible);
    }
}

export function createBackToMainHandler({
    setCurrentTripId,
    loadTripList,
    getCurrentUser,
    setHeaderEditButtonVisible
}) {
    return function backToMain(options = {}) {
        getElement('detail-view')?.classList.add('hidden');
        getElement('main-view')?.classList.remove('hidden');
        getElement('profile-view')?.classList.add('hidden');
        getElement('community-view')?.classList.add('hidden');
        getElement('notices-view')?.classList.add('hidden');
        getElement('back-btn')?.classList.add('hidden');
        getElement('share-btn')?.classList.add('hidden');

        setHeaderEditButtonVisible(false);
        setCurrentTripId(null);

        if (options.fromPopState !== true) {
            history.pushState({ page: 'main' }, '', window.location.pathname);
        }

        const user = getCurrentUser?.();
        if (user?.uid) {
            loadTripList?.(user.uid);
        }
    };
}

export function pushModalState() {
    history.pushState({ modal: true }, '', window.location.pathname);
}

export function popModalState() {
    history.back();
}
