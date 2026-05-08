import { getMobileEnv } from '@/config/mobile-runtime-config';
import { fetchBackendJson } from '@/services/backend-client';
import type { MobileTripCreatePlace } from '@/types/trip';

const DEFAULT_BACKEND_URL = 'https://asia-northeast3-plin-db93d.cloudfunctions.net/api';
const BACKEND_URL = getMobileEnv('backendUrl', DEFAULT_BACKEND_URL);
const PLACE_SEARCH_FALLBACK_MESSAGE = '장소 검색은 잠시 사용할 수 없어요. 장소 이름만 입력하고 계속 만들 수 있어요.';
const PLACE_DETAIL_FALLBACK_MESSAGE = '선택한 장소 정보를 가져오지 못했어요. 장소 이름만 입력하고 계속 만들 수 있어요.';
const UNSPLASH_CACHE = new Map<string, string | null>();
const KOREAN_REGION_SUFFIX_PATTERN = /([가-힣]{2,})(특별시|광역시|특별자치시|특별자치도|도|시|군|구|부|현)$/;
const ENGLISH_REGION_KEYWORD_PATTERN = /\b(city|province|prefecture|state|region|district|county|island|islands)\b/i;
const COUNTRY_LABEL_PATTERN = /^(대한민국|한국|일본|미국|japan|south korea|republic of korea|usa|united states)$/i;
const POI_KEYWORD_PATTERN = /\b(airport|station|museum|gallery|hotel|resort|park|tower|temple|shrine|castle|palace|mall|market|beach|bridge|university|school|cafe|restaurant|disney|land|studio|observatory|aquarium|harbor|port)\b|(?:공항|역|박물관|미술관|호텔|리조트|공원|타워|사원|신사|성|궁|몰|시장|해변|비치|대학교|학교|카페|식당|맛집|디즈니|랜드|스카이|전망대|수족관|항구|선착장)/i;

export type TripPlaceSuggestion = {
    placeId: string;
    primaryText: string;
    secondaryText: string;
    description: string;
};

type TripPlaceSuggestionContext = Partial<Pick<TripPlaceSuggestion, 'primaryText' | 'secondaryText' | 'description'>>;

type AutocompleteResponse = {
    predictions?: TripPlaceSuggestion[];
    message?: string;
};

type PlaceDetailResponse = {
    place?: {
        placeId: string;
        name: string;
        address: string;
        latitude: number;
        longitude: number;
        placeTypes?: string[] | null;
        photoReference?: string | null;
    };
    message?: string;
};

type NearbyPlacesResponse = {
    places?: Array<{
        placeId: string;
        name: string;
        address: string;
        latitude: number;
        longitude: number;
        placeTypes?: string[] | null;
        photoReference?: string | null;
    }>;
    message?: string;
};

export type TripPlaceViewportBounds = {
    north: number;
    south: number;
    east: number;
    west: number;
};

type FetchTripPlaceDetailOptions = {
    includePreviewImage?: boolean;
};

type SearchTripPlaceSuggestionsOptions = {
    locationBias?: {
        latitude: number;
        longitude: number;
        radiusMeters?: number;
        strictBounds?: boolean;
    } | null;
};

type SearchTripNearbyPlacesOptions = {
    radiusMeters?: number;
};

type SearchTripPlacesInViewportOptions = {
    bounds: TripPlaceViewportBounds;
};

async function readErrorMessage(response: Response) {
    try {
        const payload = await response.json() as { message?: string };
        return payload.message || '';
    } catch {
        return '';
    }
}

function buildPhotoProxyUrl(photoReference: string) {
    const trimmedReference = String(photoReference || '').trim();

    if (!trimmedReference) {
        return null;
    }

    return `${BACKEND_URL}/google-photo-proxy?reference=${encodeURIComponent(trimmedReference)}&maxwidth=1600`;
}

function normalizeText(value: string | null | undefined) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizePlaceTypes(value: string[] | null | undefined) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((type) => normalizeText(type).toLowerCase())
        .filter(Boolean);
}

