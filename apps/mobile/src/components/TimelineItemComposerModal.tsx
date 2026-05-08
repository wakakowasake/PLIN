import { formatTimeStr, parseTimeStr } from '@shared/core/utils/time-value-helpers.js';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React from 'react';
import {
    ActivityIndicator,
    Animated,
    Image,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    fetchTripPlaceDetail,
    searchTripNearbyPlaces,
    searchTripPlacesInViewport,
    searchTripPlaceSuggestions,
    type TripPlaceSuggestion
} from '@/services/trip-place-search';
import { useKeyboardAwareInputScroll } from '@/hooks/useKeyboardAwareInputScroll';
import { type AppTheme, useAppTheme } from '@/theme';
import { MOBILE_BOTTOM_SHEET_HEIGHTS } from '@/theme/bottomSheet';
import type {
    MobileTimelineItemCategory,
    MobileTimelineItemCreateInput,
    MobileTripCreatePlace
} from '@/types/trip';
import {
    InlinePlaceMapPicker,
    type InlinePlaceMapPickerHandle,
    type ManualCenterDraft,
    type MapViewportDraft,
    type MapMode,
    type PlaceMapCandidate
} from './InlinePlaceMapPicker';
import { DurationPickerModal } from './DurationPickerModal';
import { TimePickerModal } from './TimePickerModal';

const CATEGORY_OPTIONS: Array<{ code: MobileTimelineItemCategory; label: string }> = [
    { code: 'meal', label: '식사' },
    { code: 'sightseeing', label: '관광' },
    { code: 'culture', label: '문화' },
    { code: 'shopping', label: '쇼핑' },
    { code: 'accommodation', label: '숙소' },
    { code: 'custom', label: '기타' }
];
const CATEGORY_OPTION_ROWS = [
    CATEGORY_OPTIONS.slice(0, 3),
    CATEGORY_OPTIONS.slice(3)
];
const ACCOMMODATION_PLACE_TYPES = new Set([
    'bed_and_breakfast',
    'campground',
    'camping_cabin',
    'cottage',
    'extended_stay_hotel',
    'guest_house',
    'hostel',
    'hotel',
    'lodging',
    'motel',
    'resort_hotel',
    'rv_park'
]);
const MEAL_PLACE_TYPES = new Set([
    'bakery',
    'bar',
    'cafe',
    'coffee_shop',
    'confectionery',
    'dessert_shop',
    'ice_cream_shop',
    'meal_delivery',
    'meal_takeaway',
    'restaurant',
    'tea_house'
]);
const CULTURE_PLACE_TYPES = new Set([
    'art_gallery',
    'art_museum',
    'church',
    'cultural_center',
    'cultural_landmark',
    'hindu_temple',
    'history_museum',
    'library',
    'monument',
    'mosque',
    'museum',
    'performing_arts_theater',
    'place_of_worship',
    'synagogue'
]);
const SIGHTSEEING_PLACE_TYPES = new Set([
    'amusement_park',
    'aquarium',
    'beach',
    'botanical_garden',
    'city_park',
    'garden',
    'hiking_area',
    'historical_landmark',
    'marina',
    'national_park',
    'observation_deck',
    'park',
    'tourist_attraction',
    'visitor_center',
    'wildlife_park',
    'zoo'
]);
const SHOPPING_PLACE_TYPES = new Set([
    'book_store',
    'clothing_store',
    'convenience_store',
    'department_store',
    'electronics_store',
    'furniture_store',
    'grocery_store',
    'jewelry_store',
    'market',
    'shopping_mall',
    'store',
    'supermarket'
]);

const SHEET_SNAP_VALUES = [
    MOBILE_BOTTOM_SHEET_HEIGHTS.mapPeekPercent,
    MOBILE_BOTTOM_SHEET_HEIGHTS.mapDefaultPercent,
    MOBILE_BOTTOM_SHEET_HEIGHTS.mapExpandedPercent
] as const;
const MAP_CANDIDATE_RANKS = [1, 2, 3, 4, 5] as const;
const MANUAL_NEARBY_RADIUS_METERS = 220;
const MANUAL_NEARBY_EMPTY_MESSAGE = '이 위치 주변에서 선택할 장소를 찾지 못했어요. 지도를 조금 움직이거나 검색어로 찾아 주세요.';
type SheetSnap = (typeof SHEET_SNAP_VALUES)[number];
type SheetTab = 'results' | 'details';

const MIN_SHEET_SNAP: SheetSnap = 8;
const DEFAULT_SHEET_SNAP: SheetSnap = 52;
const MAX_SHEET_SNAP: SheetSnap = 84;
const SEARCH_BAR_HEIGHT = 48;
const RESULT_THUMB_WIDTH = 72;
const RESULT_THUMB_HEIGHT = 96;
const SHEET_FLICK_VELOCITY_THRESHOLD = 1.35;
const SHEET_RELEASE_PROJECTION = 56;
const SHEET_DEFAULT_STICKINESS = 0.68;

type SearchResultCard = {
    suggestion: TripPlaceSuggestion;
    place: MobileTripCreatePlace | null;
};

type TimelineItemComposerMode = 'create' | 'edit';

type TimelineItemComposerInitialDraft = {
    searchQuery?: string;
    selectedPlace?: MobileTripCreatePlace | null;
    time?: string;
    note?: string;
    durationMinutes?: number | null;
    category?: MobileTimelineItemCategory | null;
};

type Props = {
    visible: boolean;
    dayLabel: string;
    dayDate: string;
    defaultTime: string;
    initialMapCenter: {
        latitude: number;
        longitude: number;
    } | null;
    initialMapQuery: string;
    isSaving: boolean;
    mode?: TimelineItemComposerMode;
    initialDraft?: TimelineItemComposerInitialDraft | null;
    errorMessage?: string | null;
    onClose(): void;
    onSubmit(input: MobileTimelineItemCreateInput): void;
};

function normalizeTextInput(value: string) {
    return String(value || '').trim();
}

function normalizeTimeInput(value: string) {
    const parsed = parseTimeStr(String(value || '').trim());
    if (parsed === null) {
        return '';
    }

    return formatTimeStr(parsed);
}

function parseDurationInput(value: string) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 1) {
        return null;
    }

    return Math.floor(parsed);
}

function formatDurationDisplayLabel(value: string) {
    const minutes = parseDurationInput(value);
    if (minutes === null) {
        return '머무는 시간 선택';
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0 && remainingMinutes > 0) {
        return `${hours}시간 ${remainingMinutes}분`;
    }

    if (hours > 0) {
        return `${hours}시간`;
    }

    return `${minutes}분`;
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(minimum, value));
}

function resolveNearestSheetSnap(projectedHeight: number, sheetHeights: Record<SheetSnap, number>) {
    let nearestSnap: SheetSnap = SHEET_SNAP_VALUES[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    SHEET_SNAP_VALUES.forEach((snap) => {
        const distance = Math.abs(projectedHeight - sheetHeights[snap]);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestSnap = snap;
        }
    });

    return nearestSnap;
}

function resolveReleaseSheetSnap(
    currentHeight: number,
    projectedHeight: number,
    velocityY: number,
    sheetHeights: Record<SheetSnap, number>,
    dragStartHeight = currentHeight
) {
    const currentSnap = resolveNearestSheetSnap(currentHeight, sheetHeights);
    const dragStartSnap = resolveNearestSheetSnap(dragStartHeight, sheetHeights);
    const constrainSnap = (nextSnap: SheetSnap) => (
        (dragStartSnap === MIN_SHEET_SNAP && nextSnap === MAX_SHEET_SNAP)
            || (dragStartSnap === MAX_SHEET_SNAP && nextSnap === MIN_SHEET_SNAP)
            ? DEFAULT_SHEET_SNAP
            : nextSnap
    );

    if (currentSnap === DEFAULT_SHEET_SNAP && Math.abs(velocityY) < SHEET_FLICK_VELOCITY_THRESHOLD) {
        const defaultHeight = sheetHeights[DEFAULT_SHEET_SNAP];
        const lowerBound = defaultHeight - ((defaultHeight - sheetHeights[MIN_SHEET_SNAP]) * SHEET_DEFAULT_STICKINESS);
        const upperBound = defaultHeight + ((sheetHeights[MAX_SHEET_SNAP] - defaultHeight) * SHEET_DEFAULT_STICKINESS);

        if (projectedHeight >= lowerBound && projectedHeight <= upperBound) {
            return constrainSnap(DEFAULT_SHEET_SNAP);
        }
    }

    if (Math.abs(velocityY) >= SHEET_FLICK_VELOCITY_THRESHOLD) {
        const currentIndex = SHEET_SNAP_VALUES.indexOf(currentSnap);
        const nextIndex = clamp(
            currentIndex + (velocityY < 0 ? 1 : -1),
            0,
            SHEET_SNAP_VALUES.length - 1
        );

        return constrainSnap(SHEET_SNAP_VALUES[nextIndex]);
    }

    return constrainSnap(resolveNearestSheetSnap(projectedHeight, sheetHeights));
}

function buildSearchPlaceholder(category: MobileTimelineItemCategory) {
    if (category === 'meal') {
        return '맛집 검색';
    }

    if (category === 'sightseeing') {
        return '관광지 검색';
    }

    if (category === 'accommodation') {
        return '숙소 검색';
    }

    return '관광지/맛집/숙소 검색';
}

function inferCategoryFromPlaceTypes(placeTypes: string[] | null | undefined): MobileTimelineItemCategory | null {
    const types = Array.isArray(placeTypes)
        ? placeTypes.map((type) => normalizeTextInput(type).toLowerCase()).filter(Boolean)
        : [];

    if (types.length === 0) {
        return null;
    }

    if (types.some((type) => ACCOMMODATION_PLACE_TYPES.has(type) || type.endsWith('_hotel'))) {
        return 'accommodation';
    }

    if (types.some((type) => MEAL_PLACE_TYPES.has(type) || type.endsWith('_restaurant'))) {
        return 'meal';
    }

    if (types.some((type) => SHOPPING_PLACE_TYPES.has(type) || type.endsWith('_store'))) {
        return 'shopping';
    }

    if (types.some((type) => CULTURE_PLACE_TYPES.has(type))) {
        return 'culture';
    }

    if (types.some((type) => SIGHTSEEING_PLACE_TYPES.has(type))) {
        return 'sightseeing';
    }

    if (types.includes('food')) {
        return 'meal';
    }

    return null;
}

function buildMapCandidatesFromCards(cards: SearchResultCard[]) {
    return cards.reduce<PlaceMapCandidate[]>((candidates, card) => {
        if (!card.place || candidates.length >= MAP_CANDIDATE_RANKS.length) {
            return candidates;
        }

        candidates.push({
            ...card.place,
            rank: MAP_CANDIDATE_RANKS[candidates.length]
        });
        return candidates;
    }, []);
}

