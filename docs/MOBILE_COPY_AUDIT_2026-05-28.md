# PLIN 모바일 앱 카피 전수조사

조사일: 2026-05-28

## 범위와 방법

- 기준 문서: `docs/MOBILE_COPY_STYLE_GUIDE.md`
- 대상: `apps/mobile/src`의 `ts`, `tsx` 파일
- 추출 도구: `cd apps/mobile && npm run report:copy-audit`
- 추출 결과: 사용자 노출 후보 문구 2,680개
- 산출 CSV: `apps/mobile/reports/mobile-copy-audit.csv`

Lazyweb로 추가 확인한 일반 앱 사례:
- 첫 사용/빈 상태: Speechify, Plantin, Microsoft Authenticator, Edits
- 생성/편집: Craft, Raycast, Photoroom, Binsoo
- 검색/필터: Zillow, Otter, FotMob, Reader, Revolut
- 권한 요청: Google Maps, Lightroom, Photomath, Edits

이번 조사는 앱 코드를 직접 수정하지 않고, 기준 수립과 개선 후보 식별까지만 진행했습니다.

## 정량 요약

| 항목 | 건수 | 해석 |
|---|---:|---|
| 전체 사용자 노출 후보 | 2,680 | JSX Text, alert/toast/error, placeholder, label 등 |
| 내부/개발자 용어 후보 | 26 | Firebase, OAuth, redirect, token, env, rebuild 등 |
| 권한/접근권한 혼용 후보 | 36 | OS 권한, 편집 권한, 구독 접근권이 섞임 |
| 기기/디바이스 표현 후보 | 19 | 일부는 동기화 충돌 문구라 허용 가능, 일부는 교체 필요 |
| `잠시 후 다시 시도` 반복 후보 | 108 | 오류별 복구 행동이 덜 구체적인 곳 다수 |
| AI식 완충 문구 후보 | 140 | `할 수 있어요`, `준비됐어요`, `확인해 주세요`, `중이에요` 과다 |
| 플랜/유료 큐레이션 잔여 후보 | 6 | `유료 큐레이션 플랜` 표현 잔존 |
| App Store/Google Play 통합 표기 | 0 | 결제 문구 분리는 현재 기준 통과 |

문구가 많은 파일:

| 파일 | 후보 수 | 우선순위 |
|---|---:|---|
| `src/screens/TripCreateScreen.tsx` | 336 | 높음 |
| `src/screens/TripDetailScreen.tsx` | 293 | 높음 |
| `src/screens/TripListScreen.tsx` | 171 | 높음 |
| `src/screens/CommunityScreen.tsx` | 160 | 높음 |
| `src/screens/SettingsScreen.tsx` | 144 | 높음 |
| `src/screens/TimelineItemEditScreen.tsx` | 144 | 높음 |
| `src/components/TimelineItemComposerModal.tsx` | 80 | 중간 |
| `src/screens/SettingsAccountScreen.tsx` | 80 | 중간 |
| `src/screens/CommunityPostDetailScreen.tsx` | 79 | 중간 |
| `src/screens/AuthGateScreen.tsx` | 76 | 중간 |

## 핵심 판단

PLIN 앱 카피의 가장 큰 문제는 "말투"보다 "역할 혼선"입니다.

1. 사용자가 해결할 수 없는 개발 설정 문제가 소비자 문구로 노출됩니다.
2. OS 권한, 편집 권한, 구독 접근권이 모두 `권한`으로 불립니다.
3. 오류 복구 문구가 `잠시 후 다시 시도`로 과하게 통일되어 있습니다.
4. 플랜 영역에서 아직 `유료 큐레이션` 같은 내부 상품명 느낌의 표현이 남아 있습니다.
5. 설정/계정/공유 쪽은 설명이 길고, 타사 앱처럼 "행동 가능한 짧은 행"으로 정리되지 않은 곳이 있습니다.

## P0: 사용자에게 보이면 안 되는 내부/개발자 문구