function normalizeUnsplashQuery(value: string | null | undefined) {
    const normalized = normalizeText(value);
    if (!normalized) {
        return '';
    }

    const trimmedKoreanRegion = normalized.replace(KOREAN_REGION_SUFFIX_PATTERN, '$1');
    return normalizeText(trimmedKoreanRegion);
}

function looksLikeCountryLabel(value: string) {
    return COUNTRY_LABEL_PATTERN.test(normalizeText(value));
}

function looksLikeRegionLabel(value: string) {
    const normalized = normalizeText(value);
    if (!normalized) {
        return false;
    }

    if (KOREAN_REGION_SUFFIX_PATTERN.test(normalized)) {
        return true;
    }

    return ENGLISH_REGION_KEYWORD_PATTERN.test(normalized);
}

function looksLikePoiLabel(value: string) {
    return POI_KEYWORD_PATTERN.test(normalizeText(value));
}

function countContextParts(value: string) {
    return normalizeText(value)
        .split(',')
        .map((part) => normalizeText(part))
        .filter((part) => Boolean(part) && !looksLikeCountryLabel(part))
        .length;
}

function isProbablyRegionSelection(
    placeName: string,
    address: string,
    suggestion?: TripPlaceSuggestionContext
) {
    const normalizedName = normalizeText(placeName);
    if (!normalizedName) {
        return false;
    }

    if (looksLikeCountryLabel(normalizedName) || looksLikeRegionLabel(normalizedName)) {
        return true;
    }

    if (looksLikePoiLabel(normalizedName)) {
        return false;
    }

    const primaryText = normalizeText(suggestion?.primaryText || '');
    const secondaryText = normalizeText(suggestion?.secondaryText || '');
    const description = normalizeText(suggestion?.description || '');

    if (
        looksLikePoiLabel(primaryText)
        || looksLikePoiLabel(secondaryText)
        || looksLikePoiLabel(description)
        || /\d/.test(normalizedName)
        || /\d/.test(address)
    ) {
        return false;
    }

    const richestContextPartCount = Math.max(
        countContextParts(secondaryText),
        countContextParts(description),
        countContextParts(address)
    );

    if (richestContextPartCount >= 2) {
        return false;
    }

    const wordCount = normalizedName.split(/\s+/).filter(Boolean).length;
    return wordCount <= 2;
}

