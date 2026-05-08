import { updateCurrentAuthProfile } from '../../services/firebase/auth-service.js';
import { firestoreDeleteFieldValue, updateUserProfile } from '../../services/firebase/profile-repository.js';
import { currentUser, setCurrentUser } from '../../state.js';
import {
    clearPendingProfilePhoto,
    getPendingProfilePhoto,
    loadProfileForm,
    readProfileFormValues,
    resetProfileEditUi,
    updateHeaderAvatar,
    updateMainTitle
} from './profile-form.js';

export function loadProfileDataFlow() {
    if (!currentUser) return;
    loadProfileForm(currentUser);
}

export function openUserProfileFlow({ loadProfileData }) {
    if (window.switchTab) {
        window.switchTab('profile');
    } else {
        const profileView = document.getElementById('profile-view');
        const mainView = document.getElementById('main-view');
        const communityView = document.getElementById('community-view');
        const noticesView = document.getElementById('notices-view');
        if (mainView) mainView.classList.add('hidden');
        if (communityView) communityView.classList.add('hidden');
        if (noticesView) noticesView.classList.add('hidden');
        if (profileView) profileView.classList.remove('hidden');
        loadProfileData();
    }

    const dropdown = document.getElementById('user-menu-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
}

export function closeProfileViewFlow() {
    if (window.switchTab) {
        window.switchTab('main');
    } else {
        const profileView = document.getElementById('profile-view');
        const mainView = document.getElementById('main-view');
        const noticesView = document.getElementById('notices-view');
        if (profileView) profileView.classList.add('hidden');
        if (noticesView) noticesView.classList.add('hidden');
        if (mainView) mainView.classList.remove('hidden');
    }

    const cachedPhoto = localStorage.getItem('cachedUserPhotoURL');
    updateHeaderAvatar(cachedPhoto);
}

export function confirmWithdrawalFlow() {
    if (!confirm('정말로 탈퇴하시겠습니까?\n탈퇴 시 프로필, 여행, 커뮤니티 활동, 업로드 파일 등 나의 모든 사항이 삭제됩니다.\n공유 여행 소유권은 남은 멤버에게 자동으로 넘어가며, 삭제 후에는 복구가 어렵습니다.')) {
        return;
    }

    if (window.Auth && window.Auth.deleteAccount) {
        window.Auth.deleteAccount();
        return;
    }

    alert('탈퇴 기능을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.');
}

export async function saveProfileChangesFlow() {
    if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
    }

    const formValues = readProfileFormValues();
    if (!formValues.displayName) {
        alert('이름을 입력하세요.');
        return;
    }

    try {
        await updateCurrentAuthProfile({ displayName: formValues.displayName });

        const updateData = {
            displayName: formValues.displayName,
            phone: formValues.phone,
            birth: formValues.birth,
            bloodType: formValues.bloodType,
            allergies: formValues.allergies,
            emergencyContact: firestoreDeleteFieldValue(),
            passport: firestoreDeleteFieldValue(),
            passportExpiry: firestoreDeleteFieldValue()
        };

        await updateUserProfile(currentUser.uid, updateData);

        const pendingPhoto = getPendingProfilePhoto();
        if (pendingPhoto) {
            await updateUserProfile(currentUser.uid, { photoURL: pendingPhoto });
            localStorage.setItem('cachedUserPhotoURL', pendingPhoto);
            setCurrentUser({ ...currentUser, customPhotoURL: pendingPhoto, displayName: formValues.displayName });
            updateHeaderAvatar(pendingPhoto);
            clearPendingProfilePhoto();
        } else {
            setCurrentUser({ ...currentUser, displayName: formValues.displayName });
        }

        updateMainTitle(formValues.displayName);
        resetProfileEditUi();
        alert('프로필이 저장되었습니다.');
    } catch (error) {
        console.error('프로필 저장 실패:', error);
        alert('프로필 저장에 실패했습니다: ' + error.message);
    }
}
