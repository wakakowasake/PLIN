import React from 'react';
import {
    ActivityIndicator,
    Animated,
    FlatList,
    Easing,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAdapters } from '@/adapters/useAdapters';
import {
    DateCalendarInline,
    parseIsoDateInput
} from '@/components/DateCalendarModal';
import { Alert } from '@/feedback';
import {
    isTripCreationEnabled,
    TRIP_CREATION_DISABLED_MESSAGE,
    TRIP_CREATION_DISABLED_TITLE
} from '@/features/trip-creation';
import {
    destinationScopeOptions,
    popularTripDestinations
} from '@shared/features/trips/trip-destinations-data.js';
import { TRIP_TITLE_MAX_LENGTH, truncateTripTitle } from '@shared/features/trips/trip-title.js';
import type { RootStackParamList } from '@/navigation/RootNavigator';
import { publishTripCreated } from '@/state/trip-write-sync';
import {
    fetchTripPlaceDetail,
    searchTripPlaceSuggestions,
    type TripPlaceSuggestion
} from '@/services/trip-place-search';
import { type AppTheme, useAppTheme } from '@/theme';
import type { MobileTripCreatePlace } from '@/types/trip';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    canUseMobileWebSessionStorage,
    readMobileWebSessionJson,
    removeMobileWebSessionValue,
    writeMobileWebSessionJson
} from '@/utils/mobile-web-session';

type Props = NativeStackScreenProps<RootStackParamList, 'TripCreate'>;
type FieldErrorMap = {
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    form: string | null;
};
type TripCreateStepKey = 'place' | 'dates';
type DestinationScope = 'international' | 'domestic';
type PopularTripDestination = {
    id: string;
    name: string;
    subtitle: string;
    scope: DestinationScope;
    categoryId: string;
    imageUrl?: string | null;
    keywords: string[];
    latitude?: number | null;
    longitude?: number | null;
    countryCode?: string;
};
type PopularDestinationTagDefinition = {
    id: string;
    label: string;
    categoryIds: string[];
};
type PopularDestinationCategoryDefinition = {
    id: string;
    label: string;
};
type TripDestinationPopularityEntry = {
    popularityOrder: number;
    name: string;
    id: string;
    filename: string;
    scope: DestinationScope;
    categoryId: string;
    placeholderSeeded: string;
};
type SelectedTripDestination = {
    id: string;
    name: string;
    source: 'popular' | 'search';
    place?: MobileTripCreatePlace | null;
};
type TripCreateDraftSnapshot = {
    locationQuery: string;
    startDate: string;
    endDate: string;
    selectedDestinations: SelectedTripDestination[];
    currentStepIndex: number;
    destinationScope: DestinationScope;
    destinationCategoryByScope: Record<DestinationScope, string>;
};
type PopularDestinationImageStatus = 'idle' | 'loading' | 'loaded' | 'failed';

const POPULAR_TRIP_DESTINATIONS = popularTripDestinations as PopularTripDestination[];
const TRIP_DESTINATION_POPULARITY_LIST = require('../../../../public/static/images/trip-destinations/destination-image-file-list.json') as TripDestinationPopularityEntry[];
const DESTINATION_SCOPE_OPTIONS = destinationScopeOptions as Array<{
    id: DestinationScope;
    label: string;
}>;
const DESTINATION_SCOPE_DISPLAY_ORDER: Record<DestinationScope, number> = {
    domestic: 0,
    international: 1
};
const ORDERED_DESTINATION_SCOPE_OPTIONS = [...DESTINATION_SCOPE_OPTIONS]
    .sort((left, right) => (
        DESTINATION_SCOPE_DISPLAY_ORDER[left.id] - DESTINATION_SCOPE_DISPLAY_ORDER[right.id]
    ));
const POPULAR_DESTINATION_CATEGORY_DEFINITIONS_BY_SCOPE: Record<DestinationScope, PopularDestinationCategoryDefinition[]> = {
    international: [
        { id: 'japan', label: '일본' },
        { id: 'southeast-asia', label: '동남아' },
        { id: 'china-greater', label: '중화권' },
        { id: 'europe', label: '유럽' },
        { id: 'americas-oceania', label: '미주/오세아니아' },
        { id: 'south-asia', label: '남아시아' },
        { id: 'middle-east-central-asia', label: '중동/중앙아시아' },
        { id: 'africa', label: '아프리카' }
    ],
    domestic: [
        { id: 'capital', label: '수도권' },
        { id: 'gangwon', label: '강원' },
        { id: 'chungcheong', label: '충청' },
        { id: 'gyeongsang', label: '부산/경상' },
        { id: 'jeolla', label: '전라' },
        { id: 'jeju', label: '제주' }
    ]
};
const DEFAULT_DESTINATION_TAG_BY_SCOPE: Record<DestinationScope, string> = {
    international: 'featured',
    domestic: 'featured'
};
const DEFAULT_DESTINATION_SCOPE: DestinationScope = 'domestic';
const POPULAR_DESTINATION_LIMIT = 12;
const POPULAR_DESTINATION_PREFETCH_LIMIT = 5;
const POPULAR_DESTINATION_IMAGE_TIMEOUT_MS = 5000;
const POPULAR_DESTINATION_CATEGORY_SAMPLE_SIZE = 3;
const POPULAR_DESTINATION_ORDER_BY_ID = new Map(
    TRIP_DESTINATION_POPULARITY_LIST.map((entry) => [entry.id, Number(entry.popularityOrder) || Number.MAX_SAFE_INTEGER])
);

function buildPopularDestinationCategoryOrder(scope: DestinationScope) {
    const categoryDefinitions = POPULAR_DESTINATION_CATEGORY_DEFINITIONS_BY_SCOPE[scope];
    const fallbackOrderByCategoryId = new Map(
        categoryDefinitions.map((definition, index) => [definition.id, index])
    );
    const ranksByCategoryId = new Map<string, number[]>();

    TRIP_DESTINATION_POPULARITY_LIST.forEach((entry) => {
        if (entry.scope !== scope || !fallbackOrderByCategoryId.has(entry.categoryId)) {
            return;
        }

        const nextRanks = ranksByCategoryId.get(entry.categoryId) || [];
        nextRanks.push(Number(entry.popularityOrder) || Number.MAX_SAFE_INTEGER);
        ranksByCategoryId.set(entry.categoryId, nextRanks);
    });

    // Use each category's top 3 mean rank so buckets with many cities do not
    // automatically outrank buckets whose leading destinations are stronger.
    return categoryDefinitions
        .map((definition) => {
            const sortedRanks = [...(ranksByCategoryId.get(definition.id) || [])]
                .sort((left, right) => left - right);
            const sampledRanks = sortedRanks.slice(0, POPULAR_DESTINATION_CATEGORY_SAMPLE_SIZE);
            const averageRank = sampledRanks.length > 0
                ? sampledRanks.reduce((sum, rank) => sum + rank, 0) / sampledRanks.length
                : Number.MAX_SAFE_INTEGER;

            return {
                id: definition.id,
                averageRank,
                firstRank: sortedRanks[0] ?? Number.MAX_SAFE_INTEGER,
                fallbackOrder: fallbackOrderByCategoryId.get(definition.id) ?? Number.MAX_SAFE_INTEGER
            };
        })
        .sort((left, right) => (
            left.averageRank - right.averageRank
            || left.firstRank - right.firstRank
            || left.fallbackOrder - right.fallbackOrder
        ))
        .map((entry) => entry.id);
}

const POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE: Record<DestinationScope, string[]> = {
    international: buildPopularDestinationCategoryOrder('international'),
    domestic: buildPopularDestinationCategoryOrder('domestic')
};

