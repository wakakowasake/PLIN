import { firebaseReady } from '../../firebase.js';
import {
    assertAuthServicesReady,
    isPopupRetryError,
    signInWithGooglePopup,
    signInWithGoogleRedirect,
    signInWithApplePopup,
    signInWithAppleRedirect,
    readAuthRedirectResult,
    signInWithCustomFirebaseToken,
    signInWithEmailPassword,
    signUpWithEmailPassword,
    sendCurrentUserEmailVerification,
    refreshCurrentAuthUser,
    signOutCurrentUser,
    getCurrentAuthUser
} from '../../services/firebase/auth-service.js';
import { showToast } from '../../ui/modals.js';
import {
    enterGuestModeState,
    clearUserProfileCache,
    persistGuestDataAfterLogin,
    storePendingGuestData,
    storePendingSocialReturnTo,
    takePendingDeleteReauthFlag,
    takePendingSocialAuthResult
} from './session-sync.js';
import { fetchBackendJson } from '../../services/backend/api-client.js';
import {
    exchangeWebSocialAuthSession,
    getSocialAuthProviderLabel,
    openWebSocialAuthPopupShell,
    startWebSocialAuthSession,
    waitForWebSocialAuthPopupResult
} from '../../services/backend/social-auth-service.js';

const CUSTOM_WEB_AUTH_PROVIDERS = new Set(['kakao', 'naver']);
const POPUP_DISABLED_CUSTOM_WEB_AUTH_PROVIDERS = new Set(['naver']);
const PENDING_DELETION_MESSAGE = '계정 삭제가 요청되어 다시 로그인할 수 없어요. 데이터 삭제 처리 중입니다.';
let emailAuthMode = 'signin';
let emailAuthGuestDataToSave = null;