아래 문구는 소비자에게 노출되면 바로 신뢰를 깎습니다. 운영/개발 진단 문구가 필요하면 콘솔 로그나 개발자 전용 분기로 옮기고, 사용자에게는 일반 문구만 보여야 합니다.

| 위치 | 현재 문구 | 권장 방향 |
|---|---|---|
| `src/adapters/auth/android-google-signin.ts:75` | `Google ID 토큰을 가져오지 못했습니다.` | `Google 로그인을 완료하지 못했어요.` |
| `src/adapters/auth/FirebaseAuthSessionAdapter.ts:302` | `앱 redirect 설정을 다시 확인해 주세요.` | `로그인을 시작하지 못했어요. 앱을 다시 열고 시도해 주세요.` |
| `src/adapters/auth/FirebaseAuthSessionAdapter.ts:434` | `OAuth client ID와 redirect 설정을 확인해 주세요.` | `Google 로그인을 시작하지 못했어요. 고객센터로 문의해 주세요.` |
| `src/adapters/auth/FirebaseAuthSessionAdapter.ts:483` | `Firebase Auth의 Email/Password 제공자를 켜 주세요.` | `이메일 로그인을 사용할 수 없어요. 고객센터로 문의해 주세요.` |
| `src/adapters/auth/FirebaseAuthSessionAdapter.ts:545` | `Firebase Auth 승인 도메인에 plin.ink를 추가해 주세요.` | `인증 메일을 보낼 수 없어요. 고객센터로 문의해 주세요.` |
| `src/config/mobile-runtime-config.ts:217` | `환경 변수가 일부만 설정되어 있습니다.` | `앱 설정을 불러오지 못했어요. 고객센터로 문의해 주세요.` |
| `src/services/trip-announcements.ts:62` | `EXPO_PUBLIC_PLIN_EAS_PROJECT_ID를 설정한 뒤 앱을 다시 빌드해 주세요.` | `알림을 준비하지 못했어요. 앱을 업데이트한 뒤 다시 시도해 주세요.` |
| `src/services/profile-photo-upload.ts:31` | `앱을 한 번 다시 빌드해 주세요.` | `프로필 사진 기능을 사용할 수 없어요. 앱을 업데이트해 주세요.` |
| `src/services/trip-attachment-upload.ts:34` | `앱을 한 번 다시 빌드해 주세요.` | `첨부파일 기능을 사용할 수 없어요. 앱을 업데이트해 주세요.` |
| `src/screens/TripInfoEditScreen.tsx:497` | `실기기`, `Firebase/Google`, `scheme(plinmobile)` | 개발자 로그로만 남기고 사용자 문구에서는 제거 |

## P1: 권한이라는 단어의 의미가 섞임

타사 앱은 OS 권한은 "사진/카메라/위치 접근 허용"으로, 서비스 접근 제한은 "열람만 가능/구독 필요/삭제할 수 없음"으로 나눕니다.

개선 후보:
- `src/components/TimelineItemComposerModal.tsx:810`
  - 현재: `현재 위치 권한이 필요해요. 권한을 허용한 뒤 다시 눌러 주세요.`
  - 권장: `현재 위치를 보려면 위치 접근을 허용해 주세요.`
- `src/services/trip-memory-upload.ts:78`
  - 현재: `추억 사진을 올릴 권한이 없어요. 여행 편집 권한을 확인해 주세요.`
  - 권장: `이 여행은 열람만 가능해요. 편집 멤버에게 수정을 요청해 주세요.`
- `src/screens/CommunityScreen.tsx:1601`
  - 현재: `삭제 권한이 있는 계정에서만 진행돼요.`
  - 권장: `작성한 플랜만 삭제할 수 있어요.`
- `src/screens/TripDetailScreen.tsx:5026`
  - 현재: `현재 화면은 열람 전용이에요. 여행 소유자나 편집자에게 수정 권한을 요청해 주세요.`
  - 권장: `이 일정은 열람만 가능해요. 편집 멤버에게 수정을 요청해 주세요.`

