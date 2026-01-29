import { firebaseReady, auth, provider, db } from '../firebase.js';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, deleteUser } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { setCurrentUser, defaultTravelData } from '../state.js';
import { hideLoading } from './modals.js';

// Detect if running in Capacitor (native app)
function isCapacitorApp() {
    return window.Capacitor !== undefined;
}

export async function login(guestDataToSave = null) {
    try {
        await firebaseReady;

        if (isCapacitorApp()) {
            // Use redirect for native apps (popup doesn't work in WebView)
            // [New] 리다이렉트 전 게스트 데이터를 로컬 스토리지에 임시 보관
            if (guestDataToSave) {
                localStorage.setItem('pending_guest_data', JSON.stringify(guestDataToSave));
                console.log("[Auth] Guest data cached for redirect sync.");
            }
            await signInWithRedirect(auth, provider);
        } else {
            // Use popup for web
            const result = await signInWithPopup(auth, provider);

            // [New] 게스트 모드에서 가입 유도 시, 로그인 성공 후 데이터를 저장함
            if (guestDataToSave && result.user) {
                const { setIsGuestMode } = await import('../state.js');
                const { saveAllDayData } = await import('../ui/trip-info.js');
                const { renderItinerary } = await import('../ui/renderers.js');

                const userRef = doc(db, "users", result.user.uid);
                await setDoc(userRef, {
                    email: result.user.email,
                    displayName: result.user.displayName,
                    photoURL: result.user.photoURL,
                    agreedToTerms: true, // 로그인 가입 유도 시 암묵적 동의 혹은 후속 처리
                    agreedToPrivacy: true,
                    agreedAt: new Date().toISOString()
                }, { merge: true });

                // 게스트 모드 해제 및 UI 갱신
                setIsGuestMode(false);

                // 데이터 저장 처리
                await saveAllDayData(null, guestDataToSave);

                // UI 갱신 (헤더 버튼 등)
                renderItinerary();

                console.log("[Auth] Guest data saved to new account and UI updated.");
            }
        }
    } catch (error) {
        console.error("로그인 실패", error);
        alert("로그인 실패: " + error.message);
    }
}

/**
 * [New] 게스트 모드로 진입
 */
export async function enterGuestMode() {
    const { setIsGuestMode, setTravelData, defaultTravelData } = await import('../state.js');
    const { createNewTrip } = await import('../ui/trips.js');

    setIsGuestMode(true);

    // UI 전환
    document.getElementById('login-view')?.classList.add('hidden');
    document.getElementById('main-view')?.classList.remove('hidden');
    document.getElementById('app-header')?.classList.remove('hidden');

    // 게스트용 초기 데이터 세팅
    setTravelData(JSON.parse(JSON.stringify(defaultTravelData)));

    // 바로 여행 생성 모달 띄우기
    setTimeout(() => {
        createNewTrip();
    }, 100);
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
    try {
        await firebaseReady;
        await signOut(auth);
        closeLogoutModal();

        // [User Request] Clear all user caches on logout to fix profile sync issues
        localStorage.removeItem('cachedUserPhotoURL');
        localStorage.removeItem('cachedUserDisplayName');
        localStorage.removeItem('cachedUserEmail');
    } catch (error) { console.error("로그아웃 실패", error); }
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
        const signupView = document.getElementById('signup-view');
        const detailView = document.getElementById('detail-view');
        const backBtn = document.getElementById('back-btn');
        const appHeader = document.getElementById('app-header');
        const faviconLink = document.querySelector("link[rel~='icon']");

        document.body.style.opacity = '1';
        hideLoading();
        if (faviconLink) faviconLink.href = '/favicon.ico';

        if (user) {
            // [New] 로그인 성공 시 게스트 모드 무조건 해제 및 UI 갱신
            import('../state.js').then(m => {
                const wasGuest = m.isGuestMode;
                m.setIsGuestMode(false);

                // localStorage에 보관된 펜딩 데이터가 있다면 동기화 시도
                const pendingData = localStorage.getItem('pending_guest_data');
                if (pendingData) {
                    const guestData = JSON.parse(pendingData);
                    localStorage.removeItem('pending_guest_data');

                    import('./trip-info.js').then(ti => {
                        ti.saveAllDayData(null, guestData);
                    });
                } else if (wasGuest) {
                    // 펜딩 데이터는 없으나 게스트 모드였다면 UI 갱신만
                    import('./renderers.js').then(r => r.renderItinerary());
                }
            });

            loginBtn?.classList.add('hidden');
            userProfile?.classList.remove('hidden');

            const userRef = doc(db, "users", user.uid);
            const userData = {
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL
            };

            // Update cache with current user info immediately to avoid stale data from previous user
            if (user.photoURL) localStorage.setItem('cachedUserPhotoURL', user.photoURL);

            // [Modified] Initial agreement check removed here, moved to signup view process

            getDoc(userRef).then((docSnap) => {
                let customPhotoURL = null;
                const signupView = document.getElementById('signup-view');

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.photoURL) customPhotoURL = data.photoURL;

                    // [User Request] Route to signup view if NOT agreed to terms
                    if (!data.agreedToTerms) {
                        loginView?.classList.add('hidden');
                        signupView?.classList.remove('hidden');
                        mainView?.classList.add('hidden');
                        appHeader?.classList.add('hidden'); // [User Request] Hide header on signup page
                    } else {
                        loginView?.classList.add('hidden');
                        signupView?.classList.add('hidden');
                        mainView?.classList.remove('hidden');
                        appHeader?.classList.remove('hidden'); // Show header in main service

                        if (window.loadTripList) window.loadTripList(user.uid);
                        if (window.checkInviteLink) window.checkInviteLink();
                    }

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
                        customPhotoURL: customPhotoURL,
                        agreedToTerms: data.agreedToTerms || false
                    });
                } else {
                    // Entirely new user: show signup view first
                    loginView?.classList.add('hidden');
                    signupView?.classList.remove('hidden');
                    mainView?.classList.add('hidden');
                    appHeader?.classList.add('hidden'); // [User Request] Hide header on signup page

                    setCurrentUser({ ...user, customPhotoURL: customPhotoURL, agreedToTerms: false });
                }

                // [Simplified] Save basic user data first if it's the very first login
                if (!docSnap.exists()) {
                    setDoc(userRef, userData, { merge: true });
                }

                if (mainTitle && user.displayName) mainTitle.innerText = `${user.displayName}님의 여행 계획`;
                localStorage.setItem('cachedUserDisplayName', user.displayName || '');
                localStorage.setItem('cachedUserEmail', user.email || '');

                // Prioritize user's own data over potentially stale globally cached photo from previous user
                const finalPhotoURL = customPhotoURL || user.photoURL || localStorage.getItem('cachedUserPhotoURL');

                if (finalPhotoURL) {
                    localStorage.setItem('cachedUserPhotoURL', finalPhotoURL);
                    if (userAvatar) userAvatar.style.backgroundImage = `url("${finalPhotoURL}")`;
                }
            }).catch(error => {
                console.error("Error loading user data:", error);
            });
        } else {
            // [Modified] Check for public share link
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('share')) {
                console.log("[Auth] Public share link detected. Skipping login screen.");
                loginView?.classList.add('hidden');
                appHeader?.classList.remove('hidden');
                // checkShareLink will be called by ui.js or we can ensure it's called here
                if (window.checkShareLink) window.checkShareLink();
            } else {
                loginBtn?.classList.remove('hidden');
                userProfile?.classList.add('hidden');
                appHeader?.classList.add('hidden'); // [User Request] Hide header on login view
                // 로그아웃 상태에서도 기본 여행가 아바타 표시
                if (userAvatar) userAvatar.style.backgroundImage = `url('${defaultTravelData.meta.userImage}')`;
                if (mainTitle) mainTitle.innerText = '나의 여행 계획';

                loginView?.classList.remove('hidden');
                mainView?.classList.add('hidden');
                detailView?.classList.add('hidden');
                backBtn?.classList.add('hidden');
            }
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

