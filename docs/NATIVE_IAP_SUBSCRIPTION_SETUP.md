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
```

`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`은 JSON 원문 또는 base64 인코딩 문자열을 넣을 수 있습니다.

## App Store Connect

1. 구독 그룹을 만듭니다.
2. 구독 상품 `monthly`, `yearly`를 만듭니다.
3. 1개월 무료 체험은 각 구독 상품의 introductory offer로 설정합니다.
4. 필요하면 비소모성 인앱 상품 `lifetime`을 별도로 만듭니다.
5. App Store Server API용 키를 만들고 `issuerId`, `keyId`, private key를 Functions 환경 변수에 넣습니다.

## Play Console

1. 구독 상품 `monthly`, `yearly`를 만듭니다.
2. 각 구독에 base plan과 1개월 무료 체험 offer를 설정합니다.
3. 필요하면 일회성 상품 `lifetime`을 만듭니다.
4. Google Cloud 서비스 계정을 Play Console API 권한에 연결합니다.
5. 서비스 계정 JSON을 Functions 환경 변수에 넣습니다.

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

## 남은 운영 과제

초기 구매 검증과 앱 실행/구독 관리/구매 복원 시점의 재검증은 구현되어 있습니다. 출시 전 운영 기준은 아래처럼 봅니다.

- 최소 출시 기준: 앱 실행, 구독 관리 진입, 구매 복원 시점에 활성 구매 내역을 서버에서 재검증합니다.
- 심사 후 운영 보강: 갱신, 환불, 만료를 앱 실행 없이 자동 반영하려면 App Store Server Notifications V2와 Google Play RTDN을 추가합니다.
- 스토어 설정 기준: App Store Connect와 Play Console의 상품 ID는 `monthly`, `yearly`와 일치해야 하며, 1개월 무료 체험은 각 스토어 상품/offer 설정에서 관리합니다.