## P1: 플랜/구독 문구 잔여 정리

`유료 큐레이션 플랜`은 소비자에게 상품 구조가 복잡하게 보입니다. PLIN Plus로 통일하는 편이 낫습니다.

| 위치 | 현재 문구 | 권장 문구 |
|---|---|---|
| `src/screens/CommunityScreen.tsx:874` | `구독 중인 계정만 유료 큐레이션 플랜을 내 일정으로 가져올 수 있어요.` | `PLIN Plus가 필요한 플랜이에요.` |
| `src/screens/CommunityScreen.tsx:911` | `이제 유료 큐레이션 플랜을 내 일정으로 가져올 수 있어요.` | `PLIN Plus가 활성화됐어요. 이제 내 일정으로 가져올 수 있어요.` |
| `src/screens/CommunityScreen.tsx:949` | `이제 유료 큐레이션 플랜을 내 일정으로 가져올 수 있어요.` | `구독을 복원했어요. 이제 내 일정으로 가져올 수 있어요.` |
| `src/screens/CommunityPostDetailScreen.tsx:510` | `이제 유료 큐레이션 플랜을 내 일정으로 가져올 수 있어요.` | `PLIN Plus가 활성화됐어요. 이제 내 일정으로 가져올 수 있어요.` |
| `src/screens/CommunityPostDetailScreen.tsx:541` | `이제 유료 큐레이션 플랜을 내 일정으로 가져올 수 있어요.` | `구독을 복원했어요. 이제 내 일정으로 가져올 수 있어요.` |
| `src/features/trip-detail/useTripDetailShareActions.ts:294` | `이 여행은 큐레이션 업로드 권한이 없어요.` | `지금은 이 일정을 공개할 수 없어요.` |

## P1: 반복형 오류 문구가 많음

`잠시 후 다시 시도해 주세요` 후보가 108개입니다. 모든 오류를 같은 문장으로 끝내면 앱이 원인을 모르는 것처럼 느껴집니다.

정리 기준:
- 네트워크: `연결이 돌아오면 다시 시도해 주세요.`
- 입력값: `입력한 내용을 확인해 주세요.`
- 스토어/구독: `스토어 계정을 확인해 주세요.`
- 파일/사진: `다른 파일을 선택해 주세요.`
- 위치/지도: `지도를 조금 옮겨 다시 검색해 주세요.`
- 서버/알 수 없는 오류: `잠시 후 다시 시도해 주세요.`

우선 정리 파일:
- `src/adapters/auth/FirebaseAuthSessionAdapter.ts`
- `src/adapters/trips/FirebaseTripRepository.ts`
- `src/components/InlinePlaceMapPicker.tsx`
- `src/services/plan-marketplace-purchases.ts`
- `src/screens/CommunityScreen.tsx`
- `src/screens/TripListScreen.tsx`

## P2: 기기 표현

`기기` 후보는 19개입니다. 일부는 "다른 기기에서 먼저 수정"처럼 동기화 충돌을 설명하는 데 쓸 수 있지만, 일반 설정 카피에서는 딱딱합니다.

권장:
- `이 기기에서 사용할 테마` -> `이 앱에서 사용할 테마`
- `이 기기에서 사용할 글꼴` -> `이 앱에서 사용할 글꼴`
- `기기 설정을 확인해 주세요` -> `휴대폰 설정을 확인해 주세요`
- `다른 기기에서 먼저 수정했어요` -> `다른 곳에서 먼저 수정됐어요`

우선 후보:
- `src/screens/SettingsScreen.tsx:909`
- `src/screens/SettingsScreen.tsx:940`
- `src/screens/SettingsScreen.tsx:1041`
- `src/screens/SettingsScreen.tsx:1153`
- `src/adapters/auth/android-google-signin.ts:49`
- `src/features/trip-detail/useTripDetailShareActions.ts:121`
- `src/screens/TripListScreen.tsx:1174`

