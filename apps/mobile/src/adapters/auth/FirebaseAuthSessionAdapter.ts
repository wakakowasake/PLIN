import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import {
    createUserWithEmailAndPassword,
    getRedirectResult,
    GoogleAuthProvider,
    OAuthProvider,
    linkWithCredential,
    onAuthStateChanged,
    signOut as firebaseSignOut,
    signInWithPopup,
    signInWithCustomToken,
    signInWithCredential,
    signInWithEmailAndPassword,
    signInWithRedirect,
    sendEmailVerification as firebaseSendEmailVerification,
    type Auth,
    updateProfile,
    type User
} from 'firebase/auth';
import { Platform } from 'react-native';

import {
    assertMobileFirebaseConfigReady,
    getMobileAuth,
} from '@/adapters/firebase/mobile-firebase';
import {
    buildMobileWebUrl,
    getGoogleAuthConfigErrorMessage,
    getGoogleAuthConfigStatus,
    isIosDevCapabilityWorkaroundEnabled,
    getMobileFirebaseConfigErrorMessage,
    getMobileFirebaseConfigStatus
} from '@/config/mobile-runtime-config';
import {
    AuthFlowError,
    exchangeAppleAuthSession,
    exchangeSocialAuthSession,
    listLinkedProviders as listLinkedProvidersRemote,
    startAppleAuthSession,
    startSocialAuthSession,
    unlinkProviderRemote
} from '@/services/auth-providers';
import type {
    AuthCurrentSignInMethod,
    AuthProvider,
    AuthProvidersResponse,
    AuthSessionUser
} from '@/types/auth';
import { isNetworkLikeError, readErrorMessage } from '@/utils/network-error';
import {
    getAndroidGoogleWebClientId,
    signInWithNativeGoogleOnAndroid,
    signOutNativeGoogleOnAndroid
} from './android-google-signin';
import type { AuthSessionAdapter, SessionListener } from './AuthSessionAdapter';

const PLIN_ADMIN_EMAILS = new Set([
    'contact@plin.ink',
    'wakakowasake@gmail.com'
]);

function normalizeEmail(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function isAllowedAdminEmail(user: User) {
    return user.emailVerified === true
        && PLIN_ADMIN_EMAILS.has(normalizeEmail(user.email));
}

function hasPlinAdminClaim(claims: Record<string, unknown>) {
    return claims.admin === true
        || claims.plinAdmin === true
        || claims.plin_admin === true;
}

WebBrowser.maybeCompleteAuthSession();

const AUTH_READY_TIMEOUT_MS = 12000;
const SOCIAL_AUTH_REDIRECT_PATH = 'auth/social-complete';
const EMAIL_VERIFICATION_ACTION_CODE_SETTINGS = {
    url: 'https://plin.ink/m',
    handleCodeInApp: false
};

const GOOGLE_DISCOVERY = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke'
};

function debugAuthLog(step: string, payload?: Record<string, unknown>) {
    if (!__DEV__) {
        return;
    }

    console.info('[mobile-auth]', {
        step,
        ...payload
    });
}

function mapSignInProviderToAuthProvider(value: unknown): AuthCurrentSignInMethod {
    const normalized = typeof value === 'string' ? value.trim() : '';

    if (normalized === 'google' || normalized === 'google.com') {
        return 'google';
    }

    if (normalized === 'apple' || normalized === 'apple.com') {
        return 'apple';
    }

    if (normalized === 'kakao' || normalized === 'naver') {
        return normalized;
    }

    if (normalized === 'password' || normalized === 'email') {
        return 'email';
    }

    return null;
}

async function readCurrentSignInMethod(user: User) {
    try {
        const tokenResult = await user.getIdTokenResult();
        const customMethod = mapSignInProviderToAuthProvider(tokenResult.claims.currentSignInMethod);
        if (customMethod) {
            return customMethod;
        }

        const providerFromToken = mapSignInProviderToAuthProvider(tokenResult.signInProvider);
        if (providerFromToken) {
            return providerFromToken;
        }
    } catch {
        // Fall back to linked provider data below.
    }

    for (const entry of user.providerData) {
        const provider = mapSignInProviderToAuthProvider(entry.providerId);
        if (provider) {
            return provider;
        }
    }

    return null;
}

