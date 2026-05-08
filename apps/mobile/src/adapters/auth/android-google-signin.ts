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
        throw new Error('Google 로그인 설정이 완료되지 않았습니다.');
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
            return new Error('Google 로그인이 이미 진행 중이에요. 잠시 후 다시 시도해 주세요.');
        }

        if (error.code === googleModule.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            return new Error('Google Play 서비스를 사용할 수 없어 로그인할 수 없어요. 기기 설정을 확인해 주세요.');
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
            throw new Error('Google ID 토큰을 가져오지 못했습니다.');
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
