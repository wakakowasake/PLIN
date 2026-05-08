import {
    loginFlow,
    openEmailAuthModalFlow,
    closeEmailAuthModalFlow,
    switchEmailAuthModeFlow,
    submitEmailAuthFlow,
    resendEmailVerificationFlow,
    checkEmailVerificationFlow,
    enterGuestModeFlow,
    handleRedirectResultFlow,
    logoutFlow,
    deleteAccountFlow
} from '../features/auth/auth-flow.js';
import { confirmMandatoryTermsFlow, completeSignupFlow } from '../features/auth/signup-agreement-flow.js';
import { startAuthStateObserver, initializeCachedAvatarOnLoad } from '../features/auth/auth-observer-flow.js';
import { travelData } from '../state.js';
import { hideLoading } from './modals.js';
import { saveAllDayData } from './trip-info.js';
import { renderItinerary } from './renderers.js';
import { createNewTrip } from './trips.js';

const authFlowDeps = {
    saveAllDayData,
    renderItinerary
};

const authObserverDeps = {
    hideLoading,
    saveAllDayData,
    renderItinerary
};

function resolveLoginArgs(providerOrGuestData = null, maybeGuestData = null) {
    if (typeof providerOrGuestData === 'string') {
        const normalized = providerOrGuestData.trim().toLowerCase();
        if (normalized === 'google' || normalized === 'apple' || normalized === 'kakao' || normalized === 'naver') {
            return {
                provider: normalized,
                guestDataToSave: maybeGuestData
            };
        }
    }

    return {
        provider: 'google',
        guestDataToSave: providerOrGuestData
    };
}

export async function login(providerOrGuestData = null, maybeGuestData = null) {
    const { provider, guestDataToSave } = resolveLoginArgs(providerOrGuestData, maybeGuestData);
    return loginFlow(provider, guestDataToSave, authFlowDeps);
}

export function openEmailAuthModal(mode = 'signin', guestDataToSave = null) {
    return openEmailAuthModalFlow(mode, guestDataToSave);
}

export function closeEmailAuthModal() {
    return closeEmailAuthModalFlow();
}

export function switchEmailAuthMode(mode) {
    return switchEmailAuthModeFlow(mode);
}

export async function submitEmailAuth(event = null) {
    return submitEmailAuthFlow(event, authFlowDeps);
}

export async function resendEmailVerification() {
    return resendEmailVerificationFlow();
}

export async function checkEmailVerification() {
    return checkEmailVerificationFlow();
}

export async function enterGuestMode() {
    return enterGuestModeFlow({ createNewTrip });
}

export function openLoginView() {
    document.getElementById('signup-view')?.classList.add('hidden');
    document.getElementById('email-verification-view')?.classList.add('hidden');
    document.getElementById('login-view')?.classList.remove('hidden');
}

export function dismissLoginView() {
    document.getElementById('login-view')?.classList.add('hidden');
    document.getElementById('signup-view')?.classList.add('hidden');
    document.getElementById('email-verification-view')?.classList.add('hidden');
    document.getElementById('main-view')?.classList.remove('hidden');
    document.getElementById('app-header')?.classList.remove('hidden');
}

async function handleRedirectResult() {
    return handleRedirectResultFlow();
}

export async function logout() {
    return logoutFlow({ closeLogoutModal });
}

export function openLogoutModal() {
    const el = document.getElementById('logout-modal');
    if (el) el.classList.remove('hidden');
}

export function closeLogoutModal() {
    const el = document.getElementById('logout-modal');
    if (el) el.classList.add('hidden');
}

export function confirmLogout() {
    openLogoutModal();
}

export async function initAuthStateObserver() {
    return startAuthStateObserver(authObserverDeps);
}

handleRedirectResult();

initAuthStateObserver();

initializeCachedAvatarOnLoad();

export async function confirmMandatoryTerms() {
    return confirmMandatoryTermsFlow();
}

export async function deleteAccount() {
    return deleteAccountFlow();
}

export async function completeSignup() {
    return completeSignupFlow();
}

export async function loginWithGuestData() {
    await login(travelData);
}

window.login = login;
window.openEmailAuthModal = openEmailAuthModal;
window.closeEmailAuthModal = closeEmailAuthModal;
window.switchEmailAuthMode = switchEmailAuthMode;
window.submitEmailAuth = submitEmailAuth;
window.resendEmailVerification = resendEmailVerification;
window.checkEmailVerification = checkEmailVerification;
window.logout = logout;
window.openLogoutModal = openLogoutModal;
window.closeLogoutModal = closeLogoutModal;
window.confirmLogout = confirmLogout;
window.confirmMandatoryTerms = confirmMandatoryTerms;
window.deleteAccount = deleteAccount;
window.completeSignup = completeSignup;
window.enterGuestMode = enterGuestMode;
window.loginWithGuestData = loginWithGuestData;
window.openLoginView = openLoginView;
window.dismissLoginView = dismissLoginView;

export default {
    login,
    openEmailAuthModal,
    closeEmailAuthModal,
    switchEmailAuthMode,
    submitEmailAuth,
    resendEmailVerification,
    checkEmailVerification,
    logout,
    openLogoutModal,
    closeLogoutModal,
    confirmLogout,
    initAuthStateObserver,
    confirmMandatoryTerms,
    deleteAccount,
    completeSignup,
    enterGuestMode,
    loginWithGuestData,
    openLoginView,
    dismissLoginView
};