async function toAuthSessionUser(user: User | null): Promise<AuthSessionUser | null> {
    if (!user) {
        return null;
    }

    let isAdmin = false;
    try {
        const tokenResult = await user.getIdTokenResult();
        isAdmin = user.emailVerified === true
            && (hasPlinAdminClaim(tokenResult.claims) || isAllowedAdminEmail(user));
    } catch {}

    return {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email || 'PLIN User',
        photoURL: user.photoURL || null,
        emailVerified: user.emailVerified === true,
        provider: await readCurrentSignInMethod(user),
        isAdmin
    };
}

function getProviderLabel(provider: AuthProvider) {
    switch (provider) {
        case 'apple':
            return 'Apple';
        case 'kakao':
            return 'Kakao';
        case 'naver':
            return 'Naver';
        default:
            return 'Google';
    }
}

function buildGoogleWebProvider() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });
    return provider;
}

function getGoogleClientId() {
    return getGoogleAuthConfigStatus().selectedClientId;
}

function getGoogleWebClientId() {
    return getAndroidGoogleWebClientId();
}

function isAppleSignInTemporarilyDisabled() {
    return isIosDevCapabilityWorkaroundEnabled();
}

function hasServerDrivenSocialAuthCapability() {
    try {
        const redirectUri = getSocialAuthRedirectUri();

        if (!redirectUri) {
            return false;
        }

        if (Platform.OS === 'web') {
            return /^https?:\/\//i.test(redirectUri) || redirectUri.startsWith('/');
        }

        return true;
    } catch {
        return false;
    }
}

function buildIosGoogleRedirectUri(clientId: string) {
    const normalizedClientId = clientId.trim();
    const suffix = '.apps.googleusercontent.com';

    if (!normalizedClientId || !normalizedClientId.endsWith(suffix)) {
        return null;
    }

    const clientIdPrefix = normalizedClientId.slice(0, -suffix.length);
    if (!clientIdPrefix) {
        return null;
    }

    return `com.googleusercontent.apps.${clientIdPrefix}:/oauthredirect`;
}

function getGoogleRedirectUri() {
    if (Platform.OS === 'web') {
        return buildMobileWebUrl('oauthredirect');
    }

    if (Platform.OS === 'ios') {
        const iosGoogleRedirectUri = buildIosGoogleRedirectUri(getGoogleClientId());

        if (iosGoogleRedirectUri) {
            return AuthSession.makeRedirectUri({
                native: iosGoogleRedirectUri
            });
        }
    }

    return AuthSession.makeRedirectUri({
        scheme: 'plinmobile',
        path: 'oauthredirect'
    });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(message));
        }, ms);

        promise.then(
            (value) => {
                clearTimeout(timeoutId);
                resolve(value);
            },
            (error) => {
                clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
}

export function hasFirebaseAuthSessionConfig(provider: AuthProvider = 'google') {
    if (!getMobileFirebaseConfigStatus().isReady) {
        return false;
    }

    switch (provider) {
        case 'google':
            return Boolean(getGoogleClientId());
        case 'apple':
            return (Platform.OS === 'ios' || Platform.OS === 'android')
                && !isAppleSignInTemporarilyDisabled();
        case 'kakao':
        case 'naver':
            // local capability means the current runtime can safely start the redirect flow.
            return hasServerDrivenSocialAuthCapability();
        default:
            return false;
    }
}

function getFirebaseAuthConfigError(provider: AuthProvider = 'google') {
    const firebaseStatus = getMobileFirebaseConfigStatus();
    if (!firebaseStatus.isReady) {
        return getMobileFirebaseConfigErrorMessage();
    }

    if (provider === 'google' && !getGoogleAuthConfigStatus().isReady) {
        return getGoogleAuthConfigErrorMessage();
    }

    if (provider === 'apple' && Platform.OS !== 'ios' && Platform.OS !== 'android') {
        return 'Apple 로그인은 iOS와 Android 앱에서만 지원해요.';
    }

    if (provider === 'apple' && isAppleSignInTemporarilyDisabled()) {
        return 'Apple 로그인을 사용할 수 없어요. 고객센터로 문의해 주세요.';
    }

    if ((provider === 'kakao' || provider === 'naver') && !hasServerDrivenSocialAuthCapability()) {
        return `${getProviderLabel(provider)} 로그인을 시작하지 못했어요. 앱을 다시 열고 시도해 주세요.`;
    }

    return null;
}

async function buildAppleNonce() {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
    );

    return {
        rawNonce,
        hashedNonce
    };
}

