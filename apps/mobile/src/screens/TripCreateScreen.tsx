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
import type { MobileTripCreatePlace, PlanPurpose } from '@/types/trip';
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
type TripCreateStepKey = 'purpose' | 'place' | 'dates';
type DestinationScope = 'international' | 'domestic' | 'capitalArea' | 'nonCapitalArea';
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
    planPurpose: PlanPurpose;
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
    id: Extract<DestinationScope, 'international' | 'domestic'>;
    label: string;
}>;
const DESTINATION_SCOPE_DISPLAY_ORDER: Record<DestinationScope, number> = {
    domestic: 0,
    international: 1,
    capitalArea: 0,
    nonCapitalArea: 1
};
const TRIP_SCOPE_OPTIONS = [...DESTINATION_SCOPE_OPTIONS]
    .sort((left, right) => (
        DESTINATION_SCOPE_DISPLAY_ORDER[left.id] - DESTINATION_SCOPE_DISPLAY_ORDER[right.id]
    ));
const DATE_SCOPE_OPTIONS: Array<{
    id: Extract<DestinationScope, 'capitalArea' | 'nonCapitalArea'>;
    label: string;
}> = [
    { id: 'capitalArea', label: '수도권' },
    { id: 'nonCapitalArea', label: '비수도권' }
];
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
    ],
    capitalArea: [
        { id: 'seoul-hotplace', label: '서울 핫플' },
        { id: 'incheon-gyeonggi', label: '근교 데이트' }
    ],
    nonCapitalArea: [
        { id: 'metro-hotplace', label: '광역시' },
        { id: 'local-date', label: '로컬 데이트' }
    ]
};
const DEFAULT_DESTINATION_TAG_BY_SCOPE: Record<DestinationScope, string> = {
    international: 'featured',
    domestic: 'featured',
    capitalArea: 'featured',
    nonCapitalArea: 'featured'
};
const DEFAULT_DESTINATION_SCOPE: DestinationScope = 'domestic';
const DEFAULT_DATE_DESTINATION_SCOPE: DestinationScope = 'capitalArea';
const POPULAR_DESTINATION_LIMIT = 12;
const POPULAR_DESTINATION_PREFETCH_LIMIT = 5;
const POPULAR_DESTINATION_IMAGE_TIMEOUT_MS = 5000;
const POPULAR_DESTINATION_CATEGORY_SAMPLE_SIZE = 3;
const DATE_DESTINATION_IMAGE_BASE_URL = 'https://plin-db93d.web.app/images/trip-destinations';
const DATE_DESTINATION_IMAGE_ASSET_VERSION = '2026-04-20';

function createDateDestinationImageUrl(imageId: string) {
    const safeImageId = String(imageId || 'default').trim() || 'default';
    return `${DATE_DESTINATION_IMAGE_BASE_URL}/${safeImageId}.jpg?v=${DATE_DESTINATION_IMAGE_ASSET_VERSION}`;
}

const DATE_DESTINATION_IMAGE_ID_BY_ID: Record<string, string> = {
    'date-seongsu': 'seoul',
    'date-hongdae': 'seoul',
    'date-yongsan': 'seoul',
    'date-jongno': 'seoul',
    'date-wolmido': 'incheon',
    'date-suwon-haenggung': 'suwon',
    'date-jamsil-seokchon': 'seoul',
    'date-coex-bon': 'seoul',
    'date-yeouido-hangang': 'seoul',
    'date-mangwon': 'seoul',
    'date-sinsa-garosu': 'seoul',
    'date-seochon-bukchon': 'seoul',
    'date-hannam': 'seoul',
    'date-songdo': 'incheon',
    'date-paju-heyri': 'paju',
    'date-yangpyeong-dumulmeori': 'yangpyeong',
    'date-gwacheon-grandpark': 'seoul',
    'date-ilsan-lakepark': 'goyang',
    'date-busan-jeonpo': 'busan',
    'date-daegu-dongseongro': 'daegu',
    'date-daejeon-euneungjeongi': 'daejeon',
    'date-jeonju-hanok': 'jeonju',
    'date-gyeongju-hwangnidan': 'gyeongju',
    'date-gangneung': 'gangneung',
    'date-busan-gwangalli': 'busan',
    'date-daegu-suseongmot': 'daegu',
    'date-daejeon-expo': 'daejeon',
    'date-gwangju-yangnim': 'gwangju',
    'date-ulsan-taehwagang': 'ulsan',
    'date-yeosu-nightsea': 'yeosu',
    'date-chuncheon': 'chuncheon',
    'date-sokcho': 'sokcho',
    'date-pohang-yeongildae': 'pohang',
    'date-jeju-aewol': 'aewol',
    'date-tongyeong': 'tongyeong'
};

