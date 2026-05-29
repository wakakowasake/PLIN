import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import {
    ActivityIndicator,
    Image,
    Linking,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { mapTripDetail } from '@/mappers/trip-detail-mapper';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { BackendRequestError, fetchBackendJson } from '@/services/backend-client';
import { type AppTheme, useAppTheme } from '@/theme';
import type {
    MobileTimelineDisplayItem,
    MobileTransitRouteChip,
    MobileTripDaySection,
    MobileTripDetail,
    MobileTripListItem
} from '@/types/trip';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicTripView'>;
type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type PublicTripResponse = {
    trip?: Record<string, unknown> | null;
};

const PUBLIC_WEB_BASE_URL = 'https://plin.ink';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=ink.plin.mobile';

function buildPublicTripUrl(token: string) {
    return `${PUBLIC_WEB_BASE_URL}/p/${encodeURIComponent(token)}`;
}

function buildNativeDeepLink(token: string) {
    return `plinmobile://p/${encodeURIComponent(token)}`;
}

function resolvePublicAssetUrl(value?: string | null) {
    const url = String(value || '').trim();
    if (!url) {
        return '';
    }

    if (/^(https?:|data:|blob:)/i.test(url)) {
        return url;
    }

    if (url.startsWith('/')) {
        return `${PUBLIC_WEB_BASE_URL}${url}`;
    }

    return url;
}

function readPublicTripError(error: unknown) {
    if (error instanceof BackendRequestError) {
        if (error.status === 404) {
            return '공유된 일정을 찾지 못했어요. 링크가 만료되었거나 공유가 꺼졌을 수 있어요.';
        }

        return error.message || '공유 일정을 불러오지 못했어요.';
    }

    if (error instanceof Error && error.name !== 'AbortError') {
        return error.message || '공유 일정을 불러오지 못했어요.';
    }

    return '공유 일정을 불러오지 못했어요.';
}

function getTimelineIconName(item: MobileTimelineDisplayItem): IconName {
    if (item.isTransit) {
        if (item.transitType === 'airplane') return 'airplane';
        if (item.transitType === 'train') return 'train';
        if (item.transitType === 'subway') return 'subway-variant';
        if (item.transitType === 'bus') return 'bus';
        if (item.transitType === 'taxi') return 'taxi';
        if (item.transitType === 'walk') return 'walk';
        return 'map-marker-path';
    }

    if (item.badgeLabel.includes('식사')) return 'silverware-fork-knife';
    if (item.badgeLabel.includes('쇼핑')) return 'shopping-outline';
    if (item.badgeLabel.includes('숙소')) return 'bed-outline';
    return 'map-marker-outline';
}

function buildItemMetaLabels(item: MobileTimelineDisplayItem) {
    return [
        item.location,
        item.durationLabel,
        item.transitWindowLabel,
        item.expenseSummaryLabel,
        item.memoriesCount > 0 ? `사진 ${item.memoriesCount}` : ''
    ].filter(Boolean);
}

function renderRouteChipLabel(chip: MobileTransitRouteChip) {
    return String(chip.label || chip.type || '').trim();
}

export function PublicTripViewScreen({ route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const token = String(route.params?.token || '').trim();
    const publicTripUrl = React.useMemo(() => buildPublicTripUrl(token), [token]);
    const nativeDeepLink = React.useMemo(() => buildNativeDeepLink(token), [token]);
    const [trip, setTrip] = React.useState<MobileTripDetail | null>(null);
    const [isLoading, setLoading] = React.useState(Boolean(token));
    const [isRefreshing, setRefreshing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [selectedDayIndex, setSelectedDayIndex] = React.useState(0);
    const [isOpenChoiceVisible, setOpenChoiceVisible] = React.useState(false);
    const hasShownOpenChoiceRef = React.useRef(false);

    const loadTrip = React.useCallback(async (signal?: AbortSignal, mode: 'initial' | 'refresh' = 'initial') => {
        if (!token) {
            setTrip(null);
            setError('공유 링크 정보가 비어 있어요. 공유받은 링크를 다시 확인해 주세요.');
            setLoading(false);
            setRefreshing(false);
            return;
        }

        if (mode === 'refresh') {
            setRefreshing(true);
        } else {
            setLoading(true);
        }

        try {
            const response = await fetchBackendJson<PublicTripResponse>(
                `/public-trips/${encodeURIComponent(token)}`,
                { requireAuth: false, signal }
            );
            const sourceTrip = response.trip;
            if (!sourceTrip) {
                throw new Error('공유된 일정 정보가 비어 있어요.');
            }

            const mappedTrip = mapTripDetail(
                sourceTrip as Parameters<typeof mapTripDetail>[0],
                null,
                sourceTrip
            );
            setTrip(mappedTrip);
            setSelectedDayIndex(0);
            setError(null);
        } catch (loadError) {
            if (loadError instanceof Error && loadError.name === 'AbortError') {
                return;
            }

            setError(readPublicTripError(loadError));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    React.useEffect(() => {
        const controller = new AbortController();
        void loadTrip(controller.signal);
        return () => controller.abort();
    }, [loadTrip]);

    React.useEffect(() => {
        if (Platform.OS !== 'web' || !trip || hasShownOpenChoiceRef.current) {
            return;
        }

        hasShownOpenChoiceRef.current = true;
        setOpenChoiceVisible(true);
    }, [trip]);

    const activeDay = React.useMemo<MobileTripDaySection | null>(() => {
        if (!trip?.days.length) {
            return null;
        }

        return trip.days[Math.min(selectedDayIndex, trip.days.length - 1)] || trip.days[0];
    }, [selectedDayIndex, trip]);

    const handleRefresh = React.useCallback(() => {
        void loadTrip(undefined, 'refresh');
    }, [loadTrip]);

    const handleOpenApp = React.useCallback(async () => {
        try {
            await Linking.openURL(nativeDeepLink);
        } catch {
            await Linking.openURL(publicTripUrl);
        }
    }, [nativeDeepLink, publicTripUrl]);

    const handleOpenStore = React.useCallback(async () => {
        await Linking.openURL(ANDROID_STORE_URL);
    }, []);

    if (!token) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.centerState}>
                    <MaterialCommunityIcons color={theme.colors.accent} name="link-variant-off" size={42} />
                    <Text style={styles.stateTitle}>공유 링크를 열 수 없어요</Text>
                    <Text style={styles.stateDescription}>링크 정보가 비어 있어요. 공유받은 링크를 다시 확인해 주세요.</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (isLoading && !trip) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.centerState}>
                    <ActivityIndicator color={theme.colors.accent} size="large" />
                    <Text style={styles.stateTitle}>공유 일정을 열고 있어요</Text>
                    <Text style={styles.stateDescription}>잠시만 기다려 주세요.</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (error && !trip) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.centerState}>
                    <MaterialCommunityIcons color={theme.colors.warning} name="alert-circle-outline" size={44} />
                    <Text style={styles.stateTitle}>공유 일정을 볼 수 없어요</Text>
                    <Text style={styles.stateDescription}>{error}</Text>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => void loadTrip()}
                        style={({ pressed }) => [styles.primaryButton, pressed ? styles.buttonPressed : null]}
                    >
                        <Text style={styles.primaryButtonText}>다시 시도</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <ScrollView
                contentContainerStyle={styles.content}
                refreshControl={(
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor={theme.colors.accent}
                    />
                )}
            >
                {trip ? (
                    <>
                        <TripHero
                            styles={styles}
                            theme={theme}
                            trip={trip}
                            onOpenApp={handleOpenApp}
                        />
                        <TripSummary styles={styles} trip={trip} />
                        <DayTabs
                            styles={styles}
                            theme={theme}
                            days={trip.days}
                            selectedDayIndex={selectedDayIndex}
                            onSelectDay={setSelectedDayIndex}
                        />
                        <TimelineSection
                            styles={styles}
                            theme={theme}
                            day={activeDay}
                        />
                        <ListSection
                            styles={styles}
                            theme={theme}
                            title="체크리스트"
                            icon="checkbox-marked-circle-outline"
                            items={trip.checklist}
                        />
                        <ListSection
                            styles={styles}
                            theme={theme}
                            title="준비할 것"
                            icon="shopping-outline"
                            items={trip.shoppingList}
                        />
                    </>
                ) : null}
            </ScrollView>

            <OpenChoiceModal
                styles={styles}
                visible={isOpenChoiceVisible}
                onClose={() => setOpenChoiceVisible(false)}
                onOpenApp={handleOpenApp}
                onOpenStore={handleOpenStore}
            />
        </SafeAreaView>
    );
}

function TripHero({
    styles,
    theme,
    trip,
    onOpenApp
}: {
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
    trip: MobileTripDetail;
    onOpenApp(): void;
}) {
    const coverImage = resolvePublicAssetUrl(trip.coverImage);

    return (
        <View style={styles.hero}>
            {coverImage ? (
                <Image source={{ uri: coverImage }} style={styles.heroImage} resizeMode="cover" />
            ) : (
                <View style={styles.heroPlaceholder}>
                    <MaterialCommunityIcons color={theme.colors.accent} name="map-outline" size={44} />
                </View>
            )}
            <View style={styles.heroOverlay} />
            <View style={styles.heroContent}>
                <View style={styles.publicPill}>
                    <MaterialCommunityIcons color="#FFFFFF" name="link-variant" size={15} />
                    <Text style={styles.publicPillText}>공유된 일정</Text>
                </View>
                <Text style={styles.heroTitle}>{trip.title}</Text>
                <Text style={styles.heroSubtitle}>{[trip.subInfo, trip.dayCount].filter(Boolean).join(' · ')}</Text>
                {Platform.OS === 'web' ? (
                    <Pressable
                        accessibilityRole="button"
                        onPress={onOpenApp}
                        style={({ pressed }) => [styles.heroButton, pressed ? styles.buttonPressed : null]}
                    >
                        <MaterialCommunityIcons color="#FFFFFF" name="cellphone-arrow-down" size={18} />
                        <Text style={styles.heroButtonText}>앱에서 보기</Text>
                    </Pressable>
                ) : null}
            </View>
        </View>
    );
}

function TripSummary({
    styles,
    trip
}: {
    styles: ReturnType<typeof createStyles>;
    trip: MobileTripDetail;
}) {
    const stats = [
        { label: '일정', value: `${trip.days.length}일` },
        { label: '사진', value: `${trip.photoCount}장` },
        { label: '비용', value: trip.budgetSummary?.totalLabel || '기록 없음' }
    ];

    return (
        <View style={styles.summaryGrid}>
            {stats.map((stat) => (
                <View key={stat.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{stat.label}</Text>
                    <Text style={styles.summaryValue}>{stat.value}</Text>
                </View>
            ))}
        </View>
    );
}

function DayTabs({
    styles,
    theme,
    days,
    selectedDayIndex,
    onSelectDay
}: {
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
    days: MobileTripDaySection[];
    selectedDayIndex: number;
    onSelectDay(index: number): void;
}) {
    if (!days.length) {
        return null;
    }

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayTabs}
        >
            {days.map((day, index) => {
                const isSelected = index === selectedDayIndex;
                return (
                    <Pressable
                        key={day.id || index}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                        onPress={() => onSelectDay(index)}
                        style={({ pressed }) => [
                            styles.dayTab,
                            isSelected ? styles.dayTabActive : null,
                            pressed ? styles.buttonPressed : null
                        ]}
                    >
                        <Text style={[styles.dayTabLabel, isSelected ? styles.dayTabLabelActive : null]}>
                            {day.label || `Day ${index + 1}`}
                        </Text>
                        {day.date ? (
                            <Text style={[styles.dayTabDate, isSelected ? { color: '#FFFFFF' } : { color: theme.colors.textSecondary }]}>
                                {day.date}
                            </Text>
                        ) : null}
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

function TimelineSection({
    styles,
    theme,
    day
}: {
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
    day: MobileTripDaySection | null;
}) {
    if (!day) {
        return (
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>일정</Text>
                <EmptySection styles={styles} icon="calendar-blank-outline" text="공개된 일정이 아직 없어요." />
            </View>
        );
    }

    return (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <View>
                    <Text style={styles.sectionTitle}>{day.label || '일정'}</Text>
                    {day.date ? <Text style={styles.sectionCaption}>{day.date}</Text> : null}
                </View>
                {day.expenseTotalLabel ? (
                    <Text style={styles.sectionMeta}>{day.expenseTotalLabel}</Text>
                ) : null}
            </View>

            {day.items.length ? (
                <View style={styles.timelineList}>
                    {day.items.map((item) => (
                        <TimelineItemCard
                            key={item.id}
                            styles={styles}
                            theme={theme}
                            item={item}
                        />
                    ))}
                </View>
            ) : (
                <EmptySection styles={styles} icon="calendar-blank-outline" text="이 날짜에 공개된 일정이 없어요." />
            )}
        </View>
    );
}

function TimelineItemCard({
    styles,
    theme,
    item
}: {
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
    item: MobileTimelineDisplayItem;
}) {
    const metaLabels = buildItemMetaLabels(item);
    const photoUrls = item.photoPreviewUrls
        .map(resolvePublicAssetUrl)
        .filter(Boolean)
        .slice(0, 4);
    const routeChips = item.transitRouteChips.filter((chip) => renderRouteChipLabel(chip));

    return (
        <View style={styles.timelineCard}>
            <View style={styles.timelineTimeColumn}>
                <Text style={styles.timelineTime}>{item.timeLabel || '시간 미정'}</Text>
                <View style={styles.timelineDot}>
                    <MaterialCommunityIcons color="#FFFFFF" name={getTimelineIconName(item)} size={15} />
                </View>
            </View>
            <View style={styles.timelineBody}>
                <View style={styles.timelineTitleRow}>
                    <Text style={styles.timelineTitle}>{item.title || '제목 없는 일정'}</Text>
                    {!routeChips.length && item.badgeLabel ? (
                        <View style={styles.categoryChip}>
                            <Text style={styles.categoryChipText}>{item.badgeLabel}</Text>
                        </View>
                    ) : null}
                </View>

                {routeChips.length ? (
                    <View style={styles.routeChipRow}>
                        {routeChips.map((chip, index) => (
                            <View
                                key={`${chip.label}-${index}`}
                                style={[
                                    styles.routeChip,
                                    chip.color ? { backgroundColor: chip.color } : null
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.routeChipText,
                                        chip.textColor ? { color: chip.textColor } : null
                                    ]}
                                >
                                    {renderRouteChipLabel(chip)}
                                </Text>
                            </View>
                        ))}
                    </View>
                ) : null}

                {metaLabels.length ? (
                    <Text style={styles.timelineMeta}>{metaLabels.join(' · ')}</Text>
                ) : null}
                {item.note ? <Text style={styles.timelineNote}>{item.note}</Text> : null}

                {photoUrls.length ? (
                    <View style={styles.photoStrip}>
                        {photoUrls.map((url, index) => (
                            <Image
                                key={`${url}-${index}`}
                                source={{ uri: url }}
                                style={styles.photoThumb}
                                resizeMode="cover"
                            />
                        ))}
                    </View>
                ) : null}

                {item.expenseItems.length ? (
                    <View style={styles.expenseBox}>
                        {item.expenseItems.slice(0, 2).map((expense) => (
                            <Text key={expense.id} style={styles.expenseText}>
                                {expense.title || '비용'} · {expense.amountLabel}
                            </Text>
                        ))}
                    </View>
                ) : null}
            </View>
        </View>
    );
}

function ListSection({
    styles,
    theme,
    title,
    icon,
    items
}: {
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
    title: string;
    icon: IconName;
    items: MobileTripListItem[];
}) {
    if (!items.length) {
        return null;
    }

    return (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <View style={styles.listTitleRow}>
                    <MaterialCommunityIcons color={theme.colors.accent} name={icon} size={20} />
                    <Text style={styles.sectionTitle}>{title}</Text>
                </View>
                <Text style={styles.sectionMeta}>{items.length}개</Text>
            </View>
            <View style={styles.listCard}>
                {items.slice(0, 8).map((item) => (
                    <View key={item.id} style={styles.listItem}>
                        <MaterialCommunityIcons
                            color={item.checked ? theme.colors.accent : theme.colors.textSecondary}
                            name={item.checked ? 'check-circle' : 'circle-outline'}
                            size={19}
                        />
                        <View style={styles.listItemBody}>
                            <Text style={[styles.listItemText, item.checked ? styles.listItemTextDone : null]}>
                                {item.text}
                            </Text>
                            {[item.location, item.locationDetail].filter(Boolean).length ? (
                                <Text style={styles.listItemMeta}>
                                    {[item.location, item.locationDetail].filter(Boolean).join(' · ')}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                ))}
                {items.length > 8 ? (
                    <Text style={styles.moreText}>외 {items.length - 8}개는 앱에서 이어서 볼 수 있어요.</Text>
                ) : null}
            </View>
        </View>
    );
}

function EmptySection({
    styles,
    icon,
    text
}: {
    styles: ReturnType<typeof createStyles>;
    icon: IconName;
    text: string;
}) {
    return (
        <View style={styles.emptyBox}>
            <MaterialCommunityIcons color="#A8ADB6" name={icon} size={26} />
            <Text style={styles.emptyText}>{text}</Text>
        </View>
    );
}

function OpenChoiceModal({
    styles,
    visible,
    onClose,
    onOpenApp,
    onOpenStore
}: {
    styles: ReturnType<typeof createStyles>;
    visible: boolean;
    onClose(): void;
    onOpenApp(): void;
    onOpenStore(): void;
}) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                    <View style={styles.modalIcon}>
                        <MaterialCommunityIcons color="#FFFFFF" name="cellphone-link" size={26} />
                    </View>
                    <Text style={styles.modalTitle}>앱에서 이어서 볼까요?</Text>
                    <Text style={styles.modalDescription}>
                        앱에서 더 편하게 보고, 지금 화면에서도 계속 확인해요.
                    </Text>
                    <Pressable
                        accessibilityRole="button"
                        onPress={onOpenApp}
                        style={({ pressed }) => [styles.modalPrimaryButton, pressed ? styles.buttonPressed : null]}
                    >
                        <Text style={styles.modalPrimaryButtonText}>앱에서 보기</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        onPress={onClose}
                        style={({ pressed }) => [styles.modalSecondaryButton, pressed ? styles.buttonPressed : null]}
                    >
                        <Text style={styles.modalSecondaryButtonText}>계속 볼게요</Text>
                    </Pressable>
                    <Pressable
                        accessibilityRole="button"
                        onPress={onOpenStore}
                        style={({ pressed }) => [styles.storeLink, pressed ? styles.buttonPressed : null]}
                    >
                        <MaterialCommunityIcons color="#4B5563" name="google-play" size={18} />
                        <Text style={styles.storeLinkText}>앱이 없다면 Google Play에서 설치</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
}

function createStyles(theme: AppTheme) {
    const isDark = theme.mode === 'dark';

    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: theme.colors.background
        },
        content: {
            width: '100%',
            maxWidth: 820,
            alignSelf: 'center',
            padding: theme.spacing.sm,
            paddingBottom: theme.spacing.xxl,
            gap: theme.spacing.sm
        },
        centerState: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.md
        },
        stateTitle: {
            marginTop: theme.spacing.sm,
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.heading,
            fontSize: 24,
            lineHeight: 31,
            textAlign: 'center'
        },
        stateDescription: {
            marginTop: theme.spacing.xs,
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.body,
            fontSize: 15,
            lineHeight: 23,
            textAlign: 'center'
        },
        primaryButton: {
            marginTop: theme.spacing.md,
            minHeight: 48,
            borderRadius: theme.radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.md,
            backgroundColor: theme.colors.accent
        },
        primaryButtonText: {
            color: '#FFFFFF',
            fontFamily: theme.fonts.semibold,
            fontSize: 15
        },
        hero: {
            minHeight: 340,
            overflow: 'hidden',
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface
        },
        heroImage: {
            ...StyleSheet.absoluteFillObject,
            width: '100%',
            height: '100%'
        },
        heroPlaceholder: {
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentSoft
        },
        heroOverlay: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: isDark ? 'rgba(0, 0, 0, 0.46)' : 'rgba(0, 0, 0, 0.24)'
        },
        heroContent: {
            flex: 1,
            justifyContent: 'flex-end',
            padding: theme.spacing.md
        },
        publicPill: {
            alignSelf: 'flex-start',
            minHeight: 30,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            borderRadius: theme.radius.full,
            paddingHorizontal: theme.spacing.xs,
            backgroundColor: 'rgba(255, 102, 0, 0.92)'
        },
        publicPillText: {
            color: '#FFFFFF',
            fontFamily: theme.fonts.semibold,
            fontSize: 13
        },
        heroTitle: {
            marginTop: theme.spacing.sm,
            color: '#FFFFFF',
            fontFamily: theme.fonts.heading,
            fontSize: 34,
            lineHeight: 42
        },
        heroSubtitle: {
            marginTop: theme.spacing.xs,
            color: 'rgba(255, 255, 255, 0.84)',
            fontFamily: theme.fonts.medium,
            fontSize: 16,
            lineHeight: 23
        },
        heroButton: {
            alignSelf: 'flex-start',
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            marginTop: theme.spacing.sm,
            borderRadius: theme.radius.full,
            paddingHorizontal: theme.spacing.sm,
            backgroundColor: theme.colors.accent
        },
        heroButtonText: {
            color: '#FFFFFF',
            fontFamily: theme.fonts.semibold,
            fontSize: 14
        },
        summaryGrid: {
            flexDirection: 'row',
            gap: theme.spacing.xs
        },
        summaryCard: {
            flex: 1,
            minHeight: 82,
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.surface
        },
        summaryLabel: {
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.medium,
            fontSize: 13,
            lineHeight: 18
        },
        summaryValue: {
            marginTop: theme.spacing.micro,
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.heading,
            fontSize: 17,
            lineHeight: 23
        },
        dayTabs: {
            gap: theme.spacing.xs,
            paddingVertical: theme.spacing.micro
        },
        dayTab: {
            minWidth: 104,
            minHeight: 58,
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.sm,
            backgroundColor: theme.colors.surface
        },
        dayTabActive: {
            borderColor: theme.colors.accent,
            backgroundColor: theme.colors.accent
        },
        dayTabLabel: {
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.semibold,
            fontSize: 14,
            lineHeight: 19
        },
        dayTabLabelActive: {
            color: '#FFFFFF'
        },
        dayTabDate: {
            marginTop: theme.spacing.micro,
            fontFamily: theme.fonts.body,
            fontSize: 12,
            lineHeight: 16
        },
        section: {
            gap: theme.spacing.xs
        },
        sectionHeader: {
            minHeight: 32,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: theme.spacing.xs
        },
        sectionTitle: {
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.heading,
            fontSize: 20,
            lineHeight: 27
        },
        sectionCaption: {
            marginTop: theme.spacing.micro,
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.body,
            fontSize: 13,
            lineHeight: 18
        },
        sectionMeta: {
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.medium,
            fontSize: 13,
            lineHeight: 18
        },
        timelineList: {
            gap: theme.spacing.xs
        },
        timelineCard: {
            flexDirection: 'row',
            gap: theme.spacing.sm,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.surface
        },
        timelineTimeColumn: {
            width: 74,
            alignItems: 'center',
            gap: theme.spacing.xs
        },
        timelineTime: {
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.semibold,
            fontSize: 13,
            lineHeight: 18,
            textAlign: 'center'
        },
        timelineDot: {
            width: 32,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.accent
        },
        timelineBody: {
            flex: 1,
            minWidth: 0
        },
        timelineTitleRow: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: theme.spacing.xs
        },
        timelineTitle: {
            flex: 1,
            minWidth: 0,
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.heading,
            fontSize: 17,
            lineHeight: 24
        },
        categoryChip: {
            borderRadius: theme.radius.full,
            paddingHorizontal: theme.spacing.xs,
            paddingVertical: theme.spacing.micro,
            backgroundColor: theme.colors.accentSoft
        },
        categoryChipText: {
            color: theme.colors.accent,
            fontFamily: theme.fonts.semibold,
            fontSize: 12,
            lineHeight: 15
        },
        routeChipRow: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xs,
            marginTop: theme.spacing.xs
        },
        routeChip: {
            minHeight: 26,
            justifyContent: 'center',
            borderRadius: theme.radius.full,
            paddingHorizontal: theme.spacing.xs,
            backgroundColor: theme.colors.accentSoft
        },
        routeChipText: {
            color: theme.colors.accent,
            fontFamily: theme.fonts.semibold,
            fontSize: 12,
            lineHeight: 16
        },
        timelineMeta: {
            marginTop: theme.spacing.xs,
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.body,
            fontSize: 13,
            lineHeight: 19
        },
        timelineNote: {
            marginTop: theme.spacing.xs,
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.body,
            fontSize: 14,
            lineHeight: 22
        },
        photoStrip: {
            flexDirection: 'row',
            gap: theme.spacing.xs,
            marginTop: theme.spacing.xs
        },
        photoThumb: {
            width: 58,
            height: 58,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surfaceMuted
        },
        expenseBox: {
            gap: theme.spacing.micro,
            marginTop: theme.spacing.xs,
            borderRadius: theme.radius.sm,
            padding: theme.spacing.xs,
            backgroundColor: theme.colors.background
        },
        expenseText: {
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.medium,
            fontSize: 12,
            lineHeight: 17
        },
        listTitleRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs
        },
        listCard: {
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            padding: theme.spacing.sm,
            backgroundColor: theme.colors.surface
        },
        listItem: {
            minHeight: 38,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: theme.spacing.xs,
            paddingVertical: theme.spacing.xs
        },
        listItemBody: {
            flex: 1,
            minWidth: 0
        },
        listItemText: {
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.medium,
            fontSize: 14,
            lineHeight: 20
        },
        listItemTextDone: {
            color: theme.colors.textSecondary,
            textDecorationLine: 'line-through'
        },
        listItemMeta: {
            marginTop: theme.spacing.micro,
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.body,
            fontSize: 12,
            lineHeight: 17
        },
        moreText: {
            marginTop: theme.spacing.xs,
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.medium,
            fontSize: 12,
            lineHeight: 18
        },
        emptyBox: {
            minHeight: 112,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface
        },
        emptyText: {
            marginTop: theme.spacing.xs,
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.medium,
            fontSize: 14,
            lineHeight: 20,
            textAlign: 'center'
        },
        modalBackdrop: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.sm,
            backgroundColor: 'rgba(0, 0, 0, 0.48)'
        },
        modalCard: {
            width: '100%',
            maxWidth: 380,
            alignItems: 'center',
            borderRadius: theme.radius.lg,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background
        },
        modalIcon: {
            width: 54,
            height: 54,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.accent
        },
        modalTitle: {
            marginTop: theme.spacing.sm,
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.heading,
            fontSize: 22,
            lineHeight: 29,
            textAlign: 'center'
        },
        modalDescription: {
            marginTop: theme.spacing.xs,
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.body,
            fontSize: 14,
            lineHeight: 22,
            textAlign: 'center'
        },
        modalPrimaryButton: {
            width: '100%',
            minHeight: 50,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: theme.spacing.md,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.accent
        },
        modalPrimaryButtonText: {
            color: '#FFFFFF',
            fontFamily: theme.fonts.semibold,
            fontSize: 15
        },
        modalSecondaryButton: {
            width: '100%',
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: theme.spacing.xs,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface
        },
        modalSecondaryButtonText: {
            color: theme.colors.textPrimary,
            fontFamily: theme.fonts.semibold,
            fontSize: 15
        },
        storeLink: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            marginTop: theme.spacing.sm
        },
        storeLinkText: {
            color: theme.colors.textSecondary,
            fontFamily: theme.fonts.medium,
            fontSize: 13,
            lineHeight: 18
        },
        buttonPressed: {
            opacity: 0.84
        }
    });
}
