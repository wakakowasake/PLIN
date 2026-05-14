# PLIN 계획 거래 플랫폼 결제 조사

작성일: 2026-05-12

## 결론

PLIN이 앱 안에서 “큐레이션된 여행 일정” 접근권을 판매한다면 디지털 콘텐츠 판매에 가깝습니다. iOS 앱은 Apple In-App Purchase, Google Play 배포 Android 앱은 Google Play Billing을 기본 결제 수단으로 잡는 것이 심사 리스크가 가장 낮습니다.

웹에서 먼저 POC를 열어 결제 전환과 상품 구성을 검증하는 것은 가능합니다. 다만 앱 안에서 웹 결제 링크나 웹뷰로 사용자를 유도해 디지털 플랜을 구매하게 만들면 스토어 정책 리스크가 큽니다. 앱은 구매한 플랜 열람과 IAP/Play Billing 구매 흐름을 담당하고, 웹은 별도 유입 채널의 결제/관리 콘솔로 분리하는 방향이 안전합니다.

## 정책 기준

- Apple App Review Guideline 3.1.1은 앱 기능, 프리미엄 콘텐츠, 디지털 콘텐츠 접근을 잠금 해제하려면 In-App Purchase를 쓰라고 안내합니다.
- Apple 3.1.3(e)는 앱 밖에서 소비되는 물리 상품/서비스에는 IAP가 아니라 외부 결제 수단을 쓰라고 안내합니다. 여행 일정 콘텐츠는 항공권/숙박 예약 자체가 아니라 앱 안에서 소비되는 디지털 플랜에 가까워 IAP 쪽으로 보는 것이 안전합니다.
- Google Play 결제 정책도 Play 배포 앱에서 디지털 상품/콘텐츠/앱 기능 접근을 판매하면 Google Play Billing을 요구합니다.
- Google Play Billing 통합 문서는 결제 후 서버 검증, 권한 지급, 승인/acknowledge 흐름을 요구합니다.

## 국내 PG 후보

### Toss Payments

- 결제위젯 v2가 카드, 간편결제, 가상계좌 등을 한 번에 묶는 POC에 적합합니다.
- React Native SDK도 있지만, 앱스토어 정책상 디지털 플랜 판매를 앱 내 외부 PG로 처리하는 것은 권장하지 않습니다.
- 웹 POC에서는 `orders` 생성, 결제 요청, 성공 리다이렉트 검증, 서버 승인, 웹훅 보강 구조가 적합합니다.

### PortOne

- 여러 PG를 추상화할 수 있어 추후 PG 변경이나 복수 채널 운영에 유리합니다.
- 초기 POC가 “빠르게 한 PG로 매출 검증”이면 Toss가 단순하고, “PG 변경 가능성/복수 PG”가 중요하면 PortOne이 낫습니다.

## 권장 아키텍처

1. `community_posts`를 당장은 재사용하되 제품 언어는 `curated_plans`/`marketplace`로 전환합니다.
2. 관리자만 플랜을 업로드합니다. 원본 여행은 개인 계획으로 두고, 공개 플랜은 민감 정보를 제거한 발행본으로 저장합니다.
3. 상품 필드는 최소한 `price`, `currency`, `salesStatus`, `previewSummary`, `includedItems`, `refundPolicyVersion`을 둡니다.
4. 구매권은 `users/{uid}/marketplace_purchases/{postId}`에 저장하고, 조회/감사용 미러는 `plan_purchases/{hash(uid, postId)}`에 둡니다.
5. 웹 POC 결제는 별도 유입 채널로만 분리하고, 앱 안의 디지털 플랜 구매는 IAP/Play Billing으로 처리합니다.
6. iOS/Android 앱 판매는 RevenueCat SDK로 스토어 결제를 띄우고, Cloud Functions가 RevenueCat subscriber API 또는 웹훅으로 검증한 뒤 같은 구매권 저장소에 반영합니다.

## 구현 기준

- 앱 상품 ID는 커뮤니티 발행본의 `marketplace.productId`에 저장합니다.
- 카드 표시용 가격은 `marketplace.priceLabel`에 저장합니다. 스토어 실제 가격은 구매 직전에 RevenueCat product 정보로 다시 확인합니다.
- 모바일 공개 목록은 `/marketplace/purchases` 응답으로 구매 완료 상태를 반영합니다.
- 유료 플랜을 구매하지 않고 `duplicate-to-trip`을 호출하면 Functions가 `402 Purchase Required`로 차단합니다.
- 구매 동기화는 `/marketplace/purchases/sync`가 담당합니다. 서버에는 `REVENUECAT_SECRET_API_KEY`가 필요합니다.
- RevenueCat 웹훅은 `/marketplace/revenuecat/webhook`으로 받고, `REVENUECAT_WEBHOOK_AUTH_TOKEN`으로 검증합니다.
- Android는 RevenueCat 구매 흐름 중 액티비티가 끊기지 않도록 `MainActivity`의 `launchMode`를 `singleTop`으로 둡니다.

## POC 우선순위

1. 관리자 업로드 제한
2. 마켓플레이스 카드 카피/정보 구조 전환
3. 무료 미리보기와 구매 후 복제/내 여행으로 가져오기 경계 분리
4. RevenueCat 프로젝트, App Store Connect IAP, Play Console in-app product를 같은 상품 ID로 연결
5. 샌드박스 구매, 복원, 환불/취소 웹훅 검증

## 참고 출처

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple StoreKit In-App Purchase: https://developer.apple.com/documentation/storekit/in-app-purchase
- Google Play Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play Billing integration: https://developer.android.com/google/play/billing/integrate.html
- RevenueCat React Native SDK: https://www.revenuecat.com/docs/getting-started/installation/reactnative
- RevenueCat REST API: https://www.revenuecat.com/docs/api-v1
- RevenueCat Webhooks: https://www.revenuecat.com/docs/integrations/webhooks
- Toss Payments 결제위젯 v2: https://docs.tosspayments.com/guides/v2/payment-widget
- Toss Payments React Native SDK: https://docs.tosspayments.com/sdk/widget-rn
- PortOne 결제 연동: https://portone.gitbook.io/docs-en/console/guide/connect