function isRealDeviceConfigMismatchMessage(message: string) {
    const normalized = message.toLowerCase();

    return normalized.includes('redirect_uri')
        || normalized.includes('redirect uri')
        || normalized.includes('redirect')
        || normalized.includes('invalid_request')
        || normalized.includes('oauth')
        || normalized.includes('client id')
        || normalized.includes('scheme')
        || normalized.includes('deep link');
}

function mapFirebaseAuthAdapterError(
    phase: 'bootstrap' | 'session' | 'signIn' | 'link' | 'unlink' | 'providers' | 'signOut',
    error: unknown,
    provider: AuthProvider = 'google'
) {
    const providerLabel = getProviderLabel(provider);
    const errorCode = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';

    if (error instanceof AuthFlowError && error.message) {
        return error;
    }

    if (errorCode === 'auth/account-exists-with-different-credential') {
        return new Error('이미 가입된 계정이에요. 가입 때 사용한 로그인 방식으로 먼저 들어가 주세요.');
    }

    if (errorCode === 'auth/credential-already-in-use') {
        return new Error(`이 ${providerLabel} 계정은 이미 다른 PLIN 계정에 연결되어 있어요.`);
    }

    if (errorCode === 'auth/provider-already-linked') {
        return new Error(`이미 현재 PLIN 계정에 ${providerLabel} 로그인이 연결되어 있어요.`);
    }

    if (errorCode === 'auth/requires-recent-login') {
        return new Error('보안을 위해 다시 로그인한 뒤 다시 시도해 주세요.');
    }

    if (errorCode === 'auth/user-disabled') {
        return new Error(
            '계정 삭제가 진행 중이라 다시 로그인할 수 없어요.'
        );
    }

    if (error instanceof Error && error.message) {
        const message = error.message;

        if (message.includes('auth/user-disabled') || message.includes('user-disabled')) {
            return new Error(
                '계정 삭제가 진행 중이라 다시 로그인할 수 없어요.'
            );
        }

        if (
            message.includes('모바일 Firebase')
            || message.includes('Google 로그인')
            || message.includes('Apple 로그인')
            || message.includes('Google OAuth client ID')
            || message.includes('로그인을 취소')
            || message.includes('Google ID 토큰')
            || message.includes('로그인 사용자 정보를 읽지 못')
            || message.includes('설정 오류')
            || message.includes('기존 계정이 있어요')
            || message.includes('이미 다른 PLIN 계정')
            || message.includes('현재 로그인 방식은 연결 해제')
            || message.includes('마지막 로그인 수단')
        ) {
            return error;
        }

        if (message.includes('오래 걸리고 있어요')) {
            return error;
        }
    }

    if (isNetworkLikeError(error)) {
        if (phase === 'signIn') {
            return new Error(
                `네트워크 연결이 불안정해 ${providerLabel} 로그인을 완료하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.`
            );
        }

        if (phase === 'link') {
            return new Error(
                `네트워크 연결이 불안정해 ${providerLabel} 연결을 완료하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.`
            );
        }

        if (phase === 'unlink') {
            return new Error(
                `네트워크 연결이 불안정해 ${providerLabel} 연결 해제를 완료하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.`
            );
        }

        if (phase === 'signOut') {
            return new Error(
                '네트워크 연결이 불안정해 로그아웃을 완료하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
            );
        }

        return new Error(
            '네트워크 연결이 불안정해 로그인 상태를 확인하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.'
        );
    }

    const message = readErrorMessage(error);
    if (message && isRealDeviceConfigMismatchMessage(message)) {
        return new Error(
            'Google 로그인을 시작하지 못했어요. 고객센터로 문의해 주세요.'
        );
    }

    if (phase === 'signIn') {
        return new Error(`${providerLabel} 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`);
    }

    if (phase === 'link') {
        return new Error(`${providerLabel} 연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`);
    }

    if (phase === 'unlink') {
        return new Error(`${providerLabel} 연결 해제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`);
    }

    if (phase === 'signOut') {
        return new Error('로그아웃을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    if (phase === 'providers') {
        return new Error('연결된 로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    return new Error('로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

function mapEmailPasswordSignInError(error: unknown) {
    const errorCode = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';

    if (
        errorCode === 'auth/invalid-credential'
        || errorCode === 'auth/user-not-found'
        || errorCode === 'auth/wrong-password'
    ) {
        return new Error('이메일 또는 비밀번호가 맞지 않아요.');
    }

    if (errorCode === 'auth/invalid-email') {
        return new Error('이메일 형식을 확인해 주세요.');
    }

    if (errorCode === 'auth/too-many-requests') {
        return new Error('로그인 시도가 잠시 제한되었어요. 잠시 후 다시 시도해 주세요.');
    }

    if (errorCode === 'auth/operation-not-allowed') {
        return new Error('이메일 로그인을 사용할 수 없어요. 고객센터로 문의해 주세요.');
    }

    if (isNetworkLikeError(error)) {
        return new Error('네트워크 연결이 불안정해 이메일 로그인을 완료하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.');
    }

    const message = readErrorMessage(error);
    if (message) {
        return new Error(message);
    }

    return new Error('이메일 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

function mapEmailPasswordSignUpError(error: unknown) {
    const errorCode = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';

    if (errorCode === 'auth/email-already-in-use') {
        return new Error('이미 가입된 이메일이에요. 가입 때 사용한 로그인 방식으로 들어가 주세요. 이메일로 가입한 계정이면 로그인 탭에서 계속해 주세요.');
    }

    if (errorCode === 'auth/invalid-email') {
        return new Error('이메일 형식을 확인해 주세요.');
    }

    if (errorCode === 'auth/weak-password') {
        return new Error('비밀번호는 6자 이상으로 입력해 주세요.');
    }

    if (errorCode === 'auth/operation-not-allowed') {
        return new Error('이메일 가입을 사용할 수 없어요. 고객센터로 문의해 주세요.');
    }

    if (isNetworkLikeError(error)) {
        return new Error('네트워크 연결이 불안정해 이메일 가입을 완료하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.');
    }

    const message = readErrorMessage(error);
    if (message) {
        return new Error(message);
    }

    return new Error('이메일 가입을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

function mapSendEmailVerificationError(error: unknown) {
    const errorCode = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';

    if (errorCode === 'auth/too-many-requests') {
        return new Error('인증 메일 발송이 잠시 제한되었어요. 잠시 후 다시 시도해 주세요.');
    }

    if (errorCode === 'auth/user-token-expired') {
        return new Error('로그인 세션이 만료되었어요. 다시 로그인해 주세요.');
    }

    if (errorCode === 'auth/unauthorized-continue-uri') {
        return new Error('인증 메일을 보낼 수 없어요. 고객센터로 문의해 주세요.');
    }

    if (errorCode === 'auth/invalid-continue-uri') {
        return new Error('인증 메일을 보낼 수 없어요. 고객센터로 문의해 주세요.');
    }

    if (isNetworkLikeError(error)) {
        return new Error('네트워크 연결이 불안정해 인증 메일을 보내지 못했어요. 연결이 돌아오면 다시 시도해 주세요.');
    }

    const message = readErrorMessage(error);
    if (message) {
        return new Error(message);
    }

    return new Error('인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.');
}

function buildEmailDisplayName(email: string, displayName?: string) {
    const safeDisplayName = String(displayName || '').trim();
    if (safeDisplayName) {
        return safeDisplayName;
    }

    const localPart = email.split('@')[0]?.trim();
    return localPart || email || 'PLIN User';
}

async function ensureAuthReady() {
    assertMobileFirebaseConfigReady();
    const auth = getMobileAuth();

    await withTimeout(
        auth.authStateReady(),
        AUTH_READY_TIMEOUT_MS,
        '로그인 상태 확인이 오래 걸리고 있어요. 앱을 다시 열고 시도해 주세요.'
    );

    return auth;
}

function getSocialAuthRedirectUri() {
    if (Platform.OS === 'web') {
        return buildMobileWebUrl(SOCIAL_AUTH_REDIRECT_PATH);
    }

    return AuthSession.makeRedirectUri({
        scheme: 'plinmobile',
        path: SOCIAL_AUTH_REDIRECT_PATH
    });
}

function isAuthReadyTimeoutMessage(error: unknown) {
    const message = readErrorMessage(error);
    return Boolean(message && message.includes('오래 걸리고 있어요'));
}

function readTicketFromRedirectUrl(url: string) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.searchParams.get('ticket')?.trim() || '';
    } catch {
        return '';
    }
}

function readSocialAuthErrorFromRedirect(url: string) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.searchParams.get('error')?.trim() || '';
    } catch {
        return '';
    }
}

async function runAppleAuthSession(intent: 'signin' | 'link', hashedNonce: string) {
    const callbackUrl = getSocialAuthRedirectUri();
    const startPayload = await startAppleAuthSession(
        intent,
        hashedNonce,
        { callbackUrl }
    );
    const result = await WebBrowser.openAuthSessionAsync(
        startPayload.authorizationUrl,
        startPayload.callbackUrl || callbackUrl
    );

    if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new Error('로그인을 취소했어요. 준비되면 다시 시도해 주세요.');
    }

    if (result.type !== 'success' || !result.url) {
        throw new Error('Apple 로그인을 완료하지 못했어요.');
    }

    const redirectError = readSocialAuthErrorFromRedirect(result.url);
    if (redirectError) {
        throw new Error('Apple 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }

    const ticket = readTicketFromRedirectUrl(result.url);
    if (!ticket) {
        throw new Error('Apple 로그인을 확인하지 못했어요.');
    }

    const payload = await exchangeAppleAuthSession({
        intent,
        ticket
    });
    if (!payload.idToken) {
        throw new Error('Apple 로그인을 완료하지 못했어요.');
    }

    return payload.idToken;
}

async function buildAppleFirebaseCredential(intent: 'signin' | 'link' = 'signin') {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        throw new Error('Apple 로그인은 iOS와 Android 앱에서만 지원해요.');
    }

    const { rawNonce, hashedNonce } = await buildAppleNonce();

    if (Platform.OS === 'android') {
        const idToken = await runAppleAuthSession(intent, hashedNonce);
        return new OAuthProvider('apple.com').credential({
            idToken,
            rawNonce
        });
    }

    const isAppleAuthAvailable = typeof AppleAuthentication.isAvailableAsync === 'function'
        ? await AppleAuthentication.isAvailableAsync()
        : false;
    if (!isAppleAuthAvailable) {
        throw new Error('Apple 로그인을 사용할 수 없어요. 앱을 업데이트한 뒤 다시 시도해 주세요.');
    }

    const result = await AppleAuthentication.signInAsync({
        requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL
        ],
        nonce: hashedNonce
    });

    if (!result.identityToken) {
        throw new Error('Apple 로그인을 완료하지 못했어요.');
    }

    return new OAuthProvider('apple.com').credential({
        idToken: result.identityToken,
        rawNonce
    });
}

async function buildGoogleFirebaseCredential() {
    if (Platform.OS === 'android') {
        const clientId = getGoogleClientId();
        const webClientId = getGoogleWebClientId();

        debugAuthLog('signIn:start', {
            platform: Platform.OS,
            hasClientId: Boolean(clientId),
            hasWebClientId: Boolean(webClientId),
            flow: 'native-google-signin'
        });

        const { idToken } = await signInWithNativeGoogleOnAndroid();
        debugAuthLog('signIn:androidNative:idTokenReady', {
            idTokenPresent: Boolean(idToken)
        });

        return GoogleAuthProvider.credential(idToken);
    }

    const clientId = getGoogleClientId();
    const redirectUri = getGoogleRedirectUri();

    debugAuthLog('signIn:start', {
        platform: Platform.OS,
        hasClientId: Boolean(clientId),
        usesNativeRedirect: redirectUri.startsWith('plinmobile://')
    });

    if (Platform.OS === 'ios' && redirectUri.startsWith('plinmobile://')) {
        throw new Error(
            'Google 로그인을 시작하지 못했어요. 고객센터로 문의해 주세요.'
        );
    }

    const request = await AuthSession.loadAsync({
        clientId,
        redirectUri,
        scopes: [
            'openid',
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email'
        ],
        prompt: AuthSession.Prompt.SelectAccount,
        responseType: AuthSession.ResponseType.Code,
        usePKCE: true
    }, GOOGLE_DISCOVERY);

    debugAuthLog('signIn:requestLoaded', {
        hasCodeVerifier: Boolean(request.codeVerifier)
    });

    const result = await request.promptAsync(GOOGLE_DISCOVERY);

    debugAuthLog('signIn:promptResult', {
        type: result.type,
        hasParams: Boolean('params' in result && result.params),
        hasError: Boolean(result.type === 'error' && result.error),
        hasUrl: Boolean('url' in result && result.url)
    });

    if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new Error('로그인을 취소했어요. 준비되면 다시 시도해 주세요.');
    }

    if (result.type !== 'success' || !result.params.code) {
        throw new Error(result.type === 'error'
            ? (result.error?.message || 'Google 로그인을 완료하지 못했어요.')
            : 'Google 로그인을 완료하지 못했어요.');
    }

    debugAuthLog('signIn:exchangeCode:start', {
        hasCode: Boolean(result.params.code),
        hasCodeVerifier: Boolean(request.codeVerifier)
    });

    const tokenResponse = await AuthSession.exchangeCodeAsync({
        clientId,
        code: result.params.code,
        redirectUri,
        extraParams: request.codeVerifier
            ? { code_verifier: request.codeVerifier }
            : undefined
    }, GOOGLE_DISCOVERY);

    debugAuthLog('signIn:exchangeCode:success', {
        accessTokenPresent: Boolean(tokenResponse.accessToken),
        idTokenPresent: Boolean(tokenResponse.idToken),
        tokenType: tokenResponse.tokenType ?? null,
        scopes: Array.isArray(tokenResponse.scope)
            ? tokenResponse.scope
            : tokenResponse.scope ?? null
    });

    const idToken = tokenResponse.idToken || result.params.id_token;
    if (!idToken) {
        debugAuthLog('signIn:idToken:missing', {
            tokenResponse: {
                accessTokenPresent: Boolean(tokenResponse.accessToken),
                idTokenPresent: Boolean(tokenResponse.idToken),
                tokenType: tokenResponse.tokenType ?? null,
                hasScope: Boolean(tokenResponse.scope)
            },
            resultHasIdTokenParam: Boolean(result.params.id_token)
        });
        throw new Error('Google 로그인을 완료하지 못했어요.');
    }

    return GoogleAuthProvider.credential(idToken, tokenResponse.accessToken);
}

function isGoogleWebRedirectFallbackError(error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code || '')
        : '';

    return code === 'auth/popup-blocked'
        || code === 'auth/cancelled-popup-request'
        || code === 'auth/operation-not-supported-in-this-environment';
}

async function resolveGoogleWebRedirectResult(auth: Auth) {
    if (Platform.OS !== 'web') {
        return null;
    }

    return getRedirectResult(auth);
}

async function signInWithGoogleOnWeb(auth: Auth) {
    const provider = buildGoogleWebProvider();

    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        if (!isGoogleWebRedirectFallbackError(error)) {
            throw error;
        }

        await signInWithRedirect(auth, provider);
        return null;
    }
}

