import { Platform } from 'react-native';
import { resolveRuntimeGateState } from '@/config/runtime-gate';

type ConfigState = 'missing' | 'partial' | 'ready';
type AdapterMode = 'mock' | 'real';

type FirebaseConfig = {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
};

type ConfigStatus<T> = {
    state: ConfigState;
    isReady: boolean;
    values: T;
    providedKeys: string[];
    missingKeys: string[];
};

type MobilePublicEnvDefinition = {
    envName: string;
    value: string | undefined;
};

// Expo public envs are inlined only for statically referenced keys.
// Keep every mobile public key in this table and access them by stable
// semantic keys instead of raw env names to avoid dynamic lookup regressions.
const MOBILE_PUBLIC_ENV = {
    firebaseApiKey: {
        envName: 'EXPO_PUBLIC_PLIN_FIREBASE_API_KEY',
        value: process.env.EXPO_PUBLIC_PLIN_FIREBASE_API_KEY
    },
    firebaseAuthDomain: {
        envName: 'EXPO_PUBLIC_PLIN_FIREBASE_AUTH_DOMAIN',
        value: process.env.EXPO_PUBLIC_PLIN_FIREBASE_AUTH_DOMAIN
    },
    firebaseProjectId: {
        envName: 'EXPO_PUBLIC_PLIN_FIREBASE_PROJECT_ID',
        value: process.env.EXPO_PUBLIC_PLIN_FIREBASE_PROJECT_ID
    },
    firebaseStorageBucket: {
        envName: 'EXPO_PUBLIC_PLIN_FIREBASE_STORAGE_BUCKET',
        value: process.env.EXPO_PUBLIC_PLIN_FIREBASE_STORAGE_BUCKET
    },
    firebaseMessagingSenderId: {
        envName: 'EXPO_PUBLIC_PLIN_FIREBASE_MESSAGING_SENDER_ID',
        value: process.env.EXPO_PUBLIC_PLIN_FIREBASE_MESSAGING_SENDER_ID
    },
    firebaseAppId: {
        envName: 'EXPO_PUBLIC_PLIN_FIREBASE_APP_ID',
        value: process.env.EXPO_PUBLIC_PLIN_FIREBASE_APP_ID
    },
    googleClientId: {
        envName: 'EXPO_PUBLIC_PLIN_GOOGLE_CLIENT_ID',
        value: process.env.EXPO_PUBLIC_PLIN_GOOGLE_CLIENT_ID
    },
    googleWebClientId: {
        envName: 'EXPO_PUBLIC_PLIN_GOOGLE_WEB_CLIENT_ID',
        value: process.env.EXPO_PUBLIC_PLIN_GOOGLE_WEB_CLIENT_ID
    },
    googleIosClientId: {
        envName: 'EXPO_PUBLIC_PLIN_GOOGLE_IOS_CLIENT_ID',
        value: process.env.EXPO_PUBLIC_PLIN_GOOGLE_IOS_CLIENT_ID
    },
    googleAndroidClientId: {
        envName: 'EXPO_PUBLIC_PLIN_GOOGLE_ANDROID_CLIENT_ID',
        value: process.env.EXPO_PUBLIC_PLIN_GOOGLE_ANDROID_CLIENT_ID
    },
    mobileDemoUid: {
        envName: 'EXPO_PUBLIC_PLIN_MOBILE_DEMO_UID',
        value: process.env.EXPO_PUBLIC_PLIN_MOBILE_DEMO_UID
    },
    mobileDemoEmail: {
        envName: 'EXPO_PUBLIC_PLIN_MOBILE_DEMO_EMAIL',
        value: process.env.EXPO_PUBLIC_PLIN_MOBILE_DEMO_EMAIL
    },
    mobileDemoName: {
        envName: 'EXPO_PUBLIC_PLIN_MOBILE_DEMO_NAME',
        value: process.env.EXPO_PUBLIC_PLIN_MOBILE_DEMO_NAME
    },
    mobileDemoPhotoUrl: {
        envName: 'EXPO_PUBLIC_PLIN_MOBILE_DEMO_PHOTO_URL',
        value: process.env.EXPO_PUBLIC_PLIN_MOBILE_DEMO_PHOTO_URL
    },
    backendUrl: {
        envName: 'EXPO_PUBLIC_PLIN_BACKEND_URL',
        value: process.env.EXPO_PUBLIC_PLIN_BACKEND_URL
    },
    revenueCatIosApiKey: {
        envName: 'EXPO_PUBLIC_PLIN_REVENUECAT_IOS_API_KEY',
        value: process.env.EXPO_PUBLIC_PLIN_REVENUECAT_IOS_API_KEY
    },
    revenueCatAndroidApiKey: {
        envName: 'EXPO_PUBLIC_PLIN_REVENUECAT_ANDROID_API_KEY',
        value: process.env.EXPO_PUBLIC_PLIN_REVENUECAT_ANDROID_API_KEY
    },
    webBasePath: {
        envName: 'EXPO_PUBLIC_PLIN_WEB_BASE_PATH',
        value: process.env.EXPO_PUBLIC_PLIN_WEB_BASE_PATH
    },
    iosDevWorkaround: {
        envName: 'EXPO_PUBLIC_PLIN_IOS_DEV_WORKAROUND',
        value: process.env.EXPO_PUBLIC_PLIN_IOS_DEV_WORKAROUND
    }
} as const satisfies Record<string, MobilePublicEnvDefinition>;

