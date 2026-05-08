import React from 'react';
import { Alert, Share } from 'react-native';

import { useAdapters } from '@/adapters/useAdapters';
import type {
    TripShareLinkRole,
    TripShareMode,
    TripShareResponse
} from '@/services/trip-share';
import type { MobileTripDetail } from '@/types/trip';

function getTripShareService() {
    return require('../../services/trip-share') as typeof import('../../services/trip-share');
}

type Options = {
    detail: MobileTripDetail | null;
    userId: string | null;
    canManageShare: boolean;
    canPublishCommunity: boolean;
    isOfflineMode: boolean;
    startInCommunityPublishFlow?: boolean;
    onRequestOpenShareSheet(): void;
    onRequestCloseShareSheet(): void;
    onConsumeStartInCommunityPublishFlow(): void;
    onNavigateCommunity(): void;
};

export function useTripDetailShareActions({
    detail,
    userId,
    canManageShare,
    canPublishCommunity,
    isOfflineMode,
    startInCommunityPublishFlow = false,
    onRequestOpenShareSheet,
    onRequestCloseShareSheet,
    onConsumeStartInCommunityPublishFlow,
    onNavigateCommunity
}: Options) {
    const { communityRepository } = useAdapters();
    const [isHeaderShareLoading, setHeaderShareLoading] = React.useState(false);
    const [tripShareInfo, setTripShareInfo] = React.useState<TripShareResponse | null>(null);
    const [tripShareRoleOverride, setTripShareRoleOverride] = React.useState<TripShareLinkRole | null>(null);
    const [isTripShareSheetLoading, setTripShareSheetLoading] = React.useState(false);
    const [tripShareError, setTripShareError] = React.useState<string | null>(null);
    const [tripShareBusyAction, setTripShareBusyAction] = React.useState<string | null>(null);
    const pendingTripShareRoleRef = React.useRef<TripShareLinkRole | null>(null);
    const hasOpenedCommunityPublishFlowRef = React.useRef(false);

    const canCloseTripShareSheet = !isTripShareSheetLoading && !tripShareBusyAction;

    const resolvedTripShareInfo = React.useMemo<TripShareResponse | null>(() => {
        if (!tripShareRoleOverride) {
            return tripShareInfo;
        }

        if (!tripShareInfo) {
            return {
                permissions: {
                    role: detail?.permissions.role || '',
                    canManageShare,
                    canManageMembers: detail?.permissions.role === 'owner',
                    canSendAnnouncement: detail?.permissions.canSendAnnouncement === true
                },
                members: [],
                shareLink: {
                    mode: 'link',
                    role: tripShareRoleOverride,
                    url: '',
                    active: true
                }
            };
        }

        return {
            ...tripShareInfo,
            shareLink: {
                ...tripShareInfo.shareLink,
                mode: 'link',
                role: tripShareRoleOverride,
                active: true
            }
        };
    }, [
        canManageShare,
        detail?.permissions.canSendAnnouncement,
        detail?.permissions.role,
        tripShareInfo,
        tripShareRoleOverride
    ]);

    const resetTripShareSheetState = React.useCallback(() => {
        setTripShareInfo(null);
        setTripShareRoleOverride(null);
        setTripShareSheetLoading(false);
        setTripShareError(null);
        setTripShareBusyAction(null);
        setHeaderShareLoading(false);
        pendingTripShareRoleRef.current = null;
    }, []);

    const performTripLinkShare = React.useCallback(async (role: TripShareLinkRole, shareLink: string) => {
        if (!detail) {
            return;
        }

        try {
            const { buildTripShareMessage } = getTripShareService();
            const result = await Share.share({
                title: detail.title,
                message: buildTripShareMessage(detail.title, shareLink, role)
            });

            if (result.action === Share.dismissedAction) {
                Alert.alert(
                    '공유 창을 닫았어요',
                    '일부 공유 옵션은 기기나 환경에 따라 다르게 보일 수 있어요.'
                );
            }
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : '공유 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.';
            Alert.alert('공유 실패', message);
        }
    }, [detail]);

    const runTripShareMutation = React.useCallback(async (
        busyAction: string,
        task: () => Promise<TripShareResponse>,
        optimisticUpdate?: (current: TripShareResponse | null) => TripShareResponse | null
    ) => {
        const previousInfo = tripShareInfo;

        setTripShareBusyAction(busyAction);
        setTripShareError(null);
        if (optimisticUpdate) {
            setTripShareInfo((current) => optimisticUpdate(current));
        }

        try {
            const nextInfo = await task();
            setTripShareInfo(nextInfo);
        } catch (error) {
            setTripShareInfo(previousInfo);
            const message = error instanceof Error
                ? error.message
                : '공유 설정을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.';
            setTripShareError(message);
            Alert.alert('공유 설정 실패', message);
        } finally {
            setTripShareBusyAction(null);
        }
    }, [tripShareInfo]);

    const handleOpenTripShareSheet = React.useCallback(() => {
        if (!detail || !userId || !canManageShare || isHeaderShareLoading || isOfflineMode) {
            return;
        }

        void (async () => {
            try {
                const { fetchTripShareInfo } = getTripShareService();
                setHeaderShareLoading(true);
                onRequestOpenShareSheet();
                setTripShareError(null);
                setTripShareSheetLoading(true);
                setTripShareInfo(await fetchTripShareInfo(detail.id));
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : '공유 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
                setTripShareError(message);
                Alert.alert('공유 설정 실패', message);
            } finally {
                setTripShareSheetLoading(false);
                setHeaderShareLoading(false);
            }
        })();
    }, [canManageShare, detail, isHeaderShareLoading, isOfflineMode, onRequestOpenShareSheet, userId]);

    const closeTripShareSheet = React.useCallback(() => {
        if (!canCloseTripShareSheet) {
            return;
        }

        onRequestCloseShareSheet();
        resetTripShareSheetState();
    }, [canCloseTripShareSheet, onRequestCloseShareSheet, resetTripShareSheetState]);

    React.useEffect(() => {
        hasOpenedCommunityPublishFlowRef.current = false;
    }, [detail?.id]);

    React.useEffect(() => {
        if (!startInCommunityPublishFlow || hasOpenedCommunityPublishFlowRef.current) {
            return;
        }

        if (!detail || !userId || !canManageShare || isHeaderShareLoading || isOfflineMode) {
            return;
        }

        hasOpenedCommunityPublishFlowRef.current = true;
        onConsumeStartInCommunityPublishFlow();
        handleOpenTripShareSheet();
    }, [
        canManageShare,
        detail,
        handleOpenTripShareSheet,
        isHeaderShareLoading,
        isOfflineMode,
        onConsumeStartInCommunityPublishFlow,
        startInCommunityPublishFlow,
        userId
    ]);

    const handleShareTripLink = React.useCallback(() => {
        if (!detail || !resolvedTripShareInfo) {
            return;
        }

        const shareLink = resolvedTripShareInfo.shareLink.url;
        const role = resolvedTripShareInfo.shareLink.role;

        if (!shareLink) {
            const message = '아직 공유 링크가 준비되지 않았어요.';
            setTripShareError(message);
            Alert.alert('공유 링크 없음', message);
            return;
        }

        void performTripLinkShare(role, shareLink);
    }, [detail, performTripLinkShare, resolvedTripShareInfo]);

    const executeCommunityPublish = React.useCallback(async () => {
        if (!detail || !userId || !canPublishCommunity || tripShareBusyAction) {
            return;
        }

        // Community publish currently belongs to share sheet flow.
        setTripShareBusyAction('community-publish');
        setTripShareError(null);

        try {
            await communityRepository.publishTrip(userId, detail);
            onRequestCloseShareSheet();
            resetTripShareSheetState();
            Alert.alert(
                '업로드 완료',
                '커뮤니티에 성공적으로 게시했어요.',
                [
                    {
                        text: '커뮤니티 보기',
                        onPress: onNavigateCommunity
                    }
                ]
            );
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : '커뮤니티에 게시하지 못했어요. 잠시 후 다시 시도해 주세요.';
            setTripShareError(message);
            setTripShareBusyAction(null);
            Alert.alert('업로드 실패', message);
        }
    }, [
        canPublishCommunity,
        communityRepository,
        detail,
        onNavigateCommunity,
        onRequestCloseShareSheet,
        resetTripShareSheetState,
        tripShareBusyAction,
        userId
    ]);

    const handlePublishTripToCommunity = React.useCallback(() => {
        if (!detail || !userId || tripShareBusyAction) {
            return;
        }

        if (!canPublishCommunity) {
            const message = '이 여행은 커뮤니티 게시 권한이 없어요.';
            setTripShareError(message);
            Alert.alert('업로드 불가', message);
            return;
        }

        Alert.alert(
            '커뮤니티에 자랑하기',
            '장소와 경로 정보 위주로 공개 포스트를 만들어요.\n상세 메모, 지출, 사진 같은 개인 정보는 제외됩니다.\n\n민감한 정보가 없는지 한 번 더 확인해 주세요.',
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '업로드',
                    onPress: () => {
                        void executeCommunityPublish();
                    }
                }
            ]
        );
    }, [canPublishCommunity, detail, executeCommunityPublish, tripShareBusyAction, userId]);

    const handleSetShareRole = React.useCallback((role: TripShareLinkRole) => {
        if (!detail || tripShareBusyAction) {
            return;
        }

        setTripShareRoleOverride(role);
        pendingTripShareRoleRef.current = role;

        void (async () => {
            setTripShareBusyAction('share-role');
            setTripShareError(null);
            setTripShareInfo((current) => current ? {
                ...current,
                shareLink: {
                    ...current.shareLink,
                    mode: 'link',
                    role,
                    active: true
                }
            } : current);

            try {
                const { fetchTripShareInfo, updateTripShareInfo } = getTripShareService();
                await updateTripShareInfo(detail.id, {
                    shareLink: {
                        mode: 'link',
                        role
                    }
                });

                const nextInfo = await fetchTripShareInfo(detail.id);
                setTripShareInfo(nextInfo);
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : '공유 설정을 변경하지 못했어요. 잠시 후 다시 시도해 주세요.';
                setTripShareError(message);
                setTripShareRoleOverride(null);
                Alert.alert('공유 설정 실패', message);
            } finally {
                pendingTripShareRoleRef.current = null;
                setTripShareBusyAction(null);
            }
        })();
    }, [detail, tripShareBusyAction]);

    React.useEffect(() => {
        if (!tripShareRoleOverride) {
            return;
        }

        if (tripShareError) {
            setTripShareRoleOverride(null);
            return;
        }

        if (tripShareInfo?.shareLink.role === tripShareRoleOverride) {
            setTripShareRoleOverride(null);
        }
    }, [tripShareError, tripShareInfo?.shareLink.role, tripShareRoleOverride]);

    const handleSetShareMode = React.useCallback((mode: TripShareMode) => {
        if (!detail || tripShareBusyAction) {
            return;
        }

        void runTripShareMutation('share-mode', () => (
            getTripShareService().updateTripShareInfo(detail.id, {
                shareLink: {
                    mode
                }
            })
        ));
    }, [detail, runTripShareMutation, tripShareBusyAction]);

    const handleChangeShareMemberRole = React.useCallback((
        memberUid: string,
        role: 'editor' | 'member'
    ) => {
        if (!detail || tripShareBusyAction) {
            return;
        }

        void runTripShareMutation('member-role', () => (
            getTripShareService().updateTripMemberRole(detail.id, memberUid, role)
        ));
    }, [detail, runTripShareMutation, tripShareBusyAction]);

    const handleRemoveShareMember = React.useCallback((memberUid: string) => {
        if (!detail || tripShareBusyAction) {
            return;
        }

        const member = tripShareInfo?.members.find((entry) => entry.uid === memberUid);
        const memberLabel = member?.displayName || member?.email || '이 멤버';

        Alert.alert(
            '멤버를 제거할까요?',
            `${memberLabel} 님의 여행 접근 권한을 제거할까요?`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '제거',
                    style: 'destructive',
                    onPress: () => {
                        void runTripShareMutation('member-remove', () => (
                            getTripShareService().removeTripMember(detail.id, memberUid)
                        ));
                    }
                }
            ]
        );
    }, [detail, runTripShareMutation, tripShareBusyAction, tripShareInfo]);

    const handleTransferShareOwnership = React.useCallback((memberUid: string) => {
        if (!detail || tripShareBusyAction) {
            return;
        }

        const member = tripShareInfo?.members.find((entry) => entry.uid === memberUid);
        const memberLabel = member?.displayName || member?.email || '이 멤버';

        Alert.alert(
            '소유권을 넘길까요?',
            `${memberLabel} 님에게 이 여행의 소유권을 넘겨요. 넘긴 뒤에도 편집 멤버로 계속 참여할 수 있어요.`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '넘기기',
                    onPress: () => {
                        void runTripShareMutation('owner-transfer', () => (
                            getTripShareService().transferTripOwnership(detail.id, memberUid)
                        ));
                    }
                }
            ]
        );
    }, [detail, runTripShareMutation, tripShareBusyAction, tripShareInfo]);

    return {
        isHeaderShareLoading,
        tripShareInfo,
        resolvedTripShareInfo,
        isTripShareSheetLoading,
        tripShareError,
        tripShareBusyAction,
        canCloseTripShareSheet,
        handleOpenTripShareSheet,
        closeTripShareSheet,
        handleShareTripLink,
        handlePublishTripToCommunity,
        handleSetShareRole,
        handleSetShareMode,
        handleChangeShareMemberRole,
        handleRemoveShareMember,
        handleTransferShareOwnership
    };
}
