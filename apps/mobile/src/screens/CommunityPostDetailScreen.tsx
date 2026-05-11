import React from 'react';
import {
    Animated,
    Image,
    Keyboard,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdapters } from '@/adapters/useAdapters';
import { AvatarImage } from '@/components/AvatarImage';
import { BottomNavBar } from '@/components/BottomNavBar';
import { DaySection } from '@/components/DaySection';
import { EmojiText, containsEmojiText, emojiSafeFontFamily } from '@/components/EmojiText';
import { EmptyState } from '@/components/EmptyState';
import { Alert } from '@/feedback';
import { LoadingView } from '@/components/LoadingView';
import { TripHeader } from '@/components/TripHeader';
import { useAuthSession } from '@/hooks/useAuthSession';
import { normalizeCommunityLoadError } from '@/hooks/community-load-error';
import { useCommunityPostDetail } from '@/hooks/useCommunityPostDetail';
import { useForegroundResumeRefresh } from '@/hooks/useForegroundResumeRefresh';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { usePrimaryScrollActivityReporter } from '@/state/primary-scroll-activity';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileCommunityComment } from '@/types/community';
import { isPlinAdminProfile } from '@/utils/admin-access';

type Props = NativeStackScreenProps<RootStackParamList, 'CommunityPostDetail'>;
const COMMENT_INPUT_LINE_HEIGHT = 20;
const COMMENT_INPUT_MAX_LINES = 4;
const COMMENT_INPUT_MIN_HEIGHT = 34;
const COMMENT_INPUT_MAX_HEIGHT = 104;
const COMMENT_INPUT_VERTICAL_PADDING = 14;
const COMMENT_KEYBOARD_SAFE_SPACING = 10;

