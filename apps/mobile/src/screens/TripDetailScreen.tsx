import React from 'react';
import { formatTimeStr, parseDurationStr, parseTimeStr } from '@shared/core/utils/time-value-helpers.js';
import { getTimelineItemCategoryCode } from '@shared/features/timeline/timeline-item-helpers.js';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
    ActivityIndicator,
    Animated,
    Image,
    KeyboardAvoidingView,
    LayoutAnimation,
    Linking,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    UIManager,
    View,
    useWindowDimensions
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PanGestureHandler, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAdapters } from '@/adapters/useAdapters';
import {
    BudgetExpenseComposerModal,
    DEFAULT_EXPENSE_CURRENCY,
    normalizeExpenseCurrency
} from '@/components/BudgetExpenseComposerModal';
import { BottomImageGradient } from '@/components/BottomImageGradient';
import { BottomNavBar } from '@/components/BottomNavBar';
import { DebugInfoCard } from '@/components/DebugInfoCard';
import { DaySection } from '@/components/DaySection';
import { EmptyState } from '@/components/EmptyState';
import { Alert } from '@/feedback';
import { LoadingView } from '@/components/LoadingView';
import { PlinIcon, type PlinIconName } from '@/components/PlinIcon';
import { TimelineItemComposerModal } from '@/components/TimelineItemComposerModal';
import { TimelineExistingItemPickerModal } from '@/components/TimelineExistingItemPickerModal';
import { TimelineInsertOptionsModal } from '@/components/TimelineInsertOptionsModal';
import { TimelineMemoryComposerModal } from '@/components/TimelineMemoryComposerModal';
import { TimelineMemoComposerModal } from '@/components/TimelineMemoComposerModal';
import { TimelineQuickRoutePickerModal } from '@/components/TimelineQuickRoutePickerModal';
import { TimelineTransitComposerModal } from '@/components/TimelineTransitComposerModal';
import { TimelineTransitTypePickerModal } from '@/components/TimelineTransitTypePickerModal';
import { TripHeader } from '@/components/TripHeader';
import { logUnicodeBoundary } from '@/dev/unicode-diagnostics';
import { useTripDetailAnnouncementActions } from '@/features/trip-detail/useTripDetailAnnouncementActions';
import { useTripDetailShareActions } from '@/features/trip-detail/useTripDetailShareActions';
import { useTripDetailScreenController } from '@/features/trip-detail/useTripDetailScreenController';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import {
    buildTimelineReminderSchedule,
    cancelTimelineReminder,
    describeTimelineReminder,
    getTripReminderRecordMap,
    getTimelineReminderRecord,
    scheduleTimelineReminder,
    syncTripRemindersForDetail,
    type TripReminderRecord
} from '@/services/trip-reminders';
import { searchTripQuickRouteOptions } from '@/services/trip-quick-route-search';
import { uploadTripMemoryAssets, type PickedTripMemoryAsset } from '@/services/trip-memory-upload';
import { useConnectivityStatus } from '@/state/connectivity-store';
import { usePrimaryScrollActivityReporter } from '@/state/primary-scroll-activity';
import { publishTripDetailUpdated } from '@/state/trip-write-sync';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import type {
    MobileQuickRouteOption,
    MobileTripDetail,
    MobileTransitDetailedStep,
    MobileTimelineItemCategory,
    MobileTimelineDisplayItem,
    MobileTimelineItemCreateInput,
    MobileTimelineManualTransitType,
    MobileTimelineTransitCreateInput,
    MobileTripDaySection,
    MobileTripListItem,
    MobileTripListType,
    TripRevisionEntry
} from '@/types/trip';

type Props = NativeStackScreenProps<RootStackParamList, 'TripDetail'>;
type SelectedTimelineTarget = {
    dayId: string;
    itemId: string;
    itemIndex: number;
} | null;
type PhotoGalleryState = {
    label: string;
    title: string;
    photoUrls: string[];
} | null;
type PendingTimelineDayOrders = Record<string, string[]>;

const TRIP_WRITE_CONFLICT_MESSAGE = '다른 기기에서 먼저 수정했어요. 최신 내용을 다시 불러온 뒤 변경사항을 다시 적용해 주세요.';
const OFFLINE_SHARE_DISABLED_MESSAGE = '오프라인에서는 공유와 멤버 관리를 할 수 없어요.';
const OFFLINE_ANNOUNCEMENT_DISABLED_MESSAGE = '오프라인에서는 참가자 공지를 보낼 수 없어요.';
const TRIP_REVISION_HISTORY_ENABLED = false;
const TIMELINE_DETAIL_SHEET_SNAP_VALUES = [
    MOBILE_BOTTOM_SHEET_HEIGHTS.detailCompactPercent,
    MOBILE_BOTTOM_SHEET_HEIGHTS.detailExpandedPercent
] as const;
type TimelineDetailSheetSnap = (typeof TIMELINE_DETAIL_SHEET_SNAP_VALUES)[number];
type TimelineDetailSheetReleaseTarget = TimelineDetailSheetSnap | 'close';
const MIN_TIMELINE_DETAIL_SHEET_SNAP: TimelineDetailSheetSnap = MOBILE_BOTTOM_SHEET_HEIGHTS.detailCompactPercent;
const DEFAULT_TIMELINE_DETAIL_SHEET_SNAP: TimelineDetailSheetSnap = MOBILE_BOTTOM_SHEET_HEIGHTS.detailExpandedPercent;
const MAX_TIMELINE_DETAIL_SHEET_SNAP: TimelineDetailSheetSnap = MOBILE_BOTTOM_SHEET_HEIGHTS.detailExpandedPercent;
const TIMELINE_DETAIL_SHEET_FLICK_VELOCITY_THRESHOLD = 1.05;
const TIMELINE_DETAIL_SHEET_RELEASE_PROJECTION = 112;
const TRIP_SAVED_NOTICE_DURATION_MS = 1800;

type TripSyncNoticeTone = 'checking' | 'saving' | 'saved' | 'warning';
type TripSyncNotice = {
    tone: TripSyncNoticeTone;
    iconName: PlinIconName;
    label: string;
    message: string;
};

type TimelineComposerTarget = {
    dayId: string;
    dayIndex: number;
    dayLabel: string;
    dayDate: string;
    insertAfterItemId: string | null;
    insertAfterItemIndex: number;
    defaultTime: string;
    initialMapCenter: {
        latitude: number;
        longitude: number;
    } | null;
    initialMapQuery: string;
    keepEditModeAfterSave: boolean;
} | null;
type TimelineMemoryComposerTarget = {
    dayId: string;
    dayIndex: number;
    dayLabel: string;
    dayDate: string;
    itemId: string;
    itemIndex: number;
    itemTitle: string;
} | null;
type TimelineMemoComposerTarget = {
    dayId: string;
    dayIndex: number;
    dayLabel: string;
    dayDate: string;
    itemId: string;
    itemIndex: number;
    itemTitle: string;
    defaultTime: string;
} | null;
type TimelineTransitComposerTarget = {
    dayId: string;
    dayIndex: number;
    dayLabel: string;
    dayDate: string;
    insertAfterItemId: string | null;
    insertAfterItemIndex: number;
    defaultTime: string;
    defaultEndTime: string;
    transitType: MobileTimelineManualTransitType;
    keepEditModeAfterSave: boolean;
} | null;

type BudgetExpenseComposerTarget = {
    dayId: string;
    dayLabel: string;
    dayDate: string;
    isItemSelectionLocked?: boolean;
    options: Array<{
        itemId: string;
        itemIndex: number;
        title: string;
        location: string;
    }>;
} | null;

type TripListComposerTarget = MobileTripListType | null;
type TripDetailFilterKey = 'extras' | string;
type TripDetailFilterChip = {
    key: TripDetailFilterKey;
    label: string;
};

type ExternalRouteContext = {
    originItem: MobileTimelineDisplayItem | null;
    destinationItem: MobileTimelineDisplayItem | null;
    routeItem: MobileTimelineDisplayItem | null;
};

type ZoomableGalleryImageProps = {
    uri: string;
    pageWidth: number;
    pageHeight: number;
    isActive: boolean;
    imageStyle: any;
    wrapperStyle: any;
    onZoomStateChange?: (zoomed: boolean) => void;
};

function clampNumericValue(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function resolveNearestTimelineDetailSheetSnap(
    projectedHeight: number,
    sheetHeights: Record<TimelineDetailSheetSnap, number>
) {
    let nearestSnap: TimelineDetailSheetSnap = TIMELINE_DETAIL_SHEET_SNAP_VALUES[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    TIMELINE_DETAIL_SHEET_SNAP_VALUES.forEach((snap) => {
        const distance = Math.abs(projectedHeight - sheetHeights[snap]);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestSnap = snap;
        }
    });

    return nearestSnap;
}

function resolveTimelineDetailSheetReleaseSnap(
    currentHeight: number,
    projectedHeight: number,
    velocityY: number,
    sheetHeights: Record<TimelineDetailSheetSnap, number>
): TimelineDetailSheetReleaseTarget {
    const currentSnap = resolveNearestTimelineDetailSheetSnap(currentHeight, sheetHeights);
    const minimumSnapHeight = sheetHeights[MIN_TIMELINE_DETAIL_SHEET_SNAP];
    const closeThreshold = Math.max(72, Math.round(minimumSnapHeight * 0.08));

    if (velocityY >= TIMELINE_DETAIL_SHEET_FLICK_VELOCITY_THRESHOLD && currentSnap === MIN_TIMELINE_DETAIL_SHEET_SNAP) {
        return 'close';
    }

    if (projectedHeight < minimumSnapHeight - closeThreshold) {
        return 'close';
    }

    if (Math.abs(velocityY) >= TIMELINE_DETAIL_SHEET_FLICK_VELOCITY_THRESHOLD) {
        const currentIndex = TIMELINE_DETAIL_SHEET_SNAP_VALUES.indexOf(currentSnap);
        const nextIndex = clampNumericValue(
            currentIndex + (velocityY < 0 ? 1 : -1),
            0,
            TIMELINE_DETAIL_SHEET_SNAP_VALUES.length - 1
        );

        return TIMELINE_DETAIL_SHEET_SNAP_VALUES[nextIndex];
    }

    return resolveNearestTimelineDetailSheetSnap(projectedHeight, sheetHeights);
}

function formatTripRevisionRestorePoint(value: string) {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
        return '선택한 시점';
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hour = String(parsed.getHours()).padStart(2, '0');
    const minute = String(parsed.getMinutes()).padStart(2, '0');

    return `${year}.${month}.${day} ${hour}:${minute}`;
}

function ZoomableGalleryImage({
    uri,
    pageWidth,
    pageHeight,
    isActive,
    imageStyle,
    wrapperStyle,
    onZoomStateChange
}: ZoomableGalleryImageProps) {
    const pinchRef = React.useRef(null);
    const panRef = React.useRef(null);
    const baseScale = React.useRef(new Animated.Value(1)).current;
    const pinchScale = React.useRef(new Animated.Value(1)).current;
    const translateX = React.useRef(new Animated.Value(0)).current;
    const translateY = React.useRef(new Animated.Value(0)).current;
    const panX = React.useRef(new Animated.Value(0)).current;
    const panY = React.useRef(new Animated.Value(0)).current;
    const scaleRef = React.useRef(1);
    const translateRef = React.useRef({ x: 0, y: 0 });
    const zoomedRef = React.useRef(false);
    const [isPanEnabled, setPanEnabled] = React.useState(false);

    const notifyZoomState = React.useCallback((zoomed: boolean) => {
        if (zoomedRef.current === zoomed) {
            return;
        }

        zoomedRef.current = zoomed;
        setPanEnabled(zoomed);
        onZoomStateChange?.(zoomed);
    }, [onZoomStateChange]);

    const getClampedOffset = React.useCallback((nextX: number, nextY: number, nextScale: number) => {
        const imageWidth = Math.max(pageWidth - 32, 1);
        const imageHeight = Math.max(pageHeight * 0.82, 1);
        const maxOffsetX = ((imageWidth * nextScale) - imageWidth) / 2;
        const maxOffsetY = ((imageHeight * nextScale) - imageHeight) / 2;

        return {
            x: clampNumericValue(nextX, -maxOffsetX, maxOffsetX),
            y: clampNumericValue(nextY, -maxOffsetY, maxOffsetY)
        };
    }, [pageHeight, pageWidth]);

    const resetZoom = React.useCallback(() => {
        scaleRef.current = 1;
        translateRef.current = { x: 0, y: 0 };
        baseScale.setValue(1);
        pinchScale.setValue(1);
        translateX.setValue(0);
        translateY.setValue(0);
        panX.setValue(0);
        panY.setValue(0);
        notifyZoomState(false);
    }, [baseScale, notifyZoomState, panX, panY, pinchScale, translateX, translateY]);

    const animateResetZoom = React.useCallback(() => {
        scaleRef.current = 1;
        translateRef.current = { x: 0, y: 0 };
        pinchScale.setValue(1);
        panX.setValue(0);
        panY.setValue(0);
        notifyZoomState(false);

        Animated.parallel([
            Animated.spring(baseScale, {
                toValue: 1,
                damping: 16,
                stiffness: 180,
                mass: 0.7,
                useNativeDriver: true
            }),
            Animated.spring(translateX, {
                toValue: 0,
                damping: 16,
                stiffness: 180,
                mass: 0.7,
                useNativeDriver: true
            }),
            Animated.spring(translateY, {
                toValue: 0,
                damping: 16,
                stiffness: 180,
                mass: 0.7,
                useNativeDriver: true
            })
        ]).start();
    }, [baseScale, notifyZoomState, panX, panY, pinchScale, translateX, translateY]);

    React.useEffect(() => {
        return () => {
            notifyZoomState(false);
        };
    }, [notifyZoomState]);

    React.useEffect(() => {
        if (isActive) {
            return;
        }

        if (
            scaleRef.current <= 1.01
            && Math.abs(translateRef.current.x) < 0.5
            && Math.abs(translateRef.current.y) < 0.5
        ) {
            resetZoom();
            return;
        }

        animateResetZoom();
    }, [animateResetZoom, isActive, resetZoom]);

    const handlePinchGestureEvent = Animated.event(
        [{ nativeEvent: { scale: pinchScale } }],
        {
            useNativeDriver: true,
            listener: (event: any) => {
                const nextScale = clampNumericValue(scaleRef.current * Number(event.nativeEvent.scale || 1), 1, 3);
                notifyZoomState(nextScale > 1.01);
            }
        }
    );

    const handlePinchStateChange = React.useCallback((event: any) => {
        if (event.nativeEvent.oldState !== State.ACTIVE) {
            return;
        }

        const nextScale = clampNumericValue(scaleRef.current * Number(event.nativeEvent.scale || 1), 1, 3);
        scaleRef.current = nextScale;
        baseScale.setValue(nextScale);
        pinchScale.setValue(1);

        if (nextScale <= 1.01) {
            resetZoom();
            return;
        }

        const clampedOffset = getClampedOffset(translateRef.current.x, translateRef.current.y, nextScale);
        translateRef.current = clampedOffset;
        translateX.setValue(clampedOffset.x);
        translateY.setValue(clampedOffset.y);
        notifyZoomState(true);
    }, [baseScale, getClampedOffset, notifyZoomState, pinchScale, resetZoom, translateX, translateY]);

    const handlePanGestureEvent = Animated.event(
        [{ nativeEvent: { translationX: panX, translationY: panY } }],
        { useNativeDriver: true }
    );

    const handlePanStateChange = React.useCallback((event: any) => {
        if (event.nativeEvent.oldState !== State.ACTIVE) {
            return;
        }

        const nextOffset = getClampedOffset(
            translateRef.current.x + Number(event.nativeEvent.translationX || 0),
            translateRef.current.y + Number(event.nativeEvent.translationY || 0),
            scaleRef.current
        );

        translateRef.current = nextOffset;
        translateX.setValue(nextOffset.x);
        translateY.setValue(nextOffset.y);
        panX.setValue(0);
        panY.setValue(0);
    }, [getClampedOffset, panX, panY, translateX, translateY]);

    return (
        <PinchGestureHandler
            ref={pinchRef}
            simultaneousHandlers={panRef}
            onGestureEvent={handlePinchGestureEvent}
            onHandlerStateChange={handlePinchStateChange}
        >
            <Animated.View style={wrapperStyle}>
                <PanGestureHandler
                    ref={panRef}
                    simultaneousHandlers={pinchRef}
                    enabled={isPanEnabled}
                    onGestureEvent={handlePanGestureEvent}
                    onHandlerStateChange={handlePanStateChange}
                >
                    <Animated.View
                        style={[
                            wrapperStyle,
                            {
                                transform: [
                                    { scale: Animated.multiply(baseScale, pinchScale) },
                                    { translateX: Animated.add(translateX, panX) },
                                    { translateY: Animated.add(translateY, panY) }
                                ]
                            }
                        ]}
                    >
                        <Animated.Image
                            source={{ uri }}
                            resizeMode="contain"
                            style={imageStyle}
                        />
                    </Animated.View>
                </PanGestureHandler>
            </Animated.View>
        </PinchGestureHandler>
    );
}

function getTripShareSheetComponent() {
    return require('../components/TripShareSheet').TripShareSheet as typeof import('../components/TripShareSheet').TripShareSheet;
}

function getTripAnnouncementSheetComponent() {
    return require('../components/TripAnnouncementSheet').TripAnnouncementSheet as typeof import('../components/TripAnnouncementSheet').TripAnnouncementSheet;
}

function getTripRevisionHistorySheetComponent() {
    return require('../components/TripRevisionHistorySheet').TripRevisionHistorySheet as typeof import('../components/TripRevisionHistorySheet').TripRevisionHistorySheet;
}

const NAVER_MAP_APP_NAME = 'ink.plin.mobile';
const TIMELINE_HEIGHT_MORPH_ANIMATION = {
    duration: 340,
    create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity
    },
    update: {
        type: LayoutAnimation.Types.easeInEaseOut
    },
    delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity
    }
} as const;

function buildMapsUrl(item: MobileTimelineDisplayItem, routeItem?: MobileTimelineDisplayItem | null) {
    const query = [item.title, item.location]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(', ');

    if (!query) {
        return '';
    }

    const searchParams = new URLSearchParams({
        api: '1',
        destination: query
    });
    const travelMode = resolveMapsTravelMode(routeItem);
    if (travelMode) {
        searchParams.set('travelmode', travelMode);
    }

    return `https://www.google.com/maps/dir/?${searchParams.toString()}`;
}

function buildMapsRoutePoint(item: MobileTimelineDisplayItem | null | undefined) {
    if (!item) {
        return '';
    }

    const hasCoordinates = typeof item.latitude === 'number'
        && Number.isFinite(item.latitude)
        && typeof item.longitude === 'number'
        && Number.isFinite(item.longitude);

    if (hasCoordinates) {
        return `${item.latitude},${item.longitude}`;
    }

    return buildTimelineRouteQuery(item);
}

function resolveMapsTravelMode(item: MobileTimelineDisplayItem | null | undefined) {
    const transitType = String(item?.transitType || '').trim().toLowerCase();
    const label = String(item?.badgeLabel || '').trim();

    if (transitType === 'walk' || label === '도보') {
        return 'walking';
    }

    if (transitType === 'car' || label === '차량') {
        return 'driving';
    }

    if (transitType === 'taxi' || label === '택시') {
        return 'driving';
    }

    if (transitType === 'bike' || label === '자전거') {
        return 'bicycling';
    }

    if (
        transitType === 'bus'
        || transitType === 'subway'
        || transitType === 'train'
        || transitType === 'boat'
        || label === '버스'
        || label === '전철'
        || label === '기차'
        || label === '배'
    ) {
        return 'transit';
    }

    if (!label && !transitType) {
        return '';
    }

    return '';
}

function buildMapsDirectionsUrl(
    originItem: MobileTimelineDisplayItem | null | undefined,
    destinationItem: MobileTimelineDisplayItem | null | undefined,
    routeItem?: MobileTimelineDisplayItem | null
) {
    const origin = buildMapsRoutePoint(originItem);
    const destination = buildMapsRoutePoint(destinationItem);

    if (!origin || !destination) {
        return '';
    }

    const searchParams = new URLSearchParams({
        api: '1',
        origin,
        destination
    });
    const travelMode = resolveMapsTravelMode(routeItem);
    if (travelMode) {
        searchParams.set('travelmode', travelMode);
    }

    return `https://www.google.com/maps/dir/?${searchParams.toString()}`;
}

function hasRoutePointCoordinates(item: MobileTimelineDisplayItem | null | undefined) {
    return Boolean(
        item
        && typeof item.latitude === 'number'
        && Number.isFinite(item.latitude)
        && typeof item.longitude === 'number'
        && Number.isFinite(item.longitude)
    );
}

function buildRoutePointName(item: MobileTimelineDisplayItem | null | undefined) {
    return buildTimelineRouteQuery(item) || '목적지';
}

function resolveNaverRouteMode(item: MobileTimelineDisplayItem | null | undefined) {
    const transitType = String(item?.transitType || '').trim().toLowerCase();
    const label = String(item?.badgeLabel || '').trim();

    if (transitType === 'walk' || label === '도보') {
        return 'walk';
    }

    if (transitType === 'car' || label === '차량') {
        return 'car';
    }

    if (transitType === 'taxi' || label === '택시') {
        return 'car';
    }

    if (transitType === 'bike' || label === '자전거') {
        return 'walk';
    }

    return 'public';
}

function buildNaverMapUrl(context: ExternalRouteContext) {
    const destination = context.destinationItem;
    if (!hasRoutePointCoordinates(destination) || !destination) {
        return '';
    }

    const searchParams = new URLSearchParams({
        dlat: String(destination.latitude),
        dlng: String(destination.longitude),
        dname: buildRoutePointName(destination),
        appname: NAVER_MAP_APP_NAME
    });

    if (hasRoutePointCoordinates(context.originItem) && context.originItem) {
        searchParams.set('slat', String(context.originItem.latitude));
        searchParams.set('slng', String(context.originItem.longitude));
        searchParams.set('sname', buildRoutePointName(context.originItem));
    }

    return `nmap://route/${resolveNaverRouteMode(context.routeItem)}?${searchParams.toString()}`;
}

function resolveKakaoRouteMode(item: MobileTimelineDisplayItem | null | undefined) {
    const transitType = String(item?.transitType || '').trim().toLowerCase();
    const label = String(item?.badgeLabel || '').trim();

    if (transitType === 'walk' || label === '도보') {
        return 'foot';
    }

    if (transitType === 'car' || label === '차량') {
        return 'car';
    }

    if (transitType === 'taxi' || label === '택시') {
        return 'car';
    }

    if (transitType === 'bike' || label === '자전거') {
        return 'foot';
    }

    return 'publictransit';
}

function buildKakaoRoutePath(destination: MobileTimelineDisplayItem | null | undefined) {
    if (!hasRoutePointCoordinates(destination) || !destination) {
        return '';
    }

    const destinationName = encodeURIComponent(buildRoutePointName(destination));
    return `https://map.kakao.com/link/to/${destinationName},${destination.latitude},${destination.longitude}`;
}

function buildKakaoMapUrls(context: ExternalRouteContext) {
    const destination = context.destinationItem;
    if (!hasRoutePointCoordinates(destination) || !destination) {
        return {
            primary: '',
            fallback: ''
        };
    }

    if (hasRoutePointCoordinates(context.originItem) && context.originItem) {
        const searchParams = new URLSearchParams({
            sp: `${context.originItem.latitude},${context.originItem.longitude}`,
            ep: `${destination.latitude},${destination.longitude}`,
            by: resolveKakaoRouteMode(context.routeItem)
        });

        return {
            primary: `kakaomap://route?${searchParams.toString()}`,
            fallback: `http://m.map.kakao.com/scheme/route?${searchParams.toString()}`
        };
    }

    const searchParams = new URLSearchParams({
        ep: `${destination.latitude},${destination.longitude}`,
        by: resolveKakaoRouteMode(context.routeItem)
    });
    const fallback = buildKakaoRoutePath(destination);

    return {
        primary: `kakaomap://route?${searchParams.toString()}`,
        fallback: `http://m.map.kakao.com/scheme/route?${searchParams.toString()}`
    };
}

function buildRouteProviderFallbackUrl(
    provider: 'google' | 'naver' | 'kakao',
    context: ExternalRouteContext
) {
    if (!context.destinationItem) {
        return '';
    }

    if (provider === 'google') {
        return buildMapsUrl(context.destinationItem, context.routeItem);
    }

    if (provider === 'naver') {
        return '';
    }

    return buildKakaoRoutePath(context.destinationItem);
}

function isCurrentLocationPlaceRoute(context: ExternalRouteContext) {
    return Boolean(
        context.destinationItem
        && !context.originItem
        && !context.destinationItem.isTransit
    );
}

function buildPrimaryRouteUrl(
    provider: 'google' | 'naver' | 'kakao',
    context: ExternalRouteContext
) {
    if (provider === 'google') {
        return context.originItem
            ? buildMapsDirectionsUrl(context.originItem, context.destinationItem, context.routeItem)
            : buildMapsUrl(context.destinationItem as MobileTimelineDisplayItem, context.routeItem);
    }

    if (provider === 'naver') {
        return buildNaverMapUrl(context);
    }

    return buildKakaoMapUrls(context).primary;
}

function buildSecondaryRouteUrl(
    provider: 'google' | 'naver' | 'kakao',
    context: ExternalRouteContext
) {
    if (provider === 'kakao') {
        return buildKakaoMapUrls(context).fallback;
    }

    return '';
}

function buildTertiaryRouteUrl(
    provider: 'google' | 'naver' | 'kakao',
    context: ExternalRouteContext
) {
    if (provider === 'kakao' && isCurrentLocationPlaceRoute(context)) {
        return buildKakaoRoutePath(context.destinationItem);
    }

    return '';
}

async function openRouteUrlSequence(urls: string[]) {
    for (const url of urls) {
        if (!url) {
            continue;
        }

        try {
            await Linking.openURL(url);
            return;
        } catch {
            continue;
        }
    }
}

function buildRouteUrlSequence(
    provider: 'google' | 'naver' | 'kakao',
    context: ExternalRouteContext
) {
    const urls = [
        buildPrimaryRouteUrl(provider, context),
        buildSecondaryRouteUrl(provider, context),
        buildTertiaryRouteUrl(provider, context),
        buildRouteProviderFallbackUrl(provider, context)
    ];

    return urls.filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
}

function formatMemoryDate(createdAt: string) {
    const raw = String(createdAt || '').trim();
    if (!raw) {
        return '';
    }

    if (raw.length >= 10) {
        return raw.slice(0, 10);
    }

    return raw;
}

function getTimelineMemoryPhotoUrls(item: MobileTimelineDisplayItem) {
    const uniqueUrls = new Set<string>();

    for (const memory of item.memoryEntries || []) {
        const photoUrl = typeof memory.photoUrl === 'string' ? memory.photoUrl.trim() : '';
        if (photoUrl) {
            uniqueUrls.add(photoUrl);
        }
    }

    return Array.from(uniqueUrls);
}

function buildTimelineMemoryGalleryTitle(item: MobileTimelineDisplayItem, photoCount: number) {
    const baseTitle = String(item.title || item.badgeLabel || '이 일정').trim() || '이 일정';
    return `${baseTitle} · 사진 ${photoCount}장`;
}

function resolveTimelineAnchorStartTime(item: MobileTimelineDisplayItem) {
    const transitLabel = String(item.transitWindowLabel || '').trim();
    if (transitLabel.includes('-')) {
        return transitLabel.split(/\s*-\s*/)[0]?.trim() || '';
    }

    return String(item.timeLabel || '').trim();
}

function buildTimelineInsertDefaultTime(day: MobileTripDaySection, insertAfterIndex: number) {
    if (!Array.isArray(day.items) || day.items.length === 0) {
        return '09:00';
    }

    if (insertAfterIndex < 0) {
        const firstStartTime = resolveTimelineAnchorStartTime(day.items[0]);
        const parsedStartTime = parseTimeStr(firstStartTime);
        return parsedStartTime === null ? '09:00' : formatTimeStr(parsedStartTime);
    }

    const anchorItem = day.items[insertAfterIndex];
    if (!anchorItem) {
        return '09:00';
    }

    return resolveTimelineAnchorEndTime(anchorItem) || '09:00';
}