export type MobilePublicEnvKey = keyof typeof MOBILE_PUBLIC_ENV;
type MobilePublicEnvName = typeof MOBILE_PUBLIC_ENV[MobilePublicEnvKey]['envName'];

const FIREBASE_ENV_KEYS = {
    apiKey: 'firebaseApiKey',
    authDomain: 'firebaseAuthDomain',
    projectId: 'firebaseProjectId',
    storageBucket: 'firebaseStorageBucket',
    messagingSenderId: 'firebaseMessagingSenderId',
    appId: 'firebaseAppId'
} as const satisfies Record<keyof FirebaseConfig, MobilePublicEnvKey>;

const GOOGLE_ENV_KEYS = {
    genericClientId: 'googleClientId',
    webClientId: 'googleWebClientId',
    iosClientId: 'googleIosClientId',
    androidClientId: 'googleAndroidClientId'
} as const;

type GoogleEnvKey = keyof typeof GOOGLE_ENV_KEYS;

function normalizeEnvValue(value: string | undefined, fallback = '') {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim();
    if (!normalized) {
        return fallback;
    }

    const lowercase = normalized.toLowerCase();
    if (
        lowercase.startsWith('your-')
        || lowercase.startsWith('replace-')
        || lowercase.startsWith('example')
        || lowercase === 'changeme'
        || normalized.includes('<')
        || normalized.includes('>')
    ) {
        return fallback;
    }

    return normalized;
}

export function getMobileEnvName(key: MobilePublicEnvKey): MobilePublicEnvName {
    return MOBILE_PUBLIC_ENV[key].envName;
}

export function getMobileEnv(key: MobilePublicEnvKey, fallback = '') {
    return normalizeEnvValue(MOBILE_PUBLIC_ENV[key].value, fallback);
}

function buildConfigStatus<T extends Record<string, string>>(
    values: T,
    envKeys: Record<keyof T, MobilePublicEnvKey>
): ConfigStatus<T> {
    const keys = Object.keys(values) as Array<keyof T>;
    const providedKeys = keys
        .filter((key) => Boolean(values[key]))
        .map((key) => getMobileEnvName(envKeys[key]));
    const missingKeys = keys
        .filter((key) => !values[key])
        .map((key) => getMobileEnvName(envKeys[key]));
    const state: ConfigState = missingKeys.length === 0
        ? 'ready'
        : providedKeys.length === 0
            ? 'missing'
            : 'partial';

    return {
        state,
        isReady: state === 'ready',
        values,
        providedKeys,
        missingKeys
    };
}

