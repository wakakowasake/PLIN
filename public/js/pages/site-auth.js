import { firebaseReady } from '../services/firebase/firebase-app.js';
import {
    assertAuthServicesReady,
    isPopupRetryError,
    observeAuthState,
    readAuthRedirectResult,
    signInWithApplePopup,
    signInWithAppleRedirect,
    signInWithCustomFirebaseToken,
    signInWithEmailPassword,
    signInWithGooglePopup,
    signInWithGoogleRedirect,
    signOutCurrentUser
} from '../services/firebase/auth-service.js';
import { fetchUserProfile } from '../services/firebase/profile-repository.js';
import {
    exchangeWebSocialAuthSession,
    getSocialAuthProviderLabel,
    openWebSocialAuthPopupShell,
    startWebSocialAuthSession,
    waitForWebSocialAuthPopupResult
} from '../services/backend/social-auth-service.js';

const SITE_ADMIN_EMAILS = new Set([
    'contact@plin.ink',
    'plin.ink@gmail.com'
]);
const CUSTOM_WEB_AUTH_PROVIDERS = new Set(['kakao', 'naver']);
const POPUP_DISABLED_CUSTOM_WEB_AUTH_PROVIDERS = new Set(['naver']);
const PENDING_SOCIAL_AUTH_RESULT_KEY = 'plin-pending-social-auth-result';
const PENDING_SOCIAL_RETURN_TO_KEY = 'plin-pending-social-return-to';
const PENDING_SITE_CONTINUE_TO_KEY = 'plin-site-auth-continue-to';
const PENDING_DELETION_MESSAGE = '계정 삭제가 요청되어 다시 로그인할 수 없어요. 데이터 삭제 처리 중입니다.';

const state = {
    user: null,
    isAdmin: false,
    initialized: false
};

let modal = null;
let statusEl = null;
let authObserverBound = false;
let autoOpenForWriteRequest = new URLSearchParams(window.location.search).get('write') === '1';
let pendingContinueTo = '';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeWebAuthProvider(provider) {
    const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';

    if (normalized === 'apple' || normalized === 'kakao' || normalized === 'naver') {
        return normalized;
    }

    return 'google';
}

function getProviderLabel(provider) {
    switch (normalizeWebAuthProvider(provider)) {
        case 'apple':
            return '애플';
        case 'kakao':
            return '카카오';
        case 'naver':
            return '네이버';
        default:
            return '구글';
    }
}

function readLoginErrorMessage(error, fallbackMessage) {
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

function normalizeContinueTo(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
        const url = new URL(raw, window.location.origin);
        if (url.origin !== window.location.origin) return '';
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return '';
    }
}

function setPendingContinueTo(value) {
    const continueTo = normalizeContinueTo(value);
    pendingContinueTo = continueTo;

    try {
        if (continueTo) {
            sessionStorage.setItem(PENDING_SITE_CONTINUE_TO_KEY, continueTo);
        } else {
            sessionStorage.removeItem(PENDING_SITE_CONTINUE_TO_KEY);
        }
    } catch (error) {
        console.warn('사이트 시작 경로 저장 실패:', error);
    }
}

function takePendingContinueTo() {
    let continueTo = pendingContinueTo;
    pendingContinueTo = '';

    try {
        continueTo = continueTo || sessionStorage.getItem(PENDING_SITE_CONTINUE_TO_KEY) || '';
        sessionStorage.removeItem(PENDING_SITE_CONTINUE_TO_KEY);
    } catch (error) {
        console.warn('사이트 시작 경로 조회 실패:', error);
    }

    return normalizeContinueTo(continueTo);
}

function redirectLocalhostForFirebaseOAuth() {
    if (window.location.hostname !== '127.0.0.1') {
        return false;
    }

    const nextUrl = new URL(window.location.href);
    nextUrl.hostname = 'localhost';
    window.location.assign(nextUrl.toString());
    return true;
}

function supportsCustomSocialPopup(provider) {
    return CUSTOM_WEB_AUTH_PROVIDERS.has(provider)
        && !POPUP_DISABLED_CUSTOM_WEB_AUTH_PROVIDERS.has(provider);
}

