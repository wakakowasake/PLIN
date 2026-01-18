import { firebaseReady, auth, provider, db } from '../firebase.js';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { setCurrentUser, defaultTravelData } from '../state.js';
import { hideLoading } from './modals.js';

// Detect if running in Capacitor (native app)
function isCapacitorApp() {
    return window.Capacitor !== undefined;
}

export async function login() {
    try {
        await firebaseReady;

        if (isCapacitorApp()) {
            // Use redirect for native apps (popup doesn't work in WebView)
            await signInWithRedirect(auth, provider);
        } else {
            // Use popup for web
            await signInWithPopup(auth, provider);
        }
    } catch (error) {
        console.error("로그인 실패", error);
        alert("로그인 실패: " + error.message);
    }
}

// Handle redirect result on app load (for native apps)
async function handleRedirectResult() {
    try {
        await firebaseReady;
        const result = await getRedirectResult(auth);
        if (result) {
            console.log("Redirect login successful:", result.user.displayName);
        }
    } catch (error) {
        console.error("Redirect login error:", error);
    }
}

// Call on page load
handleRedirectResult();


export async function logout() {
    try { await firebaseReady; await signOut(auth); closeLogoutModal(); } catch (error) { console.error("로그아웃 실패", error); }
}

export function openLogoutModal() {
    const el = document.getElementById('logout-modal'); if (el) el.classList.remove('hidden');
}

export function closeLogoutModal() {
    const el = document.getElementById('logout-modal'); if (el) el.classList.add('hidden');
}

export function confirmLogout() {
    openLogoutModal();
}

export async function initAuthStateObserver() {
    await firebaseReady;
    onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
        const loginBtn = document.getElementById('login-btn');
        const userProfile = document.getElementById('user-profile');
        const userAvatar = document.getElementById('user-avatar');
        const mainTitle = document.getElementById('main-view-title');
        const loginView = document.getElementById('login-view');
        const mainView = document.getElementById('main-view');
        const detailView = document.getElementById('detail-view');
        const backBtn = document.getElementById('back-btn');
        const faviconLink = document.querySelector("link[rel~='icon']");

        document.body.style.opacity = '1';
        hideLoading();
        if (faviconLink) faviconLink.href = '/favicon.ico';

        if (user) {
            loginBtn?.classList.add('hidden');
            userProfile?.classList.remove('hidden');

            const userRef = doc(db, "users", user.uid);
            const userData = { email: user.email, displayName: user.displayName };

            getDoc(userRef).then((docSnap) => {
                let customPhotoURL = null;
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.photoURL) customPhotoURL = data.photoURL;
                    setCurrentUser({
                        ...user,
                        homeAddress: data.homeAddress || '',
                        homeLat: data.homeLat || null,
                        homeLng: data.homeLng || null,
                        phone: data.phone || '',
                        emergencyContact: data.emergencyContact || '',
                        passport: data.passport || '',
                        passportExpiry: data.passportExpiry || '',
                        birth: data.birth || '',
                        bloodType: data.bloodType || '',
                        allergies: data.allergies || '',
                        customPhotoURL: customPhotoURL
                    });
                } else {
                    setCurrentUser({ ...user, customPhotoURL: customPhotoURL });
                }

                // Check localStorage first for uploaded photos, then Firestore custom photo, then Google photo
                const cachedPhoto = localStorage.getItem('cachedUserPhotoURL');
                const finalPhotoURL = cachedPhoto || customPhotoURL || user.photoURL;

                if (finalPhotoURL) {
                    localStorage.setItem('cachedUserPhotoURL', finalPhotoURL);
                    if (userAvatar) userAvatar.style.backgroundImage = `url("${finalPhotoURL}")`;
                    const testImg = new Image();
                    testImg.onerror = () => {
                        const cached = localStorage.getItem('cachedUserPhotoURL');
                        if (cached && cached !== finalPhotoURL) {
                            if (userAvatar) userAvatar.style.backgroundImage = `url("${cached}")`;
                        } else {
                            // 이미지 로드 실패 시 기본 여행가 아바타 표시
                            if (userAvatar) userAvatar.style.backgroundImage = `url("${defaultTravelData.meta.userImage}")`;
                        }
                    };
                    testImg.src = finalPhotoURL;
                } else {
                    // 사진이 없을 때 기본 여행가 아바타 표시
                    const cached = localStorage.getItem('cachedUserPhotoURL');
                    if (cached && userAvatar) userAvatar.style.backgroundImage = `url("${cached}")`;
                    else if (userAvatar) userAvatar.style.backgroundImage = `url("${defaultTravelData.meta.userImage}")`;
                }
            }).catch(error => {
                console.error("Error loading user data:", error);
                const fallbackPhotoURL = user.photoURL || localStorage.getItem('cachedUserPhotoURL');
                const userAvatar = document.getElementById('user-avatar');
                if (fallbackPhotoURL && userAvatar) {
                    userAvatar.style.backgroundImage = `url("${fallbackPhotoURL}")`;
                } else if (userAvatar) {
                    // Firestore 에러 시에도 기본 여행가 아바타 표시
                    userAvatar.style.backgroundImage = `url("${defaultTravelData.meta.userImage}")`;
                }
            });

            setDoc(userRef, userData, { merge: true });

            if (mainTitle) mainTitle.innerText = `${user.displayName}님의 여행 계획`;
            localStorage.setItem('cachedUserDisplayName', user.displayName || '');
            localStorage.setItem('cachedUserEmail', user.email || '');

            loginView?.classList.add('hidden');
            mainView?.classList.remove('hidden');

            if (window.loadTripList) window.loadTripList(user.uid);
            if (window.checkInviteLink) window.checkInviteLink();
        } else {
            loginBtn?.classList.remove('hidden');
            userProfile?.classList.add('hidden');
            // 로그아웃 상태에서도 기본 여행가 아바타 표시
            if (userAvatar) userAvatar.style.backgroundImage = `url('${defaultTravelData.meta.userImage}')`;
            if (mainTitle) mainTitle.innerText = '나의 여행 계획';

            loginView?.classList.remove('hidden');
            mainView?.classList.add('hidden');
            detailView?.classList.add('hidden');
            backBtn?.classList.add('hidden');
        }
    });
}

// Initialize observer immediately
initAuthStateObserver();

// CRITICAL: Immediately set avatar from localStorage on page load (before async auth completes)
// This ensures uploaded photos display instantly instead of waiting for Firebase auth
// Wrapped in DOMContentLoaded to ensure the avatar element exists
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const cachedPhotoOnLoad = localStorage.getItem('cachedUserPhotoURL');
        const userAvatarOnLoad = document.getElementById('user-avatar');
        if (userAvatarOnLoad) {
            // localStorage에 캐시가 있으면 사용, 없으면 기본 여행가 아바타 사용
            const photoToUse = cachedPhotoOnLoad || defaultTravelData.meta.userImage;
            userAvatarOnLoad.style.backgroundImage = `url('${photoToUse}')`;
        }
    });
} else {
    // DOM already loaded, execute immediately
    const cachedPhotoOnLoad = localStorage.getItem('cachedUserPhotoURL');
    const userAvatarOnLoad = document.getElementById('user-avatar');
    if (userAvatarOnLoad) {
        // localStorage에 캐시가 있으면 사용, 없으면 기본 여행가 아바타 사용
        const photoToUse = cachedPhotoOnLoad || defaultTravelData.meta.userImage;
        userAvatarOnLoad.style.backgroundImage = `url('${photoToUse}')`;
    }
}

export default { login, logout, openLogoutModal, closeLogoutModal, confirmLogout, initAuthStateObserver };