## P2: AI식 완충 문구

`할 수 있어요`, `준비됐어요`, `확인해 주세요`, `중이에요` 후보가 140개입니다. 전부 문제가 있는 것은 아니지만, 버튼/설명/오류가 모두 이 말투로 끝나면 앱이 흐릿해집니다.

정리 기준:
- 성공: 결과만 말합니다. `저장했어요`
- 실패: 무엇이 안 됐는지와 다음 행동을 말합니다.
- 도움말: 한 줄만 둡니다.
- 설명이 없어도 UI 자체로 알 수 있으면 삭제합니다.

우선 후보:
- `src/screens/SettingsScreen.tsx:612`
  - 현재: `구독이 준비됐어요.`
  - 권장: `PLIN Plus가 활성화됐어요.`
- `src/components/TripShareSheet.tsx:450`
  - 현재: `비공개로 둘지, 링크로 공유할지 정하고 링크 권한도 함께 선택할 수 있어요.`
  - 권장: `공유 범위와 링크 접근을 선택해 주세요.`
- `src/features/trip-detail/useTripDetailShareActions.ts:328`
  - 현재: 공개 플랜 안내가 3줄 이상
  - 권장: `장소와 경로 중심으로 공개돼요. 상세 메모, 지출, 사진은 제외됩니다.`
- `src/screens/AuthGateScreen.tsx:729`
  - 현재: `이메일을 확인해 주세요.`
  - 권장: `메일함에서 인증 링크를 열어 주세요.`

## P2: 계정/설정 화면 설명 과밀

설정 화면은 타사 앱처럼 명사형 섹션과 짧은 행 설명이 어울립니다. 현재는 좋은 의도와 설명이 길게 섞인 곳이 있습니다.

우선 후보:
- `src/screens/SettingsAccountScreen.tsx:331`
  - 현재: `현재 연결된 로그인 수단만 먼저 보여드려요. 필요한 경우 다른 소셜 로그인도 펼쳐서 연결할 수 있어요.`
  - 권장: `연결된 로그인 수단을 관리해요.`
- `src/screens/SettingsAccountScreen.tsx:509`
  - 현재: 계정 삭제 설명이 한 문단에 매우 길게 들어감
  - 권장: 카드에는 `계정과 개인 데이터가 삭제돼요. PLIN Plus는 스토어에서 따로 해지해야 해요.`만 두고, 자세한 내용은 안내 페이지로 분리
- `src/screens/SettingsScreen.tsx:1041`
  - 현재: `프로필 사진과 이름을 이 기기에서 바로 바꿀 수 있어요.`
  - 권장: `프로필 사진과 이름을 바꿔요.`

## 권장 수정 순서

1. 내부/개발자 용어 P0 제거
2. 플랜/구독 문구를 `PLIN Plus` 중심으로 통일
3. OS 권한/편집 권한/구독 접근권 문구 분리
4. `잠시 후 다시 시도` 반복 문구를 오류 유형별로 분리
5. 설정/계정 설명을 짧은 행 설명으로 축약
6. TripCreate/TripDetail/TripList의 긴 도움말과 빈 상태를 화면별로 정리

## 이번 조사에서 바로 괜찮다고 본 점

- `App Store 또는 Google Play`처럼 두 스토어를 한 문장에 동시에 넣는 결제 문구는 현재 잡히지 않았습니다.
- 무료체험/가격/자동갱신/해지 안내를 분리하려는 방향은 이미 일부 반영되어 있습니다.
- 사진/첨부파일 오류는 대체로 사용자 행동을 제안하고 있어, 내부 용어 제거와 표현 축약 정도가 핵심입니다.

## 다음 단계

이 보고서 기준으로 바로 수정한다면 범위는 두 번에 나누는 편이 안전합니다.

1. P0/P1 문구만 우선 수정: 내부 용어, 플랜/구독, 권한 혼용
2. P2 문구 다듬기: 설정/계정/공유/빈 상태/반복 오류 축약