function storePendingSocialReturnTo() {
    try {
        sessionStorage.setItem(
            PENDING_SOCIAL_RETURN_TO_KEY,
            `${window.location.pathname}${window.location.search}${window.location.hash}`
        );
    } catch (error) {
        console.warn('사이트 소셜 로그인 복귀 주소 저장 실패:', error);
    }
}

function takePendingSocialAuthResult() {
    try {
        const raw = sessionStorage.getItem(PENDING_SOCIAL_AUTH_RESULT_KEY);
        sessionStorage.removeItem(PENDING_SOCIAL_AUTH_RESULT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('사이트 소셜 로그인 결과 조회 실패:', error);
        return null;
    }
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

async function completeCustomSocialSignInResult(pendingSocialResult) {
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

    return signInWithCustomFirebaseToken(payload.firebaseCustomToken);
}

async function completePendingSocialSignIn() {
    const pendingSocialResult = takePendingSocialAuthResult();
    if (!pendingSocialResult) {
        return false;
    }

    await completeCustomSocialSignInResult(pendingSocialResult);
    return true;
}

async function handleCustomSocialSignIn(provider, popupShell = null) {
    const normalizedProvider = normalizeWebAuthProvider(provider);

    if (supportsCustomSocialPopup(normalizedProvider)) {
        const popup = popupShell && !popupShell.closed
            ? popupShell
            : openWebSocialAuthPopupShell(normalizedProvider);

        if (popup) {
            try {
                const startPayload = await startWebSocialAuthSession(normalizedProvider, 'signin', { flow: 'popup' });
                popup.location.assign(startPayload.authorizationUrl);
                const popupResult = await waitForWebSocialAuthPopupResult(popup, normalizedProvider);
                await completeCustomSocialSignInResult(popupResult);
                return 'completed';
            } catch (error) {
                try {
                    popup.close();
                } catch {
                    // noop
                }
                throw error;
            }
        }

        setStatus(`${getSocialAuthProviderLabel(normalizedProvider)} 로그인 창이 차단되어 전체 화면으로 이어서 진행할게요.`, 'info');
    }

    const startPayload = await startWebSocialAuthSession(normalizedProvider, 'signin');
    storePendingSocialReturnTo();
    window.location.assign(startPayload.authorizationUrl);
    return 'redirect';
}

async function handleFirebaseProviderSignIn(provider) {
    try {
        if (provider === 'apple') {
            return await signInWithApplePopup();
        }

        return await signInWithGooglePopup();
    } catch (error) {
        if (isPopupRetryError(error)) {
            if (provider === 'apple') {
                await signInWithAppleRedirect();
            } else {
                await signInWithGoogleRedirect();
            }
            return null;
        }

        throw error;
    }
}

function setStatus(message = '', type = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.dataset.type = type;
}

function getModalMarkup() {
    return `
        <div class="site-auth-modal" id="site-auth-modal" hidden>
            <section class="site-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="site-auth-title">
                <div class="site-auth-head">
                    <div>
                        <h2 id="site-auth-title">시작하기</h2>
                        <p id="site-auth-desc">로그인하면 PLIN 여행 노트를 이어서 사용할 수 있습니다.</p>
                    </div>
                    <button type="button" class="site-auth-close" data-site-auth-close aria-label="로그인 창 닫기">×</button>
                </div>
                <div class="site-auth-body" id="site-auth-body"></div>
            </section>
        </div>
    `;
}

function ensureModal() {
    if (modal) return modal;

    document.body.insertAdjacentHTML('beforeend', getModalMarkup());
    modal = document.getElementById('site-auth-modal');
    modal?.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('[data-site-auth-close]')) {
            closeAuthModal();
        }
    });

    return modal;
}

