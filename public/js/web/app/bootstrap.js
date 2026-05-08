export function runMainBootstrap({
    initDarkMode,
    initSwipeHandlers,
    openTrip,
    backToMain
}) {
    initDarkMode?.();
    document.body.classList.add('fade-in');
    initSwipeHandlers?.();

    window.addEventListener('popstate', (event) => {
        const state = event.state;

        if (window.closeAllModals) {
            const closed = window.closeAllModals();
            if (closed) return;
        }

        if (state && state.page === 'trip' && state.tripId) {
            openTrip?.(state.tripId, { pushState: false });
            return;
        }

        backToMain?.({ fromPopState: true });
    });
}
