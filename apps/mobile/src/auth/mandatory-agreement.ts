type AgreementProfileSummary = {
    agreedToTerms?: boolean | null;
    source?: 'auth' | 'profile' | null;
} | null | undefined;

type SessionLikeUser = {
    uid?: string | null;
} | null | undefined;

export function hasAcceptedMandatoryTerms(profileSummary: AgreementProfileSummary) {
    return profileSummary?.agreedToTerms === true;
}

export function requiresMandatoryAgreement(
    user: SessionLikeUser,
    profileSummary: AgreementProfileSummary
) {
    return Boolean(user) && !hasAcceptedMandatoryTerms(profileSummary);
}

export function isMandatoryAgreementStateResolved(
    user: SessionLikeUser,
    profileSummary: AgreementProfileSummary
) {
    return Boolean(user) && profileSummary?.source === 'profile';
}

export function shouldRetryMandatoryAgreementResolution(
    user: SessionLikeUser,
    profileSummary: AgreementProfileSummary
) {
    return requiresMandatoryAgreement(user, profileSummary)
        && !isMandatoryAgreementStateResolved(user, profileSummary);
}
