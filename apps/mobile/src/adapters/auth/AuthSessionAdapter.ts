import type {
    AuthProvider,
    AuthProvidersResponse,
    AuthSessionUser
} from '@/types/auth';

export type SessionListener = (user: AuthSessionUser | null) => void;

export interface AuthSessionAdapter {
    bootstrap(): Promise<void>;
    getCurrentSession(): Promise<AuthSessionUser | null>;
    observeSession(listener: SessionListener): () => void;
    signIn(provider?: AuthProvider): Promise<AuthSessionUser>;
    signInWithEmail(email: string, password: string): Promise<AuthSessionUser>;
    signUpWithEmail(email: string, password: string, displayName?: string): Promise<AuthSessionUser>;
    sendEmailVerification(): Promise<void>;
    linkProvider(provider: AuthProvider): Promise<AuthProvidersResponse>;
    unlinkProvider(provider: AuthProvider): Promise<AuthProvidersResponse>;
    listLinkedProviders(): Promise<AuthProvidersResponse>;
    signOut(): Promise<void>;
}
