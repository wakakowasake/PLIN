import { assertAuthServicesReady } from '../../services/firebase/auth-service.js';
import { mergeUserProfile } from '../../services/firebase/profile-repository.js';
import { defaultTravelData, setIsGuestMode, setTravelData } from '../../state.js';
import { buildUserProfileSeed } from '../../../../shared/services/firebase/profile-data-helpers.js';
import { sanitizeImageUrl } from '../../ui-utils.js';

const PENDING_DELETE_REAUTH_KEY = 'plin-pending-delete-reauth';
const PENDING_GUEST_DATA_KEY = 'pending_guest_data';
const PENDING_SOCIAL_AUTH_RESULT_KEY = 'plin-pending-social-auth-result';
const PENDING_SOCIAL_RETURN_TO_KEY = 'plin-pending-social-return-to';
const USER_CACHE_KEYS = ['cachedUserPhotoURL', 'cachedUserDisplayName', 'cachedUserEmail'];

export function takePendingDeleteReauthFlag() {
    try {
        const value = sessionStorage.getItem(PENDING_DELETE_REAUTH_KEY);
        sessionStorage.removeItem(PENDING_DELETE_REAUTH_KEY);
        return value === '1';
    } catch (error) {
        console.warn("탈퇴 재인증 플래그 조회/삭제 실패:", error);
        return false;
    }
}

export function storePendingGuestData(guestData) {
    if (!guestData) return;

    try {
        localStorage.setItem(PENDING_GUEST_DATA_KEY, JSON.stringify(guestData));
    } catch (error) {
        console.warn("게스트 데이터 임시 저장 실패:", error);
    }
}

export function storePendingSocialReturnTo(url) {
    const nextUrl = typeof url === 'string' && url.trim()
        ? url.trim()
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;

    try {
        sessionStorage.setItem(PENDING_SOCIAL_RETURN_TO_KEY, nextUrl);
    } catch (error) {
        console.warn("소셜 로그인 복귀 주소 저장 실패:", error);
    }
}

export function takePendingSocialReturnTo() {
    try {
        const value = sessionStorage.getItem(PENDING_SOCIAL_RETURN_TO_KEY);
        sessionStorage.removeItem(PENDING_SOCIAL_RETURN_TO_KEY);
        return value || '/';
    } catch (error) {
        console.warn("소셜 로그인 복귀 주소 조회 실패:", error);
        return '/';
    }
}

export function storePendingSocialAuthResult(result) {
    if (!result || typeof result !== 'object') return;

    try {
        sessionStorage.setItem(PENDING_SOCIAL_AUTH_RESULT_KEY, JSON.stringify(result));
    } catch (error) {
        console.warn("소셜 로그인 결과 저장 실패:", error);
    }
}

export function takePendingSocialAuthResult() {
    try {
        const raw = sessionStorage.getItem(PENDING_SOCIAL_AUTH_RESULT_KEY);
        sessionStorage.removeItem(PENDING_SOCIAL_AUTH_RESULT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn("소셜 로그인 결과 조회 실패:", error);
        return null;
    }
}

export function takePendingGuestData() {
    try {
        const pendingData = localStorage.getItem(PENDING_GUEST_DATA_KEY);
        if (!pendingData) return null;

        localStorage.removeItem(PENDING_GUEST_DATA_KEY);
        return JSON.parse(pendingData);
    } catch (error) {
        console.warn("게스트 데이터 조회/삭제 실패:", error);
        return null;
    }
}

export function clearUserProfileCache() {
    USER_CACHE_KEYS.forEach((key) => {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`사용자 캐시 정리 실패: ${key}`, error);
        }
    });
}

export function cacheUserIdentity({ displayName = '', email = '', photoURL = null } = {}) {
    try {
        localStorage.setItem('cachedUserDisplayName', displayName || '');
        localStorage.setItem('cachedUserEmail', email || '');
        const safePhotoURL = sanitizeImageUrl(photoURL || '', '');
        if (safePhotoURL) {
            localStorage.setItem('cachedUserPhotoURL', safePhotoURL);
        }
    } catch (error) {
        console.warn("사용자 캐시 저장 실패:", error);
    }
}

export async function persistGuestDataAfterLogin(user, guestDataToSave, { saveAllDayData, renderItinerary }) {
    if (!guestDataToSave || !user) return;

    assertAuthServicesReady();
    await mergeUserProfile(user.uid, buildUserProfileSeed(user, {
        agreedToTerms: true,
        agreedToPrivacy: true,
        agreedAt: new Date().toISOString()
    }));

    setIsGuestMode(false);
    await saveAllDayData(null, guestDataToSave);
    renderItinerary();
}

export async function syncPendingGuestSession(wasGuest, { saveAllDayData, renderItinerary }) {
    setIsGuestMode(false);

    const pendingGuestData = takePendingGuestData();
    if (pendingGuestData) {
        try {
            await saveAllDayData(null, pendingGuestData);
        } catch (error) {
            console.error("게스트 데이터 동기화 실패", error);
        }
        return;
    }

    if (wasGuest) {
        renderItinerary();
    }
}

export function enterGuestModeState() {
    setIsGuestMode(true);
    setTravelData(JSON.parse(JSON.stringify(defaultTravelData)));
}

function applyCachedAvatar() {
    const userAvatarOnLoad = document.getElementById('user-avatar');
    if (!userAvatarOnLoad) return;

    const cachedPhotoOnLoad = sanitizeImageUrl(localStorage.getItem('cachedUserPhotoURL') || '', '');
    const photoToUse = cachedPhotoOnLoad || defaultTravelData.meta.userImage;
    userAvatarOnLoad.style.backgroundImage = `url('${photoToUse}')`;
}

export function initializeCachedAvatarOnLoad() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyCachedAvatar, { once: true });
        return;
    }

    applyCachedAvatar();
}
