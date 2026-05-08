export type AuthProviderAvailability = {
    google: boolean;
    apple: boolean;
    kakao: boolean;
    naver: boolean;
};

const DEFAULT_AUTH_PROVIDER_AVAILABILITY: AuthProviderAvailability = {
    google: false,
    apple: false,
    kakao: false,
    naver: false
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeAuthProviderAvailability(value: unknown): AuthProviderAvailability {
    if (!isPlainObject(value)) {
        return { ...DEFAULT_AUTH_PROVIDER_AVAILABILITY };
    }

    return {
        google: value.google === true,
        apple: value.apple === true,
        kakao: value.kakao === true,
        naver: value.naver === true
    };
}