function formatMissingEnvKeys(keys: string[]) {
    return keys.join(', ');
}

function buildConfigErrorMessage(
    subject: string,
    state: ConfigState,
    missingKeys: string[]
) {
    if (state === 'ready') {
        return null;
    }

    if (!__DEV__) {
        return `${subject} 설정 오류입니다. 관리자에게 문의해 주세요.`;
    }

    const suffix = missingKeys.length > 0
        ? ` 누락: ${formatMissingEnvKeys(missingKeys)}`
        : '';

    if (state === 'partial') {
        return `${subject} 환경 변수가 일부만 설정되어 있습니다.${suffix}`;
    }

    return `${subject} 환경 변수가 설정되지 않았습니다.${suffix}`;
}

function buildMockModeNotice(
    fallbackLabel: string,
    status: Pick<ConfigStatus<Record<string, string>>, 'state' | 'missingKeys'>
) {
    if (__DEV__) {
        const suffix = status.missingKeys.length > 0
            ? ` (${formatMissingEnvKeys(status.missingKeys)})`
            : '';

        if (status.state === 'partial') {
            return `모바일 Firebase 환경 변수가 일부만 설정되어 있어 ${fallbackLabel} 중이에요.${suffix}`;
        }

        return `모바일 Firebase 환경 변수가 없어 ${fallbackLabel} 중이에요.${suffix}`;
    }

    return `앱 설정 오류로 ${fallbackLabel} 중이에요. 관리자에게 문의해 주세요.`;
}

export function readMobilePublicEnv(key: MobilePublicEnvKey, fallback = '') {
    return getMobileEnv(key, fallback);
}

export function isIosDevCapabilityWorkaroundEnabled() {
    return Platform.OS === 'ios' && __DEV__ && getMobileEnv('iosDevWorkaround') === '1';
}

