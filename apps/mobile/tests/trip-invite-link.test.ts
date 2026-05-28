import test from 'node:test';
import assert from 'node:assert/strict';

import {
    readPublicTripTokenFromUrl,
    readTripInviteTokenFromUrl
} from '../src/utils/trip-invite-link';

test('reads invite token from mobile deep links', () => {
    assert.equal(
        readTripInviteTokenFromUrl('plinmobile://invite?token=invite-token-123'),
        'invite-token-123'
    );
    assert.equal(
        readTripInviteTokenFromUrl('plinmobile://invite/invite-token-456'),
        'invite-token-456'
    );
});

test('reads invite token from web invite urls', () => {
    assert.equal(
        readTripInviteTokenFromUrl('https://plin.ink/?invite=invite-token-123'),
        'invite-token-123'
    );
    assert.equal(
        readTripInviteTokenFromUrl('https://plin.ink/v/invite/invite-token-456'),
        'invite-token-456'
    );
    assert.equal(
        readTripInviteTokenFromUrl('https://plin.ink/invites/invite-token-789'),
        'invite-token-789'
    );
});

test('returns null for unrelated urls', () => {
    assert.equal(readTripInviteTokenFromUrl('https://plin.ink/p/public-token'), null);
    assert.equal(readTripInviteTokenFromUrl(''), null);
});

test('reads public trip token from web and mobile deep links', () => {
    assert.equal(
        readPublicTripTokenFromUrl('https://plin.ink/p/public-token-123'),
        'public-token-123'
    );
    assert.equal(
        readPublicTripTokenFromUrl('https://www.plin.ink/p/public-token-456'),
        'public-token-456'
    );
    assert.equal(
        readPublicTripTokenFromUrl('https://plin.ink/m?publicTrip=public-token-web'),
        'public-token-web'
    );
    assert.equal(
        readPublicTripTokenFromUrl('plinmobile://p/public-token-789'),
        'public-token-789'
    );
    assert.equal(
        readPublicTripTokenFromUrl('plinmobile://public-trip?token=public-token-abc'),
        'public-token-abc'
    );
});

test('public trip parser ignores invite links', () => {
    assert.equal(readPublicTripTokenFromUrl('https://plin.ink/v/invite/invite-token-123'), null);
    assert.equal(readPublicTripTokenFromUrl('plinmobile://invite?token=invite-token-456'), null);
});
