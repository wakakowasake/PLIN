import { firebaseReady, auth, provider, db } from '../firebase.js';
import { signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { setCurrentUser } from '../state.js';
import { hideLoading } from './modals.js';

export async function login() {
    try {
        await firebaseReady;
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("로그인 실패", error);
        alert("로그인 실패: " + error.message);
    }
}

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

                const finalPhotoURL = customPhotoURL || user.photoURL || localStorage.getItem('cachedUserPhotoURL');
                if (finalPhotoURL) {
                    localStorage.setItem('cachedUserPhotoURL', finalPhotoURL);
                    if (userAvatar) userAvatar.style.backgroundImage = `url('${finalPhotoURL}')`;
                    const testImg = new Image();
                    testImg.onerror = () => {
                        const cached = localStorage.getItem('cachedUserPhotoURL');
                        if (cached && cached !== finalPhotoURL) {
                            if (userAvatar) userAvatar.style.backgroundImage = `url('${cached}')`;
                        } else {
                            if (userAvatar) userAvatar.style.backgroundImage = '';
                        }
                    };
                    testImg.src = finalPhotoURL;
                } else {
                    const cached = localStorage.getItem('cachedUserPhotoURL');
                    if (cached && userAvatar) userAvatar.style.backgroundImage = `url('${cached}')`;
                    else if (userAvatar) userAvatar.style.backgroundImage = '';
                }
            }).catch(error => {
                console.error("Error loading user data:", error);
                const fallbackPhotoURL = user.photoURL || localStorage.getItem('cachedUserPhotoURL');
                if (fallbackPhotoURL && document.getElementById('user-avatar')) document.getElementById('user-avatar').style.backgroundImage = `url('${fallbackPhotoURL}')`;
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
            if (userAvatar) userAvatar.style.backgroundImage = '';
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

export default { login, logout, openLogoutModal, closeLogoutModal, confirmLogout, initAuthStateObserver };
