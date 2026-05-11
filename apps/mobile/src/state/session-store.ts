import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { Platform } from 'react-native';

import { useAdapters } from '@/adapters/useAdapters';
import {
    getCachedProfileSummary,
    setCachedProfileSummary
} from '@/adapters/profile/profile-summary-cache';
import { clearCachedTripsForUser } from '@/adapters/trips/trip-local-cache';
import { useForegroundResumeRefresh } from '@/hooks/useForegroundResumeRefresh';
import { clearTripListMemoryCache } from '@/hooks/useTripList';
import { requestAccountDeletion as requestAccountDeletionRemote } from '@/services/account-lifecycle';
import { clearTripAnnouncementPushInstallation, syncTripAnnouncementPushInstallation } from '@/services/trip-announcements';
import { resetTripWriteSync } from '@/state/trip-write-sync';
import {
    clearMobileWebAuthInProgressProvider,
    clearPendingAuthReturnTo,
    readMobileWebAuthInProgressProvider,
    storeMobileWebAuthInProgressProvider,
    storePendingAuthReturnTo
} from '@/utils/mobile-web-session';
import type {
    AuthProvider,
    AuthProvidersResponse,
    AuthSessionUser,
    SessionStatus
} from '@/types/auth';
import type { MobileProfileSummary } from '@/types/profile';
import { isNetworkLikeError } from '@/utils/network-error';

type SessionStoreValue = {
    status: SessionStatus;
    user: AuthSessionUser | null;
    authProviders: AuthProvidersResponse | null;
    profileSummary: MobileProfileSummary | null;
    isSessionHydrating: boolean;
    isProfileSummaryLoading: boolean;
    isAuthProvidersLoading: boolean;
    bootstrapError: string | null;
    authActionError: string | null;
    isAuthActionLoading: boolean;
    lastSessionEvent:
        | 'bootstrap'
        | 'observe'
        | 'refresh'
        | 'refreshProviders'
        | 'updateProfilePhoto'
        | 'updateProfileDisplayName'
        | 'signIn'
        | 'sendEmailVerification'
        | 'linkProvider'
        | 'unlinkProvider'
        | 'acceptTerms'
        | 'requestDeletion'
        | 'signOut'
        | null;
    lastSessionEventAt: number | null;
    retryBootstrap(): Promise<void>;
    refreshSession(): Promise<AuthSessionUser | null>;
    refreshLinkedProviders(): Promise<AuthProvidersResponse | null>;
    updateProfilePhoto(photoURL: string): Promise<void>;
    updateProfileDisplayName(displayName: string): Promise<void>;
    signIn(provider?: AuthProvider): Promise<void>;
    signInWithEmail(email: string, password: string): Promise<void>;
    signUpWithEmail(email: string, password: string, displayName?: string): Promise<void>;
    sendEmailVerification(): Promise<void>;
    linkProvider(provider: AuthProvider): Promise<void>;
    unlinkProvider(provider: AuthProvider): Promise<void>;
    acceptMandatoryTerms(): Promise<void>;
    requestAccountDeletion(): Promise<void>;
    signOut(): Promise<void>;
};

const SessionStoreContext = createContext<SessionStoreValue | null>(null);

type Props = {
    children: React.ReactNode;
};

function getAuthErrorMessage(error: unknown, fallbackMessage: string) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (isNetworkLikeError(error)) {
        return '네트워크 연결이 불안정해 요청을 완료하지 못했어요. 연결이 돌아오면 다시 시도해 주세요.';
    }

    return fallbackMessage;
}

function buildPendingDeletionMessage(_profileSummary?: MobileProfileSummary | null) {
    return '계정 삭제가 요청되어 다시 로그인할 수 없어요. 데이터 삭제 처리 중입니다.';
}