function resolveTimelineAnchorEndTime(item: MobileTimelineDisplayItem | null | undefined) {
    if (!item) {
        return '';
    }

    const transitLabel = String(item.transitWindowLabel || '').trim();
    if (transitLabel.includes('-')) {
        const endTime = transitLabel.split(/\s*-\s*/)[1]?.trim() || '';
        const parsedEndTime = parseTimeStr(endTime);
        if (parsedEndTime !== null) {
            return formatTimeStr(parsedEndTime);
        }
    }

    const anchorStartTime = resolveTimelineAnchorStartTime(item);
    const parsedAnchorStartTime = parseTimeStr(anchorStartTime);
    if (parsedAnchorStartTime === null) {
        return '';
    }

    const anchorDuration = parseDurationStr(String(item.durationLabel || '').replace(/\n/g, ' '));
    return formatTimeStr(parsedAnchorStartTime + Math.max(anchorDuration, 30));
}

function buildTimelineQuickRouteDepartureTime(
    previousPlace: MobileTimelineDisplayItem | null | undefined,
    fallbackTime: string
) {
    return resolveTimelineAnchorEndTime(previousPlace)
        || String(fallbackTime || '').trim()
        || '09:00';
}

function buildTimelineTransitDefaultEndTime(startTime: string) {
    const parsedStartTime = parseTimeStr(String(startTime || '').trim());
    if (parsedStartTime === null) {
        return '09:30';
    }

    return formatTimeStr(parsedStartTime + 30);
}

function buildTimelineRouteQuery(item: MobileTimelineDisplayItem | null | undefined) {
    if (!item) {
        return '';
    }

    return [item.title, item.location]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(', ');
}

function resolvePrimaryTripLocationLabel(value: string) {
    return String(value || '')
        .split(/[,，、]/)
        .map((entry) => entry.trim())
        .filter(Boolean)[0] || String(value || '').trim();
}

