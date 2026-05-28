import React from 'react';
import {
    Animated,
    Image,
    Linking,
    Modal,
    PanResponder,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View
} from 'react-native';

import { type AppTheme, useAppTheme } from '@/theme';
import type {
    MobileTimelineDisplayItem,
    MobileTransitDetailedStep,
    MobileTripDaySection
} from '@/types/trip';
import { buildCachedImageSource } from '@/utils/image-cache';
import { SheetBackButton } from './SheetBackButton';

type Props = {
    day: MobileTripDaySection | null;
    item: MobileTimelineDisplayItem | null;
    itemIndex?: number;
    visible: boolean;
    onClose(): void;
};

function buildTimelineRouteQuery(item: MobileTimelineDisplayItem | null | undefined) {
    if (!item) {
        return '';
    }

    return [item.title, item.location]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(', ');
}

function hasTimelineRouteAnchor(item: MobileTimelineDisplayItem | null | undefined) {
    if (!item) {
        return false;
    }

    const hasCoordinates = typeof item.latitude === 'number'
        && Number.isFinite(item.latitude)
        && typeof item.longitude === 'number'
        && Number.isFinite(item.longitude);

    return hasCoordinates || Boolean(buildTimelineRouteQuery(item));
}

function findTimelineRouteAnchors(day: MobileTripDaySection | null, itemIndex: number) {
    const items = Array.isArray(day?.items) ? day.items : [];
    let previousPlace: MobileTimelineDisplayItem | null = null;
    let nextPlace: MobileTimelineDisplayItem | null = null;

    for (let index = Math.min(itemIndex - 1, items.length - 1); index >= 0; index -= 1) {
        const item = items[index];
        if (!item?.isTransit && item.badgeLabel !== '메모' && hasTimelineRouteAnchor(item)) {
            previousPlace = item;
            break;
        }
    }

    for (let index = itemIndex + 1; index < items.length; index += 1) {
        const item = items[index];
        if (!item?.isTransit && item.badgeLabel !== '메모' && hasTimelineRouteAnchor(item)) {
            nextPlace = item;
            break;
        }
    }

    return {
        previousPlace,
        nextPlace,
        canOpenRoute: Boolean(previousPlace && nextPlace)
    };
}

function resolveTransitStepFlowLabel(step: MobileTransitDetailedStep) {
    const tag = String(step.tag || '').trim();
    if (tag) {
        return tag;
    }

    const title = String(step.title || '').trim();
    if (title) {
        return title;
    }

    return String(step.type || '').trim() === 'walk' ? '도보' : '이동';
}

function buildTransitStepSupportText(step: MobileTransitDetailedStep) {
    const parts: string[] = [];
    const time = String(step.time || '').trim();
    const note = String(step.note || '').trim();
    const headsign = String(step.transitInfo?.headsign || '').trim();
    const numStops = typeof step.transitInfo?.numStops === 'number' && step.transitInfo.numStops > 0
        ? step.transitInfo.numStops
        : 0;

    if (time) {
        parts.push(time);
    }

    if (headsign) {
        parts.push(headsign);
    }

    if (numStops > 0) {
        parts.push(`${numStops}개 정류장`);
    }

    if (note) {
        parts.push(note);
    }

    return parts.join(' · ');
}

function formatMemoryDate(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }

    return parsed.toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric'
    });
}

function getTimelineMemoryPhotoUrls(item: MobileTimelineDisplayItem) {
    return item.memoryEntries
        .map((memory) => String(memory.photoUrl || '').trim())
        .filter(Boolean);
}

function openExternalUrl(url: string) {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) {
        return;
    }

    void Linking.openURL(safeUrl);
}

