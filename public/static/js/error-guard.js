/**
 * Global Error Guard
 * Catches unhandled errors and promises to prevent white screen of death.
 * Optimized to be standalone and dependency-free.
 */

(function () {
    const DEFAULT_Z_INDEX = {
        MODAL_MAX: 10000
    };

    let errorCount = 0;
    let lastErrorTime = 0;
    const ERROR_THRESHOLD = 3; // Max errors before showing critical message
    const ERROR_RESET_TIME = 5000; // Reset counter after 5 seconds

    window.onerror = function (message, source, lineno, colno, error) {
        console.error('[Global Error Guard] Caught error:', message, error);

        // Ignore minor errors that don't affect user experience
        if (message && (
            message.includes('ResizeObserver') ||
            message.includes('Script error')
        )) {
            return false;
        }

        handleError('알 수 없는 오류가 발생했습니다.');
        return false; // Let default handler run as well
    };

    window.onunhandledrejection = function (event) {
        console.error('[Global Error Guard] Unhandled Rejection:', event.reason);

        // Ignore network errors and cancelled requests
        if (event.reason && (
            event.reason.message?.includes('cancelled') ||
            event.reason.message?.includes('network') ||
            event.reason.name === 'AbortError'
        )) {
            return;
        }

        // Show UI for critical promise rejections
        if (event.reason && event.reason.message) {
            handleError('처리되지 않은 오류가 발생했습니다.');
        }
    };

    function handleError(msg) {
        const now = Date.now();

        // Reset counter if enough time has passed
        if (now - lastErrorTime > ERROR_RESET_TIME) {
            errorCount = 0;
        }

        errorCount++;
        lastErrorTime = now;

        // If too many errors, show critical message
        if (errorCount >= ERROR_THRESHOLD) {
            showCriticalError();
            errorCount = 0; // Reset to prevent spam
        } else {
            showErrorNotification(msg);
        }
    }

    function showErrorNotification(msg) {
        // Try to use existing toast system
        if (window.showToast) {
            window.showToast(msg, 'error');
            return;
        }

        // Fallback: Create a simple toast notification
        createToast(msg, false);
    }

    function showCriticalError() {
        const msg = '여러 오류가 발생했습니다. 페이지를 새로고침하시겠습니까?';

        // Try to use existing toast system
        if (window.showToast) {
            window.showToast(msg, 'error');
        }

        createToast(msg, true);
    }

    function createToast(msg, showRefreshButton) {
        // Remove any existing error toasts
        const existingToast = document.querySelector('.error-guard-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const div = document.createElement('div');
        div.className = 'error-guard-toast';
        div.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #ef4444;
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            z-index: ${DEFAULT_Z_INDEX.MODAL_MAX};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: sans-serif;
            font-weight: 500;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: slideUp 0.3s ease-out;
            max-width: 90%;
            pointer-events: auto;
        `;

        const text = document.createElement('span');
        text.textContent = msg;
        div.appendChild(text);

        if (showRefreshButton) {
            const refreshBtn = document.createElement('button');
            refreshBtn.textContent = '새로고침';
            refreshBtn.style.cssText = `
                background: white;
                color: #ef4444;
                border: none;
                padding: 6px 16px;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 700;
                font-size: 13px;
                transition: all 0.2s;
            `;
            refreshBtn.onmouseover = () => {
                refreshBtn.style.background = '#fee2e2';
            };
            refreshBtn.onmouseout = () => {
                refreshBtn.style.background = 'white';
            };
            refreshBtn.onclick = () => location.reload();
            div.appendChild(refreshBtn);
        }

        // Add animation keyframe if not exists
        if (!document.querySelector('#error-guard-animation')) {
            const style = document.createElement('style');
            style.id = 'error-guard-animation';
            style.textContent = `
                @keyframes slideUp {
                    from {
                        transform: translateX(-50%) translateY(20px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(-50%) translateY(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(div);

        // Auto-remove after 5 seconds if not critical
        if (!showRefreshButton) {
            setTimeout(() => {
                if (div.parentNode) {
                    div.style.opacity = '0';
                    div.style.transition = 'opacity 0.3s ease-out';
                    setTimeout(() => div.remove(), 300);
                }
            }, 5000);
        }
    }
})();
