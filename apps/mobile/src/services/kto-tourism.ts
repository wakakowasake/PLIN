import { fetchBackendJson } from '@/services/backend-client';

const KTO_TOURISM_ERROR_MESSAGE = '한국관광공사 관광정보를 불러오지 못했어요.';
const KTO_RELATED_DESTINATIONS_ERROR_MESSAGE = '한국관광공사 연관 관광지 정보를 불러오지 못했어요.';

type KtoOpenDataSource = {
    provider?: string;
    dataset?: string;
    operation?: string;
    publicDataPk?: string;
};

export type KtoTourismPlace = {
    id: string;
    source: 'kto';
    dataset: string;
    contentId: string;
    contentTypeId: string;
    title: string;
    address: string;
    tel: string;
    firstImage: string;
    thumbnailImage: string;
    latitude: number | null;
    longitude: number | null;
    areaCode: string;
    sigunguCode: string;
    lDongRegnCd: string;
    lDongSignguCd: string;
    category1: string;
    category2: string;
    category3: string;
    classification1: string;
    classification2: string;
    classification3: string;
    copyrightType: string;
    createdTime: string;
    modifiedTime: string;
    distance: string;
};

export type KtoRelatedDestination = {
    id: string;
    source: 'kto';
    dataset: string;
    baseYm: string;
    rank: number | null;
    touristSpotCode: string;
    touristSpotName: string;
    areaCode: string;
    areaName: string;
    sigunguCode: string;
    sigunguName: string;
    relatedTouristSpotCode: string;
    relatedTouristSpotName: string;
    relatedAreaCode: string;
    relatedAreaName: string;
    relatedSigunguCode: string;
    relatedSigunguName: string;
    relatedCategoryLarge: string;
    relatedCategoryMiddle: string;
    relatedCategorySmall: string;
};

export type KtoTourismImage = {
    imageName: string;
    originUrl: string;
    smallUrl: string;
    serialNumber: string;
    copyrightType: string;
};

export type KtoTourismListResult = {
    items: KtoTourismPlace[];
    pageNo: number;
    numOfRows: number;
    totalCount: number;
    source: KtoOpenDataSource | null;
};

export type KtoRelatedDestinationsResult = {
    items: KtoRelatedDestination[];
    pageNo: number;
    numOfRows: number;
    totalCount: number;
    source: KtoOpenDataSource | null;
};

export type KtoTourismDetailsResult = {
    provider?: string;
    dataset?: string;
    publicDataPk?: string;
    contentId: string;
    contentTypeId: string;
    common: Record<string, string> | null;
    intro: Record<string, string> | null;
    info: Array<Record<string, string>>;
    images: KtoTourismImage[];
};

type KtoTourismListResponse = {
    configured?: boolean;
    message?: string;
    items?: KtoTourismPlace[];
    pageNo?: number;
    numOfRows?: number;
    totalCount?: number;
    source?: KtoOpenDataSource;
};

type KtoRelatedDestinationsResponse = {
    configured?: boolean;
    message?: string;
    items?: KtoRelatedDestination[];
    pageNo?: number;
    numOfRows?: number;
    totalCount?: number;
    source?: KtoOpenDataSource;
};

export type SearchKtoTourismPlacesParams = {
    keyword: string;
    pageNo?: number;
    numOfRows?: number;
    arrange?: string;
    contentTypeId?: string | number;
    areaCode?: string | number;
    sigunguCode?: string | number;
    cat1?: string;
    cat2?: string;
    cat3?: string;
    modifiedtime?: string | number;
    lDongRegnCd?: string | number;
    lDongSignguCd?: string | number;
    lclsSystm1?: string;
    lclsSystm2?: string;
    lclsSystm3?: string;
};

export type FetchKtoTourismAreaPlacesParams = Omit<SearchKtoTourismPlacesParams, 'keyword'>;

export type FetchKtoTourismDetailsParams = {
    contentId: string | number;
    contentTypeId?: string | number;
};

export type FetchKtoRelatedDestinationsParams = {
    baseYm: string | number;
    areaCode: string | number;
    sigunguCode: string | number;
    pageNo?: number;
    numOfRows?: number;
};

