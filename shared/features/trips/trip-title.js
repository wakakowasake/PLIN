export const TRIP_TITLE_RECOMMENDED_LENGTH = 20;
export const TRIP_TITLE_MAX_LENGTH = 30;

let graphemeSegmenter = null;

function getGraphemeSegmenter() {
    if (graphemeSegmenter) {
        return graphemeSegmenter;
    }

    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        graphemeSegmenter = new Intl.Segmenter('ko', {
            granularity: 'grapheme'
        });
        return graphemeSegmenter;
    }

    return null;
}

function toSafeString(value) {
    return String(value ?? '');
}

export function getTripTitleTooLongMessage(maxLength = TRIP_TITLE_MAX_LENGTH) {
    return `여행 제목은 ${maxLength}자 이내로 입력해 주세요.`;
}

export function splitTripTitleGraphemes(value = '') {
    const safeValue = toSafeString(value);
    const segmenter = getGraphemeSegmenter();

    if (!segmenter) {
        return Array.from(safeValue);
    }

    return Array.from(segmenter.segment(safeValue), (entry) => entry.segment);
}

export function countTripTitleLength(value = '') {
    return splitTripTitleGraphemes(value).length;
}

export function truncateTripTitle(value = '', maxLength = TRIP_TITLE_MAX_LENGTH) {
    const safeValue = toSafeString(value);
    const graphemes = splitTripTitleGraphemes(safeValue);

    if (graphemes.length <= maxLength) {
        return safeValue;
    }

    return graphemes.slice(0, maxLength).join('');
}

export function validateTripTitle(value, { required = true, maxLength = TRIP_TITLE_MAX_LENGTH } = {}) {
    const normalizedValue = toSafeString(value).trim();

    if (!normalizedValue) {
        return {
            valid: !required,
            code: required ? 'missing' : 'ok',
            normalizedValue,
            length: 0,
            maxLength,
            message: required ? '여행 제목을 입력해 주세요.' : ''
        };
    }

    const length = countTripTitleLength(normalizedValue);
    if (length > maxLength) {
        return {
            valid: false,
            code: 'too_long',
            normalizedValue,
            length,
            maxLength,
            message: getTripTitleTooLongMessage(maxLength)
        };
    }

    return {
        valid: true,
        code: 'ok',
        normalizedValue,
        length,
        maxLength,
        message: ''
    };
}
