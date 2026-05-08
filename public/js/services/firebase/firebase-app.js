import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { fetchServerConfig } from '../backend/config-service.js';
import { isLocalhostRuntime } from '../platform/web-adapter.js';

const FIREBASE_PROJECT_CONFIG = {
    projectId: "plin-db93d",
    storageBucket: "plin-db93d.firebasestorage.app",
    messagingSenderId: "68227359192",
    appId: "1:68227359192:web:1d9d14b0a2fb8ee71d12ad",
    measurementId: "G-SPGPNQB709"
};

async function loadConfig() {
    const config = await fetchServerConfig();
    if (!config || !config.firebaseApiKey) {
        throw new Error("firebaseApiKey가 응답에 없습니다.");
    }

    return config;
}

const isLocalhost = isLocalhostRuntime();
const serverConfig = await loadConfig();
const initialConfig = {
    apiKey: serverConfig.firebaseApiKey,
    authDomain: isLocalhost ? "plin-db93d.firebaseapp.com" : "plin.ink",
    ...FIREBASE_PROJECT_CONFIG
};

const app = getApps().length ? getApp() : initializeApp(initialConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

let analytics = null;

async function initializeAnalyticsIfSupported() {
    if (isLocalhost) {
        analytics = null;
        return;
    }

    try {
        const supported = await isAnalyticsSupported();
        analytics = supported ? getAnalytics(app) : null;
    } catch (error) {
        console.warn("Firebase Analytics initialization skipped:", error);
        analytics = null;
    }
}

async function initFirebase() {
    await initializeAnalyticsIfSupported();
}

export const firebaseReady = initFirebase();
export { app, analytics, db, auth, storage, provider };
