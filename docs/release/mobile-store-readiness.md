# PLIN Mobile Store Readiness

## Privacy Inventory

| Data | Where it appears | Purpose | Stored on server |
| --- | --- | --- | --- |
| `uid`, `email`, `displayName`, `photoURL` | Firebase Auth, `users/{uid}` | sign-in, profile, community attribution | yes |
| `agreedToTerms`, `agreedToPrivacy`, `agreedAt` | `users/{uid}` | legal consent state | yes |
| `accountStatus`, `deletionRequestedAt`, `purgeAfter` | `users/{uid}` | account deletion lifecycle | yes |
| `blockedUserIds` | `users/{uid}` | community safety filters | yes |
| trip content | `plans/{tripId}` | trip planning and collaboration | yes |
| memory photos | Firebase Storage `memories/{tripId}/` | travel memories | yes |
| trip cover photos | Firebase Storage `trip-covers/{tripId}/` | trip presentation | yes |
| community post/comment metadata | `community_posts`, `community_reports` | community feed and moderation | yes |
| current location | device permission, route/place search requests | route guidance and nearby search | request-time only |
| Expo push token | `push_installations` | trip announcement push delivery | yes |

## App Store / Play Console Notes

- App Store Connect `App Privacy` and Google Play `Data safety` should be filled from the table above.
- The account deletion web entrypoint is `/account-delete.html`.
- Community moderation entrypoints now exist for:
  - post report
  - comment report
  - author block / unblock
- Android production signing now expects:
  - `PLIN_UPLOAD_STORE_FILE`
  - `PLIN_UPLOAD_STORE_PASSWORD`
  - `PLIN_UPLOAD_KEY_ALIAS`
  - `PLIN_UPLOAD_KEY_PASSWORD`
- Expo push production setup still requires console credentials:
  - APNs key
  - Play / FCM credential
  - `EXPO_PUBLIC_PLIN_EAS_PROJECT_ID` or `EXPO_EAS_PROJECT_ID`
- Crash reporting and App Check / device integrity are still external setup items.

## Manual Console Follow-ups

- Enable `Sign in with Apple` in Apple Developer and Firebase Auth.
- Upload Play App Signing key and store the upload key variables for CI.
- Register APNs production key and verify iOS provisioning uses the production entitlement.
- Fill App Store age rating, review notes, support URL, privacy URL, and Google Play closed testing metadata.
- Connect crash reporting (for example Sentry or Crashlytics) and decide the final App Check / Play Integrity rollout plan before production.