export type SearchKtoRelatedDestinationsParams = FetchKtoRelatedDestinationsParams & {
    keyword: string;
};

function normalizeText(value: string | number | null | undefined) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeDigits(value: string | number | null | undefined) {
    return normalizeText(value).replace(/[^0-9]/g, '');
}

function normalizeBaseYm(value: string | number | null | undefined) {
    const digits = normalizeDigits(value);
    return /^\d{6}$/.test(digits) ? digits : '';
}

function appendOptionalParam(searchParams: URLSearchParams, key: string, value: unknown) {
    const normalizedValue = normalizeText(value as string | number | null | undefined);
    if (normalizedValue) {
        searchParams.set(key, normalizedValue);
    }
}

function appendTourismFilters(searchParams: URLSearchParams, params: FetchKtoTourismAreaPlacesParams) {
    appendOptionalParam(searchParams, 'arrange', params.arrange);
    appendOptionalParam(searchParams, 'contentTypeId', params.contentTypeId);
    appendOptionalParam(searchParams, 'areaCode', params.areaCode);
    appendOptionalParam(searchParams, 'sigunguCode', params.sigunguCode);
    appendOptionalParam(searchParams, 'cat1', params.cat1);
    appendOptionalParam(searchParams, 'cat2', params.cat2);
    appendOptionalParam(searchParams, 'cat3', params.cat3);
    appendOptionalParam(searchParams, 'modifiedtime', params.modifiedtime);
    appendOptionalParam(searchParams, 'lDongRegnCd', params.lDongRegnCd);
    appendOptionalParam(searchParams, 'lDongSignguCd', params.lDongSignguCd);
    appendOptionalParam(searchParams, 'lclsSystm1', params.lclsSystm1);
    appendOptionalParam(searchParams, 'lclsSystm2', params.lclsSystm2);
    appendOptionalParam(searchParams, 'lclsSystm3', params.lclsSystm3);
}

function normalizeTourismListPayload(
    payload: KtoTourismListResponse,
    fallbackPageNo: number,
    fallbackNumOfRows: number
): KtoTourismListResult {
    return {
        items: Array.isArray(payload.items) ? payload.items : [],
        pageNo: Number(payload.pageNo || fallbackPageNo),
        numOfRows: Number(payload.numOfRows || fallbackNumOfRows),
        totalCount: Number(payload.totalCount || 0),
        source: payload.source || null
    };
}

function normalizeRelatedDestinationsPayload(
    payload: KtoRelatedDestinationsResponse,
    fallbackPageNo: number,
    fallbackNumOfRows: number
): KtoRelatedDestinationsResult {
    return {
        items: Array.isArray(payload.items) ? payload.items : [],
        pageNo: Number(payload.pageNo || fallbackPageNo),
        numOfRows: Number(payload.numOfRows || fallbackNumOfRows),
        totalCount: Number(payload.totalCount || 0),
        source: payload.source || null
    };
}

export async function searchKtoTourismPlaces(params: SearchKtoTourismPlacesParams): Promise<KtoTourismListResult> {
    const keyword = normalizeText(params.keyword);
    if (keyword.length < 2) {
        throw new Error('검색어는 2자 이상 입력해 주세요.');
    }

    const pageNo = params.pageNo || 1;
    const numOfRows = params.numOfRows || 20;
    const searchParams = new URLSearchParams({
        keyword,
        pageNo: String(pageNo),
        numOfRows: String(numOfRows)
    });
    appendTourismFilters(searchParams, params);

    try {
        const payload = await fetchBackendJson<KtoTourismListResponse>(
            `/kto/tourism/search?${searchParams.toString()}`
        );
        return normalizeTourismListPayload(payload, pageNo, numOfRows);
    } catch (error) {
        if (error instanceof Error && error.message) {
            throw error;
        }

        throw new Error(KTO_TOURISM_ERROR_MESSAGE);
    }
}