export function SessionStoreProvider({ children }: Props) {
    const { authSessionAdapter, profileSummaryAdapter } = useAdapters();
    const [status, setStatus] = useState<SessionStatus>('booting');
    const [user, setUser] = useState<AuthSessionUser | null>(null);
    const [authProviders, setAuthProviders] = useState<AuthProvidersResponse | null>(null);
    const [profileSummary, setProfileSummary] = useState<MobileProfileSummary | null>(null);
    const [isSessionHydrating, setIsSessionHydrating] = useState(false);
    const [isProfileSummaryLoading, setIsProfileSummaryLoading] = useState(false);
    const [isAuthProvidersLoading, setIsAuthProvidersLoading] = useState(false);
    const [bootstrapError, setBootstrapError] = useState<string | null>(null);
    const [authActionError, setAuthActionError] = useState<string | null>(null);
    const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);
    const [lastSessionEvent, setLastSessionEvent] = useState<
        | 'bootstrap'
        | 'observe'
        | 'refresh'
        | 'refreshProviders'
        | 'updateProfilePhoto'
        | 'updateProfileDisplayName'
        | 'signIn'
        | 'sendEmailVerification'
        | 'linkProvider'
        | 'unlinkProvider'
        | 'acceptTerms'
        | 'requestDeletion'
        | 'signOut'
        | null
    >(null);
    const [lastSessionEventAt, setLastSessionEventAt] = useState<number | null>(null);
    const unsubscribeRef = useRef<() => void>(() => {});
    const isObserverAttachedRef = useRef(false);
    const profileRequestIdRef = useRef(0);
    const providerRequestIdRef = useRef(0);
    const activeSessionUidRef = useRef<string | null>(null);

    const markSessionEvent = useCallback((
        nextEvent:
            | 'bootstrap'
            | 'observe'
            | 'refresh'
            | 'refreshProviders'
            | 'updateProfilePhoto'
            | 'updateProfileDisplayName'
            | 'signIn'
            | 'sendEmailVerification'
            | 'linkProvider'
            | 'unlinkProvider'
            | 'acceptTerms'
            | 'requestDeletion'
            | 'signOut'
    ) => {
        setLastSessionEvent(nextEvent);
        setLastSessionEventAt(Date.now());
    }, []);

    const applySessionUser = useCallback((nextUser: AuthSessionUser | null) => {
        const nextUid = nextUser?.uid ?? null;
        const previousUid = activeSessionUidRef.current;

        if (previousUid !== nextUid) {
            resetTripWriteSync();
            if (previousUid) {
                clearTripListMemoryCache(previousUid);
                clearCachedTripsForUser(previousUid).catch((error) => {
                    if (__DEV__) {
                        console.warn('Failed to clear previous user trip cache', error);
                    }
                });
            }
            activeSessionUidRef.current = nextUid;
        }

        setUser((currentUser) => {
            if (!nextUser) {
                return null;
            }

            const inheritedProvider = currentUser?.uid === nextUser.uid
                ? currentUser.provider
                : null;

            return {
                ...nextUser,
                provider: nextUser.provider ?? inheritedProvider ?? null
            };
        });
        setStatus(nextUser ? 'signedIn' : 'signedOut');

        if (!nextUser) {
            providerRequestIdRef.current += 1;
            setAuthProviders(null);
            setIsAuthProvidersLoading(false);
        }
    }, []);

    const applyAuthProviders = useCallback((nextProviders: AuthProvidersResponse | null) => {
        setAuthProviders(nextProviders);

        if (!nextProviders) {
            return;
        }

        setUser((currentUser) => {
            if (!currentUser) {
                return currentUser;
            }

            return {
                ...currentUser,
                provider: nextProviders.currentSignInMethod ?? currentUser.provider ?? null
            };
        });
    }, []);

    const buildAuthFallbackSummary = useCallback((sessionUser: AuthSessionUser): MobileProfileSummary => ({
        uid: sessionUser.uid,
        displayName: sessionUser.displayName || sessionUser.email || 'PLIN User',
        email: sessionUser.email || '',
        photoURL: sessionUser.photoURL || null,
        role: 'user',
        emailVerificationExempt: false,
        agreedToTerms: null,
        agreedToPrivacy: null,
        agreedAt: null,
        accountStatus: 'active',
        deletionRequestedAt: null,
        purgeAfter: null,
        blockedUserIds: [],
        source: 'auth'
    }), []);

    const loadProfileSummary = useCallback(async (sessionUser: AuthSessionUser | null) => {
        const requestId = profileRequestIdRef.current + 1;
        profileRequestIdRef.current = requestId;

        if (!sessionUser) {
            setIsProfileSummaryLoading(false);
            setProfileSummary(null);
            return null;
        }

        setIsProfileSummaryLoading(true);

        try {
            const nextProfileSummary = await profileSummaryAdapter.getProfileSummary(sessionUser);
            if (profileRequestIdRef.current !== requestId) {
                return null;
            }

            setProfileSummary(nextProfileSummary);

            if (nextProfileSummary.source === 'profile') {
                void setCachedProfileSummary(nextProfileSummary).catch(() => {});
            }

            return nextProfileSummary;
        } catch (error) {
            console.warn('Failed to load profile summary', error);
            if (profileRequestIdRef.current !== requestId) {
                return null;
            }

            const cachedProfile = await getCachedProfileSummary(sessionUser.uid);
            if (cachedProfile) {
                setProfileSummary(cachedProfile);
                return cachedProfile;
            }

            const fallbackProfile = {
                ...buildAuthFallbackSummary(sessionUser)
            };
            setProfileSummary(fallbackProfile);
            return fallbackProfile;
        } finally {
            if (profileRequestIdRef.current === requestId) {
                setIsProfileSummaryLoading(false);
            }
        }
    }, [buildAuthFallbackSummary, profileSummaryAdapter]);

    const loadLinkedProviders = useCallback(async (sessionUser: AuthSessionUser | null) => {
        const requestId = providerRequestIdRef.current + 1;
        providerRequestIdRef.current = requestId;

        if (!sessionUser) {
            setIsAuthProvidersLoading(false);
            applyAuthProviders(null);
            return null;
        }

        setIsAuthProvidersLoading(true);

        try {
            const nextProviders = await authSessionAdapter.listLinkedProviders();
            if (providerRequestIdRef.current !== requestId) {
                return null;
            }

            applyAuthProviders(nextProviders);
            return nextProviders;
        } catch (error) {
            console.warn('Failed to load linked providers', error);
            if (providerRequestIdRef.current !== requestId) {
                return null;
            }

            applyAuthProviders(null);
            return null;
        } finally {
            if (providerRequestIdRef.current === requestId) {
                setIsAuthProvidersLoading(false);
            }
        }
    }, [applyAuthProviders, authSessionAdapter]);

    const enforcePendingDeletionGuard = useCallback(async (
        sessionUser: AuthSessionUser | null,
        nextProfileSummary: MobileProfileSummary | null,
        source: 'bootstrap' | 'observe' | 'refresh' | 'signIn'
    ) => {
        if (!sessionUser || nextProfileSummary?.accountStatus !== 'pending_deletion') {
            return false;
        }

        const nextMessage = buildPendingDeletionMessage(nextProfileSummary);

        try {
            await clearTripAnnouncementPushInstallation(sessionUser.uid).catch(() => {});
            await authSessionAdapter.signOut();
        } catch (error) {
            if (__DEV__) {
                console.warn('Failed to sign out pending deletion account', error);
            }
        } finally {
            profileRequestIdRef.current += 1;
            applySessionUser(null);
            setProfileSummary(null);
            setIsProfileSummaryLoading(false);
        }

        if (source === 'bootstrap' || source === 'refresh') {
            setBootstrapError(nextMessage);
            setAuthActionError(null);
        } else {
            setAuthActionError(nextMessage);
            setBootstrapError(null);
        }

        return true;
    }, [applySessionUser, authSessionAdapter]);

    const attachObserver = useCallback(() => {
        if (isObserverAttachedRef.current) {
            return;
        }

        unsubscribeRef.current = authSessionAdapter.observeSession((nextUser) => {
            applySessionUser(nextUser);
            setBootstrapError(null);
            setAuthActionError(null);
            markSessionEvent('observe');
            void (async () => {
                await loadLinkedProviders(nextUser);
                const nextProfileSummary = await loadProfileSummary(nextUser);
                await enforcePendingDeletionGuard(nextUser, nextProfileSummary, 'observe');
            })();
        });
        isObserverAttachedRef.current = true;
    }, [
        applySessionUser,
        authSessionAdapter,
        enforcePendingDeletionGuard,
        loadLinkedProviders,
        loadProfileSummary,
        markSessionEvent
    ]);

    const bootstrapSession = useCallback(async () => {
        setStatus('booting');
        setIsSessionHydrating(true);
        setBootstrapError(null);
        markSessionEvent('bootstrap');

        try {
            await authSessionAdapter.bootstrap();
            attachObserver();

            const currentUser = await authSessionAdapter.getCurrentSession();
            if (Platform.OS === 'web' && readMobileWebAuthInProgressProvider() === 'google') {
                clearPendingAuthReturnTo();
                clearMobileWebAuthInProgressProvider();
            }
            applySessionUser(currentUser);
            await loadLinkedProviders(currentUser);
            const nextProfileSummary = await loadProfileSummary(currentUser);
            if (await enforcePendingDeletionGuard(currentUser, nextProfileSummary, 'bootstrap')) {
                return;
            }
        } catch (error) {
            console.error('Failed to bootstrap session', error);
            if (Platform.OS === 'web' && readMobileWebAuthInProgressProvider() === 'google') {
                clearPendingAuthReturnTo();
                clearMobileWebAuthInProgressProvider();
            }
            applySessionUser(null);
            setProfileSummary(null);
            setIsProfileSummaryLoading(false);
            setBootstrapError(getAuthErrorMessage(
                error,
                '로그인 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
            ));
        } finally {
            setIsSessionHydrating(false);
        }
    }, [
        applySessionUser,
        attachObserver,
        authSessionAdapter,
        enforcePendingDeletionGuard,
        loadLinkedProviders,
        loadProfileSummary,
        markSessionEvent
    ]);

    useEffect(() => {
        bootstrapSession().catch(() => {});

        return () => {
            unsubscribeRef.current();
            unsubscribeRef.current = () => {};
            isObserverAttachedRef.current = false;
        };
    }, [bootstrapSession]);

    const syncAnnouncementPushInstallation = useCallback(async () => {
        if (Platform.OS === 'web' || !user) {
            return;
        }

        if (profileSummary?.agreedToTerms !== true || profileSummary?.accountStatus === 'pending_deletion') {
            return;
        }

        await syncTripAnnouncementPushInstallation(user.uid);
    }, [profileSummary?.accountStatus, profileSummary?.agreedToTerms, user]);

    useEffect(() => {
        void syncAnnouncementPushInstallation().catch((error) => {
            if (__DEV__) {
                console.warn('Failed to sync trip announcement push installation', error);
            }
        });
    }, [syncAnnouncementPushInstallation]);

    useForegroundResumeRefresh({
        enabled: Platform.OS !== 'web'
            && Boolean(user)
            && profileSummary?.agreedToTerms === true
            && profileSummary?.accountStatus !== 'pending_deletion',
        onRefresh: syncAnnouncementPushInstallation,
        throttleMs: 5000
    });

    const signIn = useCallback(async (provider: AuthProvider = 'google') => {
        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('signIn');

        if (Platform.OS === 'web') {
            storePendingAuthReturnTo();
            storeMobileWebAuthInProgressProvider(provider);
        }

        try {
            const nextUser = await authSessionAdapter.signIn(provider);
            attachObserver();
            applySessionUser(nextUser);
            await loadLinkedProviders(nextUser);
            const nextProfileSummary = await loadProfileSummary(nextUser);
            if (Platform.OS === 'web') {
                clearPendingAuthReturnTo();
            }
            if (await enforcePendingDeletionGuard(nextUser, nextProfileSummary, 'signIn')) {
                return;
            }
        } catch (error) {
            console.error('Failed to sign in', error);
            if (Platform.OS === 'web') {
                clearPendingAuthReturnTo();
            }
            setAuthActionError(getAuthErrorMessage(error, '로그인을 시작하지 못했어요.'));
            throw error;
        } finally {
            if (Platform.OS === 'web') {
                clearMobileWebAuthInProgressProvider();
            }
            setIsAuthActionLoading(false);
        }
    }, [
        applySessionUser,
        attachObserver,
        authSessionAdapter,
        enforcePendingDeletionGuard,
        loadLinkedProviders,
        loadProfileSummary,
        markSessionEvent
    ]);

    const signInWithEmail = useCallback(async (email: string, password: string) => {
        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('signIn');

        try {
            const nextUser = await authSessionAdapter.signInWithEmail(email, password);
            attachObserver();
            applySessionUser(nextUser);
            await loadLinkedProviders(nextUser);
            const nextProfileSummary = await loadProfileSummary(nextUser);
            if (await enforcePendingDeletionGuard(nextUser, nextProfileSummary, 'signIn')) {
                return;
            }
        } catch (error) {
            console.error('Failed to sign in with email', error);
            setAuthActionError(getAuthErrorMessage(error, '이메일 로그인을 시작하지 못했어요.'));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [
        applySessionUser,
        attachObserver,
        authSessionAdapter,
        enforcePendingDeletionGuard,
        loadLinkedProviders,
        loadProfileSummary,
        markSessionEvent
    ]);

    const signUpWithEmail = useCallback(async (
        email: string,
        password: string,
        displayName?: string
    ) => {
        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('signIn');

        try {
            const nextUser = await authSessionAdapter.signUpWithEmail(email, password, displayName);
            attachObserver();
            applySessionUser(nextUser);
            await loadLinkedProviders(nextUser);
            const nextProfileSummary = await loadProfileSummary(nextUser);
            if (await enforcePendingDeletionGuard(nextUser, nextProfileSummary, 'signIn')) {
                return;
            }
        } catch (error) {
            console.error('Failed to sign up with email', error);
            setAuthActionError(getAuthErrorMessage(error, '이메일 가입을 시작하지 못했어요.'));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [
        applySessionUser,
        attachObserver,
        authSessionAdapter,
        enforcePendingDeletionGuard,
        loadLinkedProviders,
        loadProfileSummary,
        markSessionEvent
    ]);

    const sendEmailVerification = useCallback(async () => {
        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('sendEmailVerification');

        try {
            await authSessionAdapter.sendEmailVerification();
        } catch (error) {
            console.error('Failed to send email verification', error);
            setAuthActionError(getAuthErrorMessage(
                error,
                '인증 메일을 보내지 못했어요.'
            ));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [authSessionAdapter, markSessionEvent]);

    const acceptMandatoryTerms = useCallback(async () => {
        if (!user) {
            return;
        }

        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('acceptTerms');

        try {
            await profileSummaryAdapter.acceptMandatoryTerms(user);
            await loadProfileSummary(user);
        } catch (error) {
            console.error('Failed to accept mandatory terms', error);
            setAuthActionError(getAuthErrorMessage(
                error,
                '약관 동의를 저장하지 못했어요.'
            ));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [loadProfileSummary, markSessionEvent, profileSummaryAdapter, user]);

    const refreshSession = useCallback(async () => {
        setBootstrapError(null);
        setAuthActionError(null);
        markSessionEvent('refresh');

        try {
            attachObserver();

            const currentUser = await authSessionAdapter.getCurrentSession();
            applySessionUser(currentUser);
            await loadLinkedProviders(currentUser);
            const nextProfileSummary = await loadProfileSummary(currentUser);
            if (await enforcePendingDeletionGuard(currentUser, nextProfileSummary, 'refresh')) {
                return null;
            }
            return currentUser;
        } catch (error) {
            console.error('Failed to refresh session', error);
            profileRequestIdRef.current += 1;
            applySessionUser(null);
            setProfileSummary(null);
            setIsProfileSummaryLoading(false);
            setBootstrapError(getAuthErrorMessage(
                error,
                '로그인 상태를 다시 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
            ));
            return null;
        }
    }, [
        applySessionUser,
        attachObserver,
        authSessionAdapter,
        enforcePendingDeletionGuard,
        loadLinkedProviders,
        loadProfileSummary,
        markSessionEvent
    ]);

    const refreshLinkedProviders = useCallback(async () => {
        setAuthActionError(null);
        markSessionEvent('refreshProviders');

        try {
            return await loadLinkedProviders(user);
        } catch (error) {
            console.error('Failed to refresh linked providers', error);
            setAuthActionError(getAuthErrorMessage(
                error,
                '연결된 로그인 상태를 다시 확인하지 못했어요.'
            ));
            return null;
        }
    }, [loadLinkedProviders, markSessionEvent, user]);

    const linkProvider = useCallback(async (provider: AuthProvider) => {
        const currentUser = user;
        if (!currentUser) {
            return;
        }

        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('linkProvider');

        try {
            const nextProviders = await authSessionAdapter.linkProvider(provider);
            applyAuthProviders(nextProviders);
            const refreshedUser = await authSessionAdapter.getCurrentSession();
            applySessionUser(refreshedUser || currentUser);
            await loadProfileSummary(refreshedUser || currentUser);
        } catch (error) {
            console.error('Failed to link provider', error);
            setAuthActionError(getAuthErrorMessage(
                error,
                '로그인 연결을 완료하지 못했어요.'
            ));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [
        applyAuthProviders,
        applySessionUser,
        authSessionAdapter,
        loadProfileSummary,
        markSessionEvent,
        user
    ]);

    const updateProfilePhoto = useCallback(async (photoURL: string) => {
        const currentUser = user;
        const nextPhotoURL = String(photoURL || '').trim();
        if (!currentUser || !nextPhotoURL) {
            throw new Error('프로필 사진을 저장할 계정을 찾지 못했어요.');
        }

        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('updateProfilePhoto');

        try {
            await profileSummaryAdapter.updateProfilePhoto(currentUser, nextPhotoURL);
            const nextUser = {
                ...currentUser,
                photoURL: nextPhotoURL
            };
            applySessionUser(nextUser);
            await loadProfileSummary(nextUser);
        } catch (error) {
            console.error('Failed to update profile photo', error);
            setAuthActionError(getAuthErrorMessage(
                error,
                '프로필 사진을 저장하지 못했어요.'
            ));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [
        applySessionUser,
        loadProfileSummary,
        markSessionEvent,
        profileSummaryAdapter,
        user
    ]);

    const updateProfileDisplayName = useCallback(async (displayName: string) => {
        const currentUser = user;
        const nextDisplayName = String(displayName || '').trim();
        if (!currentUser) {
            throw new Error('프로필 이름을 저장할 계정을 찾지 못했어요.');
        }
        if (!nextDisplayName) {
            throw new Error('프로필 이름을 비워 둘 수 없어요.');
        }

        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('updateProfileDisplayName');

        try {
            await profileSummaryAdapter.updateProfileDisplayName(currentUser, nextDisplayName);
            const nextUser = {
                ...currentUser,
                displayName: nextDisplayName
            };
            applySessionUser(nextUser);
            await loadProfileSummary(nextUser);
        } catch (error) {
            console.error('Failed to update profile display name', error);
            setAuthActionError(getAuthErrorMessage(
                error,
                '프로필 이름을 저장하지 못했어요.'
            ));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [
        applySessionUser,
        loadProfileSummary,
        markSessionEvent,
        profileSummaryAdapter,
        user
    ]);

    const unlinkProvider = useCallback(async (provider: AuthProvider) => {
        const currentUser = user;
        if (!currentUser) {
            return;
        }

        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('unlinkProvider');

        try {
            const nextProviders = await authSessionAdapter.unlinkProvider(provider);
            applyAuthProviders(nextProviders);
            const refreshedUser = await authSessionAdapter.getCurrentSession();
            applySessionUser(refreshedUser || currentUser);
            await loadProfileSummary(refreshedUser || currentUser);
        } catch (error) {
            console.error('Failed to unlink provider', error);
            setAuthActionError(getAuthErrorMessage(
                error,
                '로그인 연결을 해제하지 못했어요.'
            ));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [
        applyAuthProviders,
        applySessionUser,
        authSessionAdapter,
        loadProfileSummary,
        markSessionEvent,
        user
    ]);

    const requestAccountDeletion = useCallback(async () => {
        const currentUser = user;
        if (!currentUser) {
            return;
        }

        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('requestDeletion');

        try {
            await requestAccountDeletionRemote();
            await clearTripAnnouncementPushInstallation(currentUser.uid).catch(() => {});
            await authSessionAdapter.signOut();
            profileRequestIdRef.current += 1;
            providerRequestIdRef.current += 1;
            applySessionUser(null);
            setProfileSummary(null);
            setIsProfileSummaryLoading(false);
            applyAuthProviders(null);
            setAuthActionError(
                '계정과 관련 데이터 삭제가 완료됐어요.'
            );
            setBootstrapError(null);
        } catch (error) {
            console.error('Failed to request account deletion', error);
            setAuthActionError(getAuthErrorMessage(
                error,
                '계정 삭제를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'
            ));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [applyAuthProviders, applySessionUser, authSessionAdapter, markSessionEvent, user]);

    const signOut = useCallback(async () => {
        const currentUser = user;

        setAuthActionError(null);
        setIsAuthActionLoading(true);
        markSessionEvent('signOut');

        try {
            if (currentUser?.uid) {
                await clearTripAnnouncementPushInstallation(currentUser.uid).catch(() => {});
            }
            await authSessionAdapter.signOut();
            profileRequestIdRef.current += 1;
            providerRequestIdRef.current += 1;
            applySessionUser(null);
            setProfileSummary(null);
            setIsProfileSummaryLoading(false);
            applyAuthProviders(null);
        } catch (error) {
            console.error('Failed to sign out', error);
            setAuthActionError(getAuthErrorMessage(error, '로그아웃하지 못했어요.'));
            throw error;
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [applyAuthProviders, applySessionUser, authSessionAdapter, markSessionEvent, user]);

    const value = useMemo(() => ({
        status,
        user,
        authProviders,
        profileSummary,
        isSessionHydrating,
        isProfileSummaryLoading,
        isAuthProvidersLoading,
        bootstrapError,
        authActionError,
        isAuthActionLoading,
        lastSessionEvent,
        lastSessionEventAt,
        retryBootstrap: bootstrapSession,
        refreshSession,
        refreshLinkedProviders,
        updateProfilePhoto,
        updateProfileDisplayName,
        signIn,
        signInWithEmail,
        signUpWithEmail,
        sendEmailVerification,
        linkProvider,
        unlinkProvider,
        acceptMandatoryTerms,
        requestAccountDeletion,
        signOut
    }), [
        acceptMandatoryTerms,
        authProviders,
        authActionError,
        bootstrapError,
        bootstrapSession,
        isAuthProvidersLoading,
        isSessionHydrating,
        refreshSession,
        refreshLinkedProviders,
        isProfileSummaryLoading,
        isAuthActionLoading,
        linkProvider,
        lastSessionEvent,
        lastSessionEventAt,
        profileSummary,
        requestAccountDeletion,
        signIn,
        signInWithEmail,
        signUpWithEmail,
        sendEmailVerification,
        signOut,
        status,
        updateProfileDisplayName,
        updateProfilePhoto,
        unlinkProvider,
        user
    ]);

    return React.createElement(
        SessionStoreContext.Provider,
        { value },
        children
    );
}

export function useSessionStore() {
    const value = useContext(SessionStoreContext);

    if (!value) {
        throw new Error('SessionStoreProvider가 필요합니다.');
    }

    return value;
}
