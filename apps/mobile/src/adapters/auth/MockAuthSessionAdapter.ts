import { getMobileEnv } from '@/config/mobile-runtime-config';
import type {
    AuthCurrentSignInMethod,
    AuthProvider,
    AuthProvidersResponse,
    AuthSessionUser
} from '@/types/auth';
import type { AuthSessionAdapter, SessionListener } from './AuthSessionAdapter';

const DEMO_USER: AuthSessionUser = {
    uid: getMobileEnv('mobileDemoUid', 'demo-user-001'),
    email: getMobileEnv('mobileDemoEmail', 'demo@plin.ink'),
    displayName: getMobileEnv('mobileDemoName', 'PLIN Demo Traveler'),
    photoURL: getMobileEnv('mobileDemoPhotoUrl') || null,
    emailVerified: true
};

const ALL_AUTH_PROVIDERS = ['google', 'apple', 'kakao', 'naver'] as const;

function delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

export class MockAuthSessionAdapter implements AuthSessionAdapter {
    #user: AuthSessionUser | null = null;
    #listeners = new Set<SessionListener>();
    #providers: AuthProvidersResponse = {
        currentSignInMethod: null,
        providers: ALL_AUTH_PROVIDERS.map((provider) => ({
            provider,
            available: true,
            linked: false,
            canLink: true,
            canUnlink: false,
            isCurrentSignInMethod: false
        }))
    };

    #rebuildProviders(current: AuthCurrentSignInMethod, linkedProviders: AuthProvider[]) {
        const linkedSet = new Set(linkedProviders);
        const linkedCount = linkedSet.size;

        this.#providers = {
            currentSignInMethod: current,
            providers: ALL_AUTH_PROVIDERS.map((provider) => {
                const linked = linkedSet.has(provider);
                const isCurrentSignInMethod = current === provider;

                return {
                    provider,
                    available: true,
                    linked,
                    canLink: !linked,
                    canUnlink: linked && !isCurrentSignInMethod && linkedCount > 1,
                    isCurrentSignInMethod
                };
            })
        };
    }

    async bootstrap(): Promise<void> {
        await delay(250);
    }

    async getCurrentSession(): Promise<AuthSessionUser | null> {
        return this.#user;
    }

    observeSession(listener: SessionListener): () => void {
        this.#listeners.add(listener);
        return () => {
            this.#listeners.delete(listener);
        };
    }

    async signIn(provider: AuthProvider = 'google'): Promise<AuthSessionUser> {
        await delay(180);
        this.#user = {
            ...DEMO_USER,
            provider
        };
        this.#rebuildProviders(provider, [provider]);
        this.#emit();
        return this.#user;
    }

    async signInWithEmail(email: string, _password: string): Promise<AuthSessionUser> {
        await delay(180);
        const safeEmail = String(email || '').trim() || DEMO_USER.email;
        this.#user = {
            ...DEMO_USER,
            email: safeEmail,
            displayName: safeEmail || DEMO_USER.displayName,
            emailVerified: true,
            provider: 'email'
        };
        this.#rebuildProviders('email', []);
        this.#emit();
        return this.#user;
    }

    async signUpWithEmail(email: string, _password: string, displayName?: string): Promise<AuthSessionUser> {
        await delay(180);
        const safeEmail = String(email || '').trim() || DEMO_USER.email;
        const safeDisplayName = String(displayName || '').trim()
            || safeEmail
            || DEMO_USER.displayName;
        this.#user = {
            ...DEMO_USER,
            email: safeEmail,
            displayName: safeDisplayName,
            emailVerified: false,
            provider: 'email'
        };
        this.#rebuildProviders('email', []);
        this.#emit();
        return this.#user;
    }

    async sendEmailVerification(): Promise<void> {
        await delay(120);
        if (this.#user?.provider === 'email') {
            this.#user = {
                ...this.#user,
                emailVerified: true
            };
            this.#emit();
        }
    }

    async linkProvider(provider: AuthProvider): Promise<AuthProvidersResponse> {
        await delay(120);

        if (!this.#user) {
            throw new Error('로그인이 필요합니다.');
        }

        const linkedProviders = this.#providers.providers
            .filter((entry) => entry.linked)
            .map((entry) => entry.provider);
        const nextProviders = linkedProviders.includes(provider)
            ? linkedProviders
            : linkedProviders.concat(provider);

        this.#rebuildProviders(this.#providers.currentSignInMethod, nextProviders);
        return this.#providers;
    }

    async unlinkProvider(provider: AuthProvider): Promise<AuthProvidersResponse> {
        await delay(120);

        if (!this.#user) {
            throw new Error('로그인이 필요합니다.');
        }

        if (this.#providers.currentSignInMethod === provider) {
            throw new Error('현재 로그인 방식은 연결 해제할 수 없어요.');
        }

        const linkedProviders = this.#providers.providers
            .filter((entry) => entry.linked && entry.provider !== provider)
            .map((entry) => entry.provider);

        if (linkedProviders.length === 0) {
            throw new Error('마지막 로그인 수단은 연결 해제할 수 없어요.');
        }

        this.#rebuildProviders(this.#providers.currentSignInMethod, linkedProviders);
        return this.#providers;
    }

    async listLinkedProviders(): Promise<AuthProvidersResponse> {
        await delay(60);
        return this.#providers;
    }

    async signOut(): Promise<void> {
        await delay(100);
        this.#user = null;
        this.#rebuildProviders(null, []);
        this.#emit();
    }

    #emit(): void {
        this.#listeners.forEach((listener) => {
            listener(this.#user);
        });
    }
}
