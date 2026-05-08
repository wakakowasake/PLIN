import { firebaseReady } from '../../firebase.js';
import { assertAuthServicesReady, observeAuthState, readCurrentSignInMethod, signOutCurrentUser } from '../../services/firebase/auth-service.js';
import { fetchUserProfile, mergeUserProfile } from '../../services/firebase/profile-repository.js';
import { setCurrentUser, defaultTravelData, isGuestMode, setIsGuestMode } from '../../state.js';
import { cacheUserIdentity, enterGuestModeState, initializeCachedAvatarOnLoad, syncPendingGuestSession } from './session-sync.js';
import { buildUserProfileSeed } from '../../../../shared/services/firebase/profile-data-helpers.js';
import { sanitizeImageUrl } from '../../ui-utils.js';
import { showToast } from '../../ui/modals.js';

const PENDING_DELETION_MESSAGE = '계정 삭제가 요청되어 다시 로그인할 수 없어요. 데이터 삭제 처리 중입니다.';
let initialTabApplied = false;

function applyInitialTabFromUrl() {
    if (initialTabApplied || typeof window.switchTab !== 'function') return;

    const params = new URLSearchParams(window.location.search);
    const tab = String(params.get('tab') || '').trim().toLowerCase();
    if (tab !== 'notices' && tab !== 'community') return;

    initialTabApplied = true;
    window.switchTab(tab);
}

function hideEmailVerificationView() {
    document.getElementById('email-verification-view')?.classList.add('hidden');
}

function showEmailVerificationView(user) {
    const view = document.getElementById('email-verification-view');
    const emailEl = document.getElementById('email-verification-address');
    if (!view) return;

    if (emailEl) {
        emailEl.textContent = user?.email || '가입한 이메일';
    }

    document.getElementById('login-view')?.classList.add('hidden');
    document.getElementById('signup-view')?.classList.add('hidden');
    document.getElementById('main-view')?.classList.add('hidden');
    document.getElementById('detail-view')?.classList.add('hidden');
    document.getElementById('app-header')?.classList.add('hidden');
    document.getElementById('back-btn')?.classList.add('hidden');
    document.getElementById('login-provider-buttons')?.classList.add('hidden');
    document.getElementById('login-btn')?.classList.add('hidden');
    document.getElementById('user-profile')?.classList.add('hidden');
    view.classList.remove('hidden');
}

async function shouldShowEmailVerification(user) {
    if (!user || user.emailVerified) {
        return false;
    }

    const signInMethod = await readCurrentSignInMethod().catch(() => null);
    return signInMethod === 'email';
}

function renderGuestEntrance() {
    const listEl = document.getElementById('trip-list') || document.getElementById('trip-list-container');
    if (!listEl) return;

    listEl.innerHTML = `
        <section class="col-span-full rounded-2xl border border-[#DCDEE3] dark:border-[#3E4145] bg-white dark:bg-[#25272C] p-6 md:p-8 shadow-[0_12px_32px_rgba(26,28,32,0.06)]">
            <div class="max-w-3xl">
                <div class="mb-4 inline-flex items-center gap-2 rounded-full bg-[#FFF2EC] dark:bg-[#31241F] px-3 py-1 text-xs font-bold text-[#FF6600]">
                    <span class="material-symbols-outlined text-[16px]">explore</span>
                    로그인 없이 둘러보기
                </div>
                <h2 class="text-2xl md:text-3xl font-black tracking-[-0.03em] text-[#1A1C20] dark:text-white">
                    먼저 여행을 만들어보고, 필요할 때 저장하세요.
                </h2>
                <p class="mt-3 text-sm md:text-base leading-relaxed text-[#868B94] dark:text-[#B0B3BA]">
                    회원가입은 여행을 계정에 저장하거나 다른 기기에서 이어볼 때만 필요해요. 웹 입구에서는 바로 새 여행 계획을 열어볼 수 있습니다.
                </p>
                <div class="mt-6 flex flex-col sm:flex-row gap-3">
                    <button type="button" data-action="create-trip"
                        class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#FF6600] px-5 text-sm font-black text-white shadow-lg shadow-orange-100 transition-colors hover:bg-[#E84500] dark:shadow-none">
                        <span class="material-symbols-outlined text-lg">add_circle</span>
                        새 여행 만들기
                    </button>
                    <button type="button" data-action="open-login-view"
                        class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[#DCDEE3] dark:border-[#3E4145] bg-[#F3F4F5] dark:bg-[#2C2E34] px-5 text-sm font-bold text-[#1A1C20] dark:text-white transition-colors hover:bg-[#ECEEF1] dark:hover:bg-[#353840]">
                        <span class="material-symbols-outlined text-lg">account_circle</span>
                        계정으로 로그인
                    </button>
                </div>
            </div>
        </section>
    `;
}