function renderSignedOut() {
    const body = document.getElementById('site-auth-body');
    if (!body) return;

    body.innerHTML = `
        <div class="site-auth-providers" aria-label="소셜 로그인">
            <button type="button" class="site-auth-provider site-auth-provider--google" data-site-provider="google">
                <img src="/images/auth/google-ci-transparent.png" alt="" aria-hidden="true">
                <span>구글 로그인</span>
                <span></span>
            </button>
            <button type="button" class="site-auth-provider site-auth-provider--kakao" data-site-provider="kakao">
                <img src="/images/auth/kakao-ci-transparent.png" alt="" aria-hidden="true">
                <span>카카오 로그인</span>
                <span></span>
            </button>
            <button type="button" class="site-auth-provider site-auth-provider--naver" data-site-provider="naver">
                <img src="/images/auth/naver-ci-transparent.png" alt="" aria-hidden="true">
                <span>네이버 로그인</span>
                <span></span>
            </button>
            <button type="button" class="site-auth-provider site-auth-provider--apple" data-site-provider="apple">
                <span class="site-auth-apple-glyph" aria-hidden="true"></span>
                <span>애플 로그인</span>
                <span></span>
            </button>
        </div>
        <form class="site-auth-email-form" id="site-auth-email-form">
            <input type="email" id="site-auth-email" autocomplete="email" placeholder="이메일">
            <input type="password" id="site-auth-password" autocomplete="current-password" placeholder="비밀번호">
            <button type="submit" class="button button-primary">이메일로 로그인</button>
        </form>
        <p class="site-auth-status" id="site-auth-status" role="status"></p>
    `;

    statusEl = document.getElementById('site-auth-status');
    body.querySelectorAll('[data-site-provider]').forEach((button) => {
        button.addEventListener('click', () => handleProviderLogin(button.dataset.siteProvider || 'google'));
    });
    document.getElementById('site-auth-email-form')?.addEventListener('submit', handleEmailLogin);
}

function renderSignedIn() {
    const body = document.getElementById('site-auth-body');
    if (!body) return;

    const userLabel = state.isAdmin ? '관리자' : '로그인 완료';
    const adminActions = state.isAdmin
        ? `
            <div class="site-auth-admin-actions" aria-label="작성 메뉴">
                <a href="/notices?write=1" class="button button-primary">공지 작성</a>
                <a href="/blog?write=1" class="button button-primary">블로그 작성</a>
            </div>
        `
        : '';

    body.innerHTML = `
        <div class="site-auth-account">
            <strong>${escapeHtml(userLabel)}</strong>
            <p>${state.isAdmin ? '공지와 블로그를 작성할 수 있습니다.' : '로그인되어 있습니다.'}</p>
        </div>
        ${adminActions}
        <div class="site-auth-user-actions">
            <a href="/m" class="button button-secondary">PLIN 열기</a>
            <button type="button" class="button button-secondary" id="site-auth-logout">로그아웃</button>
        </div>
        <p class="site-auth-status" id="site-auth-status" role="status"></p>
    `;

    statusEl = document.getElementById('site-auth-status');
    document.getElementById('site-auth-logout')?.addEventListener('click', handleLogout);
}

function renderAuthState() {
    ensureModal();
    if (state.user) {
        renderSignedIn();
    } else {
        renderSignedOut();
    }
}

export function openAuthModal(options = {}) {
    const continueTo = normalizeContinueTo(options.continueTo);
    if (continueTo) {
        setPendingContinueTo(continueTo);
    }

    if (state.user && continueTo) {
        window.location.assign(continueTo);
        return;
    }

    ensureModal();
    renderAuthState();
    modal.hidden = false;
    document.body.classList.add('modal-open');
}

export function closeAuthModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
}

async function handleProviderLogin(provider) {
    const normalizedProvider = normalizeWebAuthProvider(provider);
    if (redirectLocalhostForFirebaseOAuth()) {
        setStatus('로컬 로그인은 Firebase 승인 도메인인 localhost에서 이어갈게요.', 'info');
        return;
    }

    const popupShell = supportsCustomSocialPopup(normalizedProvider)
        ? openWebSocialAuthPopupShell(normalizedProvider)
        : null;

    try {
        setStatus(`${getProviderLabel(normalizedProvider)} 로그인 창을 여는 중이에요.`, 'info');
        await firebaseReady;
        assertAuthServicesReady();

        if (CUSTOM_WEB_AUTH_PROVIDERS.has(normalizedProvider)) {
            await handleCustomSocialSignIn(normalizedProvider, popupShell);
        } else {
            await handleFirebaseProviderSignIn(normalizedProvider);
        }

        setStatus('로그인했어요.', 'success');
    } catch (error) {
        if (popupShell) {
            try {
                popupShell.close();
            } catch {
                // noop
            }
        }

        console.error('사이트 소셜 로그인 실패:', error);
        setStatus(readLoginErrorMessage(error, `${getProviderLabel(normalizedProvider)} 로그인을 완료하지 못했어요.`), 'error');
    }
}

