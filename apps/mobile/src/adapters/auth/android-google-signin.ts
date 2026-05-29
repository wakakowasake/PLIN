import { getMobileEnv } from '@/config/mobile-runtime-config';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

let configuredWebClientId: string | null = null;

function loadGoogleSignInModule(): GoogleSignInModule {
    return require('@react-native-google-signin/google-signin') as GoogleSignInModule;
}

export function getAndroidGoogleWebClientId() {
    const genericClientId = getMobileEnv('googleClientId');
    return getMobileEnv('googleWebClientId', genericClientId);
}

function ensureAndroidGoogleConfigured() {
    const webClientId = getAndroidGoogleWebClientId();

    if (!webClientId) {
        throw new Error('Google 로그인을 시작하지 못했어요. 고객센터로 문의해 주세요.');
    }

    const googleModule = loadGoogleSignInModule();

    if (configuredWebClientId !== webClientId) {
        googleModule.GoogleSignin.configure({
            webClientId
        });
        configuredWebClientId = webClientId;
    }

    return googleModule;
}

function mapAndroidGoogleSignInError(
    error: unknown,
    googleModule: GoogleSignInModule
) {
    if (googleModule.isErrorWithCode(error)) {
        if (error.code === googleModule.statusCodes.SIGN_IN_CANCELLED) {
            return new Error('로그인을 취소했어요. 준비되면 다시 시도해 주세요.');
        }

        if (error.code === googleModule.statusCodes.IN_PROGRESS) {
            return new Error('Google 로그인을 처리하고 있어요. 잠시 후 다시 시도해 주세요.');
        }

        if (error.code === googleModule.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            return new Error('Google Play 서비스를 사용할 수 없어 로그인할 수 없어요. 휴대폰 설정을 확인해 주세요.');
        }
    }

    return error;
}

export async function signInWithNativeGoogleOnAndroid() {
    const googleModule = ensureAndroidGoogleConfigured();

    try {
        await googleModule.GoogleSignin.hasPlayServices({
            showPlayServicesUpdateDialog: true
        });

        const response = await googleModule.GoogleSignin.signIn();
        if (!googleModule.isSuccessResponse(response)) {
            throw new Error('로그인을 취소했어요. 준비되면 다시 시도해 주세요.');
        }

        const tokenResponse = response.data.idToken
            ? null
            : await googleModule.GoogleSignin.getTokens();
        const idToken = response.data.idToken || tokenResponse?.idToken || '';

        if (!idToken) {
            throw new Error('Google 로그인을 완료하지 못했어요.');
        }

        return {
            idToken
        };
    } catch (error) {
        throw mapAndroidGoogleSignInError(error, googleModule);
    }
}

export async function signOutNativeGoogleOnAndroid() {
    const googleModule = ensureAndroidGoogleConfigured();

    try {
        if (!googleModule.GoogleSignin.hasPreviousSignIn()) {
            return;
        }

        await googleModule.GoogleSignin.signOut();
    } catch {
        // Firebase sign-out is the source of truth for app session state.
    }
}
