import { fetchBackendJson } from '@/services/backend-client';

export type MobileTripListBanner = {
    eyebrow: string;
    title: string;
    body: string;
    ctaLabel: string;
    targetUrl: string;
};

type TripListBannerConfigResponse = {
    mobileTripListBanner?: {
        enabled?: boolean;
        eyebrow?: string;
        title?: string;
        body?: string;
        ctaLabel?: string;
        targetUrl?: string;
    } | null;
};

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeTripListBanner(
    value: TripListBannerConfigResponse['mobileTripListBanner']
): MobileTripListBanner | null {
    if (!value || value.enabled !== true) {
        return null;
    }

    const title = readText(value.title);
    const body = readText(value.body);
    const targetUrl = readText(value.targetUrl);

    if ((!title && !body) || !targetUrl) {
        return null;
    }

    return {
        eyebrow: readText(value.eyebrow) || 'PROMOTION',
        title,
        body,
        ctaLabel: readText(value.ctaLabel) || '자세히 보기',
        targetUrl
    };
}

export async function fetchTripListBanner() {
    const payload = await fetchBackendJson<TripListBannerConfigResponse>('/config', {
        requireAuth: false
    });

    return normalizeTripListBanner(payload?.mobileTripListBanner);
}
