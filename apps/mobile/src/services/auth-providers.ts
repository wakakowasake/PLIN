import {
    BackendRequestError,
    fetchBackendJson
} from '@/services/backend-client';
import type {
    AuthFlowNextAction,
    AuthFlowOutcome,
    AuthFlowReason,
    AuthProvider,
    AuthProvidersResponse,
    AuthSocialCompletionPayload
} from '@/types/auth';

export type SocialAuthIntent = 'signin' | 'link';

type SocialStartResponse = {
    provider: AuthProvider;
    intent: SocialAuthIntent;
    authorizationUrl: string;
    callbackUrl: string;
    state: string;
};

type AppleExchangeResponse = {
    idToken?: string;
};

type SocialExchangeInput = {
    provider: AuthProvider;
    intent: SocialAuthIntent;
    accessToken?: string;
    ticket?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCompletionPayload(payload: unknown): AuthSocialCompletionPayload | null {
    if (!isPlainObject(payload)) {
        return null;
    }

    const outcome = typeof payload.outcome === 'string'
        ? payload.outcome as AuthFlowOutcome
        : undefined;

    if (!outcome) {
        return null;
    }

    return {
        outcome,
        reason: typeof payload.reason === 'string'
            ? payload.reason as AuthFlowReason
            : undefined,
        nextAction: typeof payload.nextAction === 'string'
            ? payload.nextAction as AuthFlowNextAction
            : undefined,
        message: typeof payload.message === 'string' ? payload.message : undefined,
        emailMasked: typeof payload.emailMasked === 'string' ? payload.emailMasked : null,
        firebaseCustomToken: typeof payload.firebaseCustomToken === 'string'
            ? payload.firebaseCustomToken
            : undefined,
        authUser: isPlainObject(payload.authUser) ? payload.authUser as never : undefined,
        providers: isPlainObject(payload.providers) ? payload.providers as AuthProvidersResponse : undefined
    };
}

export class AuthFlowError extends Error {
    provider: AuthProvider;
    outcome?: AuthFlowOutcome;
    reason?: AuthFlowReason;
    nextAction?: AuthFlowNextAction;
    emailMasked?: string | null;

    constructor(
        provider: AuthProvider,
        message: string,
        options?: {
            outcome?: AuthFlowOutcome;
            reason?: AuthFlowReason;
            nextAction?: AuthFlowNextAction;
            emailMasked?: string | null;
        }
    ) {
        super(message);
        this.name = 'AuthFlowError';
        this.provider = provider;
        this.outcome = options?.outcome;
        this.reason = options?.reason;
        this.nextAction = options?.nextAction;
        this.emailMasked = options?.emailMasked ?? null;
    }
}

function toAuthFlowError(provider: AuthProvider, error: unknown) {
    if (error instanceof AuthFlowError) {
        return error;
    }

    if (error instanceof BackendRequestError) {
        const payload = normalizeCompletionPayload(error.payload);
        if (payload) {
            return new AuthFlowError(
                provider,
                payload.message || error.message,
                {
                    outcome: payload.outcome,
                    reason: payload.reason,
                    nextAction: payload.nextAction,
                    emailMasked: payload.emailMasked
                }
            );
        }
    }

    return new AuthFlowError(
        provider,
        error instanceof Error && error.message
            ? error.message
            : '인증 요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'
    );
}

function assertProvidersResponse(
    provider: AuthProvider,
    payload: AuthSocialCompletionPayload
) {
    if (!payload.providers) {
        throw new AuthFlowError(
            provider,
            payload.message || '연결 상태를 확인하지 못했어요.'
        );
    }

    return payload.providers;
}

export async function listLinkedProviders() {
    return fetchBackendJson<AuthProvidersResponse>('/auth/providers');
}

export async function unlinkProviderRemote(provider: AuthProvider) {
    return fetchBackendJson<AuthProvidersResponse>(
        `/auth/providers/${encodeURIComponent(provider)}/unlink`,
        {
            method: 'POST'
        }
    );
}

export async function linkCustomProviderWithAccessToken(
    provider: Extract<AuthProvider, 'kakao'>,
    accessToken: string
) {
    try {
        const payload = await fetchBackendJson<AuthSocialCompletionPayload>(
            `/auth/providers/${encodeURIComponent(provider)}/link`,
            {
                method: 'POST',
                body: {
                    accessToken
                }
            }
        );

        return assertProvidersResponse(provider, payload);
    } catch (error) {
        throw toAuthFlowError(provider, error);
    }
}

export async function startSocialAuthSession(
    provider: Extract<AuthProvider, 'kakao' | 'naver'>,
    intent: SocialAuthIntent,
    options?: {
        callbackUrl?: string;
    }
) {
    try {
        return await fetchBackendJson<SocialStartResponse>('/auth/social/mobile-start', {
            method: 'POST',
            body: {
                provider,
                intent,
                appRedirectUrl: options?.callbackUrl || undefined
            },
            requireAuth: intent === 'link'
        });
    } catch (error) {
        throw toAuthFlowError(provider, error);
    }
}

export async function startAppleAuthSession(
    intent: SocialAuthIntent,
    nonce: string,
    options?: {
        callbackUrl?: string;
    }
) {
    const provider: Extract<AuthProvider, 'apple'> = 'apple';

    try {
        return await fetchBackendJson<SocialStartResponse>('/auth/apple/mobile-start', {
            method: 'POST',
            body: {
                intent,
                nonce,
                appRedirectUrl: options?.callbackUrl || undefined
            },
            requireAuth: intent === 'link'
        });
    } catch (error) {
        throw toAuthFlowError(provider, error);
    }
}

export async function exchangeAppleAuthSession(input: {
    intent: SocialAuthIntent;
    ticket: string;
}) {
    const provider: Extract<AuthProvider, 'apple'> = 'apple';

    try {
        return await fetchBackendJson<AppleExchangeResponse>('/auth/apple/mobile-exchange', {
            method: 'POST',
            body: {
                intent: input.intent,
                ticket: input.ticket
            },
            requireAuth: input.intent === 'link'
        });
    } catch (error) {
        throw toAuthFlowError(provider, error);
    }
}

export async function exchangeSocialAuthSession(input: SocialExchangeInput) {
    const { provider, intent, accessToken, ticket } = input;

    try {
        return await fetchBackendJson<AuthSocialCompletionPayload>('/auth/social/mobile-exchange', {
            method: 'POST',
            body: {
                provider,
                intent,
                accessToken,
                ticket
            },
            requireAuth: intent === 'link'
        });
    } catch (error) {
        throw toAuthFlowError(provider, error);
    }
}
