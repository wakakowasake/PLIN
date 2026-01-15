import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { BACKEND_URL } from './config.js';

// API 키를 서버에서 가져오기
let firebaseApiKey = null;

async function loadConfig() {
    try {
        const response = await fetch(`${BACKEND_URL}/config`);
        const config = await response.json();
        firebaseApiKey = config.firebaseApiKey;
        return config;
    } catch (error) {
        console.error("Failed to load config:", error);
        throw error;
    }
}

// Firebase 초기화를 async로 처리
let app, analytics, db, auth, provider;

async function initFirebase() {
    const config = await loadConfig();
    
    const firebaseConfig = {
        apiKey: config.firebaseApiKey,
        authDomain: "plin.ink",
        projectId: "plin-db93d",
        storageBucket: "plin-db93d.firebasestorage.app",
        messagingSenderId: "68227359192",
        appId: "1:68227359192:web:1d9d14b0a2fb8ee71d12ad",
        measurementId: "G-SPGPNQB709"
    };

    app = initializeApp(firebaseConfig);
    analytics = getAnalytics(app);
    db = getFirestore(app);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
}

// Firebase 초기화 프로미스를 export
export const firebaseReady = initFirebase();
export { app, analytics, db, auth, provider };