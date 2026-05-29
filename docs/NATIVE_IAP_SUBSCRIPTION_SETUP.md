# 네이티브 IAP 구독 연동 가이드

PLIN 모바일 앱은 RevenueCat 없이 Expo IAP로 App Store / Google Play 결제를 직접 띄우고, Cloud Functions에서 스토어 서버 검증 후 `PLIN Plus` 권한을 저장합니다.

## 앱 상품 ID

앱과 서버는 아래 상품 ID를 기본값으로 기대합니다.

```text
monthly
yearly
lifetime
```

앱 환경 변수:

```bash
EXPO_PUBLIC_PLIN_IAP_MONTHLY_PRODUCT_ID=monthly
EXPO_PUBLIC_PLIN_IAP_YEARLY_PRODUCT_ID=yearly
EXPO_PUBLIC_PLIN_IAP_LIFETIME_PRODUCT_ID=lifetime
```

`EXPO_PUBLIC_*` 값은 앱 번들에 들어가므로 변경 후 네이티브 앱을 다시 빌드해야 합니다.

## 서버 환경 변수

```bash
IAP_SUBSCRIPTION_ENTITLEMENT_ID=PLIN Plus
IAP_SUBSCRIPTION_PRODUCT_IDS=monthly,yearly
IAP_LIFETIME_PRODUCT_IDS=lifetime

APPLE_IAP_ISSUER_ID=...
APPLE_IAP_KEY_ID=...
APPLE_IAP_PRIVATE_KEY=...
APPLE_IAP_BUNDLE_ID=ink.plin.mobile

GOOGLE_PLAY_PACKAGE_NAME=ink.plin.mobile
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=...

# 선택이지만 운영 권장: Apple/Google 스토어 알림 URL 보호용
IAP_WEBHOOK_SECRET=...
```

`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`은 JSON 원문 또는 base64 인코딩 문자열을 넣을 수 있습니다.
`IAP_WEBHOOK_SECRET`을 설정하면 Apple/Google 알림 URL 끝에 `?secret=...`을 붙이거나 `x-plin-iap-webhook-secret` 헤더로 같은 값을 보내야 합니다. 스토어 알림은 결국 Apple/Google 서버 API로 다시 검증하지만, 공개 URL 오남용을 줄이기 위해 운영에서는 설정을 권장합니다.

## App Store Connect

1. 구독 그룹을 만듭니다.
2. 구독 상품 `monthly`, `yearly`를 만듭니다.
3. 1개월 무료 체험은 각 구독 상품의 introductory offer로 설정합니다.
4. 필요하면 비소모성 인앱 상품 `lifetime`을 별도로 만듭니다.
5. App Store Server API용 키를 만들고 `issuerId`, `keyId`, private key를 Functions 환경 변수에 넣습니다.
6. App Store Server Notifications V2 URL을 등록합니다.

```text
https://plin.ink/api/marketplace/subscription/apple-notifications?secret=IAP_WEBHOOK_SECRET값
```

## Play Console

1. 구독 상품 `monthly`, `yearly`를 만듭니다.
2. 각 구독에 base plan과 1개월 무료 체험 offer를 설정합니다.
3. 필요하면 일회성 상품 `lifetime`을 만듭니다.
4. Google Cloud 서비스 계정을 Play Console API 권한에 연결합니다.
5. 서비스 계정 JSON을 Functions 환경 변수에 넣습니다.
6. Google Play Real-time Developer Notifications용 Pub/Sub topic과 push subscription을 만들고 push endpoint를 아래 URL로 둡니다.

```text
https://plin.ink/api/marketplace/subscription/google-rtdn?secret=IAP_WEBHOOK_SECRET값
```

## 앱 흐름

1. 앱이 `expo-iap`로 스토어 상품을 조회합니다.
2. 사용자가 구매하면 앱이 purchase token 또는 transaction id를 `/marketplace/subscription/sync`로 보냅니다.
3. Functions가 Apple / Google 서버에 검증 요청을 보냅니다.
4. 검증 성공 시 아래 문서에 `PLIN Plus` 권한을 저장합니다.
5. 앱 실행, 구독 관리 진입, 구매 복원 시 현재 기기의 활성 구매 내역을 다시 읽고 `/marketplace/subscription/sync`로 재검증합니다.

