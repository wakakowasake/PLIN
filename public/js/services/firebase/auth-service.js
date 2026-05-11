import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    signInWithCustomToken,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification as firebaseSendEmailVerification,
    onAuthStateChanged,
    deleteUser,
    reauthenticateWithCredential,
    reauthenticateWithPopup,
    reauthenticateWithRedirect,
    GoogleAuthProvider,
    OAuthProvider,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { app, auth, provider } from './firebase-app.js';

const EMAIL_VERIFICATION_ACTION_CODE_SETTINGS = {
    url: 'https://plin.ink/',
    handleCodeInApp: false
};

export const EMAIL_VERIFICATION_REQUIRED = true;

export function assertAuthServicesReady() {
    if (!app || !auth || !provider) {
        throw new Error("Firebase가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
    }
}

export function isPopupRetryError(error) {
    const code = error?.code || '';
    return code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment';
}

export function getCurrentAuthUser() {
    return auth.currentUser;
}

function normalizeProviderId(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';

    if (normalized === 'google' || normalized === 'google.com') {
        return 'google';
    }

    if (normalized === 'apple' || normalized === 'apple.com') {
        return 'apple';
    }

    if (normalized === 'kakao' || normalized === 'naver') {
        return normalized;
    }

    if (normalized === 'email' || normalized === 'password' || normalized === 'emailpassword') {
        return 'email';
    }

    return null;
}

export function signInWithGooglePopup() {
    assertAuthServicesReady();
    return signInWithPopup(auth, provider);
}

export function signInWithGoogleRedirect() {
    assertAuthServicesReady();
    return signInWithRedirect(auth, provider);
}

function buildAppleProvider() {
    const appleProvider = new OAuthProvider('apple.com');
    appleProvider.addScope('email');
    appleProvider.addScope('name');
    appleProvider.setCustomParameters({
        locale: 'ko'
    });
    return appleProvider;
}

export function signInWithApplePopup() {
    assertAuthServicesReady();
    return signInWithPopup(auth, buildAppleProvider());
}

export function signInWithAppleRedirect() {
    assertAuthServicesReady();
    return signInWithRedirect(auth, buildAppleProvider());
}

export function readAuthRedirectResult() {
    assertAuthServicesReady();
    return getRedirectResult(auth);
}

export const readGoogleRedirectResult = readAuthRedirectResult;

export function signInWithCustomFirebaseToken(customToken) {
    assertAuthServicesReady();
    return signInWithCustomToken(auth, customToken);
}

export function signInWithEmailPassword(email, password) {
    assertAuthServicesReady();
    return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmailPassword(email, password, displayName = '') {
    assertAuthServicesReady();

    const result = await createUserWithEmailAndPassword(auth, email, password);
    const safeDisplayName = typeof displayName === 'string' ? displayName.trim() : '';

    if (safeDisplayName) {
        await updateProfile(result.user, { displayName: safeDisplayName });
    }

    if (EMAIL_VERIFICATION_REQUIRED && !result.user.emailVerified) {
        await firebaseSendEmailVerification(result.user, EMAIL_VERIFICATION_ACTION_CODE_SETTINGS);
    }

    return result;
}

export async function sendCurrentUserEmailVerification() {
    assertAuthServicesReady();

    const user = auth.currentUser;
    if (!user) {
        throw new Error("로그인이 필요합니다.");
    }

    if (!EMAIL_VERIFICATION_REQUIRED) {
        return user;
    }

    await user.reload();
    if (auth.currentUser?.emailVerified) {
        return auth.currentUser;
    }

    await firebaseSendEmailVerification(auth.currentUser || user, EMAIL_VERIFICATION_ACTION_CODE_SETTINGS);
    return auth.currentUser || user;
}

export async function refreshCurrentAuthUser() {
    assertAuthServicesReady();

    const user = auth.currentUser;
    if (!user) {
        return null;
    }

    await user.reload();
    return auth.currentUser;
}

export async function signOutCurrentUser() {
    assertAuthServicesReady();

    return signOut(auth);
}

export function observeAuthState(callback) {
    assertAuthServicesReady();
    return onAuthStateChanged(auth, callback);
}

export async function readCurrentSignInMethod() {
    assertAuthServicesReady();

    const user = auth.currentUser;
    if (!user) {
        return null;
    }

    try {
        const tokenResult = await user.getIdTokenResult();
        const customMethod = normalizeProviderId(tokenResult.claims?.currentSignInMethod);
        if (customMethod) {
            return customMethod;
        }

        const tokenProvider = normalizeProviderId(tokenResult.signInProvider);
        if (tokenProvider) {
            return tokenProvider;
        }
    } catch {
        // Fall back to providerData below.
    }

    for (const entry of user.providerData || []) {
        const providerId = normalizeProviderId(entry?.providerId);
        if (providerId) {
            return providerId;
        }
    }

    return null;
}

export async function reauthenticateCurrentUserWithGoogle() {
    assertAuthServicesReady();

    const result = await signInWithPopup(auth, provider);
    const googleCredential = GoogleAuthProvider.credentialFromResult(result);
    if (!googleCredential) {
        throw new Error("재인증에 필요한 Google Credential을 받지 못했습니다.");
    }

    return reauthenticateWithCredential(auth.currentUser, googleCredential);
}

export async function reauthenticateCurrentUserWithApple() {
    assertAuthServicesReady();

    return reauthenticateWithPopup(auth.currentUser, buildAppleProvider());
}

export async function reauthenticateCurrentUserWithAppleRedirect() {
    assertAuthServicesReady();

    return reauthenticateWithRedirect(auth.currentUser, buildAppleProvider());
}

export async function deleteCurrentAuthUser() {
    assertAuthServicesReady();

    const user = auth.currentUser;
    if (!user) {
        throw new Error("로그인이 필요합니다.");
    }

    return deleteUser(user);
}

export async function updateCurrentAuthProfile(data) {
    assertAuthServicesReady();

    const user = auth.currentUser;
    if (!user) {
        throw new Error("로그인이 필요합니다.");
    }

    return updateProfile(user, data);
}