function showGuestEntrance(hideLoading) {
    hideLoading?.();
    enterGuestModeState();
    document.getElementById('app-header')?.classList.remove('hidden');
    document.getElementById('main-view')?.classList.remove('hidden');
    document.getElementById('detail-view')?.classList.add('hidden');
    document.getElementById('login-view')?.classList.add('hidden');
    document.getElementById('signup-view')?.classList.add('hidden');
    hideEmailVerificationView();
    document.getElementById('back-btn')?.classList.add('hidden');
    renderGuestEntrance();
}

async function handleAuthenticatedUser(user, { saveAllDayData, renderItinerary }) {
    const loginButtons = document.getElementById('login-provider-buttons');
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');
    const userAvatar = document.getElementById('user-avatar');
    const mainTitle = document.getElementById('main-view-title');
    const loginView = document.getElementById('login-view');
    const mainView = document.getElementById('main-view');
    const signupView = document.getElementById('signup-view');
    const appHeader = document.getElementById('app-header');

    if (await shouldShowEmailVerification(user)) {
        showEmailVerificationView(user);
        return;
    }
    hideEmailVerificationView();

    const wasGuest = isGuestMode;
    await syncPendingGuestSession(wasGuest, { saveAllDayData, renderItinerary });

    loginButtons?.classList.add('hidden');
    loginBtn?.classList.add('hidden');
    userProfile?.classList.remove('hidden');

    const userData = buildUserProfileSeed(user);
    let isTokenAdmin = false;

    try {
        const tokenResult = await user.getIdTokenResult();
        isTokenAdmin = tokenResult?.claims?.admin === true;
    } catch {}

    if (user.photoURL) {
        localStorage.setItem('cachedUserPhotoURL', sanitizeImageUrl(user.photoURL, ''));
    }

    try {
        const docSnap = await fetchUserProfile(user.uid);
        let customPhotoURL = null;

        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.accountStatus === 'pending_deletion') {
                showToast(PENDING_DELETION_MESSAGE, 'warning');
                await signOutCurrentUser().catch((signOutError) => {
                    console.warn('[Auth] Pending deletion sign-out failed:', signOutError);
                });
                return;
            }

            if (data.photoURL) customPhotoURL = sanitizeImageUrl(data.photoURL, '');

            if (!data.agreedToTerms) {
                loginView?.classList.add('hidden');
                signupView?.classList.remove('hidden');
                mainView?.classList.add('hidden');
                appHeader?.classList.add('hidden');
            } else {
                loginView?.classList.add('hidden');
                signupView?.classList.add('hidden');
                mainView?.classList.remove('hidden');
                appHeader?.classList.remove('hidden');

                if (window.loadTripList) window.loadTripList(user.uid);
                if (window.checkInviteLink) window.checkInviteLink();
            }

            setCurrentUser({
                ...user,
                phone: data.phone || '',
                birth: data.birth || '',
                bloodType: data.bloodType || '',
                allergies: data.allergies || '',
                customPhotoURL,
                agreedToTerms: data.agreedToTerms || false,
                role: isTokenAdmin ? 'admin' : (data.role || 'user')
            });
        } else {
            loginView?.classList.add('hidden');
            signupView?.classList.remove('hidden');
            mainView?.classList.add('hidden');
            appHeader?.classList.add('hidden');

            setCurrentUser({
                ...user,
                customPhotoURL,
                agreedToTerms: false,
                role: isTokenAdmin ? 'admin' : 'user'
            });
            mergeUserProfile(user.uid, userData).catch((error) => {
                console.error("Error saving initial user data:", error);
            });
        }

        if (mainTitle && user.displayName) {
            mainTitle.innerText = `${user.displayName}님의 여행 계획`;
        }

        const finalPhotoURL = sanitizeImageUrl(
            customPhotoURL || user.photoURL || localStorage.getItem('cachedUserPhotoURL'),
            ''
        );
        cacheUserIdentity({
            displayName: user.displayName || '',
            email: user.email || '',
            photoURL: finalPhotoURL
        });

        if (finalPhotoURL && userAvatar) {
            userAvatar.style.backgroundImage = `url("${finalPhotoURL}")`;
        }
    } catch (error) {
        console.error("Error loading user data:", error);
    }
}