async function runServerDrivenSocialAuth(
    provider: Extract<AuthProvider, 'kakao' | 'naver'>,
    intent: 'signin' | 'link'
) {
    const callbackUrl = getSocialAuthRedirectUri();
    const startPayload = await startSocialAuthSession(
        provider,
        intent,
        Platform.OS === 'web'
            ? { callbackUrl }
            : undefined
    );
    const result = await WebBrowser.openAuthSessionAsync(
        startPayload.authorizationUrl,
        Platform.OS === 'web'
            ? callbackUrl
            : (startPayload.callbackUrl || callbackUrl)
    );

    if (result.type === 'cancel' || result.type === 'dismiss') {
        throw new Error('로그인을 취소했어요. 준비되면 다시 시도해 주세요.');
    }

    if (result.type !== 'success' || !result.url) {
        throw new Error(`${getProviderLabel(provider)} 인증을 완료하지 못했어요.`);
    }

    const redirectError = readSocialAuthErrorFromRedirect(result.url);
    if (redirectError) {
        throw new Error(`${getProviderLabel(provider)} 인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.`);
    }

    const ticket = readTicketFromRedirectUrl(result.url);
    if (!ticket) {
        throw new Error(`${getProviderLabel(provider)} 인증 결과를 확인하지 못했어요.`);
    }

    return exchangeSocialAuthSession({
        provider,
        intent,
        ticket
    });
}