구매는 Firebase UID와 묶어 검증합니다. iOS는 UID에서 생성한 `appAccountToken`, Android는 `obfuscatedAccountId`를 구매 요청에 넣고 서버 검증 시 같은 계정인지 확인합니다.

```text
users/{uid}/marketplace_subscription/access
marketplace_subscriptions/{uid}
```

## 운영 동기화

초기 구매 검증과 앱 실행/구독 관리/구매 복원 시점의 재검증이 구현되어 있습니다. 추가로 App Store Server Notifications V2와 Google Play RTDN endpoint도 준비되어 있어, 스토어에서 앱 밖 구독 취소, 환불, 만료, 갱신 실패가 발생해도 Functions가 다시 Apple/Google 서버 검증을 거친 뒤 Firestore 권한을 갱신합니다.

- 앱 복귀 시점: 모바일 앱이 foreground로 돌아오면 활성 구매 내역을 다시 읽고 `/marketplace/subscription/sync`로 재검증합니다.
- Apple 알림: `/marketplace/subscription/apple-notifications`가 `signedPayload`를 받고, transaction id를 App Store Server API에 다시 조회한 뒤 처리합니다.
- Google 알림: `/marketplace/subscription/google-rtdn`이 Pub/Sub push payload를 받고, purchase token을 Google Play Developer API에 다시 조회한 뒤 처리합니다. Voided purchase 알림은 기존 purchase token 매핑으로 찾아 권한을 회수합니다.
- 스토어 설정 기준: App Store Connect와 Play Console의 상품 ID는 `monthly`, `yearly`와 일치해야 하며, 1개월 무료 체험은 각 스토어 상품/offer 설정에서 관리합니다.

## 심사/릴리스 점검

- 모든 구독 시작 경로는 PLIN Plus 구독 시트로 모읍니다. 구독 시트에는 가격, 자동 갱신 안내, 스토어 구독 관리/취소 문구, 구독 복원, 유료서비스 약관, 개인정보처리방침, 서비스 이용약관 링크가 있어야 합니다.
- `구독 복원`은 결제 화면에서 접근 가능해야 합니다. 사용자가 앱 삭제/재설치, 기기 변경, 스토어 계정 재로그인 후에도 기존 구독을 다시 확인할 수 있어야 합니다.
- 결제 성공 후 권한 저장은 클라이언트에서 직접 하지 않습니다. 앱은 transaction id 또는 purchase token을 Functions의 `/marketplace/subscription/sync`로 보내고, Functions가 Apple/Google 서버 검증을 통과한 뒤에만 구독 권한을 저장합니다.
- Apple/Google 스토어 알림 endpoint를 설정한 뒤에는 테스트 알림을 보내 `marketplace_iap_webhook_events`에 기록이 남는지 확인합니다.
- Android 내부 테스트는 debug APK가 아니라 release APK/AAB에서 최소 1회 확인합니다. 릴리스 난독화를 켤 경우 `apps/mobile/android/app/proguard-rules.pro`의 IAP/WebView keep rule을 유지합니다.
- 약관/문의처럼 WebView를 쓰는 화면은 Android 물리 뒤로가기에서 WebView 히스토리를 먼저 처리해야 합니다.
- Android 12 이상 기기에서 adaptive icon과 splash 로고가 잘리지 않는지 실제 기기로 확인합니다.
- EAS 빌드 전 `apps/mobile/.env`와 `apps/mobile/eas.json`의 프로필이 테스트/운영 Firebase 프로젝트를 혼동하지 않는지 확인합니다. `EXPO_PUBLIC_*` 값은 앱 번들에 포함되므로 변경 후 반드시 새 빌드를 만듭니다.
- Firestore/Storage rules는 테스트 모드가 아니어야 합니다. 결제/권한/커뮤니티 쓰기는 클라이언트 직접 쓰기가 아니라 서버 Admin SDK 경유를 유지합니다.