function buildRegionCandidatesFromTokens(value: string) {
    const source = normalizeText(value);
    if (!source) {
        return [];
    }

    const candidates: string[] = [];
    const seen = new Set<string>();
    const push = (candidate: string) => {
        const normalized = normalizeUnsplashQuery(candidate);
        if (!normalized || normalized.length < 2 || looksLikeCountryLabel(normalized) || seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        candidates.push(normalized);
    };

    const commaParts = source
        .split(',')
        .map((part) => normalizeText(part))
        .filter(Boolean);

    if (commaParts.length > 0) {
        for (let index = commaParts.length - 1; index >= 0; index -= 1) {
            const part = commaParts[index];
            if (/\d/.test(part)) {
                continue;
            }

            push(part);
        }
    }

    for (const token of source.split(/\s+/)) {
        const normalizedToken = normalizeText(token);
        if (!normalizedToken) {
            continue;
        }

        if (looksLikeRegionLabel(normalizedToken)) {
            push(normalizedToken);
        }
    }

    return candidates;
}

function buildUnsplashQueryCandidates(
    placeName: string,
    address: string,
    suggestion?: TripPlaceSuggestionContext
) {
    const candidates: string[] = [];
    const seen = new Set<string>();

    const push = (candidate: string) => {
        const normalized = normalizeUnsplashQuery(candidate);
        if (!normalized || seen.has(normalized)) {
            return;
        }

        seen.add(normalized);
        candidates.push(normalized);
    };

    const normalizedName = normalizeUnsplashQuery(placeName);
    const regionCandidates = [
        ...buildRegionCandidatesFromTokens(suggestion?.secondaryText || ''),
        ...buildRegionCandidatesFromTokens(address)
    ];
    const isRegionPlace = isProbablyRegionSelection(placeName, address, suggestion);

    push(normalizedName);
    push(suggestion?.primaryText || '');
    for (const regionCandidate of regionCandidates.slice(0, 2)) {
        push(`${normalizedName} ${regionCandidate}`);
    }
    push(suggestion?.description || '');

    if (isRegionPlace) {
        for (const regionCandidate of regionCandidates) {
            push(regionCandidate);
        }
    } else {
        for (const regionCandidate of regionCandidates) {
            push(regionCandidate);
        }
    }

    return candidates;
}

type UnsplashSearchResponse = {
    results?: Array<{
        urls?: {
            regular?: string;
            full?: string;
            small?: string;
        };
    }>;
};

async function fetchUnsplashImage(query: string) {
    const normalizedQuery = normalizeUnsplashQuery(query).toLowerCase();
    if (!normalizedQuery) {
        return null;
    }

    if (UNSPLASH_CACHE.has(normalizedQuery)) {
        return UNSPLASH_CACHE.get(normalizedQuery) || null;
    }

    try {
        const payload = await fetchBackendJson<UnsplashSearchResponse>(
            `/unsplash-proxy?query=${encodeURIComponent(normalizedQuery)}`
        );
        const imageUrl = payload.results?.[0]?.urls?.regular
            || payload.results?.[0]?.urls?.full
            || payload.results?.[0]?.urls?.small
            || null;

        UNSPLASH_CACHE.set(normalizedQuery, imageUrl);
        return imageUrl;
    } catch {
        UNSPLASH_CACHE.set(normalizedQuery, null);
        return null;
    }
}

async function resolvePlacePreviewImageUrl(
    placeName: string,
    address: string,
    photoReference?: string | null,
    suggestion?: TripPlaceSuggestionContext
) {
    const shouldPreferGooglePhoto = Boolean(photoReference)
        && !isProbablyRegionSelection(placeName, address, suggestion);

    if (shouldPreferGooglePhoto) {
        return buildPhotoProxyUrl(photoReference as string);
    }

    const queryCandidates = buildUnsplashQueryCandidates(placeName, address, suggestion);
    for (const candidate of queryCandidates) {
        const imageUrl = await fetchUnsplashImage(candidate);
        if (imageUrl) {
            return imageUrl;
        }
    }

    if (photoReference) {
        return buildPhotoProxyUrl(photoReference);
    }

    return null;
}

export async function searchTripPlaceSuggestions(
    query: string,
    sessionToken: string,
    options?: SearchTripPlaceSuggestionsOptions
) {
    const trimmedQuery = String(query || '').trim();
    if (trimmedQuery.length < 2) {
        return [];
    }

    try {
        const searchParams = new URLSearchParams({
            input: trimmedQuery,
            sessionToken
        });
        const locationBias = options?.locationBias;
        const latitude = Number(locationBias?.latitude);
        const longitude = Number(locationBias?.longitude);

        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            searchParams.set('latitude', String(latitude));
            searchParams.set('longitude', String(longitude));
            searchParams.set('radiusMeters', String(locationBias?.radiusMeters || 6000));
            if (locationBias?.strictBounds) {
                searchParams.set('strictBounds', 'true');
            }
        }

        const payload = await fetchBackendJson<AutocompleteResponse>(
            `/places/autocomplete?${searchParams.toString()}`
        );
        return Array.isArray(payload.predictions) ? payload.predictions : [];
    } catch {
        throw new Error(PLACE_SEARCH_FALLBACK_MESSAGE);
    }
}

