import test from 'node:test';
import assert from 'node:assert/strict';

import {
    hasAcceptedMandatoryTerms,
    requiresMandatoryAgreement,
    shouldRetryMandatoryAgreementResolution
} from '../src/auth/mandatory-agreement';

const user = { uid: 'user-1' };

test('mandatory agreement passes only when terms are explicitly true', () => {
    assert.equal(hasAcceptedMandatoryTerms({ agreedToTerms: true, source: 'profile' }), true);
    assert.equal(hasAcceptedMandatoryTerms({ agreedToTerms: false, source: 'profile' }), false);
    assert.equal(hasAcceptedMandatoryTerms({ agreedToTerms: null, source: 'auth' }), false);
});

test('unresolved agreement state keeps the user gated and requires retry', () => {
    const unresolvedProfile = {
        agreedToTerms: null,
        source: 'auth' as const
    };

    assert.equal(requiresMandatoryAgreement(user, unresolvedProfile), true);
    assert.equal(shouldRetryMandatoryAgreementResolution(user, unresolvedProfile), true);
});