function redirectLocalhostForFirebaseOAuth() {
    if (window.location.hostname !== '127.0.0.1') {
        return false;
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.hostname = 'localhost';
    window.location.assign(nextUrl.toString());
    return true;
}

function normalizeWebAuthProvider(provider) {
    const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';

    if (normalized === 'apple' || normalized === 'kakao' || normalized === 'naver') {
        return normalized;
    }

    return 'google';
}

function readErrorMessage(error, fallbackMessage) {
    const code = typeof error?.code === 'string' ? error.code.trim() : '';
    if (code === 'auth/user-disabled') {
        return PENDING_DELETION_MESSAGE;
    }

    const message = typeof error?.message === 'string' ? error.message.trim() : '';
    if (message.includes('auth/user-disabled') || message.includes('user-disabled')) {
        return PENDING_DELETION_MESSAGE;
    }

    return message || fallbackMessage;
}

function readEmailAuthErrorMessage(error) {
    const code = typeof error?.code === 'string' ? error.code.trim() : '';

    switch (code) {
        case 'auth/email-already-in-use':
            return '이미 가입된 이메일이에요. 로그인으로 이어가 주세요.';
        case 'auth/invalid-email':
            return '이메일 주소를 다시 확인해 주세요.';
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return '이메일 또는 비밀번호가 맞지 않아요.';
        case 'auth/weak-password':
            return '비밀번호는 6자 이상으로 입력해 주세요.';
        case 'auth/too-many-requests':
            return '로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.';
        case 'auth/operation-not-allowed':
            return 'Firebase 콘솔에서 이메일/비밀번호 로그인을 먼저 켜야 해요.';
        case 'auth/unauthorized-continue-uri':
        case 'auth/invalid-continue-uri':
            return 'Firebase 인증 메일 링크 도메인 설정을 확인해야 해요.';
        case 'auth/network-request-failed':
            return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
        default:
            return readErrorMessage(error, '이메일 로그인을 완료하지 못했어요. 다시 시도해 주세요.');
    }
}

function normalizeEmailAuthMode(mode) {
    const normalized = typeof mode === 'string' ? mode.trim().toLowerCase() : '';
    return normalized === 'signup' || normalized === 'sign-up' || normalized === 'join' ? 'signup' : 'signin';
}

function getEmailAuthElements() {
    const modal = document.getElementById('email-auth-modal');
    return {
        modal,
        form: document.getElementById('email-auth-form'),
        title: document.getElementById('email-auth-title'),
        desc: document.getElementById('email-auth-desc'),
        nameWrap: document.getElementById('email-auth-name-wrap'),
        confirmWrap: document.getElementById('email-auth-confirm-wrap'),
        nameInput: document.getElementById('email-auth-name'),
        emailInput: document.getElementById('email-auth-email'),
        passwordInput: document.getElementById('email-auth-password'),
        confirmInput: document.getElementById('email-auth-password-confirm'),
        status: document.getElementById('email-auth-status'),
        submitButton: document.getElementById('email-auth-submit'),
        submitLabel: document.getElementById('email-auth-submit-label'),
        signinTab: document.getElementById('email-auth-mode-signin'),
        signupTab: document.getElementById('email-auth-mode-signup')
    };
}

function setEmailAuthStatus(message = '', tone = 'info') {
    const { status } = getEmailAuthElements();
    if (!status) return;

    status.textContent = message;
    status.dataset.tone = tone;
    status.classList.toggle('hidden', !message);
}

function setEmailAuthBusy(isBusy) {
    const { submitButton, submitLabel } = getEmailAuthElements();
    if (submitButton) submitButton.disabled = isBusy;
    if (submitLabel) submitLabel.textContent = isBusy
        ? '처리 중...'
        : (emailAuthMode === 'signup' ? '이메일로 가입하기' : '이메일로 로그인');
}

function applyEmailAuthMode(mode) {
    emailAuthMode = normalizeEmailAuthMode(mode);
    const {
        title,
        desc,
        nameWrap,
        confirmWrap,
        submitLabel,
        signinTab,
        signupTab
    } = getEmailAuthElements();
    const isSignup = emailAuthMode === 'signup';

    if (title) title.textContent = isSignup ? '이메일로 가입하기' : '이메일로 로그인';
    if (desc) {
        desc.textContent = isSignup
            ? '가입 후 메일 인증을 완료하면 PLIN을 시작할 수 있어요.'
            : '가입한 이메일과 비밀번호로 이어서 사용할 수 있어요.';
    }
    nameWrap?.classList.toggle('hidden', !isSignup);
    confirmWrap?.classList.toggle('hidden', !isSignup);
    signinTab?.classList.toggle('is-active', !isSignup);
    signupTab?.classList.toggle('is-active', isSignup);
    signinTab?.setAttribute('aria-pressed', String(!isSignup));
    signupTab?.setAttribute('aria-pressed', String(isSignup));
    if (submitLabel) submitLabel.textContent = isSignup ? '이메일로 가입하기' : '이메일로 로그인';
}

export function openEmailAuthModalFlow(mode = 'signin', guestDataToSave = null) {
    const { modal, emailInput, form } = getEmailAuthElements();
    if (!modal) return;

    emailAuthGuestDataToSave = guestDataToSave || null;
    form?.reset();
    setEmailAuthStatus('');
    applyEmailAuthMode(mode);
    setEmailAuthBusy(false);
    modal.classList.remove('hidden');
    setTimeout(() => emailInput?.focus(), 40);
}

export function closeEmailAuthModalFlow() {
    const { modal } = getEmailAuthElements();
    modal?.classList.add('hidden');
    setEmailAuthStatus('');
}

export function switchEmailAuthModeFlow(mode) {
    applyEmailAuthMode(mode);
    setEmailAuthStatus('');
}

export async function submitEmailAuthFlow(event = null, { saveAllDayData, renderItinerary } = {}) {
    event?.preventDefault?.();

    const {
        nameInput,
        emailInput,
        passwordInput,
        confirmInput
    } = getEmailAuthElements();

    const isSignup = emailAuthMode === 'signup';
    const displayName = String(nameInput?.value || '').trim();
    const email = String(emailInput?.value || '').trim();
    const password = String(passwordInput?.value || '');
    const confirmPassword = String(confirmInput?.value || '');

    if (!email) {
        setEmailAuthStatus('이메일을 입력해 주세요.', 'error');
        emailInput?.focus();
        return;
    }

    if (password.length < 6) {
        setEmailAuthStatus('비밀번호는 6자 이상으로 입력해 주세요.', 'error');
        passwordInput?.focus();
        return;
    }

    if (isSignup && password !== confirmPassword) {
        setEmailAuthStatus('비밀번호 확인이 일치하지 않아요.', 'error');
        confirmInput?.focus();
        return;
    }

    try {
        setEmailAuthBusy(true);
        setEmailAuthStatus(isSignup ? '계정을 만드는 중이에요.' : '로그인 중이에요.', 'info');
        await firebaseReady;
        assertAuthServicesReady();

        const result = isSignup
            ? await signUpWithEmailPassword(email, password, displayName)
            : await signInWithEmailPassword(email, password);

        if (!result?.user?.emailVerified) {
            if (!isSignup) {
                await sendCurrentUserEmailVerification().catch((error) => {
                    console.warn('인증 메일 재발송 실패:', error);
                });
            }

            if (emailAuthGuestDataToSave) {
                storePendingGuestData(emailAuthGuestDataToSave);
            }

            closeEmailAuthModalFlow();
            showToast('인증 메일을 보냈어요. 메일함에서 확인해 주세요.', 'info');
            return result;
        }

        await persistGuestDataAfterLogin(result?.user, emailAuthGuestDataToSave, { saveAllDayData, renderItinerary });
        closeEmailAuthModalFlow();
        showToast('로그인했어요.', 'success');
        return result;
    } catch (error) {
        console.error('이메일 로그인 실패', error);
        const currentUser = getCurrentAuthUser();
        const message = readEmailAuthErrorMessage(error);

        if (isSignup && currentUser?.email === email && !currentUser.emailVerified) {
            if (emailAuthGuestDataToSave) {
                storePendingGuestData(emailAuthGuestDataToSave);
            }

            closeEmailAuthModalFlow();
            showToast(`${message} 인증 화면에서 다시 보내기를 눌러 주세요.`, 'warning');
            return { user: currentUser };
        }

        setEmailAuthStatus(message, 'error');
        showToast(message, 'error');
        return null;
    } finally {
        setEmailAuthBusy(false);
    }
}

export async function resendEmailVerificationFlow() {
    try {
        await firebaseReady;
        assertAuthServicesReady();
        const user = await sendCurrentUserEmailVerification();
        if (user?.emailVerified) {
            showToast('이미 메일 인증이 완료되어 있어요.', 'success');
            return;
        }

        showToast('인증 메일을 다시 보냈어요. 스팸함도 함께 확인해 주세요.', 'success');
    } catch (error) {
        console.error('인증 메일 재발송 실패', error);
        showToast(readEmailAuthErrorMessage(error), 'error');
    }
}

export async function checkEmailVerificationFlow() {
    try {
        await firebaseReady;
        assertAuthServicesReady();
        const user = await refreshCurrentAuthUser();
        if (user?.emailVerified) {
            showToast('메일 인증이 확인되었어요.', 'success');
            window.location.reload();
            return true;
        }

        showToast('아직 인증이 확인되지 않았어요. 메일의 링크를 먼저 눌러 주세요.', 'warning');
        return false;
    } catch (error) {
        console.error('메일 인증 상태 확인 실패', error);
        showToast(readEmailAuthErrorMessage(error), 'error');
        return false;
    }
}

function supportsCustomSocialPopup(provider) {
    return CUSTOM_WEB_AUTH_PROVIDERS.has(provider)
        && !POPUP_DISABLED_CUSTOM_WEB_AUTH_PROVIDERS.has(provider);
}

function resolveSocialRedirectErrorMessage(providerLabel, errorCode) {
    switch (String(errorCode || '').trim().toLowerCase()) {
        case 'access_denied':
            return `${providerLabel} 로그인을 취소했어요.`;
        case 'expired':
            return `${providerLabel} 로그인 유효 시간이 만료되었어요. 다시 시도해 주세요.`;
        case 'missing_code':
            return `${providerLabel} 로그인 확인값을 받지 못했어요. 다시 시도해 주세요.`;
        case 'callback_failed':
            return `${providerLabel} 로그인 확인 중 문제가 생겼어요. 다시 시도해 주세요.`;
        default:
            return `${providerLabel} 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`;
    }
}

async function completeCustomSocialSignInResult(pendingSocialResult, {
    guestDataToSave = null,
    saveAllDayData,
    renderItinerary
} = {}) {
    const provider = normalizeWebAuthProvider(pendingSocialResult?.provider);
    const providerLabel = getSocialAuthProviderLabel(provider);
    const redirectError = typeof pendingSocialResult?.error === 'string' ? pendingSocialResult.error : '';

    if (redirectError) {
        throw new Error(resolveSocialRedirectErrorMessage(providerLabel, redirectError));
    }

    await firebaseReady;
    assertAuthServicesReady();

    const payload = await exchangeWebSocialAuthSession({
        provider,
        intent: 'signin',
        ticket: pendingSocialResult?.ticket
    });

    if (payload.outcome !== 'signed_in' || !payload.firebaseCustomToken) {
        throw new Error(payload.message || `${providerLabel} 로그인을 완료하지 못했어요.`);
    }

    const signInResult = await signInWithCustomFirebaseToken(payload.firebaseCustomToken);

    if (guestDataToSave) {
        await persistGuestDataAfterLogin(signInResult?.user, guestDataToSave, { saveAllDayData, renderItinerary });
    }

    return signInResult;
}

async function runCustomSocialPopupSignIn(provider, guestDataToSave = null, {
    saveAllDayData,
    renderItinerary,
    popupShell = null
} = {}) {
    const popup = popupShell && !popupShell.closed
        ? popupShell
        : openWebSocialAuthPopupShell(provider);

    if (!popup) {
        return false;
    }

    try {
        const startPayload = await startWebSocialAuthSession(provider, 'signin', { flow: 'popup' });
        popup.location.assign(startPayload.authorizationUrl);

        const popupResult = await waitForWebSocialAuthPopupResult(popup, provider);
        await completeCustomSocialSignInResult(popupResult, {
            guestDataToSave,
            saveAllDayData,
            renderItinerary
        });
        return true;
    } catch (error) {
        try {
            popup.close();
        } catch {
            // noop
        }
        throw error;
    }
}

async function startCustomSocialSignIn(provider, guestDataToSave = null, {
    saveAllDayData,
    renderItinerary,
    popupShell = null
} = {}) {
    const normalizedProvider = normalizeWebAuthProvider(provider);
    const canUsePopup = supportsCustomSocialPopup(normalizedProvider);

    if (canUsePopup) {
        const completedInPopup = await runCustomSocialPopupSignIn(normalizedProvider, guestDataToSave, {
            saveAllDayData,
            renderItinerary,
            popupShell
        });

        if (completedInPopup) {
            return 'completed';
        }

        showToast(`${getSocialAuthProviderLabel(normalizedProvider)} 로그인 창이 차단되어 전체 화면으로 이어서 진행할게요.`, 'info');
    }

    const startPayload = await startWebSocialAuthSession(normalizedProvider, 'signin');
    storePendingSocialReturnTo();
    if (guestDataToSave) {
        storePendingGuestData(guestDataToSave);
    }
    window.location.assign(startPayload.authorizationUrl);
    return 'redirect';
}

async function completePendingSocialSignIn() {
    const pendingSocialResult = takePendingSocialAuthResult();
    if (!pendingSocialResult) {
        return false;
    }

    await completeCustomSocialSignInResult(pendingSocialResult);

    return true;
}

export async function loginFlow(provider = 'google', guestDataToSave = null, { saveAllDayData, renderItinerary }) {
    if (redirectLocalhostForFirebaseOAuth()) {
        showToast('로컬 로그인은 Firebase 승인 도메인인 localhost에서 이어갈게요.', 'info');
        return;
    }

    const nextProvider = normalizeWebAuthProvider(provider);
    const popupShell = supportsCustomSocialPopup(nextProvider)
        ? openWebSocialAuthPopupShell(nextProvider)
        : null;

    try {
        if (CUSTOM_WEB_AUTH_PROVIDERS.has(nextProvider)) {
            await startCustomSocialSignIn(nextProvider, guestDataToSave, {
                saveAllDayData,
                renderItinerary,
                popupShell
            });
            return;
        }

        await firebaseReady;
        assertAuthServicesReady();

        try {
            const result = nextProvider === 'apple'
                ? await signInWithApplePopup()
                : await signInWithGooglePopup();
            await persistGuestDataAfterLogin(result?.user, guestDataToSave, { saveAllDayData, renderItinerary });
            return;
        } catch (error) {
            if (isPopupRetryError(error)) {
                storePendingGuestData(guestDataToSave);
                if (nextProvider === 'apple') {
                    await signInWithAppleRedirect();
                } else {
                    await signInWithGoogleRedirect();
                }
                return;
            }
            throw error;
        }
    } catch (error) {
        console.error("로그인 실패", error);
        showToast(readErrorMessage(error, '로그인을 완료하지 못했어요. 다시 시도해 주세요.'), 'error');
    }
}

export function enterGuestModeFlow({ createNewTrip }) {
    enterGuestModeState();

    document.getElementById('login-view')?.classList.add('hidden');
    document.getElementById('main-view')?.classList.remove('hidden');
    document.getElementById('app-header')?.classList.remove('hidden');

    setTimeout(() => {
        createNewTrip();
    }, 100);
}

export async function handleRedirectResultFlow() {
    try {
        await firebaseReady;
        assertAuthServicesReady();

        const handledCustomSocial = await completePendingSocialSignIn();
        if (handledCustomSocial) {
            takePendingDeleteReauthFlag();
            return;
        }

        const result = await readAuthRedirectResult();
        if (result) {
            takePendingDeleteReauthFlag();
        }
    } catch (error) {
        console.error("Redirect login error:", error);
        showToast(readErrorMessage(error, '로그인을 완료하지 못했어요. 다시 시도해 주세요.'), 'error');
    }
}

export async function logoutFlow({ closeLogoutModal }) {
    try {
        await firebaseReady;
        assertAuthServicesReady();
        await signOutCurrentUser();
        closeLogoutModal();
        clearUserProfileCache();
    } catch (error) {
        console.error("로그아웃 실패", error);
    }
}

export async function deleteAccountFlow() {
    try {
        await firebaseReady;
        assertAuthServicesReady();

        const user = getCurrentAuthUser();
        if (!user) {
            alert("로그인이 필요합니다.");
            return;
        }

        await fetchBackendJson('/account/deletion-request', {
            method: 'POST',
            body: {
                reason: 'web_app_profile'
            }
        });

        await signOutCurrentUser().catch((signOutError) => {
            console.warn("탈퇴 요청 후 로그아웃 처리에 실패했습니다.", signOutError);
        });
        clearUserProfileCache();

        alert("계정과 관련 데이터 삭제가 완료되었습니다. 그동안 PLIN을 이용해주셔서 감사합니다.");
        window.location.reload();
    } catch (error) {
        console.error("회원 탈퇴 요청 실패:", error);
        alert("회원 탈퇴 처리 중 오류가 발생했습니다: " + error.message);
    }
}
