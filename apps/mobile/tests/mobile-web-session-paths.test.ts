import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildDefaultMobileWebRelativeUrl,
    isMobileWebAuthCallbackPathname,
    sanitizeMobileWebReturnTo
} from '../src/utils/mobile-web-session-paths';

test('builds default mobile web relative urls from base paths', () => {
    assert.equal(buildDefaultMobileWebRelativeUrl(''), '/');
    assert.equal(buildDefaultMobileWebRelativeUrl('/m'), '/m');
    assert.equal(buildDefaultMobileWebRelativeUrl('m/'), '/m');
});

test('detects mobile web auth callback paths', () => {
    assert.equal(isMobileWebAuthCallbackPathname('/m/oauthredirect', '/m'), true);
    assert.equal(isMobileWebAuthCallbackPathname('/m/auth/social-complete', '/m'), true);
    assert.equal(isMobileWebAuthCallbackPathname('/m', '/m'), false);
});

test('sanitizes callback urls back to the mobile web root', () => {
    assert.equal(
        sanitizeMobileWebReturnTo('https://plin.ink/m/oauthredirect?code=abc&state=def', {
            basePath: '/m',
            origin: 'https://plin.ink'
        }),
        '/m'
    );
    assert.equal(
        sanitizeMobileWebReturnTo('https://plin.ink/m/auth/social-complete?provider=kakao&ticket=123', {
            basePath: '/m',
            origin: 'https://plin.ink'
        }),
        '/m'
    );
});

test('drops invite tokens from stored return urls', () => {
    assert.equal(
        sanitizeMobileWebReturnTo('https://plin.ink/m?invite=token-123#section', {
            basePath: '/m',
            origin: 'https://plin.ink'
        }),
        '/m#section'
    );
});

test('falls back to the mobile web root for cross-origin urls', () => {
    assert.equal(
        sanitizeMobileWebReturnTo('https://example.com/m?invite=token-123', {
            basePath: '/m',
            origin: 'https://plin.ink'
        }),
        '/m'
    );
});