export class FirebaseAuthSessionAdapter implements AuthSessionAdapter {
    async bootstrap(): Promise<void> {
        try {
            const auth = await ensureAuthReady();
            await resolveGoogleWebRedirectResult(auth);
        } catch (error) {
            throw mapFirebaseAuthAdapterError('bootstrap', error);
        }
    }

    async getCurrentSession(): Promise<AuthSessionUser | null> {
        try {
            const auth = await ensureAuthReady();
            if (auth.currentUser) {
                await auth.currentUser.reload().catch(() => {});
            }
            return await toAuthSessionUser(auth.currentUser);
        } catch (error) {
            if (isAuthReadyTimeoutMessage(error)) {
                debugAuthLog('getCurrentSession:authStateReadyTimeoutFallback', {
                    hasCurrentUser: Boolean(getMobileAuth().currentUser)
                });
                if (getMobileAuth().currentUser) {
                    await getMobileAuth().currentUser?.reload().catch(() => {});
                }
                return await toAuthSessionUser(getMobileAuth().currentUser);
            }

            throw mapFirebaseAuthAdapterError('session', error);
        }
    }

    observeSession(listener: SessionListener): () => void {
        assertMobileFirebaseConfigReady();
        const auth = getMobileAuth();
        return onAuthStateChanged(auth, (user) => {
            void (async () => {
                listener(await toAuthSessionUser(user));
            })();
        });
    }