function mergePlaceIntoMapCandidates(
    currentCandidates: PlaceMapCandidate[],
    place: MobileTripCreatePlace
) {
    const normalizedPlaceId = normalizeTextInput(place.placeId);
    const existingIndex = currentCandidates.findIndex((candidate) => (
        normalizeTextInput(candidate.placeId) === normalizedPlaceId
    ));

    if (existingIndex >= 0) {
        return currentCandidates.map((candidate, index) => (
            index === existingIndex
                ? {
                    ...place,
                    rank: candidate.rank
                }
                : candidate
        ));
    }

    if (currentCandidates.length >= MAP_CANDIDATE_RANKS.length) {
        return currentCandidates;
    }

    return [
        ...currentCandidates,
        {
            ...place,
            rank: MAP_CANDIDATE_RANKS[currentCandidates.length]
        }
    ];
}

function buildSearchCardFromPlace(place: MobileTripCreatePlace): SearchResultCard {
    const primaryText = normalizeTextInput(place.name) || '선택한 위치';
    const secondaryText = normalizeTextInput(place.address || '');

    return {
        suggestion: {
            placeId: normalizeTextInput(place.placeId),
            primaryText,
            secondaryText,
            description: secondaryText || primaryText
        },
        place
    };
}

function buildUniqueSearchCardsFromPlaces(places: MobileTripCreatePlace[]) {
    const seenPlaceIds = new Set<string>();

    return places.reduce<SearchResultCard[]>((cards, nearbyPlace) => {
        const placeId = normalizeTextInput(nearbyPlace.placeId);
        if (!placeId || seenPlaceIds.has(placeId)) {
            return cards;
        }

        seenPlaceIds.add(placeId);
        cards.push(buildSearchCardFromPlace(nearbyPlace));
        return cards;
    }, []);
}

function hasUsableFallbackPlace(place: MobileTripCreatePlace | null | undefined) {
    const latitude = Number(place?.latitude);
    const longitude = Number(place?.longitude);
    return Boolean(
        place
        && normalizeTextInput(place.placeId)
        && Number.isFinite(latitude)
        && Number.isFinite(longitude)
    );
}

function hasValidViewportBounds(viewport: MapViewportDraft) {
    const bounds = viewport?.bounds;
    return Boolean(
        bounds
        && Number.isFinite(Number(bounds.north))
        && Number.isFinite(Number(bounds.south))
        && Number.isFinite(Number(bounds.east))
        && Number.isFinite(Number(bounds.west))
    );
}

function resolveCardTitle(card: SearchResultCard) {
    return normalizeTextInput(card.place?.name || '') || card.suggestion.primaryText;
}

function resolveCardSubtitle(card: SearchResultCard) {
    return normalizeTextInput(card.place?.address || '')
        || normalizeTextInput(card.suggestion.secondaryText || '')
        || normalizeTextInput(card.suggestion.description || '');
}

function resolveCardMeta(card: SearchResultCard) {
    const description = normalizeTextInput(card.suggestion.description || '');
    const secondary = normalizeTextInput(card.suggestion.secondaryText || '');
    const subtitle = resolveCardSubtitle(card);

    if (description && description !== subtitle) {
        return description;
    }

    if (secondary && secondary !== subtitle) {
        return secondary;
    }

    return '지도에서 위치를 바로 확인할 수 있어요.';
}

