const THEME_STORAGE_KEY = 'theme';
const APPEARANCE_STORAGE_KEY = 'plin:settings:appearance';
const DEFAULT_APPEARANCE = 'default';
const APPEARANCE_OPTIONS = new Set(['default', 'diary']);

function normalizeAppearance(appearance) {
    return APPEARANCE_OPTIONS.has(appearance) ? appearance : DEFAULT_APPEARANCE;
}

function applyTheme(theme) {
    const html = document.documentElement;

    if (theme === 'dark') {
        html.classList.remove('light');
        html.classList.add('dark');
        return;
    }

    html.classList.remove('dark');
    html.classList.add('light');
}

function applyAppearance(appearance) {
    const html = document.documentElement;
    const nextAppearance = normalizeAppearance(appearance);

    html.dataset.appearance = nextAppearance;
    html.classList.remove('appearance-default', 'appearance-diary');
    html.classList.add(`appearance-${nextAppearance}`);
}

export function initDarkModeFlow() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
    const savedAppearance = localStorage.getItem(APPEARANCE_STORAGE_KEY) || DEFAULT_APPEARANCE;

    applyTheme(savedTheme);
    applyAppearance(savedAppearance);
}

export function updateDarkModeToggleFlow() {
    const toggle = document.getElementById('dark-mode-toggle');
    const dot = document.getElementById('dark-mode-toggle-dot');
    if (!toggle || !dot) return;

    const isDark = document.documentElement.classList.contains('dark');

    if (isDark) {
        toggle.classList.add('bg-primary/20');
        toggle.classList.remove('bg-gray-200');
        dot.classList.add('translate-x-7');
        dot.classList.remove('translate-x-0');
        return;
    }

    toggle.classList.remove('bg-primary/20');
    toggle.classList.add('bg-gray-200');
    dot.classList.add('translate-x-0');
    dot.classList.remove('translate-x-7');
}

export function toggleDarkModeFlow() {
    const isDark = document.documentElement.classList.contains('dark');
    const nextTheme = isDark ? 'light' : 'dark';

    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
    updateDarkModeToggleFlow();
}

export function getCurrentAppearanceFlow() {
    return normalizeAppearance(
        document.documentElement.dataset.appearance || localStorage.getItem(APPEARANCE_STORAGE_KEY)
    );
}

export function updateAppearanceSelectionFlow() {
    const currentAppearance = getCurrentAppearanceFlow();
    const buttons = document.querySelectorAll('[data-appearance-option]');

    buttons.forEach((button) => {
        if (!(button instanceof HTMLElement)) {
            return;
        }

        const isSelected = button.dataset.appearanceOption === currentAppearance;
        button.dataset.selected = String(isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
    });
}

export function setAppearanceFlow(nextAppearance) {
    const normalizedAppearance = normalizeAppearance(nextAppearance);

    localStorage.setItem(APPEARANCE_STORAGE_KEY, normalizedAppearance);
    applyAppearance(normalizedAppearance);
    updateAppearanceSelectionFlow();
}