export function TimelineItemDetailSheet({
    day,
    item,
    itemIndex,
    visible,
    onClose
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { height: windowHeight } = useWindowDimensions();
    const sheetHeight = windowHeight;
    const translateY = React.useRef(new Animated.Value(sheetHeight)).current;

    const selectedItemIndex = React.useMemo(() => {
        if (typeof itemIndex === 'number') {
            return itemIndex;
        }

        return day && item ? day.items.findIndex((entry) => entry.id === item.id) : -1;
    }, [day, item, itemIndex]);
    const isStandaloneMemo = Boolean(item && !item.isTransit && item.badgeLabel === '메모');
    const headerTitle = isStandaloneMemo ? '메모 상세' : item?.isTransit ? '이동 상세' : '일정 상세';
    const detailTitle = isStandaloneMemo
        ? '메모'
        : String(item?.title || '').trim()
            || String(item?.badgeLabel || '').trim()
            || '일정 상세';
    const dayMeta = [day?.label, day?.date]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' · ');
    const statLabel = isStandaloneMemo
        ? ''
        : String(item?.transitWindowLabel || item?.timeLabel || '').trim() || '시간 미정';
    const memoBody = String(item?.note || item?.title || '').trim() || '등록된 메모가 아직 없어요.';
    const memoryPhotoUrls = React.useMemo(
        () => item ? getTimelineMemoryPhotoUrls(item) : [],
        [item]
    );
    const routeAnchors = React.useMemo(
        () => item?.isTransit ? findTimelineRouteAnchors(day, selectedItemIndex) : null,
        [day, item?.isTransit, selectedItemIndex]
    );
    const shouldShowStats = Boolean(
        item && (
            String(item.badgeLabel || '').trim()
            || dayMeta
            || (!isStandaloneMemo && statLabel)
            || String(item.durationLabel || '').trim()
            || String(item.expenseSummaryLabel || '').trim()
        )
    );

    const closeWithAnimation = React.useCallback(() => {
        Animated.timing(translateY, {
            toValue: sheetHeight,
            duration: 190,
            useNativeDriver: true
        }).start(({ finished }) => {
            if (finished) {
                onClose();
            }
        });
    }, [onClose, sheetHeight, translateY]);

    const panResponder = React.useMemo(() => PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => (
            Math.abs(gestureState.dy) > 4 && gestureState.dy > Math.abs(gestureState.dx)
        ),
        onPanResponderMove: (_, gestureState) => {
            translateY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_, gestureState) => {
            if (gestureState.dy > 92 || gestureState.vy > 0.85) {
                closeWithAnimation();
                return;
            }

            Animated.spring(translateY, {
                toValue: 0,
                damping: 22,
                stiffness: 230,
                mass: 0.9,
                useNativeDriver: true
            }).start();
        },
        onPanResponderTerminate: () => {
            Animated.spring(translateY, {
                toValue: 0,
                damping: 22,
                stiffness: 230,
                mass: 0.9,
                useNativeDriver: true
            }).start();
        }
    }), [closeWithAnimation, translateY]);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        translateY.stopAnimation();
        translateY.setValue(sheetHeight);
        Animated.spring(translateY, {
            toValue: 0,
            damping: 24,
            stiffness: 220,
            mass: 0.95,
            useNativeDriver: true
        }).start();
    }, [sheetHeight, translateY, visible]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={closeWithAnimation}
        >
            <View style={styles.modalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeWithAnimation}>
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.modalBackdrop,
                            {
                                opacity: translateY.interpolate({
                                    inputRange: [0, sheetHeight],
                                    outputRange: [1, 0],
                                    extrapolate: 'clamp'
                                })
                            }
                        ]}
                    />
                </Pressable>
                {item && day ? (
                    <Animated.View
                        style={[
                            styles.sheet,
                            {
                                height: sheetHeight,
                                transform: [{ translateY }]
                            }
                        ]}
                    >
                        <View
                            {...panResponder.panHandlers}
                            collapsable={false}
                            style={styles.sheetHandleTouch}
                        >
                            <View style={styles.sheetHandle} />
                        </View>
                        <View style={styles.sheetHeader}>
                            <SheetBackButton onPress={closeWithAnimation} />
                            <View style={styles.sheetHeaderCopy}>
                                <Text numberOfLines={1} style={styles.sheetTitle}>{headerTitle}</Text>
                            </View>
                            <View style={styles.sheetHeaderSpacer} />
                        </View>
                        <ScrollView
                            style={styles.sheetScroll}
                            contentContainerStyle={styles.sheetContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.summaryCard}>
                                <Text numberOfLines={2} style={styles.summaryTitle}>{detailTitle}</Text>
                                {shouldShowStats ? (
                                    <View style={styles.metaRow}>
                                        {item.badgeLabel ? (
                                            <View style={styles.statPill}>
                                                <Text style={styles.statPillText}>{item.badgeLabel}</Text>
                                            </View>
                                        ) : null}
                                        {dayMeta ? (
                                            <View style={styles.statPill}>
                                                <Text style={styles.statPillText}>{dayMeta}</Text>
                                            </View>
                                        ) : null}
                                        {statLabel ? (
                                            <View style={styles.statPill}>
                                                <Text style={styles.statPillText}>{statLabel}</Text>
                                            </View>
                                        ) : null}
                                        {item.durationLabel ? (
                                            <View style={styles.statPill}>
                                                <Text style={styles.statPillText}>{item.durationLabel}</Text>
                                            </View>
                                        ) : null}
                                        {item.expenseSummaryLabel ? (
                                            <View style={styles.statPill}>
                                                <Text style={styles.statPillText}>{item.expenseSummaryLabel}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                ) : null}
                            </View>

                            {item.location || (item.isTransit && routeAnchors?.canOpenRoute) ? (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>{item.isTransit ? '경로' : '위치'}</Text>
                                    {item.location ? <Text style={styles.sectionBody}>{item.location}</Text> : null}
                                    {item.isTransit && routeAnchors?.canOpenRoute ? (
                                        <Text style={styles.sectionSupport}>
                                            {buildTimelineRouteQuery(routeAnchors.previousPlace)} → {buildTimelineRouteQuery(routeAnchors.nextPlace)}
                                        </Text>
                                    ) : null}
                                </View>
                            ) : null}

                            {item.isTransit && item.transitDetailedSteps.length > 0 ? (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>상세 경로</Text>
                                    <View style={styles.transitFlowRow}>
                                        {item.transitDetailedSteps.map((step, index) => {
                                            const flowLabel = resolveTransitStepFlowLabel(step);
                                            const isWalkingStep = String(step.type || '').trim() === 'walk';
                                            const flowChipStyle = step.color
                                                ? {
                                                    backgroundColor: step.color,
                                                    borderColor: step.color
                                                }
                                                : isWalkingStep
                                                    ? {
                                                        backgroundColor: theme.colors.accentSoft,
                                                        borderColor: theme.colors.accent
                                                    }
                                                    : null;
                                            const flowChipTextStyle = step.textColor
                                                ? { color: step.textColor }
                                                : isWalkingStep
                                                    ? { color: theme.colors.accent }
                                                    : null;

                                            return (
                                                <React.Fragment key={`${item.id}-flow-${index}`}>
                                                    <View style={[styles.transitFlowChip, flowChipStyle]}>
                                                        <Text style={[styles.transitFlowChipText, flowChipTextStyle]}>
                                                            {flowLabel}
                                                        </Text>
                                                    </View>
                                                    {index < item.transitDetailedSteps.length - 1 ? (
                                                        <Text style={styles.transitFlowArrow}>→</Text>
                                                    ) : null}
                                                </React.Fragment>
                                            );
                                        })}
                                    </View>

                                    <View style={styles.transitDetailList}>
                                        {item.transitDetailedSteps.map((step, index) => {
                                            const isWalkingStep = String(step.type || '').trim() === 'walk';
                                            const supportText = buildTransitStepSupportText(step);
                                            const depStop = String(step.transitInfo?.depStop || '').trim();
                                            const arrStop = String(step.transitInfo?.arrStop || '').trim();
                                            const depTime = String(step.transitInfo?.start || '').trim();
                                            const arrTime = String(step.transitInfo?.end || '').trim();
                                            const chipStyle = step.color
                                                ? {
                                                    backgroundColor: step.color,
                                                    borderColor: step.color
                                                }
                                                : isWalkingStep
                                                    ? {
                                                        backgroundColor: theme.colors.accentSoft,
                                                        borderColor: theme.colors.accent
                                                    }
                                                    : null;
                                            const chipTextStyle = step.textColor
                                                ? { color: step.textColor }
                                                : isWalkingStep
                                                    ? { color: theme.colors.accent }
                                                    : null;

                                            return (
                                                <View
                                                    key={`${item.id}-detail-step-${index}`}
                                                    style={[
                                                        styles.transitDetailCard,
                                                        index < item.transitDetailedSteps.length - 1
                                                            ? styles.transitDetailCardSpaced
                                                            : null
                                                    ]}
                                                >
                                                    <View style={styles.transitDetailTitleRow}>
                                                        <Text style={styles.transitDetailTitle}>
                                                            {String(step.title || '').trim() || resolveTransitStepFlowLabel(step)}
                                                        </Text>
                                                        {String(step.tag || '').trim() ? (
                                                            <View style={[styles.transitDetailTag, chipStyle]}>
                                                                <Text style={[styles.transitDetailTagText, chipTextStyle]}>
                                                                    {String(step.tag || '').trim()}
                                                                </Text>
                                                            </View>
                                                        ) : null}
                                                    </View>
                                                    {supportText ? (
                                                        <Text style={styles.transitDetailSupport}>{supportText}</Text>
                                                    ) : null}

                                                    {depStop || arrStop ? (
                                                        <View style={styles.transitDetailStops}>
                                                            {depStop ? (
                                                                <View style={styles.transitDetailStopRow}>
                                                                    <View style={styles.transitDetailStopMarkerStart} />
                                                                    <View style={styles.transitDetailStopCopy}>
                                                                        <Text style={styles.transitDetailStopLabel}>출발</Text>
                                                                        <Text style={styles.transitDetailStopName}>{depStop}</Text>
                                                                        {depTime ? (
                                                                            <Text style={styles.transitDetailStopTime}>{depTime} 출발</Text>
                                                                        ) : null}
                                                                    </View>
                                                                </View>
                                                            ) : null}
                                                            {arrStop ? (
                                                                <View style={styles.transitDetailStopRow}>
                                                                    <View style={styles.transitDetailStopMarkerEnd} />
                                                                    <View style={styles.transitDetailStopCopy}>
                                                                        <Text style={styles.transitDetailStopLabel}>도착</Text>
                                                                        <Text style={styles.transitDetailStopName}>{arrStop}</Text>
                                                                        {arrTime ? (
                                                                            <Text style={styles.transitDetailStopTime}>{arrTime} 도착</Text>
                                                                        ) : null}
                                                                    </View>
                                                                </View>
                                                            ) : null}
                                                        </View>
                                                    ) : null}
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            ) : null}

                            {isStandaloneMemo ? (
                                <View style={[styles.section, styles.memoSection]}>
                                    <Text style={styles.memoBody}>{memoBody}</Text>
                                </View>
                            ) : (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>메모 / 설명</Text>
                                    <Text style={styles.sectionBody}>
                                        {item.note || '등록된 메모가 아직 없어요.'}
                                    </Text>
                                </View>
                            )}

                            {item.memoryEntries.length > 0 ? (
                                <View style={styles.section}>
                                    <View style={styles.sectionHeaderRow}>
                                        <View style={styles.sectionHeaderCopy}>
                                            <Text style={styles.sectionLabel}>추억</Text>
                                            <Text style={styles.sectionSupport}>
                                                기록 {item.memoryEntries.length}개
                                                {memoryPhotoUrls.length > 0 ? ` · 사진 ${memoryPhotoUrls.length}장` : ''}
                                            </Text>
                                        </View>
                                    </View>
                                    <ScrollView
                                        horizontal
                                        nestedScrollEnabled
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.memoryStrip}
                                    >
                                        {item.memoryEntries.map((memory, index) => {
                                            const memoryPreviewUrl = String(memory.previewUrl || memory.photoUrl || '').trim();

                                            return (
                                                <View
                                                    key={memory.id}
                                                    style={[
                                                        styles.memoryCard,
                                                        index < item.memoryEntries.length - 1 ? styles.memoryCardSpaced : null
                                                    ]}
                                                >
                                                    {memoryPreviewUrl ? (
                                                        <Image
                                                            source={buildCachedImageSource(memoryPreviewUrl)}
                                                            style={styles.memoryImage}
                                                        />
                                                    ) : (
                                                        <View style={styles.memoryImageFallback}>
                                                            <Text style={styles.memoryImageFallbackText}>사진</Text>
                                                        </View>
                                                    )}
                                                    {memory.createdAt ? (
                                                        <Text style={styles.memoryDate}>{formatMemoryDate(memory.createdAt)}</Text>
                                                    ) : null}
                                                </View>
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            ) : null}

                            {item.attachments.length > 0 ? (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>첨부 파일</Text>
                                    <Text style={styles.sectionSupport}>첨부 {item.attachments.length}개</Text>

                                    {item.attachments.some((attachment) => attachment.kind === 'image') ? (
                                        <ScrollView
                                            horizontal
                                            nestedScrollEnabled
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.attachmentImageStrip}
                                        >
                                            {item.attachments
                                                .filter((attachment) => attachment.kind === 'image')
                                                .map((attachment, index, entries) => (
                                                    <Pressable
                                                        key={attachment.id}
                                                        accessibilityRole="button"
                                                        onPress={() => {
                                                            openExternalUrl(attachment.url);
                                                        }}
                                                        style={({ pressed }) => [
                                                            styles.attachmentImageCard,
                                                            index < entries.length - 1 ? styles.attachmentImageCardSpaced : null,
                                                            pressed ? styles.attachmentCardPressed : null
                                                        ]}
                                                    >
                                                        {attachment.previewUrl ? (
                                                            <Image
                                                                source={buildCachedImageSource(attachment.previewUrl)}
                                                                style={styles.attachmentImage}
                                                            />
                                                        ) : (
                                                            <View style={styles.attachmentImageFallback}>
                                                                <Text style={styles.attachmentImageFallbackText}>이미지</Text>
                                                            </View>
                                                        )}
                                                        <Text style={styles.attachmentName} numberOfLines={2}>{attachment.name}</Text>
                                                    </Pressable>
                                                ))}
                                        </ScrollView>
                                    ) : null}

                                    {item.attachments.some((attachment) => attachment.kind !== 'image') ? (
                                        <View style={styles.attachmentFileList}>
                                            {item.attachments
                                                .filter((attachment) => attachment.kind !== 'image')
                                                .map((attachment) => (
                                                    <Pressable
                                                        key={attachment.id}
                                                        accessibilityRole="button"
                                                        onPress={() => {
                                                            openExternalUrl(attachment.url);
                                                        }}
                                                        style={({ pressed }) => [
                                                            styles.attachmentFileRow,
                                                            pressed ? styles.attachmentCardPressed : null
                                                        ]}
                                                    >
                                                        <View style={styles.attachmentFileCopy}>
                                                            <View style={styles.attachmentTypePill}>
                                                                <Text style={styles.attachmentTypePillText}>{attachment.typeLabel}</Text>
                                                            </View>
                                                            <Text style={styles.attachmentFileName} numberOfLines={2}>
                                                                {attachment.name}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.attachmentOpenText}>외부 열기</Text>
                                                    </Pressable>
                                                ))}
                                        </View>
                                    ) : null}
                                </View>
                            ) : null}

                            {item.expenseItems.length > 0 ? (
                                <View style={styles.section}>
                                    <Text style={styles.sectionLabel}>지출 내역</Text>
                                    <Text style={styles.sectionSupport}>
                                        총 {item.expenseItems.length}건 · 비용 {item.expenseItems[0] ? `₩${Math.round(item.expenseTotalAmount).toLocaleString()}` : ''}
                                    </Text>
                                    <View style={styles.expenseList}>
                                        {item.expenseItems.map((expense) => {
                                            const expenseTitle = String(expense.description || '').trim() || '이름 없는 지출';

                                            return (
                                                <View key={expense.id} style={styles.expenseRow}>
                                                    <View style={styles.expenseCopy}>
                                                        <Text numberOfLines={1} style={styles.expenseTitle}>{expenseTitle}</Text>
                                                    </View>
                                                    <Text numberOfLines={1} style={styles.expenseAmount}>
                                                        {expense.amountLabel}
                                                    </Text>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            ) : null}
                        </ScrollView>
                    </Animated.View>
                ) : null}
            </View>
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end'
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.38)'
    },
    sheet: {
        width: '100%',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    sheetHandleTouch: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: theme.spacing.xl,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    sheetHandle: {
        width: 56,
        height: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    sheetHeaderCopy: {
        flex: 1,
        justifyContent: 'center',
        minHeight: theme.spacing.xl,
        paddingRight: theme.spacing.sm
    },
    sheetHeaderSpacer: {
        width: theme.spacing.xl,
        height: theme.spacing.xl
    },
    sheetTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    sheetScroll: {
        flex: 1
    },
    sheetContent: {
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    summaryCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        marginBottom: theme.spacing.sm
    },
    summaryTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: theme.spacing.xs
    },
    statPill: {
        marginRight: theme.spacing.micro,
        marginBottom: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    statPillText: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    section: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    memoSection: {
        borderColor: theme.mode === 'dark' ? '#84693a' : '#edd49a',
        backgroundColor: theme.mode === 'dark' ? '#342a16' : '#fff6cf'
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between'
    },
    sectionHeaderCopy: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    sectionLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    sectionSupport: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    sectionBody: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    memoBody: {
        color: theme.mode === 'dark' ? '#f0c97f' : '#8b5b22',
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    transitFlowRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        marginTop: theme.spacing.xs
    },
    transitFlowChip: {
        marginBottom: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    transitFlowChipText: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        fontFamily: theme.fonts.semibold
    },
    transitFlowArrow: {
        marginHorizontal: theme.spacing.micro,
        marginBottom: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    transitDetailList: {
        marginTop: theme.spacing.xs
    },
    transitDetailCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    transitDetailCardSpaced: {
        marginBottom: theme.spacing.xs
    },
    transitDetailTitleRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center'
    },
    transitDetailTitle: {
        flexShrink: 1,
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    transitDetailTag: {
        marginLeft: theme.spacing.micro,
        marginTop: theme.spacing.micro,
        paddingHorizontal: theme.spacing.micro,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: theme.colors.accentSoft
    },
    transitDetailTagText: {
        color: theme.colors.accent,
        fontSize: 11,
        lineHeight: 15,
        includeFontPadding: false,
        fontFamily: theme.fonts.semibold
    },
    transitDetailSupport: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    transitDetailStops: {
        marginTop: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    transitDetailStopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start'
    },
    transitDetailStopMarkerStart: {
        width: 10,
        height: 10,
        marginTop: 4,
        marginRight: theme.spacing.xs,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.accent
    },
    transitDetailStopMarkerEnd: {
        width: 10,
        height: 10,
        marginTop: 4,
        marginRight: theme.spacing.xs,
        borderRadius: theme.radius.full,
        backgroundColor: theme.mode === 'dark' ? '#ff8a8a' : '#d9485a'
    },
    transitDetailStopCopy: {
        flex: 1,
        paddingBottom: theme.spacing.xs
    },
    transitDetailStopLabel: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.bold
    },
    transitDetailStopName: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    transitDetailStopTime: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    memoryStrip: {
        marginTop: theme.spacing.xs,
        paddingRight: theme.spacing.micro
    },
    memoryCard: {
        width: 180,
        padding: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    memoryCardSpaced: {
        marginRight: theme.spacing.xs
    },
    memoryImage: {
        width: '100%',
        height: 132,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    memoryImageFallback: {
        width: '100%',
        height: 132,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.warningSoft
    },
    memoryImageFallbackText: {
        color: theme.colors.warning,
        fontFamily: theme.fonts.bold
    },
    memoryDate: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    attachmentImageStrip: {
        marginTop: theme.spacing.xs,
        paddingRight: theme.spacing.micro
    },
    attachmentImageCard: {
        width: 164
    },
    attachmentImageCardSpaced: {
        marginRight: theme.spacing.xs
    },
    attachmentCardPressed: {
        opacity: 0.88
    },
    attachmentImage: {
        width: '100%',
        height: 112,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    attachmentImageFallback: {
        width: '100%',
        height: 112,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    attachmentImageFallbackText: {
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.bold
    },
    attachmentName: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.semibold
    },
    attachmentFileList: {
        marginTop: theme.spacing.xs
    },
    attachmentFileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    attachmentFileCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    attachmentTypePill: {
        alignSelf: 'flex-start',
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: 4,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    attachmentTypePillText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.bold
    },
    attachmentFileName: {
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.semibold
    },
    attachmentOpenText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    expenseList: {
        marginTop: theme.spacing.xs,
        gap: theme.spacing.xs
    },
    expenseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: theme.spacing.xxl,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background
    },
    expenseCopy: {
        flex: 1,
        minWidth: 0,
        paddingRight: theme.spacing.sm
    },
    expenseTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        fontSize: 15,
        lineHeight: 22
    },
    expenseAmount: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.bold,
        fontSize: 15,
        lineHeight: 22,
        textAlign: 'right'
    }
});