const RAW_DATE_POPULAR_DESTINATIONS: PopularTripDestination[] = [
    {
        id: 'date-seongsu',
        name: '성수',
        subtitle: '카페, 편집숍, 서울숲 산책',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['성수동', '서울숲', '카페', '편집숍', '핫플'],
        latitude: 37.5446,
        longitude: 127.0557,
        countryCode: 'KR'
    },
    {
        id: 'date-hongdae',
        name: '홍대',
        subtitle: '공연, 맛집, 연남 산책',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['홍대입구', '연남동', '공연', '맛집', '데이트'],
        latitude: 37.5571,
        longitude: 126.9254,
        countryCode: 'KR'
    },
    {
        id: 'date-yongsan',
        name: '용산',
        subtitle: '전시, 공원, 이태원 코스',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['용산', '국립중앙박물관', '이태원', '전시', '공원'],
        latitude: 37.5299,
        longitude: 126.9648,
        countryCode: 'KR'
    },
    {
        id: 'date-jongno',
        name: '종로',
        subtitle: '익선동, 북촌, 고궁 산책',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['종로', '익선동', '북촌', '고궁', '서촌'],
        latitude: 37.5735,
        longitude: 126.9789,
        countryCode: 'KR'
    },
    {
        id: 'date-wolmido',
        name: '월미도',
        subtitle: '바다, 놀이공원, 노을 코스',
        scope: 'capitalArea',
        categoryId: 'incheon-gyeonggi',
        keywords: ['월미도', '인천', '바다', '노을', '놀이공원'],
        latitude: 37.4754,
        longitude: 126.5965,
        countryCode: 'KR'
    },
    {
        id: 'date-suwon-haenggung',
        name: '수원 행궁동',
        subtitle: '골목 카페, 화성 산책',
        scope: 'capitalArea',
        categoryId: 'incheon-gyeonggi',
        keywords: ['수원', '행궁동', '화성', '카페', '산책'],
        latitude: 37.2819,
        longitude: 127.0142,
        countryCode: 'KR'
    },
    {
        id: 'date-jamsil-seokchon',
        name: '잠실 석촌호수',
        subtitle: '호수 산책, 롯데월드타워, 야경',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['잠실', '석촌호수', '롯데월드타워', '야경', '데이트'],
        latitude: 37.5112,
        longitude: 127.0982,
        countryCode: 'KR'
    },
    {
        id: 'date-coex-bon',
        name: '코엑스',
        subtitle: '별마당도서관, 전시, 쇼핑',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['코엑스', '별마당도서관', '삼성동', '전시', '쇼핑'],
        latitude: 37.5118,
        longitude: 127.0592,
        countryCode: 'KR'
    },
    {
        id: 'date-yeouido-hangang',
        name: '여의도 한강',
        subtitle: '한강공원, 더현대, 피크닉',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['여의도', '한강공원', '더현대서울', '피크닉', '노을'],
        latitude: 37.5263,
        longitude: 126.9338,
        countryCode: 'KR'
    },
    {
        id: 'date-mangwon',
        name: '망원',
        subtitle: '망리단길, 시장, 한강 산책',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['망원동', '망리단길', '망원시장', '한강', '카페'],
        latitude: 37.5568,
        longitude: 126.9046,
        countryCode: 'KR'
    },
    {
        id: 'date-sinsa-garosu',
        name: '신사 가로수길',
        subtitle: '브런치, 쇼룸, 도산공원',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['신사', '가로수길', '도산공원', '브런치', '쇼룸'],
        latitude: 37.5214,
        longitude: 127.0227,
        countryCode: 'KR'
    },
    {
        id: 'date-seochon-bukchon',
        name: '서촌·북촌',
        subtitle: '고궁, 한옥길, 작은 전시',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['서촌', '북촌', '경복궁', '한옥', '전시'],
        latitude: 37.5815,
        longitude: 126.9830,
        countryCode: 'KR'
    },
    {
        id: 'date-hannam',
        name: '한남',
        subtitle: '갤러리, 카페, 리움 산책',
        scope: 'capitalArea',
        categoryId: 'seoul-hotplace',
        keywords: ['한남동', '리움', '갤러리', '카페', '이태원'],
        latitude: 37.5345,
        longitude: 127.0006,
        countryCode: 'KR'
    },
    {
        id: 'date-songdo',
        name: '송도 센트럴파크',
        subtitle: '수변 산책, 야경, 쇼핑',
        scope: 'capitalArea',
        categoryId: 'incheon-gyeonggi',
        keywords: ['송도', '센트럴파크', '인천', '야경', '수변'],
        latitude: 37.3925,
        longitude: 126.6380,
        countryCode: 'KR'
    },
    {
        id: 'date-paju-heyri',
        name: '파주 헤이리',
        subtitle: '갤러리, 책방, 근교 드라이브',
        scope: 'capitalArea',
        categoryId: 'incheon-gyeonggi',
        keywords: ['파주', '헤이리', '출판단지', '갤러리', '드라이브'],
        latitude: 37.7882,
        longitude: 126.6992,
        countryCode: 'KR'
    },
    {
        id: 'date-yangpyeong-dumulmeori',
        name: '양평 두물머리',
        subtitle: '강변 산책, 연꽃, 근교 나들이',
        scope: 'capitalArea',
        categoryId: 'incheon-gyeonggi',
        keywords: ['양평', '두물머리', '강변', '연꽃', '근교'],
        latitude: 37.5374,
        longitude: 127.3103,
        countryCode: 'KR'
    },
    {
        id: 'date-gwacheon-grandpark',
        name: '과천 서울대공원',
        subtitle: '동물원, 미술관, 공원 산책',
        scope: 'capitalArea',
        categoryId: 'incheon-gyeonggi',
        keywords: ['과천', '서울대공원', '국립현대미술관', '공원', '동물원'],
        latitude: 37.4275,
        longitude: 127.0197,
        countryCode: 'KR'
    },
    {
        id: 'date-ilsan-lakepark',
        name: '일산 호수공원',
        subtitle: '호수 산책, 라페스타, 노을',
        scope: 'capitalArea',
        categoryId: 'incheon-gyeonggi',
        keywords: ['일산', '호수공원', '라페스타', '노을', '산책'],
        latitude: 37.6546,
        longitude: 126.7680,
        countryCode: 'KR'
    },
    {
        id: 'date-busan-jeonpo',
        name: '부산 전포',
        subtitle: '전포카페거리, 서면 맛집',
        scope: 'nonCapitalArea',
        categoryId: 'metro-hotplace',
        keywords: ['부산', '전포', '서면', '카페거리', '맛집'],
        latitude: 35.1577,
        longitude: 129.0631,
        countryCode: 'KR'
    },
    {
        id: 'date-daegu-dongseongro',
        name: '대구 동성로',
        subtitle: '쇼핑, 맛집, 근대골목',
        scope: 'nonCapitalArea',
        categoryId: 'metro-hotplace',
        keywords: ['대구', '동성로', '쇼핑', '맛집', '근대골목'],
        latitude: 35.8696,
        longitude: 128.5961,
        countryCode: 'KR'
    },
    {
        id: 'date-daejeon-euneungjeongi',
        name: '대전 은행동',
        subtitle: '성심당, 원도심 산책',
        scope: 'nonCapitalArea',
        categoryId: 'metro-hotplace',
        keywords: ['대전', '은행동', '성심당', '원도심', '데이트'],
        latitude: 36.3274,
        longitude: 127.4285,
        countryCode: 'KR'
    },
    {
        id: 'date-jeonju-hanok',
        name: '전주 한옥마을',
        subtitle: '한옥길, 야경, 먹거리',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['전주', '한옥마을', '야경', '먹거리', '산책'],
        latitude: 35.8151,
        longitude: 127.1532,
        countryCode: 'KR'
    },
    {
        id: 'date-gyeongju-hwangnidan',
        name: '경주 황리단길',
        subtitle: '감성 골목, 카페, 유적 산책',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['경주', '황리단길', '카페', '유적', '감성'],
        latitude: 35.8382,
        longitude: 129.2114,
        countryCode: 'KR'
    },
    {
        id: 'date-gangneung',
        name: '강릉',
        subtitle: '바다, 커피거리, 노을',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['강릉', '안목해변', '커피거리', '바다', '노을'],
        latitude: 37.7519,
        longitude: 128.8761,
        countryCode: 'KR'
    },
    {
        id: 'date-busan-gwangalli',
        name: '부산 광안리',
        subtitle: '바다, 광안대교 야경, 카페',
        scope: 'nonCapitalArea',
        categoryId: 'metro-hotplace',
        keywords: ['부산', '광안리', '광안대교', '바다', '야경'],
        latitude: 35.1532,
        longitude: 129.1187,
        countryCode: 'KR'
    },
    {
        id: 'date-daegu-suseongmot',
        name: '대구 수성못',
        subtitle: '호수 산책, 야경, 카페',
        scope: 'nonCapitalArea',
        categoryId: 'metro-hotplace',
        keywords: ['대구', '수성못', '호수', '야경', '카페'],
        latitude: 35.8293,
        longitude: 128.6215,
        countryCode: 'KR'
    },
    {
        id: 'date-daejeon-expo',
        name: '대전 엑스포과학공원',
        subtitle: '한빛탑, 갑천 산책, 야경',
        scope: 'nonCapitalArea',
        categoryId: 'metro-hotplace',
        keywords: ['대전', '엑스포과학공원', '한빛탑', '갑천', '야경'],
        latitude: 36.3767,
        longitude: 127.3925,
        countryCode: 'KR'
    },
    {
        id: 'date-gwangju-yangnim',
        name: '광주 양림동',
        subtitle: '근대 골목, 펭귄마을, 카페',
        scope: 'nonCapitalArea',
        categoryId: 'metro-hotplace',
        keywords: ['광주', '양림동', '펭귄마을', '근대골목', '카페'],
        latitude: 35.1417,
        longitude: 126.9145,
        countryCode: 'KR'
    },
    {
        id: 'date-ulsan-taehwagang',
        name: '울산 태화강',
        subtitle: '국가정원, 강변 산책, 야경',
        scope: 'nonCapitalArea',
        categoryId: 'metro-hotplace',
        keywords: ['울산', '태화강', '국가정원', '강변', '야경'],
        latitude: 35.5487,
        longitude: 129.3009,
        countryCode: 'KR'
    },
    {
        id: 'date-yeosu-nightsea',
        name: '여수 밤바다',
        subtitle: '해상케이블카, 낭만포차, 야경',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['여수', '밤바다', '해상케이블카', '낭만포차', '야경'],
        latitude: 34.7407,
        longitude: 127.7444,
        countryCode: 'KR'
    },
    {
        id: 'date-chuncheon',
        name: '춘천',
        subtitle: '의암호, 레고랜드, 소양강',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['춘천', '의암호', '소양강', '레고랜드', '닭갈비'],
        latitude: 37.8813,
        longitude: 127.7298,
        countryCode: 'KR'
    },
    {
        id: 'date-sokcho',
        name: '속초',
        subtitle: '바다, 중앙시장, 설악산',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['속초', '바다', '중앙시장', '설악산', '카페'],
        latitude: 38.2043,
        longitude: 128.5918,
        countryCode: 'KR'
    },
    {
        id: 'date-pohang-yeongildae',
        name: '포항 영일대',
        subtitle: '해변 산책, 스페이스워크, 야경',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['포항', '영일대', '스페이스워크', '해변', '야경'],
        latitude: 36.0609,
        longitude: 129.3784,
        countryCode: 'KR'
    },
    {
        id: 'date-jeju-aewol',
        name: '제주 애월',
        subtitle: '해안도로, 카페, 노을',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['제주', '애월', '해안도로', '카페', '노을'],
        latitude: 33.4622,
        longitude: 126.3093,
        countryCode: 'KR'
    },
    {
        id: 'date-tongyeong',
        name: '통영',
        subtitle: '동피랑, 케이블카, 바다 전망',
        scope: 'nonCapitalArea',
        categoryId: 'local-date',
        keywords: ['통영', '동피랑', '케이블카', '바다', '전망'],
        latitude: 34.8544,
        longitude: 128.4332,
        countryCode: 'KR'
    }
];
const DATE_POPULAR_DESTINATIONS: PopularTripDestination[] = RAW_DATE_POPULAR_DESTINATIONS.map((destination) => ({
    ...destination,
    imageUrl: createDateDestinationImageUrl(DATE_DESTINATION_IMAGE_ID_BY_ID[destination.id] || 'default')
}));
const POPULAR_DESTINATION_ORDER_BY_ID = new Map([
    ...TRIP_DESTINATION_POPULARITY_LIST.map((entry) => [
        entry.id,
        Number(entry.popularityOrder) || Number.MAX_SAFE_INTEGER
    ] as const),
    ...DATE_POPULAR_DESTINATIONS.map((entry, index) => [entry.id, index + 1] as const)
]);

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
    domestic: buildPopularDestinationCategoryOrder('domestic'),
    capitalArea: buildPopularDestinationCategoryOrder('capitalArea'),
    nonCapitalArea: buildPopularDestinationCategoryOrder('nonCapitalArea')
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
    ],
    capitalArea: [
        {
            id: 'featured',
            label: '인기 핫플',
            categoryIds: POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE.capitalArea
        },
        ...POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE.capitalArea.map((categoryId) => {
            const definition = POPULAR_DESTINATION_CATEGORY_DEFINITIONS_BY_SCOPE.capitalArea
                .find((item) => item.id === categoryId);

            return {
                id: categoryId,
                label: definition?.label || categoryId,
                categoryIds: [categoryId]
            };
        })
    ],
    nonCapitalArea: [
        {
            id: 'featured',
            label: '인기 핫플',
            categoryIds: POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE.nonCapitalArea
        },
        ...POPULAR_DESTINATION_CATEGORY_ORDER_BY_SCOPE.nonCapitalArea.map((categoryId) => {
            const definition = POPULAR_DESTINATION_CATEGORY_DEFINITIONS_BY_SCOPE.nonCapitalArea
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
        key: 'purpose',
        label: '목적',
        title: '어떤 일정을 만들까요?',
        subtitle: '여행과 데이트 중 일정의 목적을 먼저 골라 주세요.'
    },
    {
        key: 'place',
        label: '장소',
        title: '어디로 떠나시나요?',
        subtitle: '검색하거나 아래 인기 여행지 태그에서 골라 보세요.'
    },
    {
        key: 'dates',
        label: '날짜',
        title: '언제 진행하나요?',
        subtitle: '시작일과 종료일을 골라 주세요.'
    }
];
const TRIP_CREATE_DRAFT_STORAGE_KEY = 'plin.mobileWeb.tripCreateDraft';

const PURPOSE_OPTIONS: Array<{
    id: PlanPurpose;
    title: string;
    subtitle: string;
}> = [
    {
        id: 'trip',
        title: '여행',
        subtitle: '도시와 여행지를 중심으로 며칠짜리 일정을 만들어요.'
    },
    {
        id: 'date',
        title: '데이트',
        subtitle: '핫플, 산책, 맛집 중심으로 가벼운 데이트 일정을 만들어요.'
    }
];

function getDefaultDestinationScopeForPurpose(planPurpose: PlanPurpose): DestinationScope {
    return planPurpose === 'date' ? DEFAULT_DATE_DESTINATION_SCOPE : DEFAULT_DESTINATION_SCOPE;
}

function getDestinationScopeOptions(planPurpose: PlanPurpose) {
    return planPurpose === 'date' ? DATE_SCOPE_OPTIONS : TRIP_SCOPE_OPTIONS;
}

function getDestinationsForPurpose(planPurpose: PlanPurpose) {
    return planPurpose === 'date' ? DATE_POPULAR_DESTINATIONS : POPULAR_TRIP_DESTINATIONS;
}

function buildPlanPurposeCopy(planPurpose: PlanPurpose) {
    if (planPurpose === 'date') {
        return {
            locationError: '데이트할 장소를 검색하거나 아래 핫플에서 한 곳 이상 선택해 주세요.',
            placeTitle: '어디서 만날까요?',
            placeSubtitle: '수도권/비수도권 핫플을 고르거나 직접 검색해 보세요.',
            searchPlaceholder: '동네나 핫플을 검색해 보세요',
            emptyTitle: '조건에 맞는 핫플이 아직 없어요.',
            searchToggleTitle: '찾는 장소가 없나요?',
            selectedLabel: '선택한 장소',
            titleSuffix: '데이트',
            creatingLabel: '일정 만드는 중',
            createLabel: '일정 만들기'
        };
    }

    return {
        locationError: '여행지를 검색하거나 아래에서 한 곳 이상 선택해 주세요.',
        placeTitle: '어디로 떠나시나요?',
        placeSubtitle: '검색하거나 아래 인기 여행지 태그에서 골라 보세요.',
        searchPlaceholder: '도시나 장소를 검색해 보세요',
        emptyTitle: '조건에 맞는 인기 여행지가 아직 없어요.',
        searchToggleTitle: '찾는 도시가 없나요?',
        selectedLabel: '선택한 여행지',
        titleSuffix: '여행',
        creatingLabel: '일정 만드는 중',
        createLabel: '일정 만들기'
    };
}

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
    planPurpose,
    location,
    startDate,
    endDate
}: {
    planPurpose: PlanPurpose;
    location: string;
    startDate: string;
    endDate: string;
}): FieldErrorMap {
    if (!location) {
        return {
            location: buildPlanPurposeCopy(planPurpose).locationError,
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
            startDate: planPurpose === 'date'
                ? '날짜는 YYYY-MM-DD 형식으로 입력해 주세요.'
                : '시작일은 YYYY-MM-DD 형식으로 입력해 주세요.',
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
    const [planPurpose, setPlanPurpose] = React.useState<PlanPurpose>('trip');
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
        domestic: DEFAULT_DESTINATION_TAG_BY_SCOPE.domestic,
        capitalArea: DEFAULT_DESTINATION_TAG_BY_SCOPE.capitalArea,
        nonCapitalArea: DEFAULT_DESTINATION_TAG_BY_SCOPE.nonCapitalArea
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

        if (storedDraft.planPurpose === 'trip' || storedDraft.planPurpose === 'date') {
            setPlanPurpose(storedDraft.planPurpose);
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

        if (
            storedDraft.destinationScope === 'domestic'
            || storedDraft.destinationScope === 'international'
            || storedDraft.destinationScope === 'capitalArea'
            || storedDraft.destinationScope === 'nonCapitalArea'
        ) {
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
                ),
                capitalArea: normalizeDestinationTagId(
                    'capitalArea',
                    storedDraft.destinationCategoryByScope.capitalArea
                ),
                nonCapitalArea: normalizeDestinationTagId(
                    'nonCapitalArea',
                    storedDraft.destinationCategoryByScope.nonCapitalArea
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
    const purposeCopy = React.useMemo(() => buildPlanPurposeCopy(planPurpose), [planPurpose]);
    const activeScopeOptions = React.useMemo(() => getDestinationScopeOptions(planPurpose), [planPurpose]);
    const activePopularDestinations = React.useMemo(() => getDestinationsForPurpose(planPurpose), [planPurpose]);

    React.useEffect(() => {
        if (activeScopeOptions.some((option) => option.id === destinationScope)) {
            return;
        }

        setDestinationScope(getDefaultDestinationScopeForPurpose(planPurpose));
    }, [activeScopeOptions, destinationScope, planPurpose]);

    React.useLayoutEffect(() => {
        navigation.setOptions({
            title: activeStep.key === 'dates'
                ? '언제 진행하나요?'
                : activeStep.key === 'place'
                    ? purposeCopy.placeTitle
                    : activeStep.title
        });
    }, [activeStep.key, activeStep.title, navigation, purposeCopy.placeTitle]);

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
            ? `${selectedDestinationNames[0]} 외 ${selectedDestinationNames.length - 1}곳 ${purposeCopy.titleSuffix}`
            : (resolvedLocation ? `${resolvedLocation} ${purposeCopy.titleSuffix}` : '');

        return truncateTripTitle(nextTitle, TRIP_TITLE_MAX_LENGTH);
    }, [purposeCopy.titleSuffix, resolvedLocation, selectedDestinationNames]);

    const representativeSelectedPlace = React.useMemo(() => (
        selectedDestinations[0]?.place || null
    ), [selectedDestinations]);

    const selectedDestinationSummaryText = React.useMemo(() => {
        if (selectedDestinationNames.length <= 3) {
            return selectedDestinationNames.join(', ');
        }

        return `${selectedDestinationNames.slice(0, 3).join(', ')} 외 ${selectedDestinationNames.length - 3}곳`;
    }, [selectedDestinationNames]);

    const effectiveEndDate = React.useMemo(() => (
        planPurpose === 'date' ? startDate.trim() : endDate.trim()
    ), [endDate, planPurpose, startDate]);

    const validationState = React.useMemo(() => buildValidationState({
        planPurpose,
        location: resolvedLocation,
        startDate: startDate.trim(),
        endDate: effectiveEndDate
    }), [effectiveEndDate, planPurpose, resolvedLocation, startDate]);

    const dateStepError = React.useMemo(() => (
        validationState.form || validationState.startDate || validationState.endDate
    ), [validationState.endDate, validationState.form, validationState.startDate]);

    const dateDurationLabel = React.useMemo(() => (
        buildTripDurationLabel(startDate, effectiveEndDate)
    ), [effectiveEndDate, startDate]);

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

        const matchingDestinations = activePopularDestinations
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
    }, [activePopularDestinations, destinationCategoryByScope, destinationScope, locationQuery]);

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
        || planPurpose !== 'trip'
        || selectedDestinations.length > 0
        || currentStepIndex > 0
        || destinationScope !== DEFAULT_DESTINATION_SCOPE
        || destinationCategoryByScope.international !== DEFAULT_DESTINATION_TAG_BY_SCOPE.international
        || destinationCategoryByScope.domestic !== DEFAULT_DESTINATION_TAG_BY_SCOPE.domestic
        || destinationCategoryByScope.capitalArea !== DEFAULT_DESTINATION_TAG_BY_SCOPE.capitalArea
        || destinationCategoryByScope.nonCapitalArea !== DEFAULT_DESTINATION_TAG_BY_SCOPE.nonCapitalArea
    ), [
        currentStepIndex,
        defaultDates.endDate,
        defaultDates.startDate,
        destinationCategoryByScope.capitalArea,
        destinationCategoryByScope.domestic,
        destinationCategoryByScope.international,
        destinationCategoryByScope.nonCapitalArea,
        destinationScope,
        endDate,
        locationQuery,
        planPurpose,
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
            planPurpose,
            locationQuery,
            startDate,
            endDate: effectiveEndDate,
            selectedDestinations,
            currentStepIndex,
            destinationScope,
            destinationCategoryByScope
        } satisfies TripCreateDraftSnapshot);
    }, [
        currentStepIndex,
        destinationCategoryByScope,
        destinationScope,
        effectiveEndDate,
        locationQuery,
        planPurpose,
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

    const handleSelectPlanPurpose = React.useCallback((nextPurpose: PlanPurpose) => {
        if (planPurpose === nextPurpose) {
            return;
        }

        setPlanPurpose(nextPurpose);
        setLocationQuery('');
        setSelectedDestinations([]);
        setSuggestions([]);
        setIsSearchResultsVisible(false);
        setSearchError(null);
        setDestinationScope(getDefaultDestinationScopeForPurpose(nextPurpose));
        if (nextPurpose === 'date') {
            setEndDate(startDate);
        }
    }, [planPurpose, startDate]);

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
        setEndDate(planPurpose === 'date' ? nextStartDate : nextEndDate);
    }, [planPurpose]);

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

        if (activeStep.key === 'purpose') {
            animateToStep(1);
            return;
        }

        if (activeStep.key === 'place') {
            setDidAttemptPlaceStep(true);

            if (validationState.location) {
                return;
            }

            animateToStep(2);
            return;
        }
    }, [activeStep.key, animateToStep, validationState.location]);

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
            setSaveError('일정을 만들려면 로그인 상태를 먼저 확인해 주세요.');
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
                purpose: planPurpose,
                startDate: startDate.trim(),
                endDate: effectiveEndDate,
                coverImage: representativeSelectedPlace?.mapImageUrl || null,
                place: representativeSelectedPlace
            });

            if (!createdTrip) {
                throw new Error('일정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
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
                    : '일정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.'
            );
        } finally {
            setIsSubmitting(false);
        }
    }, [
        effectiveEndDate,
        isLoadingPlaceDetail,
        navigation,
        planPurpose,
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
        if (activeStep.key === 'purpose') {
            return (
                <View style={styles.purposeList}>
                    {PURPOSE_OPTIONS.map((option) => {
                        const isSelected = planPurpose === option.id;

                        return (
                            <Pressable
                                key={option.id}
                                accessibilityRole="button"
                                onPress={() => {
                                    handleSelectPlanPurpose(option.id);
                                }}
                                style={({ pressed }) => [
                                    styles.purposeCard,
                                    isSelected ? styles.purposeCardSelected : null,
                                    pressed ? styles.cardPressed : null
                                ]}
                            >
                                <View style={[
                                    styles.purposeRadio,
                                    isSelected ? styles.purposeRadioSelected : null
                                ]}>
                                    {isSelected ? <View style={styles.purposeRadioDot} /> : null}
                                </View>
                                <View style={styles.purposeCopy}>
                                    <Text style={styles.purposeTitle}>{option.title}</Text>
                                    <Text style={styles.purposeSubtitle}>{option.subtitle}</Text>
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
            );
        }

        if (activeStep.key === 'dates') {
            return (
                <>
                    <DateCalendarInline
                        startDate={startDate}
                        endDate={effectiveEndDate}
                        selectionMode={planPurpose === 'date' ? 'single' : 'range'}
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
                                        <View style={styles.placeHeaderCompact}>
                                            <Text style={styles.placeHeaderTitle}>{purposeCopy.placeTitle}</Text>
                                            <Text style={styles.placeHeaderSubtitle}>{purposeCopy.placeSubtitle}</Text>
                                        </View>
                                        <View style={[styles.fieldBlock, styles.placeFieldBlock]}>
                                            <TextInput
                                                value={locationQuery}
                                                onChangeText={(nextValue) => {
                                                    setLocationQuery(nextValue);
                                                    setIsSearchResultsVisible(false);
                                                }}
                                                placeholder={purposeCopy.searchPlaceholder}
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
                                                {activeScopeOptions.map((option) => (
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
                                            {purposeCopy.emptyTitle}
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
                                                    <Text style={styles.googleMapsLinkTitle}>{purposeCopy.searchToggleTitle}</Text>
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
                            {purposeCopy.selectedLabel} {selectedDestinationCount}곳
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
                                    ? purposeCopy.creatingLabel
                                    : purposeCopy.createLabel
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
    purposeList: {
        marginTop: theme.spacing.md,
        gap: theme.spacing.sm
    },
    purposeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface
    },
    purposeCardSelected: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentSoft
    },
    purposeRadio: {
        width: 24,
        height: 24,
        borderRadius: theme.radius.full,
        borderWidth: 2,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center'
    },
    purposeRadioSelected: {
        borderColor: theme.colors.accent
    },
    purposeRadioDot: {
        width: 10,
        height: 10,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.accent
    },
    purposeCopy: {
        flex: 1,
        minWidth: 0
    },
    purposeTitle: {
        color: theme.colors.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontFamily: theme.fonts.bold
    },
    purposeSubtitle: {
        marginTop: 4,
        color: theme.colors.textSecondary,
        fontSize: 13,
        lineHeight: 19,
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