function normalizeWebBasePath(value: string) {
    const normalized = value.trim();

    if (!normalized || normalized === '/') {
        return '';
    }

    return `/${normalized.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function normalizeRelativeWebPath(value: string) {
    return value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function resolveMobileFirebaseAuthDomain() {
    const configuredAuthDomain = getMobileEnv(FIREBASE_ENV_KEYS.authDomain);

    if (Platform.OS !== 'web') {
        return configuredAuthDomain;
    }

    if (typeof window === 'undefined') {
        return configuredAuthDomain;
    }

    const hostname = String(window.location.hostname || '').trim().toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return configuredAuthDomain || 'plin-db93d.firebaseapp.com';
    }

    return 'plin.ink';
}

export function getMobileWebBasePath() {
    return normalizeWebBasePath(getMobileEnv('webBasePath'));
}

export function buildMobileWebUrl(path = '') {
    const basePath = getMobileWebBasePath();
    const relativePath = normalizeRelativeWebPath(path);
    const pathname = relativePath
        ? `${basePath || ''}/${relativePath}`
        : (basePath || '/');

    if (typeof window === 'undefined') {
        return pathname || '/';
    }

    return new URL(pathname, window.location.origin).toString();
}

export const mobileFirebaseConfig: FirebaseConfig = {
    apiKey: getMobileEnv(FIREBASE_ENV_KEYS.apiKey),
    authDomain: resolveMobileFirebaseAuthDomain(),
    projectId: getMobileEnv(FIREBASE_ENV_KEYS.projectId),
    storageBucket: getMobileEnv(FIREBASE_ENV_KEYS.storageBucket),
    messagingSenderId: getMobileEnv(FIREBASE_ENV_KEYS.messagingSenderId),
    appId: getMobileEnv(FIREBASE_ENV_KEYS.appId)
};

export function getMobileFirebaseConfigStatus() {
    return buildConfigStatus(mobileFirebaseConfig, FIREBASE_ENV_KEYS);
}

export function getMobileFirebaseConfigErrorMessage() {
    const status = getMobileFirebaseConfigStatus();
    return buildConfigErrorMessage('모바일 Firebase', status.state, status.missingKeys);
}

function getRequiredGoogleAuthKeys(): GoogleEnvKey[] {
    if (Platform.OS === 'ios') {
        return ['webClientId', 'iosClientId'];
    }

    if (Platform.OS === 'android') {
        return ['webClientId', 'androidClientId'];
    }

    return ['webClientId'];
}

export function getGoogleAuthConfigStatus() {
    const genericClientId = getMobileEnv(GOOGLE_ENV_KEYS.genericClientId);
    const webClientId = getMobileEnv(GOOGLE_ENV_KEYS.webClientId, genericClientId);
    const iosClientId = getMobileEnv(GOOGLE_ENV_KEYS.iosClientId);
    const androidClientId = getMobileEnv(GOOGLE_ENV_KEYS.androidClientId);
    const rawGoogleEnvValues = {
        genericClientId,
        webClientId,
        iosClientId,
        androidClientId
    };

    const selectedClientId = Platform.OS === 'ios'
        ? iosClientId
        : Platform.OS === 'android'
            ? androidClientId
            : webClientId;

    const googleEnvKeys = Object.keys(rawGoogleEnvValues) as GoogleEnvKey[];
    const providedKeys = googleEnvKeys
        .filter((key) => Boolean(rawGoogleEnvValues[key]))
        .map((key) => getMobileEnvName(GOOGLE_ENV_KEYS[key]));
    const requiredKeys = getRequiredGoogleAuthKeys();
    const providedRequiredKeys = requiredKeys.filter((key) => Boolean(rawGoogleEnvValues[key]));
    const missingKeys = requiredKeys
        .filter((key) => !rawGoogleEnvValues[key])
        .map((key) => getMobileEnvName(GOOGLE_ENV_KEYS[key]));
    const state: ConfigState = missingKeys.length === 0
        ? 'ready'
        : providedRequiredKeys.length === 0
            ? 'missing'
            : 'partial';

    return {
        state,
        isReady: state === 'ready',
        selectedClientId,
        providedKeys,
        missingKeys
    };
}

export function getGoogleAuthConfigErrorMessage() {
    const status = getGoogleAuthConfigStatus();
    const subject = Platform.OS === 'ios'
        ? 'iOS Google 로그인'
        : Platform.OS === 'android'
            ? 'Android Google 로그인'
            : 'Google 로그인';

    return buildConfigErrorMessage(subject, status.state, status.missingKeys);
}

export function getMobileDemoConfig() {
    const demoUid = getMobileEnv('mobileDemoUid');

    return {
        demoUid,
        hasExplicitDemoUid: Boolean(demoUid)
    };
}

export function getMobileAdapterModes() {
    const firebase = getMobileFirebaseConfigStatus();
    const google = getGoogleAuthConfigStatus();
    const demo = getMobileDemoConfig();
    const authMode: AdapterMode = firebase.isReady ? 'real' : 'mock';

    let authModeNotice: string | null = null;
    if (authMode === 'mock') {
        if (firebase.state === 'partial') {
            authModeNotice = buildMockModeNotice('데모 로그인으로 실행', firebase);
        } else if (firebase.state === 'missing') {
            authModeNotice = buildMockModeNotice('데모 로그인으로 실행', firebase);
        }
    }

    return {
        firebase,
        google,
        demo,
        firebaseReady: firebase.isReady,
        googleAuthReady: google.isReady,
        missingEnvKeys: Array.from(new Set([
            ...firebase.missingKeys,
            ...google.missingKeys
        ])),
        authMode,
        authModeNotice
    };
}

export function getMobileMissingEnvKeys() {
    return getMobileAdapterModes().missingEnvKeys;
}

export function getMobileRuntimeGateState() {
    const modes = getMobileAdapterModes();

    return resolveRuntimeGateState({
        isDev: __DEV__ && modes.firebaseReady,
        firebaseReady: modes.firebaseReady,
        googleAuthReady: modes.googleAuthReady || modes.firebaseReady,
        firebaseError: getMobileFirebaseConfigErrorMessage(),
        googleError: modes.firebaseReady ? null : getGoogleAuthConfigErrorMessage()
    });
}
