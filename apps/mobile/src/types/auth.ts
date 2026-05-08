export type SessionStatus = 'booting' | 'signedOut' | 'signedIn';

export type AuthProvider = 'google' | 'apple' | 'kakao' | 'naver';
export type AuthCurrentSignInMethod = AuthProvider | 'email' | null;

export type LinkedProviderState = {
    provider: AuthProvider;
    available: boolean;
    linked: boolean;
    canLink: boolean;
    canUnlink: boolean;
    isCurrentSignInMethod: boolean;
    emailHint?: string;
    linkedAt?: string;
};

export type AuthProvidersResponse = {
    currentSignInMethod: AuthCurrentSignInMethod;
    providers: LinkedProviderState[];
};

export type AuthFlowOutcome =
    | 'signed_in'
    | 'linked'
    | 'requires_existing_login'
    | 'provider_conflict';

export type AuthFlowReason =
    | 'existing_account_requires_link'
    | 'provider_already_linked_elsewhere'
    | 'last_method_forbidden'
    | 'current_method_forbidden'
    | 'provider_not_linked';

export type AuthFlowNextAction =
    | 'login_then_link'
    | 'use_other_account';

export type AuthSessionUser = {
    uid: string;
    email: string;
    displayName: string;
    photoURL?: string | null;
    emailVerified?: boolean;
    provider?: AuthCurrentSignInMethod;
    isAdmin?: boolean;
};

export type AuthSocialCompletionPayload = {
    outcome: AuthFlowOutcome;
    reason?: AuthFlowReason;
    nextAction?: AuthFlowNextAction;
    message?: string;
    emailMasked?: string | null;
    firebaseCustomToken?: string;
    authUser?: AuthSessionUser | null;
    providers?: AuthProvidersResponse | null;
};