export function CommunityPostDetailScreen({ navigation, route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const isFocused = useIsFocused();
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const { communityRepository } = useAdapters();
    const { user, profileSummary, retryBootstrap, refreshSession } = useAuthSession();
    const {
        detail,
        loading,
        refreshing,
        error,
        errorKind,
        refreshError,
        isNotFound,
        refresh,
        retry
    } = useCommunityPostDetail(user?.uid ?? null, route.params.postId);
    const [comments, setComments] = React.useState<MobileCommunityComment[]>([]);
    const [isCommentsLoading, setIsCommentsLoading] = React.useState(true);
    const [commentsError, setCommentsError] = React.useState<string | null>(null);
    const [commentDraft, setCommentDraft] = React.useState('');
    const [interactionError, setInteractionError] = React.useState<string | null>(null);
    const [isSubmittingComment, setIsSubmittingComment] = React.useState(false);
    const [isLikeUpdating, setIsLikeUpdating] = React.useState(false);
    const [isLiked, setIsLiked] = React.useState(false);
    const [likesCount, setLikesCount] = React.useState(0);
    const [isCommentsModalVisible, setIsCommentsModalVisible] = React.useState(false);
    const [isCommentsSheetExpanded, setCommentsSheetExpanded] = React.useState(false);
    const [commentInputLineCount, setCommentInputLineCount] = React.useState(1);
    const [isCommentInputScrollable, setIsCommentInputScrollable] = React.useState(false);
    const { notifyPrimaryScrollActivity, scrollEventThrottle } = usePrimaryScrollActivityReporter();
    const [commentInputWidth, setCommentInputWidth] = React.useState(0);
    const [commentComposerHeight, setCommentComposerHeight] = React.useState(72);
    const [keyboardHeight, setKeyboardHeight] = React.useState(0);
    const commentsListRef = React.useRef<ScrollView | null>(null);
    const commentsSheetHeight = React.useRef(new Animated.Value(0)).current;
    const commentsSheetHeightRef = React.useRef(0);
    const commentsSheetDragStartHeightRef = React.useRef(0);

    const commentsSheetViewportHeight = windowHeight;

    const commentsSheetExpandedHeight = React.useMemo(() => {
        return Math.max(
            420,
            Math.min(
                commentsSheetViewportHeight - insets.top - theme.spacing.md,
                commentsSheetViewportHeight * 0.94
            )
        );
    }, [commentsSheetViewportHeight, insets.top, theme.spacing.md]);

    const commentsSheetCollapsedVisibleHeight = React.useMemo(() => {
        return Math.max(
            360,
            Math.min(commentsSheetExpandedHeight - 56, commentsSheetViewportHeight * 0.72)
        );
    }, [commentsSheetExpandedHeight, commentsSheetViewportHeight]);

    const commentInputHeight = React.useMemo(() => {
        if (commentInputLineCount <= 1) {
            return COMMENT_INPUT_MIN_HEIGHT;
        }

        return Math.min(
            COMMENT_INPUT_MAX_HEIGHT,
            commentInputLineCount * COMMENT_INPUT_LINE_HEIGHT + COMMENT_INPUT_VERTICAL_PADDING
        );
    }, [commentInputLineCount]);

    const commentsKeyboardLift = React.useMemo(() => {
        if (keyboardHeight <= 0) {
            return 0;
        }

        return Math.max(0, keyboardHeight - insets.bottom) + COMMENT_KEYBOARD_SAFE_SPACING;
    }, [insets.bottom, keyboardHeight]);
    const commentComposerInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.sm
    }), [insets.bottom, theme.spacing.sm]);

    React.useEffect(() => {
        const listenerId = commentsSheetHeight.addListener(({ value }) => {
            commentsSheetHeightRef.current = value;
        });

        return () => {
            commentsSheetHeight.removeListener(listenerId);
        };
    }, [commentsSheetHeight]);

    const animateCommentsSheet = React.useCallback((expanded: boolean) => {
        setCommentsSheetExpanded(expanded);
        Animated.spring(commentsSheetHeight, {
            toValue: expanded ? commentsSheetExpandedHeight : commentsSheetCollapsedVisibleHeight,
            useNativeDriver: false,
            bounciness: 0,
            speed: 18
        }).start();
    }, [commentsSheetCollapsedVisibleHeight, commentsSheetExpandedHeight, commentsSheetHeight]);

    React.useEffect(() => {
        const nextValue = isCommentsModalVisible
            ? (
                isCommentsSheetExpanded
                    ? commentsSheetExpandedHeight
                    : commentsSheetCollapsedVisibleHeight
            )
            : commentsSheetCollapsedVisibleHeight;

        commentsSheetHeight.setValue(nextValue);
        commentsSheetHeightRef.current = nextValue;

        if (!isCommentsModalVisible) {
            setCommentsSheetExpanded(false);
        }
    }, [
        commentsSheetCollapsedVisibleHeight,
        commentsSheetExpandedHeight,
        commentsSheetHeight,
        isCommentsModalVisible,
        isCommentsSheetExpanded
    ]);

    const commentsSheetPanResponder = React.useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => (
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
            && Math.abs(gestureState.dy) > 6
        ),
        onPanResponderGrant: () => {
            commentsSheetHeight.stopAnimation((value) => {
                commentsSheetDragStartHeightRef.current = value;
                commentsSheetHeightRef.current = value;
            });
        },
        onPanResponderMove: (_event, gestureState) => {
            const nextValue = Math.min(
                commentsSheetExpandedHeight,
                Math.max(
                    commentsSheetCollapsedVisibleHeight,
                    commentsSheetDragStartHeightRef.current - gestureState.dy
                )
            );
            commentsSheetHeight.setValue(nextValue);
        },
        onPanResponderRelease: (_event, gestureState) => {
            const projectedValue = commentsSheetDragStartHeightRef.current - gestureState.dy - gestureState.vy * 48;
            const threshold = commentsSheetCollapsedVisibleHeight + (
                (commentsSheetExpandedHeight - commentsSheetCollapsedVisibleHeight) * 0.55
            );
            const shouldExpand = projectedValue > threshold || gestureState.vy < -0.8;
            animateCommentsSheet(shouldExpand);
        },
        onPanResponderTerminate: () => {
            const midpoint = commentsSheetCollapsedVisibleHeight + (
                (commentsSheetExpandedHeight - commentsSheetCollapsedVisibleHeight) * 0.5
            );
            animateCommentsSheet(commentsSheetHeightRef.current > midpoint);
        }
    }), [
        animateCommentsSheet,
        commentsSheetCollapsedVisibleHeight,
        commentsSheetExpandedHeight,
        commentsSheetHeight
    ]);

    const loadComments = React.useCallback(async (options?: { refresh?: boolean }) => {
        if (!user?.uid || !route.params.postId) {
            setComments([]);
            setCommentsError(null);
            setIsCommentsLoading(false);
            return;
        }

        if (options?.refresh !== true) {
            setIsCommentsLoading(true);
        }
        setCommentsError(null);

        try {
            const nextComments = await communityRepository.listComments(user.uid, route.params.postId);
            setComments(nextComments);
        } catch (error) {
            const nextError = normalizeCommunityLoadError(error, 'detail');
            setCommentsError(
                nextError.kind === 'network'
                    ? '인터넷 연결이 잠시 불안정해 댓글을 다시 불러오지 못했어요.'
                    : nextError.kind === 'session'
                        ? '세션을 다시 확인한 뒤 댓글을 새로 불러와 주세요.'
                        : '댓글을 불러오지 못했어요.'
            );
        } finally {
            setIsCommentsLoading(false);
        }
    }, [communityRepository, route.params.postId, user?.uid]);

    React.useEffect(() => {
        void loadComments();
    }, [loadComments]);

    React.useEffect(() => {
        setCommentDraft('');
        setInteractionError(null);
        setCommentInputLineCount(1);
        setIsCommentInputScrollable(false);
        setCommentInputWidth(0);
    }, [route.params.postId]);

    React.useEffect(() => {
        if (!isCommentsModalVisible) {
            setKeyboardHeight(0);
            return;
        }

        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSubscription = Keyboard.addListener(showEvent, (event) => {
            const measuredHeight = Math.max(0, event.endCoordinates?.height || 0);
            const measuredScreenLift = typeof event.endCoordinates?.screenY === 'number'
                ? Math.max(0, windowHeight - event.endCoordinates.screenY)
                : measuredHeight;
            const nextHeight = Platform.OS === 'android'
                ? Math.max(measuredHeight, measuredScreenLift)
                : measuredHeight;
            setKeyboardHeight(nextHeight);
            setCommentsSheetExpanded(true);
            commentsSheetHeight.stopAnimation(() => {
                commentsSheetHeight.setValue(commentsSheetExpandedHeight);
                commentsSheetHeightRef.current = commentsSheetExpandedHeight;
            });

            requestAnimationFrame(() => {
                commentsListRef.current?.scrollToEnd({ animated: true });
            });
        });
        const hideSubscription = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, [commentsSheetExpandedHeight, commentsSheetHeight, isCommentsModalVisible, windowHeight]);

    React.useEffect(() => {
        setInteractionError(null);
        setIsLiked(detail?.isLiked ?? false);
        setLikesCount(detail?.likesCount ?? 0);
    }, [detail?.id, detail?.isLiked, detail?.likesCount]);

    const isCommunityAdmin = isPlinAdminProfile(profileSummary, user);
    const isPostAuthor = Boolean(detail && user && detail.authorUid === user.uid);
    const canDeletePost = Boolean(detail && user && (isPostAuthor || isCommunityAdmin));

    const handleRefresh = React.useCallback(async () => {
        if (loading || refreshing) {
            return;
        }

        const nextUser = await refreshSession();

        if (!nextUser || (user?.uid && nextUser.uid !== user.uid)) {
            return;
        }

        await Promise.all([
            refresh(),
            loadComments({ refresh: true })
        ]);
    }, [loadComments, loading, refresh, refreshSession, refreshing, user?.uid]);

    const handleToggleLike = React.useCallback(async () => {
        if (!user || isLikeUpdating) {
            return;
        }

        setInteractionError(null);
        setIsLikeUpdating(true);

        try {
            const result = await communityRepository.toggleLike(user.uid, route.params.postId, isLiked);
            setIsLiked(result.isLiked);
            setLikesCount((currentValue) => (
                typeof result.likesCount === 'number'
                    ? Math.max(0, result.likesCount)
                    : (
                        result.isLiked
                            ? currentValue + 1
                            : Math.max(0, currentValue - 1)
                    )
            ));
        } catch (error) {
            const nextError = normalizeCommunityLoadError(error, 'detail');
            setInteractionError(
                nextError.kind === 'session'
                    ? '세션을 다시 확인한 뒤 좋아요를 눌러 주세요.'
                    : nextError.kind === 'network'
                        ? '연결이 잠시 불안정해 좋아요를 처리하지 못했어요.'
                        : '좋아요를 처리하지 못했어요.'
            );
        } finally {
            setIsLikeUpdating(false);
        }
    }, [communityRepository, isLikeUpdating, isLiked, route.params.postId, user]);

    const handleSubmitComment = React.useCallback(async () => {
        const text = commentDraft.trim();

        if (!user) {
            return;
        }

        if (!text) {
            setInteractionError('댓글을 입력해 주세요.');
            return;
        }

        setInteractionError(null);
        setIsSubmittingComment(true);

        try {
            await communityRepository.addComment(route.params.postId, {
                text,
                authorUid: user.uid,
                authorName: profileSummary?.displayName || user.displayName || user.email || '익명',
                authorPhotoURL: profileSummary?.photoURL || user.photoURL || null
            });
            setCommentDraft('');
            setCommentInputLineCount(1);
            setIsCommentInputScrollable(false);
            await loadComments({ refresh: true });
        } catch (error) {
            const nextError = normalizeCommunityLoadError(error, 'detail');
            setInteractionError(
                nextError.kind === 'session'
                    ? '세션을 다시 확인한 뒤 댓글을 남겨 주세요.'
                    : nextError.kind === 'network'
                        ? '연결이 잠시 불안정해 댓글을 등록하지 못했어요.'
                        : error instanceof Error && error.message
                            ? error.message
                            : '댓글을 등록하지 못했어요.'
            );
        } finally {
            setIsSubmittingComment(false);
        }
    }, [commentDraft, communityRepository, loadComments, route.params.postId, user]);

    const handleDeletePost = React.useCallback(() => {
        if (!detail || !user || !canDeletePost) {
            return;
        }

        Alert.alert(
            '공개 여행을 삭제할까요?',
            `"${detail.trip.title}" 여행이 커뮤니티에서 내려가요.`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            setInteractionError(null);

                            try {
                                await communityRepository.deletePost(user.uid, detail.id);
                                setIsCommentsModalVisible(false);

                                if (navigation.canGoBack()) {
                                    navigation.goBack();
                                } else {
                                    navigation.navigate('Community');
                                }
                            } catch (error) {
                                setInteractionError(
                                    error instanceof Error && error.message
                                        ? error.message
                                        : '공개 일정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.'
                                );
                            }
                        })();
                    }
                }
            ]
        );
    }, [canDeletePost, communityRepository, detail, navigation, user]);

    const handleReportPost = React.useCallback(() => {
        if (!detail || !user || detail.authorUid === user.uid) {
            return;
        }

        Alert.alert(
            '이 글을 신고할까요?',
            '운영 검토가 필요한 글로 접수할게요.',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '신고',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            setInteractionError(null);

                            try {
                                await communityRepository.reportPost(detail.id, 'safety_review');
                                setInteractionError('신고를 접수했어요. 운영 검토 후 필요한 조치를 진행할게요.');
                            } catch (error) {
                                setInteractionError(
                                    error instanceof Error
                                        ? error.message
                                        : '신고를 접수하지 못했어요.'
                                );
                            }
                        })();
                    }
                }
            ]
        );
    }, [communityRepository, detail, user]);

    const handleToggleBlockAuthor = React.useCallback(() => {
        if (!detail || !user || detail.authorUid === user.uid) {
            return;
        }

        const isBlocked = profileSummary?.blockedUserIds.includes(detail.authorUid) === true;

        Alert.alert(
            isBlocked ? '사용자 차단을 해제할까요?' : '이 사용자를 차단할까요?',
            isBlocked
                ? `${detail.authorName}님의 커뮤니티 글을 다시 표시할게요.`
                : `${detail.authorName}님의 글과 댓글을 내 커뮤니티에서 숨길게요.`,
            [
                { text: '취소', style: 'cancel' },
                {
                    text: isBlocked ? '차단 해제' : '차단',
                    style: isBlocked ? 'default' : 'destructive',
                    onPress: () => {
                        void (async () => {
                            setInteractionError(null);

                            try {
                                if (isBlocked) {
                                    await communityRepository.unblockUser(user.uid, detail.authorUid);
                                    await refreshSession();
                                    await Promise.all([
                                        refresh(),
                                        loadComments({ refresh: true })
                                    ]);
                                } else {
                                    await communityRepository.blockUser(user.uid, detail.authorUid);
                                    await refreshSession();

                                    if (navigation.canGoBack()) {
                                        navigation.goBack();
                                    } else {
                                        navigation.navigate('Community');
                                    }
                                }
                            } catch (error) {
                                setInteractionError(
                                    error instanceof Error
                                        ? error.message
                                        : isBlocked
                                            ? '차단을 해제하지 못했어요.'
                                            : '사용자를 차단하지 못했어요.'
                                );
                            }
                        })();
                    }
                }
            ]
        );
    }, [communityRepository, detail, loadComments, navigation, profileSummary?.blockedUserIds, refresh, refreshSession, user]);

    const handleReportComment = React.useCallback((comment: MobileCommunityComment) => {
        Alert.alert(
            '이 댓글을 신고할까요?',
            '운영 검토가 필요한 댓글로 접수할게요.',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '신고',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            setInteractionError(null);

                            try {
                                await communityRepository.reportComment(route.params.postId, comment.id, 'comment_review');
                                setInteractionError('댓글 신고를 접수했어요. 운영 검토 후 필요한 조치를 진행할게요.');
                            } catch (error) {
                                setInteractionError(
                                    error instanceof Error
                                        ? error.message
                                        : '댓글 신고를 접수하지 못했어요.'
                                );
                            }
                        })();
                    }
                }
            ]
        );
    }, [communityRepository, route.params.postId]);

    const representativeComment = comments[0] ?? null;

    useForegroundResumeRefresh({
        enabled: isFocused && Boolean(user),
        onRefresh: handleRefresh
    });

    if (loading) {
        return <LoadingView title="커뮤니티 상세 준비 중" />;
    }

    if (error) {
        return (
            <View style={styles.shell}>
                <View style={styles.screenBody}>
                    <View style={styles.stateContent}>
                        <EmptyState
                            title={
                                errorKind === 'session'
                                    ? '세션을 다시 확인해 주세요.'
                                    : errorKind === 'network'
                                        ? '연결이 잠시 불안정해요.'
                                        : '커뮤니티 상세를 불러오지 못했어요.'
                            }
                            description={error}
                            supportText={
                                errorKind === 'network'
                                    ? '인터넷 연결이 돌아오면 새로고침으로 내용을 다시 확인할 수 있어요.'
                                    : undefined
                            }
                            actionLabel={
                                errorKind === 'session'
                                    ? '세션 다시 확인'
                                    : errorKind === 'network'
                                        ? '다시 연결 시도'
                                        : '다시 시도'
                            }
                            tone={errorKind === 'network' ? 'warning' : 'default'}
                            onAction={() => {
                                if (errorKind === 'session') {
                                    void retryBootstrap();
                                    return;
                                }

                                void retry();
                            }}
                        />
                    </View>
                </View>
                <BottomNavBar activeTab="Community" />
            </View>
        );
    }

    if (isNotFound || !detail) {
        return (
            <View style={styles.shell}>
                <View style={styles.screenBody}>
                    <View style={styles.stateContent}>
                        <EmptyState
                            title="커뮤니티 글을 찾을 수 없어요."
                            description="커뮤니티 목록에서 다시 선택해 주세요."
                            actionLabel="목록으로 돌아가기"
                            onAction={() => {
                                if (navigation.canGoBack()) {
                                    navigation.goBack();
                                    return;
                                }

                                navigation.navigate('Community');
                            }}
                        />
                    </View>
                </View>
                <BottomNavBar activeTab="Community" />
            </View>
        );
    }

    return (
        <View style={styles.shell}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.content}
                onScroll={notifyPrimaryScrollActivity}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            void handleRefresh();
                        }}
                        tintColor={theme.colors.accent}
                        colors={[theme.colors.accent]}
                    />
                }
                scrollEventThrottle={scrollEventThrottle}
            >
                {detail.trip.coverImage ? (
                    <View style={styles.heroHeader}>
                        <Image source={{ uri: detail.trip.coverImage }} style={styles.heroHeaderImage} />
                        <View style={styles.heroHeaderBaseScrim} />
                        <View style={styles.heroHeaderBottomFade} pointerEvents="none">
                            <View style={[styles.heroHeaderBottomFadeLayer, styles.heroHeaderBottomFadeLayerOne]} />
                            <View style={[styles.heroHeaderBottomFadeLayer, styles.heroHeaderBottomFadeLayerTwo]} />
                            <View style={[styles.heroHeaderBottomFadeLayer, styles.heroHeaderBottomFadeLayerThree]} />
                            <View style={[styles.heroHeaderBottomFadeLayer, styles.heroHeaderBottomFadeLayerFour]} />
                            <View style={[styles.heroHeaderBottomFadeLayer, styles.heroHeaderBottomFadeLayerFive]} />
                        </View>
                        <View style={styles.heroHeaderContent}>
                            <TripHeader trip={detail.trip} variant="hero" />
                        </View>
                    </View>
                ) : (
                    <TripHeader trip={detail.trip} />
                )}

                <View style={styles.authorCard}>
                    <View style={styles.authorRow}>
                        <AvatarImage
                            uri={detail.authorPhotoURL}
                            label={detail.authorName}
                            size={44}
                            textSize={16}
                            tone="warning"
                        />
                        <View style={styles.authorCopy}>
                            <EmojiText style={styles.authorName}>{detail.authorName}</EmojiText>
                            <EmojiText style={styles.authorMeta}>{detail.publishedLabel}</EmojiText>
                        </View>
                    </View>
                    <View style={styles.metaRow}>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                void handleToggleLike();
                            }}
                            style={[
                                styles.actionPill,
                                isLiked ? styles.actionPillLiked : null,
                                isLikeUpdating ? styles.actionPillDisabled : null
                            ]}
                        >
                            <Text style={[styles.actionPillIcon, isLiked ? styles.actionPillIconLiked : null]}>
                                {isLiked ? '❤️' : '🤍'}
                            </Text>
                            <Text style={[styles.actionPillText, isLiked ? styles.actionPillTextLiked : null]}>
                                좋아요 {likesCount}
                            </Text>
                        </Pressable>
                        <View style={styles.metaPill}>
                            <Text style={styles.metaPillText}>복사 {detail.clonesCount}</Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => {
                                setIsCommentsModalVisible(true);
                            }}
                            style={styles.metaPill}
                        >
                            <Text style={styles.metaPillText}>댓글 {comments.length}</Text>
                        </Pressable>
                    </View>
                    {user && (!isPostAuthor || canDeletePost) ? (
                        <View style={styles.authorActionRow}>
                            {!isPostAuthor ? (
                                <>
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={handleReportPost}
                                        style={({ pressed }) => [
                                            styles.authorActionButton,
                                            pressed ? styles.authorActionButtonPressed : null
                                        ]}
                                    >
                                        <Text style={styles.authorActionText}>글 신고</Text>
                                    </Pressable>
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={handleToggleBlockAuthor}
                                        style={({ pressed }) => [
                                            styles.authorActionButton,
                                            styles.authorActionButtonWarn,
                                            pressed ? styles.authorActionButtonPressed : null
                                        ]}
                                    >
                                        <Text style={[styles.authorActionText, styles.authorActionTextWarn]}>
                                            {profileSummary?.blockedUserIds.includes(detail.authorUid) ? '차단 해제' : '작성자 차단'}
                                        </Text>
                                    </Pressable>
                                </>
                            ) : null}
                            {canDeletePost ? (
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={handleDeletePost}
                                    style={({ pressed }) => [
                                        styles.authorActionButton,
                                        styles.authorActionButtonWarn,
                                        pressed ? styles.authorActionButtonPressed : null
                                    ]}
                                >
                                    <Text style={[styles.authorActionText, styles.authorActionTextWarn]}>글 삭제</Text>
                                </Pressable>
                            ) : null}
                        </View>
                    ) : null}
                </View>

                <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                        setIsCommentsModalVisible(true);
                    }}
                    style={styles.commentPreviewCard}
                >
                    <View style={styles.commentPreviewHeader}>
                        <Text style={styles.commentPreviewTitle}>대표 댓글</Text>
                        <View style={styles.commentsCountPill}>
                            <Text style={styles.commentsCountText}>{comments.length}개</Text>
                        </View>
                    </View>
                    {isCommentsLoading ? (
                        <Text style={styles.commentPreviewBody}>댓글을 불러오는 중이에요.</Text>
                    ) : commentsError ? (
                        <Text style={styles.commentPreviewBody}>{commentsError}</Text>
                    ) : representativeComment ? (
                        <>
                            <EmojiText style={styles.commentPreviewAuthor}>
                                {representativeComment.authorName} · {representativeComment.createdLabel}
                            </EmojiText>
                            <EmojiText style={styles.commentPreviewBody} numberOfLines={2}>
                                {representativeComment.text}
                            </EmojiText>
                        </>
                    ) : (
                        <Text style={styles.commentPreviewBody}>
                            첫 번째 댓글을 남겨보세요.
                        </Text>
                    )}
                </Pressable>

                {refreshError ? (
                    <View style={styles.warningCard}>
                        <Text style={styles.warningLabel}>연결 확인</Text>
                        <Text style={styles.warningText}>{refreshError}</Text>
                    </View>
                ) : null}

                {detail.trip.days.map((day) => (
                    <DaySection key={day.id} day={day} />
                ))}

            </ScrollView>
            <BottomNavBar activeTab="Community" />

            <Modal
                visible={isCommentsModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    setIsCommentsModalVisible(false);
                }}
            >
                <View style={styles.commentsModalRoot}>
                    <Pressable
                        style={styles.commentsModalBackdrop}
                        onPress={() => {
                            setIsCommentsModalVisible(false);
                        }}
                    />
                    <View style={styles.commentsSheetKeyboard}>
                        <Animated.View
                            style={[
                                styles.commentsSheet,
                                {
                                    height: commentsSheetHeight
                                }
                            ]}
                        >
                            <View
                                {...commentsSheetPanResponder.panHandlers}
                                style={styles.commentsSheetHandleTouch}
                            >
                                <View style={styles.commentsSheetHandle} />
                            </View>
                            <View style={styles.commentsSheetHeader}>
                                <Text style={styles.commentsTitle}>댓글</Text>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => {
                                        setIsCommentsModalVisible(false);
                                    }}
                                    style={styles.commentsCloseButton}
                                >
                                    <Text style={styles.commentsCloseButtonText}>닫기</Text>
                                </Pressable>
                            </View>
                            <View style={styles.commentsSheetBody}>
                                <View style={styles.commentsContentArea}>
                                    {isCommentsLoading ? (
                                        <Text style={styles.commentLoadingText}>댓글을 불러오는 중이에요.</Text>
                                    ) : commentsError ? (
                                        <View style={styles.commentsStatusCard}>
                                            <Text style={styles.commentsStatusText}>{commentsError}</Text>
                                            <Pressable
                                                accessibilityRole="button"
                                                onPress={() => {
                                                    void loadComments();
                                                }}
                                                style={styles.commentsRetryButton}
                                            >
                                                <Text style={styles.commentsRetryButtonText}>다시 확인</Text>
                                            </Pressable>
                                        </View>
                                    ) : comments.length === 0 ? (
                                        <View style={styles.commentsEmptyCard}>
                                            <Text style={styles.commentsEmptyText}>첫 번째 댓글을 남겨보세요.</Text>
                                        </View>
                                    ) : (
                                        <ScrollView
                                            ref={commentsListRef}
                                            style={styles.commentsSheetList}
                                            contentContainerStyle={[
                                                styles.commentsSheetListContent,
                                                {
                                                    paddingBottom: commentComposerHeight + 12
                                                }
                                            ]}
                                            keyboardShouldPersistTaps="handled"
                                            showsVerticalScrollIndicator={false}
                                        >
                                            {comments.map((comment) => (
                                                <View key={comment.id} style={styles.commentCard}>
                                                    <View style={styles.commentHeader}>
                                                        <View style={styles.commentHeaderRow}>
                                                            <View style={styles.commentAuthorRow}>
                                                                <AvatarImage
                                                                    uri={comment.authorPhotoURL}
                                                                    label={comment.authorName}
                                                                    size={28}
                                                                    textSize={12}
                                                                    tone="warning"
                                                                />
                                                                <View style={styles.commentAuthorCopy}>
                                                                    <EmojiText style={styles.commentAuthorName}>{comment.authorName}</EmojiText>
                                                                    <EmojiText style={styles.commentMeta}>{comment.createdLabel}</EmojiText>
                                                                </View>
                                                            </View>
                                                            {user && comment.authorUid !== user.uid ? (
                                                                <Pressable
                                                                    accessibilityRole="button"
                                                                    onPress={() => {
                                                                        handleReportComment(comment);
                                                                    }}
                                                                    style={({ pressed }) => [
                                                                        styles.commentReportButton,
                                                                        pressed ? styles.authorActionButtonPressed : null
                                                                    ]}
                                                                >
                                                                    <Text style={styles.commentReportText}>신고</Text>
                                                                </Pressable>
                                                            ) : null}
                                                        </View>
                                                    </View>
                                                    <EmojiText style={styles.commentText}>{comment.text}</EmojiText>
                                                </View>
                                            ))}
                                        </ScrollView>
                                    )}
                                </View>
                            </View>

                            <View
                                style={[
                                    styles.commentComposerWrap,
                                    {
                                        bottom: commentsKeyboardLift
                                    }
                                ]}
                                onLayout={(event) => {
                                    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
                                    setCommentComposerHeight((currentHeight) => (
                                        currentHeight === nextHeight ? currentHeight : nextHeight
                                    ));
                                }}
                            >
                                <View
                                    style={[
                                        styles.commentComposerSurface,
                                        commentComposerInsetStyle
                                    ]}
                                >
                                    <View style={styles.commentComposer}>
                                        <View
                                            style={styles.commentInputFrame}
                                            onLayout={(event) => {
                                                const nextWidth = Math.floor(event.nativeEvent.layout.width);
                                                setCommentInputWidth((currentWidth) => (
                                                    currentWidth === nextWidth ? currentWidth : nextWidth
                                                ));
                                            }}
                                        >
                                            <TextInput
                                                value={commentDraft}
                                                onChangeText={setCommentDraft}
                                                onFocus={() => {
                                                    setCommentsSheetExpanded(true);
                                                    commentsSheetHeight.stopAnimation(() => {
                                                        commentsSheetHeight.setValue(commentsSheetExpandedHeight);
                                                        commentsSheetHeightRef.current = commentsSheetExpandedHeight;
                                                    });
                                                    requestAnimationFrame(() => {
                                                        commentsListRef.current?.scrollToEnd({ animated: true });
                                                    });
                                                }}
                                                placeholder="의견을 남겨주세요..."
                                                placeholderTextColor={theme.colors.textSecondary}
                                                multiline
                                                textAlignVertical="top"
                                                scrollEnabled={isCommentInputScrollable}
                                                editable={!isSubmittingComment}
                                                style={[
                                                    styles.commentInput,
                                                    containsEmojiText(commentDraft) ? styles.commentInputEmojiSafe : null,
                                                    {
                                                        minHeight: COMMENT_INPUT_MIN_HEIGHT,
                                                        maxHeight: COMMENT_INPUT_MAX_HEIGHT,
                                                        height: commentInputHeight
                                                    }
                                                ]}
                                            />
                                            {commentInputWidth > 0 ? (
                                                <Text
                                                    pointerEvents="none"
                                                    onTextLayout={(event) => {
                                                        const measuredLineCount = Math.max(
                                                            1,
                                                            event.nativeEvent.lines.length
                                                        );
                                                        const clampedLineCount = Math.min(
                                                            COMMENT_INPUT_MAX_LINES,
                                                            measuredLineCount
                                                        );

                                                        setCommentInputLineCount((currentLineCount) => (
                                                            currentLineCount === clampedLineCount
                                                                ? currentLineCount
                                                                : clampedLineCount
                                                        ));
                                                        setIsCommentInputScrollable(
                                                            measuredLineCount > COMMENT_INPUT_MAX_LINES
                                                        );
                                                    }}
                                                    style={[
                                                        styles.commentMeasureText,
                                                        containsEmojiText(commentDraft) ? styles.commentInputEmojiSafe : null,
                                                        {
                                                            width: Math.max(commentInputWidth - theme.spacing.sm * 2, 0)
                                                        }
                                                    ]}
                                                >
                                                    {commentDraft || ' '}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <Pressable
                                            accessibilityRole="button"
                                            onPress={() => {
                                                void handleSubmitComment();
                                            }}
                                            style={[
                                                styles.commentSubmitButton,
                                                isSubmittingComment ? styles.commentSubmitButtonDisabled : null
                                            ]}
                                        >
                                            <Text style={styles.commentSubmitButtonText}>
                                                {isSubmittingComment ? '등록 중' : '등록'}
                                            </Text>
                                        </Pressable>
                                    </View>

                                    {interactionError ? (
                                        <Text style={styles.commentErrorText}>{interactionError}</Text>
                                    ) : null}
                                </View>
                            </View>
                        </Animated.View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    shell: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    screenBody: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    container: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    content: {
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.lg * 4
    },
    heroHeader: {
        position: 'relative',
        minHeight: 0,
        marginBottom: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceMuted
    },
    heroHeaderImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%'
    },
    heroHeaderBaseScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.mode === 'dark'
            ? 'rgba(8, 10, 14, 0.20)'
            : 'rgba(24, 18, 10, 0.12)'
    },
    heroHeaderBottomFade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 92
    },
    heroHeaderBottomFadeLayer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000'
    },
    heroHeaderBottomFadeLayerOne: {
        height: 92,
        opacity: 0.06
    },
    heroHeaderBottomFadeLayerTwo: {
        height: 76,
        opacity: 0.08
    },
    heroHeaderBottomFadeLayerThree: {
        height: 60,
        opacity: 0.1
    },
    heroHeaderBottomFadeLayerFour: {
        height: 44,
        opacity: 0.14
    },
    heroHeaderBottomFadeLayerFive: {
        height: 28,
        opacity: 0.18
    },
    heroHeaderContent: {
        position: 'relative',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs
    },
    authorCard: {
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    authorCopy: {
        flex: 1,
        marginLeft: theme.spacing.xs
    },
    authorName: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontFamily: theme.fonts.bold
    },
    authorMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: theme.spacing.sm
    },
    authorActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: theme.spacing.xs,
        gap: theme.spacing.xs
    },
    actionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.micro,
        marginBottom: theme.spacing.micro,
        minHeight: 32,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 0,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    actionPillLiked: {
        backgroundColor: theme.mode === 'dark' ? '#4a2724' : '#fde6e0'
    },
    actionPillDisabled: {
        opacity: 0.65
    },
    actionPillIcon: {
        marginRight: 4,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        textAlignVertical: 'center'
    },
    actionPillIconLiked: {
        color: theme.mode === 'dark' ? '#ffb1a1' : '#cf5d45'
    },
    actionPillText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        textAlignVertical: 'center',
        fontFamily: theme.fonts.semibold
    },
    actionPillTextLiked: {
        color: theme.mode === 'dark' ? '#ffb1a1' : '#cf5d45'
    },
    metaPill: {
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.micro,
        marginBottom: theme.spacing.micro,
        minHeight: 32,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 0,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    metaPillText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        textAlignVertical: 'center',
        fontFamily: theme.fonts.semibold
    },
    authorActionButton: {
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    authorActionButtonWarn: {
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    authorActionButtonPressed: {
        opacity: 0.88
    },
    authorActionText: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    authorActionTextWarn: {
        color: theme.colors.warning
    },
    warningCard: {
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    warningLabel: {
        color: theme.colors.warning,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    warningText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.warning,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    commentPreviewCard: {
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    commentPreviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.xs
    },
    commentPreviewTitle: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    commentPreviewAuthor: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.medium
    },
    commentPreviewBody: {
        marginTop: 4,
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    commentsModalRoot: {
        flex: 1,
        justifyContent: 'flex-end'
    },
    commentsModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.45)'
    },
    commentsSheet: {
        position: 'relative',
        paddingTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderTopLeftRadius: theme.radius.lg,
        borderTopRightRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    commentsSheetKeyboard: {
        flex: 1,
        justifyContent: 'flex-end'
    },
    commentsSheetBody: {
        flex: 1,
        minHeight: 0
    },
    commentsContentArea: {
        flex: 1,
        minHeight: 0
    },
    commentsSheetHandle: {
        alignSelf: 'center',
        width: 44,
        height: 5,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    commentsSheetHandleTouch: {
        alignSelf: 'stretch',
        paddingTop: theme.spacing.micro,
        paddingBottom: theme.spacing.sm
    },
    commentsSheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.sm
    },
    commentsTitle: {
        color: theme.colors.textPrimary,
        fontSize: 20,
        lineHeight: 26,
        fontFamily: theme.fonts.bold
    },
    commentsCountPill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    commentsCountText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    commentsCloseButton: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    commentsCloseButtonText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    commentComposer: {
        flexDirection: 'row',
        alignItems: 'flex-end'
    },
    commentComposerWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        elevation: 20,
        paddingHorizontal: theme.spacing.sm,
        backgroundColor: 'transparent'
    },
    commentComposerSurface: {
        paddingTop: theme.spacing.sm,
        backgroundColor: theme.colors.surface
    },
    commentInputFrame: {
        flex: 1
    },
    commentInput: {
        width: '100%',
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceMuted,
        color: theme.colors.textPrimary,
        fontSize: 14,
        lineHeight: COMMENT_INPUT_LINE_HEIGHT,
        fontFamily: theme.fonts.body
    },
    commentInputEmojiSafe: {
        fontFamily: emojiSafeFontFamily
    },
    commentMeasureText: {
        position: 'absolute',
        opacity: 0,
        left: theme.spacing.sm,
        top: theme.spacing.xs,
        color: 'transparent',
        fontSize: 14,
        lineHeight: COMMENT_INPUT_LINE_HEIGHT,
        fontFamily: theme.fonts.body
    },
    commentSubmitButton: {
        marginLeft: theme.spacing.xs,
        minHeight: 34,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent
    },
    commentSubmitButtonDisabled: {
        opacity: 0.7
    },
    commentSubmitButtonText: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#fffaf2',
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    commentErrorText: {
        marginTop: theme.spacing.xs,
        color: theme.colors.warning,
        lineHeight: 20
    },
    commentLoadingText: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    commentsStatusCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    commentsStatusText: {
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    commentsRetryButton: {
        alignSelf: 'flex-start',
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    commentsRetryButtonText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    commentsEmptyCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    commentsEmptyText: {
        color: theme.colors.textSecondary,
        lineHeight: 20
    },
    commentsSheetList: {
        flex: 1,
        minHeight: 0
    },
    commentsSheetListContent: {
        paddingBottom: theme.spacing.xs
    },
    commentCard: {
        marginBottom: theme.spacing.xs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    commentHeader: {
        marginBottom: theme.spacing.micro
    },
    commentHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    commentAuthorRow: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    commentAuthorCopy: {
        flex: 1,
        marginLeft: theme.spacing.xs
    },
    commentAuthorName: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    commentMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.body
    },
    commentReportButton: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    commentReportText: {
        color: theme.colors.warning,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    commentText: {
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    stateContent: {
        flex: 1,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.md
    }
});
