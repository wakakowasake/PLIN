import { fetchBackendJson } from '../services/backend/api-client.js';
import {
  assertAuthServicesReady,
  getCurrentAuthUser,
  isPopupRetryError,
  observeAuthState,
  readAuthRedirectResult,
  signInWithApplePopup,
  signInWithAppleRedirect,
  signInWithCustomFirebaseToken,
  signInWithGooglePopup,
  signInWithGoogleRedirect,
  signOutCurrentUser
} from '../services/firebase/auth-service.js';
import { firebaseReady } from '../services/firebase/firebase-app.js';
import {
  exchangeWebSocialAuthSession,
  getSocialAuthProviderLabel,
  openWebSocialAuthPopupShell,
  startWebSocialAuthSession,
  waitForWebSocialAuthPopupResult
} from '../services/backend/social-auth-service.js';

const accountSummaryEl = document.getElementById('account-summary');
const statusEl = document.getElementById('status');
const signInOptionsEl = document.getElementById('sign-in-options');
const signInButtons = Array.from(document.querySelectorAll('[data-provider]'));
const deleteButton = document.getElementById('delete-account');
const signOutButton = document.getElementById('sign-out');
const CUSTOM_WEB_AUTH_PROVIDERS = new Set(['kakao', 'naver']);
const POPUP_DISABLED_CUSTOM_WEB_AUTH_PROVIDERS = new Set(['naver']);
const PENDING_SOCIAL_AUTH_RESULT_KEY = 'plin-pending-social-auth-result';
const PENDING_SOCIAL_RETURN_TO_KEY = 'plin-pending-social-return-to';
let deletionCompleted = false;

function normalizeProvider(provider) {
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';

  if (normalized === 'apple' || normalized === 'kakao' || normalized === 'naver') {
    return normalized;
  }

  return 'google';
}

function getProviderLabel(provider) {
  switch (normalizeProvider(provider)) {
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

function supportsCustomSocialPopup(provider) {
  return CUSTOM_WEB_AUTH_PROVIDERS.has(provider)
    && !POPUP_DISABLED_CUSTOM_WEB_AUTH_PROVIDERS.has(provider);
}

function setStatus(message = '', tone = 'default') {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function setBusy(isBusy) {
  const hasActiveUser = !deletionCompleted && Boolean(getCurrentAuthUser());
  signInButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  deleteButton.disabled = isBusy || !hasActiveUser;
  signOutButton.disabled = isBusy || !hasActiveUser;
}

function renderUserState(user) {
  if (deletionCompleted) {
    accountSummaryEl.textContent = '계정과 관련 데이터 삭제가 완료됐어요.';
    signInOptionsEl.hidden = true;
    deleteButton.disabled = true;
    signOutButton.disabled = true;
    return;
  }

  if (!user) {
    accountSummaryEl.textContent = '로그인된 계정이 없어요. 삭제할 계정과 같은 로그인 방식으로 먼저 로그인해 주세요.';
    signInOptionsEl.hidden = false;
    deleteButton.disabled = true;
    signOutButton.disabled = true;
    return;
  }

  accountSummaryEl.textContent = `${user.displayName || 'PLIN 사용자'} · ${user.email || '이메일 정보 없음'}`;
  signInOptionsEl.hidden = true;
  deleteButton.disabled = false;
  signOutButton.disabled = false;
}

function storePendingSocialReturnTo() {
  try {
    sessionStorage.setItem(
      PENDING_SOCIAL_RETURN_TO_KEY,
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
  } catch (error) {
    console.warn('소셜 로그인 복귀 주소 저장 실패:', error);
  }
}

function takePendingSocialAuthResult() {
  try {
    const raw = sessionStorage.getItem(PENDING_SOCIAL_AUTH_RESULT_KEY);
    sessionStorage.removeItem(PENDING_SOCIAL_AUTH_RESULT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('소셜 로그인 결과 조회 실패:', error);
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
  const provider = normalizeProvider(pendingSocialResult?.provider);
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
  const normalizedProvider = normalizeProvider(provider);

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

    setStatus(`${getSocialAuthProviderLabel(normalizedProvider)} 로그인 창이 차단되어 전체 화면으로 이어서 진행할게요.`);
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

async function handleSignIn(provider) {
  const normalizedProvider = normalizeProvider(provider);
  const popupShell = supportsCustomSocialPopup(normalizedProvider)
    ? openWebSocialAuthPopupShell(normalizedProvider)
    : null;

  setStatus('');
  setBusy(true);

  try {
    if (CUSTOM_WEB_AUTH_PROVIDERS.has(normalizedProvider)) {
      await handleCustomSocialSignIn(normalizedProvider, popupShell);
      return;
    }

    await handleFirebaseProviderSignIn(normalizedProvider);
  } catch (error) {
    if (popupShell) {
      try {
        popupShell.close();
      } catch {
        // noop
      }
    }

    const fallbackMessage = `${getProviderLabel(normalizedProvider)} 로그인을 완료하지 못했어요.`;
    setStatus(error instanceof Error ? error.message : fallbackMessage, 'warning');
  } finally {
    setBusy(false);
  }
}

async function handleAccountDeletion() {
  const user = getCurrentAuthUser();
  if (!user) {
    setStatus('먼저 로그인해 주세요.', 'warning');
    return;
  }

  const shouldContinue = window.confirm(
    '계정 삭제를 요청할까요?\n요청이 완료되면 즉시 로그아웃되고, 프로필, 여행, 커뮤니티 활동, 업로드 파일 등 나의 모든 사항이 삭제됩니다.\n공유 여행 소유권은 남은 멤버에게 자동으로 넘어가며, 삭제 후에는 복구가 어렵습니다.'
  );
  if (!shouldContinue) {
    return;
  }

  setBusy(true);
  setStatus('');

  try {
    await fetchBackendJson('/account/deletion-request', {
      method: 'POST',
      body: {
        reason: 'web_self_service'
      }
    });
    deletionCompleted = true;
    await signOutCurrentUser().catch((signOutError) => {
      console.warn('계정 삭제 후 로그아웃 처리에 실패했습니다.', signOutError);
    });
    renderUserState(null);
    setStatus('계정과 관련 데이터 삭제가 완료됐어요.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '계정 삭제를 완료하지 못했어요.', 'warning');
  } finally {
    setBusy(false);
  }
}

async function handleSignOut() {
  setBusy(true);
  setStatus('');

  try {
    await signOutCurrentUser();
    renderUserState(null);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '로그아웃하지 못했어요.', 'warning');
  } finally {
    setBusy(false);
  }
}

async function init() {
  setBusy(true);

  try {
    await firebaseReady;
    await completePendingSocialSignIn().catch((error) => {
      setStatus(error instanceof Error ? error.message : '소셜 로그인을 완료하지 못했어요.', 'warning');
    });
    await readAuthRedirectResult().catch((error) => {
      setStatus(error instanceof Error ? error.message : '로그인을 완료하지 못했어요.', 'warning');
    });
    renderUserState(getCurrentAuthUser());

    observeAuthState((user) => {
      renderUserState(user);
    });
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '계정 삭제 페이지를 준비하지 못했어요.', 'warning');
  } finally {
    setBusy(false);
  }
}

signInButtons.forEach((button) => {
  button.addEventListener('click', () => {
    void handleSignIn(button.dataset.provider || 'google');
  });
});

deleteButton.addEventListener('click', () => {
  void handleAccountDeletion();
});

signOutButton.addEventListener('click', () => {
  void handleSignOut();
});

void init();
