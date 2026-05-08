import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import * as FirebaseAuth from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { Auth, Persistence } from 'firebase/auth';
import {
    getMobileEnv,
    getMobileFirebaseConfigErrorMessage,
    getMobileFirebaseConfigStatus,
    type MobilePublicEnvKey,
    mobileFirebaseConfig,
} from '@/config/mobile-runtime-config';

let mobileApp: FirebaseApp | null = null;
let mobileAuth: Auth | null = null;

const getReactNativePersistence = (
    FirebaseAuth as unknown as {
        getReactNativePersistence(storage: typeof AsyncStorage): Persistence;
    }
).getReactNativePersistence;

export function hasMobileFirebaseConfig() {
    return getMobileFirebaseConfigStatus().isReady;
}

export function getMobileFirebaseConfigError() {
    if (getMobileFirebaseConfigStatus().isReady) {
        return null;
    }
    return getMobileFirebaseConfigErrorMessage();
}

export function assertMobileFirebaseConfigReady() {
    const errorMessage = getMobileFirebaseConfigError();

    if (errorMessage) {
        throw new Error(errorMessage);
    }
}

export function getMobileFirebaseApp() {
    if (mobileApp) {
        return mobileApp;
    }

    assertMobileFirebaseConfigReady();

    mobileApp = getApps().length > 0
        ? getApp()
        : initializeApp(mobileFirebaseConfig);

    return mobileApp;
}

export function getMobileFirestore() {
    return getFirestore(getMobileFirebaseApp());
}

export function getMobileStorage() {
    return getStorage(getMobileFirebaseApp());
}

export function getMobileAuth() {
    if (mobileAuth) {
        return mobileAuth;
    }

    const app = getMobileFirebaseApp();

    if (Platform.OS === 'web') {
        mobileAuth = FirebaseAuth.getAuth(app);
        return mobileAuth;
    }

    try {
        mobileAuth = FirebaseAuth.initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage)
        });
    } catch {
        mobileAuth = FirebaseAuth.getAuth(app);
    }

    return mobileAuth;
}

export function readMobilePublicEnv(key: MobilePublicEnvKey, fallback = '') {
    return getMobileEnv(key, fallback);
}