async function handleEmailLogin(event) {
    event.preventDefault();
    const email = String(document.getElementById('site-auth-email')?.value || '').trim();
    const password = String(document.getElementById('site-auth-password')?.value || '');

    if (!email || !password) {
        setStatus('이메일과 비밀번호를 입력해 주세요.', 'error');
        return;
    }

    try {
        setStatus('로그인 중이에요.', 'info');
        await firebaseReady;
        assertAuthServicesReady();
        await signInWithEmailPassword(email, password);
        setStatus('로그인했어요.', 'success');
    } catch (error) {
        console.error('사이트 이메일 로그인 실패:', error);
        setStatus('이메일 또는 비밀번호를 확인해 주세요.', 'error');
    }
}

async function handleLogout() {
    try {
        await signOutCurrentUser();
        setStatus('로그아웃했어요.', 'success');
    } catch (error) {
        console.error('사이트 로그아웃 실패:', error);
        setStatus('로그아웃에 실패했습니다.', 'error');
    }
}

async function readAdminState(user) {
    state.user = user || null;
    state.isAdmin = false;

    if (!user) {
        renderAuthState();
        if (autoOpenForWriteRequest) {
            autoOpenForWriteRequest = false;
            openAuthModal();
        }
        return;
    }

    const continueTo = takePendingContinueTo();
    if (continueTo) {
        window.location.assign(continueTo);
        return;
    }

    const isEmailAdmin = user.emailVerified === true
        && SITE_ADMIN_EMAILS.has(String(user.email || '').trim().toLowerCase());
    let isTokenAdmin = false;

    try {
        const tokenResult = await user.getIdTokenResult();
        isTokenAdmin = tokenResult?.claims?.admin === true;
    } catch {}

    try {
        const profile = await fetchUserProfile(user.uid);
        const role = String(profile.data()?.role || '').trim().toLowerCase();
        state.isAdmin = isTokenAdmin || isEmailAdmin || role === 'admin';
    } catch (error) {
        console.warn('사이트 작성 권한 확인 실패:', error);
        state.isAdmin = isTokenAdmin || isEmailAdmin;
    }

    renderAuthState();
}

function bindStartButtons() {
    document.querySelectorAll('[data-site-auth-open]').forEach((button) => {
        if (button.dataset.siteAuthBound === 'true') return;
        button.dataset.siteAuthBound = 'true';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            openAuthModal({
                continueTo: button.dataset.siteAuthNext || button.getAttribute('href') || ''
            });
        });
    });
}

async function initSiteAuth() {
    if (state.initialized) return;
    state.initialized = true;

    bindStartButtons();
    ensureModal();
    renderAuthState();

    if (authObserverBound) return;
    authObserverBound = true;

    try {
        await firebaseReady;
        assertAuthServicesReady();
        await completePendingSocialSignIn().catch((error) => {
            console.warn('사이트 소셜 로그인 완료 처리 실패:', error);
            setStatus(readLoginErrorMessage(error, '소셜 로그인을 완료하지 못했어요.'), 'error');
        });
        await readAuthRedirectResult().catch((error) => {
            console.warn('사이트 리다이렉트 로그인 처리 실패:', error);
            setStatus(readLoginErrorMessage(error, '로그인을 완료하지 못했어요.'), 'error');
        });
        observeAuthState(readAdminState);
    } catch (error) {
        console.warn('사이트 로그인 상태 초기화 실패:', error);
    }
}

initSiteAuth();
