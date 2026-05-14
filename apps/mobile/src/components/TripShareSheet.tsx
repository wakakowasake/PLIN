import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
    Animated,
    Easing,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
    TripShareLinkRole,
    TripShareManagedRole,
    TripShareMember,
    TripShareMode,
    TripShareResponse
} from '@/services/trip-share';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import { SheetBackButton } from './SheetBackButton';

type Props = {
    visible: boolean;
    tripTitle: string;
    shareInfo: TripShareResponse | null;
    canPublishCommunity?: boolean;
    loading?: boolean;
    error?: string | null;
    busyAction?: string | null;
    actionDisabled?: boolean;
    onClose(): void;
    onShareLink(): void;
    onPublishCommunity?(): void;
    onSetMode(mode: TripShareMode): void;
    onSetRole(role: TripShareLinkRole): void;
    onChangeMemberRole(memberUid: string, role: Exclude<TripShareManagedRole, 'owner' | 'viewer'>): void;
    onRemoveMember(memberUid: string): void;
    onTransferOwnership(memberUid: string): void;
};

const SHARE_MODE_OPTIONS = [
    { key: 'private', label: '비공개' },
    { key: 'link', label: '링크 공유' }
] as const;

function roleLabel(role: TripShareManagedRole) {
    if (role === 'owner') {
        return '소유자';
    }

    if (role === 'editor') {
        return '편집 가능';
    }

    if (role === 'member') {
        return '멤버';
    }

    return '보기 전용';
}

function shareRoleLabel(role: TripShareLinkRole) {
    if (role === 'editor') {
        return '편집';
    }

    if (role === 'member') {
        return '멤버';
    }

    return '뷰어';
}

function shareRoleHint(role: TripShareLinkRole) {
    if (role === 'viewer') {
        return '링크만 있으면 로그인 없이 볼 수 있는 공개 보기 링크예요.';
    }

    if (role === 'member') {
        return '로그인한 뒤 읽기 전용 멤버로 여행에 참여해요.';
    }

    return '로그인한 뒤 편집 멤버로 여행에 참여해요.';
}

function buildMemberInitial(member: TripShareMember) {
    const base = String(member.displayName || member.email || '멤버').trim();
    return base.slice(0, 1).toUpperCase() || 'M';
}