const POPULAR_DESTINATION_TAG_OPTIONS_BY_SCOPE: Record<DestinationScope, PopularDestinationTagDefinition[]> = {
    international: [
        {
            id: 'featured',
            label: '인기 여행지',
            categoryIds: POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE.international
        },
        ...POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE.international.map((categoryId) => {
            const definition = POPULAR_DESTINATION_CATEGORY_DEFINITIONS_BY_SCOPE.international
                .find((item) => item.id === categoryId);

            return {
                id: categoryId,
                label: definition?.label || categoryId,
                categoryIds: [categoryId]
            };
        })
    ],
    domestic: [
        {
            id: 'featured',
            label: '인기 여행지',
            categoryIds: POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE.domestic
        },
        ...POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE.domestic.map((categoryId) => {
            const definition = POPULAR_DESTINATION_CATEGORY_DEFINITIONS_BY_SCOPE.domestic
                .find((item) => item.id === categoryId);

            return {
                id: categoryId,
                label: definition?.label || categoryId,
                categoryIds: [categoryId]
            };
        })
    ]
};

const TRIP_CREATE_STEPS: Array<{
    key: TripCreateStepKey;
    label: string;
    title: string;
    subtitle: string;
}> = [
    {
        key: 'place',
        label: '장소',
        title: '어디로 떠나시나요?',
        subtitle: '검색하거나 아래 인기 여행지 태그에서 골라 보세요.'
    },
    {
        key: 'dates',
        label: '날짜',
        title: '언제 떠나시나요?',
        subtitle: '출발일과 돌아오는 날을 골라 주세요.'
    }
];
const TRIP_CREATE_DRAFT_STORAGE_KEY = 'plin.mobileWeb.tripCreateDraft';

function normalizeDestinationTagId(scope: DestinationScope, value: string | null | undefined) {
    const normalizedValue = String(value || '').trim();
    const hasMatchingTag = POPULAR_DESTINATION_TAG_OPTIONS_BY_SCOPE[scope].some((tag) => tag.id === normalizedValue);

    if (hasMatchingTag) {
        return normalizedValue;
    }

    return DEFAULT_DESTINATION_TAG_BY_SCOPE[scope];
}

function sortDestinationsByPopularity(destinations: PopularTripDestination[]) {
    return [...destinations].sort((left, right) => (
        (POPULAR_DESTINATION_ORDER_BY_ID.get(left.id) || Number.MAX_SAFE_INTEGER)
        - (POPULAR_DESTINATION_ORDER_BY_ID.get(right.id) || Number.MAX_SAFE_INTEGER)
    ));
}

function buildFeaturedDestinationMix(
    scope: DestinationScope,
    destinations: PopularTripDestination[]
) {
    const categoryOrder = POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE[scope];
    const queues = new Map(
        categoryOrder.map((categoryId) => [categoryId, [] as PopularTripDestination[]])
    );

    sortDestinationsByPopularity(destinations).forEach((destination) => {
        const queue = queues.get(destination.categoryId);
        if (queue) {
            queue.push(destination);
        }
    });

    const mixedDestinations: PopularTripDestination[] = [];

    while (mixedDestinations.length < POPULAR_DESTINATION_LIMIT) {
        let didAppendDestination = false;

        for (const categoryId of categoryOrder) {
            const queue = queues.get(categoryId);
            const nextDestination = queue?.shift();

            if (!nextDestination) {
                continue;
            }

            mixedDestinations.push(nextDestination);
            didAppendDestination = true;

            if (mixedDestinations.length >= POPULAR_DESTINATION_LIMIT) {
                break;
            }
        }

        if (!didAppendDestination) {
            break;
        }
    }

    return mixedDestinations;
}

function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

function buildDefaultDates() {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 2);

    return {
        startDate: formatDateInput(startDate),
        endDate: formatDateInput(endDate)
    };
}

function isIsoDateInput(value: string) {
    return Boolean(parseIsoDateInput(value));
}

function buildValidationState({
    location,
    startDate,
    endDate
}: {
    location: string;
    startDate: string;
    endDate: string;
}): FieldErrorMap {
    if (!location) {
        return {
            location: '여행지를 검색하거나 아래에서 한 곳 이상 선택해 주세요.',
            startDate: null,
            endDate: null,
            form: null
        };
    }

    if (!startDate) {
        return {
            location: null,
            startDate: '시작일을 입력해 주세요.',
            endDate: null,
            form: null
        };
    }

    if (!isIsoDateInput(startDate)) {
        return {
            location: null,
            startDate: '시작일은 YYYY-MM-DD 형식으로 입력해 주세요.',
            endDate: null,
            form: null
        };
    }

    if (!endDate) {
        return {
            location: null,
            startDate: null,
            endDate: '종료일을 입력해 주세요.',
            form: null
        };
    }

    if (!isIsoDateInput(endDate)) {
        return {
            location: null,
            startDate: null,
            endDate: '종료일은 YYYY-MM-DD 형식으로 입력해 주세요.',
            form: null
        };
    }

    if (endDate < startDate) {
        return {
            location: null,
            startDate: null,
            endDate: null,
            form: '종료일은 시작일보다 같거나 뒤여야 해요.'
        };
    }

    return {
        location: null,
        startDate: null,
        endDate: null,
        form: null
    };
}

