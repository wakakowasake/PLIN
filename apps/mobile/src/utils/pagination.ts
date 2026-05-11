export const DEFAULT_OFFSET_PAGE_LIMIT = 20;
export const MAX_OFFSET_PAGE_LIMIT = 200;

type OffsetPageOptions = {
    cursor?: number | null;
    limit?: number | null;
    fallbackLimit?: number;
    maxLimit?: number;
    hasUnknownTail?: boolean;
};

export type OffsetPageResult<T> = {
    items: T[];
    nextCursor: number | null;
    hasMore: boolean;
};

export function normalizeOffsetCursor(value?: number | null) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.floor(value));
}

export function normalizeOffsetPageLimit(
    value?: number | null,
    fallbackLimit = DEFAULT_OFFSET_PAGE_LIMIT,
    maxLimit = MAX_OFFSET_PAGE_LIMIT
) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return Math.min(fallbackLimit, maxLimit);
    }

    return Math.min(maxLimit, Math.max(1, Math.floor(value)));
}

export function paginateOffsetItems<T>(
    items: T[],
    options: OffsetPageOptions = {}
): OffsetPageResult<T> {
    const cursor = normalizeOffsetCursor(options.cursor);
    const limit = normalizeOffsetPageLimit(
        options.limit,
        options.fallbackLimit,
        options.maxLimit
    );
    const pageItems = items.slice(cursor, cursor + limit);
    const loadedHasMore = cursor + pageItems.length < items.length;
    const hasUnknownTail = options.hasUnknownTail === true && pageItems.length === limit;
    const hasMore = loadedHasMore || hasUnknownTail;

    return {
        items: pageItems,
        nextCursor: hasMore ? cursor + pageItems.length : null,
        hasMore
    };
}

export function buildOffsetPageFromQueryItems<T>(
    items: T[],
    options: OffsetPageOptions = {}
): OffsetPageResult<T> {
    const cursor = normalizeOffsetCursor(options.cursor);
    const limit = normalizeOffsetPageLimit(
        options.limit,
        options.fallbackLimit,
        options.maxLimit
    );
    const pageItems = items.slice(0, limit);
    const hasMore = items.length > limit;

    return {
        items: pageItems,
        nextCursor: hasMore ? cursor + pageItems.length : null,
        hasMore
    };
}

export function buildFetchWindowLimit(
    cursor?: number | null,
    limit?: number | null,
    options?: {
        padding?: number;
        minimum?: number;
        maxLimit?: number;
    }
) {
    const normalizedLimit = normalizeOffsetPageLimit(limit, DEFAULT_OFFSET_PAGE_LIMIT, options?.maxLimit);
    const normalizedCursor = normalizeOffsetCursor(cursor);
    const padding = normalizeOffsetPageLimit(
        options?.padding,
        normalizedLimit,
        options?.maxLimit ?? MAX_OFFSET_PAGE_LIMIT
    );
    const minimum = normalizeOffsetPageLimit(
        options?.minimum,
        normalizedLimit * 2,
        options?.maxLimit ?? MAX_OFFSET_PAGE_LIMIT
    );

    return Math.max(minimum, normalizedCursor + normalizedLimit + padding);
}

export function buildHydrationRevalidateLimit(
    currentCount: number,
    fallbackLimit = DEFAULT_OFFSET_PAGE_LIMIT,
    maxLimit = MAX_OFFSET_PAGE_LIMIT
) {
    const normalizedCount = normalizeOffsetPageLimit(currentCount, fallbackLimit, maxLimit);
    return Math.max(fallbackLimit, normalizedCount);
}

export function buildInitialOffsetPageState(
    itemCount: number,
    fallbackLimit = DEFAULT_OFFSET_PAGE_LIMIT
) {
    const normalizedCount = normalizeOffsetCursor(itemCount);
    const hasMore = normalizedCount >= fallbackLimit;

    return {
        nextCursor: hasMore ? normalizedCount : null,
        hasMore
    };
}

export function mergeOffsetPageItemsById<T extends { id: string }>(
    existingItems: T[],
    nextItems: T[]
) {
    if (existingItems.length === 0) {
        return nextItems;
    }

    const seenIds = new Set(existingItems.map((item) => item.id));
    const mergedItems = [...existingItems];

    nextItems.forEach((item) => {
        if (seenIds.has(item.id)) {
            return;
        }

        seenIds.add(item.id);
        mergedItems.push(item);
    });

    return mergedItems;
}
