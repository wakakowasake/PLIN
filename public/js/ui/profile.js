import {
    closeProfileViewFlow,
    confirmWithdrawalFlow,
    loadProfileDataFlow,
    openUserProfileFlow,
    saveProfileChangesFlow
} from '../features/profile/profile-flow.js';
import {
    cancelProfileEditMode,
    enableProfileEditMode,
    handleProfilePhotoSelection
} from '../features/profile/profile-form.js';
import { closeUserSettingsFlow, openUserSettingsFlow } from '../features/profile/settings-flow.js';
import { initDarkModeFlow, toggleDarkModeFlow, updateDarkModeToggleFlow } from '../features/profile/theme-flow.js';

export function openUserMenu() {
    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
        if (!dropdown.classList.contains('hidden')) {
            document.addEventListener('click', closeUserMenuOnClickOutside);
        }
    }
}

export function closeUserMenuOnClickOutside(event) {
    const dropdown = document.getElementById('user-menu-dropdown');
    const userAvatar = document.getElementById('user-avatar');
    if (dropdown && userAvatar && !dropdown.contains(event.target) && !userAvatar.contains(event.target)) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', closeUserMenuOnClickOutside);
    }
}

export function openUserSettings() {
    document.removeEventListener('click', closeUserMenuOnClickOutside);
    return openUserSettingsFlow();
}

export function closeUserSettings() {
    return closeUserSettingsFlow();
}

export function toggleDarkMode() {
    return toggleDarkModeFlow();
}

export function updateDarkModeToggle() {
    return updateDarkModeToggleFlow();
}

export function initDarkMode() {
    return initDarkModeFlow();
}

export function openUserProfile() {
    return openUserProfileFlow({ loadProfileData });
}

export function closeProfileView() {
    return closeProfileViewFlow();
}

export function loadProfileData() {
    return loadProfileDataFlow();
}

export function handleProfilePhotoChange(event) {
    return handleProfilePhotoSelection(event);
}

export function saveProfileChanges() {
    return saveProfileChangesFlow();
}

export function enableProfileEdit() {
    return enableProfileEditMode();
}

export function cancelProfileEdit() {
    return cancelProfileEditMode({ reloadProfileData: loadProfileData });
}

export function confirmWithdrawal() {
    return confirmWithdrawalFlow();
}

window.enableProfileEdit = enableProfileEdit;
window.cancelProfileEdit = cancelProfileEdit;
window.confirmWithdrawal = confirmWithdrawal;
window.toggleDarkMode = toggleDarkMode;
window.closeUserSettings = closeUserSettings;

export default {
    openUserMenu,
    closeUserMenuOnClickOutside,
    openUserSettings,
    closeUserSettings,
    toggleDarkMode,
    updateDarkModeToggle,
    initDarkMode,
    openUserProfile,
    closeProfileView,
    loadProfileData,
    handleProfilePhotoChange,
    saveProfileChanges,
    enableProfileEdit,
    cancelProfileEdit,
    confirmWithdrawal
};