function MemberRow({
    member,
    busy,
    canManageMembers,
    onChangeRole,
    onRemove,
    onTransferOwnership,
    styles,
    theme
}: {
    member: TripShareMember;
    busy: boolean;
    canManageMembers: boolean;
    onChangeRole(memberUid: string, role: Exclude<TripShareManagedRole, 'owner' | 'viewer'>): void;
    onRemove(memberUid: string): void;
    onTransferOwnership(memberUid: string): void;
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
}) {
    const isOwner = member.role === 'owner';

    return (
        <View style={styles.memberCard}>
            <View style={styles.memberHeaderRow}>
                <View style={styles.memberIdentityRow}>
                    <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>{buildMemberInitial(member)}</Text>
                    </View>
                    <View style={styles.memberCopy}>
                        <Text numberOfLines={1} style={styles.memberName}>
                            {member.displayName || '멤버'}
                            {member.isSelf ? ' (나)' : ''}
                        </Text>
                        <Text numberOfLines={1} style={styles.memberEmail}>
                            {member.email || '이메일 정보 없음'}
                        </Text>
                    </View>
                </View>
                <View style={styles.memberRolePill}>
                    <Text style={styles.memberRolePillText}>{roleLabel(member.role)}</Text>
                </View>
            </View>

            {isOwner || !canManageMembers ? null : (
                <View style={styles.memberActionsRow}>
                    {(['editor', 'member'] as const).map((targetRole) => {
                        const selected = member.role === targetRole;

                        return (
                            <Pressable
                                key={targetRole}
                                accessibilityRole="button"
                                disabled={busy}
                                onPress={() => {
                                    onChangeRole(member.uid, targetRole);
                                }}
                                style={({ pressed }) => [
                                    styles.memberActionChip,
                                    selected ? styles.memberActionChipActive : null,
                                    pressed && !busy ? styles.buttonPressed : null
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.memberActionChipText,
                                        selected ? styles.memberActionChipTextActive : null
                                    ]}
                                >
                                    {targetRole === 'editor' ? '편집 가능' : '멤버'}
                                </Text>
                            </Pressable>
                        );
                    })}
                    <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => {
                            onTransferOwnership(member.uid);
                        }}
                        style={({ pressed }) => [
                            styles.memberTransferButton,
                            pressed && !busy ? styles.buttonPressed : null
                        ]}
                    >
                        <MaterialCommunityIcons
                            name="crown-outline"
                            size={16}
                            color={theme.colors.accent}
                        />
                        <Text style={styles.memberTransferButtonText}>소유자 넘기기</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        onPress={() => {
                            onRemove(member.uid);
                        }}
                        style={({ pressed }) => [
                            styles.memberRemoveButton,
                            pressed && !busy ? styles.buttonPressed : null
                        ]}
                    >
                        <MaterialCommunityIcons
                            name="account-remove-outline"
                            size={16}
                            color={theme.colors.warning}
                        />
                        <Text style={styles.memberRemoveButtonText}>제거</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

export function TripShareSheet({
    visible,
    tripTitle,
    shareInfo,
    canPublishCommunity = false,
    loading = false,
    error = null,
    busyAction = null,
    actionDisabled = false,
    onClose,
    onShareLink,
    onPublishCommunity,
    onSetMode,
    onSetRole,
    onChangeMemberRole,
    onRemoveMember,
    onTransferOwnership
}: Props) {
    const theme = useAppTheme();
    const insets = useSafeAreaInsets();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const sheetInsetStyle = React.useMemo(() => ({
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.md
    }), [insets.bottom, insets.top, theme.spacing.md, theme.spacing.sm]);
    const isBusy = loading || Boolean(busyAction);
    const isInteractionDisabled = isBusy || actionDisabled;
    const showCommunityPublishSection = Boolean(onPublishCommunity);
    const shareMode = shareInfo?.shareLink.mode || 'private';
    const shareRole = shareInfo?.shareLink.role || 'viewer';
    const shareLink = String(shareInfo?.shareLink.url || '').trim();
    const canManageMembers = shareInfo?.permissions.canManageMembers === true;
    const members = shareInfo?.members || [];
    const [displayShareMode, setDisplayShareMode] = React.useState<TripShareMode>(shareMode);
    const [segmentedRowWidth, setSegmentedRowWidth] = React.useState(0);
    const [linkContentHeight, setLinkContentHeight] = React.useState(0);
    const segmentedModeProgress = React.useRef(new Animated.Value(shareMode === 'link' ? 1 : 0)).current;
    const linkContentProgress = React.useRef(new Animated.Value(shareMode === 'link' ? 1 : 0)).current;
    const segmentedIndicatorWidth = React.useMemo(() => {
        const availableWidth = segmentedRowWidth - (theme.spacing.micro * 2) - theme.spacing.micro;
        if (availableWidth <= 0) {
            return 0;
        }

        return availableWidth / SHARE_MODE_OPTIONS.length;
    }, [segmentedRowWidth, theme.spacing.micro]);
    const segmentedIndicatorTranslateX = React.useMemo(() => (
        segmentedModeProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, segmentedIndicatorWidth + theme.spacing.micro]
        })
    ), [segmentedIndicatorWidth, segmentedModeProgress, theme.spacing.micro]);
    const linkContentTranslateY = React.useMemo(() => (
        linkContentProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-10, 0]
        })
    ), [linkContentProgress]);
    const linkContentOpacity = React.useMemo(() => (
        linkContentProgress.interpolate({
            inputRange: [0, 0.25, 1],
            outputRange: [0, 0.16, 1]
        })
    ), [linkContentProgress]);
    const linkContentAnimatedStyle = React.useMemo(() => {
        const style: {
            height?: number | Animated.AnimatedInterpolation<string | number>;
            opacity: Animated.AnimatedInterpolation<string | number>;
            transform: { translateY: Animated.AnimatedInterpolation<string | number> }[];
        } = {
            opacity: linkContentOpacity,
            transform: [{ translateY: linkContentTranslateY }]
        };

        if (linkContentHeight > 0) {
            style.height = linkContentProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, linkContentHeight]
            });
        } else if (displayShareMode !== 'link') {
            style.height = 0;
        }

        return style;
    }, [
        displayShareMode,
        linkContentHeight,
        linkContentOpacity,
        linkContentProgress,
        linkContentTranslateY
    ]);
    const handleLinkContentLayout = React.useCallback((nextHeight: number) => {
        const resolvedHeight = Math.ceil(nextHeight);
        if (resolvedHeight <= 0) {
            return;
        }

        setLinkContentHeight((currentHeight) => (
            currentHeight === resolvedHeight ? currentHeight : resolvedHeight
        ));
    }, []);
    const renderLinkContent = React.useCallback(() => (
        <View
            onLayout={({ nativeEvent }) => {
                handleLinkContentLayout(nativeEvent.layout.height);
            }}
            style={styles.linkContentInner}
        >
            <View style={styles.roleToggleRow}>
                {(['editor', 'member', 'viewer'] as const).map((role) => {
                    const selected = shareRole === role;

                    return (
                        <Pressable
                            key={role}
                            accessibilityRole="button"
                            disabled={isInteractionDisabled}
                            onPress={() => {
                                onSetRole(role);
                            }}
                            style={({ pressed }) => [
                                styles.modeChip,
                                selected ? styles.modeChipActive : null,
                                pressed && !isInteractionDisabled ? styles.buttonPressed : null
                            ]}
                        >
                            <Text
                                style={[
                                    styles.modeChipText,
                                    selected ? styles.modeChipTextActive : null
                                ]}
                            >
                                {shareRoleLabel(role)}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <Text style={styles.roleHintText}>
                {shareRoleHint(shareRole)}
            </Text>

            <View style={styles.inlineActionRow}>
                <Pressable
                    accessibilityRole="button"
                    disabled={isInteractionDisabled || !shareLink}
                    onPress={onShareLink}
                    style={({ pressed }) => [
                        styles.primaryActionButton,
                        styles.primaryActionButtonWide,
                        (isInteractionDisabled || !shareLink) ? styles.primaryActionButtonDisabled : null,
                        pressed && !isInteractionDisabled && Boolean(shareLink) ? styles.buttonPressed : null
                    ]}
                >
                    <View style={styles.primaryActionButtonContent}>
                        <MaterialCommunityIcons
                            name="share-variant-outline"
                            size={18}
                            color="#ffffff"
                        />
                        <Text style={styles.primaryActionButtonText}>링크 공유하기</Text>
                    </View>
                </Pressable>
            </View>
        </View>
    ), [
        handleLinkContentLayout,
        isInteractionDisabled,
        onSetRole,
        onShareLink,
        shareLink,
        shareRole,
        styles
    ]);

    React.useEffect(() => {
        if (!isBusy) {
            setDisplayShareMode(shareMode);
        }
    }, [isBusy, shareMode]);

    React.useEffect(() => {
        Animated.spring(segmentedModeProgress, {
            toValue: displayShareMode === 'link' ? 1 : 0,
            damping: 18,
            mass: 0.9,
            stiffness: 220,
            useNativeDriver: true
        }).start();

        Animated.timing(linkContentProgress, {
            toValue: displayShareMode === 'link' ? 1 : 0,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false
        }).start();
    }, [displayShareMode, linkContentProgress, segmentedModeProgress]);

    return (
        <Modal
            animationType="fade"
            transparent
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                        if (!isBusy) {
                            onClose();
                        }
                    }}
                    style={StyleSheet.absoluteFill}
                />
                <View
                    style={[
                        styles.sheet,
                        sheetInsetStyle
                    ]}
                    >
                        <View style={styles.handle} />
                        <View style={styles.headerRow}>
                            <SheetBackButton disabled={isBusy} onPress={onClose} />
                            <View style={styles.headerCopy}>
                                <Text numberOfLines={1} style={styles.title}>여행 공유</Text>
                            </View>
                        </View>

                    <ScrollView
                        style={styles.scrollArea}
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.sectionCard}>
                            <Text style={styles.sectionEyebrow}>링크 공유</Text>
                            <Text style={styles.sectionTitle}>공유 링크</Text>
                            <Text style={styles.sectionHint}>
                                비공개로 둘지, 링크로 공유할지 정하고 링크 권한도 함께 선택할 수 있어요.
                            </Text>

                            <View
                                onLayout={({ nativeEvent }) => {
                                    setSegmentedRowWidth(nativeEvent.layout.width);
                                }}
                                style={styles.segmentedRow}
                            >
                                {segmentedIndicatorWidth > 0 ? (
                                    <Animated.View
                                        pointerEvents="none"
                                        style={[
                                            styles.segmentedIndicator,
                                            {
                                                width: segmentedIndicatorWidth,
                                                transform: [{ translateX: segmentedIndicatorTranslateX }]
                                            }
                                        ]}
                                    />
                                ) : null}
                                {SHARE_MODE_OPTIONS.map((option) => {
                                    const selected = displayShareMode === option.key;

                                    return (
                                        <Pressable
                                            key={option.key}
                                            accessibilityRole="button"
                                            disabled={isInteractionDisabled}
                                            onPress={() => {
                                                if (displayShareMode !== option.key) {
                                                    setDisplayShareMode(option.key);
                                                }

                                                if (shareMode !== option.key) {
                                                    onSetMode(option.key);
                                                }
                                            }}
                                            style={({ pressed }) => [
                                                styles.segmentedButton,
                                                pressed && !isInteractionDisabled ? styles.buttonPressed : null
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.segmentedButtonText,
                                                    selected ? styles.segmentedButtonTextActive : null
                                                ]}
                                            >
                                                {option.label}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {linkContentHeight === 0 ? (
                                <View pointerEvents="none" style={styles.linkContentMeasure}>
                                    {renderLinkContent()}
                                </View>
                            ) : null}

                            <Animated.View
                                pointerEvents={displayShareMode === 'link' ? 'auto' : 'none'}
                                style={[
                                    styles.linkContentWrap,
                                    linkContentAnimatedStyle
                                ]}
                            >
                                {renderLinkContent()}
                            </Animated.View>
                        </View>

                        <View style={styles.sectionCard}>
                            <Text style={styles.sectionEyebrow}>함께하는 멤버</Text>
                            <Text style={styles.sectionTitle}>멤버</Text>
                            <Text style={styles.sectionHint}>
                                {canManageMembers
                                    ? '소유자는 멤버 권한을 바꾸거나 접근 권한을 제거할 수 있어요.'
                                    : '참여 중인 멤버를 확인할 수 있어요.'}
                            </Text>

                            <View style={styles.memberList}>
                                {members.length > 0
                                    ? members.map((member) => (
                                        <MemberRow
                                            key={member.uid}
                                            member={member}
                                            busy={isInteractionDisabled}
                                            canManageMembers={canManageMembers}
                                            onChangeRole={onChangeMemberRole}
                                            onRemove={onRemoveMember}
                                            onTransferOwnership={onTransferOwnership}
                                            styles={styles}
                                            theme={theme}
                                        />
                                    ))
                                    : (
                                        <View style={styles.emptyState}>
                                            <Text style={styles.emptyStateText}>
                                                협업 멤버를 불러오는 중이에요.
                                            </Text>
                                        </View>
                                    )}
                            </View>
                        </View>

                        {showCommunityPublishSection ? (
                            <View style={styles.sectionCard}>
                                <Text style={styles.sectionEyebrow}>커뮤니티 공개</Text>
                                <Text style={styles.sectionTitle}>커뮤니티 업로드</Text>
                                <Text style={styles.sectionHint}>
                                    PLIN이 큐레이션한 여행 플랜만 공개 공간에 올릴 수 있어요.
                                </Text>

                                <View style={styles.communityNoticeCard}>
                                    <View style={styles.communityNoticeIconWrap}>
                                        <MaterialCommunityIcons
                                            name="shield-check-outline"
                                            size={18}
                                            color={theme.colors.accent}
                                        />
                                    </View>
                                    <View style={styles.communityNoticeCopy}>
                                        <Text style={styles.communityNoticeTitle}>개인 정보 보호 안내</Text>
                                        <Text style={styles.communityNoticeText}>
                                            장소와 경로 정보 위주로 공개되고, 상세 메모·지출·사진 같은 개인 정보는 제외돼요.
                                        </Text>
                                    </View>
                                </View>

                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isInteractionDisabled || !canPublishCommunity}
                                    onPress={onPublishCommunity}
                                    style={({ pressed }) => [
                                        styles.primaryActionButton,
                                        styles.primaryActionButtonWide,
                                        (isInteractionDisabled || !canPublishCommunity) ? styles.primaryActionButtonDisabled : null,
                                        pressed && !isInteractionDisabled && canPublishCommunity ? styles.buttonPressed : null
                                    ]}
                                >
                                    <View style={styles.primaryActionButtonContent}>
                                        <MaterialCommunityIcons
                                            name="rocket-launch-outline"
                                            size={18}
                                            color="#ffffff"
                                        />
                                        <Text style={styles.primaryActionButtonText}>
                                            {busyAction === 'community-publish' ? '업로드 중...' : '큐레이션에 올리기'}
                                        </Text>
                                    </View>
                                </Pressable>

                                <Text style={styles.communityCaption}>
                                    공개 포스트는 개인 계획과 별도의 발행본으로 저장돼요. 민감한 정보가 없는지 한 번 더 확인해 주세요.
                                </Text>
                            </View>
                        ) : null}

                        {error ? (
                            <Text style={styles.errorText}>{error}</Text>
                        ) : null}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => {
    const segmentedControlRadius = theme.radius.md;

    return StyleSheet.create({
        overlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.38)',
        justifyContent: 'flex-end'
        },
        sheet: {
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        backgroundColor: theme.colors.background,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm
        },
        handle: {
        alignSelf: 'center',
        width: 48,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border,
        marginBottom: theme.spacing.sm
        },
        headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
        },
        headerCopy: {
        flex: 1,
        justifyContent: 'center',
        minHeight: theme.spacing.xl
        },
        title: {
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '800',
        color: theme.colors.textPrimary
        },
        scrollArea: {
        marginTop: theme.spacing.md
        },
        scrollContent: {
        gap: theme.spacing.sm,
        paddingBottom: theme.spacing.sm
        },
        sectionCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.xs
        },
        sectionEyebrow: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        color: theme.colors.textSecondary
        },
        sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: theme.colors.textPrimary
        },
        sectionHint: {
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.textSecondary
        },
        segmentedRow: {
        position: 'relative',
        flexDirection: 'row',
        gap: theme.spacing.micro,
        padding: theme.spacing.micro,
        borderRadius: segmentedControlRadius,
        backgroundColor: theme.colors.surfaceMuted,
        overflow: 'hidden'
        },
        segmentedIndicator: {
        position: 'absolute',
        top: theme.spacing.micro,
        bottom: theme.spacing.micro,
        left: theme.spacing.micro,
        borderRadius: segmentedControlRadius,
        backgroundColor: theme.colors.accent
        },
        segmentedButton: {
        flex: 1,
        minHeight: 44,
        borderRadius: segmentedControlRadius,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1
        },
        segmentedButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.textSecondary
        },
        segmentedButtonTextActive: {
        color: '#ffffff'
        },
        linkContentWrap: {
        overflow: 'hidden'
        },
        linkContentInner: {
        paddingTop: theme.spacing.xs
        },
        linkContentMeasure: {
        position: 'absolute',
        top: 0,
        left: theme.spacing.sm,
        right: theme.spacing.sm,
        opacity: 0,
        zIndex: -1
        },
        roleToggleRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs
        },
        modeChip: {
        flex: 1,
        minHeight: 42,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background
        },
        modeChipActive: {
        backgroundColor: theme.colors.accent + '14'
        },
        modeChipText: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.textSecondary
        },
        modeChipTextActive: {
        color: theme.colors.accent
        },
        roleHintText: {
        marginTop: theme.spacing.xs,
        marginBottom: theme.spacing.sm,
        fontSize: 12,
        color: theme.colors.textSecondary
        },
        inlineActionRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs
        },
        primaryActionButton: {
        flex: 1,
        minHeight: 48,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent
        },
        primaryActionButtonDisabled: {
        opacity: 0.48
        },
        primaryActionButtonWide: {
        width: '100%'
        },
        primaryActionButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
        },
        primaryActionButtonText: {
        fontSize: 15,
        fontWeight: '800',
        color: '#ffffff'
        },
        communityNoticeCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.xs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
        },
        communityNoticeIconWrap: {
        width: 28,
        height: 28,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background
        },
        communityNoticeCopy: {
        flex: 1,
        gap: theme.spacing.micro
        },
        communityNoticeTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: theme.colors.textPrimary
        },
        communityNoticeText: {
        fontSize: 12,
        lineHeight: 18,
        color: theme.colors.textSecondary
        },
        communityCaption: {
        fontSize: 12,
        lineHeight: 18,
        color: theme.colors.textSecondary
        },
        emptyState: {
        minHeight: 64,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background
        },
        emptyStateText: {
        fontSize: 13,
        color: theme.colors.textSecondary
        },
        memberList: {
        gap: theme.spacing.xs
        },
        memberCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        gap: theme.spacing.xs
        },
        memberHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
        },
        memberIdentityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        flex: 1
        },
        memberAvatar: {
        width: 36,
        height: 36,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent + '1a'
        },
        memberAvatarText: {
        fontSize: 14,
        fontWeight: '800',
        color: theme.colors.accent
        },
        memberCopy: {
        flex: 1,
        gap: theme.spacing.micro
        },
        memberName: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.textPrimary
        },
        memberEmail: {
        fontSize: 12,
        color: theme.colors.textSecondary
        },
        memberRolePill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface
        },
        memberRolePillText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.textSecondary
        },
        memberActionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.micro
        },
        memberActionChip: {
        minHeight: 32,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface
        },
        memberActionChipActive: {
        backgroundColor: theme.colors.accent
        },
        memberActionChipText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.textSecondary
        },
        memberActionChipTextActive: {
        color: '#ffffff'
        },
        memberTransferButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        minHeight: 32,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
        },
        memberTransferButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.accent
        },
        memberRemoveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        minHeight: 32,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.warning + '14'
        },
        memberRemoveButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.warning
        },
        errorText: {
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.warning,
        textAlign: 'center'
        },
        buttonPressed: {
        opacity: 0.72
        }
    });
};
