import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRuntimeGateState } from '../src/config/runtime-gate';

test('development builds stay unblocked even when config is incomplete', () => {
    const gate = resolveRuntimeGateState({
        isDev: true,
        firebaseReady: false,
        googleAuthReady: false,
        firebaseError: 'firebase missing',
        googleError: 'google missing'
    });

    assert.equal(gate.isBlocked, false);
    assert.equal(gate.title, null);
});

test('production builds block when runtime config is incomplete', () => {
    const gate = resolveRuntimeGateState({
        isDev: false,
        firebaseReady: true,
        googleAuthReady: false,
        googleError: 'Google 로그인 설정 오류입니다.'
    });

    assert.equal(gate.isBlocked, true);
    assert.equal(gate.title, '앱을 열 수 없어요.');
    assert.match(gate.description || '', /Google 로그인 설정 오류/);
});