    async signIn(provider: AuthProvider = 'google'): Promise<AuthSessionUser> {
        try {
            const configError = getFirebaseAuthConfigError(provider);
            if (configError) {
                throw new Error(configError);
            }

            const auth = await ensureAuthReady();

            if (provider === 'kakao' || provider === 'naver') {
                const payload = await runServerDrivenSocialAuth(provider, 'signin');
                if (payload.outcome !== 'signed_in' || !payload.firebaseCustomToken) {
                    throw new AuthFlowError(
                        provider,
                        payload.message || `${getProviderLabel(provider)} 로그인을 완료하지 못했어요.`,
                        {
                            outcome: payload.outcome,
                            reason: payload.reason,
                            nextAction: payload.nextAction,
                            emailMasked: payload.emailMasked
                        }
                    );
                }

                const signInResult = await signInWithCustomToken(auth, payload.firebaseCustomToken);
                const user = await toAuthSessionUser(signInResult.user);

                if (!user) {
                    throw new Error('로그인 정보를 확인하지 못했어요.');
                }

                return user;
            }

            if (provider === 'apple') {
                const credential = await buildAppleFirebaseCredential('signin');
                const signInResult = await signInWithCredential(auth, credential);
                const user = await toAuthSessionUser(signInResult.user);

                if (!user) {
                    throw new Error('로그인 정보를 확인하지 못했어요.');
                }

                return {
                    ...user,
                    provider: 'apple'
                };
            }

            if (provider === 'google' && Platform.OS === 'web') {
                const webUser = await signInWithGoogleOnWeb(auth);
                if (!webUser) {
                    return await new Promise<AuthSessionUser>(() => {});
                }

                const user = await toAuthSessionUser(webUser);

                if (!user) {
                    throw new Error('로그인 정보를 확인하지 못했어요.');
                }

                return user;
            }

            const credential = await buildGoogleFirebaseCredential();
            debugAuthLog('signIn:firebaseCredential:ready', {
                accessTokenPresent: Boolean(credential.accessToken),
                idTokenPresent: Boolean(credential.idToken)
            });

            debugAuthLog('signIn:firebaseSignIn:start');
            const signInResult = await signInWithCredential(auth, credential);
            debugAuthLog('signIn:firebaseSignIn:success', {
                userPresent: Boolean(signInResult.user)
            });
            const user = await toAuthSessionUser(signInResult.user);

            if (!user) {
                throw new Error('로그인 정보를 확인하지 못했어요.');
            }

            return user;
        } catch (error) {
            debugAuthLog('signIn:error', {
                rawError:
                    error instanceof Error
                        ? {
                            name: error.name,
                            message: error.message
                        }
                        : error
            });
            throw mapFirebaseAuthAdapterError('signIn', error, provider);
        }
    }

