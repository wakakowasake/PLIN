import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAuthProviderAvailability } from '../src/services/public-config-shared';

test('public config availability defaults every provider to false', () => {
    assert.deepEqual(normalizeAuthProviderAvailability(null), {
        google: false,
        apple: false,
        kakao: false,
        naver: false
    });
});

test('public config availability only enables explicit true values', () => {
    assert.deepEqual(normalizeAuthProviderAvailability({
        google: true,
        apple: false,
        kakao: true,
        naver: 'yes'
    }), {
        google: true,
        apple: false,
        kakao: true,
        naver: false
    });
});