export async function fetchKtoTourismAreaPlaces(
    params: FetchKtoTourismAreaPlacesParams = {}
): Promise<KtoTourismListResult> {
    const pageNo = params.pageNo || 1;
    const numOfRows = params.numOfRows || 20;
    const searchParams = new URLSearchParams({
        pageNo: String(pageNo),
        numOfRows: String(numOfRows)
    });
    appendTourismFilters(searchParams, params);

    try {
        const payload = await fetchBackendJson<KtoTourismListResponse>(
            `/kto/tourism/area?${searchParams.toString()}`
        );
        return normalizeTourismListPayload(payload, pageNo, numOfRows);
    } catch (error) {
        if (error instanceof Error && error.message) {
            throw error;
        }

        throw new Error(KTO_TOURISM_ERROR_MESSAGE);
    }
}

export async function fetchKtoTourismDetails(
    params: FetchKtoTourismDetailsParams
): Promise<KtoTourismDetailsResult> {
    const contentId = normalizeDigits(params.contentId);
    if (!contentId) {
        throw new Error('contentId가 필요해요.');
    }

    const searchParams = new URLSearchParams({
        contentId
    });
    appendOptionalParam(searchParams, 'contentTypeId', params.contentTypeId);

    try {
        return await fetchBackendJson<KtoTourismDetailsResult>(
            `/kto/tourism/details?${searchParams.toString()}`
        );
    } catch (error) {
        if (error instanceof Error && error.message) {
            throw error;
        }

        throw new Error(KTO_TOURISM_ERROR_MESSAGE);
    }
}

export async function fetchKtoRelatedDestinationsByArea(
    params: FetchKtoRelatedDestinationsParams
): Promise<KtoRelatedDestinationsResult> {
    const baseYm = normalizeBaseYm(params.baseYm);
    const areaCode = normalizeDigits(params.areaCode);
    const sigunguCode = normalizeDigits(params.sigunguCode);

    if (!baseYm || !areaCode || !sigunguCode) {
        throw new Error('baseYm, areaCode, sigunguCode가 필요해요.');
    }

    const pageNo = params.pageNo || 1;
    const numOfRows = params.numOfRows || 20;
    const searchParams = new URLSearchParams({
        baseYm,
        areaCd: areaCode,
        signguCd: sigunguCode,
        pageNo: String(pageNo),
        numOfRows: String(numOfRows)
    });

    try {
        const payload = await fetchBackendJson<KtoRelatedDestinationsResponse>(
            `/kto/related-destinations/area?${searchParams.toString()}`
        );
        return normalizeRelatedDestinationsPayload(payload, pageNo, numOfRows);
    } catch (error) {
        if (error instanceof Error && error.message) {
            throw error;
        }

        throw new Error(KTO_RELATED_DESTINATIONS_ERROR_MESSAGE);
    }
}

export async function searchKtoRelatedDestinations(
    params: SearchKtoRelatedDestinationsParams
): Promise<KtoRelatedDestinationsResult> {
    const keyword = normalizeText(params.keyword);
    if (keyword.length < 2) {
        throw new Error('관광지명 검색어는 2자 이상 입력해 주세요.');
    }

    const baseYm = normalizeBaseYm(params.baseYm);
    const areaCode = normalizeDigits(params.areaCode);
    const sigunguCode = normalizeDigits(params.sigunguCode);

    if (!baseYm || !areaCode || !sigunguCode) {
        throw new Error('baseYm, areaCode, sigunguCode가 필요해요.');
    }

    const pageNo = params.pageNo || 1;
    const numOfRows = params.numOfRows || 20;
    const searchParams = new URLSearchParams({
        keyword,
        baseYm,
        areaCd: areaCode,
        signguCd: sigunguCode,
        pageNo: String(pageNo),
        numOfRows: String(numOfRows)
    });

    try {
        const payload = await fetchBackendJson<KtoRelatedDestinationsResponse>(
            `/kto/related-destinations/search?${searchParams.toString()}`
        );
        return normalizeRelatedDestinationsPayload(payload, pageNo, numOfRows);
    } catch (error) {
        if (error instanceof Error && error.message) {
            throw error;
        }

        throw new Error(KTO_RELATED_DESTINATIONS_ERROR_MESSAGE);
    }
}
