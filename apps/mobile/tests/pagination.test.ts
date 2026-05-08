import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildOffsetPageFromQueryItems,
    buildHydrationRevalidateLimit,
    paginateOffsetItems
} from '../src/utils/pagination';

test('pagination exposes nextCursor while more loaded items remain', () => {
    const page = paginateOffsetItems([1, 2, 3, 4, 5], {
        cursor: 0,
        limit: 2
    });

    assert.deepEqual(page.items, [1, 2]);
    assert.equal(page.nextCursor, 2);
    assert.equal(page.hasMore, true);
});

test('pagination keeps hasMore when the source may have an unknown tail', () => {
    const page = paginateOffsetItems([1, 2], {
        cursor: 0,
        limit: 2,
        hasUnknownTail: true
    });

    assert.deepEqual(page.items, [1, 2]);
    assert.equal(page.nextCursor, 2);
    assert.equal(page.hasMore, true);
});

test('revalidation limit keeps at least one default page and preserves loaded count', () => {
    assert.equal(buildHydrationRevalidateLimit(0), 20);
    assert.equal(buildHydrationRevalidateLimit(7), 20);
    assert.equal(buildHydrationRevalidateLimit(36), 36);
});

test('page-size plus one query window ends correctly for 10, 50, 51, and 120 item totals', () => {
    const pageSize = 50;
    const scenarios = [
        { total: 10, expectedHasMore: false, expectedItems: 10, expectedNextCursor: null },
        { total: 50, expectedHasMore: false, expectedItems: 50, expectedNextCursor: null },
        { total: 51, expectedHasMore: true, expectedItems: 50, expectedNextCursor: 50 },
        { total: 120, expectedHasMore: true, expectedItems: 50, expectedNextCursor: 50 }
    ] as const;

    scenarios.forEach(({ total, expectedHasMore, expectedItems, expectedNextCursor }) => {
        const queryItems = Array.from({ length: Math.min(total, pageSize + 1) }, (_, index) => index + 1);
        const page = buildOffsetPageFromQueryItems(queryItems, {
            cursor: 0,
            limit: pageSize
        });

        assert.equal(page.items.length, expectedItems, `total=${total}`);
        assert.equal(page.hasMore, expectedHasMore, `total=${total}`);
        assert.equal(page.nextCursor, expectedNextCursor, `total=${total}`);
    });
});

test('page-size plus one query window reaches the end across multiple 120-item pages', () => {
    const pageSize = 50;
    const windows = [
        Array.from({ length: 51 }, (_, index) => index + 1),
        Array.from({ length: 51 }, (_, index) => index + 51),
        Array.from({ length: 20 }, (_, index) => index + 101)
    ];

    const firstPage = buildOffsetPageFromQueryItems(windows[0], {
        cursor: 0,
        limit: pageSize
    });
    const secondPage = buildOffsetPageFromQueryItems(windows[1], {
        cursor: firstPage.nextCursor,
        limit: pageSize
    });
    const thirdPage = buildOffsetPageFromQueryItems(windows[2], {
        cursor: secondPage.nextCursor,
        limit: pageSize
    });

    assert.equal(firstPage.nextCursor, 50);
    assert.equal(firstPage.hasMore, true);
    assert.equal(secondPage.nextCursor, 100);
    assert.equal(secondPage.hasMore, true);
    assert.equal(thirdPage.nextCursor, null);
    assert.equal(thirdPage.hasMore, false);
    assert.equal(thirdPage.items.length, 20);
});