export async function fetchTripPlaceDetail(
    placeId: string,
    sessionToken: string,
    suggestion?: TripPlaceSuggestionContext,
    options?: FetchTripPlaceDetailOptions
): Promise<MobileTripCreatePlace | null> {
    const trimmedPlaceId = String(placeId || '').trim();
    if (!trimmedPlaceId) {
        return null;
    }

    try {
        const payload = await fetchBackendJson<PlaceDetailResponse>(
            `/places/details?placeId=${encodeURIComponent(trimmedPlaceId)}&sessionToken=${encodeURIComponent(sessionToken)}`
        );
        if (!payload.place) {
            throw new Error(PLACE_DETAIL_FALLBACK_MESSAGE);
        }

        const shouldIncludePreviewImage = options?.includePreviewImage !== false;
        const mapImageUrl = shouldIncludePreviewImage
            ? await resolvePlacePreviewImageUrl(
                payload.place.name,
                payload.place.address,
                payload.place.photoReference || null,
                suggestion
            )
            : null;

        return {
            placeId: payload.place.placeId,
            name: payload.place.name,
            address: payload.place.address,
            latitude: payload.place.latitude,
            longitude: payload.place.longitude,
            placeTypes: normalizePlaceTypes(payload.place.placeTypes),
            photoReference: payload.place.photoReference || null,
            mapImageUrl
        };
    } catch {
        throw new Error(PLACE_DETAIL_FALLBACK_MESSAGE);
    }
}

export async function searchTripNearbyPlaces(
    latitude: number,
    longitude: number,
    options?: SearchTripNearbyPlacesOptions
): Promise<MobileTripCreatePlace[]> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return [];
    }

    try {
        const searchParams = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            radiusMeters: String(options?.radiusMeters || 90)
        });
        const payload = await fetchBackendJson<NearbyPlacesResponse>(
            `/places/nearby?${searchParams.toString()}`
        );

        if (!Array.isArray(payload.places)) {
            return [];
        }

        return payload.places
            .map((place) => ({
                placeId: normalizeText(place.placeId),
                name: normalizeText(place.name),
                address: normalizeText(place.address),
                latitude: Number(place.latitude),
                longitude: Number(place.longitude),
                placeTypes: normalizePlaceTypes(place.placeTypes),
                photoReference: place.photoReference || null,
                mapImageUrl: place.photoReference ? buildPhotoProxyUrl(place.photoReference) : null
            }))
            .filter((place) => (
                Boolean(place.placeId)
                && Boolean(place.name)
                && Number.isFinite(place.latitude)
                && Number.isFinite(place.longitude)
            ));
    } catch {
        throw new Error(PLACE_SEARCH_FALLBACK_MESSAGE);
    }
}

export async function searchTripPlacesInViewport(
    query: string,
    options: SearchTripPlacesInViewportOptions
): Promise<MobileTripCreatePlace[]> {
    const trimmedQuery = normalizeText(query);
    const bounds = options.bounds;

    if (trimmedQuery.length < 2) {
        return [];
    }

    try {
        const searchParams = new URLSearchParams({
            query: trimmedQuery,
            north: String(bounds.north),
            south: String(bounds.south),
            east: String(bounds.east),
            west: String(bounds.west)
        });
        const payload = await fetchBackendJson<NearbyPlacesResponse>(
            `/places/textsearch?${searchParams.toString()}`
        );

        if (!Array.isArray(payload.places)) {
            return [];
        }

        return payload.places
            .map((place) => ({
                placeId: normalizeText(place.placeId),
                name: normalizeText(place.name),
                address: normalizeText(place.address),
                latitude: Number(place.latitude),
                longitude: Number(place.longitude),
                placeTypes: normalizePlaceTypes(place.placeTypes),
                photoReference: place.photoReference || null,
                mapImageUrl: place.photoReference ? buildPhotoProxyUrl(place.photoReference) : null
            }))
            .filter((place) => (
                Boolean(place.placeId)
                && Boolean(place.name)
                && Number.isFinite(place.latitude)
                && Number.isFinite(place.longitude)
            ));
    } catch {
        throw new Error(PLACE_SEARCH_FALLBACK_MESSAGE);
    }
}
