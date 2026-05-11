import { EMAIL_VERIFICATION_REQUIRED, readCurrentSignInMethod } from '../../services/firebase/auth-service.js';
import { fetchUserProfile } from '../../services/firebase/profile-repository.js';

function isProfileExemptFromEmailVerification(snapshot) {
    if (!snapshot?.exists?.()) {
        return false;
    }
    const data = snapshot.data() || {};
    return data.emailVerificationExempt === true;
}

export async function isEmailVerificationRequiredForUser(user) {
    if (!EMAIL_VERIFICATION_REQUIRED) {
        return false;
    }
    if (!user || user.emailVerified) {
        return false;
    }
    const signInMethod = await readCurrentSignInMethod().catch(() => null);
    if (signInMethod !== 'email') {
        return false;
    }
    const profile = await fetchUserProfile(user.uid).catch(() => null);
    return !isProfileExemptFromEmailVerification(profile);
}
