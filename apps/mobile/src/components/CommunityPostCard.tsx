import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarImage } from '@/components/AvatarImage';
import { EmojiText } from '@/components/EmojiText';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileCommunityPostSummary } from '@/types/community';

type Props = {
    post: MobileCommunityPostSummary;
    onPress(): void;
    variant?: 'card' | 'feed';
    onOpenActions?(): void;
    disabled?: boolean;
};

function parseDateOnly(value: string) {
    const safeValue = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
        return null;
    }

    const parsed = new Date(`${safeValue}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCompactDateRange(startDate: string, endDate: string) {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (!start || !end) {
        return '';
    }

    const startLabel = `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()}`;
    const endLabel = `${end.getFullYear()}.${end.getMonth() + 1}.${end.getDate()}`;

    return `${startLabel}-${endLabel}`;
}

function buildMarketplaceLabel(post: MobileCommunityPostSummary) {
    if (post.marketplace.purchaseState === 'owned') {
        return '구매 완료';
    }

    if (post.marketplace.purchaseState === 'unavailable') {
        return '판매 중지';
    }

    if (post.marketplace.productId) {
        return post.marketplace.priceLabel || '유료 플랜';
    }

    return '무료 플랜';
}

export function CommunityPostCard({
    post,
    onPress,
    variant = 'card',
    onOpenActions,
    disabled = false
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const hasCoverImage = Boolean(post.coverImage);
    const compactDateRange = React.useMemo(
        () => formatCompactDateRange(post.startDate, post.endDate),
        [post.endDate, post.startDate]
    );
    const [feedLocationLabel, feedScheduleFallbackLabel] = React.useMemo(() => {
        const parts = String(post.subInfo || '')
            .split(/\s*[•·]\s*/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length === 0) {
            return ['', ''];
        }

        if (parts.length === 1) {
            return [parts[0], ''];
        }

        return [parts[0], parts.slice(1).join(' • ')];
    }, [post.subInfo]);
    const feedScheduleLabel = compactDateRange || feedScheduleFallbackLabel;
    const feedLocationScheduleLine = React.useMemo(() => {
        if (feedLocationLabel && feedScheduleLabel) {
            return `${feedLocationLabel} • ${feedScheduleLabel}`;
        }

        return feedLocationLabel || feedScheduleLabel || '';
    }, [feedLocationLabel, feedScheduleLabel]);
    const cardMetaLines = React.useMemo(() => {
        if (feedLocationLabel && feedScheduleLabel) {
            return [feedLocationLabel, feedScheduleLabel];
        }

        if (feedLocationLabel) {
            return [feedLocationLabel];
        }

        if (feedScheduleLabel) {
            return [feedScheduleLabel];
        }

        if (post.subInfo) {
            return [post.subInfo];
        }

        return [];
    }, [feedLocationLabel, feedScheduleLabel, post.subInfo]);
    const marketplaceLabel = React.useMemo(() => buildMarketplaceLabel(post), [post]);
    const isPaidMarketplace = Boolean(post.marketplace.productId);
    const isOwnedMarketplace = post.marketplace.purchaseState === 'owned';

    const renderMenuButton = React.useCallback((isOnImage = false) => {
        if (!onOpenActions) {
            return null;
        }

        return (
            <Pressable
                accessibilityLabel={`${post.title} 메뉴 열기`}
                accessibilityRole="button"
                disabled={disabled}
                hitSlop={10}
                onPress={(event) => {
                    event.stopPropagation?.();
                    onOpenActions();
                }}
                style={({ pressed }) => [
                    styles.menuButton,
                    isOnImage ? styles.menuButtonOnImage : null,
                    pressed && !disabled ? styles.menuButtonPressed : null
                ]}
            >
                <View style={styles.menuDotsRow}>
                    <View style={[styles.menuDot, isOnImage ? styles.menuDotOnImage : null]} />
                    <View style={[styles.menuDot, isOnImage ? styles.menuDotOnImage : null]} />
                    <View style={[styles.menuDot, isOnImage ? styles.menuDotOnImage : null]} />
                </View>
            </Pressable>
        );
    }, [disabled, onOpenActions, post.title, styles]);

    if (variant === 'feed') {
        return (
            <View style={[styles.feedRowFrame, disabled ? styles.cardDisabled : null]}>
                <Pressable
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={onPress}
                    style={({ pressed }) => [
                        styles.feedRow,
                        pressed && !disabled ? styles.feedRowPressed : null
                    ]}
                >
                    <View style={styles.feedVisual}>
                        {hasCoverImage ? (
                            <View style={styles.feedVisualImageFrame}>
                                <Image
                                    source={{ uri: post.coverImage as string }}
                                    resizeMode="cover"
                                    style={styles.feedVisualImage}
                                />
                            </View>
                        ) : (
                            <View style={styles.feedVisualFallback}>
                                <View style={styles.feedVisualAccent} />
                                <Text style={styles.feedVisualFallbackText}>공유</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.feedBody}>
                        <View style={styles.feedTopRow}>
                            <View style={styles.feedTextWrap}>
                                <EmojiText style={styles.feedTitle} numberOfLines={1}>
                                    {post.title}
                                </EmojiText>
                                <View style={styles.feedAuthorRow}>
                                    <AvatarImage
                                        uri={post.authorPhotoURL}
                                        label={post.authorName}
                                        size={20}
                                        textSize={11}
                                        tone="warning"
                                    />
                                    <EmojiText style={styles.feedAuthorName} numberOfLines={1}>
                                        {post.authorName}
                                    </EmojiText>
                                    <Text style={styles.feedMetaDivider}>·</Text>
                                    <EmojiText style={styles.feedAuthorMeta} numberOfLines={1}>
                                        {post.publishedLabel}
                                    </EmojiText>
                                </View>
                                {feedLocationScheduleLine ? (
                                    <EmojiText style={styles.feedMetaLine} numberOfLines={1}>
                                        {feedLocationScheduleLine}
                                    </EmojiText>
                                ) : null}
                            </View>
                            {renderMenuButton(false)}
                        </View>

                        <View style={styles.feedBottomRow}>
                            <View style={[
                                styles.feedMetaChip,
                                isPaidMarketplace ? styles.marketplaceChip : null,
                                isOwnedMarketplace ? styles.marketplaceChipOwned : null
                            ]}>
                                <Text style={[
                                    styles.feedMetaChipText,
                                    isPaidMarketplace ? styles.marketplaceChipText : null,
                                    isOwnedMarketplace ? styles.marketplaceChipOwnedText : null
                                ]}>
                                    {marketplaceLabel}
                                </Text>
                            </View>
                            <View style={styles.feedMetaChip}>
                                <Text style={styles.feedMetaChipText}>{post.dayCount}</Text>
                            </View>
                            <View style={styles.feedMetaChip}>
                                <Text style={styles.feedMetaChipText}>좋아요 {post.likesCount}</Text>
                            </View>
                            <View style={styles.feedMetaChip}>
                                <Text style={styles.feedMetaChipText}>복사 {post.clonesCount}</Text>
                            </View>
                        </View>
                    </View>
                </Pressable>
                <View style={styles.feedDivider} />
            </View>
        );
    }

    return (
        <View style={[styles.cardFrame, disabled ? styles.cardDisabled : null]}>
            <Pressable
                accessibilityRole="button"
                disabled={disabled}
                onPress={onPress}
                style={({ pressed }) => [
                    styles.cardContent,
                    pressed && !disabled ? styles.cardPressed : null
                ]}
            >
                <View style={styles.headerShell}>
                    {hasCoverImage ? (
                        <>
                            <Image source={{ uri: post.coverImage as string }} style={styles.headerImage} />
                            <View style={styles.headerImageOverlay} />
                        </>
                    ) : (
                        <View style={styles.headerFallback}>
                            <View style={styles.headerFallbackAccent} />
                        </View>
                    )}
                    <View style={styles.headerShellContent}>
                        <View style={styles.headerTopRow}>
                            <View style={[
                                styles.badge,
                                styles.authorBadge,
                                hasCoverImage ? styles.badgeOnImage : null
                            ]}>
                                <View style={styles.authorBadgeContent}>
                                    <AvatarImage
                                        uri={post.authorPhotoURL}
                                        label={post.authorName}
                                        size={18}
                                        textSize={10}
                                        tone="warning"
                                    />
                                    <EmojiText
                                        style={[styles.badgeText, hasCoverImage ? styles.badgeTextOnImage : null]}
                                        numberOfLines={1}
                                    >
                                        PLIN 큐레이션
                                    </EmojiText>
                                </View>
                            </View>
                            {renderMenuButton(hasCoverImage)}
                        </View>

                        <View style={styles.headerBottom}>
                            <View style={styles.cardMetaRow}>
                                <View style={[
                                    styles.metaChip,
                                    isPaidMarketplace ? styles.marketplaceChip : null,
                                    isOwnedMarketplace ? styles.marketplaceChipOwned : null,
                                    hasCoverImage ? styles.marketplaceChipOnImage : null
                                ]}>
                                    <Text
                                        style={[
                                            styles.metaChipText,
                                            isPaidMarketplace ? styles.marketplaceChipText : null,
                                            isOwnedMarketplace ? styles.marketplaceChipOwnedText : null,
                                            hasCoverImage ? styles.marketplaceChipTextOnImage : null
                                        ]}
                                    >
                                        {marketplaceLabel}
                                    </Text>
                                </View>
                                <View style={[styles.metaChip, hasCoverImage ? styles.metaChipOnImage : null]}>
                                    <Text
                                        style={[
                                            styles.metaChipText,
                                            hasCoverImage ? styles.metaChipTextOnImage : null
                                        ]}
                                    >
                                        {post.dayCount}
                                    </Text>
                                </View>
                                <View style={[styles.metaChip, hasCoverImage ? styles.metaChipOnImage : null]}>
                                    <Text
                                        style={[
                                            styles.metaChipText,
                                            hasCoverImage ? styles.metaChipTextOnImage : null
                                        ]}
                                    >
                                        {`좋아요 ${post.likesCount}`}
                                    </Text>
                                </View>
                                <View style={[styles.metaChip, hasCoverImage ? styles.metaChipOnImage : null]}>
                                    <Text
                                        style={[
                                            styles.metaChipText,
                                            hasCoverImage ? styles.metaChipTextOnImage : null
                                        ]}
                                    >
                                        {`복사 ${post.clonesCount}`}
                                    </Text>
                                </View>
                                <View style={[styles.dateChip, hasCoverImage ? styles.dateChipOnImage : null]}>
                                    <Text
                                        style={[
                                            styles.dateChipText,
                                            hasCoverImage ? styles.dateChipTextOnImage : null
                                        ]}
                                    >
                                        {post.publishedLabel}
                                    </Text>
                                </View>
                            </View>
                            <EmojiText
                                style={[styles.title, hasCoverImage ? styles.titleOnImage : null]}
                                numberOfLines={2}
                            >
                                {post.title}
                            </EmojiText>
                            {cardMetaLines.map((line, index) => (
                                <EmojiText
                                    key={`${post.id}-meta-${index}`}
                                    style={[
                                        styles.subInfo,
                                        index > 0 ? styles.subInfoSecondary : null,
                                        hasCoverImage ? styles.subInfoOnImage : null
                                    ]}
                                    numberOfLines={1}
                                >
                                    {line}
                                </EmojiText>
                            ))}
                        </View>
                    </View>
                </View>
            </Pressable>
        </View>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    cardFrame: {
        marginBottom: theme.spacing.sm
    },
    feedRowFrame: {
        paddingBottom: theme.spacing.sm
    },
    feedRow: {
        flexDirection: 'row',
        alignItems: 'stretch'
    },
    feedRowPressed: {
        opacity: 0.84
    },
    feedDivider: {
        marginTop: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border
    },
    cardDisabled: {
        opacity: 0.7
    },
    cardContent: {
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface
    },
    cardPressed: {
        opacity: 0.9
    },
    feedVisual: {
        width: 88,
        height: 120,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#f3ecdf'
    },
    feedVisualImageFrame: {
        flex: 1,
        borderRadius: theme.radius.md,
        overflow: 'hidden'
    },
    feedVisualImage: {
        width: '100%',
        height: '100%'
    },
    feedVisualFallback: {
        flex: 1,
        justifyContent: 'space-between',
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#f3ecdf',
        padding: theme.spacing.sm
    },
    feedVisualAccent: {
        width: 32,
        height: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.accent
    },
    feedVisualFallbackText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    feedBody: {
        flex: 1,
        minHeight: 120,
        marginLeft: theme.spacing.sm,
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.micro
    },
    feedTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start'
    },
    feedTextWrap: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    feedTitle: {
        color: theme.colors.textPrimary,
        fontSize: 19,
        lineHeight: 26,
        fontFamily: theme.fonts.bold
    },
    feedAuthorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minWidth: 0,
        marginTop: theme.spacing.xs
    },
    feedAuthorName: {
        marginLeft: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold,
        flexShrink: 1
    },
    feedAuthorMeta: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.body,
        flexShrink: 1
    },
    feedMetaDivider: {
        marginHorizontal: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    feedMetaLine: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    feedMetaLineSecondary: {
        marginTop: theme.spacing.micro
    },
    feedBottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: theme.spacing.xs
    },
    feedMetaChip: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 28,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 0,
        borderRadius: theme.radius.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    feedMetaChipText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        textAlignVertical: 'center',
        fontFamily: theme.fonts.semibold
    },
    marketplaceChip: {
        backgroundColor: theme.colors.accentSoft
    },
    marketplaceChipOwned: {
        backgroundColor: theme.mode === 'dark' ? '#234139' : '#ddf4e8'
    },
    marketplaceChipText: {
        color: theme.colors.accent
    },
    marketplaceChipOwnedText: {
        color: theme.mode === 'dark' ? '#9be0bf' : '#257a4e'
    },
    headerShell: {
        minHeight: 192,
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#f3ecdf'
    },
    headerFallback: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.mode === 'dark' ? '#26211d' : '#efe4d3'
    },
    headerFallbackAccent: {
        position: 'absolute',
        top: theme.spacing.sm,
        right: theme.spacing.sm,
        width: 72,
        height: 72,
        borderRadius: theme.radius.md,
        backgroundColor: 'rgba(255, 102, 0, 0.14)'
    },
    headerImage: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%'
    },
    headerImageOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: theme.mode === 'dark'
            ? 'rgba(12, 14, 18, 0.54)'
            : 'rgba(26, 28, 32, 0.38)'
    },
    headerShellContent: {
        flex: 1,
        justifyContent: 'space-between',
        padding: theme.spacing.sm
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    headerBottom: {
        marginTop: theme.spacing.md
    },
    cardMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginBottom: theme.spacing.xs
    },
    badge: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    authorBadge: {
        flexShrink: 1,
        maxWidth: '82%'
    },
    authorBadgeContent: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    badgeText: {
        marginLeft: theme.spacing.micro,
        fontSize: 12,
        fontFamily: theme.fonts.semibold,
        color: theme.colors.accent
    },
    badgeOnImage: {
        backgroundColor: 'rgba(18, 24, 32, 0.34)'
    },
    badgeTextOnImage: {
        color: '#ffffff'
    },
    metaChip: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 28,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 0,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    metaChipText: {
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        textAlignVertical: 'center',
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold
    },
    metaChipOnImage: {
        backgroundColor: 'rgba(18, 24, 32, 0.34)'
    },
    metaChipTextOnImage: {
        color: '#ffffff'
    },
    marketplaceChipOnImage: {
        backgroundColor: 'rgba(255, 102, 0, 0.76)'
    },
    marketplaceChipTextOnImage: {
        color: '#ffffff'
    },
    dateChip: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 28,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 0,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    dateChipOnImage: {
        backgroundColor: 'rgba(18, 24, 32, 0.34)'
    },
    dateChipText: {
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        textAlignVertical: 'center',
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.semibold
    },
    dateChipTextOnImage: {
        color: '#ffffff'
    },
    title: {
        fontSize: 21,
        lineHeight: 27,
        fontFamily: theme.fonts.bold,
        color: theme.colors.textPrimary
    },
    titleOnImage: {
        color: '#ffffff'
    },
    subInfo: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    subInfoSecondary: {
        marginTop: theme.spacing.micro
    },
    subInfoOnImage: {
        color: 'rgba(255, 255, 255, 0.92)'
    },
    menuButton: {
        width: 36,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center'
    },
    menuButtonOnImage: {
        backgroundColor: 'transparent'
    },
    menuButtonPressed: {
        opacity: 0.82
    },
    menuDotsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.micro
    },
    menuDot: {
        width: 4,
        height: 4,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.textPrimary
    },
    menuDotOnImage: {
        backgroundColor: '#ffffff'
    }
});
