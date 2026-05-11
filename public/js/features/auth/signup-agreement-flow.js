import { firebaseReady } from '../../firebase.js';
import { assertAuthServicesReady, getCurrentAuthUser } from '../../services/firebase/auth-service.js';
import { mergeUserProfile } from '../../services/firebase/profile-repository.js';
import { loadTripList } from '../../ui/trips.js';

export async function confirmMandatoryTermsFlow() {
    const check = document.getElementById('mandatory-terms-check');
    if (!check || !check.checked) {
        alert("이용약관 및 개인정보처리방침에 동의해주세요.");
        return;
    }

    try {
        await firebaseReady;
        assertAuthServicesReady();

        const user = getCurrentAuthUser();
        if (!user) return;

        await mergeUserProfile(user.uid, {
            agreedToTerms: true,
            agreedAt: new Date().toISOString()
        });

        const modal = document.getElementById('mandatory-terms-modal');
        if (modal) modal.classList.add('hidden');
    } catch (error) {
        console.error("Terms agreement failed", error);
        alert("처리 중 오류가 발생했습니다: " + error.message);
    }
}

export async function completeSignupFlow() {
    const agreeTerms = document.getElementById('agree-terms');
    const agreePrivacy = document.getElementById('agree-privacy');

    if (!agreeTerms?.checked || !agreePrivacy?.checked) {
        alert("이용약관 및 개인정보처리방침에 모두 동의해주셔야 가입이 가능합니다.");
        return;
    }

    try {
        await firebaseReady;
        assertAuthServicesReady();

        const user = getCurrentAuthUser();
        if (!user) return;

        await mergeUserProfile(user.uid, {
            agreedToTerms: true,
            agreedToPrivacy: true,
            agreedAt: new Date().toISOString()
        });

        document.getElementById('signup-view')?.classList.add('hidden');
        document.getElementById('main-view')?.classList.remove('hidden');
        document.getElementById('app-header')?.classList.remove('hidden');

        await loadTripList(user.uid);
        if (window.checkInviteLink) window.checkInviteLink();
    } catch (error) {
        console.error("Signup completion failed", error);
        alert("처리 중 오류가 발생했습니다: " + error.message);
    }
}