    async signInWithEmail(email: string, password: string): Promise<AuthSessionUser> {
        try {
            const auth = await ensureAuthReady();
            const safeEmail = String(email || '').trim();

            if (!safeEmail || !password) {
                throw new Error('이메일과 비밀번호를 입력해 주세요.');
            }

            const signInResult = await signInWithEmailAndPassword(auth, safeEmail, password);
            const user = await toAuthSessionUser(signInResult.user);

            if (!user) {
                throw new Error('로그인 정보를 확인하지 못했어요.');
            }

            return {
                ...user,
                provider: 'email'
            };
        } catch (error) {
            throw mapEmailPasswordSignInError(error);
        }
    }

    async signUpWithEmail(
        email: string,
        password: string,
        displayName?: string
    ): Promise<AuthSessionUser> {
        try {
            const auth = await ensureAuthReady();
            const safeEmail = String(email || '').trim();

            if (!safeEmail || !password) {
                throw new Error('이메일과 비밀번호를 입력해 주세요.');
            }

            const signUpResult = await createUserWithEmailAndPassword(auth, safeEmail, password);
            const nextDisplayName = buildEmailDisplayName(safeEmail, displayName);

            if (nextDisplayName && signUpResult.user.displayName !== nextDisplayName) {
                try {
                    await updateProfile(signUpResult.user, {
                        displayName: nextDisplayName
                    });
                    await signUpResult.user.reload();
                } catch (profileError) {
                    if (__DEV__) {
                        console.warn('Failed to update email sign-up display name', profileError);
                    }
                }
            }

            const user = await toAuthSessionUser(auth.currentUser || signUpResult.user);

            if (!user) {
                throw new Error('가입 정보를 확인하지 못했어요.');
            }

            return {
                ...user,
                displayName: user.displayName || nextDisplayName,
                provider: 'email'
            };
        } catch (error) {
            throw mapEmailPasswordSignUpError(error);
        }
    }

