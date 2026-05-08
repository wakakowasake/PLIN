import test from 'node:test';
import assert from 'node:assert/strict';

import { readAcceptedInviteTripId } from '../src/utils/trip-invite-response';

test('reads the accepted invite trip id from backend responses', () => {
    assert.equal(
        readAcceptedInviteTripId({
            trip: {
                id: 'trip-123'
            }
        }),
        'trip-123'
    );
});

test('throws when the accepted invite payload does not include a trip id', () => {
    assert.throws(
        () => readAcceptedInviteTripId({
            trip: {}
        }),
        /초대받은 여행 정보를 확인하지 못했어요/
    );
});
