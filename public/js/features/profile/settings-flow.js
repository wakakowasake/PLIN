import { Z_INDEX } from '../../ui/constants.js';
import {
    setAppearanceFlow,
    toggleDarkModeFlow,
    updateAppearanceSelectionFlow,
    updateDarkModeToggleFlow
} from './theme-flow.js';

function bindSettingsModal(modal) {
    if (modal.dataset.bound === 'true') {
        return;
    }

    modal.dataset.bound = 'true';

    modal.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;

        if (!target) {
            return;
        }

        if (target === modal || target.closest('.close-settings-btn')) {
            closeUserSettingsFlow();
            return;
        }

        if (target.closest('.toggle-dark-mode')) {
            toggleDarkModeFlow();
            return;
        }

        const appearanceButton = target.closest('[data-appearance-option]');
        if (appearanceButton instanceof HTMLElement) {
            const nextAppearance = appearanceButton.dataset.appearanceOption;
            if (nextAppearance) {
                setAppearanceFlow(nextAppearance);
            }
        }
    });
}

function buildSettingsModal() {
    const modal = document.createElement('div');
    modal.id = 'user-settings-modal';
    modal.className = 'fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm';
    modal.style.zIndex = Z_INDEX.MODAL_VIEW;
    modal.innerHTML = `
        <div class="settings-modal-card bg-white dark:bg-card-dark rounded-3xl shadow-2xl w-full max-w-md max-h-[calc(100vh-32px)] overflow-hidden border border-gray-100 dark:border-gray-800 flex flex-col">
            <div class="settings-modal-header p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                <h3 class="text-lg font-black text-text-main dark:text-white flex items-center gap-3">
                    <span class="material-symbols-outlined text-primary text-2xl">settings</span>
                    설정
                </h3>
                <button type="button" class="close-settings-btn modal-icon-button size-10 flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"><span class="material-symbols-outlined">close</span></button>
            </div>
            <div class="settings-modal-body p-8 space-y-8 overflow-y-auto">
                <div class="settings-modal-section settings-toggle-row flex items-center justify-between group">
                    <div class="flex flex-col gap-1">
                        <p class="font-bold text-text-main dark:text-white text-base">다크 모드</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">시스템 테마 설정</p>
                    </div>
                    <button type="button" id="dark-mode-toggle" class="toggle-dark-mode settings-toggle-shell relative inline-flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full transition-all duration-500 focus:outline-none ring-offset-2 focus:ring-2 focus:ring-primary/50 bg-gray-200 dark:bg-primary/20 p-1 shadow-inner">
                        <span id="dark-mode-toggle-dot" class="inline-flex h-7 w-7 transform rounded-full bg-white shadow-xl transition-all duration-500 ease-in-out translate-x-0 dark:translate-x-7 items-center justify-center">
                            <span class="material-symbols-outlined text-base text-yellow-500 absolute transition-all duration-500 scale-100 opacity-100 dark:scale-0 dark:opacity-0">light_mode</span>
                            <span class="material-symbols-outlined text-base text-indigo-600 absolute transition-all duration-500 scale-0 opacity-0 dark:scale-100 dark:opacity-100">dark_mode</span>
                        </span>
                    </button>
                </div>
                <div class="settings-modal-section space-y-4">
                    <div class="flex flex-col gap-1">
                        <p class="font-bold text-text-main dark:text-white text-base">비주얼 모드</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">기본 톤과 현재 다이어리 감성을 선택할 수 있어요</p>
                    </div>
                    <div class="settings-appearance-grid grid grid-cols-2 gap-3">
                        <button type="button" class="appearance-option" data-appearance-option="default" aria-pressed="false">
                            <span class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <span class="material-symbols-outlined text-[20px]">dashboard_customize</span>
                            </span>
                            <span class="text-sm font-bold text-text-main dark:text-white">기본</span>
                            <span class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">앱에 가까운 정돈된 폰트와 차분한 카드 톤</span>
                        </button>
                        <button type="button" class="appearance-option" data-appearance-option="diary" aria-pressed="false">
                            <span class="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                <span class="material-symbols-outlined text-[20px]">menu_book</span>
                            </span>
                            <span class="text-sm font-bold text-text-main dark:text-white">다이어리</span>
                            <span class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">손글씨, 종이 질감, 살짝 기울어진 현재 감성</span>
                        </button>
                    </div>
                </div>
                <div class="settings-modal-section space-y-4">
                    <div class="flex flex-col gap-1">
                        <p class="font-bold text-text-main dark:text-white text-base">계정 관리</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">정책 문서와 계정 삭제 요청 페이지로 이동할 수 있어요</p>
                    </div>
                    <div class="grid gap-2">
                        <a href="/account-delete.html" class="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-3 text-sm font-bold text-text-main dark:text-white hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors">
                            <span class="flex min-w-0 items-center gap-3">
                                <span class="material-symbols-outlined text-primary text-[20px]">manage_accounts</span>
                                <span class="truncate">계정 삭제 요청</span>
                            </span>
                            <span class="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </a>
                        <a href="/terms.html" class="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-3 text-sm font-bold text-text-main dark:text-white hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors">
                            <span class="flex min-w-0 items-center gap-3">
                                <span class="material-symbols-outlined text-primary text-[20px]">description</span>
                                <span class="truncate">서비스 이용약관</span>
                            </span>
                            <span class="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </a>
                        <a href="/privacy.html" class="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-3 text-sm font-bold text-text-main dark:text-white hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors">
                            <span class="flex min-w-0 items-center gap-3">
                                <span class="material-symbols-outlined text-primary text-[20px]">privacy_tip</span>
                                <span class="truncate">개인정보처리방침</span>
                            </span>
                            <span class="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </a>
                        <a href="/location-terms.html" class="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-3 text-sm font-bold text-text-main dark:text-white hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors">
                            <span class="flex min-w-0 items-center gap-3">
                                <span class="material-symbols-outlined text-primary text-[20px]">location_on</span>
                                <span class="truncate">위치기반서비스 약관</span>
                            </span>
                            <span class="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </a>
                        <a href="/operation-policy.html" class="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-3 text-sm font-bold text-text-main dark:text-white hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors">
                            <span class="flex min-w-0 items-center gap-3">
                                <span class="material-symbols-outlined text-primary text-[20px]">rule</span>
                                <span class="truncate">운영정책</span>
                            </span>
                            <span class="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </a>
                        <a href="/youth-protection-policy.html" class="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white/80 dark:bg-gray-900/40 px-4 py-3 text-sm font-bold text-text-main dark:text-white hover:bg-orange-50 dark:hover:bg-primary/10 transition-colors">
                            <span class="flex min-w-0 items-center gap-3">
                                <span class="material-symbols-outlined text-primary text-[20px]">family_restroom</span>
                                <span class="truncate">청소년보호정책</span>
                            </span>
                            <span class="material-symbols-outlined text-gray-400 text-[18px]">chevron_right</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    bindSettingsModal(modal);
    return modal;
}

export function closeUserSettingsFlow() {
    const modal = document.getElementById('user-settings-modal');
    if (modal) modal.classList.add('hidden');
}

export function openUserSettingsFlow() {
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    let modal = document.getElementById('user-settings-modal');
    if (!modal) {
        modal = buildSettingsModal();
    }

    updateDarkModeToggleFlow();
    updateAppearanceSelectionFlow();
    modal.classList.remove('hidden');
}