function handleSignedOutUser() {
    const loginButtons = document.getElementById('login-provider-buttons');
    const loginBtn = document.getElementById('login-btn');
    const userProfile = document.getElementById('user-profile');
    const userAvatar = document.getElementById('user-avatar');
    const mainTitle = document.getElementById('main-view-title');
    const loginView = document.getElementById('login-view');
    const mainView = document.getElementById('main-view');
    const detailView = document.getElementById('detail-view');
    const backBtn = document.getElementById('back-btn');
    const appHeader = document.getElementById('app-header');
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.has('share')) {
        hideEmailVerificationView();
        loginView?.classList.add('hidden');
        appHeader?.classList.remove('hidden');
        if (window.checkShareLink) window.checkShareLink();
        return;
    }

    if (urlParams.has('invite')) {
        hideEmailVerificationView();
        loginView?.classList.remove('hidden');
        mainView?.classList.add('hidden');
        detailView?.classList.add('hidden');
        backBtn?.classList.add('hidden');
        appHeader?.classList.add('hidden');
        if (window.checkInviteLink) window.checkInviteLink();
        return;
    }

    loginButtons?.classList.remove('hidden');
    loginBtn?.classList.remove('hidden');
    userProfile?.classList.add('hidden');
    appHeader?.classList.remove('hidden');
    hideEmailVerificationView();
    enterGuestModeState();

    if (userAvatar) {
        userAvatar.style.backgroundImage = `url('${defaultTravelData.meta.userImage}')`;
    }
    if (mainTitle) {
        mainTitle.innerText = '여행 계획 만들기';
    }

    loginView?.classList.add('hidden');
    mainView?.classList.remove('hidden');
    detailView?.classList.add('hidden');
    backBtn?.classList.add('hidden');
    renderGuestEntrance();
}

export async function startAuthStateObserver({ hideLoading, saveAllDayData, renderItinerary }) {
    try {
        await firebaseReady;
        assertAuthServicesReady();
    } catch (error) {
        console.error("[Auth] Firebase initialization failed:", error);
        showGuestEntrance(hideLoading);
        return null;
    }

    return observeAuthState(async (user) => {
        setCurrentUser(user);
        const faviconLink = document.querySelector("link[rel~='icon']");

        document.body.classList.add('fade-in');
        hideLoading();
        if (faviconLink) faviconLink.href = '/images/icon-192.png';

        if (user) {
            await handleAuthenticatedUser(user, { saveAllDayData, renderItinerary });
            applyInitialTabFromUrl();
            return;
        }

        setIsGuestMode(false);
        handleSignedOutUser();
        applyInitialTabFromUrl();
    });
}

export { initializeCachedAvatarOnLoad };
