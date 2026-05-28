# 모바일 앱 카피 수정 리포트

작성일: 2026-05-28

기준 문서: `docs/MOBILE_COPY_STYLE_GUIDE.md`

## 수정 원칙

| 기준 | 적용 방향 |
| --- | --- |
| 내부 용어 제거 | Firebase, OAuth, redirect, 빌드, 환경 변수, 관리자 같은 운영/개발 용어를 사용자 안내에서 제거 |
| 행동 중심 | 업로드, 권한 제거, 유료 큐레이션 같은 추상 표현을 공개하기, 내보내기, PLIN Plus로 변경 |
| 실패 문구 정리 | 실패/불가 중심 제목을 “하지 못했어요” 형태로 낮추고 다음 행동을 붙임 |
| 스토어 구독 분리 | App Store / Google Play 흐름은 `nativeStoreLabel` 기준으로 안내 유지 |
| 짧은 문장 | 설명성 카피는 1문장 중심으로 줄이고 중복 정보를 제거 |

## 변경 셀 리포트

| 영역 | 파일 | 변경 전 | 변경 후 | 이유 |
| --- | --- | --- | --- | --- |
| Google 로그인 | `apps/mobile/src/adapters/auth/android-google-signin.ts` | Google 로그인 설정이 완료되지 않았습니다. | Google 로그인을 시작하지 못했어요. 고객센터로 문의해 주세요. | 설정 노출 제거 |
| Google 로그인 | `apps/mobile/src/adapters/auth/android-google-signin.ts` | 기기 설정을 확인해 주세요. | 휴대폰 설정을 확인해 주세요. | 소비자 언어로 변경 |
| Google 로그인 | `apps/mobile/src/adapters/auth/android-google-signin.ts` | Google ID 토큰을 가져오지 못했습니다. | Google 로그인을 완료하지 못했어요. | 개발 용어 제거 |
| 소셜 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts` | 개발용 우회 빌드에서는 Apple 로그인을 잠시 비활성화했어요. | Apple 로그인을 사용할 수 없어요. 고객센터로 문의해 주세요. | 개발/빌드 용어 제거 |
| 소셜 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts` | 앱 redirect 설정을 다시 확인해 주세요. | 앱을 다시 열고 시도해 주세요. | 내부 설정 용어 제거 |
| 소셜 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts` | OAuth client ID와 redirect 설정을 확인해 주세요. | 고객센터로 문의해 주세요. | 앱 사용자에게 불필요한 설정값 제거 |
| 이메일 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts` | Firebase Auth의 Email/Password 제공자를 켜 주세요. | 고객센터로 문의해 주세요. | 운영자용 조치 제거 |
| 이메일 인증 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts` | Firebase 승인 도메인에 plin.ink를 추가해 주세요. | 고객센터로 문의해 주세요. | 내부 설정 노출 제거 |
| 로그인 상태 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts` | 기기에서 로그인 상태 확인이 오래 걸리고 있어요. | 로그인 상태 확인이 오래 걸리고 있어요. | 불필요한 기기 표현 제거 |
| Apple 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts` | iOS 앱을 다시 빌드해 주세요. | 앱을 업데이트한 뒤 다시 시도해 주세요. | 빌드 용어 제거 |
| 앱 설정 | `apps/mobile/src/config/mobile-runtime-config.ts` | 환경 변수가 설정되지 않았습니다. | 앱 설정을 확인하지 못했어요. 고객센터로 문의해 주세요. | 환경 변수 노출 제거 |
| 앱 설정 | `apps/mobile/src/config/mobile-runtime-config.ts` | 모바일 Firebase 환경 변수가 없어 ... 중이에요. | 앱 설정을 불러오지 못해 ... 중이에요. | Firebase 용어 제거 |
| 진입 차단 | `apps/mobile/src/config/runtime-gate.ts` | 앱 설정을 확인해 주세요. | 앱을 열 수 없어요. | 상황을 더 직접적으로 표현 |
| 알림 | `apps/mobile/src/services/trip-announcements.ts` | EXPO_PUBLIC_PLIN_EAS_PROJECT_ID를 설정한 뒤 앱을 다시 빌드해 주세요. | 앱을 업데이트한 뒤 다시 시도해 주세요. | 환경 변수/빌드 용어 제거 |
| 사진 업로드 | `apps/mobile/src/services/profile-photo-upload.ts` | 앱을 한 번 다시 빌드해 주세요. | 앱을 업데이트한 뒤 다시 시도해 주세요. | 빌드 용어 제거 |
| 첨부파일 | `apps/mobile/src/services/trip-attachment-upload.ts` | 앱을 한 번 다시 빌드해 주세요. | 앱을 업데이트한 뒤 다시 시도해 주세요. | 빌드 용어 제거 |
| 대표 사진 | `apps/mobile/src/services/trip-cover-upload.ts` | 여행 편집 권한을 확인해 주세요. | 편집 멤버에게 수정을 요청해 주세요. | 권한보다 해결 행동 중심 |
| 추억 사진 | `apps/mobile/src/services/trip-memory-upload.ts` | 여행 편집 권한을 확인해 주세요. | 편집 멤버에게 수정을 요청해 주세요. | 권한보다 해결 행동 중심 |
| 공유 취소 | `apps/mobile/src/features/trip-detail/useTripDetailShareActions.ts` | 기기나 환경에 따라 다르게 보일 수 있어요. | 휴대폰 환경에 따라 다르게 보일 수 있어요. | 사용자 친화 용어 |
| 플랜 공개 | `apps/mobile/src/features/trip-detail/useTripDetailShareActions.ts` | 업로드 완료 / 업로드 실패 | 공개했어요 / 공개하지 못했어요 | 앱 내 행동과 용어 통일 |
| 플랜 공개 | `apps/mobile/src/features/trip-detail/useTripDetailShareActions.ts` | PLIN 큐레이션에 등록했어요. | 플랜에 등록했어요. | 과한 브랜드 표현 축소 |
| 플랜 공개 | `apps/mobile/src/features/trip-detail/useTripDetailShareActions.ts` | 이 여행은 큐레이션 업로드 권한이 없어요. | 지금은 이 일정을 공개할 수 없어요. | 권한/업로드 용어 제거 |
| 공개 범위 | `apps/mobile/src/features/trip-detail/useTripDetailShareActions.ts` | 무료 업로드 / 유료 업로드 | 일반 공개 / PLIN Plus 공개 | 무료/유료 강조 대신 범위 중심 |
| 멤버 관리 | `apps/mobile/src/features/trip-detail/useTripDetailShareActions.ts` | 접근 권한을 제거할까요? | 이 여행에서 내보낼까요? | 실제 행동 중심 |
| 플랜 목록 | `apps/mobile/src/screens/CommunityScreen.tsx` | 유료 큐레이션 플랜을 내 일정으로 가져올 수 있어요. | 내 일정으로 가져올 수 있어요. | 유료 큐레이션 반복 제거 |
| 플랜 목록 | `apps/mobile/src/screens/CommunityScreen.tsx` | 구독 실패 / 복원 실패 | 구독을 시작하지 못했어요 / 구독을 복원하지 못했어요 | 실패 제목 완화 |
| 플랜 목록 | `apps/mobile/src/screens/CommunityScreen.tsx` | 삭제 권한이 있는 계정에서만 진행돼요. | 작성한 플랜만 삭제할 수 있어요. | 계정 권한 표현 축소 |
| 플랜 목록 | `apps/mobile/src/screens/CommunityScreen.tsx` | 큐레이션 업로드 / 업로드 | 플랜 공개 / 공개 | 업로드 용어 통일 |
| 플랜 목록 | `apps/mobile/src/screens/CommunityScreen.tsx` | 업로드 가능한 여행 | 공개 가능한 여행 | 사용자가 보는 행동 기준으로 변경 |
| 플랜 상세 | `apps/mobile/src/screens/CommunityPostDetailScreen.tsx` | PLIN 큐레이션 플랜 | PLIN Plus 플랜 | 구독 명칭 통일 |
| 플랜 상세 | `apps/mobile/src/screens/CommunityPostDetailScreen.tsx` | 유료 플랜 | PLIN Plus 플랜 | 유료 태그 대신 상품명 |
| 플랜 카드 | `apps/mobile/src/components/CommunityPostCard.tsx` | 유료 플랜 | PLIN Plus 플랜 | 접근성 라벨 정리 |
| 플랜 데이터 | `apps/mobile/src/mappers/community-mapper.ts` | 유료 플랜 | PLIN Plus | 가격 라벨 기본값 정리 |
| 공유 시트 | `apps/mobile/src/components/TripShareSheet.tsx` | 링크 권한도 함께 선택할 수 있어요. | 공유 범위와 링크 접근을 선택해요. | 짧고 명확하게 축약 |
| 공유 시트 | `apps/mobile/src/components/TripShareSheet.tsx` | 멤버 권한을 바꾸거나 접근 권한을 제거 | 멤버 역할을 바꾸거나 내보낼 수 있어요. | 권한 제거 표현 축소 |
| 공유 시트 | `apps/mobile/src/components/TripShareSheet.tsx` | 커뮤니티 업로드 / 큐레이션에 올리기 | 플랜 공개 / 플랜 공개하기 | 공개 행동 중심 |
| 설정 | `apps/mobile/src/screens/SettingsScreen.tsx` | 이 기기에서 사용할 테마 | 이 앱에서 사용할 테마 | 기기 표현 제거 |
| 설정 | `apps/mobile/src/screens/SettingsScreen.tsx` | 프로필 사진과 이름을 이 기기에서 바로 바꿀 수 있어요. | 프로필 사진과 이름을 바꿔요. | 설명 축약 |
| 구독 모달 | `apps/mobile/src/screens/SettingsScreen.tsx` | 이용 권한만 확인합니다. | 이용 상태만 확인해요. | 권한/격식체 완화 |
| 구독 모달 | `apps/mobile/src/screens/SettingsScreen.tsx` | 큐레이션 플랜 무료 체험 | PLIN Plus 무료 체험 | 상품명 중심 |
| 구독 모달 | `apps/mobile/src/screens/SettingsScreen.tsx` | PLIN이 고른 유료 여행 플랜 열람 | PLIN Plus 플랜 열람 | 유료 강조 제거 |
| 계정 설정 | `apps/mobile/src/screens/SettingsAccountScreen.tsx` | 이 기기에서 로그인했어요. | 현재 앱에서 로그인했어요. | 기기 표현 제거 |
| 계정 설정 | `apps/mobile/src/screens/SettingsAccountScreen.tsx` | 현재 연결된 로그인 수단만 먼저 보여드려요. | 연결된 로그인 수단을 관리해요. | 중복 설명 축약 |
| 계정 설정 | `apps/mobile/src/screens/SettingsAccountScreen.tsx` | 현재 빌드에서 시작할 수 없어요. | 지금은 이 로그인 방식을 사용할 수 없어요. | 빌드 용어 제거 |
| 결제 오류 | `apps/mobile/src/services/plan-marketplace-purchases.ts` | native 오류 메시지를 그대로 표시 | 스토어/연결/토큰 계열 오류를 사용자용 문구로 변환 | 영어/내부 오류 노출 방지 |
| 결제 오류 | `apps/mobile/src/services/plan-marketplace-purchases.ts` | 상품 정보를 불러오지 못했어요. | 구독 화면을 불러오지 못했어요. | 상품/SKU 느낌 축소 |
| 충돌 안내 | `apps/mobile/src/adapters/trips/FirebaseTripRepository.ts` 외 | 다른 기기에서 먼저 수정했어요. | 다른 곳에서 먼저 수정됐어요. | 기기 표현 제거 |
| 로드 오류 | `apps/mobile/src/hooks/community-load-error.ts` 외 | 접근 권한이 바뀌었어요. | 볼 수 있는 범위가 바뀌었어요. | 권한 표현 완화 |
| 위치 권한 | `apps/mobile/src/components/TimelineItemComposerModal.tsx` | 현재 위치 권한이 필요해요. | 위치 접근을 허용해 주세요. | OS 권한 안내를 자연스럽게 변경 |
| 여행 공유 | `apps/mobile/src/screens/TripListScreen.tsx` | 기기나 환경에 따라 다르게 보일 수 있어요. | 휴대폰 환경에 따라 다르게 보일 수 있어요. | 사용자 친화 용어 |
| 여행 공유 | `apps/mobile/src/screens/TripListScreen.tsx` | 접근 권한을 제거할까요? | 이 여행에서 내보낼까요? | 실제 행동 중심 |
| 커뮤니티 저장소 | `apps/mobile/src/adapters/community/FirebaseCommunityRepository.ts` 외 | 업로드할 여행을 찾을 수 없어요. | 공개할 여행을 찾을 수 없어요. | 공개 용어 통일 |

## 남은 점검 항목

| 항목 | 상태 | 비고 |
| --- | --- | --- |
| OS 권한 문구 | 유지 | 사진, 파일, 카메라, 알림 권한은 플랫폼 표준어라 유지 |
| 개발자용 조건 검사 문자열 | 유지 | `OAuth`, `redirect`, `Firebase` 문자열은 사용자 표시가 아니라 오류 분류 로직에 남김 |
| 결제 스토어 상품 미등록 | 유지 필요 | 실제 App Store / Google Play 상품 등록 전에는 사용자용 오류가 뜨며, 스토어 설정 완료 후 테스트 필요 |