function buildTripDurationLabel(startDate: string, endDate: string) {
    const safeStartDate = parseIsoDateInput(startDate);
    const safeEndDate = parseIsoDateInput(endDate);

    if (!safeStartDate || !safeEndDate || safeEndDate.getTime() < safeStartDate.getTime()) {
        return '날짜를 다시 확인해 주세요.';
    }

    const totalDays = Math.max(
        1,
        Math.round((safeEndDate.getTime() - safeStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );

    if (totalDays <= 1) {
        return '당일치기';
    }

    return `${totalDays - 1}박 ${totalDays}일`;
}

function normalizePlaceSearchValue(value: string) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}

function matchesPopularDestination(destination: PopularTripDestination, query: string) {
    const normalizedQuery = normalizePlaceSearchValue(query);

    if (!normalizedQuery) {
        return true;
    }

    const haystack = normalizePlaceSearchValue([
        destination.name,
        destination.subtitle,
        ...destination.keywords
    ].join(' '));

    return haystack.includes(normalizedQuery);
}

function buildSuggestionLabel(suggestion: TripPlaceSuggestion) {
    return suggestion.secondaryText || suggestion.description;
}

function buildPopularDestinationSelectionId(destinationId: string) {
    return `popular:${destinationId}`;
}

function buildSearchDestinationSelectionId(placeId: string) {
    return `search:${placeId}`;
}

function buildPopularDestinationPlace(destination: PopularTripDestination): MobileTripCreatePlace | null {
    const latitude = typeof destination.latitude === 'number' && Number.isFinite(destination.latitude)
        ? destination.latitude
        : null;
    const longitude = typeof destination.longitude === 'number' && Number.isFinite(destination.longitude)
        ? destination.longitude
        : null;

    if (latitude === null || longitude === null) {
        return null;
    }

    const countryCode = String(destination.countryCode || '').trim().toUpperCase();

    return {
        placeId: buildPopularDestinationSelectionId(destination.id),
        name: destination.name,
        address: destination.name,
        latitude,
        longitude,
        countryCode: countryCode || undefined,
        mapImageUrl: destination.imageUrl || null,
        photoReference: null
    };
}

function PopularDestinationImage({
    destinationId,
    imageUrl,
    fallbackLabel,
    imageStatus,
    onImageStatusChange,
    styles
}: {
    destinationId: string;
    imageUrl?: string | null;
    fallbackLabel: string;
    imageStatus: PopularDestinationImageStatus;
    onImageStatusChange: (destinationId: string, nextStatus: PopularDestinationImageStatus) => void;
    styles: ReturnType<typeof createStyles>;
}) {
    const safeImageUrl = String(imageUrl || '').trim();
    const imageOpacity = React.useRef(new Animated.Value(imageStatus === 'loaded' ? 1 : 0)).current;

    React.useEffect(() => {
        if (!safeImageUrl) {
            if (imageStatus !== 'failed') {
                onImageStatusChange(destinationId, 'failed');
            }
            return;
        }

        if (imageStatus === 'idle') {
            onImageStatusChange(destinationId, 'loading');
        }
    }, [destinationId, imageStatus, onImageStatusChange, safeImageUrl]);

    React.useEffect(() => {
        if (imageStatus !== 'loading') {
            return undefined;
        }

        const timeoutId = setTimeout(() => {
            onImageStatusChange(destinationId, 'failed');
        }, POPULAR_DESTINATION_IMAGE_TIMEOUT_MS);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [destinationId, imageStatus, onImageStatusChange]);

    React.useEffect(() => {
        if (imageStatus === 'loaded') {
            Animated.timing(imageOpacity, {
                toValue: 1,
                duration: 180,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true
            }).start();
            return;
        }

        imageOpacity.setValue(0);
    }, [imageOpacity, imageStatus]);

    return (
        <View style={styles.destinationImageFrame}>
            <View style={styles.destinationImageFallback}>
                <Text style={styles.destinationImageFallbackText}>
                    {fallbackLabel.slice(0, 1)}
                </Text>
            </View>
            {safeImageUrl && imageStatus !== 'failed' ? (
                <Animated.Image
                    source={{ uri: safeImageUrl }}
                    onLoad={() => {
                        onImageStatusChange(destinationId, 'loaded');
                    }}
                    onError={() => {
                        onImageStatusChange(destinationId, 'failed');
                    }}
                    style={[
                        styles.destinationImage,
                        {
                            opacity: imageOpacity
                        }
                    ]}
                />
            ) : null}
        </View>
    );
}

export function TripCreateScreen({ navigation }: Props) {
    const theme = useAppTheme();
    const styles = React.useMemo(() => createStyles(theme), [theme]);
    const { tripRepository } = useAdapters();
    const { user } = useAuthSession();
    const insets = useSafeAreaInsets();
    const footerInsetStyle = React.useMemo(() => ({
        paddingBottom: insets.bottom + theme.spacing.sm
    }), [insets.bottom, theme.spacing.sm]);
    const defaultDates = React.useMemo(() => buildDefaultDates(), []);
    const [locationQuery, setLocationQuery] = React.useState('');
    const [startDate, setStartDate] = React.useState(defaultDates.startDate);
    const [endDate, setEndDate] = React.useState(defaultDates.endDate);
    const [selectedDestinations, setSelectedDestinations] = React.useState<SelectedTripDestination[]>([]);
    const [suggestions, setSuggestions] = React.useState<TripPlaceSuggestion[]>([]);
    const [isSearchingPlaces, setIsSearchingPlaces] = React.useState(false);
    const [isLoadingPlaceDetail, setIsLoadingPlaceDetail] = React.useState(false);
    const [isSearchResultsVisible, setIsSearchResultsVisible] = React.useState(false);
    const [searchError, setSearchError] = React.useState<string | null>(null);
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [didAttemptPlaceStep, setDidAttemptPlaceStep] = React.useState(false);
    const [didAttemptDateStep, setDidAttemptDateStep] = React.useState(false);
    const [didAttemptCreate, setDidAttemptCreate] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
    const [isStepTransitioning, setIsStepTransitioning] = React.useState(false);
    const [destinationScope, setDestinationScope] = React.useState<DestinationScope>(DEFAULT_DESTINATION_SCOPE);
    const [destinationCategoryByScope, setDestinationCategoryByScope] = React.useState<Record<DestinationScope, string>>({
        international: DEFAULT_DESTINATION_TAG_BY_SCOPE.international,
        domestic: DEFAULT_DESTINATION_TAG_BY_SCOPE.domestic
    });
    const [destinationImageStatusById, setDestinationImageStatusById] = React.useState<Record<string, PopularDestinationImageStatus>>({});
    const searchRequestIdRef = React.useRef(0);
    const sessionTokenRef = React.useRef(`mobile-trip-create-${Date.now().toString(36)}`);
    const stageScrollRef = React.useRef<ScrollView | null>(null);
    const placeListRef = React.useRef<FlatList<PopularTripDestination> | null>(null);
    const prefetchedDestinationImageUrlsRef = React.useRef(new Set<string>());
    const slideTranslateX = React.useRef(new Animated.Value(0)).current;
    const slideOpacity = React.useRef(new Animated.Value(1)).current;
    const backButtonProgress = React.useRef(new Animated.Value(0)).current;
    const hasRestoredDraftRef = React.useRef(false);
    const hasShownTripCreationDisabledAlertRef = React.useRef(false);

    React.useEffect(() => {
        if (isTripCreationEnabled || hasShownTripCreationDisabledAlertRef.current) {
            return;
        }

        hasShownTripCreationDisabledAlertRef.current = true;
        removeMobileWebSessionValue(TRIP_CREATE_DRAFT_STORAGE_KEY);

        Alert.alert(
            TRIP_CREATION_DISABLED_TITLE,
            TRIP_CREATION_DISABLED_MESSAGE,
            [
                {
                    text: '확인',
                    onPress: () => {
                        navigation.replace('TripList');
                    }
                }
            ]
        );
    }, [navigation]);

    React.useEffect(() => {
        if (!canUseMobileWebSessionStorage() || hasRestoredDraftRef.current) {
            return;
        }

        hasRestoredDraftRef.current = true;
        const storedDraft = readMobileWebSessionJson<TripCreateDraftSnapshot>(TRIP_CREATE_DRAFT_STORAGE_KEY);
        if (!storedDraft) {
            return;
        }

        if (typeof storedDraft.locationQuery === 'string') {
            setLocationQuery(storedDraft.locationQuery);
        }

        if (typeof storedDraft.startDate === 'string' && storedDraft.startDate.trim()) {
            setStartDate(storedDraft.startDate.trim());
        }

        if (typeof storedDraft.endDate === 'string' && storedDraft.endDate.trim()) {
            setEndDate(storedDraft.endDate.trim());
        }

        if (Array.isArray(storedDraft.selectedDestinations)) {
            setSelectedDestinations(storedDraft.selectedDestinations);
        }

        if (storedDraft.destinationScope === 'domestic' || storedDraft.destinationScope === 'international') {
            setDestinationScope(storedDraft.destinationScope);
        }

        if (storedDraft.destinationCategoryByScope) {
            setDestinationCategoryByScope({
                international: normalizeDestinationTagId(
                    'international',
                    storedDraft.destinationCategoryByScope.international
                ),
                domestic: normalizeDestinationTagId(
                    'domestic',
                    storedDraft.destinationCategoryByScope.domestic
                )
            });
        }

        const nextStepIndex = Number.isInteger(storedDraft.currentStepIndex)
            ? Math.max(0, Math.min(TRIP_CREATE_STEPS.length - 1, storedDraft.currentStepIndex))
            : 0;

        setCurrentStepIndex(nextStepIndex);
        backButtonProgress.setValue(nextStepIndex > 0 ? 1 : 0);
    }, [backButtonProgress]);

    const activeStep = TRIP_CREATE_STEPS[currentStepIndex];
    const isFinalStep = currentStepIndex === TRIP_CREATE_STEPS.length - 1;
    const isPlaceStep = activeStep.key === 'place';

    React.useLayoutEffect(() => {
        navigation.setOptions({
            title: activeStep.key === 'dates' ? '언제 떠나시나요?' : activeStep.title
        });
    }, [activeStep.key, activeStep.title, navigation]);

    const selectedDestinationNames = React.useMemo(() => (
        selectedDestinations.map((destination) => destination.name.trim()).filter(Boolean)
    ), [selectedDestinations]);

    const selectedDestinationCount = selectedDestinationNames.length;

    const resolvedLocation = React.useMemo(() => {
        if (selectedDestinationNames.length > 0) {
            return selectedDestinationNames.join(', ');
        }

        return locationQuery.trim();
    }, [locationQuery, selectedDestinationNames]);

    const resolvedTitle = React.useMemo(() => {
        const nextTitle = selectedDestinationNames.length > 1
            ? `${selectedDestinationNames[0]} 외 ${selectedDestinationNames.length - 1}곳 여행`
            : (resolvedLocation ? `${resolvedLocation} 여행` : '');

        return truncateTripTitle(nextTitle, TRIP_TITLE_MAX_LENGTH);
    }, [resolvedLocation, selectedDestinationNames]);

    const representativeSelectedPlace = React.useMemo(() => (
        selectedDestinations[0]?.place || null
    ), [selectedDestinations]);

    const selectedDestinationSummaryText = React.useMemo(() => {
        if (selectedDestinationNames.length <= 3) {
            return selectedDestinationNames.join(', ');
        }

        return `${selectedDestinationNames.slice(0, 3).join(', ')} 외 ${selectedDestinationNames.length - 3}곳`;
    }, [selectedDestinationNames]);

    const validationState = React.useMemo(() => buildValidationState({
        location: resolvedLocation,
        startDate: startDate.trim(),
        endDate: endDate.trim()
    }), [endDate, resolvedLocation, startDate]);

    const dateStepError = React.useMemo(() => (
        validationState.form || validationState.startDate || validationState.endDate
    ), [validationState.endDate, validationState.form, validationState.startDate]);

    const dateDurationLabel = React.useMemo(() => (
        buildTripDurationLabel(startDate, endDate)
    ), [endDate, startDate]);

    const backButtonWidth = React.useMemo(() => (
        backButtonProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 88]
        })
    ), [backButtonProgress]);

    const backButtonSpacing = React.useMemo(() => (
        backButtonProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, theme.spacing.xs]
        })
    ), [backButtonProgress, theme.spacing.xs]);

    const backButtonTranslateX = React.useMemo(() => (
        backButtonProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [16, 0]
        })
    ), [backButtonProgress]);

    const filteredPopularDestinations = React.useMemo(() => {
        const activeTagId = normalizeDestinationTagId(
            destinationScope,
            destinationCategoryByScope[destinationScope]
        );
        const activeTag = POPULAR_DESTINATION_TAG_OPTIONS_BY_SCOPE[destinationScope]
            .find((tag) => tag.id === activeTagId);

        if (!activeTag) {
            return [];
        }

        const matchingDestinations = POPULAR_TRIP_DESTINATIONS
            .filter((destination) => {
                if (destination.scope !== destinationScope) {
                    return false;
                }

                if (!activeTag.categoryIds.includes(destination.categoryId)) {
                    return false;
                }

                if (!POPULAR_DESTINATION_ORDER_BY_ID.has(destination.id)) {
                    return false;
                }

                return matchesPopularDestination(destination, locationQuery);
            });

        if (activeTagId === 'featured') {
            return buildFeaturedDestinationMix(destinationScope, matchingDestinations);
        }

        return sortDestinationsByPopularity(matchingDestinations)
            .slice(0, POPULAR_DESTINATION_LIMIT);
    }, [destinationCategoryByScope, destinationScope, locationQuery]);

    const activeDestinationCategories = React.useMemo(() => (
        POPULAR_DESTINATION_TAG_OPTIONS_BY_SCOPE[destinationScope]
    ), [destinationScope]);

    const safePrefetchPopularDestinationImage = React.useCallback((imageUrl?: string | null) => {
        const safeImageUrl = String(imageUrl || '').trim();

        if (!safeImageUrl || prefetchedDestinationImageUrlsRef.current.has(safeImageUrl)) {
            return;
        }

        prefetchedDestinationImageUrlsRef.current.add(safeImageUrl);
        void Image.prefetch(safeImageUrl).catch(() => {});
    }, []);

    React.useEffect(() => {
        filteredPopularDestinations
            .slice(0, POPULAR_DESTINATION_PREFETCH_LIMIT)
            .forEach((destination) => {
                safePrefetchPopularDestinationImage(destination.imageUrl);
            });
    }, [filteredPopularDestinations, safePrefetchPopularDestinationImage]);

    const handleDestinationImageStatusChange = React.useCallback((
        destinationId: string,
        nextStatus: PopularDestinationImageStatus
    ) => {
        setDestinationImageStatusById((currentValue) => {
            if (currentValue[destinationId] === nextStatus) {
                return currentValue;
            }

            return {
                ...currentValue,
                [destinationId]: nextStatus
            };
        });
    }, []);

    const shouldPersistDraft = React.useMemo(() => (
        Boolean(locationQuery.trim())
        || startDate !== defaultDates.startDate
        || endDate !== defaultDates.endDate
        || selectedDestinations.length > 0
        || currentStepIndex > 0
        || destinationScope !== DEFAULT_DESTINATION_SCOPE
        || destinationCategoryByScope.international !== DEFAULT_DESTINATION_TAG_BY_SCOPE.international
        || destinationCategoryByScope.domestic !== DEFAULT_DESTINATION_TAG_BY_SCOPE.domestic
    ), [
        currentStepIndex,
        defaultDates.endDate,
        defaultDates.startDate,
        destinationCategoryByScope.domestic,
        destinationCategoryByScope.international,
        destinationScope,
        endDate,
        locationQuery,
        selectedDestinations.length,
        startDate
    ]);

    React.useEffect(() => {
        if (!canUseMobileWebSessionStorage() || !hasRestoredDraftRef.current) {
            return;
        }

        if (!shouldPersistDraft) {
            removeMobileWebSessionValue(TRIP_CREATE_DRAFT_STORAGE_KEY);
            return;
        }

        writeMobileWebSessionJson(TRIP_CREATE_DRAFT_STORAGE_KEY, {
            locationQuery,
            startDate,
            endDate,
            selectedDestinations,
            currentStepIndex,
            destinationScope,
            destinationCategoryByScope
        } satisfies TripCreateDraftSnapshot);
    }, [
        currentStepIndex,
        destinationCategoryByScope,
        destinationScope,
        endDate,
        locationQuery,
        selectedDestinations,
        shouldPersistDraft,
        startDate
    ]);

    const scrollPlaceStepToTop = React.useCallback(() => {
        requestAnimationFrame(() => {
            if (isPlaceStep) {
                placeListRef.current?.scrollToOffset({
                    offset: 0,
                    animated: false
                });
                return;
            }

            stageScrollRef.current?.scrollTo({
                x: 0,
                y: 0,
                animated: false
            });
        });
    }, [isPlaceStep]);

    React.useEffect(() => {
        const query = locationQuery.trim();

        if (query.length < 2) {
            setSuggestions([]);
            setIsSearchingPlaces(false);
            setIsSearchResultsVisible(false);
            setSearchError(null);
            return;
        }

        const requestId = searchRequestIdRef.current + 1;
        searchRequestIdRef.current = requestId;
        setIsSearchingPlaces(true);
        setSearchError(null);

        const timeoutId = setTimeout(() => {
            void (async () => {
                try {
                    const nextSuggestions = await searchTripPlaceSuggestions(
                        query,
                        sessionTokenRef.current
                    );

                    if (searchRequestIdRef.current !== requestId) {
                        return;
                    }

                    setSuggestions(nextSuggestions);
                } catch (error) {
                    if (searchRequestIdRef.current !== requestId) {
                        return;
                    }

                    setSuggestions([]);
                    setSearchError(
                        error instanceof Error
                            ? error.message
                            : '장소 검색 결과를 불러오지 못했어요.'
                    );
                } finally {
                    if (searchRequestIdRef.current === requestId) {
                        setIsSearchingPlaces(false);
                    }
                }
            })();
        }, 250);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [locationQuery]);

    const animateToStep = React.useCallback((nextStepIndex: number) => {
        if (
            nextStepIndex < 0
            || nextStepIndex >= TRIP_CREATE_STEPS.length
            || nextStepIndex === currentStepIndex
            || isStepTransitioning
        ) {
            return;
        }

        const direction = nextStepIndex > currentStepIndex ? 1 : -1;
        Keyboard.dismiss();
        setIsStepTransitioning(true);
        Animated.timing(backButtonProgress, {
            toValue: nextStepIndex > 0 ? 1 : 0,
            duration: 320,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: false
        }).start();

        Animated.parallel([
            Animated.timing(slideOpacity, {
                toValue: 0,
                duration: 160,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true
            }),
            Animated.timing(slideTranslateX, {
                toValue: direction * -26,
                duration: 160,
                easing: Easing.in(Easing.cubic),
                useNativeDriver: true
            })
        ]).start(({ finished }) => {
            if (!finished) {
                setIsStepTransitioning(false);
                return;
            }

            setCurrentStepIndex(nextStepIndex);
            slideOpacity.setValue(0);
            slideTranslateX.setValue(direction * 26);

            Animated.parallel([
                Animated.timing(slideOpacity, {
                    toValue: 1,
                    duration: 220,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true
                }),
                Animated.timing(slideTranslateX, {
                    toValue: 0,
                    duration: 220,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true
                })
            ]).start(() => {
                setIsStepTransitioning(false);
            });
        });
    }, [backButtonProgress, currentStepIndex, isStepTransitioning, slideOpacity, slideTranslateX]);

    const handleSelectDateRange = React.useCallback((nextStartDate: string, nextEndDate: string) => {
        setStartDate(nextStartDate);
        setEndDate(nextEndDate);
    }, []);

    const handleSelectSuggestion = React.useCallback(async (suggestion: TripPlaceSuggestion) => {
        const selectionId = buildSearchDestinationSelectionId(suggestion.placeId);

        if (selectedDestinations.some((destination) => destination.id === selectionId)) {
            setSelectedDestinations((currentValue) => (
                currentValue.filter((destination) => destination.id !== selectionId)
            ));
            setSearchError(null);
            return;
        }

        setIsLoadingPlaceDetail(true);
        setSearchError(null);

        try {
            const place = await fetchTripPlaceDetail(
                suggestion.placeId,
                sessionTokenRef.current,
                suggestion
            );

            if (!place) {
                throw new Error('선택한 장소 정보를 불러오지 못했어요.');
            }

            setSelectedDestinations((currentValue) => {
                if (currentValue.some((destination) => destination.id === selectionId)) {
                    return currentValue;
                }

                return [
                    ...currentValue,
                    {
                        id: selectionId,
                        name: place.name,
                        source: 'search',
                        place
                    }
                ];
            });
            setLocationQuery('');
            setSuggestions([]);
            setIsSearchResultsVisible(false);
            setSearchError(null);
        } catch (error) {
            setSearchError(
                error instanceof Error
                    ? error.message
                    : '선택한 장소 정보를 불러오지 못했어요.'
            );
        } finally {
            setIsLoadingPlaceDetail(false);
        }
    }, [selectedDestinations]);

    const handleSelectPopularDestination = React.useCallback((destination: PopularTripDestination) => {
        Keyboard.dismiss();
        const selectionId = buildPopularDestinationSelectionId(destination.id);

        setSelectedDestinations((currentValue) => {
            if (currentValue.some((selectedDestination) => selectedDestination.id === selectionId)) {
                return currentValue.filter((selectedDestination) => selectedDestination.id !== selectionId);
            }

            return [
                ...currentValue,
                {
                    id: selectionId,
                    name: destination.name,
                    source: 'popular',
                    place: buildPopularDestinationPlace(destination)
                }
            ];
        });
        setSearchError(null);
    }, []);

    const handleToggleSearchResults = React.useCallback(() => {
        if (locationQuery.trim().length < 2) {
            return;
        }

        setIsSearchResultsVisible((currentValue) => !currentValue);
    }, [locationQuery]);

    const renderPopularDestinationItem = React.useCallback(({ item }: {
        item: PopularTripDestination;
    }) => {
        const isSelected = selectedDestinations.some(
            (selectedDestination) => (
                selectedDestination.id === buildPopularDestinationSelectionId(item.id)
            )
        );

        return (
            <Pressable
                accessibilityRole="button"
                onPress={() => {
                    handleSelectPopularDestination(item);
                }}
                style={({ pressed }) => [
                    styles.destinationRow,
                    isSelected ? styles.destinationRowSelected : null,
                    pressed ? styles.cardPressed : null
                ]}
            >
                <PopularDestinationImage
                    destinationId={item.id}
                    imageUrl={item.imageUrl}
                    fallbackLabel={item.name}
                    imageStatus={destinationImageStatusById[item.id] || 'idle'}
                    onImageStatusChange={handleDestinationImageStatusChange}
                    styles={styles}
                />
                <View style={styles.destinationBody}>
                    <Text style={styles.destinationTitle}>{item.name}</Text>
                    <Text style={styles.destinationSubtitle}>
                        {item.subtitle}
                    </Text>
                </View>
                <View
                    style={[
                        styles.destinationSelectButton,
                        isSelected ? styles.destinationSelectButtonActive : null
                    ]}
                >
                    <Text
                        style={[
                            styles.destinationSelectButtonText,
                            isSelected ? styles.destinationSelectButtonTextActive : null
                        ]}
                    >
                        {isSelected ? '선택됨' : '선택'}
                    </Text>
                </View>
            </Pressable>
        );
    }, [
        destinationImageStatusById,
        handleDestinationImageStatusChange,
        handleSelectPopularDestination,
        selectedDestinations,
        styles
    ]);

    const handleNext = React.useCallback(() => {
        setSaveError(null);

        if (currentStepIndex === 0) {
            setDidAttemptPlaceStep(true);

            if (validationState.location) {
                return;
            }

            animateToStep(1);
            return;
        }
    }, [animateToStep, currentStepIndex, validationState.location]);

    const handleBack = React.useCallback(() => {
        setSaveError(null);
        animateToStep(currentStepIndex - 1);
    }, [animateToStep, currentStepIndex]);

    const handleSubmit = React.useCallback(async () => {
        setDidAttemptCreate(true);
        setDidAttemptDateStep(true);
        setSaveError(null);

        if (!isTripCreationEnabled) {
            setSaveError(TRIP_CREATION_DISABLED_MESSAGE);
            return;
        }

        if (!user?.uid) {
            setSaveError('여행을 만들려면 로그인 상태를 먼저 확인해 주세요.');
            return;
        }

        if (isLoadingPlaceDetail) {
            setSaveError('선택한 장소 정보를 확인하고 있어요. 잠시만 기다려 주세요.');
            return;
        }

        if (
            validationState.location
            || validationState.startDate
            || validationState.endDate
            || validationState.form
        ) {
            return;
        }

        setIsSubmitting(true);

        try {
            const createdTrip = await tripRepository.createTrip(user.uid, {
                title: resolvedTitle,
                location: resolvedLocation,
                startDate: startDate.trim(),
                endDate: endDate.trim(),
                coverImage: representativeSelectedPlace?.mapImageUrl || null,
                place: representativeSelectedPlace
            });

            if (!createdTrip) {
                throw new Error('여행을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
            }

            publishTripCreated(createdTrip);
            removeMobileWebSessionValue(TRIP_CREATE_DRAFT_STORAGE_KEY);
            navigation.replace('TripDetail', {
                tripId: createdTrip.id,
                startInTimelineEditMode: true
            });
        } catch (error) {
            setSaveError(
                error instanceof Error
                    ? error.message
                    : '여행을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
            );
        } finally {
            setIsSubmitting(false);
        }
    }, [
        endDate,
        isLoadingPlaceDetail,
        navigation,
        resolvedLocation,
        resolvedTitle,
        representativeSelectedPlace,
        startDate,
        tripRepository,
        user?.uid,
        validationState.endDate,
        validationState.form,
        validationState.location,
        validationState.startDate
    ]);

    const renderStepBody = () => {
        if (activeStep.key === 'dates') {
            return (
                <>
                    <DateCalendarInline
                        startDate={startDate}
                        endDate={endDate}
                        helperNotice={didAttemptDateStep && dateStepError
                            ? {
                                tone: 'warning',
                                text: dateStepError
                            }
                            : null}
                        onSelectRange={handleSelectDateRange}
                        onDraftRangeChange={handleSelectDateRange}
                    />

                </>
            );
        }

        return null;
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.shell}
        >
            <View style={styles.container}>
                {saveError ? (
                    <View style={[styles.noticeCard, styles.noticeCardWarning, styles.topNoticeCard]}>
                        <Text style={[styles.noticeText, styles.noticeTextWarning]}>{saveError}</Text>
                    </View>
                ) : null}

                <View style={[styles.stageCard, isPlaceStep ? styles.stageCardPlace : null]}>
                    <Animated.View
                        style={[
                            styles.stageAnimatedWrap,
                            {
                                opacity: slideOpacity,
                                transform: [{ translateX: slideTranslateX }]
                            }
                        ]}
                    >
                        {isPlaceStep ? (
                            <FlatList
                                ref={placeListRef}
                                data={filteredPopularDestinations}
                                keyExtractor={(item) => item.id}
                                renderItem={renderPopularDestinationItem}
                                style={styles.stageScroll}
                                contentContainerStyle={[
                                    styles.stageScrollContent,
                                    styles.stageScrollContentPlace
                                ]}
                                ListHeaderComponent={(
                                    <View style={styles.placeStickySection}>
                                        <View style={[styles.fieldBlock, styles.placeFieldBlock]}>
                                            <TextInput
                                                value={locationQuery}
                                                onChangeText={(nextValue) => {
                                                    setLocationQuery(nextValue);
                                                    setIsSearchResultsVisible(false);
                                                }}
                                                placeholder="도시나 장소를 검색해 보세요"
                                                placeholderTextColor={theme.colors.textSecondary}
                                                autoCapitalize="words"
                                                autoCorrect={false}
                                                returnKeyType="next"
                                                onSubmitEditing={handleNext}
                                                style={styles.input}
                                            />
                                            {didAttemptPlaceStep && validationState.location ? (
                                                <Text style={styles.fieldError}>{validationState.location}</Text>
                                            ) : null}
                                        </View>

                                        <View style={styles.placeFilterSection}>
                                            <View style={styles.scopeTabRow}>
                                                {ORDERED_DESTINATION_SCOPE_OPTIONS.map((option) => (
                                                    <Pressable
                                                        key={option.id}
                                                        accessibilityRole="button"
                                                        onPress={() => {
                                                            setDestinationScope(option.id);
                                                            scrollPlaceStepToTop();
                                                        }}
                                                        style={({ pressed }) => [
                                                            styles.scopeTab,
                                                            destinationScope === option.id ? styles.scopeTabActive : null,
                                                            pressed ? styles.cardPressed : null
                                                        ]}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.scopeTabText,
                                                                destinationScope === option.id
                                                                    ? styles.scopeTabTextActive
                                                                    : null
                                                            ]}
                                                        >
                                                            {option.label}
                                                        </Text>
                                                    </Pressable>
                                                ))}
                                            </View>

                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                contentContainerStyle={styles.categoryChipRow}
                                                style={styles.categoryChipScroll}
                                            >
                                                {activeDestinationCategories.map((category) => {
                                                    const isActive = destinationCategoryByScope[destinationScope] === category.id;

                                                    return (
                                                        <Pressable
                                                            key={category.id}
                                                            accessibilityRole="button"
                                                            onPress={() => {
                                                                setDestinationCategoryByScope((currentValue) => ({
                                                                    ...currentValue,
                                                                    [destinationScope]: category.id
                                                                }));
                                                                scrollPlaceStepToTop();
                                                            }}
                                                            style={({ pressed }) => [
                                                                styles.categoryChip,
                                                                isActive ? styles.categoryChipActive : null,
                                                                pressed ? styles.cardPressed : null
                                                            ]}
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.categoryChipText,
                                                                    isActive ? styles.categoryChipTextActive : null
                                                                ]}
                                                            >
                                                                {category.label}
                                                            </Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </ScrollView>
                                        </View>
                                    </View>
                                )}
                                stickyHeaderIndices={[0]}
                                ListEmptyComponent={(
                                    <View style={styles.popularEmptyCard}>
                                        <Text style={styles.popularEmptyTitle}>
                                            조건에 맞는 인기 여행지가 아직 없어요.
                                        </Text>
                                        <Text style={styles.popularEmptySubtitle}>
                                            검색어를 바꾸거나 아래 검색 결과를 확인해 주세요.
                                        </Text>
                                    </View>
                                )}
                                ListFooterComponent={(
                                    <View style={styles.placeScrollContent}>
                                        {locationQuery.trim().length >= 2 ? (
                                            <Pressable
                                                accessibilityRole="button"
                                                onPress={handleToggleSearchResults}
                                                style={({ pressed }) => [
                                                    styles.googleMapsLinkRow,
                                                    pressed ? styles.cardPressed : null
                                                ]}
                                            >
                                                <View style={styles.googleMapsLinkTextWrap}>
                                                    <Text style={styles.googleMapsLinkTitle}>찾는 도시가 없나요?</Text>
                                                    <Text style={styles.googleMapsLinkSubtitle}>
                                                        {isSearchResultsVisible
                                                            ? `"${locationQuery.trim()}" 검색 결과 접기`
                                                            : `"${locationQuery.trim()}" 검색 결과 펼쳐 보기`}
                                                    </Text>
                                                </View>
                                            </Pressable>
                                        ) : null}

                                        {isSearchingPlaces && isSearchResultsVisible ? (
                                            <View style={styles.searchStateRow}>
                                                <ActivityIndicator size="small" color={theme.colors.accent} />
                                                <Text style={styles.searchStateText}>장소를 찾고 있어요.</Text>
                                            </View>
                                        ) : null}

                                        {isSearchResultsVisible && suggestions.length > 0 ? (
                                            <View style={styles.searchResultSection}>
                                                <Text style={styles.searchResultTitle}>검색된 장소</Text>
                                                <View style={styles.destinationList}>
                                                    {suggestions.map((suggestion) => {
                                                        const isSelected = selectedDestinations.some(
                                                            (selectedDestination) => (
                                                                selectedDestination.id === buildSearchDestinationSelectionId(suggestion.placeId)
                                                            )
                                                        );

                                                        return (
                                                            <Pressable
                                                                key={suggestion.placeId}
                                                                accessibilityRole="button"
                                                                onPress={() => {
                                                                    void handleSelectSuggestion(suggestion);
                                                                }}
                                                                style={({ pressed }) => [
                                                                    styles.destinationRow,
                                                                    isSelected ? styles.destinationRowSelected : null,
                                                                    pressed ? styles.cardPressed : null
                                                                ]}
                                                            >
                                                                <View style={styles.destinationImageFallback}>
                                                                    <Text style={styles.destinationImageFallbackText}>
                                                                        {suggestion.primaryText.slice(0, 1)}
                                                                    </Text>
                                                                </View>
                                                                <View style={styles.destinationBody}>
                                                                    <Text style={styles.destinationTitle}>
                                                                        {suggestion.primaryText}
                                                                    </Text>
                                                                    <Text style={styles.destinationSubtitle}>
                                                                        {buildSuggestionLabel(suggestion)}
                                                                    </Text>
                                                                </View>
                                                                <View
                                                                    style={[
                                                                        styles.destinationSelectButton,
                                                                        isSelected
                                                                            ? styles.destinationSelectButtonActive
                                                                            : null
                                                                    ]}
                                                                >
                                                                    <Text
                                                                        style={[
                                                                            styles.destinationSelectButtonText,
                                                                            isSelected
                                                                                ? styles.destinationSelectButtonTextActive
                                                                                : null
                                                                        ]}
                                                                    >
                                                                        {isSelected ? '선택됨' : '선택'}
                                                                    </Text>
                                                                </View>
                                                            </Pressable>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        ) : null}

                                        {isSearchResultsVisible
                                            && !isSearchingPlaces
                                            && !searchError
                                            && locationQuery.trim().length >= 2
                                            && suggestions.length === 0 ? (
                                                <View style={styles.popularEmptyCard}>
                                                    <Text style={styles.popularEmptyTitle}>
                                                        검색 결과가 없어요.
                                                    </Text>
                                                    <Text style={styles.popularEmptySubtitle}>
                                                        다른 검색어로 다시 찾아보세요.
                                                    </Text>
                                                </View>
                                            ) : null}

                                        {searchError ? (
                                            <View style={[styles.noticeCard, styles.noticeCardWarning]}>
                                                <Text style={[styles.noticeText, styles.noticeTextWarning]}>
                                                    {searchError}
                                                </Text>
                                            </View>
                                        ) : null}

                                        {isLoadingPlaceDetail ? (
                                            <View style={styles.searchStateRow}>
                                                <ActivityIndicator size="small" color={theme.colors.accent} />
                                                <Text style={styles.searchStateText}>
                                                    선택한 장소 정보를 확인하고 있어요.
                                                </Text>
                                            </View>
                                        ) : null}
                                    </View>
                                )}
                                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                                initialNumToRender={12}
                                maxToRenderPerBatch={12}
                                updateCellsBatchingPeriod={48}
                                windowSize={7}
                                removeClippedSubviews={Platform.OS === 'android'}
                            />
                        ) : (
                            <ScrollView
                                ref={stageScrollRef}
                                style={styles.stageScroll}
                                contentContainerStyle={[
                                    styles.stageScrollContent,
                                    activeStep.key === 'dates'
                                        ? styles.stageScrollContentDates
                                        : styles.stageScrollContentDefault
                                ]}
                                keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {activeStep.key === 'dates' ? (
                                    <View style={[styles.stepHeaderCompact, styles.stepHeaderDates]}>
                                        <Text style={styles.stepHeaderTitle}>{activeStep.title}</Text>
                                        <View style={styles.dateDurationPill}>
                                            <Text style={styles.dateDurationText}>{dateDurationLabel}</Text>
                                        </View>
                                    </View>
                                ) : (
                                    <View style={styles.stepHeaderCompact}>
                                        <Text style={styles.stepHeaderTitle}>{activeStep.title}</Text>
                                        <Text style={styles.stepHeaderSubtitle}>{activeStep.subtitle}</Text>
                                    </View>
                                )}

                                {renderStepBody()}
                            </ScrollView>
                        )}
                    </Animated.View>
                </View>

                {isPlaceStep && selectedDestinationCount > 0 ? (
                    <View style={styles.selectionSummaryBar}>
                        <Text style={styles.selectionSummaryTitle}>
                            선택한 여행지 {selectedDestinationCount}곳
                        </Text>
                        <Text style={styles.selectionSummarySubtitle}>
                            {selectedDestinationSummaryText}
                        </Text>
                    </View>
                ) : null}

                <View
                    style={[
                        styles.footerBar,
                        footerInsetStyle
                    ]}
                >
                    <Animated.View
                        pointerEvents={currentStepIndex > 0 ? 'auto' : 'none'}
                        style={[
                            styles.backButtonSlot,
                            {
                                width: backButtonWidth,
                                marginRight: backButtonSpacing,
                                opacity: backButtonProgress,
                                transform: [{ translateX: backButtonTranslateX }]
                            }
                        ]}
                    >
                        <Pressable
                            accessibilityRole="button"
                            disabled={currentStepIndex === 0 || isStepTransitioning || isSubmitting}
                            onPress={handleBack}
                            style={({ pressed }) => [
                                styles.secondaryButton,
                                styles.secondaryButtonFill,
                                (currentStepIndex === 0 || isStepTransitioning || isSubmitting)
                                    ? styles.buttonDisabled
                                    : null,
                                pressed && !(currentStepIndex === 0 || isStepTransitioning || isSubmitting)
                                    ? styles.buttonPressed
                                    : null
                            ]}
                        >
                            <Text style={styles.secondaryButtonText}>이전</Text>
                        </Pressable>
                    </Animated.View>

                    <Pressable
                        accessibilityRole="button"
                        disabled={isStepTransitioning || isSubmitting || isLoadingPlaceDetail}
                        onPress={() => {
                            if (currentStepIndex === TRIP_CREATE_STEPS.length - 1) {
                                void handleSubmit();
                                return;
                            }

                            handleNext();
                        }}
                        style={({ pressed }) => [
                            styles.primaryButton,
                            (isStepTransitioning || isSubmitting || isLoadingPlaceDetail)
                                ? styles.buttonDisabled
                                : null,
                            pressed && !(isStepTransitioning || isSubmitting || isLoadingPlaceDetail)
                                ? styles.buttonPressed
                                : null
                        ]}
                    >
                        <Text style={styles.primaryButtonText}>
                            {isFinalStep
                                ? isSubmitting
                                    ? '여행 만드는 중...'
                                    : '여행 만들기'
                                : '다음'}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
    shell: {
        flex: 1,
        backgroundColor: theme.colors.background
    },
    container: {
        flex: 1,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: 0,
        paddingBottom: theme.spacing.sm,
        backgroundColor: theme.colors.background
    },
    topNoticeCard: {
        marginBottom: theme.spacing.sm
    },
    noticeCard: {
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md
    },
    noticeCardWarning: {
        backgroundColor: theme.colors.warningSoft
    },
    noticeText: {
        color: theme.colors.textPrimary,
        lineHeight: 20,
        fontFamily: theme.fonts.body
    },
    noticeTextWarning: {
        color: theme.colors.warning
    },
    stageCard: {
        flex: 1,
        minHeight: 0,
        overflow: 'hidden'
    },
    stageCardPlace: {
        borderWidth: 0,
        borderRadius: 0,
        backgroundColor: 'transparent'
    },
    stageAnimatedWrap: {
        flex: 1
    },
    stageScroll: {
        flex: 1
    },
    stageScrollContent: {
        flexGrow: 1,
        paddingBottom: theme.spacing.md
    },
    stageScrollContentPlace: {
        paddingHorizontal: 0,
        paddingTop: 0
    },
    stageScrollContentDefault: {
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.md
    },
    stageScrollContentDates: {
        paddingHorizontal: 0,
        paddingTop: theme.spacing.md
    },
    stepHeaderCompact: {
        paddingHorizontal: theme.spacing.sm
    },
    stepHeaderDates: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    stepHeaderTitle: {
        color: theme.colors.textPrimary,
        fontSize: 24,
        lineHeight: 30,
        fontFamily: theme.fonts.display
    },
    stepHeaderSubtitle: {
        marginTop: theme.spacing.xs,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        fontSize: 13,
        fontFamily: theme.fonts.body
    },
    placeStickySection: {
        backgroundColor: theme.colors.background,
        paddingTop: theme.spacing.micro,
        paddingBottom: theme.spacing.micro,
        zIndex: 2
    },
    placeHeaderCompact: {
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.micro
    },
    placeHeaderTitle: {
        color: theme.colors.textPrimary,
        fontSize: 24,
        lineHeight: 30,
        fontFamily: theme.fonts.display
    },
    placeHeaderSubtitle: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    fieldBlock: {
        marginTop: theme.spacing.md
    },
    placeFieldBlock: {
        marginTop: 0,
        paddingHorizontal: theme.spacing.sm,
        paddingBottom: theme.spacing.micro
    },
    label: {
        marginBottom: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        color: theme.colors.textPrimary,
        fontSize: 16,
        fontFamily: theme.fonts.body,
        backgroundColor: theme.mode === 'dark' ? '#241d17' : '#fffaf3'
    },
    supportCard: {
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm
    },
    supportText: {
        color: theme.colors.textSecondary,
        lineHeight: 18,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    placeFilterSection: {
        paddingTop: theme.spacing.micro
    },
    placeScrollContent: {
        paddingTop: theme.spacing.micro
    },
    popularSection: {
        marginTop: theme.spacing.micro
    },
    scopeTabRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        width: '100%',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border
    },
    scopeTab: {
        flex: 1,
        minHeight: 36,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 3,
        borderBottomColor: 'transparent'
    },
    scopeTabActive: {
        borderBottomColor: theme.colors.accent
    },
    scopeTabText: {
        color: theme.colors.textSecondary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    scopeTabTextActive: {
        color: theme.colors.textPrimary
    },
    categoryChipScroll: {
        marginTop: theme.spacing.xs,
        width: '100%'
    },
    categoryChipRow: {
        paddingLeft: 0,
        paddingRight: 0,
        paddingVertical: theme.spacing.xs,
        gap: theme.spacing.xs
    },
    categoryChip: {
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface
    },
    categoryChipActive: {
        backgroundColor: theme.colors.accent
    },
    categoryChipText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    categoryChipTextActive: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#fffdf9'
    },
    destinationList: {
        marginTop: 0
    },
    destinationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        backgroundColor: theme.colors.background
    },
    destinationRowSelected: {
        backgroundColor: theme.colors.surfaceMuted
    },
    destinationImageFrame: {
        width: 72,
        height: 72,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted,
        overflow: 'hidden'
    },
    destinationImage: {
        ...StyleSheet.absoluteFillObject,
        width: 72,
        height: 72,
        borderRadius: theme.radius.full
    },
    destinationImageFallback: {
        width: 72,
        height: 72,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surfaceMuted
    },
    destinationImageFallbackText: {
        color: theme.colors.textSecondary,
        fontSize: 20,
        fontFamily: theme.fonts.bold
    },
    destinationBody: {
        flex: 1,
        minWidth: 0
    },
    destinationTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        fontFamily: theme.fonts.bold
    },
    destinationSubtitle: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    destinationSelectButton: {
        minWidth: 72,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    destinationSelectButtonActive: {
        backgroundColor: theme.colors.accent
    },
    destinationSelectButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 13,
        fontFamily: theme.fonts.semibold
    },
    destinationSelectButtonTextActive: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#fffdf9'
    },
    popularEmptyCard: {
        marginTop: theme.spacing.xs,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    popularEmptyTitle: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    popularEmptySubtitle: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    searchResultSection: {
        marginTop: theme.spacing.sm,
    },
    searchResultTitle: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    googleMapsLinkRow: {
        marginTop: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.xs,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border
    },
    googleMapsLinkTextWrap: {
        flex: 1
    },
    googleMapsLinkTitle: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    googleMapsLinkSubtitle: {
        marginTop: 4,
        color: theme.colors.accent,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    dateCard: {
        marginTop: theme.spacing.md,
        padding: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.mode === 'dark' ? '#241d17' : '#fffaf3'
    },
    cardPressed: {
        opacity: 0.9
    },
    dateCardTopRow: {
        flexDirection: 'row',
        alignItems: 'stretch'
    },
    dateColumn: {
        flex: 1
    },
    dateColumnLabel: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    dateColumnValue: {
        marginTop: theme.spacing.micro,
        color: theme.colors.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        fontFamily: theme.fonts.bold
    },
    dateDivider: {
        width: 1,
        marginHorizontal: theme.spacing.sm,
        backgroundColor: theme.colors.border
    },
    dateCardBottomRow: {
        marginTop: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.xs
    },
    dateDurationPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        alignSelf: 'flex-end',
        paddingHorizontal: theme.spacing.xs,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.accentSoft
    },
    dateDurationText: {
        color: theme.colors.accent,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    dateCardHint: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        fontFamily: theme.fonts.semibold
    },
    fieldError: {
        marginTop: theme.spacing.xs,
        color: theme.colors.warning,
        lineHeight: 19,
        fontSize: 12,
        fontFamily: theme.fonts.body
    },
    searchStateRow: {
        marginTop: theme.spacing.sm,
        flexDirection: 'row',
        alignItems: 'center'
    },
    searchStateText: {
        marginLeft: theme.spacing.micro,
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontFamily: theme.fonts.body
    },
    selectionSummaryBar: {
        marginTop: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.accentSoft
    },
    selectionSummaryTitle: {
        color: theme.colors.accent,
        fontSize: 14,
        fontFamily: theme.fonts.bold
    },
    selectionSummarySubtitle: {
        marginTop: 4,
        color: theme.colors.textPrimary,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: theme.fonts.body
    },
    footerBar: {
        marginTop: theme.spacing.xs,
        flexDirection: 'row',
        alignItems: 'center'
    },
    backButtonSlot: {
        overflow: 'hidden'
    },
    secondaryButton: {
        minWidth: 88,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceMuted
    },
    secondaryButtonFill: {
        width: '100%'
    },
    secondaryButtonText: {
        color: theme.colors.textPrimary,
        fontSize: 14,
        fontFamily: theme.fonts.semibold
    },
    primaryButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.accent
    },
    primaryButtonText: {
        color: theme.mode === 'dark' ? '#2b1c12' : '#fffdf9',
        fontSize: 15,
        fontFamily: theme.fonts.bold
    },
    buttonPressed: {
        opacity: 0.88
    },
    buttonDisabled: {
        opacity: 0.55
    }
});