function hasTimelineItemCoords(item: MobileTimelineDisplayItem | null | undefined): item is MobileTimelineDisplayItem & {
    latitude: number;
    longitude: number;
} {
    return Boolean(
        item
        && Number.isFinite(Number(item.latitude))
        && Number.isFinite(Number(item.longitude))
    );
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

function buildTimelineReminderKey(dayId: string, itemId: string) {
    return `${dayId}:${itemId}`;
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

function findTimelineRouteAnchors(day: MobileTripDaySection, insertAfterIndex: number) {
    const items = Array.isArray(day.items) ? day.items : [];
    let previousPlace: MobileTimelineDisplayItem | null = null;
    let nextPlace: MobileTimelineDisplayItem | null = null;

    for (let index = Math.min(insertAfterIndex, items.length - 1); index >= 0; index -= 1) {
        const item = items[index];
        if (!item?.isTransit && item.badgeLabel !== '메모' && hasTimelineRouteAnchor(item)) {
            previousPlace = item;
            break;
        }
    }

    for (let index = Math.max(insertAfterIndex + 1, 0); index < items.length; index += 1) {
        const item = items[index];
        if (!item?.isTransit && item.badgeLabel !== '메모' && hasTimelineRouteAnchor(item)) {
            nextPlace = item;
            break;
        }
    }

    return {
        previousPlace,
        nextPlace,
        canOpenQuickRoute: Boolean(previousPlace && nextPlace)
    };
}

function resolveEditableTimelineCategory(item: MobileTimelineDisplayItem): MobileTimelineItemCategory {
    const categoryCode = getTimelineItemCategoryCode({
        tag: String(item.badgeLabel || '').trim()
    });

    switch (categoryCode) {
    case 'meal':
    case 'culture':
    case 'sightseeing':
    case 'shopping':
    case 'accommodation':
    case 'custom':
        return categoryCode;
    default:
        return 'custom';
    }
}

function moveTimelineDisplayItems(
    items: MobileTimelineDisplayItem[],
    itemIndex: number,
    targetIndex: number
) {
    const safeItemIndex = Math.max(0, Math.min(Math.floor(itemIndex), items.length - 1));
    const safeTargetIndex = Math.max(0, Math.min(Math.floor(targetIndex), items.length - 1));

    if (safeItemIndex === safeTargetIndex) {
        return items;
    }

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(safeItemIndex, 1);
    nextItems.splice(safeTargetIndex, 0, movedItem);
    return nextItems;
}

function areTimelineItemOrdersEqual(items: MobileTimelineDisplayItem[], orderedItemIds: string[]) {
    if (items.length !== orderedItemIds.length) {
        return false;
    }

    return items.every((item, index) => item.id === orderedItemIds[index]);
}

function areTimelineItemIdListsEqual(currentIds: string[] | undefined, nextIds: string[]) {
    if (!currentIds || currentIds.length !== nextIds.length) {
        return false;
    }

    return currentIds.every((itemId, index) => itemId === nextIds[index]);
}

function syncSelectedTimelineTargetWithDetail(
    target: SelectedTimelineTarget,
    detail: MobileTripDetail | null
): SelectedTimelineTarget {
    if (!target || !detail) {
        return target;
    }

    const selectedDay = detail.days.find((day) => day.id === target.dayId);
    if (!selectedDay) {
        return null;
    }

    const nextIndex = selectedDay.items.findIndex((item) => item.id === target.itemId);
    if (nextIndex < 0) {
        return null;
    }

    if (nextIndex === target.itemIndex) {
        return target;
    }

    return {
        ...target,
        itemIndex: nextIndex
    };
}

export function TripDetailScreen({ navigation, route }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { tripRepository } = useAdapters();
    const insets = useSafeAreaInsets();
    const { isOfflineMode } = useConnectivityStatus();
    const isFocused = useIsFocused();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const galleryHeaderInsetStyle = React.useMemo(() => ({
        paddingTop: insets.top + theme.spacing.md
    }), [insets.top, theme.spacing.md]);
    const routeAppSheetInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.md
    }), [insets.bottom, theme.spacing.md]);
    const budgetSheetContentInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.md
    }), [insets.bottom, theme.spacing.md]);
    const {
        scrollRef: tripListComposerScrollRef,
        createFocusHandler: createTripListComposerFocusHandler,
        keyboardAwareContentInsetStyle: tripListComposerKeyboardInsetStyle,
        scrollViewProps: tripListComposerScrollViewProps
    } = useKeyboardAwareInputScroll(112);
    const selectedTimelineDetailSheetContentInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.md
    }), [insets.bottom, theme.spacing.md]);
    const selectedTimelineDetailSheetHeights = React.useMemo<Record<TimelineDetailSheetSnap, number>>(() => ({
        [MOBILE_BOTTOM_SHEET_HEIGHTS.detailCompactPercent]: Math.round(
            windowHeight * (MOBILE_BOTTOM_SHEET_HEIGHTS.detailCompactPercent / 100)
        ),
        [MOBILE_BOTTOM_SHEET_HEIGHTS.detailExpandedPercent]: Math.round(
            windowHeight * (MOBILE_BOTTOM_SHEET_HEIGHTS.detailExpandedPercent / 100)
        )
    }), [windowHeight]);
    const heroHeaderHeight = React.useMemo(() => {
        const widthDrivenHeight = Math.round(windowWidth * 0.8);
        const heightDrivenCap = Math.round(windowHeight * 0.34);
        return Math.max(Math.min(widthDrivenHeight, heightDrivenCap, 360), 232);
    }, [windowHeight, windowWidth]);
    const heroHeaderCollapseOffset = React.useMemo(() => (
        Math.max(heroHeaderHeight - (insets.top + 72), 92)
    ), [heroHeaderHeight, insets.top]);
    const heroHeaderSurfaceStyle = React.useMemo(() => ({
        minHeight: heroHeaderHeight
    }), [heroHeaderHeight]);
    const heroHeaderFillProgress = React.useRef(new Animated.Value(0)).current;
    const heroHeaderOverlayOpacity = React.useMemo(() => (
        heroHeaderFillProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
            extrapolate: 'clamp'
        })
    ), [heroHeaderFillProgress]);
    const detailScrollRef = React.useRef<ScrollView | null>(null);
    const detailFilterScrollRef = React.useRef<ScrollView | null>(null);
    const galleryScrollRef = React.useRef<ScrollView | null>(null);
    const selectedTimelineDetailSheetHeight = React.useRef(
        new Animated.Value(selectedTimelineDetailSheetHeights[DEFAULT_TIMELINE_DETAIL_SHEET_SNAP])
    ).current;
    const selectedTimelineDetailSheetHeightRef = React.useRef(
        selectedTimelineDetailSheetHeights[DEFAULT_TIMELINE_DETAIL_SHEET_SNAP]
    );
    const selectedTimelineDetailSheetDragStartHeightRef = React.useRef(
        selectedTimelineDetailSheetHeights[DEFAULT_TIMELINE_DETAIL_SHEET_SNAP]
    );
    const detailSectionOffsetsRef = React.useRef<Record<string, number>>({});
    const pendingDetailFilterKeyRef = React.useRef<TripDetailFilterKey>('');
    const [selectedTimelineTarget, setSelectedTimelineTarget] = React.useState<SelectedTimelineTarget>(null);
    const [selectedTimelineDetailSheetSnap, setSelectedTimelineDetailSheetSnap] = React.useState<TimelineDetailSheetSnap>(
        DEFAULT_TIMELINE_DETAIL_SHEET_SNAP
    );
    const [pendingTimelineDayOrders, setPendingTimelineDayOrders] = React.useState<PendingTimelineDayOrders>({});
    const [timelineInsertTarget, setTimelineInsertTarget] = React.useState<TimelineComposerTarget>(null);
    const [timelineComposerTarget, setTimelineComposerTarget] = React.useState<TimelineComposerTarget>(null);
    const [timelineMemoryComposerTarget, setTimelineMemoryComposerTarget] = React.useState<TimelineMemoryComposerTarget>(null);
    const [timelineMemoComposerTarget, setTimelineMemoComposerTarget] = React.useState<TimelineMemoComposerTarget>(null);
    const [timelineTransitTypePickerTarget, setTimelineTransitTypePickerTarget] = React.useState<TimelineComposerTarget>(null);
    const [timelineTransitComposerTarget, setTimelineTransitComposerTarget] = React.useState<TimelineTransitComposerTarget>(null);
    const [timelineExistingPickerTarget, setTimelineExistingPickerTarget] = React.useState<TimelineComposerTarget>(null);
    const [timelineQuickRouteTarget, setTimelineQuickRouteTarget] = React.useState<TimelineComposerTarget>(null);
    const [timelineSortTargetDay, setTimelineSortTargetDay] = React.useState<MobileTripDaySection | null>(null);
    const [isTimelineEditMode, setTimelineEditMode] = React.useState(
        Boolean(route.params.startInTimelineEditMode)
    );
    const savedNoticeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isTripSavedNoticeVisible, setTripSavedNoticeVisible] = React.useState(false);
    const [isTimelineInsertSaving, setTimelineInsertSaving] = React.useState(false);
    const [timelineInsertError, setTimelineInsertError] = React.useState<string | null>(null);
    const [quickRouteOptions, setQuickRouteOptions] = React.useState<MobileQuickRouteOption[]>([]);
    const [quickRouteError, setQuickRouteError] = React.useState<string | null>(null);
    const [isQuickRouteLoading, setQuickRouteLoading] = React.useState(false);
    const [isRouteAppSheetVisible, setRouteAppSheetVisible] = React.useState(false);
    const [isBudgetSummaryVisible, setBudgetSummaryVisible] = React.useState(false);
    const [budgetExpenseComposerTarget, setBudgetExpenseComposerTarget] = React.useState<BudgetExpenseComposerTarget>(null);
    const [budgetExpenseSelectedItemId, setBudgetExpenseSelectedItemId] = React.useState('');
    const [budgetExpenseDescription, setBudgetExpenseDescription] = React.useState('');
    const [budgetExpenseAmount, setBudgetExpenseAmount] = React.useState('');
    const [budgetExpenseCurrency, setBudgetExpenseCurrency] = React.useState(DEFAULT_EXPENSE_CURRENCY);
    const [budgetExpenseShoppingIndex, setBudgetExpenseShoppingIndex] = React.useState<number | null>(null);
    const [isBudgetExpenseSaving, setBudgetExpenseSaving] = React.useState(false);
    const [tripListComposerTarget, setTripListComposerTarget] = React.useState<TripListComposerTarget>(null);
    const [selectedDetailFilterKey, setSelectedDetailFilterKey] = React.useState<TripDetailFilterKey>('');
    const [detailTabBarHeight, setDetailTabBarHeight] = React.useState(0);
    const [tripListInput, setTripListInput] = React.useState('');
    const [tripListLocationKey, setTripListLocationKey] = React.useState('');
    const [isTripListSaving, setTripListSaving] = React.useState(false);
    const [isTripListToggleSyncing, setTripListToggleSyncing] = React.useState(false);
    const [optimisticTripLists, setOptimisticTripLists] = React.useState<Record<MobileTripListType, MobileTripListItem[] | null>>({
        checklist: null,
        shopping: null
    });
    const [isTimelineItemDeleting, setTimelineItemDeleting] = React.useState(false);
    const [isTimelineItemReordering, setTimelineItemReordering] = React.useState(false);
    const [isTimelineDayReorganizing, setTimelineDayReorganizing] = React.useState(false);
    const [selectedTimelineReminder, setSelectedTimelineReminder] = React.useState<TripReminderRecord | null>(null);
    const [tripReminderRecordMap, setTripReminderRecordMap] = React.useState<Record<string, TripReminderRecord>>({});
    const [isTimelineReminderLoading, setTimelineReminderLoading] = React.useState(false);
    const [isTimelineReminderSaving, setTimelineReminderSaving] = React.useState(false);
    const [isPhotoGalleryVisible, setPhotoGalleryVisible] = React.useState(false);
    const [photoGalleryState, setPhotoGalleryState] = React.useState<PhotoGalleryState>(null);
    const [isPhotoViewerVisible, setPhotoViewerVisible] = React.useState(false);
    const [isPhotoViewerZoomed, setPhotoViewerZoomed] = React.useState(false);
    const [photoGalleryIndex, setPhotoGalleryIndex] = React.useState(0);
    const [isTripShareSheetVisible, setTripShareSheetVisible] = React.useState(false);
    const closeSelectedTimelineDetailSheet = React.useCallback(() => {
        setRouteAppSheetVisible(false);
        setSelectedTimelineTarget(null);
    }, []);
    const [isHeroHeaderCollapsed, setHeroHeaderCollapsed] = React.useState(false);
    const [isTripAnnouncementSheetVisible, setTripAnnouncementSheetVisible] = React.useState(false);
    const [isTripRevisionSheetVisible, setTripRevisionSheetVisible] = React.useState(false);
    const [tripRevisionItems, setTripRevisionItems] = React.useState<TripRevisionEntry[]>([]);
    const [isTripRevisionLoading, setTripRevisionLoading] = React.useState(false);
    const [tripRevisionError, setTripRevisionError] = React.useState<string | null>(null);
    const [tripRevisionBusyId, setTripRevisionBusyId] = React.useState<string | null>(null);
    const [tripRevisionNextCursor, setTripRevisionNextCursor] = React.useState<string | null>(null);
    const [tripRevisionHasMore, setTripRevisionHasMore] = React.useState(false);
    const tripListToggleQueueRef = React.useRef<Array<{
        listType: MobileTripListType;
        itemIndex: number;
        requestVersion: number;
    }>>([]);
    const tripListToggleProcessingRef = React.useRef(false);
    const tripListToggleVersionRef = React.useRef<Record<MobileTripListType, number>>({
        checklist: 0,
        shopping: 0
    });
    const { user, retryBootstrap, refreshSession } = useAuthSession();
    const { notifyPrimaryScrollActivity, scrollEventThrottle } = usePrimaryScrollActivityReporter();
    const {
        detail,
        isRemoteReady,
        isUsingCachedDetail,
        loading,
        isRefreshingRemote,
        error,
        errorKind,
        refreshError,
        isNotFound,
        retry,
        refresh,
        canEditContentByPermission,
        canEditContent,
        canManageShare,
        canSendAnnouncement,
        canPublishCommunity,
        isTripContentSyncing,
        timelineDetail,
        budgetAveragePerDayLabel,
        budgetDetailDays,
        tripListLocationOptions,
        openShoppingItems,
        displayedChecklist,
        displayedShoppingList,
        detailFilterChips
    } = useTripDetailScreenController({
        tripId: route.params.tripId,
        userId: user?.uid ?? null,
        isFocused,
        refreshSession,
        pendingTimelineDayOrders,
        optimisticTripLists
    });
    const hasPendingTimelineDayOrders = React.useMemo(
        () => Object.keys(pendingTimelineDayOrders).length > 0,
        [pendingTimelineDayOrders]
    );
    const isTripDetailWriteBusy = isTimelineInsertSaving
        || isBudgetExpenseSaving
        || isTripListSaving
        || isTripListToggleSyncing
        || isTimelineItemDeleting
        || isTimelineItemReordering
        || isTimelineDayReorganizing;
    const showTripSavedNotice = React.useCallback(() => {
        if (savedNoticeTimerRef.current) {
            clearTimeout(savedNoticeTimerRef.current);
        }

        setTripSavedNoticeVisible(true);
        savedNoticeTimerRef.current = setTimeout(() => {
            setTripSavedNoticeVisible(false);
            savedNoticeTimerRef.current = null;
        }, TRIP_SAVED_NOTICE_DURATION_MS);
    }, []);
    const publishTripDetailUpdatedWithFeedback = React.useCallback((updatedTrip: MobileTripDetail) => {
        publishTripDetailUpdated(updatedTrip);
        showTripSavedNotice();
    }, [showTripSavedNotice]);
    const tripSyncNotice = React.useMemo<TripSyncNotice | null>(() => {
        if (isTripDetailWriteBusy) {
            return {
                tone: 'saving',
                iconName: 'save',
                label: '저장 중',
                message: '변경사항을 같은 여행 데이터에 반영하고 있어요.'
            };
        }

        if (isTripSavedNoticeVisible) {
            return {
                tone: 'saved',
                iconName: 'circle-check',
                label: '저장됨',
                message: '변경사항이 여행에 반영됐어요.'
            };
        }

        if (isTripContentSyncing) {
            return {
                tone: 'checking',
                iconName: 'cloud-sync',
                label: '최신 확인 중',
                message: isUsingCachedDetail
                    ? '마지막으로 본 내용을 먼저 보여주고 있어요. 최신 확인 후 수정할 수 있어요.'
                    : '최신 여행 내용을 확인하고 있어요. 잠시 후 수정할 수 있어요.'
            };
        }

        if (refreshError) {
            return {
                tone: 'warning',
                iconName: 'wifi-off',
                label: '연결 불안정 - 마지막 내용을 표시 중',
                message: refreshError
            };
        }

        return null;
    }, [
        isTripContentSyncing,
        isTripDetailWriteBusy,
        isTripSavedNoticeVisible,
        isUsingCachedDetail,
        refreshError
    ]);
    const showDeferredEditNotice = Boolean(detail)
        && canEditContentByPermission
        && !canEditContent;
    const firstBudgetQuickAddDayId = React.useMemo(() => {
        const targetDay = budgetDetailDays.find((day) => day.itemOptions.length > 0);
        return targetDay?.id || '';
    }, [budgetDetailDays]);
    const firstMemoryQuickAddTarget = React.useMemo<TimelineMemoryComposerTarget>(() => {
        if (!timelineDetail) {
            return null;
        }

        for (let dayIndex = 0; dayIndex < timelineDetail.days.length; dayIndex += 1) {
            const day = timelineDetail.days[dayIndex];
            const primaryItemIndex = day.items.findIndex((item) => (
                item.badgeLabel !== '메모' && String(item.title || '').trim()
            ));
            const fallbackItemIndex = day.items.findIndex((item) => String(item.title || '').trim());
            const itemIndex = primaryItemIndex >= 0 ? primaryItemIndex : fallbackItemIndex;
            const item = itemIndex >= 0 ? day.items[itemIndex] : null;

            if (item) {
                return {
                    dayId: day.id,
                    dayIndex,
                    dayLabel: day.label,
                    dayDate: day.date,
                    itemId: item.id,
                    itemIndex,
                    itemTitle: item.title
                };
            }
        }

        return null;
    }, [timelineDetail]);
    const handleConsumeStartInCommunityPublishFlow = React.useCallback(() => {
        navigation.setParams({
            startInCommunityPublishFlow: undefined
        });
    }, [navigation]);
    const shareActions = useTripDetailShareActions({
        detail,
        userId: user?.uid ?? null,
        canManageShare,
        canPublishCommunity,
        isOfflineMode,
        startInCommunityPublishFlow: route.params.startInCommunityPublishFlow === true,
        onRequestOpenShareSheet: () => {
            setTripShareSheetVisible(true);
        },
        onRequestCloseShareSheet: () => {
            setTripShareSheetVisible(false);
        },
        onConsumeStartInCommunityPublishFlow: handleConsumeStartInCommunityPublishFlow,
        onNavigateCommunity: () => {
            navigation.navigate('Community');
        }
    });
    const announcementActions = useTripDetailAnnouncementActions({
        detail,
        canSendAnnouncement,
        isOfflineMode,
        onRequestOpenAnnouncementSheet: () => {
            setTripAnnouncementSheetVisible(true);
        },
        onRequestCloseAnnouncementSheet: () => {
            setTripAnnouncementSheetVisible(false);
        }
    });
    const hasHeroCoverImage = Boolean(detail?.coverImage);
    const resolvedHeaderTitle = String(detail?.title || '').trim() || '여행 상세';
    const heroHeaderChromeColor = isHeroHeaderCollapsed ? theme.colors.textPrimary : '#ffffff';
    const stickyFilterHeaderInset = React.useMemo(() => (
        hasHeroCoverImage
            ? insets.top + (Platform.OS === 'ios' ? 44 : 56)
            : 0
    ), [hasHeroCoverImage, insets.top]);
    const heroHeaderEditBadgeInsetStyle = React.useMemo(() => (
        hasHeroCoverImage
            ? {
                top: insets.top + (Platform.OS === 'ios' ? 52 : 64)
            }
            : null
    ), [hasHeroCoverImage, insets.top]);
    const heroHeaderBottomFadeColors = React.useMemo(() => (
        theme.mode === 'dark'
            ? [
                'rgba(0, 0, 0, 0)',
                'rgba(0, 0, 0, 0.04)',
                'rgba(0, 0, 0, 0.14)',
                'rgba(0, 0, 0, 0.30)',
                'rgba(0, 0, 0, 0.56)'
            ]
            : [
                'rgba(0, 0, 0, 0)',
                'rgba(0, 0, 0, 0.03)',
                'rgba(0, 0, 0, 0.11)',
                'rgba(0, 0, 0, 0.24)',
                'rgba(0, 0, 0, 0.46)'
            ]
    ), [theme.mode]);
    const detailStickyHeaderOffset = React.useMemo(() => (
        (hasHeroCoverImage ? stickyFilterHeaderInset : 0) + detailTabBarHeight
    ), [detailTabBarHeight, hasHeroCoverImage, stickyFilterHeaderInset]);
    const detailSectionActivationBuffer = Math.max(theme.spacing.md, 24);
    const canOpenTripInfoEdit = canEditContent && isTimelineEditMode && !isTripContentSyncing;
    const canShowTimelineReminderUi = detail?.status !== 'completed';
    const TripShareSheetComponent = isTripShareSheetVisible ? getTripShareSheetComponent() : null;
    const TripAnnouncementSheetComponent = isTripAnnouncementSheetVisible
        ? getTripAnnouncementSheetComponent()
        : null;
    const TripRevisionHistorySheetComponent = TRIP_REVISION_HISTORY_ENABLED && isTripRevisionSheetVisible
        ? getTripRevisionHistorySheetComponent()
        : null;

    const recoverTripWriteConflict = React.useCallback(async (
        message: string,
        options?: {
            inlineError?: (nextMessage: string) => void;
            alertTitle?: string;
        }
    ) => {
        if (message !== TRIP_WRITE_CONFLICT_MESSAGE) {
            return false;
        }

        try {
            await refresh();
        } catch {}

        if (options?.inlineError) {
            options.inlineError(message);
        } else if (options?.alertTitle) {
            Alert.alert(options.alertTitle, message);
        }

        return true;
    }, [refresh]);

    const animateTimelineHeightMorph = React.useCallback(() => {
        LayoutAnimation.configureNext(TIMELINE_HEIGHT_MORPH_ANIMATION);
    }, []);

    React.useEffect(() => {
        if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
            UIManager.setLayoutAnimationEnabledExperimental(true);
        }
    }, []);

    const handleRefresh = React.useCallback(async () => {
        if (loading || isRefreshingRemote) {
            return;
        }

        await refresh();
    }, [isRefreshingRemote, loading, refresh]);

    React.useEffect(() => {
        let isMounted = true;

        if (!isFocused || !detail) {
            setTripReminderRecordMap({});
            return () => {
                isMounted = false;
            };
        }

        void getTripReminderRecordMap(route.params.tripId)
            .then((nextMap) => {
                if (isMounted) {
                    setTripReminderRecordMap(nextMap);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setTripReminderRecordMap({});
                }
            });

        return () => {
            isMounted = false;
        };
    }, [detail, isFocused, route.params.tripId]);

    const selectedDay = React.useMemo<MobileTripDaySection | null>(() => {
        if (!timelineDetail || !selectedTimelineTarget) {
            return null;
        }

        return timelineDetail.days.find((day) => day.id === selectedTimelineTarget.dayId) || null;
    }, [selectedTimelineTarget, timelineDetail]);

    const selectedTimelineItem = React.useMemo<MobileTimelineDisplayItem | null>(() => {
        if (!selectedDay || !selectedTimelineTarget) {
            return null;
        }

        const indexedItem = selectedDay.items[selectedTimelineTarget.itemIndex];
        if (indexedItem) {
            return indexedItem;
        }

        return selectedDay.items.find((item) => item.id === selectedTimelineTarget.itemId) || null;
    }, [selectedDay, selectedTimelineTarget]);
    const isSelectedTimelineDetailVisible = Boolean(selectedTimelineItem && selectedDay);

    const animateSelectedTimelineDetailSheetToSnap = React.useCallback((nextSnap: TimelineDetailSheetSnap) => {
        const nextHeight = selectedTimelineDetailSheetHeights[nextSnap];
        setSelectedTimelineDetailSheetSnap(nextSnap);
        Animated.spring(selectedTimelineDetailSheetHeight, {
            toValue: nextHeight,
            useNativeDriver: false,
            damping: 15,
            stiffness: 220,
            mass: 0.78
        }).start(({ finished }) => {
            if (finished) {
                selectedTimelineDetailSheetHeightRef.current = nextHeight;
            }
        });
    }, [selectedTimelineDetailSheetHeight, selectedTimelineDetailSheetHeights]);

    React.useEffect(() => {
        if (!isSelectedTimelineDetailVisible) {
            return;
        }

        setSelectedTimelineDetailSheetSnap(DEFAULT_TIMELINE_DETAIL_SHEET_SNAP);
        selectedTimelineDetailSheetHeight.stopAnimation();
        selectedTimelineDetailSheetHeight.setValue(
            selectedTimelineDetailSheetHeights[DEFAULT_TIMELINE_DETAIL_SHEET_SNAP]
        );
        selectedTimelineDetailSheetHeightRef.current =
            selectedTimelineDetailSheetHeights[DEFAULT_TIMELINE_DETAIL_SHEET_SNAP];
        selectedTimelineDetailSheetDragStartHeightRef.current =
            selectedTimelineDetailSheetHeights[DEFAULT_TIMELINE_DETAIL_SHEET_SNAP];
    }, [
        isSelectedTimelineDetailVisible,
        selectedTimelineDetailSheetHeight,
        selectedTimelineDetailSheetHeights
    ]);

    React.useEffect(() => {
        if (!isSelectedTimelineDetailVisible) {
            return;
        }

        const nextHeight = selectedTimelineDetailSheetHeights[selectedTimelineDetailSheetSnap];
        selectedTimelineDetailSheetHeight.stopAnimation();
        selectedTimelineDetailSheetHeight.setValue(nextHeight);
        selectedTimelineDetailSheetHeightRef.current = nextHeight;
        selectedTimelineDetailSheetDragStartHeightRef.current = nextHeight;
    }, [
        isSelectedTimelineDetailVisible,
        selectedTimelineDetailSheetHeight,
        selectedTimelineDetailSheetHeights,
        selectedTimelineDetailSheetSnap
    ]);

    const selectedTimelineDetailSheetPanResponder = React.useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => (
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
            && Math.abs(gestureState.dy) > 2
        ),
        onMoveShouldSetPanResponder: (_event, gestureState) => (
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
            && Math.abs(gestureState.dy) > 2
        ),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
            selectedTimelineDetailSheetHeight.stopAnimation((value) => {
                selectedTimelineDetailSheetDragStartHeightRef.current = value;
                selectedTimelineDetailSheetHeightRef.current = value;
            });
        },
        onPanResponderMove: (_event, gestureState) => {
            const nextValue = clampNumericValue(
                selectedTimelineDetailSheetDragStartHeightRef.current - gestureState.dy,
                0,
                selectedTimelineDetailSheetHeights[MAX_TIMELINE_DETAIL_SHEET_SNAP]
            );

            selectedTimelineDetailSheetHeight.setValue(nextValue);
            selectedTimelineDetailSheetHeightRef.current = nextValue;
        },
        onPanResponderRelease: (_event, gestureState) => {
            const projectedValue = (
                selectedTimelineDetailSheetDragStartHeightRef.current
                - gestureState.dy
                - gestureState.vy * TIMELINE_DETAIL_SHEET_RELEASE_PROJECTION
            );

            const nextTarget = resolveTimelineDetailSheetReleaseSnap(
                selectedTimelineDetailSheetHeightRef.current,
                projectedValue,
                gestureState.vy,
                selectedTimelineDetailSheetHeights
            );

            if (nextTarget === 'close') {
                closeSelectedTimelineDetailSheet();
                return;
            }

            animateSelectedTimelineDetailSheetToSnap(nextTarget);
        },
        onPanResponderTerminate: () => {
            animateSelectedTimelineDetailSheetToSnap(resolveNearestTimelineDetailSheetSnap(
                selectedTimelineDetailSheetHeightRef.current,
                selectedTimelineDetailSheetHeights
            ));
        }
    }), [
        animateSelectedTimelineDetailSheetToSnap,
        closeSelectedTimelineDetailSheet,
        selectedTimelineDetailSheetHeight,
        selectedTimelineDetailSheetHeights
    ]);

    const selectedTimelineRouteAnchors = React.useMemo(() => {
        if (!selectedDay || !selectedTimelineItem || !selectedTimelineTarget || !selectedTimelineItem.isTransit) {
            return {
                previousPlace: null as MobileTimelineDisplayItem | null,
                nextPlace: null as MobileTimelineDisplayItem | null,
                canOpenRoute: false
            };
        }

        const anchors = findTimelineRouteAnchors(selectedDay, selectedTimelineTarget.itemIndex);
        return {
            previousPlace: anchors.previousPlace,
            nextPlace: anchors.nextPlace,
            canOpenRoute: Boolean(anchors.previousPlace && anchors.nextPlace)
        };
    }, [selectedDay, selectedTimelineItem, selectedTimelineTarget]);

    const selectedTimelineRouteContext = React.useMemo<ExternalRouteContext | null>(() => {
        if (!selectedTimelineItem) {
            return null;
        }

        if (selectedTimelineItem.isTransit) {
            if (!selectedTimelineRouteAnchors.canOpenRoute) {
                return null;
            }

            return {
                originItem: selectedTimelineRouteAnchors.previousPlace,
                destinationItem: selectedTimelineRouteAnchors.nextPlace,
                routeItem: selectedTimelineItem
            };
        }

        return {
            originItem: null,
            destinationItem: selectedTimelineItem,
            routeItem: selectedTimelineItem
        };
    }, [selectedTimelineItem, selectedTimelineRouteAnchors]);

    const isSelectedStandaloneMemo = Boolean(
        selectedTimelineItem && !selectedTimelineItem.isTransit && selectedTimelineItem.badgeLabel === '메모'
    );

    const selectedTimelineStatLabel = isSelectedStandaloneMemo
        ? ''
        : String(selectedTimelineItem?.transitWindowLabel || selectedTimelineItem?.timeLabel || '').trim() || '시간 미정';

    const selectedTimelineMemoBody = String(
        selectedTimelineItem?.note || selectedTimelineItem?.title || ''
    ).trim() || '등록된 메모가 아직 없어요.';
    const selectedTimelineMemoryPhotoUrls = React.useMemo(
        () => selectedTimelineItem ? getTimelineMemoryPhotoUrls(selectedTimelineItem) : [],
        [selectedTimelineItem]
    );
    const currentPhotoGalleryUrls = React.useMemo(
        () => photoGalleryState?.photoUrls || [],
        [photoGalleryState]
    );
    const currentPhotoGalleryCount = currentPhotoGalleryUrls.length;

    const selectedTimelineReminderSchedule = React.useMemo(() => {
        if (!selectedDay || !selectedTimelineItem || isSelectedStandaloneMemo) {
            return null;
        }

        return buildTimelineReminderSchedule(selectedDay, selectedTimelineItem);
    }, [isSelectedStandaloneMemo, selectedDay, selectedTimelineItem]);

    const selectedTimelineReminderUi = React.useMemo(() => {
        if (!canShowTimelineReminderUi || isSelectedStandaloneMemo || !selectedTimelineItem) {
            return {
                visible: false,
                body: '',
                support: '',
                canAdd: false,
                canRemove: false
            };
        }

        if (isTimelineReminderLoading) {
            return {
                visible: true,
                body: '알림 상태를 확인하고 있어요.',
                support: '',
                canAdd: false,
                canRemove: false
            };
        }

        if (selectedTimelineReminder) {
            return {
                visible: true,
                body: `${describeTimelineReminder(selectedTimelineReminder)}이 설정돼 있어요.`,
                support: '원하지 않으면 이 일정의 알림을 지울 수 있어요.',
                canAdd: false,
                canRemove: true
            };
        }

        if (!selectedTimelineReminderSchedule) {
            return {
                visible: true,
                body: '시간이 설정된 일정만 알림을 추가할 수 있어요.',
                support: '시작 시간이 있는 장소·이동 일정에서 쓸 수 있어요.',
                canAdd: false,
                canRemove: false
            };
        }

        if (selectedTimelineReminderSchedule.reminderAt.getTime() <= Date.now()) {
            return {
                visible: true,
                body: '이미 시작이 가까운 일정은 새 알림을 추가할 수 없어요.',
                support: `${selectedTimelineReminderSchedule.startTimeLabel} 시작 일정이에요.`,
                canAdd: false,
                canRemove: false
            };
        }

        return {
            visible: true,
            body: `${selectedTimelineReminderSchedule.reminderTimeLabel}에 10분 전 알림을 보내드려요.`,
            support: '예: 15:00 시작 이동 일정이면 14:50에 알려드려요.',
            canAdd: true,
            canRemove: false
        };
    }, [
        isSelectedStandaloneMemo,
        isTimelineReminderLoading,
        canShowTimelineReminderUi,
        selectedTimelineItem,
        selectedTimelineReminder,
        selectedTimelineReminderSchedule
    ]);

    const hasTimelineReminderRecord = React.useCallback((dayId: string, itemId: string) => (
        Boolean(tripReminderRecordMap[buildTimelineReminderKey(dayId, itemId)])
    ), [tripReminderRecordMap]);

    const shouldShowSelectedTimelineStats = Boolean(
        selectedTimelineItem && (
            (!isSelectedStandaloneMemo && selectedTimelineStatLabel) ||
            String(selectedTimelineItem.durationLabel || '').trim() ||
            String(selectedTimelineItem.expenseSummaryLabel || '').trim()
        )
    );

    React.useEffect(() => {
        if (selectedTimelineTarget && (!selectedDay || !selectedTimelineItem)) {
            setSelectedTimelineTarget(null);
        }
    }, [selectedDay, selectedTimelineItem, selectedTimelineTarget]);

    React.useEffect(() => {
        let isMounted = true;

        if (!canShowTimelineReminderUi || !selectedDay || !selectedTimelineItem) {
            setSelectedTimelineReminder(null);
            setTimelineReminderLoading(false);
            return () => {
                isMounted = false;
            };
        }

        setTimelineReminderLoading(true);
        void getTimelineReminderRecord(route.params.tripId, selectedDay.id, selectedTimelineItem.id)
            .then((record) => {
                if (isMounted) {
                    setSelectedTimelineReminder(record);
                }
            })
            .finally(() => {
                if (isMounted) {
                    setTimelineReminderLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [canShowTimelineReminderUi, route.params.tripId, selectedDay, selectedTimelineItem]);

    React.useEffect(() => {
        if (!isTimelineEditMode) {
            return;
        }

        setSelectedTimelineTarget(null);
    }, [isTimelineEditMode]);

    React.useEffect(() => {
        if (isTimelineEditMode) {
            return;
        }

        setTimelineInsertTarget(null);
        setTimelineComposerTarget(null);
        setTimelineMemoryComposerTarget(null);
        setTimelineMemoComposerTarget(null);
        setTimelineTransitTypePickerTarget(null);
        setTimelineTransitComposerTarget(null);
        setTimelineExistingPickerTarget(null);
        setTimelineQuickRouteTarget(null);
        setTimelineSortTargetDay(null);
        setTimelineInsertError(null);
        setQuickRouteOptions([]);
        setQuickRouteError(null);
        setQuickRouteLoading(false);
    }, [isTimelineEditMode]);

    React.useEffect(() => {
        if (!canEditContent && isTimelineEditMode) {
            animateTimelineHeightMorph();
            setTimelineEditMode(false);
        }
    }, [animateTimelineHeightMorph, canEditContent, isTimelineEditMode]);

    const resetTripRevisionSheetState = React.useCallback(() => {
        setTripRevisionSheetVisible(false);
        setTripRevisionItems([]);
        setTripRevisionLoading(false);
        setTripRevisionError(null);
        setTripRevisionBusyId(null);
        setTripRevisionNextCursor(null);
        setTripRevisionHasMore(false);
    }, []);

    React.useEffect(() => {
        if (canEditContentByPermission || !isTripRevisionSheetVisible) {
            return;
        }

        resetTripRevisionSheetState();
    }, [canEditContentByPermission, isTripRevisionSheetVisible, resetTripRevisionSheetState]);

    React.useEffect(() => {
        if (!detail) {
            return;
        }

        logUnicodeBoundary('trip:render:detail', 'trip.meta.title', detail.title, {
            tripId: detail.id
        });
        logUnicodeBoundary('trip:render:detail', 'trip.meta.subInfo', detail.subInfo, {
            tripId: detail.id
        });
    }, [detail]);

    React.useEffect(() => {
        setBudgetSummaryVisible(false);
        setBudgetExpenseComposerTarget(null);
        setBudgetExpenseSelectedItemId('');
        setBudgetExpenseDescription('');
        setBudgetExpenseAmount('');
        setBudgetExpenseCurrency(DEFAULT_EXPENSE_CURRENCY);
        setBudgetExpenseShoppingIndex(null);
        detailSectionOffsetsRef.current = {};
        setPendingTimelineDayOrders({});
        setSelectedDetailFilterKey('');
        setTripListComposerTarget(null);
        setTripListInput('');
        setTripListLocationKey('');
        resetTripRevisionSheetState();
        setOptimisticTripLists({
            checklist: null,
            shopping: null
        });
        setTripListToggleSyncing(false);
        tripListToggleQueueRef.current = [];
        tripListToggleProcessingRef.current = false;
        tripListToggleVersionRef.current = {
            checklist: 0,
            shopping: 0
        };
    }, [resetTripRevisionSheetState, route.params.tripId]);

    React.useEffect(() => {
        if (!timelineDetail) {
            return;
        }

        const availableKeys = new Set(detailFilterChips.map((chip) => chip.key));
        if (selectedDetailFilterKey && availableKeys.has(selectedDetailFilterKey)) {
            return;
        }

        setSelectedDetailFilterKey(timelineDetail.days[0]?.id || 'extras');
    }, [detailFilterChips, selectedDetailFilterKey, timelineDetail]);

    React.useEffect(() => {
        if (!selectedDetailFilterKey || !detailFilterScrollRef.current) {
            return;
        }

        const activeIndex = detailFilterChips.findIndex((chip) => chip.key === selectedDetailFilterKey);
        if (activeIndex < 0) {
            return;
        }

        const tabWidth = 88;
        const tabGap = theme.spacing.xs;
        const tabInset = theme.spacing.sm;
        const nextX = Math.max(0, activeIndex * (tabWidth + tabGap) - tabInset);

        detailFilterScrollRef.current.scrollTo({
            x: nextX,
            animated: true
        });
    }, [detailFilterChips, selectedDetailFilterKey, theme.spacing.sm, theme.spacing.xs]);

    const registerDetailSectionOffset = React.useCallback((key: TripDetailFilterKey, y: number) => {
        detailSectionOffsetsRef.current[key] = y;
    }, []);

    const scrollToDetailSection = React.useCallback((key: TripDetailFilterKey) => {
        const targetOffset = detailSectionOffsetsRef.current[key];
        if (!detailScrollRef.current || typeof targetOffset !== 'number') {
            return;
        }

        pendingDetailFilterKeyRef.current = key;
        setSelectedDetailFilterKey(key);
        detailScrollRef.current.scrollTo({
            y: Math.max(0, targetOffset - detailStickyHeaderOffset - theme.spacing.xs),
            animated: true
        });
    }, [detailStickyHeaderOffset, theme.spacing.xs]);

    const handleDetailScroll = React.useCallback((event: any) => {
        const offsetY = event.nativeEvent.contentOffset.y;
        const nextHeaderFillProgress = hasHeroCoverImage
            ? Math.max(0, Math.min(offsetY / Math.max(heroHeaderCollapseOffset, 1), 1))
            : 1;
        heroHeaderFillProgress.setValue(nextHeaderFillProgress);

        if (hasHeroCoverImage) {
            const shouldCollapse = offsetY >= heroHeaderCollapseOffset;
            if (shouldCollapse !== isHeroHeaderCollapsed) {
                setHeroHeaderCollapsed(shouldCollapse);
            }
        } else if (isHeroHeaderCollapsed) {
            setHeroHeaderCollapsed(false);
        }

        const visibleKeys = detailFilterChips
            .map((chip) => chip.key)
            .filter((key) => typeof detailSectionOffsetsRef.current[key] === 'number');

        if (visibleKeys.length === 0) {
            return;
        }

        const anchorY = offsetY + detailStickyHeaderOffset + theme.spacing.xs;
        const pendingKey = pendingDetailFilterKeyRef.current;

        if (pendingKey) {
            const pendingSectionY = detailSectionOffsetsRef.current[pendingKey];

            if (typeof pendingSectionY === 'number') {
                if (anchorY + detailSectionActivationBuffer >= pendingSectionY) {
                    pendingDetailFilterKeyRef.current = '';
                    if (selectedDetailFilterKey !== pendingKey) {
                        setSelectedDetailFilterKey(pendingKey);
                    }
                } else {
                    if (selectedDetailFilterKey !== pendingKey) {
                        setSelectedDetailFilterKey(pendingKey);
                    }
                    return;
                }
            } else {
                pendingDetailFilterKeyRef.current = '';
            }
        }

        let nextKey = visibleKeys[0];

        visibleKeys.forEach((key) => {
            const sectionY = detailSectionOffsetsRef.current[key];
            if (anchorY + detailSectionActivationBuffer >= sectionY) {
                nextKey = key;
            }
        });

        if (nextKey !== selectedDetailFilterKey) {
            setSelectedDetailFilterKey(nextKey);
        }
    }, [
        detailFilterChips,
        detailSectionActivationBuffer,
        detailStickyHeaderOffset,
        hasHeroCoverImage,
        heroHeaderCollapseOffset,
        heroHeaderFillProgress,
        isHeroHeaderCollapsed,
        selectedDetailFilterKey,
        theme.spacing.xs
    ]);

    React.useEffect(() => {
        setHeroHeaderCollapsed(false);
    }, [route.params.tripId]);

    React.useEffect(() => {
        heroHeaderFillProgress.setValue(hasHeroCoverImage ? 0 : 1);
    }, [hasHeroCoverImage, heroHeaderFillProgress, route.params.tripId]);

    React.useEffect(() => {
        if (!detail) {
            return;
        }

        setOptimisticTripLists((current) => {
            let didChange = false;
            const nextState = { ...current };

            if (current.checklist && current.checklist === detail.checklist) {
                nextState.checklist = null;
                didChange = true;
            }

            if (current.shopping && current.shopping === detail.shoppingList) {
                nextState.shopping = null;
                didChange = true;
            }

            return didChange ? nextState : current;
        });
    }, [detail]);

    const timelineRouteAvailability = React.useMemo(() => {
        if (!timelineDetail || !timelineInsertTarget) {
            return {
                canOpenQuickRoute: false,
                previousPlace: null as MobileTimelineDisplayItem | null,
                nextPlace: null as MobileTimelineDisplayItem | null
            };
        }

        const targetDay = timelineDetail.days.find((day) => day.id === timelineInsertTarget.dayId);
        if (!targetDay) {
            return {
                canOpenQuickRoute: false,
                previousPlace: null as MobileTimelineDisplayItem | null,
                nextPlace: null as MobileTimelineDisplayItem | null
            };
        }

        return findTimelineRouteAnchors(targetDay, timelineInsertTarget.insertAfterItemIndex);
    }, [timelineDetail, timelineInsertTarget]);

    const hasCopyableTimelineItems = React.useMemo(() => {
        return Boolean(timelineDetail?.days.some((day) => day.items.some((item) => !item.isTransit && item.badgeLabel !== '메모')));
    }, [timelineDetail]);

    const timelineInsertAnchorItem = React.useMemo(() => {
        if (!timelineDetail || !timelineInsertTarget) {
            return null;
        }

        const targetDay = timelineDetail.days.find((day) => day.id === timelineInsertTarget.dayId);
        if (!targetDay) {
            return null;
        }

        if (timelineInsertTarget.insertAfterItemIndex < 0) {
            return null;
        }

        return targetDay.items[timelineInsertTarget.insertAfterItemIndex] || null;
    }, [timelineDetail, timelineInsertTarget]);
    const timelineInsertContextLabel = React.useMemo(() => {
        if (!timelineInsertTarget) {
            return '';
        }

        if (!timelineInsertAnchorItem) {
            return `${timelineInsertTarget.dayLabel}의 맨 앞에 추가돼요.`;
        }

        const anchorTitle = String(timelineInsertAnchorItem.title || timelineInsertAnchorItem.badgeLabel || '선택한 일정').trim();
        return `"${anchorTitle || '선택한 일정'}" 다음에 추가돼요.`;
    }, [timelineInsertAnchorItem, timelineInsertTarget]);

    const canAddMemoryToAnchor = Boolean(timelineInsertAnchorItem);
    const canAddMemoToAnchor = Boolean(timelineInsertAnchorItem);
    const timelineInsertAnchorBudgetTarget = React.useMemo(() => {
        if (!timelineInsertTarget || !timelineInsertAnchorItem) {
            return null;
        }

        const targetDay = budgetDetailDays.find((day) => day.id === timelineInsertTarget.dayId);
        const targetOption = targetDay?.itemOptions.find((option) => option.itemId === timelineInsertAnchorItem.id) || null;
        if (!targetDay || !targetOption) {
            return null;
        }

        return {
            day: targetDay,
            option: targetOption
        };
    }, [budgetDetailDays, timelineInsertAnchorItem, timelineInsertTarget]);
    const canAddBudgetFromInsert = Boolean(timelineInsertAnchorBudgetTarget && canEditContent);

    const quickRouteAnchorLabels = React.useMemo(() => {
        if (!timelineDetail || !timelineQuickRouteTarget) {
            return {
                origin: '',
                destination: ''
            };
        }

        const targetDay = timelineDetail.days.find((day) => day.id === timelineQuickRouteTarget.dayId);
        if (!targetDay) {
            return {
                origin: '',
                destination: ''
            };
        }

        const anchors = findTimelineRouteAnchors(targetDay, timelineQuickRouteTarget.insertAfterItemIndex);

        return {
            origin: buildTimelineRouteQuery(anchors.previousPlace),
            destination: buildTimelineRouteQuery(anchors.nextPlace)
        };
    }, [timelineDetail, timelineQuickRouteTarget]);

    const openTimelineItemEditor = React.useCallback((
        day: MobileTripDaySection,
        item: MobileTimelineDisplayItem,
        itemIndex: number
    ) => {
        const isMemo = !item.isTransit && item.badgeLabel === '메모';
        const initialDurationMinutes = parseDurationStr(String(item.durationLabel || '').replace(/\n/g, ' '));
        const existingTripAttachmentCount = (detail?.days || []).reduce((tripTotal, tripDay) => (
            tripTotal + (tripDay.items || []).reduce((dayTotal, timelineItem) => (
                dayTotal + (Array.isArray(timelineItem.attachments) ? timelineItem.attachments.length : 0)
            ), 0)
        ), 0);
        const canPreservePlace = Boolean(
            item.placeId
            && typeof item.latitude === 'number'
            && Number.isFinite(item.latitude)
            && typeof item.longitude === 'number'
            && Number.isFinite(item.longitude)
        );
        setSelectedTimelineTarget(null);

        navigation.navigate('TimelineItemEdit', {
            tripId: route.params.tripId,
            tripTitle: detail?.title || '',
            dayId: day.id,
            itemId: item.id,
            itemIndex,
            itemTitle: item.title,
            dayLabel: day.label,
            dayDate: day.date,
            isMemo,
            isTransit: item.isTransit,
            initialInput: {
                title: !isMemo ? String(item.title || '').trim() : '',
                note: isMemo
                    ? String(item.note || item.title || '').trim()
                    : String(item.note || '').trim(),
                time: resolveTimelineAnchorStartTime(item),
                startTime: item.isTransit ? resolveTimelineAnchorStartTime(item) : undefined,
                endTime: item.isTransit ? resolveTimelineAnchorEndTime(item) : undefined,
                location: !isMemo && !item.isTransit ? String(item.location || '').trim() : '',
                durationMinutes: !isMemo && !item.isTransit && initialDurationMinutes > 0
                    ? initialDurationMinutes
                    : undefined,
                category: !isMemo && !item.isTransit
                    ? resolveEditableTimelineCategory(item)
                    : undefined,
                transitType: item.isTransit ? String(item.transitType || '').trim() : undefined,
                departure: item.flightInfo?.departure || '',
                arrival: item.flightInfo?.arrival || '',
                departureAirportCode: item.flightInfo?.departureAirportCode || '',
                arrivalAirportCode: item.flightInfo?.arrivalAirportCode || '',
                departureTimeZone: item.flightInfo?.departureTimeZone || '',
                arrivalTimeZone: item.flightInfo?.arrivalTimeZone || '',
                arrivalDayOffset: item.flightInfo?.arrivalDayOffset,
                flightNumber: item.flightInfo?.flightNumber || '',
                bookingRef: item.flightInfo?.bookingRef || '',
                terminal: item.flightInfo?.terminal || '',
                gate: item.flightInfo?.gate || '',
                memories: !isMemo
                    ? item.memoryEntries.map((memory) => ({
                        photoUrl: memory.photoUrl || null,
                        createdAt: String(memory.createdAt || '').trim()
                    }))
                    : [],
	                expenses: !isMemo
	                    ? item.expenseItems.map((expense) => ({
	                        description: String(expense.description || '').trim(),
	                        amount: Number(expense.amount) || 0,
	                        currency: normalizeExpenseCurrency(String(expense.currency || ''))
	                    }))
	                    : [],
                attachments: item.attachments.map((attachment) => ({
                    name: String(attachment.name || '').trim(),
                    type: String(attachment.mimeType || '').trim(),
                    url: String(attachment.url || '').trim(),
                    previewUrl: String(attachment.previewUrl || '').trim() || null
                })),
                place: canPreservePlace
                    ? {
                        placeId: String(item.placeId || ''),
                        name: String(item.location || '').trim(),
                        address: String(item.location || '').trim(),
                        latitude: Number(item.latitude),
                        longitude: Number(item.longitude),
                        countryCode: String(item.countryCode || '').trim()
                    }
                    : null
            },
            existingTripAttachmentCount
        });
    }, [detail?.days, detail?.title, navigation, route.params.tripId]);

    const handleOpenTimelineItem = React.useCallback((
        day: MobileTripDaySection,
        item: MobileTimelineDisplayItem,
        itemIndex: number
    ) => {
        if (isTimelineEditMode && !isRemoteReady) {
            Alert.alert('최신 확인 중', '최신 여행 내용을 확인한 뒤 수정할 수 있어요.');
            return;
        }

        if (isTimelineEditMode) {
            openTimelineItemEditor(day, item, itemIndex);
            return;
        }

        setSelectedTimelineTarget({
            dayId: day.id,
            itemId: item.id,
            itemIndex
        });
    }, [isRemoteReady, isTimelineEditMode, openTimelineItemEditor]);

    const flushPendingTimelineDayOrders = React.useCallback(async () => {
        if (!detail || !user?.uid) {
            return true;
        }

        const dayOrders = Object.entries(pendingTimelineDayOrders)
            .filter(([, orderedItemIds]) => Array.isArray(orderedItemIds) && orderedItemIds.length > 0)
            .map(([dayId, orderedItemIds]) => ({
                dayId,
                orderedItemIds
            }));
        if (dayOrders.length === 0) {
            if (Object.keys(pendingTimelineDayOrders).length > 0) {
                setPendingTimelineDayOrders({});
            }
            return true;
        }

        try {
            setTimelineItemReordering(true);
            const updatedTrip = await tripRepository.reorderTimelineDays(
                user.uid,
                route.params.tripId,
                dayOrders
            );

            if (!updatedTrip) {
                throw new Error('순서를 저장하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            setSelectedTimelineTarget((current) => syncSelectedTimelineTargetWithDetail(current, updatedTrip));
            setPendingTimelineDayOrders({});
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : '순서를 저장하지 못했어요.';
            if (await recoverTripWriteConflict(message, { alertTitle: '순서 저장 실패' })) {
                return false;
            }
            Alert.alert('순서 저장 실패', message);
            return false;
        } finally {
            setTimelineItemReordering(false);
        }
    }, [
        detail,
        pendingTimelineDayOrders,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        route.params.tripId,
        tripRepository,
        user?.uid
    ]);

    const handleToggleTimelineEditMode = React.useCallback(() => {
        if (!canEditContent || isTimelineInsertSaving || isTripContentSyncing || isTimelineItemReordering) {
            return;
        }

        void (async () => {
            if (isTimelineEditMode) {
                const didSavePendingOrders = await flushPendingTimelineDayOrders();
                if (!didSavePendingOrders) {
                    return;
                }
            }

            animateTimelineHeightMorph();
            setTimelineEditMode((current) => !current);
        })();
    }, [
        animateTimelineHeightMorph,
        canEditContent,
        flushPendingTimelineDayOrders,
        isTimelineEditMode,
        isTimelineInsertSaving,
        isTimelineItemReordering,
        isTripContentSyncing
    ]);

    const activateTimelineEditModeForInsertTarget = React.useCallback((
        target: { keepEditModeAfterSave?: boolean } | null | undefined
    ) => {
        if (!target?.keepEditModeAfterSave || isTimelineEditMode) {
            return;
        }

        animateTimelineHeightMorph();
        setTimelineEditMode(true);
    }, [animateTimelineHeightMorph, isTimelineEditMode]);

    const handleOpenTripInfoEdit = React.useCallback(() => {
        if (!detail || !canOpenTripInfoEdit) {
            return;
        }

        navigation.navigate('TripInfoEdit', {
            tripId: route.params.tripId,
            initialInput: detail.editInfo,
            initialPreviewImage: detail.coverImage || null,
            photoGalleryUrls: detail.photoGalleryUrls
        });
    }, [canOpenTripInfoEdit, detail, navigation, route.params.tripId]);

    const closeTripRevisionSheet = React.useCallback(() => {
        if (tripRevisionBusyId) {
            return;
        }

        setTripRevisionSheetVisible(false);
        setTripRevisionError(null);
    }, [tripRevisionBusyId]);

    const loadTripRevisions = React.useCallback(async (options?: {
        cursor?: string | null;
        reset?: boolean;
    }) => {
        if (!TRIP_REVISION_HISTORY_ENABLED || !detail || !user?.uid) {
            return;
        }

        const cursor = options?.cursor ?? null;
        const reset = options?.reset !== false;

        if (isTripRevisionLoading) {
            return;
        }

        setTripRevisionLoading(true);
        setTripRevisionError(null);

        try {
            const result = await tripRepository.listTripRevisions(user.uid, detail.id, {
                cursor,
                limit: 20
            });

            setTripRevisionItems((current) => (
                reset
                    ? result.items
                    : [...current, ...result.items]
            ));
            setTripRevisionNextCursor(result.nextCursor || null);
            setTripRevisionHasMore(result.hasMore === true);
        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : '수정 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
            setTripRevisionError(message);
        } finally {
            setTripRevisionLoading(false);
        }
    }, [detail, isTripRevisionLoading, tripRepository, user?.uid]);

    const handleOpenTripRevisionSheet = React.useCallback(() => {
        if (!TRIP_REVISION_HISTORY_ENABLED || !detail || !user?.uid || !canEditContentByPermission) {
            return;
        }

        setTripRevisionSheetVisible(true);
        void loadTripRevisions({
            reset: true
        });
    }, [canEditContentByPermission, detail, loadTripRevisions, user?.uid]);

    const handleLoadMoreTripRevisions = React.useCallback(() => {
        if (!tripRevisionHasMore || !tripRevisionNextCursor) {
            return;
        }

        void loadTripRevisions({
            cursor: tripRevisionNextCursor,
            reset: false
        });
    }, [loadTripRevisions, tripRevisionHasMore, tripRevisionNextCursor]);

    const handleRestoreTripRevision = React.useCallback((revisionId: string) => {
        if (
            !TRIP_REVISION_HISTORY_ENABLED
            || !detail
            || !user?.uid
            || !canEditContentByPermission
            || tripRevisionBusyId
        ) {
            return;
        }

        const selectedRevision = tripRevisionItems.find((entry) => entry.id === revisionId) || null;
        const restorePoint = formatTripRevisionRestorePoint(selectedRevision?.createdAt || '');
        const restoreSummaryText = selectedRevision?.summary?.text
            ? `기준 기록: ${selectedRevision.summary.text}\n`
            : '';

        Alert.alert(
            '이 시점으로 복구할까요?',
            `${restorePoint} 상태로 되돌립니다.\n${restoreSummaryText}제목/날짜/일정/체크리스트가 모두 이 시점으로 복구됩니다.\n이 작업도 새 수정 기록으로 남아요.`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '복구',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            setTripRevisionBusyId(revisionId);
                            setTripRevisionError(null);

                            try {
                                const updatedTrip = await tripRepository.restoreTripRevision(
                                    user.uid,
                                    detail.id,
                                    revisionId
                                );

                                if (!updatedTrip) {
                                    throw new Error('복구된 여행 내용을 다시 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
                                }

                                publishTripDetailUpdatedWithFeedback(updatedTrip);
                                setTripRevisionSheetVisible(false);
                                Alert.alert('복구 완료', '선택한 시점으로 여행 내용을 되돌렸어요.');
                            } catch (error) {
                                const message = error instanceof Error
                                    ? error.message
                                    : '여행을 복구하지 못했어요. 잠시 후 다시 시도해 주세요.';

                                if (await recoverTripWriteConflict(message, { alertTitle: '복구 실패' })) {
                                    return;
                                }

                                setTripRevisionError(message);
                                Alert.alert('복구 실패', message);
                            } finally {
                                setTripRevisionBusyId(null);
                            }
                        })();
                    }
                }
            ]
        );
    }, [
        canEditContentByPermission,
        detail,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        tripRepository,
        tripRevisionBusyId,
        tripRevisionItems,
        user?.uid
    ]);

    React.useLayoutEffect(() => {
        const renderHeaderChromeIcon = (
            iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'],
            size = 23
        ) => (
            <>
                <Animated.View
                    pointerEvents="none"
                    style={[
                        styles.headerActionButtonHeroFill,
                        {
                            opacity: heroHeaderOverlayOpacity
                        }
                    ]}
                />
                <View pointerEvents="none" style={styles.headerActionButtonIconStack}>
                    <Animated.View
                        style={[
                            styles.headerActionButtonIconLayer,
                            {
                                opacity: heroHeaderOverlayOpacity
                            }
                        ]}
                    >
                        <MaterialCommunityIcons name={iconName} size={size} color="#111111" />
                    </Animated.View>
                    <Animated.View
                        style={[
                            styles.headerActionButtonIconLayer,
                            {
                                opacity: heroHeaderFillProgress
                            }
                        ]}
                    >
                        <MaterialCommunityIcons name={iconName} size={size} color={theme.colors.textPrimary} />
                    </Animated.View>
                </View>
            </>
        );

        navigation.setOptions({
            title: hasHeroCoverImage ? '' : resolvedHeaderTitle,
            headerTitleAlign: 'left',
            headerTransparent: hasHeroCoverImage,
            headerTintColor: heroHeaderChromeColor,
            headerStyle: {
                backgroundColor: hasHeroCoverImage ? 'transparent' : theme.colors.background
            },
            headerTitle: hasHeroCoverImage
                ? () => (
                    <Animated.Text
                        numberOfLines={1}
                        style={[
                            styles.headerTitleText,
                            {
                                opacity: heroHeaderFillProgress
                            }
                        ]}
                    >
                        {resolvedHeaderTitle}
                    </Animated.Text>
                )
                : undefined,
            headerBackground: hasHeroCoverImage
                ? () => (
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            styles.headerBackgroundSolid,
                            {
                                opacity: heroHeaderFillProgress
                            }
                        ]}
                    />
                )
                : undefined,
            headerLeft: ({ canGoBack }) => {
                if (!canGoBack) {
                    return null;
                }

                return (
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="뒤로가기"
                        hitSlop={8}
                        onPress={navigation.goBack}
                        style={({ pressed }) => [
                            styles.headerActionButton,
                            pressed ? styles.editButtonPressed : null
                        ]}
                    >
                        {renderHeaderChromeIcon('arrow-left', 24)}
                    </Pressable>
                );
            },
            headerRight: () => {
                const showEditButton = canEditContentByPermission;
                const showRevisionButton = canEditContentByPermission && TRIP_REVISION_HISTORY_ENABLED;
                const showShareButton = canManageShare;
                const showAnnouncementButton = canSendAnnouncement;
                const isRevisionActionDisabled = Boolean(tripRevisionBusyId);
                const isShareActionDisabled = shareActions.isHeaderShareLoading || isOfflineMode;
                const isAnnouncementActionDisabled = announcementActions.isTripAnnouncementSending || isOfflineMode;

                if (!showEditButton && !showRevisionButton && !showShareButton && !showAnnouncementButton) {
                    return null;
                }

                return (
                    <View style={styles.headerActionRow}>
                        {showEditButton ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={isTimelineEditMode ? '일정 수정 종료' : '일정 수정'}
                                disabled={isTripContentSyncing || isTimelineInsertSaving || isTimelineItemReordering}
                                onPress={handleToggleTimelineEditMode}
                                style={({ pressed }) => [
                                    styles.headerActionButton,
                                    (isTripContentSyncing || isTimelineInsertSaving || isTimelineItemReordering)
                                        ? styles.sheetHeaderActionDisabled
                                        : null,
                                    pressed ? styles.editButtonPressed : null
                                ]}
                            >
                                {renderHeaderChromeIcon(isTimelineEditMode ? 'check' : 'pencil-outline')}
                            </Pressable>
                        ) : null}
                        {showRevisionButton ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="수정 기록"
                                disabled={isRevisionActionDisabled}
                                onPress={handleOpenTripRevisionSheet}
                                style={({ pressed }) => [
                                    styles.headerActionButton,
                                    isRevisionActionDisabled ? styles.sheetHeaderActionDisabled : null,
                                    pressed ? styles.editButtonPressed : null
                                ]}
                            >
                                {renderHeaderChromeIcon('history')}
                            </Pressable>
                        ) : null}
                        {showShareButton ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="공유 설정"
                                disabled={isShareActionDisabled}
                                onPress={shareActions.handleOpenTripShareSheet}
                                style={({ pressed }) => [
                                    styles.headerActionButton,
                                    isShareActionDisabled ? styles.sheetHeaderActionDisabled : null,
                                    pressed ? styles.editButtonPressed : null
                                ]}
                            >
                                {renderHeaderChromeIcon('share-variant-outline')}
                            </Pressable>
                        ) : null}
                        {showAnnouncementButton ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="참가자 공지"
                                disabled={isAnnouncementActionDisabled}
                                onPress={announcementActions.handleOpenTripAnnouncementSheet}
                                style={({ pressed }) => [
                                    styles.headerActionButton,
                                    isAnnouncementActionDisabled ? styles.sheetHeaderActionDisabled : null,
                                    pressed ? styles.editButtonPressed : null
                                ]}
                            >
                                {renderHeaderChromeIcon('bullhorn-outline')}
                            </Pressable>
                        ) : null}
                    </View>
                );
            }
        });
    }, [
        announcementActions.handleOpenTripAnnouncementSheet,
        announcementActions.isTripAnnouncementSending,
        canEditContentByPermission,
        canManageShare,
        canSendAnnouncement,
        handleOpenTripRevisionSheet,
        handleToggleTimelineEditMode,
        hasHeroCoverImage,
        heroHeaderChromeColor,
        heroHeaderFillProgress,
        heroHeaderOverlayOpacity,
        isOfflineMode,
        isTimelineEditMode,
        isTimelineInsertSaving,
        isTimelineItemReordering,
        isTripContentSyncing,
        navigation,
        shareActions.handleOpenTripShareSheet,
        shareActions.isHeaderShareLoading,
        tripRevisionBusyId,
        resolvedHeaderTitle,
        styles,
        theme.colors.background,
        theme.colors.textPrimary
    ]);

    const handleOpenTimelineInsertOptions = React.useCallback((day: MobileTripDaySection, insertAfterIndex: number) => {
        if (!timelineDetail) {
            return;
        }

        if (hasPendingTimelineDayOrders) {
            Alert.alert('순서 저장 필요', '순서를 바꾼 뒤에는 완료 체크로 먼저 저장한 다음 새 일정을 추가해 주세요.');
            return;
        }

        const dayIndex = timelineDetail.days.findIndex((entry) => entry.id === day.id);
        if (dayIndex < 0) {
            return;
        }

        const anchorItem = insertAfterIndex >= 0 ? day.items[insertAfterIndex] : null;
        const fallbackTripLocation = resolvePrimaryTripLocationLabel(
            String(timelineDetail.editInfo.location || timelineDetail.locationLabel || '')
        );
        const anchorQuery = buildTimelineRouteQuery(anchorItem);

        setTimelineInsertError(null);
        setSelectedTimelineTarget(null);
        setTimelineInsertTarget({
            dayId: day.id,
            dayIndex,
            dayLabel: day.label,
            dayDate: day.date,
            insertAfterItemId: anchorItem?.id || null,
            insertAfterItemIndex: insertAfterIndex,
            defaultTime: buildTimelineInsertDefaultTime(day, insertAfterIndex),
            initialMapCenter: hasTimelineItemCoords(anchorItem)
                ? {
                    latitude: Number(anchorItem.latitude),
                    longitude: Number(anchorItem.longitude)
                }
                : null,
            initialMapQuery: anchorQuery || fallbackTripLocation,
            keepEditModeAfterSave: !isTimelineEditMode && day.items.length === 0
        });
    }, [hasPendingTimelineDayOrders, isTimelineEditMode, timelineDetail]);

    const handleCloseTimelineInsertOptions = React.useCallback(() => {
        if (isTimelineInsertSaving) {
            return;
        }

        setTimelineInsertTarget(null);
        setTimelineInsertError(null);
    }, [isTimelineInsertSaving]);

    const handleSelectTimelineNewPlace = React.useCallback(() => {
        if (!timelineInsertTarget) {
            return;
        }

        setTimelineComposerTarget(timelineInsertTarget);
        setTimelineInsertTarget(null);
    }, [timelineInsertTarget]);

    const handleSelectTimelineMemo = React.useCallback(() => {
        if (!timelineInsertTarget || !timelineInsertAnchorItem) {
            return;
        }

        setTimelineMemoComposerTarget({
            dayId: timelineInsertTarget.dayId,
            dayIndex: timelineInsertTarget.dayIndex,
            dayLabel: timelineInsertTarget.dayLabel,
            dayDate: timelineInsertTarget.dayDate,
            itemId: timelineInsertAnchorItem.id,
            itemIndex: timelineInsertTarget.insertAfterItemIndex,
            itemTitle: timelineInsertAnchorItem.title,
            defaultTime: timelineInsertTarget.defaultTime
        });
        setTimelineInsertTarget(null);
    }, [timelineInsertAnchorItem, timelineInsertTarget]);

    const handleSelectTimelineBudget = React.useCallback(() => {
        if (!timelineInsertTarget || !timelineInsertAnchorBudgetTarget || !canEditContent) {
            return;
        }

        setBudgetExpenseComposerTarget({
            dayId: timelineInsertAnchorBudgetTarget.day.id,
            dayLabel: timelineInsertAnchorBudgetTarget.day.label,
            dayDate: timelineInsertAnchorBudgetTarget.day.date,
            isItemSelectionLocked: true,
            options: [timelineInsertAnchorBudgetTarget.option]
        });
        setBudgetExpenseSelectedItemId(timelineInsertAnchorBudgetTarget.option.itemId);
        setBudgetExpenseDescription('');
        setBudgetExpenseAmount('');
        setBudgetExpenseCurrency(DEFAULT_EXPENSE_CURRENCY);
        setBudgetExpenseShoppingIndex(null);
        setTimelineInsertTarget(null);
    }, [canEditContent, timelineInsertAnchorBudgetTarget, timelineInsertTarget]);

    const handleSelectTimelineMemory = React.useCallback(() => {
        if (!timelineInsertTarget || !timelineInsertAnchorItem) {
            return;
        }

        setTimelineMemoryComposerTarget({
            dayId: timelineInsertTarget.dayId,
            dayIndex: timelineInsertTarget.dayIndex,
            dayLabel: timelineInsertTarget.dayLabel,
            dayDate: timelineInsertTarget.dayDate,
            itemId: timelineInsertAnchorItem.id,
            itemIndex: timelineInsertTarget.insertAfterItemIndex,
            itemTitle: timelineInsertAnchorItem.title
        });
        setTimelineInsertTarget(null);
    }, [timelineInsertAnchorItem, timelineInsertTarget]);

    const handleSelectTimelineManualTransit = React.useCallback(() => {
        if (!timelineInsertTarget) {
            return;
        }

        setTimelineTransitTypePickerTarget(timelineInsertTarget);
        setTimelineInsertTarget(null);
    }, [timelineInsertTarget]);

    const handleSelectTimelineTransitType = React.useCallback((transitType: MobileTimelineManualTransitType) => {
        if (!timelineTransitTypePickerTarget) {
            return;
        }

        setTimelineTransitComposerTarget({
            ...timelineTransitTypePickerTarget,
            transitType,
            defaultEndTime: buildTimelineTransitDefaultEndTime(timelineTransitTypePickerTarget.defaultTime)
        });
        setTimelineTransitTypePickerTarget(null);
    }, [timelineTransitTypePickerTarget]);

    const handleSelectTimelineExistingItem = React.useCallback(() => {
        if (!timelineInsertTarget) {
            return;
        }

        setTimelineExistingPickerTarget(timelineInsertTarget);
        setTimelineInsertTarget(null);
    }, [timelineInsertTarget]);

    const handleSelectTimelineQuickRoute = React.useCallback(async () => {
        if (!timelineDetail || !timelineInsertTarget) {
            return;
        }

        const targetDay = timelineDetail.days.find((day) => day.id === timelineInsertTarget.dayId);
        if (!targetDay) {
            return;
        }

        const routeAnchors = findTimelineRouteAnchors(targetDay, timelineInsertTarget.insertAfterItemIndex);
        if (!routeAnchors.previousPlace || !routeAnchors.nextPlace) {
            return;
        }

        const nextQuickRouteTarget = timelineInsertTarget;
        setTimelineInsertTarget(null);
        setTimelineQuickRouteTarget(nextQuickRouteTarget);
        setQuickRouteOptions([]);
        setQuickRouteError(null);
        setQuickRouteLoading(true);

        try {
            const departureTime = buildTimelineQuickRouteDepartureTime(
                routeAnchors.previousPlace,
                nextQuickRouteTarget.defaultTime
            );
            const routeOptions = await searchTripQuickRouteOptions({
                origin: routeAnchors.previousPlace,
                destination: routeAnchors.nextPlace,
                dayDate: nextQuickRouteTarget.dayDate,
                departureTime
            });
            setQuickRouteOptions(routeOptions);
        } catch (error) {
            setQuickRouteError(
                error instanceof Error
                    ? error.message
                    : '자동 추천 경로를 찾지 못했어요.'
            );
        } finally {
            setQuickRouteLoading(false);
        }
    }, [timelineDetail, timelineInsertTarget]);

    const handleCloseTimelineComposer = React.useCallback(() => {
        if (isTimelineInsertSaving) {
            return;
        }

        setTimelineComposerTarget(null);
        setTimelineInsertError(null);
    }, [isTimelineInsertSaving]);

    const handleCloseTimelineMemoComposer = React.useCallback(() => {
        if (isTimelineInsertSaving) {
            return;
        }

        setTimelineMemoComposerTarget(null);
        setTimelineInsertError(null);
    }, [isTimelineInsertSaving]);

    const handleCloseTimelineMemoryComposer = React.useCallback(() => {
        if (isTimelineInsertSaving) {
            return;
        }

        setTimelineMemoryComposerTarget(null);
        setTimelineInsertError(null);
    }, [isTimelineInsertSaving]);

    const handleCloseTimelineTransitComposer = React.useCallback(() => {
        if (isTimelineInsertSaving) {
            return;
        }

        setTimelineTransitComposerTarget(null);
        setTimelineInsertError(null);
    }, [isTimelineInsertSaving]);

    const handleCloseTimelineTransitTypePicker = React.useCallback(() => {
        if (isTimelineInsertSaving) {
            return;
        }

        setTimelineTransitTypePickerTarget(null);
        setTimelineInsertError(null);
    }, [isTimelineInsertSaving]);

    const handleCloseTimelineExistingPicker = React.useCallback(() => {
        if (isTimelineInsertSaving) {
            return;
        }

        setTimelineExistingPickerTarget(null);
        setTimelineInsertError(null);
    }, [isTimelineInsertSaving]);

    const handleCloseTimelineQuickRoutePicker = React.useCallback(() => {
        if (isTimelineInsertSaving) {
            return;
        }

        setTimelineQuickRouteTarget(null);
        setQuickRouteOptions([]);
        setQuickRouteError(null);
        setQuickRouteLoading(false);
    }, [isTimelineInsertSaving]);

    const handleSubmitTimelineComposer = React.useCallback(async (input: MobileTimelineItemCreateInput) => {
        if (!user?.uid || !timelineComposerTarget || isTimelineInsertSaving) {
            return;
        }

        try {
            setTimelineInsertSaving(true);
            setTimelineInsertError(null);

            const updatedTrip = await tripRepository.insertTimelineItem(
                user.uid,
                route.params.tripId,
                timelineComposerTarget.dayId,
                timelineComposerTarget.insertAfterItemId,
                timelineComposerTarget.insertAfterItemIndex,
                input
            );

            if (!updatedTrip) {
                throw new Error('일정을 추가하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            activateTimelineEditModeForInsertTarget(timelineComposerTarget);
            setTimelineComposerTarget(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : '일정을 추가하지 못했어요.';
            if (await recoverTripWriteConflict(message, { inlineError: setTimelineInsertError })) {
                return;
            }
            setTimelineInsertError(message);
        } finally {
            setTimelineInsertSaving(false);
        }
    }, [
        activateTimelineEditModeForInsertTarget,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        isTimelineInsertSaving,
        route.params.tripId,
        timelineComposerTarget,
        tripRepository,
        user?.uid
    ]);

    const handleSubmitTimelineMemo = React.useCallback(async (input: { time: string; content: string }) => {
        if (!user?.uid || !timelineMemoComposerTarget || isTimelineInsertSaving) {
            return;
        }

        try {
            setTimelineInsertSaving(true);
            setTimelineInsertError(null);

            const targetDay = timelineDetail?.days.find((day) => day.id === timelineMemoComposerTarget.dayId);
            const indexedTargetItem = targetDay?.items[timelineMemoComposerTarget.itemIndex] || null;
            const targetItem = indexedTargetItem?.id === timelineMemoComposerTarget.itemId
                ? indexedTargetItem
                : targetDay?.items.find((item) => item.id === timelineMemoComposerTarget.itemId) || null;

            if (!targetItem) {
                throw new Error('메모를 붙일 일정을 찾을 수 없어요.');
            }

            const existingNote = String(
                targetItem.note || (targetItem.badgeLabel === '메모' ? targetItem.title : '') || ''
            ).trim();
            const nextContent = String(input.content || '').trim();
            const nextNote = existingNote ? `${existingNote}\n${nextContent}` : nextContent;
            const updatedTrip = await tripRepository.updateTimelineItem(
                user.uid,
                route.params.tripId,
                timelineMemoComposerTarget.dayId,
                timelineMemoComposerTarget.itemId,
                timelineMemoComposerTarget.itemIndex,
                {
                    note: nextNote
                }
            );

            if (!updatedTrip) {
                throw new Error('메모를 추가하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            setTimelineMemoComposerTarget(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : '메모를 추가하지 못했어요.';
            if (await recoverTripWriteConflict(message, { inlineError: setTimelineInsertError })) {
                return;
            }
            setTimelineInsertError(message);
        } finally {
            setTimelineInsertSaving(false);
        }
    }, [
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        isTimelineInsertSaving,
        route.params.tripId,
        timelineDetail,
        timelineMemoComposerTarget,
        tripRepository,
        user?.uid
    ]);

    const handleSubmitTimelineMemory = React.useCallback(async (input: { assets: PickedTripMemoryAsset[] }) => {
        if (!user?.uid || !timelineMemoryComposerTarget || isTimelineInsertSaving) {
            return;
        }

        try {
            setTimelineInsertSaving(true);
            setTimelineInsertError(null);

            const uploadedPhotoUrls = await uploadTripMemoryAssets({
                tripId: route.params.tripId,
                dayIndex: timelineMemoryComposerTarget.dayIndex,
                itemIndex: timelineMemoryComposerTarget.itemIndex,
                assets: input.assets
            });
            const updatedTrip = await tripRepository.appendTimelineItemMemories(
                user.uid,
                route.params.tripId,
                timelineMemoryComposerTarget.dayId,
                timelineMemoryComposerTarget.itemId,
                timelineMemoryComposerTarget.itemIndex,
                {
                    uploadedPhotoUrls,
                    createdAt: new Date().toISOString()
                }
            );

            if (!updatedTrip) {
                throw new Error('추억을 추가하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            setTimelineMemoryComposerTarget(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : '추억을 추가하지 못했어요.';
            if (await recoverTripWriteConflict(message, { inlineError: setTimelineInsertError })) {
                return;
            }
            setTimelineInsertError(message);
        } finally {
            setTimelineInsertSaving(false);
        }
    }, [
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        isTimelineInsertSaving,
        route.params.tripId,
        timelineMemoryComposerTarget,
        tripRepository,
        user?.uid
    ]);

    const scheduleAutoReminderForTransitItem = React.useCallback(async (
        tripDetail: typeof detail,
        dayId: string,
        itemIndex: number
    ) => {
        if (!tripDetail) {
            return;
        }

        const targetDay = tripDetail.days.find((day) => day.id === dayId);
        const targetItem = targetDay?.items[itemIndex] || null;

        if (!targetDay || !targetItem || !targetItem.isTransit) {
            return;
        }

        const result = await scheduleTimelineReminder({
            tripId: tripDetail.id,
            tripTitle: tripDetail.title,
            day: targetDay,
            item: targetItem
        });

        if (!result.ok || !result.record) {
            return;
        }

        setTripReminderRecordMap((current) => ({
            ...current,
            [buildTimelineReminderKey(targetDay.id, targetItem.id)]: result.record
        }));
    }, []);

    const handleSubmitTimelineTransit = React.useCallback(async (input: MobileTimelineTransitCreateInput) => {
        if (!user?.uid || !timelineTransitComposerTarget || isTimelineInsertSaving) {
            return;
        }

        try {
            setTimelineInsertSaving(true);
            setTimelineInsertError(null);

            const updatedTrip = await tripRepository.insertManualTransitItem(
                user.uid,
                route.params.tripId,
                timelineTransitComposerTarget.dayId,
                timelineTransitComposerTarget.insertAfterItemId,
                timelineTransitComposerTarget.insertAfterItemIndex,
                input
            );

            if (!updatedTrip) {
                throw new Error('이동 카드를 추가하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            await scheduleAutoReminderForTransitItem(
                updatedTrip,
                timelineTransitComposerTarget.dayId,
                timelineTransitComposerTarget.insertAfterItemIndex + 1
            );
            activateTimelineEditModeForInsertTarget(timelineTransitComposerTarget);
            setTimelineTransitComposerTarget(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : '이동 카드를 추가하지 못했어요.';
            if (await recoverTripWriteConflict(message, { inlineError: setTimelineInsertError })) {
                return;
            }
            setTimelineInsertError(message);
        } finally {
            setTimelineInsertSaving(false);
        }
    }, [
        activateTimelineEditModeForInsertTarget,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        isTimelineInsertSaving,
        route.params.tripId,
        scheduleAutoReminderForTransitItem,
        timelineTransitComposerTarget,
        tripRepository,
        user?.uid
    ]);

    const handleSelectQuickRouteOption = React.useCallback(async (option: MobileQuickRouteOption) => {
        if (!user?.uid || !timelineQuickRouteTarget || isTimelineInsertSaving) {
            return;
        }

        try {
            setTimelineInsertSaving(true);
            setQuickRouteError(null);

            const updatedTrip = await tripRepository.insertQuickRouteItem(
                user.uid,
                route.params.tripId,
                timelineQuickRouteTarget.dayId,
                timelineQuickRouteTarget.insertAfterItemId,
                timelineQuickRouteTarget.insertAfterItemIndex,
                option
            );

            if (!updatedTrip) {
                throw new Error('이동 카드를 추가하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            await scheduleAutoReminderForTransitItem(
                updatedTrip,
                timelineQuickRouteTarget.dayId,
                timelineQuickRouteTarget.insertAfterItemIndex + 1
            );
            activateTimelineEditModeForInsertTarget(timelineQuickRouteTarget);
            setTimelineQuickRouteTarget(null);
            setQuickRouteOptions([]);
        } catch (error) {
            const message = error instanceof Error ? error.message : '이동 카드를 추가하지 못했어요.';
            if (await recoverTripWriteConflict(message, { inlineError: setQuickRouteError })) {
                return;
            }
            setQuickRouteError(message);
        } finally {
            setTimelineInsertSaving(false);
        }
    }, [
        activateTimelineEditModeForInsertTarget,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        isTimelineInsertSaving,
        route.params.tripId,
        scheduleAutoReminderForTransitItem,
        timelineQuickRouteTarget,
        tripRepository,
        user?.uid
    ]);

    const handleCopyTimelineItemToInsertTarget = React.useCallback(async (
        sourceDayId: string,
        sourceItemId: string,
        sourceItemIndex: number
    ) => {
        if (!user?.uid || !timelineExistingPickerTarget || isTimelineInsertSaving) {
            return;
        }

        try {
            setTimelineInsertSaving(true);
            setTimelineInsertError(null);

            const updatedTrip = await tripRepository.copyTimelineItem(
                user.uid,
                route.params.tripId,
                timelineExistingPickerTarget.dayId,
                timelineExistingPickerTarget.insertAfterItemId,
                timelineExistingPickerTarget.insertAfterItemIndex,
                sourceDayId,
                sourceItemId,
                sourceItemIndex
            );

            if (!updatedTrip) {
                throw new Error('기존 일정을 가져오지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            await scheduleAutoReminderForTransitItem(
                updatedTrip,
                timelineExistingPickerTarget.dayId,
                timelineExistingPickerTarget.insertAfterItemIndex + 1
            );
            activateTimelineEditModeForInsertTarget(timelineExistingPickerTarget);
            setTimelineExistingPickerTarget(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : '기존 일정을 가져오지 못했어요.';
            if (await recoverTripWriteConflict(message, { inlineError: setTimelineInsertError })) {
                return;
            }
            setTimelineInsertError(message);
        } finally {
            setTimelineInsertSaving(false);
        }
    }, [
        activateTimelineEditModeForInsertTarget,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        isTimelineInsertSaving,
        route.params.tripId,
        scheduleAutoReminderForTransitItem,
        timelineExistingPickerTarget,
        tripRepository,
        user?.uid
    ]);

    const handleCloseTimelineItem = closeSelectedTimelineDetailSheet;

    const handleEditSelectedTimelineItem = React.useCallback(() => {
        if (!canEditContent || !selectedDay || !selectedTimelineItem || !selectedTimelineTarget) {
            return;
        }

        if (!isRemoteReady) {
            Alert.alert('최신 확인 중', '최신 여행 내용을 확인한 뒤 수정할 수 있어요.');
            return;
        }

        openTimelineItemEditor(selectedDay, selectedTimelineItem, selectedTimelineTarget.itemIndex);
    }, [
        canEditContent,
        isRemoteReady,
        openTimelineItemEditor,
        selectedDay,
        selectedTimelineItem,
        selectedTimelineTarget
    ]);

    const handleDeleteTimelineItemWithConfirmation = React.useCallback((
        day: MobileTripDaySection,
        item: MobileTimelineDisplayItem,
        itemIndex: number
    ) => {
        if (!user?.uid || isTimelineItemDeleting || isTripContentSyncing) {
            if (isTripContentSyncing) {
                Alert.alert('동기화 중', '최신 여행 내용을 확인한 뒤 다시 시도해 주세요.');
            }
            return;
        }

        const itemTitle = String(item.title || item.badgeLabel || '일정').trim() || '일정';

        Alert.alert(
            '일정을 삭제할까요?',
            `"${itemTitle}" 항목이 일정에서 삭제돼요.`,
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            try {
                                setTimelineItemDeleting(true);
                                const updatedTrip = await tripRepository.deleteTimelineItem(
                                    user.uid,
                                    route.params.tripId,
                                    day.id,
                                    item.id,
                                    itemIndex
                                );

                                if (!updatedTrip) {
                                    throw new Error('일정을 삭제하지 못했어요.');
                                }

                                try {
                                    await cancelTimelineReminder(route.params.tripId, day.id, item.id);
                                } catch {}
                                setTripReminderRecordMap((current) => {
                                    const nextMap = { ...current };
                                    delete nextMap[buildTimelineReminderKey(day.id, item.id)];
                                    return nextMap;
                                });
                                publishTripDetailUpdatedWithFeedback(updatedTrip);
                                setSelectedTimelineTarget((current) => {
                                    if (!current) {
                                        return null;
                                    }

                                    if (current.dayId === day.id && current.itemId === item.id) {
                                        return null;
                                    }

                                    return current;
                                });
                            } catch (error) {
                                const message = error instanceof Error ? error.message : '일정을 삭제하지 못했어요.';
                                if (await recoverTripWriteConflict(message, { alertTitle: '삭제 실패' })) {
                                    return;
                                }
                                Alert.alert('삭제 실패', message);
                            } finally {
                                setTimelineItemDeleting(false);
                            }
                        })();
                    }
                }
            ]
        );
    }, [
        isTripContentSyncing,
        isTimelineItemDeleting,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        route.params.tripId,
        tripRepository,
        user?.uid
    ]);

    const handleDeleteTimelineItem = React.useCallback(() => {
        if (!selectedTimelineItem || !selectedDay || !selectedTimelineTarget) {
            return;
        }

        handleDeleteTimelineItemWithConfirmation(
            selectedDay,
            selectedTimelineItem,
            selectedTimelineTarget.itemIndex
        );
    }, [
        handleDeleteTimelineItemWithConfirmation,
        selectedDay,
        selectedTimelineItem,
        selectedTimelineTarget
    ]);

    const stagePendingTimelineDayOrder = React.useCallback((
        dayId: string,
        orderedItems: MobileTimelineDisplayItem[]
    ) => {
        if (!detail) {
            return;
        }

        const orderedItemIds = orderedItems.map((entry) => entry.id).filter(Boolean);
        const baseDay = detail.days.find((entry) => entry.id === dayId);
        if (!baseDay || orderedItemIds.length === 0) {
            return;
        }

        setPendingTimelineDayOrders((current) => {
            const currentPendingOrder = current[dayId];
            if (areTimelineItemIdListsEqual(currentPendingOrder, orderedItemIds)) {
                return current;
            }

            if (areTimelineItemOrdersEqual(baseDay.items, orderedItemIds)) {
                if (!(dayId in current)) {
                    return current;
                }

                const nextState = { ...current };
                delete nextState[dayId];
                return nextState;
            }

            return {
                ...current,
                [dayId]: orderedItemIds
            };
        });
    }, [detail]);

    const handleMoveTimelineItem = React.useCallback((
        day: MobileTripDaySection,
        item: MobileTimelineDisplayItem,
        itemIndex: number,
        direction: 'up' | 'down'
    ) => {
        if (isTimelineItemDeleting || isTimelineItemReordering) {
            return;
        }

        const resolvedItemIndex = day.items[itemIndex]?.id === item.id
            ? itemIndex
            : day.items.findIndex((entry) => entry.id === item.id);
        if (resolvedItemIndex < 0) {
            return;
        }

        const targetIndex = direction === 'up'
            ? resolvedItemIndex - 1
            : resolvedItemIndex + 1;
        if (targetIndex < 0 || targetIndex >= day.items.length) {
            return;
        }

        const nextItems = moveTimelineDisplayItems(day.items, resolvedItemIndex, targetIndex);
        if (nextItems === day.items) {
            return;
        }

        stagePendingTimelineDayOrder(day.id, nextItems);
    }, [
        isTimelineItemReordering,
        isTimelineItemDeleting,
        stagePendingTimelineDayOrder
    ]);

    const handleOpenTimelineSortMenu = React.useCallback((day: MobileTripDaySection) => {
        if (!isTimelineEditMode) {
            return;
        }

        if (hasPendingTimelineDayOrders) {
            Alert.alert('순서 저장 필요', '순서를 바꾼 뒤에는 완료 체크로 먼저 저장한 다음 재정렬을 사용할 수 있어요.');
            return;
        }

        setTimelineSortTargetDay(day);
    }, [hasPendingTimelineDayOrders, isTimelineEditMode]);

    const handleCloseTimelineSortMenu = React.useCallback(() => {
        if (isTimelineDayReorganizing) {
            return;
        }

        setTimelineSortTargetDay(null);
    }, [isTimelineDayReorganizing]);

    const handleReorganizeTimelineDay = React.useCallback(async (mode: 'time' | 'recalc') => {
        if (!user?.uid || !timelineSortTargetDay || isTimelineDayReorganizing) {
            return;
        }

        try {
            setTimelineDayReorganizing(true);
            const updatedTrip = await tripRepository.reorganizeTimelineDay(
                user.uid,
                route.params.tripId,
                timelineSortTargetDay.id,
                mode
            );

            if (!updatedTrip) {
                throw new Error('일정을 재정렬하지 못했어요.');
            }

            try {
                await syncTripRemindersForDetail(updatedTrip);
                const nextReminderMap = await getTripReminderRecordMap(route.params.tripId);
                setTripReminderRecordMap(nextReminderMap);
            } catch (syncError) {
                console.warn('Failed to sync trip reminders after timeline day reorganize', syncError);
            }
            publishTripDetailUpdatedWithFeedback(updatedTrip);
            setTimelineSortTargetDay(null);
        } catch (error) {
            const message = error instanceof Error ? error.message : '일정을 재정렬하지 못했어요.';
            if (await recoverTripWriteConflict(message, { alertTitle: '재정렬 실패' })) {
                return;
            }
            Alert.alert('재정렬 실패', message);
        } finally {
            setTimelineDayReorganizing(false);
        }
    }, [
        isTimelineDayReorganizing,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        route.params.tripId,
        timelineSortTargetDay,
        tripRepository,
        user?.uid
    ]);

    const handleOpenPhotoGallery = React.useCallback(() => {
        if (!detail || detail.photoGalleryUrls.length === 0) {
            return;
        }

        setPhotoViewerZoomed(false);
        setPhotoViewerVisible(false);
        setPhotoGalleryIndex(0);
        setPhotoGalleryVisible(true);
        setPhotoGalleryState({
            label: '추억 갤러리',
            title: `전체 사진 ${detail.photoCount}장`,
            photoUrls: detail.photoGalleryUrls
        });
    }, [detail]);

    const handleOpenSummaryPhotoViewer = React.useCallback((initialIndex: number) => {
        if (!detail || detail.photoGalleryUrls.length === 0) {
            return;
        }

        const safeIndex = Math.min(Math.max(initialIndex, 0), detail.photoGalleryUrls.length - 1);
        setPhotoViewerZoomed(false);
        setPhotoGalleryVisible(false);
        setPhotoGalleryState({
            label: '추억 갤러리',
            title: `전체 사진 ${detail.photoCount}장`,
            photoUrls: detail.photoGalleryUrls
        });
        setPhotoGalleryIndex(safeIndex);
        setPhotoViewerVisible(true);
    }, [detail]);

    const handleOpenBudgetSummary = React.useCallback(() => {
        if (!detail?.budgetSummary) {
            return;
        }

        setBudgetSummaryVisible(true);
    }, [detail?.budgetSummary]);

    const handleCloseBudgetSummary = React.useCallback(() => {
        setBudgetSummaryVisible(false);
    }, []);

    const handleOpenBudgetExpenseComposer = React.useCallback((dayId: string) => {
        const targetDay = budgetDetailDays.find((day) => day.id === dayId);
        if (!targetDay || targetDay.itemOptions.length === 0 || !canEditContent) {
            return;
        }

        setBudgetExpenseComposerTarget({
            dayId: targetDay.id,
            dayLabel: targetDay.label,
            dayDate: targetDay.date,
            options: targetDay.itemOptions
        });
        setBudgetExpenseSelectedItemId(targetDay.itemOptions[0]?.itemId || '');
        setBudgetExpenseDescription('');
        setBudgetExpenseAmount('');
        setBudgetExpenseCurrency(DEFAULT_EXPENSE_CURRENCY);
        setBudgetExpenseShoppingIndex(null);
    }, [budgetDetailDays, canEditContent]);

    const handleOpenQuickMemoryComposer = React.useCallback(() => {
        if (!canEditContent) {
            return;
        }

        if (!firstMemoryQuickAddTarget) {
            Alert.alert('추억 추가', '먼저 추억을 붙일 일정을 추가해 주세요.');
            return;
        }

        setTimelineMemoryComposerTarget(firstMemoryQuickAddTarget);
    }, [canEditContent, firstMemoryQuickAddTarget]);

    const handleOpenQuickBudgetExpenseComposer = React.useCallback(() => {
        if (!canEditContent) {
            return;
        }

        if (!firstBudgetQuickAddDayId) {
            Alert.alert('지출 추가', '먼저 지출을 연결할 일정을 추가해 주세요.');
            return;
        }

        handleOpenBudgetExpenseComposer(firstBudgetQuickAddDayId);
    }, [canEditContent, firstBudgetQuickAddDayId, handleOpenBudgetExpenseComposer]);

    const flushTripListToggleQueue = React.useCallback(async () => {
        if (tripListToggleProcessingRef.current || !user?.uid) {
            return;
        }

        tripListToggleProcessingRef.current = true;
        setTripListToggleSyncing(true);

        try {
            while (tripListToggleQueueRef.current.length > 0) {
                const nextToggle = tripListToggleQueueRef.current.shift();
                if (!nextToggle) {
                    continue;
                }

                try {
                    const updatedTrip = await tripRepository.toggleTripListItem(
                        user.uid,
                        route.params.tripId,
                        nextToggle.listType,
                        nextToggle.itemIndex
                    );

                    if (!updatedTrip) {
                        throw new Error('항목 상태를 바꾸지 못했어요.');
                    }

                    const hasLaterSameListToggle = tripListToggleQueueRef.current.some((entry) => (
                        entry.listType === nextToggle.listType
                    ));

                    if (
                        !hasLaterSameListToggle
                        && tripListToggleVersionRef.current[nextToggle.listType] === nextToggle.requestVersion
                    ) {
                        setOptimisticTripLists((current) => ({
                            ...current,
                            [nextToggle.listType]: nextToggle.listType === 'shopping'
                                ? updatedTrip.shoppingList
                                : updatedTrip.checklist
                        }));
                    }

                    publishTripDetailUpdatedWithFeedback(updatedTrip);
                } catch (error) {
                    tripListToggleQueueRef.current = [];
                    setOptimisticTripLists({
                        checklist: null,
                        shopping: null
                    });
                    const message = error instanceof Error ? error.message : '항목 상태를 바꾸지 못했어요.';
                    if (await recoverTripWriteConflict(message, { alertTitle: '리스트 수정 실패' })) {
                        break;
                    }
                    Alert.alert('리스트 수정 실패', message);
                    void refresh();
                    break;
                }
            }
        } finally {
            tripListToggleProcessingRef.current = false;
            setTripListToggleSyncing(false);
        }
    }, [publishTripDetailUpdatedWithFeedback, recoverTripWriteConflict, refresh, route.params.tripId, tripRepository, user?.uid]);

    const handleCloseBudgetExpenseComposer = React.useCallback(() => {
        if (isBudgetExpenseSaving) {
            return;
        }

        setBudgetExpenseComposerTarget(null);
        setBudgetExpenseSelectedItemId('');
        setBudgetExpenseDescription('');
        setBudgetExpenseAmount('');
        setBudgetExpenseCurrency(DEFAULT_EXPENSE_CURRENCY);
        setBudgetExpenseShoppingIndex(null);
    }, [isBudgetExpenseSaving]);

    const handleSubmitBudgetExpense = React.useCallback(async () => {
        if (!detail || !budgetExpenseComposerTarget || !budgetExpenseSelectedItemId || !user?.uid) {
            return;
        }

        const targetItem = budgetExpenseComposerTarget.options.find((item) => item.itemId === budgetExpenseSelectedItemId);
        if (!targetItem) {
            Alert.alert('항목 선택', '지출을 연결할 일정을 먼저 선택해 주세요.');
            return;
        }

        const amount = Number(String(budgetExpenseAmount || '').replace(/[^\d.-]/g, ''));
        if (!Number.isFinite(amount) || amount <= 0) {
            Alert.alert('금액 확인', '금액은 1원 이상 입력해 주세요.');
            return;
        }

        const expenseDescription = String(budgetExpenseDescription || '').trim();
        const allowEmptyExpenseDescription = budgetExpenseComposerTarget.isItemSelectionLocked === true;
        if (!expenseDescription && !allowEmptyExpenseDescription) {
            Alert.alert('지출 내역', '어떤 지출인지 입력해 주세요.');
            return;
        }

        try {
            setBudgetExpenseSaving(true);
            const updatedTrip = await tripRepository.appendExpenseToTimelineItem(
                user.uid,
                route.params.tripId,
                budgetExpenseComposerTarget.dayId,
                targetItem.itemId,
                targetItem.itemIndex,
                {
                    description: expenseDescription,
                    amount,
                    currency: normalizeExpenseCurrency(budgetExpenseCurrency),
                    allowEmptyDescription: allowEmptyExpenseDescription,
                    linkedShoppingItemIndex: budgetExpenseShoppingIndex
                }
            );

            if (!updatedTrip) {
                throw new Error('지출을 추가하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            handleCloseBudgetExpenseComposer();
        } catch (error) {
            const message = error instanceof Error ? error.message : '지출을 추가하지 못했어요.';
            if (await recoverTripWriteConflict(message, { alertTitle: '지출 추가 실패' })) {
                return;
            }
            Alert.alert('지출 추가 실패', message);
        } finally {
            setBudgetExpenseSaving(false);
        }
    }, [
        budgetExpenseAmount,
        budgetExpenseComposerTarget,
        budgetExpenseCurrency,
        budgetExpenseDescription,
        budgetExpenseSelectedItemId,
        budgetExpenseShoppingIndex,
        detail,
        handleCloseBudgetExpenseComposer,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        route.params.tripId,
        tripRepository,
        user?.uid
    ]);

    const handleOpenTripListComposer = React.useCallback((listType: MobileTripListType) => {
        if (!canEditContent) {
            return;
        }

        setTripListComposerTarget(listType);
        setTripListInput('');
        setTripListLocationKey('');
    }, [canEditContent]);

    const handleCloseTripListComposer = React.useCallback(() => {
        if (isTripListSaving) {
            return;
        }

        setTripListComposerTarget(null);
        setTripListInput('');
        setTripListLocationKey('');
    }, [isTripListSaving]);

    const handleSubmitTripListItem = React.useCallback(async () => {
        if (!tripListComposerTarget || !user?.uid || isTripListToggleSyncing) {
            return;
        }

        const text = String(tripListInput || '').trim();
        if (!text) {
            Alert.alert('항목 입력', '항목 이름을 입력해 주세요.');
            return;
        }

        const selectedLocation = tripListLocationOptions.find((entry) => entry.key === tripListLocationKey) || null;

        try {
            setTripListSaving(true);
            const updatedTrip = await tripRepository.addTripListItem(
                user.uid,
                route.params.tripId,
                tripListComposerTarget,
                {
                    text,
                    location: tripListComposerTarget === 'shopping' ? selectedLocation?.title : undefined,
                    locationDetail: tripListComposerTarget === 'shopping' ? selectedLocation?.location : undefined
                }
            );

            if (!updatedTrip) {
                throw new Error('항목을 추가하지 못했어요.');
            }

            publishTripDetailUpdatedWithFeedback(updatedTrip);
            handleCloseTripListComposer();
        } catch (error) {
            const message = error instanceof Error ? error.message : '항목을 추가하지 못했어요.';
            if (await recoverTripWriteConflict(message, { alertTitle: '리스트 저장 실패' })) {
                return;
            }
            Alert.alert('리스트 저장 실패', message);
        } finally {
            setTripListSaving(false);
        }
    }, [
        handleCloseTripListComposer,
        isTripListToggleSyncing,
        publishTripDetailUpdatedWithFeedback,
        recoverTripWriteConflict,
        route.params.tripId,
        tripListComposerTarget,
        tripListInput,
        tripListLocationKey,
        tripListLocationOptions,
        tripRepository,
        user?.uid
    ]);

    const handleToggleTripListItem = React.useCallback(async (listType: MobileTripListType, itemIndex: number) => {
        if (!user?.uid || !canEditContent || !detail) {
            return;
        }

        const currentItems = listType === 'shopping'
            ? (optimisticTripLists.shopping ?? detail.shoppingList)
            : (optimisticTripLists.checklist ?? detail.checklist);
        const targetItem = currentItems[itemIndex];

        if (!targetItem) {
            return;
        }

        const nextItems = currentItems.map((item, index) => (
            index === itemIndex
                ? {
                    ...item,
                    checked: item.checked !== true
                }
                : item
        ));

        setOptimisticTripLists((current) => ({
            ...current,
            [listType]: nextItems
        }));
        const nextRequestVersion = tripListToggleVersionRef.current[listType] + 1;
        tripListToggleVersionRef.current[listType] = nextRequestVersion;
        tripListToggleQueueRef.current.push({
            listType,
            itemIndex,
            requestVersion: nextRequestVersion
        });

        void flushTripListToggleQueue();
    }, [
        canEditContent,
        detail,
        flushTripListToggleQueue,
        optimisticTripLists.checklist,
        optimisticTripLists.shopping,
        user?.uid
    ]);

    const handleOpenSelectedTimelineMemoryViewer = React.useCallback((initialIndex = 0) => {
        if (selectedTimelineMemoryPhotoUrls.length === 0) {
            return;
        }

        const safeIndex = Math.min(Math.max(initialIndex, 0), selectedTimelineMemoryPhotoUrls.length - 1);
        setPhotoViewerZoomed(false);
        setPhotoGalleryVisible(false);
        setPhotoGalleryState({
            label: '추억 갤러리',
            title: selectedTimelineItem
                ? buildTimelineMemoryGalleryTitle(selectedTimelineItem, selectedTimelineMemoryPhotoUrls.length)
                : `추억 사진 ${selectedTimelineMemoryPhotoUrls.length}장`,
            photoUrls: selectedTimelineMemoryPhotoUrls
        });
        setPhotoGalleryIndex(safeIndex);
        setPhotoViewerVisible(true);
    }, [selectedTimelineItem, selectedTimelineMemoryPhotoUrls]);

    const handleClosePhotoGallery = React.useCallback(() => {
        setPhotoGalleryVisible(false);
        setPhotoViewerVisible(false);
        setPhotoViewerZoomed(false);
        setPhotoGalleryIndex(0);
        setPhotoGalleryState(null);
    }, []);

    const handleOpenPhotoViewer = React.useCallback((index: number) => {
        if (currentPhotoGalleryUrls.length === 0) {
            return;
        }

        const safeIndex = Math.min(Math.max(index, 0), currentPhotoGalleryUrls.length - 1);
        setPhotoViewerZoomed(false);
        setPhotoGalleryIndex(safeIndex);
        setPhotoViewerVisible(true);
    }, [currentPhotoGalleryUrls]);

    const handleClosePhotoViewer = React.useCallback(() => {
        setPhotoViewerVisible(false);
        setPhotoViewerZoomed(false);
        if (!isPhotoGalleryVisible) {
            setPhotoGalleryIndex(0);
            setPhotoGalleryState(null);
        }
    }, [isPhotoGalleryVisible]);

    const handleOpenRouteAppSheet = React.useCallback(() => {
        if (!selectedTimelineRouteContext?.destinationItem) {
            return;
        }

        setRouteAppSheetVisible(true);
    }, [selectedTimelineRouteContext]);

    const handleCloseRouteAppSheet = React.useCallback(() => {
        setRouteAppSheetVisible(false);
    }, []);

    const handleOpenRouteWithProvider = React.useCallback(async (provider: 'google' | 'naver' | 'kakao') => {
        if (!selectedTimelineRouteContext?.destinationItem) {
            return;
        }

        const routeUrlSequence = buildRouteUrlSequence(provider, selectedTimelineRouteContext);
        if (routeUrlSequence.length === 0) {
            return;
        }

        setRouteAppSheetVisible(false);
        await openRouteUrlSequence(routeUrlSequence);
    }, [selectedTimelineRouteContext]);

    const handleToggleTimelineReminderForItem = React.useCallback(async (
        day: MobileTripDaySection,
        item: MobileTimelineDisplayItem
    ) => {
        if (!detail || isTimelineReminderSaving || (item.badgeLabel === '메모' && !item.isTransit)) {
            return;
        }

        const reminderKey = buildTimelineReminderKey(day.id, item.id);
        const existingRecord = tripReminderRecordMap[reminderKey] || null;

        setTimelineReminderSaving(true);
        try {
            if (existingRecord) {
                await cancelTimelineReminder(route.params.tripId, day.id, item.id);
                setTripReminderRecordMap((current) => {
                    const nextMap = { ...current };
                    delete nextMap[reminderKey];
                    return nextMap;
                });
                setSelectedTimelineReminder((current) => (
                    current?.dayId === day.id && current?.itemId === item.id ? null : current
                ));
                return;
            }

            const result = await scheduleTimelineReminder({
                tripId: route.params.tripId,
                tripTitle: detail.title,
                day,
                item
            });

            if (!result.ok || !result.record) {
                if (result.reason === 'permission-denied') {
                    Alert.alert('알림 권한 필요', '여행 일정을 알려드리려면 알림 권한을 허용해 주세요.');
                    return;
                }

                if (result.reason === 'past') {
                    Alert.alert('알림 설정 불가', '이미 시작이 가까운 일정은 새 알림을 추가할 수 없어요.');
                    return;
                }

                Alert.alert('알림 설정 불가', '시간이 설정된 일정만 알림을 추가할 수 있어요.');
                return;
            }

            setTripReminderRecordMap((current) => ({
                ...current,
                [reminderKey]: result.record
            }));
            setSelectedTimelineReminder((current) => (
                selectedDay?.id === day.id && selectedTimelineItem?.id === item.id
                    ? result.record
                    : current
            ));
        } catch (error) {
            const message = error instanceof Error ? error.message : '알림을 변경하지 못했어요.';
            Alert.alert('알림 변경 실패', message);
        } finally {
            setTimelineReminderSaving(false);
        }
    }, [
        detail,
        isTimelineReminderSaving,
        route.params.tripId,
        selectedDay?.id,
        selectedTimelineItem?.id,
        tripReminderRecordMap
    ]);

    const handleScheduleTimelineReminder = React.useCallback(async () => {
        if (!detail || !selectedDay || !selectedTimelineItem || isTimelineReminderSaving) {
            return;
        }

        setTimelineReminderSaving(true);
        try {
            const result = await scheduleTimelineReminder({
                tripId: route.params.tripId,
                tripTitle: detail.title,
                day: selectedDay,
                item: selectedTimelineItem
            });

            if (!result.ok) {
                if (result.reason === 'permission-denied') {
                    Alert.alert('알림 권한 필요', '여행 일정을 알려드리려면 알림 권한을 허용해 주세요.');
                    return;
                }

                if (result.reason === 'past') {
                    Alert.alert('알림 설정 불가', '이미 시작이 가까운 일정은 새 알림을 추가할 수 없어요.');
                    return;
                }

                Alert.alert('알림 설정 불가', '시간이 설정된 일정만 알림을 추가할 수 있어요.');
                return;
            }

            setSelectedTimelineReminder(result.record);
            setTripReminderRecordMap((current) => ({
                ...current,
                [buildTimelineReminderKey(selectedDay.id, selectedTimelineItem.id)]: result.record
            }));
            Alert.alert(
                '알림 설정 완료',
                `${result.schedule.reminderTimeLabel}에 ${result.schedule.leadMinutes}분 전 알림을 보내드릴게요.`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : '알림을 추가하지 못했어요.';
            Alert.alert('알림 설정 실패', message);
        } finally {
            setTimelineReminderSaving(false);
        }
    }, [
        detail,
        isTimelineReminderSaving,
        route.params.tripId,
        selectedDay,
        selectedTimelineItem
    ]);

    const handleCancelTimelineReminder = React.useCallback(() => {
        if (!selectedDay || !selectedTimelineItem || isTimelineReminderSaving) {
            return;
        }

        Alert.alert(
            '알림을 삭제할까요?',
            '이 일정의 10분 전 알림을 취소해요.',
            [
                {
                    text: '취소',
                    style: 'cancel'
                },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: () => {
                        void (async () => {
                            try {
                                setTimelineReminderSaving(true);
                                await cancelTimelineReminder(route.params.tripId, selectedDay.id, selectedTimelineItem.id);
                                setSelectedTimelineReminder(null);
                                setTripReminderRecordMap((current) => {
                                    const nextMap = { ...current };
                                    delete nextMap[buildTimelineReminderKey(selectedDay.id, selectedTimelineItem.id)];
                                    return nextMap;
                                });
                            } catch (error) {
                                const message = error instanceof Error ? error.message : '알림을 삭제하지 못했어요.';
                                Alert.alert('알림 삭제 실패', message);
                            } finally {
                                setTimelineReminderSaving(false);
                            }
                        })();
                    }
                }
            ]
        );
    }, [
        isTimelineReminderSaving,
        route.params.tripId,
        selectedDay,
        selectedTimelineItem
    ]);

    const handleOpenAttachment = React.useCallback(async (url: string) => {
        const trimmed = String(url || '').trim();
        if (!trimmed) {
            return;
        }

        try {
            await Linking.openURL(trimmed);
        } catch {}
    }, []);

    React.useEffect(() => {
        if (!isPhotoViewerVisible) {
            return;
        }

        const frame = requestAnimationFrame(() => {
            galleryScrollRef.current?.scrollTo({
                x: Math.max(windowWidth, 1) * photoGalleryIndex,
                animated: false
            });
        });

        return () => {
            cancelAnimationFrame(frame);
        };
    }, [isPhotoViewerVisible, photoGalleryIndex, windowWidth]);

    React.useEffect(() => () => {
        if (savedNoticeTimerRef.current) {
            clearTimeout(savedNoticeTimerRef.current);
        }
    }, []);

    if (loading) {
        return <LoadingView title="여행 정보를 불러오는 중" />;
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
                                        : '상세 정보를 불러오지 못했어요.'
                            }
                            description={error}
                            supportText={
                                errorKind === 'network'
                                    ? '인터넷 연결이 돌아오면 새로고침으로 상세 내용을 다시 확인할 수 있어요.'
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
                        <View style={styles.stateDebugBlock}>
                            <DebugInfoCard
                                screen="TripDetail"
                                dataState="error"
                                lastDataError={error}
                            />
                        </View>
                    </View>
                </View>
                <BottomNavBar activeTab="TripList" />
            </View>
        );
    }

    if (isNotFound || !detail) {
        return (
            <View style={styles.shell}>
                <View style={styles.screenBody}>
                    <View style={styles.stateContent}>
                        <EmptyState
                            title="여행을 찾을 수 없어요."
                            description="여행 목록에서 다시 선택해 주세요."
                            actionLabel="목록으로 돌아가기"
                            onAction={() => {
                                if (navigation.canGoBack()) {
                                    navigation.goBack();
                                    return;
                                }

                                navigation.navigate('TripList');
                            }}
                        />
                        <View style={styles.stateDebugBlock}>
                            <DebugInfoCard
                                screen="TripDetail"
                                dataState="not-found"
                            />
                        </View>
                    </View>
                </View>
                <BottomNavBar activeTab="TripList" />
            </View>
        );
    }

    const canQuickAddMemory = canEditContent && Boolean(firstMemoryQuickAddTarget) && !isTimelineInsertSaving;
    const canQuickAddBudget = canEditContent && Boolean(firstBudgetQuickAddDayId) && !isBudgetExpenseSaving;
    const isTimelineCompletelyEmpty = Boolean(timelineDetail?.days.length)
        && (timelineDetail?.days.every((day) => day.items.length === 0) ?? false);
    const firstTimelineDay = timelineDetail?.days[0] || null;

    const budgetSummarySection = detail.budgetSummary ? (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel="예산 상세 보기"
            onPress={handleOpenBudgetSummary}
            style={({ pressed }) => [
                styles.summaryCard,
                pressed ? styles.summaryCardPressed : null
            ]}
        >
            <Text style={styles.summaryLabel}>예산 요약</Text>
            <Text style={styles.summaryValue}>{detail.budgetSummary.totalLabel}</Text>
            <Text style={styles.summaryCaption}>{detail.budgetSummary.caption}</Text>
            <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                    <Text style={styles.metaPillLabel}>기록 {detail.budgetSummary.entryCount}건</Text>
                </View>
                <View style={styles.metaPill}>
                    <Text style={styles.metaPillLabel}>합계 기록일 {detail.budgetSummary.daysWithExpenseCount}일</Text>
                </View>
                {budgetAveragePerDayLabel ? (
                    <View style={styles.metaPill}>
                        <Text style={styles.metaPillLabel}>일 평균 {budgetAveragePerDayLabel}</Text>
                    </View>
                ) : null}
            </View>
        </Pressable>
    ) : (
        <View style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
                <View style={styles.summaryHeaderCopy}>
                    <Text style={styles.summaryLabel}>예산 요약</Text>
                    <Text style={styles.summaryCaption}>
                        {firstBudgetQuickAddDayId
                            ? '아직 기록된 지출이 없어요.'
                            : '일정을 추가하면 지출을 연결할 수 있어요.'}
                    </Text>
                </View>
                {canEditContent ? (
                    <Pressable
                        accessibilityRole="button"
                        disabled={!canQuickAddBudget}
                        onPress={handleOpenQuickBudgetExpenseComposer}
                        style={({ pressed }) => [
                            styles.summaryActionButton,
                            !canQuickAddBudget ? styles.summaryActionButtonDisabled : null,
                            pressed && canQuickAddBudget ? styles.summaryActionButtonPressed : null
                        ]}
                    >
                        <Text style={styles.summaryActionButtonText}>추가</Text>
                    </Pressable>
                ) : null}
            </View>
            <Text style={styles.summaryValue}>₩0</Text>
            <Text style={styles.listEmptyText}>지출 내역을 바로 추가해 예산 흐름을 기록해 보세요.</Text>
        </View>
    );

    const photoSummarySection = detail.photoCount > 0 ? (
        <View style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
                <View style={styles.summaryHeaderCopy}>
                    <Text style={styles.summaryLabel}>추억 사진</Text>
                    <Text style={styles.summaryCaption}>등록된 사진 {detail.photoCount}장</Text>
                </View>
                <Pressable
                    accessibilityRole="button"
                    onPress={handleOpenPhotoGallery}
                    style={({ pressed }) => [
                        styles.summaryActionButton,
                        pressed ? styles.summaryActionButtonPressed : null
                    ]}
                >
                    <Text style={styles.summaryActionButtonText}>전체 보기</Text>
                </Pressable>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoStrip}
            >
                {detail.photoGalleryUrls.map((url, index) => (
                    <Pressable
                        key={`${detail.id}-trip-photo-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`추억 사진 ${index + 1}번 보기`}
                        onPress={() => {
                            handleOpenSummaryPhotoViewer(index);
                        }}
                        style={({ pressed }) => [
                            styles.tripPhotoPreview,
                            index < detail.photoGalleryUrls.length - 1 ? styles.tripPhotoPreviewSpaced : null,
                            pressed ? styles.tripPhotoPreviewPressed : null
                        ]}
                    >
                        <Image
                            source={{ uri: url }}
                            style={styles.tripPhotoPreviewImage}
                        />
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    ) : (
        <View style={styles.summaryCard}>
            <View style={styles.summaryHeaderRow}>
                <View style={styles.summaryHeaderCopy}>
                    <Text style={styles.summaryLabel}>추억 사진</Text>
                    <Text style={styles.summaryCaption}>
                        {firstMemoryQuickAddTarget
                            ? '아직 등록된 추억 사진이 없어요.'
                            : '일정을 추가하면 추억 사진을 붙일 수 있어요.'}
                    </Text>
                </View>
                {canEditContent ? (
                    <Pressable
                        accessibilityRole="button"
                        disabled={!canQuickAddMemory}
                        onPress={handleOpenQuickMemoryComposer}
                        style={({ pressed }) => [
                            styles.summaryActionButton,
                            !canQuickAddMemory ? styles.summaryActionButtonDisabled : null,
                            pressed && canQuickAddMemory ? styles.summaryActionButtonPressed : null
                        ]}
                    >
                        <Text style={styles.summaryActionButtonText}>추가</Text>
                    </Pressable>
                ) : null}
            </View>
            <Text style={styles.listEmptyText}>
                사진을 고르면 일정 카드의 추억으로 바로 저장돼요.
            </Text>
        </View>
    );

    const checklistSection = (
        <View style={styles.listSectionCard}>
            <View style={styles.listSectionHeader}>
                <View style={styles.listSectionCopy}>
                    <View style={styles.listSectionTitleRow}>
                        <MaterialCommunityIcons color={theme.colors.accent} name="format-list-checks" size={20} />
                        <Text style={styles.listSectionTitle}>준비물</Text>
                    </View>
                    <Text style={styles.listSectionCaption}>여행 전에 챙겨야 할 항목을 정리해 둬요.</Text>
                </View>
                {canEditContent ? (
                    <Pressable
                        accessibilityRole="button"
                        disabled={isTripListSaving || isTripListToggleSyncing}
                        onPress={() => {
                            handleOpenTripListComposer('checklist');
                        }}
                        style={({ pressed }) => [
                            styles.summaryActionButton,
                            pressed && !isTripListSaving && !isTripListToggleSyncing
                                ? styles.summaryActionButtonPressed
                                : null
                        ]}
                    >
                        <Text style={styles.summaryActionButtonText}>추가</Text>
                    </Pressable>
                ) : null}
            </View>
            {displayedChecklist.length > 0 ? (
                <View style={styles.tripListStack}>
                    {displayedChecklist.map((item, index) => (
                        <Pressable
                            key={item.id}
                            accessibilityRole={canEditContent ? 'button' : undefined}
                            disabled={!canEditContent}
                            onPress={() => {
                                void handleToggleTripListItem('checklist', index);
                            }}
                            style={({ pressed }) => [
                                styles.tripListRow,
                                pressed && canEditContent ? styles.tripListRowPressed : null
                            ]}
                        >
                            <MaterialCommunityIcons
                                color={item.checked ? theme.colors.accent : theme.colors.textSecondary}
                                name={item.checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                                size={22}
                            />
                            <View style={styles.tripListRowCopy}>
                                <Text style={[styles.tripListRowText, item.checked ? styles.tripListRowTextChecked : null]}>
                                    {item.text}
                                </Text>
                            </View>
                        </Pressable>
                    ))}
                </View>
            ) : (
                <Text style={styles.listEmptyText}>아직 등록된 준비물이 없어요.</Text>
            )}
        </View>
    );

    const shoppingListSection = (
        <View style={styles.listSectionCard}>
            <View style={styles.listSectionHeader}>
                <View style={styles.listSectionCopy}>
                    <View style={styles.listSectionTitleRow}>
                        <MaterialCommunityIcons color={theme.colors.accent} name="shopping" size={20} />
                        <Text style={styles.listSectionTitle}>쇼핑 리스트</Text>
                    </View>
                    <Text style={styles.listSectionCaption}>구매할 항목과 연결된 장소를 같이 관리해요.</Text>
                </View>
                {canEditContent ? (
                    <Pressable
                        accessibilityRole="button"
                        disabled={isTripListSaving || isTripListToggleSyncing}
                        onPress={() => {
                            handleOpenTripListComposer('shopping');
                        }}
                        style={({ pressed }) => [
                            styles.summaryActionButton,
                            pressed && !isTripListSaving && !isTripListToggleSyncing
                                ? styles.summaryActionButtonPressed
                                : null
                        ]}
                    >
                        <Text style={styles.summaryActionButtonText}>추가</Text>
                    </Pressable>
                ) : null}
            </View>
            {displayedShoppingList.length > 0 ? (
                <View style={styles.tripListStack}>
                    {displayedShoppingList.map((item, index) => (
                        <Pressable
                            key={item.id}
                            accessibilityRole={canEditContent ? 'button' : undefined}
                            disabled={!canEditContent}
                            onPress={() => {
                                void handleToggleTripListItem('shopping', index);
                            }}
                            style={({ pressed }) => [
                                styles.tripListRow,
                                pressed && canEditContent ? styles.tripListRowPressed : null
                            ]}
                        >
                            <MaterialCommunityIcons
                                color={item.checked ? theme.colors.accent : theme.colors.textSecondary}
                                name={item.checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                                size={22}
                            />
                            <View style={styles.tripListRowCopy}>
                                <Text style={[styles.tripListRowText, item.checked ? styles.tripListRowTextChecked : null]}>
                                    {item.text}
                                </Text>
                                {item.location ? (
                                    <View style={styles.tripListLocationPill}>
                                        <Text style={styles.tripListLocationText}>
                                            {item.location}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        </Pressable>
                    ))}
                </View>
            ) : (
                <Text style={styles.listEmptyText}>아직 등록된 쇼핑 항목이 없어요.</Text>
            )}
        </View>
    );

    const detailFilterBarContent = (
        <View style={styles.filterChipBar}>
            <ScrollView
                ref={detailFilterScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipRow}
            >
                {detailFilterChips.map((chip, index) => {
                    const isActive = selectedDetailFilterKey === chip.key;

                    return (
                        <Pressable
                            key={chip.key}
                            accessibilityRole="button"
                            onPress={() => {
                                scrollToDetailSection(chip.key);
                            }}
                            style={({ pressed }) => [
                                styles.filterChip,
                                isActive ? styles.filterChipActive : null,
                                pressed ? styles.filterChipPressed : null,
                                index < detailFilterChips.length - 1 ? styles.filterChipSpaced : null
                            ]}
                        >
                            <Text
                                style={[
                                    styles.filterChipText,
                                    isActive ? styles.filterChipTextActive : null
                                ]}
                            >
                                {chip.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );

    return (
        <View style={styles.shell}>
            <ScrollView
                ref={detailScrollRef}
                style={styles.container}
                contentContainerStyle={styles.content}
                onScrollBeginDrag={() => {
                    pendingDetailFilterKeyRef.current = '';
                }}
                onScroll={(event) => {
                    notifyPrimaryScrollActivity(event);
                    handleDetailScroll(event);
                }}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshingRemote}
                        onRefresh={() => {
                            void handleRefresh();
                        }}
                        tintColor={theme.colors.accent}
                        colors={[theme.colors.accent]}
                    />
                }
                scrollEventThrottle={scrollEventThrottle}
                stickyHeaderIndices={hasHeroCoverImage ? undefined : [1]}
            >
                <View style={[
                    styles.heroHeaderSlot,
                    hasHeroCoverImage ? styles.heroHeaderSlotBleed : null
                ]}>
                    {detail.coverImage ? (
                        <Pressable
                            accessibilityRole={canOpenTripInfoEdit ? 'button' : undefined}
                            accessibilityLabel={canOpenTripInfoEdit ? '여행 정보 편집' : undefined}
                            disabled={!canOpenTripInfoEdit}
                            onPress={handleOpenTripInfoEdit}
                            style={({ pressed }) => [
                                styles.heroHeader,
                                heroHeaderSurfaceStyle,
                                pressed && canOpenTripInfoEdit ? styles.headerSurfacePressed : null
                            ]}
                        >
                            <Image
                                source={{ uri: detail.coverImage }}
                                style={styles.heroHeaderImage}
                                resizeMode="cover"
                            />
                            <View style={styles.heroHeaderBaseScrim} />
                            {canOpenTripInfoEdit ? (
                                <View pointerEvents="none" style={styles.heroHeaderEditScrim} />
                            ) : null}
                            <BottomImageGradient
                                colors={heroHeaderBottomFadeColors}
                                locations={[0, 0.28, 0.56, 0.82, 1]}
                                style={styles.heroHeaderBottomFade}
                            />
                            {canOpenTripInfoEdit ? (
                                <View
                                    pointerEvents="none"
                                    style={[
                                        styles.heroHeaderEditBadgeWrap,
                                        heroHeaderEditBadgeInsetStyle
                                    ]}
                                >
                                    <View style={styles.heroHeaderEditBadge}>
                                        <MaterialCommunityIcons name="pencil" size={16} color="#ffffff" />
                                    </View>
                                </View>
                            ) : null}
                            <View style={styles.heroHeaderContent}>
                                <TripHeader trip={detail} variant="hero" />
                            </View>
                        </Pressable>
                    ) : (
                        <Pressable
                            accessibilityRole={canOpenTripInfoEdit ? 'button' : undefined}
                            accessibilityLabel={canOpenTripInfoEdit ? '여행 정보 편집' : undefined}
                            disabled={!canOpenTripInfoEdit}
                            onPress={handleOpenTripInfoEdit}
                            style={({ pressed }) => [
                                styles.heroHeaderPlainSurface,
                                pressed && canOpenTripInfoEdit ? styles.headerSurfacePressed : null
                            ]}
                        >
                            <TripHeader trip={detail} />
                            {canOpenTripInfoEdit ? (
                                <View
                                    pointerEvents="none"
                                    style={[
                                        styles.heroHeaderEditBadgeWrap,
                                        heroHeaderEditBadgeInsetStyle
                                    ]}
                                >
                                    <View style={styles.heroHeaderEditBadge}>
                                        <MaterialCommunityIcons name="pencil" size={16} color="#ffffff" />
                                    </View>
                                </View>
                            ) : null}
                        </Pressable>
                    )}
                </View>
                {!hasHeroCoverImage ? (
                    <View
                        onLayout={(event) => {
                            setDetailTabBarHeight(event.nativeEvent.layout.height);
                        }}
                        style={styles.filterChipBarInline}
                    >
                        {detailFilterBarContent}
                    </View>
                ) : null}
            {tripSyncNotice ? (
                <View
                    style={[
                        styles.tripSyncNoticeCard,
                        tripSyncNotice.tone === 'saved' ? styles.tripSyncNoticeCardSaved : null,
                        tripSyncNotice.tone === 'warning' ? styles.tripSyncNoticeCardWarning : null
                    ]}
                >
                    <View style={styles.tripSyncNoticeHeader}>
                        <View style={styles.tripSyncNoticeIconWrap}>
                            {tripSyncNotice.tone === 'saving' || tripSyncNotice.tone === 'checking' ? (
                                <ActivityIndicator color={theme.colors.accent} size="small" />
                            ) : (
                                <PlinIcon
                                    name={tripSyncNotice.iconName}
                                    size={16}
                                    color={tripSyncNotice.tone === 'warning' ? theme.colors.warning : theme.colors.accent}
                                />
                            )}
                        </View>
                        <View style={styles.tripSyncNoticeCopy}>
                            <Text
                                style={[
                                    styles.tripSyncNoticeLabel,
                                    tripSyncNotice.tone === 'warning' ? styles.tripSyncNoticeLabelWarning : null
                                ]}
                            >
                                {tripSyncNotice.label}
                            </Text>
                            <Text
                                style={[
                                    styles.tripSyncNoticeText,
                                    tripSyncNotice.tone === 'warning' ? styles.tripSyncNoticeTextWarning : null
                                ]}
                            >
                                {tripSyncNotice.message}
                            </Text>
                        </View>
                    </View>
                </View>
            ) : null}
            {canEditContent && isTimelineEditMode ? (
                <View style={styles.editModeNoticeCard}>
                    <View style={styles.editModeNoticeHeader}>
                        <View style={styles.editModeNoticeIconWrap}>
                            <MaterialCommunityIcons name="pencil-outline" size={15} color={theme.colors.accent} />
                        </View>
                        <View style={styles.editModeNoticeCopy}>
                            <Text style={styles.editModeNoticeLabel}>편집 모드</Text>
                            <Text style={styles.editModeNoticeText}>
                                카드를 눌러 내용을 수정하고, 오른쪽 상단 조작으로 순서를 바꾸거나 삭제할 수 있어요.
                            </Text>
                        </View>
                    </View>
                    <View style={styles.editModeNoticePillRow}>
                        <View style={styles.editModeNoticePill}>
                            <Text style={styles.editModeNoticePillText}>카드 눌러 수정</Text>
                        </View>
                        <View style={styles.editModeNoticePill}>
                            <Text style={styles.editModeNoticePillText}>+로 일정 추가</Text>
                        </View>
                        <View style={styles.editModeNoticePill}>
                            <Text style={styles.editModeNoticePillText}>오른쪽 위에서 순서 변경</Text>
                        </View>
                    </View>
                </View>
            ) : null}
            {canEditContent && isTimelineEditMode && hasPendingTimelineDayOrders ? (
                <View style={styles.pendingOrderNoticeCard}>
                    <View style={styles.pendingOrderNoticeCopy}>
                        <Text style={styles.pendingOrderNoticeLabel}>순서 변경 저장 필요</Text>
                        <Text style={styles.pendingOrderNoticeText}>
                            순서를 저장해야 새 일정 추가를 계속할 수 있어요.
                        </Text>
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        disabled={isTimelineItemReordering}
                        onPress={() => {
                            void flushPendingTimelineDayOrders();
                        }}
                        style={({ pressed }) => [
                            styles.pendingOrderNoticeButton,
                            isTimelineItemReordering ? styles.pendingOrderNoticeButtonDisabled : null,
                            pressed && !isTimelineItemReordering ? styles.pendingOrderNoticeButtonPressed : null
                        ]}
                    >
                        <Text style={styles.pendingOrderNoticeButtonText}>
                            {isTimelineItemReordering ? '저장 중' : '순서 저장'}
                        </Text>
                    </Pressable>
                </View>
            ) : null}
            {showDeferredEditNotice ? (
                <View style={styles.readOnlyNoticeCard}>
                    <View style={styles.readOnlyNoticeHeader}>
                        <PlinIcon
                            name="cloud-sync"
                            size={16}
                            color={theme.colors.textSecondary}
                            style={styles.readOnlyNoticeIcon}
                        />
                        <Text style={styles.readOnlyNoticeLabel}>최신 확인 중</Text>
                    </View>
                    <Text style={styles.readOnlyNoticeText}>
                        {isOfflineMode || isUsingCachedDetail
                            ? '마지막으로 본 내용을 먼저 보여주고 있어요. 오프라인 상태에서는 데이터 유실을 막기 위해 수정을 잠시 제한해요.'
                            : '최신 여행 내용을 확인한 뒤 수정할 수 있어요.'}
                    </Text>
                </View>
            ) : null}
            {!canEditContentByPermission ? (
                <View style={styles.readOnlyNoticeCard}>
                    <View style={styles.readOnlyNoticeHeader}>
                        <PlinIcon
                            name="eye-off"
                            size={16}
                            color={theme.colors.textSecondary}
                            style={styles.readOnlyNoticeIcon}
                        />
                        <Text style={styles.readOnlyNoticeLabel}>열람 전용</Text>
                    </View>
                    <Text style={styles.readOnlyNoticeText}>
                        현재 화면은 열람 전용이에요. 여행 소유자나 편집자에게 수정 권한을 요청해 주세요.
                    </Text>
                </View>
            ) : null}
            {canEditContent && isTimelineEditMode && isTimelineCompletelyEmpty && firstTimelineDay ? (
                <View style={styles.firstTimelineNudgeCard}>
                    <View style={styles.firstTimelineNudgeIconWrap}>
                        <PlinIcon name="map-pin-plus" size={18} color={theme.colors.accent} />
                    </View>
                    <View style={styles.firstTimelineNudgeCopy}>
                        <Text style={styles.firstTimelineNudgeTitle}>첫 번째 목적지를 추가해보세요</Text>
                        <Text style={styles.firstTimelineNudgeText}>
                            장소, 이동 수단, 메모를 한 날짜씩 쌓아가면 여행 노트가 자연스럽게 채워져요.
                        </Text>
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                            handleOpenTimelineInsertOptions(firstTimelineDay, -1);
                        }}
                        style={({ pressed }) => [
                            styles.firstTimelineNudgeButton,
                            pressed ? styles.firstTimelineNudgeButtonPressed : null
                        ]}
                    >
                        <Text style={styles.firstTimelineNudgeButtonText}>추가</Text>
                    </Pressable>
                </View>
            ) : null}
            <>
                {(timelineDetail?.days.length || 0) === 0 ? (
                    <EmptyState
                        title="아직 일정이 없어요."
                        description="등록된 일정이 아직 없거나, 연결이 완전히 돌아오지 않아 최신 내용을 아직 다 불러오지 못했을 수 있어요."
                    />
                ) : (
                    (timelineDetail?.days || []).map((day) => (
                        <View
                            key={day.id}
                            onLayout={(event) => {
                                registerDetailSectionOffset(day.id, event.nativeEvent.layout.y);
                            }}
                        >
                            <DaySection
                                day={day}
                                isTimelineEditMode={canEditContent && isTimelineEditMode}
                                canAddEmptyDayItem={canEditContent}
                                onAddItem={handleOpenTimelineInsertOptions}
                                onOpenSortMenu={handleOpenTimelineSortMenu}
                                onSelectItem={handleOpenTimelineItem}
                                onMoveItem={handleMoveTimelineItem}
                                onToggleReminder={handleToggleTimelineReminderForItem}
                                hasReminder={hasTimelineReminderRecord}
                                onDeleteItem={handleDeleteTimelineItemWithConfirmation}
                                isDeletingItem={isTimelineItemDeleting || isTripContentSyncing}
                                isMovingItem={isTimelineItemReordering || isTripContentSyncing}
                            />
                        </View>
                    ))
                )}
            </>
            <View
                onLayout={(event) => {
                    registerDetailSectionOffset('extras', event.nativeEvent.layout.y);
                }}
                style={styles.extraContentStack}
            >
                <View style={styles.bottomSummaryStack}>
                    {photoSummarySection}
                    {budgetSummarySection}
                </View>
                <View style={styles.bottomListStack}>
                    {checklistSection}
                    {shoppingListSection}
                </View>
            </View>
            <DebugInfoCard
                screen="TripDetail"
                dataState="ready"
            />
            <TimelineInsertOptionsModal
                visible={Boolean(timelineInsertTarget)}
                dayLabel={timelineInsertTarget?.dayLabel || ''}
                dayDate={timelineInsertTarget?.dayDate || ''}
                insertContextLabel={timelineInsertContextLabel}
                canAddMemory={canAddMemoryToAnchor}
                canAddBudget={canAddBudgetFromInsert}
                canAddMemo={canAddMemoToAnchor}
                canQuickRoute={timelineRouteAvailability.canOpenQuickRoute}
                canCopyExisting={hasCopyableTimelineItems}
                onClose={handleCloseTimelineInsertOptions}
                onSelectNewPlace={handleSelectTimelineNewPlace}
                onSelectBudget={handleSelectTimelineBudget}
                onSelectMemory={handleSelectTimelineMemory}
                onSelectMemo={handleSelectTimelineMemo}
                onSelectQuickRoute={() => {
                    void handleSelectTimelineQuickRoute();
                }}
                onSelectCopyExisting={handleSelectTimelineExistingItem}
                onSelectManualTransit={handleSelectTimelineManualTransit}
            />
            <TimelineTransitTypePickerModal
                visible={Boolean(timelineTransitTypePickerTarget)}
                dayLabel={timelineTransitTypePickerTarget?.dayLabel || ''}
                dayDate={timelineTransitTypePickerTarget?.dayDate || ''}
                onClose={handleCloseTimelineTransitTypePicker}
                onSelect={handleSelectTimelineTransitType}
            />
            <TimelineQuickRoutePickerModal
                visible={Boolean(timelineQuickRouteTarget)}
                dayLabel={timelineQuickRouteTarget?.dayLabel || ''}
                dayDate={timelineQuickRouteTarget?.dayDate || ''}
                originLabel={quickRouteAnchorLabels.origin}
                destinationLabel={quickRouteAnchorLabels.destination}
                loading={isQuickRouteLoading}
                isSaving={isTimelineInsertSaving}
                routeOptions={quickRouteOptions}
                errorMessage={quickRouteError}
                onClose={handleCloseTimelineQuickRoutePicker}
                onSelect={(option) => {
                    void handleSelectQuickRouteOption(option);
                }}
            />
            <Modal
                animationType="fade"
                transparent
                visible={Boolean(timelineSortTargetDay)}
                onRequestClose={handleCloseTimelineSortMenu}
            >
                <View style={styles.reorganizeModalBackdrop}>
                    <Pressable
                        accessibilityRole="button"
                        onPress={handleCloseTimelineSortMenu}
                        style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.reorganizeModalCard}>
                        <View style={styles.reorganizeModalHeader}>
                            <Text style={styles.reorganizeModalEyebrow}>일정 정렬</Text>
                            <Text style={styles.reorganizeModalTitle}>
                                {timelineSortTargetDay?.label || '일차'}
                            </Text>
                            <Text style={styles.reorganizeModalSubtitle}>
                                원하시는 정렬 방식을 선택해주세요.
                            </Text>
                        </View>

                        <Pressable
                            accessibilityRole="button"
                            disabled={isTimelineDayReorganizing}
                            onPress={() => {
                                void handleReorganizeTimelineDay('time');
                            }}
                            style={({ pressed }) => [
                                styles.reorganizeOptionButton,
                                pressed && !isTimelineDayReorganizing ? styles.reorganizeOptionButtonPressed : null,
                                isTimelineDayReorganizing ? styles.reorganizeOptionButtonDisabled : null
                            ]}
                        >
                            <View style={[styles.reorganizeOptionIconWrap, styles.reorganizeOptionIconWrapBlue]}>
                                <Text style={[styles.reorganizeOptionIcon, styles.reorganizeOptionIconBlue]}>↕</Text>
                            </View>
                            <View style={styles.reorganizeOptionCopy}>
                                <Text style={styles.reorganizeOptionTitle}>시간순 정렬</Text>
                                <Text style={styles.reorganizeOptionHint}>
                                    입력된 시간을 기준으로 순서를 정리합니다.
                                </Text>
                            </View>
                        </Pressable>

                        <Pressable
                            accessibilityRole="button"
                            disabled={isTimelineDayReorganizing}
                            onPress={() => {
                                void handleReorganizeTimelineDay('recalc');
                            }}
                            style={({ pressed }) => [
                                styles.reorganizeOptionButton,
                                pressed && !isTimelineDayReorganizing ? styles.reorganizeOptionButtonPressed : null,
                                isTimelineDayReorganizing ? styles.reorganizeOptionButtonDisabled : null
                            ]}
                        >
                            <View style={[styles.reorganizeOptionIconWrap, styles.reorganizeOptionIconWrapOrange]}>
                                <Text style={[styles.reorganizeOptionIcon, styles.reorganizeOptionIconOrange]}>◷</Text>
                            </View>
                            <View style={styles.reorganizeOptionCopy}>
                                <Text style={styles.reorganizeOptionTitle}>시간 재계산</Text>
                                <Text style={styles.reorganizeOptionHint}>
                                    순서를 유지하고 시간을 자동으로 재계산합니다.
                                </Text>
                            </View>
                        </Pressable>

                        <Pressable
                            accessibilityRole="button"
                            disabled={isTimelineDayReorganizing}
                            onPress={handleCloseTimelineSortMenu}
                            style={({ pressed }) => [
                                styles.reorganizeModalCancelButton,
                                pressed && !isTimelineDayReorganizing ? styles.reorganizeOptionButtonPressed : null
                            ]}
                        >
                            <Text style={styles.reorganizeModalCancelText}>닫기</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
            <TimelineItemComposerModal
                visible={Boolean(timelineComposerTarget)}
                dayLabel={timelineComposerTarget?.dayLabel || ''}
                dayDate={timelineComposerTarget?.dayDate || ''}
                defaultTime={timelineComposerTarget?.defaultTime || '09:00'}
                initialMapCenter={timelineComposerTarget?.initialMapCenter || null}
                initialMapQuery={timelineComposerTarget?.initialMapQuery || ''}
                isSaving={isTimelineInsertSaving}
                errorMessage={timelineInsertError}
                onClose={handleCloseTimelineComposer}
                onSubmit={handleSubmitTimelineComposer}
            />
            <TimelineMemoComposerModal
                visible={Boolean(timelineMemoComposerTarget)}
                dayLabel={timelineMemoComposerTarget?.dayLabel || ''}
                dayDate={timelineMemoComposerTarget?.dayDate || ''}
                targetTitle={timelineMemoComposerTarget?.itemTitle || ''}
                defaultTime={timelineMemoComposerTarget?.defaultTime || '09:00'}
                isSaving={isTimelineInsertSaving}
                errorMessage={timelineInsertError}
                onClose={handleCloseTimelineMemoComposer}
                onSubmit={(input) => {
                    void handleSubmitTimelineMemo(input);
                }}
            />
            <TimelineMemoryComposerModal
                visible={Boolean(timelineMemoryComposerTarget)}
                dayLabel={timelineMemoryComposerTarget?.dayLabel || ''}
                dayDate={timelineMemoryComposerTarget?.dayDate || ''}
                targetTitle={timelineMemoryComposerTarget?.itemTitle || ''}
                isSaving={isTimelineInsertSaving}
                errorMessage={timelineInsertError}
                onClose={handleCloseTimelineMemoryComposer}
                onSubmit={(input) => {
                    void handleSubmitTimelineMemory(input);
                }}
            />
            <TimelineTransitComposerModal
                visible={Boolean(timelineTransitComposerTarget)}
                dayLabel={timelineTransitComposerTarget?.dayLabel || ''}
                dayDate={timelineTransitComposerTarget?.dayDate || ''}
                transitType={timelineTransitComposerTarget?.transitType || 'walk'}
                defaultStartTime={timelineTransitComposerTarget?.defaultTime || '09:00'}
                defaultEndTime={timelineTransitComposerTarget?.defaultEndTime || '09:30'}
                isSaving={isTimelineInsertSaving}
                errorMessage={timelineInsertError}
                onClose={handleCloseTimelineTransitComposer}
                onSubmit={(input) => {
                    void handleSubmitTimelineTransit(input);
                }}
            />
            <TimelineExistingItemPickerModal
                visible={Boolean(timelineExistingPickerTarget)}
                days={timelineDetail?.days || []}
                isSaving={isTimelineInsertSaving}
                errorMessage={timelineInsertError}
                onClose={handleCloseTimelineExistingPicker}
                onSelect={(sourceDayId, sourceItemId, sourceItemIndex) => {
                    void handleCopyTimelineItemToInsertTarget(sourceDayId, sourceItemId, sourceItemIndex);
                }}
            />
            <Modal
                visible={isBudgetSummaryVisible}
                transparent
                animationType="slide"
                onRequestClose={handleCloseBudgetSummary}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={handleCloseBudgetSummary} />
                    {detail.budgetSummary ? (
                        <View style={styles.sheet}>
                            <View style={styles.sheetHandle} />
                            <View style={styles.sheetHeader}>
                                <View style={styles.sheetHeaderCopy}>
                                    <View style={styles.sheetBadge}>
                                        <Text style={styles.sheetBadgeText}>예산 요약</Text>
                                    </View>
                                    <Text style={styles.sheetTitle}>지출 기록 상세</Text>
                                    <Text style={styles.sheetMeta}>{detail.budgetSummary.caption}</Text>
                                </View>
                                <View style={styles.sheetHeaderActions}>
                                    <Pressable
                                        accessibilityRole="button"
                                        onPress={handleCloseBudgetSummary}
                                        style={({ pressed }) => [
                                            styles.sheetCloseButton,
                                            pressed ? styles.sheetCloseButtonPressed : null
                                        ]}
                                    >
                                        <Text style={styles.sheetCloseButtonText}>닫기</Text>
                                    </Pressable>
                                </View>
                            </View>
                            <ScrollView
                                style={styles.sheetScroll}
                                contentContainerStyle={[styles.sheetContent, budgetSheetContentInsetStyle]}
                                showsVerticalScrollIndicator={false}
                            >
                                <View style={styles.budgetSheetHero}>
                                    <Text style={styles.budgetSheetHeroLabel}>총 기록 비용</Text>
                                    <Text style={styles.budgetSheetHeroValue}>{detail.budgetSummary.totalLabel}</Text>
                                    <Text style={styles.budgetSheetHeroCaption}>{detail.budgetSummary.caption}</Text>
                                </View>
                                <View style={styles.sheetStatsRow}>
                                    <View style={styles.statPill}>
                                        <Text style={styles.statPillText}>기록 {detail.budgetSummary.entryCount}건</Text>
                                    </View>
                                    <View style={styles.statPill}>
                                        <Text style={styles.statPillText}>
                                            합계 기록일 {detail.budgetSummary.daysWithExpenseCount}일
                                        </Text>
                                    </View>
                                    {budgetAveragePerDayLabel ? (
                                        <View style={styles.statPill}>
                                            <Text style={styles.statPillText}>일 평균 {budgetAveragePerDayLabel}</Text>
                                        </View>
                                    ) : null}
                                </View>
                                {budgetDetailDays.map((day) => (
                                    <View key={`${day.id}-expense-sheet`} style={styles.sheetSection}>
                                        <View style={styles.sectionHeaderRow}>
                                            <View style={styles.sectionHeaderCopy}>
                                                <Text style={styles.sectionLabel}>{day.label}</Text>
                                                <Text style={styles.sectionSupport}>
                                                    {day.date} · 총 {day.totalLabel}
                                                </Text>
                                            </View>
                                            {canEditContent && day.itemOptions.length > 0 ? (
                                                <Pressable
                                                    accessibilityRole="button"
                                                    onPress={() => {
                                                        handleOpenBudgetExpenseComposer(day.id);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.summaryActionButton,
                                                        pressed ? styles.summaryActionButtonPressed : null
                                                    ]}
                                                >
                                                    <Text style={styles.summaryActionButtonText}>추가</Text>
                                                </Pressable>
                                            ) : null}
                                        </View>
                                        {day.expenseItems.length > 0 ? (
                                            <View style={styles.expenseDetailList}>
                                                {day.expenseItems.map((expense) => (
                                                    <View key={expense.id} style={styles.expenseDetailRow}>
                                                        <View style={styles.expenseDetailCopy}>
                                                            <Text style={styles.expenseDetailTitle}>{expense.description}</Text>
                                                            <Text style={styles.expenseDetailMeta}>
                                                                {expense.title}
                                                                {expense.location ? ` · ${expense.location}` : ''}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.expenseDetailAmount}>{expense.amountLabel}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : (
                                            <Text style={styles.sectionSupport}>아직 기록된 지출이 없어요.</Text>
                                        )}
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    ) : null}
                </View>
            </Modal>
            <BudgetExpenseComposerModal
                visible={Boolean(budgetExpenseComposerTarget)}
                dayLabel={budgetExpenseComposerTarget?.dayLabel || ''}
                dayDate={budgetExpenseComposerTarget?.dayDate || ''}
                itemOptions={budgetExpenseComposerTarget?.options || []}
                selectedItemId={budgetExpenseSelectedItemId}
                description={budgetExpenseDescription}
                amount={budgetExpenseAmount}
                currency={budgetExpenseCurrency}
                selectedShoppingIndex={budgetExpenseShoppingIndex}
                shoppingOptions={openShoppingItems}
                isItemSelectionLocked={budgetExpenseComposerTarget?.isItemSelectionLocked === true}
                isSaving={isBudgetExpenseSaving}
                onClose={handleCloseBudgetExpenseComposer}
                onSelectedItemIdChange={setBudgetExpenseSelectedItemId}
                onDescriptionChange={setBudgetExpenseDescription}
                onAmountChange={setBudgetExpenseAmount}
                onCurrencyChange={setBudgetExpenseCurrency}
                onShoppingIndexChange={setBudgetExpenseShoppingIndex}
                onSubmit={() => {
                    void handleSubmitBudgetExpense();
                }}
            />
            <Modal
                visible={Boolean(tripListComposerTarget)}
                transparent
                animationType="slide"
                onRequestClose={handleCloseTripListComposer}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={handleCloseTripListComposer} />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.modalKeyboardArea}
                    >
                        {tripListComposerTarget ? (
                            <View style={styles.sheet}>
                            <View style={styles.sheetHandle} />
                            <View style={styles.sheetHeader}>
                                <View style={styles.sheetHeaderCopy}>
                                    <View style={styles.sheetBadge}>
                                        <Text style={styles.sheetBadgeText}>
                                            {tripListComposerTarget === 'shopping' ? '쇼핑 리스트' : '준비물'}
                                        </Text>
                                    </View>
                                    <Text style={styles.sheetTitle}>
                                        {tripListComposerTarget === 'shopping' ? '쇼핑 항목 추가' : '준비물 추가'}
                                    </Text>
                                        <Text style={styles.sheetMeta}>
                                            {tripListComposerTarget === 'shopping'
                                            ? '같은 여행 데이터에 함께 저장돼요.'
                                            : '여행 전에 챙길 항목을 기록해 둬요.'}
                                        </Text>
                                </View>
                                <View style={styles.sheetHeaderActions}>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={isTripListSaving || isTripListToggleSyncing}
                                        onPress={handleCloseTripListComposer}
                                        style={({ pressed }) => [
                                            styles.sheetCloseButton,
                                            pressed && !isTripListSaving && !isTripListToggleSyncing
                                                ? styles.sheetCloseButtonPressed
                                                : null
                                        ]}
                                    >
                                        <Text style={styles.sheetCloseButtonText}>닫기</Text>
                                    </Pressable>
                                </View>
                            </View>
                            <ScrollView
                                ref={tripListComposerScrollRef}
                                style={styles.sheetScroll}
                                contentContainerStyle={[
                                    styles.sheetContent,
                                    budgetSheetContentInsetStyle,
                                    tripListComposerKeyboardInsetStyle
                                ]}
                                showsVerticalScrollIndicator={false}
                                {...tripListComposerScrollViewProps}
                            >
                                <View style={styles.sheetSection}>
                                    <Text style={styles.sectionLabel}>항목 이름</Text>
                                    <TextInput
                                        accessibilityLabel="리스트 항목 입력"
                                        onChangeText={setTripListInput}
                                        onFocus={createTripListComposerFocusHandler()}
                                        placeholder={tripListComposerTarget === 'shopping' ? '예: 선물용 과자' : '예: 여권, 충전기'}
                                        placeholderTextColor={theme.colors.textSecondary}
                                        style={styles.formInput}
                                        value={tripListInput}
                                    />
                                </View>
                                {tripListComposerTarget === 'shopping' && tripListLocationOptions.length > 0 ? (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>구매 예정 장소</Text>
                                        <Text style={styles.sectionSupport}>장소를 연결해 두면 나중에 찾기 쉬워요.</Text>
                                        <View style={styles.optionChipRow}>
                                            <Pressable
                                                accessibilityRole="button"
                                                onPress={() => {
                                                    setTripListLocationKey('');
                                                }}
                                                style={({ pressed }) => [
                                                    styles.optionChip,
                                                    !tripListLocationKey ? styles.optionChipActive : null,
                                                    pressed ? styles.optionChipPressed : null
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.optionChipText,
                                                        !tripListLocationKey ? styles.optionChipTextActive : null
                                                    ]}
                                                >
                                                    미지정
                                                </Text>
                                            </Pressable>
                                            {tripListLocationOptions.map((entry) => (
                                                <Pressable
                                                    key={entry.key}
                                                    accessibilityRole="button"
                                                    onPress={() => {
                                                        setTripListLocationKey(entry.key);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.optionChip,
                                                        tripListLocationKey === entry.key ? styles.optionChipActive : null,
                                                        pressed ? styles.optionChipPressed : null
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.optionChipText,
                                                            tripListLocationKey === entry.key ? styles.optionChipTextActive : null
                                                        ]}
                                                    >
                                                        {entry.title}
                                                    </Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                    </View>
                                ) : null}
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isTripListSaving || isTripListToggleSyncing}
                                    onPress={() => {
                                        void handleSubmitTripListItem();
                                    }}
                                    style={({ pressed }) => [
                                        styles.primaryActionButton,
                                        pressed && !isTripListSaving && !isTripListToggleSyncing
                                            ? styles.primaryActionButtonPressed
                                            : null,
                                        isTripListSaving || isTripListToggleSyncing
                                            ? styles.primaryActionButtonDisabled
                                            : null
                                    ]}
                                >
                                    <Text style={styles.primaryActionButtonText}>
                                        {isTripListSaving
                                            ? '저장 중...'
                                            : isTripListToggleSyncing
                                                ? '체크 저장 중...'
                                                : '항목 저장'}
                                    </Text>
                                </Pressable>
                            </ScrollView>
                            </View>
                        ) : null}
                    </KeyboardAvoidingView>
                </View>
            </Modal>
            <Modal
                visible={isPhotoGalleryVisible}
                animationType="slide"
                onRequestClose={handleClosePhotoGallery}
            >
                <View style={styles.galleryScreen}>
                    <View
                        style={[
                            styles.galleryScreenHeader,
                            galleryHeaderInsetStyle
                        ]}
                    >
                        <View style={styles.galleryScreenCopy}>
                            <Text style={styles.galleryScreenLabel}>
                                {photoGalleryState?.label || '추억 갤러리'}
                            </Text>
                            <Text style={styles.galleryScreenTitle}>
                                {photoGalleryState?.title || `전체 사진 ${detail.photoCount}장`}
                            </Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            onPress={handleClosePhotoGallery}
                            style={({ pressed }) => [
                                styles.galleryScreenCloseButton,
                                pressed ? styles.galleryScreenCloseButtonPressed : null
                            ]}
                        >
                            <Text style={styles.galleryScreenCloseButtonText}>닫기</Text>
                        </Pressable>
                    </View>
                    <ScrollView
                        style={styles.galleryGridScroll}
                        contentContainerStyle={styles.galleryGridContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {currentPhotoGalleryUrls.map((url, index) => (
                            <Pressable
                                key={`gallery-grid-${index}-${url}`}
                                accessibilityRole="button"
                                onPress={() => {
                                    handleOpenPhotoViewer(index);
                                }}
                                style={[
                                    styles.galleryThumbCard,
                                    {
                                        width: (Math.max(windowWidth, 1) - theme.spacing.sm * 2 - theme.spacing.xs) / 2
                                    },
                                    index % 2 === 0 ? styles.galleryThumbCardLeft : styles.galleryThumbCardRight
                                ]}
                            >
                                <Image
                                    source={{ uri: url }}
                                    style={styles.galleryThumbImage}
                                />
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            </Modal>
            <Modal
                visible={isPhotoViewerVisible}
                transparent
                animationType="fade"
                onRequestClose={handleClosePhotoViewer}
            >
                <View style={styles.galleryOverlay}>
                    <View style={[styles.galleryHeader, galleryHeaderInsetStyle]}>
                        <View style={styles.galleryCountPill}>
                            <Text style={styles.galleryCountText}>
                                {currentPhotoGalleryCount > 0
                                    ? `${photoGalleryIndex + 1} / ${currentPhotoGalleryCount}`
                                    : '추억 사진'}
                            </Text>
                        </View>
                        <Pressable
                            accessibilityRole="button"
                            onPress={handleClosePhotoViewer}
                            style={({ pressed }) => [
                                styles.galleryCloseButton,
                                pressed ? styles.galleryCloseButtonPressed : null
                            ]}
                        >
                            <Text style={styles.galleryCloseButtonText}>닫기</Text>
                        </Pressable>
                    </View>
                    <ScrollView
                        ref={galleryScrollRef}
                        horizontal
                        pagingEnabled
                        scrollEnabled={!isPhotoViewerZoomed}
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={(event) => {
                            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(windowWidth, 1));
                            setPhotoViewerZoomed(false);
                            setPhotoGalleryIndex(nextIndex);
                        }}
                    >
                        {currentPhotoGalleryUrls.map((url, index) => (
                            <View
                                key={`gallery-photo-${index}-${url}`}
                                style={[
                                    styles.galleryPage,
                                    { width: Math.max(windowWidth, 1) }
                                ]}
                            >
                                <ZoomableGalleryImage
                                    uri={url}
                                    pageWidth={Math.max(windowWidth, 1)}
                                    pageHeight={windowHeight}
                                    isActive={index === photoGalleryIndex}
                                    imageStyle={styles.galleryImage}
                                    wrapperStyle={styles.galleryGestureSurface}
                                    onZoomStateChange={(zoomed) => {
                                        if (index === photoGalleryIndex) {
                                            setPhotoViewerZoomed(zoomed);
                                        }
                                    }}
                                />
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </Modal>
            <Modal
                visible={isSelectedTimelineDetailVisible}
                transparent
                animationType="slide"
                onRequestClose={handleCloseTimelineItem}
            >
                <View style={styles.modalOverlay}>
                    <Pressable style={styles.modalBackdrop} onPress={handleCloseTimelineItem} />
                    {selectedTimelineItem && selectedDay ? (
                        <Animated.View
                            style={[
                                styles.timelineDetailSheet,
                                {
                                    height: selectedTimelineDetailSheetHeight
                                }
                            ]}
                        >
                            <View
                                {...selectedTimelineDetailSheetPanResponder.panHandlers}
                                collapsable={false}
                                style={styles.timelineDetailSheetHandleTouch}
                            >
                                <View style={styles.timelineDetailSheetHandle} />
                            </View>
                            <View style={styles.timelineDetailSheetHeader}>
                                <View style={styles.timelineDetailSheetHeaderCopy}>
                                    <View style={styles.sheetBadge}>
                                        <Text
                                            numberOfLines={1}
                                            ellipsizeMode="clip"
                                            style={styles.sheetBadgeText}
                                        >
                                            {selectedTimelineItem.badgeLabel}
                                        </Text>
                                    </View>
                                    {!isSelectedStandaloneMemo ? (
                                        <Text style={styles.sheetTitle}>{selectedTimelineItem.title}</Text>
                                    ) : null}
                                    <Text style={[styles.sheetMeta, isSelectedStandaloneMemo ? styles.sheetMetaCompact : null]}>
                                        {selectedDay.label} · {selectedDay.date}
                                    </Text>
                                </View>
                                <View style={styles.sheetHeaderActions}>
                                    {isTimelineEditMode ? (
                                        <Pressable
                                            accessibilityRole="button"
                                            disabled={isTimelineItemDeleting}
                                            onPress={handleDeleteTimelineItem}
                                            style={({ pressed }) => [
                                                styles.sheetDeleteButton,
                                                pressed && !isTimelineItemDeleting ? styles.sheetDeleteButtonPressed : null,
                                                isTimelineItemDeleting ? styles.sheetHeaderActionDisabled : null
                                            ]}
                                        >
                                            <Text style={styles.sheetDeleteButtonText}>삭제</Text>
                                        </Pressable>
                                    ) : null}
                                    {canEditContent ? (
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel="일정 수정"
                                            disabled={isTripContentSyncing || isTimelineItemDeleting}
                                            onPress={handleEditSelectedTimelineItem}
                                            style={({ pressed }) => [
                                                styles.sheetEditButton,
                                                pressed && !isTripContentSyncing && !isTimelineItemDeleting
                                                    ? styles.sheetEditButtonPressed
                                                    : null,
                                                (isTripContentSyncing || isTimelineItemDeleting)
                                                    ? styles.sheetHeaderActionDisabled
                                                    : null
                                            ]}
                                        >
                                            <Text style={styles.sheetEditButtonText}>수정</Text>
                                        </Pressable>
                                    ) : null}
                                </View>
                            </View>
                            <ScrollView
                                style={styles.timelineDetailSheetScroll}
                                contentContainerStyle={[
                                    styles.timelineDetailSheetContent,
                                    selectedTimelineDetailSheetContentInsetStyle
                                ]}
                                showsVerticalScrollIndicator={false}
                            >
                                {shouldShowSelectedTimelineStats ? (
                                    <View style={styles.sheetStatsRow}>
                                        {selectedTimelineStatLabel ? (
                                            <View style={styles.statPill}>
                                                <Text style={styles.statPillText}>
                                                    {selectedTimelineStatLabel}
                                                </Text>
                                            </View>
                                        ) : null}
                                        {selectedTimelineItem.durationLabel ? (
                                            <View style={styles.statPill}>
                                                <Text style={styles.statPillText}>{selectedTimelineItem.durationLabel}</Text>
                                            </View>
                                        ) : null}
                                        {selectedTimelineItem.expenseSummaryLabel ? (
                                            <View style={styles.statPill}>
                                                <Text style={styles.statPillText}>{selectedTimelineItem.expenseSummaryLabel}</Text>
                                            </View>
                                        ) : null}
                                    </View>
                                ) : null}

                                {selectedTimelineItem.location || (selectedTimelineItem.isTransit && selectedTimelineRouteAnchors.canOpenRoute) ? (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>
                                            {selectedTimelineItem.isTransit ? '경로' : '위치'}
                                        </Text>
                                        {selectedTimelineItem.location ? (
                                            <Text style={styles.sectionBody}>{selectedTimelineItem.location}</Text>
                                        ) : null}
                                        {selectedTimelineItem.isTransit && selectedTimelineRouteAnchors.canOpenRoute ? (
                                            <Text style={styles.sectionSupport}>
                                                {buildTimelineRouteQuery(selectedTimelineRouteAnchors.previousPlace)} → {buildTimelineRouteQuery(selectedTimelineRouteAnchors.nextPlace)}
                                            </Text>
                                        ) : null}
                                        {selectedTimelineItem.isTransit && selectedTimelineRouteAnchors.canOpenRoute ? (
                                            <Pressable
                                                accessibilityRole="button"
                                                onPress={() => {
                                                    handleOpenRouteAppSheet();
                                                }}
                                                style={({ pressed }) => [
                                                    styles.mapButton,
                                                    pressed ? styles.mapButtonPressed : null
                                                ]}
                                            >
                                                <Text style={styles.mapButtonText}>경로 보기</Text>
                                            </Pressable>
                                        ) : null}
                                        {!selectedTimelineItem.isTransit && selectedTimelineRouteContext?.destinationItem ? (
                                            <Pressable
                                                accessibilityRole="button"
                                                onPress={() => {
                                                    handleOpenRouteAppSheet();
                                                }}
                                                style={({ pressed }) => [
                                                    styles.mapButton,
                                                    pressed ? styles.mapButtonPressed : null
                                                ]}
                                            >
                                                <Text style={styles.mapButtonText}>경로 보기</Text>
                                            </Pressable>
                                        ) : null}
                                    </View>
                                ) : null}

                                {selectedTimelineItem.isTransit && selectedTimelineItem.transitDetailedSteps.length > 0 ? (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>상세 경로</Text>
                                        <View style={styles.transitFlowRow}>
                                            {selectedTimelineItem.transitDetailedSteps.map((step, index) => {
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
                                                    <React.Fragment key={`${selectedTimelineItem.id}-flow-${index}`}>
                                                        <View
                                                            style={[
                                                                styles.transitFlowChip,
                                                                flowChipStyle
                                                            ]}
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.transitFlowChipText,
                                                                    flowChipTextStyle
                                                                ]}
                                                            >
                                                                {flowLabel}
                                                            </Text>
                                                        </View>
                                                        {index < selectedTimelineItem.transitDetailedSteps.length - 1 ? (
                                                            <Text style={styles.transitFlowArrow}>→</Text>
                                                        ) : null}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </View>

                                        <View style={styles.transitDetailList}>
                                            {selectedTimelineItem.transitDetailedSteps.map((step, index) => {
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
                                                        key={`${selectedTimelineItem.id}-detail-step-${index}`}
                                                        style={[
                                                            styles.transitDetailCard,
                                                            index < selectedTimelineItem.transitDetailedSteps.length - 1
                                                                ? styles.transitDetailCardSpaced
                                                                : null
                                                        ]}
                                                    >
                                                        <View style={styles.transitDetailHeaderRow}>
                                                            <View style={styles.transitDetailCopy}>
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
                                                                    <Text style={styles.transitDetailSupport}>
                                                                        {supportText}
                                                                    </Text>
                                                                ) : null}
                                                            </View>
                                                        </View>

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

                                {selectedTimelineReminderUi.visible ? (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>알림</Text>
                                        <Text style={styles.sectionBody}>{selectedTimelineReminderUi.body}</Text>
                                        {selectedTimelineReminderUi.support ? (
                                            <Text style={styles.sectionSupport}>{selectedTimelineReminderUi.support}</Text>
                                        ) : null}
                                        {selectedTimelineReminderUi.canAdd ? (
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={isTimelineReminderSaving}
                                                onPress={() => {
                                                    void handleScheduleTimelineReminder();
                                                }}
                                                style={({ pressed }) => [
                                                    styles.mapButton,
                                                    pressed && !isTimelineReminderSaving ? styles.mapButtonPressed : null,
                                                    isTimelineReminderSaving ? styles.sheetHeaderActionDisabled : null
                                                ]}
                                            >
                                                <Text style={styles.mapButtonText}>
                                                    {isTimelineReminderSaving ? '알림 설정 중...' : '10분 전 알림 추가'}
                                                </Text>
                                            </Pressable>
                                        ) : null}
                                        {selectedTimelineReminderUi.canRemove ? (
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={isTimelineReminderSaving}
                                                onPress={handleCancelTimelineReminder}
                                                style={({ pressed }) => [
                                                    styles.secondaryActionButton,
                                                    pressed && !isTimelineReminderSaving ? styles.secondaryActionButtonPressed : null,
                                                    isTimelineReminderSaving ? styles.sheetHeaderActionDisabled : null
                                                ]}
                                            >
                                                <Text style={styles.secondaryActionButtonText}>
                                                    {isTimelineReminderSaving ? '알림 삭제 중...' : '알림 삭제'}
                                                </Text>
                                            </Pressable>
                                        ) : null}
                                    </View>
                                ) : null}

                                {isSelectedStandaloneMemo ? (
                                    <View style={[styles.sheetSection, styles.sheetMemoSection]}>
                                        <Text style={styles.sheetMemoBody}>
                                            {selectedTimelineMemoBody}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>메모 / 설명</Text>
                                        <Text style={styles.sectionBody}>
                                            {selectedTimelineItem.note || '등록된 메모가 아직 없어요.'}
                                        </Text>
                                    </View>
                                )}

                                {selectedTimelineItem.memoryEntries.length > 0 ? (
                                    <View style={styles.sheetSection}>
                                        <View style={styles.sectionHeaderRow}>
                                            <View style={styles.sectionHeaderCopy}>
                                                <Text style={styles.sectionLabel}>추억</Text>
                                                <Text style={styles.sectionSupport}>
                                                    기록 {selectedTimelineItem.memoryEntries.length}개
                                                    {selectedTimelineMemoryPhotoUrls.length > 0
                                                        ? ` · 사진 ${selectedTimelineMemoryPhotoUrls.length}장`
                                                        : ''}
                                                </Text>
                                            </View>
                                            {selectedTimelineMemoryPhotoUrls.length > 0 ? (
                                                <Pressable
                                                    accessibilityRole="button"
                                                    onPress={() => {
                                                        handleOpenSelectedTimelineMemoryViewer(0);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.summaryActionButton,
                                                        pressed ? styles.summaryActionButtonPressed : null
                                                    ]}
                                                >
                                                    <Text style={styles.summaryActionButtonText}>사진 보기</Text>
                                                </Pressable>
                                            ) : null}
                                        </View>
                                        <ScrollView
                                            horizontal
                                            nestedScrollEnabled
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.memoryStrip}
                                        >
                                            {selectedTimelineItem.memoryEntries.map((memory, index) => (
                                                <Pressable
                                                    key={memory.id}
                                                    accessibilityRole={memory.photoUrl ? 'button' : undefined}
                                                    disabled={!memory.photoUrl}
                                                    onPress={() => {
                                                        const photoIndex = memory.photoUrl
                                                            ? selectedTimelineMemoryPhotoUrls.indexOf(memory.photoUrl)
                                                            : -1;
                                                        handleOpenSelectedTimelineMemoryViewer(photoIndex >= 0 ? photoIndex : 0);
                                                    }}
                                                    style={({ pressed }) => [
                                                        styles.memoryCard,
                                                        memory.photoUrl ? styles.memoryCardInteractive : null,
                                                        pressed && memory.photoUrl ? styles.memoryCardPressed : null,
                                                        index < selectedTimelineItem.memoryEntries.length - 1
                                                            ? styles.memoryCardSpaced
                                                            : null
                                                    ]}
                                                >
                                                    {memory.photoUrl ? (
                                                        <Image source={{ uri: memory.photoUrl }} style={styles.memoryImage} />
                                                    ) : (
                                                        <View style={styles.memoryImageFallback}>
                                                            <Text style={styles.memoryImageFallbackText}>사진</Text>
                                                        </View>
                                                    )}
                                                    {memory.createdAt ? (
                                                        <Text style={styles.memoryDate}>
                                                            {formatMemoryDate(memory.createdAt)}
                                                        </Text>
                                                    ) : null}
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </View>
                                ) : null}

                                {selectedTimelineItem.attachments.length > 0 ? (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>첨부 파일</Text>
                                        <Text style={styles.sectionSupport}>
                                            첨부 {selectedTimelineItem.attachments.length}개
                                        </Text>

                                        {selectedTimelineItem.attachments.some((attachment) => attachment.kind === 'image') ? (
                                            <ScrollView
                                                horizontal
                                                nestedScrollEnabled
                                                showsHorizontalScrollIndicator={false}
                                                contentContainerStyle={styles.attachmentImageStrip}
                                            >
                                                {selectedTimelineItem.attachments
                                                    .filter((attachment) => attachment.kind === 'image')
                                                    .map((attachment, index, entries) => (
                                                        <Pressable
                                                            key={attachment.id}
                                                            accessibilityRole="button"
                                                            onPress={() => {
                                                                void handleOpenAttachment(attachment.url);
                                                            }}
                                                            style={({ pressed }) => [
                                                                styles.attachmentImageCard,
                                                                index < entries.length - 1 ? styles.attachmentImageCardSpaced : null,
                                                                pressed ? styles.attachmentCardPressed : null
                                                            ]}
                                                        >
                                                            {attachment.previewUrl ? (
                                                                <Image
                                                                    source={{ uri: attachment.previewUrl }}
                                                                    style={styles.attachmentImage}
                                                                />
                                                            ) : (
                                                                <View style={styles.attachmentImageFallback}>
                                                                    <Text style={styles.attachmentImageFallbackText}>이미지</Text>
                                                                </View>
                                                            )}
                                                            <Text style={styles.attachmentName} numberOfLines={2}>
                                                                {attachment.name}
                                                            </Text>
                                                        </Pressable>
                                                    ))}
                                            </ScrollView>
                                        ) : null}

                                        {selectedTimelineItem.attachments.some((attachment) => attachment.kind !== 'image') ? (
                                            <View style={styles.attachmentFileList}>
                                                {selectedTimelineItem.attachments
                                                    .filter((attachment) => attachment.kind !== 'image')
                                                    .map((attachment) => (
                                                        <Pressable
                                                            key={attachment.id}
                                                            accessibilityRole="button"
                                                            onPress={() => {
                                                                void handleOpenAttachment(attachment.url);
                                                            }}
                                                            style={({ pressed }) => [
                                                                styles.attachmentFileRow,
                                                                pressed ? styles.attachmentCardPressed : null
                                                            ]}
                                                        >
                                                            <View style={styles.attachmentFileCopy}>
                                                                <View style={styles.attachmentTypePill}>
                                                                    <Text style={styles.attachmentTypePillText}>
                                                                        {attachment.typeLabel}
                                                                    </Text>
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

                                {selectedTimelineItem.expenseItems.length > 0 ? (
                                    <View style={styles.sheetSection}>
                                        <Text style={styles.sectionLabel}>지출 내역</Text>
                                        <Text style={styles.sectionSupport}>
                                            총 {selectedTimelineItem.expenseItems.length}건 · 비용 {selectedTimelineItem.expenseItems[0] ? `₩${Math.round(selectedTimelineItem.expenseTotalAmount).toLocaleString()}` : ''}
                                        </Text>
                                        <View style={styles.expenseList}>
                                            {selectedTimelineItem.expenseItems.map((expense) => (
                                                <View key={expense.id} style={styles.expenseRow}>
                                                    <View style={styles.expenseCopy}>
                                                        <Text style={styles.expenseTitle}>
                                                            {expense.title || '지출'}
                                                        </Text>
                                                        <Text style={styles.expenseDescription}>
                                                            {expense.description}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.expenseAmount}>{expense.amountLabel}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                ) : null}
                            </ScrollView>
                        </Animated.View>
                    ) : null}
                    {isRouteAppSheetVisible ? (
                        <View style={styles.routeAppSheetOverlay}>
                            <Pressable style={styles.routeAppSheetBackdrop} onPress={handleCloseRouteAppSheet} />
                            <View
                                style={[
                                    styles.routeAppSheet,
                                    routeAppSheetInsetStyle
                                ]}
                            >
                                <View style={styles.sheetHandle} />
                                <Text style={styles.routeAppSheetTitle}>경로 보기</Text>
                                <Text style={styles.routeAppSheetSubtitle}>열 지도를 선택해 주세요.</Text>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => {
                                        void handleOpenRouteWithProvider('google');
                                    }}
                                    style={({ pressed }) => [
                                        styles.routeAppOption,
                                        pressed ? styles.routeAppOptionPressed : null
                                    ]}
                                >
                                    <Text style={styles.routeAppOptionTitle}>구글맵으로 길찾기</Text>
                                </Pressable>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => {
                                        void handleOpenRouteWithProvider('naver');
                                    }}
                                    style={({ pressed }) => [
                                        styles.routeAppOption,
                                        pressed ? styles.routeAppOptionPressed : null
                                    ]}
                                >
                                    <Text style={styles.routeAppOptionTitle}>네이버지도로 길찾기</Text>
                                </Pressable>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => {
                                        void handleOpenRouteWithProvider('kakao');
                                    }}
                                    style={({ pressed }) => [
                                        styles.routeAppOption,
                                        pressed ? styles.routeAppOptionPressed : null
                                    ]}
                                >
                                    <Text style={styles.routeAppOptionTitle}>카카오맵으로 길찾기</Text>
                                </Pressable>
                            </View>
                        </View>
                    ) : null}
                </View>
            </Modal>
            </ScrollView>
            {hasHeroCoverImage ? (
                <Animated.View
                    pointerEvents={isHeroHeaderCollapsed ? 'auto' : 'none'}
                    onLayout={(event) => {
                        setDetailTabBarHeight(event.nativeEvent.layout.height);
                    }}
                    style={[
                        styles.filterChipOverlay,
                        {
                            top: stickyFilterHeaderInset,
                            opacity: heroHeaderFillProgress
                        }
                    ]}
                >
                    {detailFilterBarContent}
                </Animated.View>
            ) : null}
            {TripShareSheetComponent ? (
                <TripShareSheetComponent
                    visible={isTripShareSheetVisible}
                    tripTitle={detail?.title || '여행'}
                    shareInfo={shareActions.resolvedTripShareInfo}
                    canPublishCommunity={canPublishCommunity}
                    loading={shareActions.isTripShareSheetLoading}
                    error={isOfflineMode ? OFFLINE_SHARE_DISABLED_MESSAGE : shareActions.tripShareError}
                    busyAction={shareActions.tripShareBusyAction}
                    actionDisabled={isOfflineMode}
                    onClose={shareActions.closeTripShareSheet}
                    onShareLink={shareActions.handleShareTripLink}
                    onPublishCommunity={shareActions.handlePublishTripToCommunity}
                    onSetMode={shareActions.handleSetShareMode}
                    onSetRole={shareActions.handleSetShareRole}
                    onChangeMemberRole={shareActions.handleChangeShareMemberRole}
                    onRemoveMember={shareActions.handleRemoveShareMember}
                    onTransferOwnership={shareActions.handleTransferShareOwnership}
                />
            ) : null}
            {TripAnnouncementSheetComponent ? (
                <TripAnnouncementSheetComponent
                    visible={isTripAnnouncementSheetVisible}
                    tripTitle={detail?.title || '여행'}
                    error={isOfflineMode ? OFFLINE_ANNOUNCEMENT_DISABLED_MESSAGE : announcementActions.tripAnnouncementError}
                    busy={announcementActions.isTripAnnouncementSending}
                    actionDisabled={isOfflineMode}
                    onClose={announcementActions.closeTripAnnouncementSheet}
                    onSubmit={announcementActions.handleSubmitTripAnnouncement}
                />
            ) : null}
            {TripRevisionHistorySheetComponent ? (
                <TripRevisionHistorySheetComponent
                    visible={isTripRevisionSheetVisible}
                    tripTitle={detail?.title || '여행'}
                    items={tripRevisionItems}
                    loading={isTripRevisionLoading}
                    error={tripRevisionError}
                    busyRevisionId={tripRevisionBusyId}
                    actionDisabled={isOfflineMode}
                    canRestore={canEditContentByPermission}
                    onClose={closeTripRevisionSheet}
                    onRefresh={() => {
                        void loadTripRevisions({
                            reset: true
                        });
                    }}
                    onRestore={handleRestoreTripRevision}
                    onLoadMore={tripRevisionHasMore ? handleLoadMoreTripRevisions : undefined}
                    hasMore={tripRevisionHasMore}
                />
            ) : null}
            <BottomNavBar activeTab="TripList" />
        </View>
    );
}

const createStyles = (theme: AppTheme) => {
    const stableTransitChipTextFont = Platform.select({
        ios: {
            fontWeight: '700' as const
        },
        default: {
            fontFamily: theme.fonts.semibold
        }
    }) || {
        fontFamily: theme.fonts.semibold
    };

    return StyleSheet.create({
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
        paddingTop: theme.spacing.md,
        paddingHorizontal: theme.spacing.xs,
        paddingBottom: theme.spacing.lg * 4
    },
    heroHeader: {
        position: 'relative',
        minHeight: 0,
        justifyContent: 'flex-end',
        marginBottom: theme.spacing.md,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
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
    heroHeaderEditScrim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.16)'
    },
    heroHeaderBottomFade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 92
    },
    heroHeaderEditBadgeWrap: {
        position: 'absolute',
        top: theme.spacing.sm,
        right: theme.spacing.sm,
        zIndex: 3
    },
    heroHeaderEditBadge: {
        width: 36,
        height: 36,
        borderRadius: theme.radius.md,
        backgroundColor: 'rgba(0, 0, 0, 0.42)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.24)',
        alignItems: 'center',
        justifyContent: 'center'
    },
    heroHeaderContent: {
        paddingTop: theme.spacing.micro
    },
    heroHeaderPlainSurface: {
        position: 'relative'
    },
    stateContent: {
        flex: 1,
        paddingTop: theme.spacing.md,
        paddingHorizontal: theme.spacing.xs,
        paddingBottom: theme.spacing.lg
    },
    stateDebugBlock: {
        marginTop: theme.spacing.md
    },
    headerSurfacePressed: {
        opacity: 0.96
    },
    headerBackgroundSolid: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    headerTitleText: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.semibold
    },
    debugBlock: {
        paddingHorizontal: theme.spacing.xs,
        paddingBottom: theme.spacing.sm
    },
    topActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        marginBottom: theme.spacing.md,
        gap: theme.spacing.micro
    },
    topActionsHero: {
        marginBottom: 0,
        paddingHorizontal: theme.spacing.xs
    },
    headerActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.micro
    },
    headerActionButton: {
        width: 36,
        height: 36,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center'
    },
    headerActionButtonHeroFill: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: theme.radius.full,
        backgroundColor: 'rgba(255, 255, 255, 0.96)'
    },
    headerActionButtonIconStack: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center'
    },
    headerActionButtonIconLayer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center'
    },
    editButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.accentSoft
    },
    editButtonHero: {
        backgroundColor: 'rgba(18, 24, 32, 0.38)'
    },
    editButtonActive: {
        backgroundColor: theme.colors.accent
    },
    editButtonPressed: {
        opacity: 0.88
    },
    editButtonText: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.bold
    },
    editButtonTextHero: {
        color: '#ffffff'
    },
    editButtonTextActive: {
        color: '#ffffff'
    },
    tripSyncNoticeCard: {
        marginBottom: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accentSoft
    },
    tripSyncNoticeCardSaved: {
        backgroundColor: theme.mode === 'dark' ? '#1f3024' : '#e6f6ea'
    },
    tripSyncNoticeCardWarning: {
        backgroundColor: theme.colors.warningSoft
    },
    tripSyncNoticeHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start'
    },
    tripSyncNoticeIconWrap: {
        width: 32,
        height: 32,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.xs,
        backgroundColor: theme.colors.surface
    },
    tripSyncNoticeCopy: {
        flex: 1,
        minWidth: 0
    },
    tripSyncNoticeLabel: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    tripSyncNoticeLabelWarning: {
        color: theme.colors.warning
    },
    tripSyncNoticeText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    tripSyncNoticeTextWarning: {
        color: theme.colors.warning
    },
    editModeNoticeCard: {
        marginBottom: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.mode === 'dark' ? '#4b3f34' : '#e6d5bf',
        backgroundColor: theme.mode === 'dark' ? '#241d18' : '#fbf5ec'
    },
    editModeNoticeHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start'
    },
    editModeNoticeIconWrap: {
        width: 28,
        height: 28,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accentSoft,
        marginRight: theme.spacing.xs
    },
    editModeNoticeCopy: {
        flex: 1,
        minWidth: 0
    },
    editModeNoticeLabel: {
        color: theme.colors.accent,
        fontSize: 11,
        fontFamily: theme.fonts.bold
    },
    editModeNoticeText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    editModeNoticePillRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.micro,
        marginTop: theme.spacing.sm
    },
    editModeNoticePill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    editModeNoticePillText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    pendingOrderNoticeCard: {
        marginBottom: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center'
    },
    pendingOrderNoticeCopy: {
        flex: 1,
        minWidth: 0,
        paddingRight: theme.spacing.xs
    },
    pendingOrderNoticeLabel: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    pendingOrderNoticeText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    pendingOrderNoticeButton: {
        minHeight: 40,
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent
    },
    pendingOrderNoticeButtonPressed: {
        opacity: 0.88
    },
    pendingOrderNoticeButtonDisabled: {
        opacity: 0.56
    },
    pendingOrderNoticeButtonText: {
        color: '#ffffff',
        fontFamily: theme.fonts.bold
    },
    readOnlyNoticeCard: {
        marginBottom: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.mode === 'dark' ? '#241d18' : '#fbf5ec',
        borderWidth: 1,
        borderColor: theme.mode === 'dark' ? '#4b3f34' : '#e6d5bf'
    },
    readOnlyNoticeHeader: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    readOnlyNoticeIcon: {
        marginRight: theme.spacing.xs
    },
    readOnlyNoticeLabel: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        fontFamily: theme.fonts.bold
    },
    readOnlyNoticeText: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    firstTimelineNudgeCard: {
        marginBottom: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        flexDirection: 'row',
        alignItems: 'center'
    },
    firstTimelineNudgeIconWrap: {
        width: 40,
        height: 40,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.xs,
        backgroundColor: theme.colors.accentSoft
    },
    firstTimelineNudgeCopy: {
        flex: 1,
        minWidth: 0,
        paddingRight: theme.spacing.xs
    },
    firstTimelineNudgeTitle: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        lineHeight: 20,
        fontFamily: theme.fonts.bold
    },
    firstTimelineNudgeText: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    firstTimelineNudgeButton: {
        minHeight: 40,
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent
    },
    firstTimelineNudgeButtonPressed: {
        opacity: 0.88
    },
    firstTimelineNudgeButtonText: {
        color: '#ffffff',
        fontFamily: theme.fonts.bold
    },
    reorganizeModalBackdrop: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        backgroundColor: 'rgba(0,0,0,0.36)'
    },
    reorganizeModalCard: {
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md
    },
    reorganizeModalHeader: {
        marginBottom: theme.spacing.sm
    },
    reorganizeModalEyebrow: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    reorganizeModalTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 20,
        lineHeight: 26,
        fontFamily: theme.fonts.bold
    },
    reorganizeModalSubtitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    reorganizeOptionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted,
        marginBottom: theme.spacing.xs
    },
    reorganizeOptionButtonPressed: {
        opacity: 0.9
    },
    reorganizeOptionButtonDisabled: {
        opacity: 0.55
    },
    reorganizeOptionIconWrap: {
        width: 40,
        height: 40,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.sm
    },
    reorganizeOptionIconWrapBlue: {
        backgroundColor: theme.mode === 'dark' ? '#21314a' : '#dbe9ff'
    },
    reorganizeOptionIconWrapOrange: {
        backgroundColor: theme.colors.accentSoft
    },
    reorganizeOptionIcon: {
        fontSize: 16,
        fontFamily: theme.fonts.bold
    },
    reorganizeOptionIconBlue: {
        color: theme.mode === 'dark' ? '#8db7ff' : '#2f5ea8'
    },
    reorganizeOptionIconOrange: {
        color: theme.colors.accent
    },
    reorganizeOptionCopy: {
        flex: 1
    },
    reorganizeOptionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    reorganizeOptionHint: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    reorganizeModalCancelButton: {
        marginTop: theme.spacing.micro,
        minHeight: 44,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    reorganizeModalCancelText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    refreshNoticeCard: {
        marginBottom: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.mode === 'dark' ? '#2f211c' : '#fff6ef'
    },
    heroHeaderSlot: {},
    heroHeaderSlotBleed: {
        marginTop: -theme.spacing.md,
        marginHorizontal: -theme.spacing.xs
    },
    filterChipBar: {
        backgroundColor: theme.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border
    },
    filterChipBarInline: {
        marginBottom: theme.spacing.md
    },
    filterChipOverlay: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 12
    },
    filterChipRow: {
        alignItems: 'stretch',
        paddingLeft: theme.spacing.sm,
        paddingRight: theme.spacing.sm
    },
    filterChip: {
        width: 88,
        minHeight: 36,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 0,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center'
    },
    filterChipActive: {
        borderBottomColor: theme.colors.accent
    },
    filterChipPressed: {
        opacity: 0.88
    },
    filterChipSpaced: {
        marginRight: theme.spacing.xs
    },
    filterChipText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    filterChipTextActive: {
        color: theme.colors.textPrimary
    },
    refreshNoticeLabel: {
        color: theme.colors.warning,
        fontSize: 11,
        fontFamily: theme.fonts.semibold
    },
    refreshNotice: {
        marginTop: theme.spacing.xs,
        color: theme.colors.warning,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    summaryCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    summaryCardPressed: {
        opacity: 0.92
    },
    summaryLabel: {
        fontSize: 13,
        fontFamily: theme.fonts.bold,
        color: theme.colors.textSecondary
    },
    summaryHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between'
    },
    summaryHeaderCopy: {
        flex: 1,
        paddingRight: theme.spacing.xs
    },
    summaryValue: {
        marginTop: theme.spacing.xs,
        fontSize: 24,
        fontFamily: theme.fonts.display,
        color: theme.colors.textPrimary
    },
    summaryCaption: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    summaryActionButton: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    summaryActionButtonPressed: {
        opacity: 0.9
    },
    summaryActionButtonDisabled: {
        opacity: 0.45
    },
    summaryActionButtonText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    listSectionCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    listSectionHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between'
    },
    listSectionCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    listSectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs
    },
    listSectionTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.display
    },
    listSectionCaption: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    metaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: theme.spacing.xs
    },
    metaPill: {
        marginRight: theme.spacing.micro,
        marginBottom: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    metaPillLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    photoStrip: {
        marginTop: theme.spacing.xs,
        paddingRight: theme.spacing.micro
    },
    tripPhotoPreview: {
        width: 88,
        height: 88,
        borderRadius: theme.radius.sm,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceMuted
    },
    tripPhotoPreviewImage: {
        width: '100%',
        height: '100%'
    },
    tripPhotoPreviewPressed: {
        opacity: 0.88
    },
    tripPhotoPreviewSpaced: {
        marginRight: theme.spacing.micro
    },
    galleryScreen: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    galleryScreenHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingTop: theme.spacing.lg,
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.sm
    },
    galleryScreenCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    galleryScreenLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    galleryScreenTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 26,
        lineHeight: 32,
        fontFamily: theme.fonts.display
    },
    galleryScreenCloseButton: {
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    galleryScreenCloseButtonPressed: {
        opacity: 0.88
    },
    galleryScreenCloseButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.bold
    },
    galleryGridScroll: {
        flex: 1
    },
    galleryGridContent: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    galleryThumbCard: {
        marginBottom: theme.spacing.xs,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceMuted
    },
    galleryThumbCardLeft: {
        marginRight: theme.spacing.xs / 2
    },
    galleryThumbCardRight: {
        marginLeft: theme.spacing.xs / 2
    },
    galleryThumbImage: {
        width: '100%',
        aspectRatio: 1,
        backgroundColor: theme.colors.surfaceMuted
    },
    galleryOverlay: {
        flex: 1,
        backgroundColor: 'rgba(14,18,24,0.96)'
    },
    galleryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: theme.spacing.lg,
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.xs
    },
    galleryCountPill: {
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: 'rgba(255,255,255,0.14)'
    },
    galleryCountText: {
        color: '#fff',
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    galleryCloseButton: {
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: 'rgba(255,255,255,0.12)'
    },
    galleryCloseButtonPressed: {
        opacity: 0.88
    },
    galleryCloseButtonText: {
        color: '#fff',
        fontFamily: theme.fonts.bold
    },
    galleryPage: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    galleryGestureSurface: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
    },
    galleryImage: {
        width: '100%',
        height: '82%',
        borderRadius: theme.radius.md,
        backgroundColor: 'rgba(255,255,255,0.06)'
    },
    tripListStack: {
        marginTop: theme.spacing.sm
    },
    tripListRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: theme.spacing.xs
    },
    tripListRowPressed: {
        opacity: 0.82
    },
    tripListRowCopy: {
        flex: 1,
        marginLeft: theme.spacing.xs
    },
    tripListRowText: {
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.contentSemibold
    },
    tripListRowTextChecked: {
        color: theme.colors.textSecondary,
        textDecorationLine: 'line-through'
    },
    tripListLocationPill: {
        alignSelf: 'flex-start',
        marginTop: theme.spacing.micro,
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    tripListLocationText: {
        color: theme.colors.textSecondary,
        fontSize: 11,
        lineHeight: 16,
        fontFamily: theme.fonts.bold
    },
    listEmptyText: {
        marginTop: theme.spacing.sm,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.28)'
    },
    modalBackdrop: {
        flex: 1
    },
    modalKeyboardArea: {
        width: '100%',
        justifyContent: 'flex-end'
    },
    sheet: {
        maxHeight: `${MOBILE_BOTTOM_SHEET_HEIGHTS.detailExpandedPercent}%`,
        borderTopLeftRadius: theme.radius.lg,
        borderTopRightRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    budgetExpenseSheet: {
        height: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        maxHeight: MOBILE_BOTTOM_SHEET_HEIGHTS.workflow,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0
    },
    sheetHandle: {
        alignSelf: 'center',
        width: 48,
        height: 5,
        borderRadius: theme.radius.full,
        marginTop: theme.spacing.xs,
        backgroundColor: theme.colors.border
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.xs
    },
    sheetHeaderCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    sheetHeaderActions: {
        alignItems: 'flex-end'
    },
    sheetHeaderActionDisabled: {
        opacity: 0.55
    },
    sheetBadge: {
        alignSelf: 'flex-start',
        minHeight: 24,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    sheetBadgeText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        includeFontPadding: false,
        fontFamily: theme.fonts.contentSemibold
    },
    sheetTitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 24,
        lineHeight: 30,
        fontFamily: theme.fonts.bold
    },
    sheetMeta: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    sheetMetaCompact: {
        marginTop: theme.spacing.micro
    },
    sheetEditButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.accentSoft,
        marginBottom: theme.spacing.micro
    },
    sheetEditButtonPressed: {
        opacity: 0.88
    },
    sheetEditButtonText: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.semibold
    },
    sheetDeleteButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.warningSoft,
        marginBottom: theme.spacing.micro
    },
    sheetDeleteButtonPressed: {
        opacity: 0.88
    },
    sheetDeleteButtonText: {
        color: theme.colors.warning,
        fontFamily: theme.fonts.semibold
    },
    sheetCloseButton: {
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted
    },
    sheetCloseButtonPressed: {
        opacity: 0.88
    },
    sheetCloseButtonText: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    sheetScroll: {
        flexGrow: 0
    },
    budgetExpenseSheetScroll: {
        flex: 1
    },
    sheetContent: {
        padding: theme.spacing.sm,
        paddingBottom: theme.spacing.lg
    },
    timelineDetailSheet: {
        width: '100%',
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    timelineDetailSheetHandleTouch: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 34,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    timelineDetailSheetHandle: {
        width: 56,
        height: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    timelineDetailSheetHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.xs
    },
    timelineDetailSheetHeaderCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    timelineDetailSheetScroll: {
        flexGrow: 0
    },
    timelineDetailSheetContent: {
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.md
    },
    sheetStatsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: theme.spacing.xs
    },
    budgetSheetHero: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background,
        marginBottom: theme.spacing.sm
    },
    budgetSheetHeroLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    budgetSheetHeroValue: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 28,
        lineHeight: 36,
        fontFamily: theme.fonts.display
    },
    budgetSheetHeroCaption: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    optionChipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: theme.spacing.sm,
        gap: theme.spacing.xs
    },
    optionChip: {
        minHeight: 32,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    optionChipActive: {
        backgroundColor: theme.colors.accentSoft
    },
    optionChipPressed: {
        opacity: 0.88
    },
    optionChipText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.semibold
    },
    optionChipTextActive: {
        color: theme.colors.accent
    },
    formFieldLabel: {
        marginTop: theme.spacing.sm
    },
    formInput: {
        marginTop: theme.spacing.xs,
        minHeight: 48,
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.surfaceMuted,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    primaryActionButton: {
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    primaryActionButtonPressed: {
        opacity: 0.9
    },
    primaryActionButtonDisabled: {
        opacity: 0.55
    },
    primaryActionButtonText: {
        color: '#fff',
        fontFamily: theme.fonts.bold
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
    sheetSection: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.background
    },
    sheetMemoSection: {
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
        ...stableTransitChipTextFont
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
    transitDetailHeaderRow: {
        flexDirection: 'row',
        alignItems: 'flex-start'
    },
    transitDetailCopy: {
        flex: 1
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
        ...stableTransitChipTextFont
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
    sheetMemoBody: {
        color: theme.mode === 'dark' ? '#f0c97f' : '#8b5b22',
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    mapButton: {
        marginTop: theme.spacing.sm,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.accentSoft
    },
    mapButtonPressed: {
        opacity: 0.88
    },
    mapButtonText: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.bold
    },
    secondaryActionButton: {
        marginTop: theme.spacing.sm,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.warningSoft
    },
    secondaryActionButtonPressed: {
        opacity: 0.88
    },
    secondaryActionButtonText: {
        color: theme.colors.warning,
        fontFamily: theme.fonts.bold
    },
    routeAppSheet: {
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.md,
        borderTopLeftRadius: theme.radius.lg,
        borderTopRightRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    routeAppSheetOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.18)'
    },
    routeAppSheetBackdrop: {
        flex: 1
    },
    routeAppSheetTitle: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.bold,
        textAlign: 'center'
    },
    routeAppSheetSubtitle: {
        marginTop: theme.spacing.micro,
        marginBottom: theme.spacing.sm,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        textAlign: 'center',
        fontFamily: theme.fonts.body
    },
    routeAppOption: {
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    routeAppOptionPressed: {
        opacity: 0.88
    },
    routeAppOptionTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold,
        textAlign: 'center'
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
    memoryCardInteractive: {
        overflow: 'hidden'
    },
    memoryCardSpaced: {
        marginRight: theme.spacing.xs
    },
    memoryCardPressed: {
        opacity: 0.92
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
    memoryComment: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
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
        marginHorizontal: -theme.spacing.sm
    },
    expenseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    expenseCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    expenseTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.semibold
    },
    expenseDescription: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    expenseAmount: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.bold
    },
    extraContentStack: {
        marginTop: theme.spacing.xs
    },
    bottomSummaryStack: {
        marginTop: theme.spacing.md,
        gap: theme.spacing.md
    },
    bottomListStack: {
        marginTop: theme.spacing.md,
        gap: theme.spacing.md
    },
    expenseDetailList: {
        marginTop: theme.spacing.sm
    },
    expenseDetailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    expenseDetailCopy: {
        flex: 1,
        paddingRight: theme.spacing.sm
    },
    expenseDetailTitle: {
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.contentSemibold
    },
    expenseDetailMeta: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    expenseDetailAmount: {
        color: theme.colors.accent,
        fontFamily: theme.fonts.bold
    }
    });
};