export function TimelineItemComposerModal({
    visible,
    dayLabel,
    dayDate,
    defaultTime,
    initialMapCenter,
    initialMapQuery,
    isSaving,
    mode = 'create',
    initialDraft,
    errorMessage,
    onClose,
    onSubmit
}: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { height: windowHeight } = useWindowDimensions();
    const {
        scrollRef,
        createFocusHandler,
        keyboardAwareContentInsetStyle,
        keyboardBottomInset,
        scrollViewProps
    } = useKeyboardAwareInputScroll(196);
    const mapPickerRef = React.useRef<InlinePlaceMapPickerHandle | null>(null);
    const manualConfirmOffset = React.useRef(new Animated.Value(20)).current;
    const mapModeFabOffset = React.useRef(new Animated.Value(theme.spacing.sm)).current;
    const mapZoomControlsOffset = React.useRef(new Animated.Value(80)).current;
    const searchRequestIdRef = React.useRef(0);
    const mapCandidatesRequestIdRef = React.useRef(0);
    const sessionTokenRef = React.useRef(`mobile-timeline-item-${Date.now().toString(36)}`);
    const didManuallyChooseCategoryRef = React.useRef(false);
    const isEditMode = mode === 'edit';

    const sheetHeights = React.useMemo<Record<SheetSnap, number>>(() => {
        const minSheetHeight = Math.max(
            Math.round(windowHeight * (MIN_SHEET_SNAP / 100)),
            insets.bottom + theme.spacing.xxl
        );
        const maxSheetHeight = Math.min(
            Math.round(windowHeight * (MAX_SHEET_SNAP / 100)),
            windowHeight - (insets.top + theme.spacing.sm + SEARCH_BAR_HEIGHT + theme.spacing.sm)
        );
        const defaultSheetHeight = clamp(
            Math.round(windowHeight * (DEFAULT_SHEET_SNAP / 100)),
            minSheetHeight,
            maxSheetHeight
        );

        return {
            8: minSheetHeight,
            52: defaultSheetHeight,
            84: maxSheetHeight
        };
    }, [insets.bottom, insets.top, theme.spacing.sm, theme.spacing.xxl, windowHeight]);

    const sheetHeight = React.useRef(new Animated.Value(sheetHeights[DEFAULT_SHEET_SNAP])).current;
    const sheetHeightRef = React.useRef(sheetHeights[DEFAULT_SHEET_SNAP]);
    const sheetDragStartHeightRef = React.useRef(sheetHeights[DEFAULT_SHEET_SNAP]);

    const [time, setTime] = React.useState(defaultTime || '09:00');
    const [durationMinutes, setDurationMinutes] = React.useState('30');
    const [note, setNote] = React.useState('');
    const [category, setCategory] = React.useState<MobileTimelineItemCategory>('custom');
    const [didAttemptSubmit, setDidAttemptSubmit] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<TripPlaceSuggestion[]>([]);
    const [searchCards, setSearchCards] = React.useState<SearchResultCard[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);
    const [searchError, setSearchError] = React.useState<string | null>(null);
    const [selectedPlace, setSelectedPlace] = React.useState<MobileTripCreatePlace | null>(null);
    const [isLoadingPlaceDetail, setIsLoadingPlaceDetail] = React.useState(false);
    const [isTimePickerVisible, setIsTimePickerVisible] = React.useState(false);
    const [isDurationPickerVisible, setDurationPickerVisible] = React.useState(false);
    const [mapMode, setMapMode] = React.useState<MapMode>('results');
    const [sheetSnap, setSheetSnap] = React.useState<SheetSnap>(DEFAULT_SHEET_SNAP);
    const isPeekSheetState = !isEditMode && sheetSnap === MIN_SHEET_SNAP;
    const [activeSheetTab, setActiveSheetTab] = React.useState<SheetTab>('results');
    const [isManualNearbySelection, setIsManualNearbySelection] = React.useState(false);
    const shouldAvoidKeyboardForSheet = activeSheetTab === 'details';
    const isKeyboardActiveForSheet = shouldAvoidKeyboardForSheet && keyboardBottomInset > 0;
    const sheetBottomInset = isKeyboardActiveForSheet ? 0 : insets.bottom;
    const sheetFooterBottomInset = isKeyboardActiveForSheet
        ? keyboardBottomInset + theme.spacing.xs
        : sheetBottomInset + theme.spacing.sm;
    const sheetKeyboardAwareContentInsetStyle = shouldAvoidKeyboardForSheet
        ? keyboardAwareContentInsetStyle
        : null;
    const shouldShowSystemNavBackdrop = Platform.OS === 'android' && !isEditMode && sheetBottomInset > 0;
    const [mapCandidates, setMapCandidates] = React.useState<PlaceMapCandidate[]>([]);
    const [highlightedCandidateId, setHighlightedCandidateId] = React.useState<string | null>(null);
    const [pendingFocusCandidateId, setPendingFocusCandidateId] = React.useState<string | null>(null);
    const [manualCenterDraft, setManualCenterDraft] = React.useState<ManualCenterDraft>(null);
    const [mapViewportCenter, setMapViewportCenter] = React.useState<MapViewportDraft>(null);
    const [areaSearchAnchor, setAreaSearchAnchor] = React.useState<ManualCenterDraft>(null);
    const [isAreaSearchButtonVisible, setAreaSearchButtonVisible] = React.useState(false);
    const [isMapCandidatesLoading, setIsMapCandidatesLoading] = React.useState(false);
    const [mapCandidatesError, setMapCandidatesError] = React.useState<string | null>(null);
    const [mapUiError, setMapUiError] = React.useState<string | null>(null);
    const [mapPlacePreview, setMapPlacePreview] = React.useState<MobileTripCreatePlace | null>(null);
    const [isManualConfirming, setIsManualConfirming] = React.useState(false);
    const [isLocatingCurrentPosition, setIsLocatingCurrentPosition] = React.useState(false);

    const normalizedSearchQuery = React.useMemo(() => normalizeTextInput(searchQuery), [searchQuery]);
    const normalizedLocation = React.useMemo(() => {
        if (selectedPlace && normalizedSearchQuery === normalizeTextInput(selectedPlace.name)) {
            return normalizeTextInput(selectedPlace.address) || normalizeTextInput(selectedPlace.name);
        }

        return normalizedSearchQuery;
    }, [normalizedSearchQuery, selectedPlace]);
    const resolvedTitle = React.useMemo(
        () => normalizeTextInput(selectedPlace?.name || '') || normalizedSearchQuery,
        [normalizedSearchQuery, selectedPlace]
    );
    const normalizedTime = React.useMemo(() => normalizeTimeInput(time), [time]);
    const normalizedDurationMinutes = React.useMemo(() => parseDurationInput(durationMinutes), [durationMinutes]);
    const normalizedNote = React.useMemo(() => normalizeTextInput(note), [note]);
    const locationError = !normalizedSearchQuery ? '장소명을 입력해 주세요.' : null;
    const timeError = !normalizedTime ? '시간은 HH:MM 형식으로 입력해 주세요.' : null;
    const durationError = normalizedDurationMinutes === null ? '머무는 시간을 선택해 주세요.' : null;
    const canSubmit = !isSaving && !isLoadingPlaceDetail;
    const manualConfirmBottom = React.useMemo(
        () => Animated.add(sheetHeight, manualConfirmOffset),
        [manualConfirmOffset, sheetHeight]
    );
    const mapModeFabBottom = React.useMemo(
        () => Animated.add(sheetHeight, mapModeFabOffset),
        [mapModeFabOffset, sheetHeight]
    );
    const mapPlacePreviewBottom = React.useMemo(
        () => Animated.add(sheetHeight, mapModeFabOffset),
        [mapModeFabOffset, sheetHeight]
    );
    const areaSearchButtonBottom = React.useMemo(
        () => Animated.add(sheetHeight, mapModeFabOffset),
        [mapModeFabOffset, sheetHeight]
    );
    const mapZoomControlsBottom = React.useMemo(
        () => Animated.add(sheetHeight, mapZoomControlsOffset),
        [mapZoomControlsOffset, sheetHeight]
    );
    const manualConfirmFadeStart = React.useMemo(
        () => sheetHeights[MAX_SHEET_SNAP] - Math.max(72, Math.round(windowHeight * 0.08)),
        [sheetHeights, windowHeight]
    );
    const manualConfirmOpacity = React.useMemo(() => sheetHeight.interpolate({
        inputRange: [sheetHeights[DEFAULT_SHEET_SNAP], manualConfirmFadeStart, sheetHeights[MAX_SHEET_SNAP]],
        outputRange: [1, 1, 0],
        extrapolate: 'clamp'
    }), [manualConfirmFadeStart, sheetHeight, sheetHeights]);
    const mapVisibleInsets = React.useMemo(() => ({
        top: insets.top + theme.spacing.sm + SEARCH_BAR_HEIGHT + theme.spacing.sm,
        right: theme.spacing.sm,
        bottom: sheetHeights[sheetSnap] + theme.spacing.sm,
        left: theme.spacing.sm
    }), [insets.top, sheetHeights, sheetSnap, theme.spacing.sm]);
    const searchPlaceholder = React.useMemo(() => buildSearchPlaceholder(category), [category]);
    const visibleSearchCards = React.useMemo(() => {
        if (searchCards.length > 0) {
            return searchCards;
        }

        return searchResults.slice(0, 6).map((suggestion) => ({
            suggestion,
            place: null
        }));
    }, [searchCards, searchResults]);
    const shouldShowAreaSearchButton = (
        mapMode === 'results'
        && activeSheetTab === 'results'
        && !isManualNearbySelection
        && isAreaSearchButtonVisible
        && Boolean(mapViewportCenter)
        && !mapPlacePreview
    );
    const shouldShowMapPlacePreview = Boolean(mapPlacePreview) && sheetSnap !== MAX_SHEET_SNAP;
    const mapPlacePreviewTitle = normalizeTextInput(mapPlacePreview?.name || '') || '선택한 장소';
    const mapPlacePreviewAddress = normalizeTextInput(mapPlacePreview?.address || '') || mapPlacePreviewTitle;

    React.useEffect(() => {
        if (!pendingFocusCandidateId) {
            return;
        }

        const hasTargetCandidate = mapCandidates.some((candidate) => (
            normalizeTextInput(candidate.placeId) === normalizeTextInput(pendingFocusCandidateId)
        ));

        if (!hasTargetCandidate) {
            return;
        }

        mapPickerRef.current?.focusCandidate(pendingFocusCandidateId);
        setPendingFocusCandidateId(null);
    }, [mapCandidates, pendingFocusCandidateId]);
    const footerMessage = errorMessage
        ? errorMessage
        : isEditMode
            ? '반영하면 현재 일정 수정 화면에 바로 채워져요.'
            : '저장하면 현재 날짜 카드 사이에 새 일정이 바로 추가돼요.';
    const submitActionLabel = isLoadingPlaceDetail
        ? '장소 확인 중...'
        : isSaving
            ? (isEditMode ? '반영 중...' : '추가 중...')
            : (isEditMode ? '현재 일정에 반영' : '일정 추가');
    const locationSectionSupport = isEditMode
        ? '기존 일정 정보를 불러왔어요. 장소와 일정 정보를 한 번에 다시 맞춰 보세요.'
        : '선택한 장소명은 일정 이름으로 자동 사용돼요. 필요하면 나중에 수정할 수 있어요.';

    const animateSheetToSnap = React.useCallback((nextSnap: SheetSnap) => {
        const nextHeight = sheetHeights[nextSnap];
        if (mapMode === 'manual' && nextSnap === DEFAULT_SHEET_SNAP) {
            setMapMode('results');
            setHighlightedCandidateId(selectedPlace?.placeId || mapCandidates[0]?.placeId || null);
            setManualCenterDraft(null);
            setPendingFocusCandidateId(null);
            setMapUiError(null);
            setMapPlacePreview(null);
            setIsManualConfirming(false);
        }
        setSheetSnap(nextSnap);
        Animated.spring(sheetHeight, {
            toValue: nextHeight,
            useNativeDriver: false,
            damping: 22,
            stiffness: 170,
            mass: 0.95
        }).start(({ finished }) => {
            if (finished) {
                sheetHeightRef.current = nextHeight;
            }
        });
    }, [mapCandidates, mapMode, selectedPlace, sheetHeight, sheetHeights]);

    const resetMapInteractionState = React.useCallback(() => {
        mapCandidatesRequestIdRef.current += 1;
        setMapMode('results');
        setMapCandidates([]);
        setHighlightedCandidateId(null);
        setPendingFocusCandidateId(null);
        setManualCenterDraft(null);
        setMapViewportCenter(null);
        setAreaSearchAnchor(null);
        setAreaSearchButtonVisible(false);
        setIsMapCandidatesLoading(false);
        setMapCandidatesError(null);
        setMapUiError(null);
        setMapPlacePreview(null);
        setIsManualConfirming(false);
        setIsLocatingCurrentPosition(false);
        setIsManualNearbySelection(false);
    }, []);

    const applySelectedPlace = React.useCallback((
        place: MobileTripCreatePlace,
        options: { revealSelection?: boolean } = {}
    ) => {
        const shouldRevealSelection = options.revealSelection !== false;
        const normalizedName = normalizeTextInput(place.name)
            || normalizedSearchQuery
            || '선택한 위치';
        const normalizedAddress = normalizeTextInput(place.address)
            || normalizedName;
        const nextPlace: MobileTripCreatePlace = {
            ...place,
            placeId: normalizeTextInput(place.placeId)
                || `manual-map-${Number(place.latitude).toFixed(6)}-${Number(place.longitude).toFixed(6)}`,
            name: normalizedName,
            address: normalizedAddress,
            placeTypes: Array.isArray(place.placeTypes)
                ? place.placeTypes.map((type) => normalizeTextInput(type).toLowerCase()).filter(Boolean)
                : []
        };
        const inferredCategory = inferCategoryFromPlaceTypes(nextPlace.placeTypes);

        setSelectedPlace(nextPlace);
        if (!didManuallyChooseCategoryRef.current) {
            setCategory(inferredCategory || 'custom');
        }
        setSearchQuery(nextPlace.name);
        setSearchCards((currentCards) => currentCards.map((card) => (
            normalizeTextInput(card.suggestion.placeId) === normalizeTextInput(nextPlace.placeId)
                ? {
                    ...card,
                    place: {
                        ...(card.place || {}),
                        ...nextPlace
                    }
                }
                : card
        )));
        setMapCandidates((currentCandidates) => mergePlaceIntoMapCandidates(currentCandidates, nextPlace));
        setHighlightedCandidateId(nextPlace.placeId);
        setPendingFocusCandidateId(null);
        setMapMode('results');
        setManualCenterDraft(null);
        setAreaSearchAnchor(null);
        setMapUiError(null);
        setMapPlacePreview(null);
        setMapCandidatesError(null);
        setSearchError(null);
        setIsManualConfirming(false);
        setAreaSearchButtonVisible(false);
        setIsManualNearbySelection(false);
        if (shouldRevealSelection) {
            setActiveSheetTab('details');
            animateSheetToSnap(MAX_SHEET_SNAP);
        }
    }, [animateSheetToSnap, normalizedSearchQuery]);

    const handleMapError = React.useCallback((message: string) => {
        setIsManualConfirming(false);
        setMapUiError(message);
        setMapPlacePreview(null);
    }, []);

    const handleManualCenterChange = React.useCallback((nextCenter: ManualCenterDraft) => {
        setManualCenterDraft(nextCenter);
        setMapPlacePreview(null);
    }, []);

    const handleMapPlacePreview = React.useCallback((place: MobileTripCreatePlace) => {
        setMapPlacePreview(place);
        setMapUiError(null);
        setSearchError(null);
        setAreaSearchButtonVisible(false);
    }, []);

    const handleMoveToCurrentLocation = React.useCallback(async () => {
        if (isLocatingCurrentPosition) {
            return;
        }

        setIsLocatingCurrentPosition(true);
        setMapUiError(null);
        setMapPlacePreview(null);

        try {
            const permission = await Location.requestForegroundPermissionsAsync();
            if (permission.status !== 'granted') {
                setMapUiError('현재 위치 권한이 필요해요. 권한을 허용한 뒤 다시 눌러 주세요.');
                return;
            }

            const position = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced
            });
            const latitude = Number(position.coords.latitude);
            const longitude = Number(position.coords.longitude);

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                setMapUiError('현재 위치를 확인하지 못했어요. 위치 서비스를 확인해 주세요.');
                return;
            }

            mapPickerRef.current?.focusLocation({
                latitude,
                longitude,
                zoom: 16
            });
            setMapViewportCenter({ latitude, longitude });

            if (
                mapMode === 'results'
                && Boolean(normalizedSearchQuery)
                && !isSearching
                && !isMapCandidatesLoading
            ) {
                setAreaSearchButtonVisible(true);
            }
        } catch {
            setMapUiError('현재 위치를 확인하지 못했어요. 위치 서비스를 확인해 주세요.');
        } finally {
            setIsLocatingCurrentPosition(false);
        }
    }, [
        isLocatingCurrentPosition,
        isMapCandidatesLoading,
        isSearching,
        mapMode,
        normalizedSearchQuery
    ]);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        const initialSelectedPlace = initialDraft?.selectedPlace ?? null;
        const initialSearchQuery = normalizeTextInput(
            initialSelectedPlace?.name
            || initialDraft?.searchQuery
            || ''
        );
        const initialTime = normalizeTimeInput(initialDraft?.time || '')
            || normalizeTimeInput(defaultTime || '')
            || '09:00';
        const initialDurationMinutes = (
            typeof initialDraft?.durationMinutes === 'number'
            && Number.isFinite(initialDraft.durationMinutes)
            && initialDraft.durationMinutes > 0
        )
            ? String(Math.floor(initialDraft.durationMinutes))
            : '30';

        setTime(initialTime);
        setDurationMinutes(initialDurationMinutes);
        setNote(String(initialDraft?.note || ''));
        setCategory(initialDraft?.category || 'custom');
        didManuallyChooseCategoryRef.current = false;
        setDidAttemptSubmit(false);
        setSearchQuery(initialSearchQuery);
        setSearchResults([]);
        setSearchCards([]);
        setIsSearching(false);
        setSearchError(null);
        setSelectedPlace(initialSelectedPlace);
        setIsLoadingPlaceDetail(false);
        setIsTimePickerVisible(false);
        setDurationPickerVisible(false);
        resetMapInteractionState();
        setSheetSnap(DEFAULT_SHEET_SNAP);
        setActiveSheetTab(initialSelectedPlace || initialSearchQuery ? 'details' : 'results');
        sheetHeight.stopAnimation();
        sheetHeight.setValue(sheetHeights[DEFAULT_SHEET_SNAP]);
        sheetHeightRef.current = sheetHeights[DEFAULT_SHEET_SNAP];
        sheetDragStartHeightRef.current = sheetHeights[DEFAULT_SHEET_SNAP];
        searchRequestIdRef.current += 1;
        sessionTokenRef.current = `mobile-timeline-item-${Date.now().toString(36)}`;
        if (initialSelectedPlace) {
            setMapCandidates([{
                ...initialSelectedPlace,
                rank: MAP_CANDIDATE_RANKS[0]
            }]);
            setHighlightedCandidateId(initialSelectedPlace.placeId || null);
        }
    }, [defaultTime, initialDraft, resetMapInteractionState, sheetHeight, sheetHeights, visible]);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        const nextHeight = sheetHeights[sheetSnap];
        sheetHeight.stopAnimation();
        sheetHeight.setValue(nextHeight);
        sheetHeightRef.current = nextHeight;
        sheetDragStartHeightRef.current = nextHeight;
    }, [sheetHeight, sheetHeights, sheetSnap, visible]);

    const sheetPanResponder = React.useMemo(() => PanResponder.create({
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
            sheetHeight.stopAnimation((value) => {
                sheetDragStartHeightRef.current = value;
                sheetHeightRef.current = value;
            });
        },
        onPanResponderMove: (_event, gestureState) => {
            const nextValue = clamp(
                sheetDragStartHeightRef.current - gestureState.dy,
                sheetHeights[MIN_SHEET_SNAP],
                sheetHeights[MAX_SHEET_SNAP]
            );
            sheetHeight.setValue(nextValue);
            sheetHeightRef.current = nextValue;
        },
        onPanResponderRelease: (_event, gestureState) => {
            const projectedValue = (
                sheetDragStartHeightRef.current
                - gestureState.dy
                - gestureState.vy * SHEET_RELEASE_PROJECTION
            );
            animateSheetToSnap(resolveReleaseSheetSnap(
                sheetHeightRef.current,
                projectedValue,
                gestureState.vy,
                sheetHeights,
                sheetDragStartHeightRef.current
            ));
        },
        onPanResponderTerminate: () => {
            animateSheetToSnap(resolveNearestSheetSnap(sheetHeightRef.current, sheetHeights));
        }
    }), [animateSheetToSnap, sheetHeight, sheetHeights]);

    const handleSearchQueryChange = React.useCallback((nextValue: string) => {
        searchRequestIdRef.current += 1;
        mapCandidatesRequestIdRef.current += 1;
        setSearchQuery(nextValue);
        setSearchResults([]);
        setSearchCards([]);
        setIsSearching(false);
        setSearchError(null);
        setMapMode('results');
        setMapCandidates([]);
        setHighlightedCandidateId(null);
        setPendingFocusCandidateId(null);
        setManualCenterDraft(null);
        setMapViewportCenter(null);
        setAreaSearchAnchor(null);
        setAreaSearchButtonVisible(false);
        setIsMapCandidatesLoading(false);
        setMapCandidatesError(null);
        setMapUiError(null);
        setMapPlacePreview(null);
        setIsManualConfirming(false);
        setIsManualNearbySelection(false);
        if (selectedPlace && normalizeTextInput(nextValue) !== normalizeTextInput(selectedPlace.name)) {
            setSelectedPlace(null);
            if (!didManuallyChooseCategoryRef.current) {
                setCategory('custom');
            }
        }
        setActiveSheetTab('results');
    }, [selectedPlace]);

    const handleSearchPlaces = React.useCallback(async (locationBias?: ManualCenterDraft) => {
        const query = normalizedSearchQuery;
        const latitude = Number(locationBias?.latitude);
        const longitude = Number(locationBias?.longitude);
        const hasLocationBias = Boolean(
            locationBias
            && Number.isFinite(latitude)
            && Number.isFinite(longitude)
        );

        if (!query) {
            setSearchResults([]);
            setSearchCards([]);
            setIsSearching(false);
            setSearchError('장소명을 입력한 뒤 검색해 주세요.');
            setActiveSheetTab('results');
            return;
        }

        if (query.length < 2) {
            setSearchResults([]);
            setSearchCards([]);
            setIsSearching(false);
            setSearchError('두 글자 이상 입력한 뒤 검색해 주세요.');
            setActiveSheetTab('results');
            return;
        }

        searchRequestIdRef.current += 1;
        mapCandidatesRequestIdRef.current += 1;
        const requestId = searchRequestIdRef.current;
        const mapRequestId = mapCandidatesRequestIdRef.current;

        setIsSearching(true);
        setIsMapCandidatesLoading(true);
        setSearchError(null);
        setMapCandidatesError(null);
        setMapUiError(null);
        setMapPlacePreview(null);
        setSearchResults([]);
        setSearchCards([]);
        setMapCandidates([]);
        setHighlightedCandidateId(null);
        setPendingFocusCandidateId(null);
        setManualCenterDraft(null);
        setAreaSearchAnchor(
            hasLocationBias
                ? {
                    latitude,
                    longitude
                }
                : null
        );
        setAreaSearchButtonVisible(false);
        setIsManualNearbySelection(false);
        setMapMode('results');
        setActiveSheetTab('results');
        animateSheetToSnap(DEFAULT_SHEET_SNAP);

        try {
            const nextSuggestions = await searchTripPlaceSuggestions(
                query,
                sessionTokenRef.current,
                hasLocationBias
                    ? {
                        locationBias: {
                            latitude,
                            longitude,
                            radiusMeters: 6000,
                            strictBounds: true
                        }
                    }
                    : undefined
            );

            if (searchRequestIdRef.current !== requestId) {
                return;
            }

            setSearchResults(nextSuggestions);

            if (nextSuggestions.length === 0) {
                setSearchError('검색 결과가 없어요. 검색어를 바꾸거나 지도를 직접 움직여 보세요.');
                setMapCandidatesError('검색 결과를 지도에 표시하지 못했어요. 직접 위치를 고를 수 있어요.');
                return;
            }

            const seedCards = nextSuggestions.slice(0, 6).map((suggestion) => ({
                suggestion,
                place: null
            }));
            setSearchCards(seedCards);

            const resolvedCards = await Promise.all(seedCards.map(async (card) => {
                try {
                    const place = await fetchTripPlaceDetail(
                        card.suggestion.placeId,
                        sessionTokenRef.current,
                        card.suggestion,
                        { includePreviewImage: true }
                    );

                    if (
                        place
                        && searchRequestIdRef.current === requestId
                        && mapCandidatesRequestIdRef.current === mapRequestId
                    ) {
                        setSearchCards((currentCards) => currentCards.map((currentCard) => (
                            normalizeTextInput(currentCard.suggestion.placeId) === normalizeTextInput(card.suggestion.placeId)
                                ? {
                                    ...currentCard,
                                    place
                                }
                                : currentCard
                        )));
                        setMapCandidates((currentCandidates) => mergePlaceIntoMapCandidates(currentCandidates, place));
                        setHighlightedCandidateId((currentHighlightedId) => (
                            currentHighlightedId || place.placeId
                        ));
                        setMapCandidatesError(null);
                    }

                    return {
                        ...card,
                        place
                    };
                } catch {
                    return card;
                }
            }));

            if (searchRequestIdRef.current !== requestId) {
                return;
            }

            setSearchCards(resolvedCards);

            if (mapCandidatesRequestIdRef.current !== mapRequestId) {
                return;
            }

            const nextCandidates = buildMapCandidatesFromCards(resolvedCards);
            setMapCandidates(nextCandidates);
            setHighlightedCandidateId(
                selectedPlace && nextCandidates.some((candidate) => (
                    normalizeTextInput(candidate.placeId) === normalizeTextInput(selectedPlace.placeId)
                ))
                    ? selectedPlace.placeId
                    : (nextCandidates[0]?.placeId || null)
            );
            setMapCandidatesError(
                nextCandidates.length > 0
                    ? null
                    : '검색 결과를 지도에 표시하지 못했어요. 직접 위치를 고를 수 있어요.'
            );
        } catch (error) {
            if (searchRequestIdRef.current !== requestId) {
                return;
            }

            setSearchResults([]);
            setSearchCards([]);
            setSearchError(
                error instanceof Error
                    ? error.message
                    : '장소 검색 결과를 불러오지 못했어요.'
            );
        } finally {
            if (searchRequestIdRef.current === requestId) {
                setIsSearching(false);
            }

            if (mapCandidatesRequestIdRef.current === mapRequestId) {
                setIsMapCandidatesLoading(false);
            }
        }
    }, [animateSheetToSnap, normalizedSearchQuery, selectedPlace]);

    const handleMapViewportCenterChange = React.useCallback((
        nextCenter: MapViewportDraft,
        options?: { movedByUser?: boolean }
    ) => {
        setMapViewportCenter(nextCenter);
        if (options?.movedByUser) {
            setMapPlacePreview(null);
        }
        if (
            options?.movedByUser
            && mapMode === 'results'
            && activeSheetTab === 'results'
            && !isManualNearbySelection
            && Boolean(normalizedSearchQuery)
            && !isSearching
            && !isMapCandidatesLoading
        ) {
            setAreaSearchButtonVisible(true);
        }
    }, [activeSheetTab, isManualNearbySelection, isMapCandidatesLoading, isSearching, mapMode, normalizedSearchQuery]);

    const handleSearchCurrentMapArea = React.useCallback(async () => {
        if (
            !mapViewportCenter
            || !normalizedSearchQuery
            || activeSheetTab !== 'results'
            || isManualNearbySelection
            || isSearching
            || isMapCandidatesLoading
        ) {
            return;
        }

        if (!hasValidViewportBounds(mapViewportCenter)) {
            setSearchError('현재 지도 화면 범위를 확인하지 못했어요. 지도를 조금 움직인 뒤 다시 검색해 주세요.');
            setMapCandidatesError('현재 지도 화면 안에서 검색할 범위를 확인하지 못했어요.');
            setAreaSearchButtonVisible(false);
            return;
        }

        searchRequestIdRef.current += 1;
        mapCandidatesRequestIdRef.current += 1;
        const requestId = searchRequestIdRef.current;
        const mapRequestId = mapCandidatesRequestIdRef.current;

        setIsSearching(true);
        setIsMapCandidatesLoading(true);
        setSearchError(null);
        setMapCandidatesError(null);
        setMapUiError(null);
        setMapPlacePreview(null);
        setSearchResults([]);
        setSearchCards([]);
        setMapCandidates([]);
        setHighlightedCandidateId(null);
        setPendingFocusCandidateId(null);
        setManualCenterDraft(null);
        setAreaSearchAnchor({
            latitude: mapViewportCenter.latitude,
            longitude: mapViewportCenter.longitude
        });
        setAreaSearchButtonVisible(false);
        setIsManualNearbySelection(false);
        setMapMode('results');
        setActiveSheetTab('results');
        animateSheetToSnap(DEFAULT_SHEET_SNAP);

        try {
            const places = await searchTripPlacesInViewport(normalizedSearchQuery, {
                bounds: {
                    north: Number(mapViewportCenter.bounds?.north),
                    south: Number(mapViewportCenter.bounds?.south),
                    east: Number(mapViewportCenter.bounds?.east),
                    west: Number(mapViewportCenter.bounds?.west)
                }
            });

            if (searchRequestIdRef.current !== requestId) {
                return;
            }

            const cards = places.map((place) => buildSearchCardFromPlace(place));
            setSearchResults(cards.map((card) => card.suggestion));
            setSearchCards(cards);

            if (cards.length === 0) {
                setSearchError('현재 보이는 지도 화면 안에 검색 결과가 없어요. 지도를 움직이거나 축척을 넓혀 다시 검색해 주세요.');
                setMapCandidatesError('현재 지도 화면 안에 표시할 장소가 없어요.');
                return;
            }

            if (mapCandidatesRequestIdRef.current !== mapRequestId) {
                return;
            }

            const nextCandidates = buildMapCandidatesFromCards(cards);
            setMapCandidates(nextCandidates);
            setHighlightedCandidateId(
                selectedPlace && nextCandidates.some((candidate) => (
                    normalizeTextInput(candidate.placeId) === normalizeTextInput(selectedPlace.placeId)
                ))
                    ? selectedPlace.placeId
                    : (nextCandidates[0]?.placeId || null)
            );
            setMapCandidatesError(
                nextCandidates.length > 0
                    ? null
                    : '현재 지도 화면 안에 표시할 장소가 없어요.'
            );
        } catch (error) {
            if (searchRequestIdRef.current !== requestId) {
                return;
            }

            setSearchResults([]);
            setSearchCards([]);
            setMapCandidates([]);
            setHighlightedCandidateId(null);
            setPendingFocusCandidateId(null);
            setSearchError(
                error instanceof Error
                    ? error.message
                    : '현재 지도 화면 안에서 검색하지 못했어요. 지도를 움직인 뒤 다시 시도해 주세요.'
            );
            setMapCandidatesError('현재 지도 화면 안에 표시할 장소를 불러오지 못했어요.');
        } finally {
            if (searchRequestIdRef.current === requestId) {
                setIsSearching(false);
            }

            if (mapCandidatesRequestIdRef.current === mapRequestId) {
                setIsMapCandidatesLoading(false);
            }
        }
    }, [
        activeSheetTab,
        animateSheetToSnap,
        isManualNearbySelection,
        isMapCandidatesLoading,
        isSearching,
        mapViewportCenter,
        normalizedSearchQuery,
        selectedPlace
    ]);

    const handleFocusSearchCard = React.useCallback(async (card: SearchResultCard) => {
        const focusPlace = (place: MobileTripCreatePlace) => {
            setSearchCards((currentCards) => currentCards.map((currentCard) => (
                normalizeTextInput(currentCard.suggestion.placeId) === normalizeTextInput(card.suggestion.placeId)
                    ? {
                        ...currentCard,
                        place: {
                            ...(currentCard.place || {}),
                            ...place
                        }
                    }
                    : currentCard
            )));
            setMapCandidates((currentCandidates) => mergePlaceIntoMapCandidates(currentCandidates, place));
            setMapMode('results');
            setHighlightedCandidateId(place.placeId);
            setPendingFocusCandidateId(place.placeId);
            setMapUiError(null);
            setMapPlacePreview(null);
            setSearchError(null);
            setManualCenterDraft(null);
            setIsManualConfirming(false);
            setAreaSearchButtonVisible(false);
            setActiveSheetTab('results');
            if (sheetSnap === MIN_SHEET_SNAP) {
                animateSheetToSnap(DEFAULT_SHEET_SNAP);
            }
        };

        if (card.place) {
            focusPlace(card.place);
            return;
        }

        setIsLoadingPlaceDetail(true);
        setSearchError(null);

        try {
            const place = await fetchTripPlaceDetail(
                card.suggestion.placeId,
                sessionTokenRef.current,
                card.suggestion,
                { includePreviewImage: true }
            );

            if (!place) {
                throw new Error('선택한 장소 정보를 불러오지 못했어요.');
            }

            focusPlace(place);
        } catch (error) {
            setSearchError(
                error instanceof Error
                    ? error.message
                    : '선택한 장소 정보를 불러오지 못했어요.'
            );
        } finally {
            setIsLoadingPlaceDetail(false);
        }
    }, [animateSheetToSnap, sheetSnap]);

    const handleSelectSearchCard = React.useCallback(async (card: SearchResultCard) => {
        if (card.place) {
            applySelectedPlace(card.place);
            return;
        }

        setIsLoadingPlaceDetail(true);
        setSearchError(null);

        try {
            const place = await fetchTripPlaceDetail(
                card.suggestion.placeId,
                sessionTokenRef.current,
                card.suggestion,
                { includePreviewImage: true }
            );

            if (!place) {
                throw new Error('선택한 장소 정보를 불러오지 못했어요.');
            }

            applySelectedPlace(place);
        } catch (error) {
            setSearchError(
                error instanceof Error
                    ? error.message
                    : '선택한 장소 정보를 불러오지 못했어요.'
            );
        } finally {
            setIsLoadingPlaceDetail(false);
        }
    }, [applySelectedPlace]);

    const handleSelectCandidate = React.useCallback((placeId: string) => {
        const targetCandidate = mapCandidates.find((candidate) => (
            normalizeTextInput(candidate.placeId) === normalizeTextInput(placeId)
        ));

        if (!targetCandidate) {
            return;
        }

        applySelectedPlace(targetCandidate);
    }, [applySelectedPlace, mapCandidates]);

    const handleMapModeChange = React.useCallback((nextMode: MapMode) => {
        setMapMode(nextMode);
        setHighlightedCandidateId(
            nextMode === 'results'
                ? (selectedPlace?.placeId || mapCandidates[0]?.placeId || null)
                : null
        );
        if (nextMode !== 'manual') {
            setManualCenterDraft(null);
        }
        setPendingFocusCandidateId(null);
        setMapUiError(null);
        setMapPlacePreview(null);
        setIsManualConfirming(false);

        if (nextMode === 'manual') {
            setAreaSearchButtonVisible(false);
            setIsManualNearbySelection(false);
            animateSheetToSnap(MIN_SHEET_SNAP);
            return;
        }

        if (sheetSnap === MIN_SHEET_SNAP) {
            animateSheetToSnap(DEFAULT_SHEET_SNAP);
        }
    }, [animateSheetToSnap, mapCandidates, selectedPlace, sheetSnap]);

    const showManualNearbyResults = React.useCallback((
        places: MobileTripCreatePlace[],
        fallbackPlace: MobileTripCreatePlace
    ) => {
        const nearbyCards = buildUniqueSearchCardsFromPlaces(places);
        const resultCards = nearbyCards.length > 0
            ? nearbyCards
            : hasUsableFallbackPlace(fallbackPlace)
                ? [buildSearchCardFromPlace(fallbackPlace)]
                : [];
        const resultCandidates = buildMapCandidatesFromCards(resultCards);
        setSearchQuery(normalizedSearchQuery);
        setSearchResults(resultCards.map((card) => card.suggestion));
        setSearchCards(resultCards);
        setMapMode('results');
        setActiveSheetTab('results');
        setAreaSearchButtonVisible(false);
        setIsManualNearbySelection(true);
        setManualCenterDraft(null);
        setAreaSearchAnchor(null);
        setSelectedPlace(null);
        if (!didManuallyChooseCategoryRef.current) {
            setCategory('custom');
        }
        setMapCandidates(resultCandidates);
        setHighlightedCandidateId(resultCards[0]?.place?.placeId || null);
        setPendingFocusCandidateId(resultCards[0]?.place?.placeId || null);
        setMapCandidatesError(
            resultCards.length === 0
                ? '이 위치 주변에서 표시할 장소가 없어요.'
                : resultCandidates.length > 0
                ? null
                : '주변 장소를 지도에 표시하지 못했어요. 목록에서 선택해 주세요.'
        );
        setMapUiError(null);
        setMapPlacePreview(null);
        setSearchError(resultCards.length === 0 ? MANUAL_NEARBY_EMPTY_MESSAGE : null);
        setIsManualConfirming(false);
        setIsMapCandidatesLoading(false);
        animateSheetToSnap(DEFAULT_SHEET_SNAP);
    }, [animateSheetToSnap, normalizedSearchQuery]);

    const handleManualNearbyPlaces = React.useCallback((
        places: MobileTripCreatePlace[],
        fallbackPlace: MobileTripCreatePlace
    ) => {
        showManualNearbyResults(places, fallbackPlace);
    }, [showManualNearbyResults]);

    const handleManualSelect = React.useCallback(async (place: MobileTripCreatePlace) => {
        const latitude = Number(place.latitude);
        const longitude = Number(place.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            showManualNearbyResults([], place);
            return;
        }

        searchRequestIdRef.current += 1;
        mapCandidatesRequestIdRef.current += 1;
        const requestId = searchRequestIdRef.current;
        const mapRequestId = mapCandidatesRequestIdRef.current;

        setIsManualConfirming(true);
        setIsMapCandidatesLoading(true);
        setSearchError(null);
        setMapCandidatesError(null);
        setMapUiError(null);
        setMapPlacePreview(null);
        setSearchResults([]);
        setSearchCards([]);
        setMapCandidates([]);
        setHighlightedCandidateId(null);
        setPendingFocusCandidateId(null);
        setAreaSearchButtonVisible(false);

        try {
            const nearbyPlaces = await searchTripNearbyPlaces(latitude, longitude, {
                radiusMeters: MANUAL_NEARBY_RADIUS_METERS
            });

            if (searchRequestIdRef.current !== requestId) {
                return;
            }

            showManualNearbyResults(nearbyPlaces, place);
        } catch {
            if (searchRequestIdRef.current === requestId) {
                showManualNearbyResults([], place);
            }
        } finally {
            if (searchRequestIdRef.current === requestId) {
                setIsManualConfirming(false);
            }

            if (mapCandidatesRequestIdRef.current === mapRequestId) {
                setIsMapCandidatesLoading(false);
            }
        }
    }, [showManualNearbyResults]);

    const handleSubmit = React.useCallback(() => {
        setDidAttemptSubmit(true);

        if (isLoadingPlaceDetail) {
            return;
        }

        if (locationError || timeError || durationError || normalizedDurationMinutes === null) {
            setActiveSheetTab('details');
            animateSheetToSnap(MAX_SHEET_SNAP);
            return;
        }

        onSubmit({
            title: resolvedTitle,
            location: normalizedLocation,
            time: normalizedTime,
            durationMinutes: normalizedDurationMinutes ?? 30,
            note: normalizedNote,
            category,
            place: selectedPlace
        });
    }, [
        animateSheetToSnap,
        category,
        durationError,
        isLoadingPlaceDetail,
        locationError,
        normalizedDurationMinutes,
        normalizedLocation,
        normalizedNote,
        normalizedTime,
        onSubmit,
        resolvedTitle,
        selectedPlace,
        timeError
    ]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.mapLayer}>
                    <InlinePlaceMapPicker
                        candidates={mapCandidates}
                        candidatesError={mapCandidatesError || mapUiError}
                        controlsVisible={false}
                        fallbackCenter={areaSearchAnchor || initialMapCenter}
                        fallbackQuery={initialMapQuery}
                        highlightedCandidateId={highlightedCandidateId}
                        isCandidatesLoading={isMapCandidatesLoading}
                        manualCenterDraft={manualCenterDraft}
                        mode={mapMode}
                        onManualCenterChange={handleManualCenterChange}
                        onManualNearbyPlaces={handleManualNearbyPlaces}
                        onManualSelect={handleManualSelect}
                        onMapError={handleMapError}
                        onMapPlacePreview={handleMapPlacePreview}
                        onModeChange={handleMapModeChange}
                        onSelectCandidate={handleSelectCandidate}
                        onViewportCenterChange={handleMapViewportCenterChange}
                        query={normalizedSearchQuery}
                        ref={mapPickerRef}
                        selectedPlace={selectedPlace}
                        visibleInsets={mapVisibleInsets}
                    />

                    <View
                        pointerEvents="box-none"
                        style={[
                            styles.topOverlay,
                            {
                                paddingTop: insets.top + theme.spacing.sm
                            }
                        ]}
                    >
                        <View style={styles.searchBar}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving}
                                onPress={onClose}
                                style={({ pressed }) => [
                                    styles.searchBarIconButton,
                                    pressed && !isSaving ? styles.buttonPressed : null
                                ]}
                            >
                                <MaterialCommunityIcons
                                    color={theme.colors.textPrimary}
                                    name="chevron-left"
                                    size={24}
                                />
                            </Pressable>

                            <TextInput
                                value={searchQuery}
                                onChangeText={handleSearchQueryChange}
                                onSubmitEditing={() => {
                                    void handleSearchPlaces();
                                }}
                                editable={!isSaving && !isLoadingPlaceDetail}
                                placeholder={searchPlaceholder}
                                placeholderTextColor={theme.colors.textSecondary}
                                returnKeyType="search"
                                style={styles.searchBarInput}
                            />

                            {normalizedSearchQuery ? (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isSaving || isLoadingPlaceDetail}
                                    onPress={() => {
                                        handleSearchQueryChange('');
                                    }}
                                    style={({ pressed }) => [
                                        styles.searchBarIconButton,
                                        pressed && !isSaving && !isLoadingPlaceDetail ? styles.buttonPressed : null
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        color={theme.colors.textSecondary}
                                        name="close-circle-outline"
                                        size={20}
                                    />
                                </Pressable>
                            ) : null}

                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving || isLoadingPlaceDetail || isSearching || !normalizedSearchQuery}
                                onPress={() => {
                                    void handleSearchPlaces();
                                }}
                                style={({ pressed }) => [
                                    styles.searchBarIconButton,
                                    (isSaving || isLoadingPlaceDetail || isSearching || !normalizedSearchQuery)
                                        ? styles.iconButtonDisabled
                                        : null,
                                    pressed && !isSaving && !isLoadingPlaceDetail && !isSearching && normalizedSearchQuery
                                        ? styles.buttonPressed
                                        : null
                                ]}
                            >
                                <MaterialCommunityIcons
                                    color={theme.colors.textPrimary}
                                    name="magnify"
                                    size={22}
                                />
                            </Pressable>
                        </View>

                    </View>

                    {shouldShowAreaSearchButton ? (
                        <Animated.View
                            pointerEvents="box-none"
                            style={[
                                styles.areaSearchButtonWrap,
                                {
                                    bottom: areaSearchButtonBottom as any
                                }
                            ]}
                        >
                            <Pressable
                                accessibilityRole="button"
                                disabled={isSaving || isSearching || isMapCandidatesLoading || !normalizedSearchQuery}
                                onPress={handleSearchCurrentMapArea}
                                style={({ pressed }) => [
                                    styles.areaSearchButton,
                                    isSaving || isSearching || isMapCandidatesLoading || !normalizedSearchQuery
                                        ? styles.areaSearchButtonDisabled
                                        : null,
                                    pressed && !isSaving && !isSearching && !isMapCandidatesLoading && normalizedSearchQuery
                                        ? styles.buttonPressed
                                        : null
                                ]}
                            >
                                <MaterialCommunityIcons
                                    color={theme.colors.accent}
                                    name="map-search-outline"
                                    size={18}
                                />
                                <Text style={styles.areaSearchButtonText}>
                                    {isSearching || isMapCandidatesLoading ? '검색 중...' : '이 지역에서 검색'}
                                </Text>
                            </Pressable>
                        </Animated.View>
                    ) : null}

                    {shouldShowMapPlacePreview && mapPlacePreview ? (
                        <Animated.View
                            pointerEvents="box-none"
                            style={[
                                styles.mapPlacePreviewWrap,
                                {
                                    bottom: mapPlacePreviewBottom as any
                                }
                            ]}
                        >
                            <View style={styles.mapPlacePreviewCard}>
                                <View style={styles.mapPlacePreviewBody}>
                                    <Text numberOfLines={1} style={styles.mapPlacePreviewTitle}>
                                        {mapPlacePreviewTitle}
                                    </Text>
                                    <Text numberOfLines={2} style={styles.mapPlacePreviewAddress}>
                                        {mapPlacePreviewAddress}
                                    </Text>
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={isSaving || isLoadingPlaceDetail}
                                    onPress={() => {
                                        applySelectedPlace(mapPlacePreview);
                                    }}
                                    style={({ pressed }) => [
                                        styles.mapPlacePreviewButton,
                                        isSaving || isLoadingPlaceDetail ? styles.mapPlacePreviewButtonDisabled : null,
                                        pressed && !isSaving && !isLoadingPlaceDetail ? styles.buttonPressed : null
                                    ]}
                                >
                                    <Text style={styles.mapPlacePreviewButtonText}>이 장소로 등록</Text>
                                </Pressable>
                            </View>
                        </Animated.View>
                    ) : null}

                    {mapMode === 'manual' && !shouldShowMapPlacePreview ? (
                        <Animated.View
                            pointerEvents={sheetSnap === MAX_SHEET_SNAP ? 'none' : 'box-none'}
                            style={[
                                styles.manualConfirmWrap,
                                {
                                    bottom: manualConfirmBottom as any,
                                    opacity: manualConfirmOpacity as any
                                }
                            ]}
                        >
                            <Pressable
                                accessibilityRole="button"
                                disabled={isManualConfirming || !manualCenterDraft}
                                onPress={() => {
                                    setIsManualConfirming(true);
                                    mapPickerRef.current?.confirmManualSelection();
                                }}
                                style={({ pressed }) => [
                                    styles.manualConfirmButton,
                                    isManualConfirming || !manualCenterDraft ? styles.manualConfirmButtonDisabled : null,
                                    pressed && !isManualConfirming && manualCenterDraft ? styles.buttonPressed : null
                                ]}
                            >
                                <MaterialCommunityIcons color="#ffffff" name="map-marker-check-outline" size={20} />
                                <Text style={styles.manualConfirmButtonText}>
                                    {isManualConfirming ? '위치를 확인하고 있어요...' : '이 위치 선택'}
                                </Text>
                            </Pressable>
                        </Animated.View>
                    ) : null}

                    {sheetSnap !== MAX_SHEET_SNAP && !shouldShowMapPlacePreview ? (
                        <Animated.View
                            pointerEvents="box-none"
                            style={[
                                styles.mapZoomControlsWrap,
                                {
                                    bottom: mapZoomControlsBottom as any
                                }
                            ]}
                        >
                            <View style={styles.mapZoomControls}>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="지도 확대"
                                    onPress={() => {
                                        mapPickerRef.current?.adjustZoom(1);
                                    }}
                                    style={({ pressed }) => [
                                        styles.mapZoomButton,
                                        pressed ? styles.buttonPressed : null
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        color={theme.colors.textPrimary}
                                        name="plus"
                                        size={22}
                                    />
                                </Pressable>
                                <View style={styles.mapZoomDivider} />
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="지도 축소"
                                    onPress={() => {
                                        mapPickerRef.current?.adjustZoom(-1);
                                    }}
                                    style={({ pressed }) => [
                                        styles.mapZoomButton,
                                        pressed ? styles.buttonPressed : null
                                    ]}
                                >
                                    <MaterialCommunityIcons
                                        color={theme.colors.textPrimary}
                                        name="minus"
                                        size={22}
                                    />
                                </Pressable>
                            </View>
                        </Animated.View>
                    ) : null}

                    {mapMode === 'results' && sheetSnap !== MAX_SHEET_SNAP && !shouldShowMapPlacePreview ? (
                        <Animated.View
                            pointerEvents="box-none"
                            style={[
                                styles.mapModeFabWrap,
                                {
                                    bottom: mapModeFabBottom as any
                                }
                            ]}
                        >
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="지도에서 위치 직접 지정"
                                disabled={isSaving || isLoadingPlaceDetail}
                                onPress={() => {
                                    handleMapModeChange('manual');
                                }}
                                style={({ pressed }) => [
                                    styles.mapModeFabButton,
                                    pressed && !isSaving && !isLoadingPlaceDetail ? styles.buttonPressed : null
                                ]}
                            >
                                <MaterialCommunityIcons
                                    color={theme.colors.textPrimary}
                                    name="map-marker-radius-outline"
                                    size={21}
                                />
                            </Pressable>
                        </Animated.View>
                    ) : null}

                    {mapMode === 'results' && sheetSnap !== MAX_SHEET_SNAP && !shouldShowMapPlacePreview ? (
                        <Animated.View
                            pointerEvents="box-none"
                            style={[
                                styles.currentLocationFabWrap,
                                {
                                    bottom: mapModeFabBottom as any
                                }
                            ]}
                        >
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="현재 위치로 지도 이동"
                                disabled={isSaving || isLoadingPlaceDetail || isLocatingCurrentPosition}
                                onPress={() => {
                                    void handleMoveToCurrentLocation();
                                }}
                                style={({ pressed }) => [
                                    styles.mapModeFabButton,
                                    isSaving || isLoadingPlaceDetail || isLocatingCurrentPosition
                                        ? styles.mapModeFabButtonDisabled
                                        : null,
                                    pressed && !isSaving && !isLoadingPlaceDetail && !isLocatingCurrentPosition
                                        ? styles.buttonPressed
                                        : null
                                ]}
                            >
                                {isLocatingCurrentPosition ? (
                                    <ActivityIndicator color={theme.colors.accent} size="small" />
                                ) : (
                                    <MaterialCommunityIcons
                                        color={theme.colors.textPrimary}
                                        name="crosshairs-gps"
                                        size={21}
                                    />
                                )}
                            </Pressable>
                        </Animated.View>
                    ) : null}
                </View>

                {shouldShowSystemNavBackdrop ? (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.systemNavBackdrop,
                            {
                                height: sheetBottomInset
                            }
                        ]}
                    />
                ) : null}

                <View
                    pointerEvents="box-none"
                    style={styles.keyboardArea}
                >
                    <Animated.View
                        style={[
                            styles.sheet,
                            {
                                height: sheetHeight
                            }
                        ]}
                    >
                        <View
                            {...sheetPanResponder.panHandlers}
                            collapsable={false}
                            style={styles.sheetHandleTouch}
                        >
                            <View style={styles.handle} />
                        </View>

                        {!isPeekSheetState ? (
                            <>
                                <ScrollView
                                    ref={scrollRef}
                                    contentContainerStyle={[styles.content, sheetKeyboardAwareContentInsetStyle]}
                                    {...scrollViewProps}
                                >
                                    {activeSheetTab === 'results' ? (
                                        <>
                                            {isSearching ? (
                                                <View style={styles.inlineStateRow}>
                                                    <ActivityIndicator size="small" color={theme.colors.accent} />
                                                    <Text style={styles.inlineStateText}>검색 결과와 지도 위치를 함께 준비하고 있어요.</Text>
                                                </View>
                                            ) : null}

                                            {searchError ? (
                                                <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                                                    <Text style={[styles.noticeText, styles.noticeTextWarning]}>{searchError}</Text>
                                                </View>
                                            ) : null}

                                            {mapUiError ? (
                                                <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                                                    <Text style={[styles.noticeText, styles.noticeTextWarning]}>{mapUiError}</Text>
                                                </View>
                                            ) : null}

                                            {visibleSearchCards.length > 0 ? (
                                                <View style={styles.resultList}>
                                                    {visibleSearchCards.map((card, index) => {
                                                        const isSelected = Boolean(
                                                            selectedPlace
                                                            && normalizeTextInput(selectedPlace.placeId) === normalizeTextInput(card.suggestion.placeId)
                                                        );
                                                        const imageUrl = normalizeTextInput(card.place?.mapImageUrl || '');
                                                        const isHighlighted = (
                                                            normalizeTextInput(highlightedCandidateId || '')
                                                            === normalizeTextInput(card.place?.placeId || card.suggestion.placeId)
                                                        );

                                                        return (
                                                            <View
                                                                key={card.suggestion.placeId}
                                                                style={[
                                                                    styles.resultCard,
                                                                    isSelected ? styles.resultCardSelected : null,
                                                                    isHighlighted && !isSelected ? styles.resultCardFocused : null,
                                                                    index < visibleSearchCards.length - 1 ? styles.resultCardSpaced : null
                                                                ]}
                                                            >
                                                                <Pressable
                                                                    accessibilityRole="button"
                                                                    disabled={isSaving || isLoadingPlaceDetail}
                                                                    onPress={() => {
                                                                        void handleFocusSearchCard(card);
                                                                    }}
                                                                    style={({ pressed }) => [
                                                                        styles.resultCardBodyButton,
                                                                        pressed && !isSaving && !isLoadingPlaceDetail ? styles.buttonPressed : null
                                                                    ]}
                                                                >
                                                                    {imageUrl ? (
                                                                        <Image
                                                                            resizeMode="cover"
                                                                            source={{ uri: imageUrl }}
                                                                            style={styles.resultThumb}
                                                                        />
                                                                    ) : (
                                                                        <View style={styles.resultThumbFallback}>
                                                                            <Text style={styles.resultThumbFallbackText}>
                                                                                {resolveCardTitle(card).slice(0, 1)}
                                                                            </Text>
                                                                        </View>
                                                                    )}

                                                                    <View style={styles.resultBody}>
                                                                        <Text numberOfLines={1} style={styles.resultTitle}>
                                                                            {resolveCardTitle(card)}
                                                                        </Text>
                                                                        <Text numberOfLines={2} style={styles.resultSubtitle}>
                                                                            {resolveCardSubtitle(card)}
                                                                        </Text>
                                                                        <Text numberOfLines={1} style={styles.resultMeta}>
                                                                            {resolveCardMeta(card)}
                                                                        </Text>
                                                                    </View>
                                                                </Pressable>

                                                                <Pressable
                                                                    accessibilityRole="button"
                                                                    disabled={isSaving || isLoadingPlaceDetail}
                                                                    onPress={() => {
                                                                        void handleSelectSearchCard(card);
                                                                    }}
                                                                    style={({ pressed }) => [
                                                                        styles.resultAction,
                                                                        isSelected ? styles.resultActionActive : null,
                                                                        pressed && !isSaving && !isLoadingPlaceDetail ? styles.buttonPressed : null
                                                                    ]}
                                                                >
                                                                    <Text style={[
                                                                        styles.resultActionText,
                                                                        isSelected ? styles.resultActionTextActive : null
                                                                    ]}>
                                                                        {isSelected ? '선택됨' : '선택'}
                                                                    </Text>
                                                                </Pressable>
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            ) : (
                                                <View style={styles.emptyCard}>
                                                    <Text style={styles.emptyCardTitle}>먼저 장소를 검색해 보세요.</Text>
                                                    <Text style={styles.emptyCardText}>
                                                        검색하면 지도 위 마커와 함께 결과를 바로 보여드릴게요.
                                                    </Text>
                                                </View>
                                            )}

                                            {isLoadingPlaceDetail ? (
                                                <View style={styles.inlineStateRow}>
                                                    <ActivityIndicator size="small" color={theme.colors.accent} />
                                                    <Text style={styles.inlineStateText}>선택한 장소 정보를 확인하고 있어요.</Text>
                                                </View>
                                            ) : null}
                                        </>
                                    ) : null}

                                    {activeSheetTab === 'details' ? (
                                        <>
                                            <View style={styles.formSection}>
                                                <View style={styles.formSectionHeaderRow}>
                                                    <Text style={styles.sectionLabel}>선택한 장소</Text>
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        disabled={isSaving || isLoadingPlaceDetail}
                                                        onPress={() => {
                                                            setActiveSheetTab('results');
                                                            animateSheetToSnap(DEFAULT_SHEET_SNAP);
                                                        }}
                                                        style={({ pressed }) => [
                                                            styles.reselectPlaceButton,
                                                            isSaving || isLoadingPlaceDetail ? styles.iconButtonDisabled : null,
                                                            pressed && !isSaving && !isLoadingPlaceDetail ? styles.buttonPressed : null
                                                        ]}
                                                    >
                                                        <MaterialCommunityIcons
                                                            color={theme.colors.textPrimary}
                                                            name="map-search-outline"
                                                            size={15}
                                                        />
                                                        <Text style={styles.reselectPlaceButtonText}>다시 고르기</Text>
                                                    </Pressable>
                                                </View>
                                                <Text style={styles.sectionSupport}>
                                                    {locationSectionSupport}
                                                </Text>

                                                {selectedPlace ? (
                                                    <View style={styles.selectedSummaryCard}>
                                                        <Text style={styles.selectedSummaryTitle}>{selectedPlace.name}</Text>
                                                        <Text style={styles.selectedSummarySubtitle}>{selectedPlace.address}</Text>
                                                    </View>
                                                ) : (
                                                    <View style={styles.emptyInlineCard}>
                                                        <Text style={styles.emptyInlineCardText}>
                                                            아직 확정한 장소가 없어요. 장소 이름만 입력해도 저장할 수 있어요.
                                                        </Text>
                                                    </View>
                                                )}

                                                {didAttemptSubmit && locationError ? (
                                                    <Text style={styles.fieldError}>{locationError}</Text>
                                                ) : null}
                                            </View>

                                            <View style={styles.formSection}>
                                                <Text style={styles.sectionLabel}>일정 기본 정보</Text>

                                                <View style={styles.fieldRow}>
                                                    <View style={[styles.fieldColumn, styles.fieldColumnSpaced]}>
                                                        <Text style={styles.fieldLabel}>시작 시간</Text>
                                                        <Pressable
                                                            accessibilityRole="button"
                                                            disabled={isSaving}
                                                            onPress={() => {
                                                                setIsTimePickerVisible(true);
                                                            }}
                                                            style={({ pressed }) => [
                                                                styles.fieldButton,
                                                                didAttemptSubmit && timeError ? styles.fieldButtonError : null,
                                                                pressed && !isSaving ? styles.buttonPressed : null
                                                            ]}
                                                        >
                                                            <Text style={styles.fieldButtonText}>{normalizedTime || '시간 선택'}</Text>
                                                        </Pressable>
                                                        <Text style={styles.fieldHint}>시간 전용 피커로 고를 수 있어요.</Text>
                                                        {didAttemptSubmit && timeError ? (
                                                            <Text style={styles.fieldError}>{timeError}</Text>
                                                        ) : null}
                                                    </View>

                                                    <View style={styles.fieldColumn}>
                                                        <Text style={styles.fieldLabel}>머무는 시간</Text>
                                                        <Pressable
                                                            accessibilityRole="button"
                                                            disabled={isSaving}
                                                            onPress={() => {
                                                                setDurationPickerVisible(true);
                                                            }}
                                                            style={({ pressed }) => [
                                                                styles.fieldButton,
                                                                didAttemptSubmit && durationError ? styles.fieldButtonError : null,
                                                                pressed && !isSaving ? styles.buttonPressed : null
                                                            ]}
                                                        >
                                                            <Text style={styles.fieldButtonText}>
                                                                {formatDurationDisplayLabel(durationMinutes)}
                                                            </Text>
                                                        </Pressable>
                                                        <Text style={styles.fieldHint}>시간/분 피커로 고를 수 있어요.</Text>
                                                        {didAttemptSubmit && durationError ? (
                                                            <Text style={styles.fieldError}>{durationError}</Text>
                                                        ) : null}
                                                    </View>
                                                </View>
                                            </View>

                                            <View style={styles.formSection}>
                                                <Text style={styles.sectionLabel}>분류</Text>
                                                <View style={styles.categoryGrid}>
                                                    {CATEGORY_OPTION_ROWS.map((row, rowIndex) => (
                                                        <View
                                                            key={`category-row-${rowIndex}`}
                                                            style={[
                                                                styles.categoryRow,
                                                                rowIndex < CATEGORY_OPTION_ROWS.length - 1 ? styles.categoryRowSpaced : null
                                                            ]}
                                                        >
                                                            {row.map((option) => {
                                                                const selected = category === option.code;
                                                                return (
                                                                    <Pressable
                                                                        key={option.code}
                                                                        accessibilityRole="button"
                                                                        disabled={isSaving}
                                                                        onPress={() => {
                                                                            didManuallyChooseCategoryRef.current = true;
                                                                            setCategory(option.code);
                                                                        }}
                                                                        style={({ pressed }) => [
                                                                            styles.categoryChip,
                                                                            selected ? styles.categoryChipSelected : null,
                                                                            pressed && !isSaving ? styles.buttonPressed : null
                                                                        ]}
                                                                    >
                                                                        <Text
                                                                            style={[
                                                                                styles.categoryChipText,
                                                                                selected ? styles.categoryChipTextSelected : null
                                                                            ]}
                                                                        >
                                                                            {option.label}
                                                                        </Text>
                                                                    </Pressable>
                                                                );
                                                            })}
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>

                                            <View style={styles.formSection}>
                                                <Text style={styles.sectionLabel}>메모</Text>
                                                <TextInput
                                                    value={note}
                                                    onChangeText={setNote}
                                                    onFocus={createFocusHandler()}
                                                    editable={!isSaving}
                                                    multiline
                                                    textAlignVertical="top"
                                                    placeholder="이 일정에 남길 설명이나 체크 포인트를 적어 주세요."
                                                    placeholderTextColor={theme.colors.textSecondary}
                                                    style={styles.textArea}
                                                />
                                            </View>
                                        </>
                                    ) : null}
                                </ScrollView>

                                {activeSheetTab === 'details' ? (
                                    <View style={styles.sheetFooter}>
                                        <View style={[styles.footerNotice, errorMessage ? styles.footerNoticeWarning : null]}>
                                            <Text style={[styles.footerNoticeText, errorMessage ? styles.footerNoticeTextWarning : null]}>
                                                {footerMessage}
                                            </Text>
                                        </View>

                                        <View
                                            style={[
                                                styles.actionRow,
                                                {
                                                    paddingBottom: sheetFooterBottomInset
                                                }
                                            ]}
                                        >
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={!canSubmit}
                                                onPress={handleSubmit}
                                                style={({ pressed }) => [
                                                    styles.primaryAction,
                                                    styles.primaryActionFullWidth,
                                                    !canSubmit ? styles.primaryActionDisabled : null,
                                                    pressed && canSubmit ? styles.buttonPressed : null
                                                ]}
                                            >
                                                <Text style={styles.primaryActionText}>{submitActionLabel}</Text>
                                            </Pressable>
                                        </View>
                                    </View>
                                ) : null}
                            </>
                        ) : null}
                    </Animated.View>
                </View>
            </View>

            <TimePickerModal
                visible={isTimePickerVisible}
                value={normalizedTime || time || defaultTime || '09:00'}
                onClose={() => {
                    setIsTimePickerVisible(false);
                }}
                onConfirm={(nextValue) => {
                    setTime(nextValue);
                    setIsTimePickerVisible(false);
                }}
            />
            <DurationPickerModal
                visible={isDurationPickerVisible}
                value={durationMinutes}
                onClose={() => {
                    setDurationPickerVisible(false);
                }}
                onConfirm={(nextValue) => {
                    setDurationMinutes(nextValue);
                    setDurationPickerVisible(false);
                }}
            />
        </Modal>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    mapLayer: {
        ...StyleSheet.absoluteFillObject
    },
    topOverlay: {
        ...StyleSheet.absoluteFillObject,
        paddingHorizontal: theme.spacing.sm
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: SEARCH_BAR_HEIGHT,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.full,
        backgroundColor: theme.mode === 'dark' ? 'rgba(37, 39, 44, 0.97)' : 'rgba(255, 255, 255, 0.97)',
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10,
        gap: theme.spacing.xs
    },
    searchBarInput: {
        flex: 1,
        minHeight: 32,
        minWidth: 0,
        paddingHorizontal: 0,
        paddingVertical: theme.spacing.xs,
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.body
    },
    searchBarIconButton: {
        width: 36,
        height: 36,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center'
    },
    iconButtonDisabled: {
        opacity: 0.4
    },
    keyboardArea: {
        flex: 1,
        justifyContent: 'flex-end'
    },
    systemNavBackdrop: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.colors.surface
    },
    sheet: {
        width: '100%',
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden'
    },
    sheetHandleTouch: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 34,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs
    },
    handle: {
        width: 56,
        height: 6,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.border
    },
    content: {
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.md
    },
    noticeCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background,
        marginBottom: theme.spacing.sm
    },
    noticeCardWarning: {
        backgroundColor: theme.mode === 'dark' ? '#342a16' : '#fff6cf'
    },
    noticeTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    noticeText: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    noticeTextWarning: {
        color: theme.colors.warning
    },
    inlineStateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: theme.spacing.sm
    },
    inlineStateText: {
        marginLeft: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontFamily: theme.fonts.body
    },
    resultList: {
        marginBottom: theme.spacing.sm
    },
    resultCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: 'transparent'
    },
    resultCardSelected: {
        backgroundColor: theme.colors.accentSoft
    },
    resultCardFocused: {
        borderColor: theme.colors.accent
    },
    resultCardSpaced: {
        marginBottom: theme.spacing.sm
    },
    resultCardBodyButton: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center'
    },
    resultThumb: {
        width: RESULT_THUMB_WIDTH,
        height: RESULT_THUMB_HEIGHT,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    resultThumbFallback: {
        width: RESULT_THUMB_WIDTH,
        height: RESULT_THUMB_HEIGHT,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    resultThumbFallbackText: {
        color: theme.colors.textSecondary,
        fontSize: 24,
        fontFamily: theme.fonts.bold
    },
    resultBody: {
        flex: 1,
        minWidth: 0,
        marginLeft: theme.spacing.sm,
        marginRight: theme.spacing.sm
    },
    resultTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    resultSubtitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 14,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    resultMeta: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    resultAction: {
        minHeight: 32,
        minWidth: 60,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    resultActionActive: {
        backgroundColor: theme.colors.accent
    },
    resultActionText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.semibold
    },
    resultActionTextActive: {
        color: '#ffffff'
    },
    emptyCard: {
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background
    },
    emptyCardTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    emptyCardText: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    selectedHeroCard: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.background,
        marginBottom: theme.spacing.sm
    },
    selectedHeroImage: {
        width: '100%',
        height: 180,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surfaceMuted
    },
    selectedHeroImageFallback: {
        width: '100%',
        height: 180,
        borderRadius: theme.radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted
    },
    selectedHeroBody: {
        marginTop: theme.spacing.sm
    },
    selectedHeroTitle: {
        color: theme.colors.textPrimary,
        fontSize: 24,
        lineHeight: 30,
        fontFamily: theme.fonts.display
    },
    selectedHeroSubtitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    selectedHeroActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        marginTop: theme.spacing.sm
    },
    selectedHeroPrimaryButton: {
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    selectedHeroPrimaryButtonText: {
        color: '#ffffff',
        fontSize: 15,
        lineHeight: 20,
        textAlign: 'center',
        fontFamily: theme.fonts.bold
    },
    selectedHeroSecondaryButton: {
        flex: 1,
        minWidth: 0,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    selectedHeroSecondaryButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        lineHeight: 20,
        textAlign: 'center',
        fontFamily: theme.fonts.semibold
    },
    formSection: {
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.background,
        marginBottom: theme.spacing.sm
    },
    formSectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm
    },
    sectionLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.bold
    },
    reselectPlaceButton: {
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.micro,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surfaceMuted
    },
    reselectPlaceButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.semibold
    },
    sectionSupport: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    selectedSummaryCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    selectedSummaryTitle: {
        color: theme.colors.textPrimary,
        fontSize: 17,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    selectedSummarySubtitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 21,
        fontFamily: theme.fonts.body
    },
    emptyInlineCard: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    emptyInlineCardText: {
        color: theme.colors.textSecondary,
        lineHeight: 21,
        fontFamily: theme.fonts.body
    },
    fieldRow: {
        flexDirection: 'row',
        marginTop: theme.spacing.sm
    },
    fieldColumn: {
        flex: 1
    },
    fieldColumnSpaced: {
        marginRight: theme.spacing.sm
    },
    fieldLabel: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    fieldButton: {
        minHeight: 48,
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        alignItems: 'flex-start',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface
    },
    fieldButtonError: {
        borderWidth: 1,
        borderColor: theme.mode === 'dark' ? '#f0b0b0' : '#c44848'
    },
    fieldButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.semibold
    },
    fieldHint: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    fieldError: {
        marginTop: theme.spacing.xs,
        color: theme.mode === 'dark' ? '#f0b0b0' : '#c44848',
        fontFamily: theme.fonts.body
    },
    textInput: {
        minHeight: 48,
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        color: theme.colors.textPrimary,
        fontFamily: theme.fonts.body
    },
    categoryGrid: {
        marginTop: theme.spacing.sm
    },
    categoryRow: {
        flexDirection: 'row',
        gap: theme.spacing.micro
    },
    categoryRowSpaced: {
        marginBottom: theme.spacing.micro
    },
    categoryChip: {
        flex: 1,
        minWidth: 0,
        minHeight: 32,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.micro,
        borderRadius: theme.radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface
    },
    categoryChipSelected: {
        backgroundColor: theme.colors.accentSoft
    },
    categoryChipText: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
        fontFamily: theme.fonts.semibold
    },
    categoryChipTextSelected: {
        color: theme.colors.accent
    },
    textArea: {
        minHeight: 144,
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        color: theme.colors.textPrimary,
        lineHeight: 22,
        fontFamily: theme.fonts.body
    },
    sheetFooter: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surface
    },
    footerNotice: {
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm
    },
    footerNoticeWarning: {
        backgroundColor: theme.mode === 'dark' ? '#342a16' : '#fff6cf'
    },
    footerNoticeText: {
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    footerNoticeTextWarning: {
        color: theme.colors.warning
    },
    actionRow: {
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm
    },
    primaryAction: {
        flex: 1,
        minHeight: 52,
        marginLeft: theme.spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    primaryActionFullWidth: {
        marginLeft: 0
    },
    primaryActionDisabled: {
        opacity: 0.45
    },
    primaryActionText: {
        color: '#ffffff',
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    manualConfirmWrap: {
        position: 'absolute',
        left: theme.spacing.md,
        right: theme.spacing.md
    },
    mapModeFabWrap: {
        position: 'absolute',
        left: theme.spacing.md
    },
    currentLocationFabWrap: {
        position: 'absolute',
        right: theme.spacing.md
    },
    areaSearchButtonWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center'
    },
    areaSearchButton: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        shadowColor: '#000000',
        shadowOpacity: 0.16,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 7 },
        elevation: 9
    },
    areaSearchButtonDisabled: {
        opacity: 0.52
    },
    areaSearchButtonText: {
        marginLeft: theme.spacing.micro,
        color: theme.colors.accent,
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    mapPlacePreviewWrap: {
        position: 'absolute',
        left: theme.spacing.md,
        right: theme.spacing.md
    },
    mapPlacePreviewCard: {
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10
    },
    mapPlacePreviewBody: {
        flex: 1,
        minWidth: 0,
        marginRight: theme.spacing.sm
    },
    mapPlacePreviewTitle: {
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    mapPlacePreviewAddress: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    mapPlacePreviewButton: {
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    mapPlacePreviewButtonDisabled: {
        opacity: 0.52
    },
    mapPlacePreviewButtonText: {
        color: '#ffffff',
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.bold
    },
    mapZoomControlsWrap: {
        position: 'absolute',
        right: theme.spacing.md
    },
    mapZoomControls: {
        width: 44,
        borderRadius: theme.radius.full,
        overflow: 'hidden',
        backgroundColor: theme.colors.surface,
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10
    },
    mapZoomButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center'
    },
    mapZoomDivider: {
        height: StyleSheet.hairlineWidth,
        marginHorizontal: theme.spacing.xs,
        backgroundColor: theme.colors.border
    },
    mapModeFabButton: {
        width: 44,
        height: 44,
        borderRadius: theme.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        shadowColor: '#000000',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10
    },
    mapModeFabButtonDisabled: {
        opacity: 0.52
    },
    manualConfirmButton: {
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent,
        shadowColor: '#000000',
        shadowOpacity: 0.22,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 10
    },
    manualConfirmButtonDisabled: {
        opacity: 0.5
    },
    manualConfirmButtonText: {
        marginLeft: theme.spacing.xs,
        color: '#ffffff',
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    buttonPressed: {
        opacity: 0.86
    }
});
