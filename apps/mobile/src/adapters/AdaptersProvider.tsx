import React, { createContext, useMemo } from 'react';

import {
    FirebaseAuthSessionAdapter,
} from '@/adapters/auth/FirebaseAuthSessionAdapter';
import { MockAuthSessionAdapter } from '@/adapters/auth/MockAuthSessionAdapter';
import { FirebaseCommunityRepository } from '@/adapters/community/FirebaseCommunityRepository';
import { MockCommunityRepository } from '@/adapters/community/MockCommunityRepository';
import type { CommunityRepository } from '@/adapters/community/CommunityRepository';
import { FirebaseProfileSummaryAdapter } from '@/adapters/profile/FirebaseProfileSummaryAdapter';
import { MockProfileSummaryAdapter } from '@/adapters/profile/MockProfileSummaryAdapter';
import type { ProfileSummaryAdapter } from '@/adapters/profile/ProfileSummaryAdapter';
import {
    FirebaseTripRepository,
} from '@/adapters/trips/FirebaseTripRepository';
import type { AuthSessionAdapter } from '@/adapters/auth/AuthSessionAdapter';
import type { TripRepository } from '@/adapters/trips/TripRepository';
import { getMobileAdapterModes } from '@/config/mobile-runtime-config';

export type AdaptersContextValue = {
    authSessionAdapter: AuthSessionAdapter;
    profileSummaryAdapter: ProfileSummaryAdapter;
    tripRepository: TripRepository;
    communityRepository: CommunityRepository;
    authMode: 'real' | 'mock';
    communityRepositoryMode: 'real' | 'mock';
    authModeNotice: string | null;
    communityRepositoryModeNotice: string | null;
};

export const AdaptersContext = createContext<AdaptersContextValue | null>(null);

type Props = {
    children: React.ReactNode;
};

export function AdaptersProvider({ children }: Props) {
    const value = useMemo<AdaptersContextValue>(() => {
        const modes = getMobileAdapterModes();

        return {
            authSessionAdapter: modes.authMode === 'real'
                ? new FirebaseAuthSessionAdapter()
                : new MockAuthSessionAdapter(),
            profileSummaryAdapter: modes.firebase.isReady
                ? new FirebaseProfileSummaryAdapter()
                : new MockProfileSummaryAdapter(),
            tripRepository: new FirebaseTripRepository(),
            communityRepository: modes.firebase.isReady
                ? new FirebaseCommunityRepository()
                : new MockCommunityRepository(),
            authMode: modes.authMode,
            communityRepositoryMode: modes.firebase.isReady ? 'real' : 'mock',
            authModeNotice: modes.authModeNotice,
            communityRepositoryModeNotice: modes.firebase.isReady
                ? null
                : '플랜을 불러오지 못해 예시를 보여주고 있어요.'
        };
    }, []);

    return (
        <AdaptersContext.Provider value={value}>
            {children}
        </AdaptersContext.Provider>
    );
}