    async sendEmailVerification(): Promise<void> {
        try {
            const auth = await ensureAuthReady();
            const currentUser = auth.currentUser;

            if (!currentUser) {
                throw new Error('인증 메일을 보낼 계정을 찾지 못했어요.');
            }

            await currentUser.reload().catch(() => {});

            if (currentUser.emailVerified === true) {
                return;
            }

            await firebaseSendEmailVerification(currentUser, EMAIL_VERIFICATION_ACTION_CODE_SETTINGS);
        } catch (error) {
            throw mapSendEmailVerificationError(error);
        }
    }

    async linkProvider(provider: AuthProvider): Promise<AuthProvidersResponse> {
        try {
            const configError = getFirebaseAuthConfigError(provider);
            if (configError) {
                throw new Error(configError);
            }

            const auth = await ensureAuthReady();
            if (!auth.currentUser) {
                throw new Error('로그인이 필요해요.');
            }

            if (provider === 'kakao' || provider === 'naver') {
                const payload = await runServerDrivenSocialAuth(provider, 'link');
                if (payload.outcome !== 'linked' || !payload.providers) {
                    throw new AuthFlowError(
                        provider,
                        payload.message || `${getProviderLabel(provider)} 연결을 완료하지 못했어요.`,
                        {
                            outcome: payload.outcome,
                            reason: payload.reason,
                            nextAction: payload.nextAction,
                            emailMasked: payload.emailMasked
                        }
                    );
                }

                return payload.providers;
            }

            const credential = provider === 'apple'
                ? await buildAppleFirebaseCredential('link')
                : await buildGoogleFirebaseCredential();

            await linkWithCredential(auth.currentUser, credential);
            await auth.currentUser.reload();

            return await listLinkedProvidersRemote();
        } catch (error) {
            throw mapFirebaseAuthAdapterError('link', error, provider);
        }
    }

    async unlinkProvider(provider: AuthProvider): Promise<AuthProvidersResponse> {
        try {
            const response = await unlinkProviderRemote(provider);
            const auth = await ensureAuthReady();

            if (auth.currentUser) {
                try {
                    await auth.currentUser.getIdToken(true);
                    await auth.currentUser.reload();
                } catch {
                    // Provider state on the server is the source of truth.
                }
            }

            if (provider === 'google' && Platform.OS === 'android') {
                await signOutNativeGoogleOnAndroid();
            }

            return response;
        } catch (error) {
            throw mapFirebaseAuthAdapterError('unlink', error, provider);
        }
    }

    async listLinkedProviders(): Promise<AuthProvidersResponse> {
        try {
            return await listLinkedProvidersRemote();
        } catch (error) {
            throw mapFirebaseAuthAdapterError('providers', error);
        }
    }

    async signOut(): Promise<void> {
        try {
            const auth = await ensureAuthReady();
            await firebaseSignOut(auth);

            if (Platform.OS === 'android') {
                await signOutNativeGoogleOnAndroid();
            }
        } catch (error) {
            throw mapFirebaseAuthAdapterError('signOut', error);
        }
    }
}
