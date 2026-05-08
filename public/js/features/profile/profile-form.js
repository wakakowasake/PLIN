import { compressImage, sanitizeImageUrl } from '../../ui-utils.js';

const PROFILE_FIELD_IDS = [
    'profile-name-input',
    'profile-phone',
    'profile-birth',
    'profile-blood-type',
    'profile-allergies'
];

function getElement(id) {
    return document.getElementById(id);
}

export function loadProfileForm(user) {
    if (!user) return;

    const nameInput = getElement('profile-name-input');
    const emailDisplay = getElement('profile-email-display');
    const avatarLarge = getElement('profile-avatar-large');
    const phoneInput = getElement('profile-phone');
    const birthInput = getElement('profile-birth');
    const bloodTypeInput = getElement('profile-blood-type');
    const allergiesInput = getElement('profile-allergies');

    if (nameInput) nameInput.value = user.displayName || '';
    if (emailDisplay) emailDisplay.textContent = user.email || '--';

    const photoURL = sanitizeImageUrl(
        user.customPhotoURL || user.photoURL || localStorage.getItem('cachedUserPhotoURL'),
        ''
    );
    if (avatarLarge && photoURL) avatarLarge.style.backgroundImage = `url("${photoURL}")`;

    if (phoneInput) phoneInput.value = user.phone || '';
    if (birthInput) birthInput.value = user.birth || '';
    if (bloodTypeInput) bloodTypeInput.value = user.bloodType || '';
    if (allergiesInput) allergiesInput.value = user.allergies || '';
}

export async function handleProfilePhotoSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const dataURL = await compressImage(file, 400, 0.7);
        const avatarLarge = getElement('profile-avatar-large');
        if (avatarLarge) avatarLarge.style.backgroundImage = `url("${dataURL}")`;
        sessionStorage.setItem('pendingProfilePhoto', dataURL);
    } catch (error) {
        console.error('Profile photo compression failed:', error);
        alert('이미지 처리 중 오류가 발생했습니다.');
    }
}

export function setProfileFieldsDisabled(disabled) {
    PROFILE_FIELD_IDS.forEach((id) => {
        const element = getElement(id);
        if (element) element.disabled = disabled;
    });
}

export function setProfileEditActionsVisible(isVisible) {
    const editButton = getElement('profile-edit-btn');
    const photoButton = getElement('profile-photo-btn');
    const actionButtons = getElement('profile-action-btns');

    if (isVisible) {
        editButton?.classList.add('hidden');
        photoButton?.classList.remove('hidden');
        actionButtons?.classList.remove('hidden');
        return;
    }

    editButton?.classList.remove('hidden');
    photoButton?.classList.add('hidden');
    actionButtons?.classList.add('hidden');
}

export function enableProfileEditMode() {
    setProfileFieldsDisabled(false);
    setProfileEditActionsVisible(true);
}

export function resetPendingProfilePhoto() {
    sessionStorage.removeItem('pendingProfilePhoto');
}

export function cancelProfileEditMode({ reloadProfileData }) {
    setProfileFieldsDisabled(true);
    setProfileEditActionsVisible(false);
    resetPendingProfilePhoto();
    reloadProfileData?.();
}

export function readProfileFormValues() {
    const nameInput = getElement('profile-name-input');
    const phoneInput = getElement('profile-phone');
    const birthInput = getElement('profile-birth');
    const bloodTypeInput = getElement('profile-blood-type');
    const allergiesInput = getElement('profile-allergies');

    return {
        displayName: nameInput ? nameInput.value.trim() : '',
        phone: phoneInput ? phoneInput.value.trim() : '',
        birth: birthInput ? birthInput.value : '',
        bloodType: bloodTypeInput ? bloodTypeInput.value : '',
        allergies: allergiesInput ? allergiesInput.value.trim() : ''
    };
}

export function getPendingProfilePhoto() {
    return sessionStorage.getItem('pendingProfilePhoto');
}

export function clearPendingProfilePhoto() {
    sessionStorage.removeItem('pendingProfilePhoto');
}

export function updateHeaderAvatar(photoURL) {
    const userAvatar = getElement('user-avatar');
    const safePhotoURL = sanitizeImageUrl(photoURL || '', '');
    if (userAvatar && safePhotoURL) {
        userAvatar.style.backgroundImage = `url("${safePhotoURL}")`;
    }
}

export function updateMainTitle(displayName) {
    const mainTitle = getElement('main-view-title');
    if (mainTitle) {
        mainTitle.innerText = `${displayName}님의 여행 계획`;
    }
}

export function resetProfileEditUi() {
    setProfileFieldsDisabled(true);
    setProfileEditActionsVisible(false);
}