export async function confirmMandatoryTerms() {
    const check = document.getElementById('mandatory-terms-check');
    if (!check || !check.checked) {
        alert("이용약관 및 개인정보처리방침에 동의해주세요.");
        return;
    }

    try {
        await firebaseReady;
        const user = auth.currentUser;
        if (!user) return;

        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
            agreedToTerms: true,
            agreedAt: new Date().toISOString()
        }, { merge: true });

        const modal = document.getElementById('mandatory-terms-modal');
        if (modal) modal.classList.add('hidden');

        console.log("Mandatory terms agreed successfully");
    } catch (error) {
        console.error("Terms agreement failed", error);
        alert("처리 중 오류가 발생했습니다: " + error.message);
    }
}

export async function deleteAccount() {
    try {
        await firebaseReady;
        const user = auth.currentUser;
        if (!user) {
            alert("로그인이 필요합니다.");
            return;
        }

        // 1. Delete Firestore user document
        const userRef = doc(db, "users", user.uid);
        await deleteDoc(userRef);

        // 2. Delete Auth user
        await deleteUser(user);

        // 3. Clear local storage
        localStorage.removeItem('cachedUserPhotoURL');
        localStorage.removeItem('cachedUserDisplayName');
        localStorage.removeItem('cachedUserEmail');

        alert("회원 탈퇴가 완료되었습니다. 그동안 PLIN을 이용해주셔서 감사합니다.");
        window.location.reload();
    } catch (error) {
        console.error("회원 탈퇴 실패:", error);
        if (error.code === 'auth/requires-recent-login') {
            alert("보안을 위해 최근 로그인 기록이 필요합니다. 다시 로그인 후 시도해주세요.");
            await logout();
        } else {
            alert("회원 탈퇴 중 오류가 발생했습니다: " + error.message);
        }
    }
}

export async function completeSignup() {
    const agreeTerms = document.getElementById('agree-terms');
    const agreePrivacy = document.getElementById('agree-privacy');

    if (!agreeTerms?.checked || !agreePrivacy?.checked) {
        alert("이용약관 및 개인정보처리방침에 모두 동의해주셔야 가입이 가능합니다.");
        return;
    }

    try {
        await firebaseReady;
        const user = auth.currentUser;
        if (!user) return;

        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, {
            agreedToTerms: true,
            agreedToPrivacy: true,
            agreedAt: new Date().toISOString()
        }, { merge: true });

        // UI 전환
        document.getElementById('signup-view')?.classList.add('hidden');
        document.getElementById('main-view')?.classList.remove('hidden');
        document.getElementById('app-header')?.classList.remove('hidden');

        if (window.loadTripList) window.loadTripList(user.uid);
        if (window.checkInviteLink) window.checkInviteLink();

        console.log("Signup completed with individual agreements.");
    } catch (error) {
        console.error("Signup completion failed", error);
        alert("처리 중 오류가 발생했습니다: " + error.message);
    }
}

export async function loginWithGuestData() {
    const { travelData } = await import('../state.js');
    await login(travelData);
}

window.confirmMandatoryTerms = confirmMandatoryTerms;
window.deleteAccount = deleteAccount;
window.completeSignup = completeSignup;
window.enterGuestMode = enterGuestMode;
window.loginWithGuestData = loginWithGuestData;

export default { login, logout, openLogoutModal, closeLogoutModal, confirmLogout, initAuthStateObserver, confirmMandatoryTerms, deleteAccount, completeSignup, enterGuestMode, loginWithGuestData };

