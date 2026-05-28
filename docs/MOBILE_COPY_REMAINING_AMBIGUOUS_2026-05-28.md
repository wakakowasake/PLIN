# 모바일 앱 남은 애매 카피 후보

작성일: 2026-05-28

범위: `apps/mobile/src`

## 결론

수정하지 않은 카피가 전부 괜찮은 것은 아닙니다. 지난 수정은 내부 용어와 구독/플랜 쪽 P0 문구를 우선 정리한 것이고, 아래 문구들은 아직 PLIN 톤·제품 방향·소비자 이해 기준에서 애매합니다.

## 후보 목록

| 우선순위 | 영역 | 위치 | 현재 문구 | 애매한 이유 | 권장 방향 |
| --- | --- | --- | --- | --- | --- |
| P0 | Apple 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts:638` | Apple 인증을 완료하지 못했어요. | `인증`이 로그인/가입 화면에서 딱딱함 | Apple 로그인을 완료하지 못했어요. |
| P0 | Apple 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts:648` | Apple 인증 결과를 확인하지 못했어요. | 인증 결과라는 내부 처리 느낌 | Apple 로그인을 확인하지 못했어요. |
| P0 | Apple 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts:656` | Apple 로그인 토큰을 가져오지 못했어요. | 토큰은 사용자에게 보이면 안 되는 개발 용어 | Apple 로그인을 완료하지 못했어요. |
| P0 | 계정 연결 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts:349` | 기존 방식으로 로그인한 뒤 이 소셜 계정을 연결하세요. | 사용자가 기존 방식이 뭔지 모를 수 있고 명령조 | 가입한 로그인 방식으로 먼저 들어가 주세요. |
| P0 | 서버 오류 | `apps/mobile/src/services/backend-client.ts:92` | 요청에 실패했습니다. (status) | 서버/HTTP 냄새가 강함 | 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요. |
| P0 | 스토어 결제 | `apps/mobile/src/services/plan-marketplace-purchases.ts:386` | 스토어 설정을 확인한 뒤 다시 시도해 주세요. | 설정은 사용자가 해결할 수 없음 | 스토어 계정을 확인하거나 앱을 업데이트한 뒤 다시 시도해 주세요. |
| P0 | 관광 API | `apps/mobile/src/services/kto-tourism.ts:282` | contentId가 필요해요. | API 파라미터가 그대로 노출될 수 있음 | 관광지 정보를 불러오지 못했어요. |
| P0 | 관광 API | `apps/mobile/src/services/kto-tourism.ts:311` | baseYm, areaCode, sigunguCode가 필요해요. | API 파라미터가 그대로 노출될 수 있음 | 지역 정보를 불러오지 못했어요. |
| P0 | 프로필 | `apps/mobile/src/adapters/profile/FirebaseProfileSummaryAdapter.ts:130` | 프로필 사진 URL을 저장하지 못했어요. | URL은 내부 데이터 용어 | 프로필 사진을 저장하지 못했어요. |
| P1 | 항공편 | `apps/mobile/src/services/flight-status.ts:105` | 공개 운항 데이터 연결 전 임시 카드 | 내부 구현 상태가 보임 | 직접 입력한 항공편 |
| P1 | 플랜 공유 | `apps/mobile/src/screens/CommunityScreen.tsx:118` | PLIN 큐레이션 플랜을 확인해 보세요. | 큐레이션 플랜 명칭이 무겁고 반복적 | PLIN에서 이 플랜을 확인해 보세요. |
| P1 | 플랜 목록 | `apps/mobile/src/screens/CommunityScreen.tsx:736` | 큐레이션 플랜을 삭제할까요? | 사용자는 그냥 플랜으로 인식 | 플랜을 삭제할까요? |
| P1 | 플랜 목록 | `apps/mobile/src/screens/CommunityScreen.tsx:1296` | 큐레이션 플랜을 찾지 못했어요. | 검색 빈 상태가 딱딱함 | 조건에 맞는 플랜이 없어요. |
| P1 | 플랜 목록 | `apps/mobile/src/screens/CommunityScreen.tsx:1305` | PLIN이 준비한 큐레이션 플랜이 올라오면... | 공급자 시점이 강함 | 새 플랜이 올라오면 여기에 보여드릴게요. |
| P1 | 플랜 상세 | `apps/mobile/src/screens/CommunityPostDetailScreen.tsx:461` | 큐레이션 플랜을 삭제할까요? | 목록과 동일하게 명칭 과함 | 플랜을 삭제할까요? |
| P1 | 플랜 상세 | `apps/mobile/src/screens/CommunityPostDetailScreen.tsx:730` | 큐레이션 플랜을 찾을 수 없어요. | 구버전 커뮤니티 톤 | 플랜을 찾을 수 없어요. |
| P1 | 플랜 로딩 | `apps/mobile/src/hooks/useCommunityFeed.ts:173` | 최신 큐레이션 플랜을 다시 확인하지 못했어요. | 문장이 길고 시스템 메시지 느낌 | 최신 플랜을 불러오지 못했어요. |
| P1 | 플랜 오류 | `apps/mobile/src/adapters/community/FirebaseCommunityRepository.ts:489` | 신고할 큐레이션 플랜을 찾을 수 없어요. | 사용자 행동과 명칭이 과함 | 신고할 플랜을 찾을 수 없어요. |
| P1 | 플랜 오류 | `apps/mobile/src/adapters/community/FirebaseCommunityRepository.ts:544` | 삭제할 큐레이션 플랜을 찾을 수 없어요. | 사용자 행동과 명칭이 과함 | 삭제할 플랜을 찾을 수 없어요. |
| P1 | 데모 상태 | `apps/mobile/src/adapters/AdaptersProvider.tsx:57` | 큐레이션 플랜은 데모 데이터로 표시되고 있어요. | 데모 데이터가 사용자에게 보이면 신뢰도 하락 | 플랜을 불러오지 못해 예시를 보여주고 있어요. |
| P1 | 여행/일정 전환 | `apps/mobile/src/navigation/RootNavigator.tsx:589` | 여행 상세 | 제품을 일정/데이트로 확장하려는 방향과 충돌 | 일정 상세 또는 플랜 상세 |
| P1 | 여행/일정 전환 | `apps/mobile/src/navigation/RootNavigator.tsx:620` | 여행 정보 | 제품 방향과 충돌 | 일정 정보 |
| P1 | 여행/일정 전환 | `apps/mobile/src/navigation/RootNavigator.tsx:655` | 공유 여행 | 여행 외 목적에서 어색함 | 공유 일정 |
| P1 | 여행/일정 전환 | `apps/mobile/src/features/trip-creation.ts:3` | 새 여행 만들기 준비 중 | 일정/데이트 확장과 충돌 | 새 일정 만들기 준비 중 |
| P1 | 여행/일정 전환 | `apps/mobile/src/mappers/trip-summary-mapper.ts:192` | 제목 없는 여행 | 데이트/일정에도 노출 가능 | 제목 없는 일정 |
| P1 | 여행/일정 전환 | `apps/mobile/src/mappers/trip-detail-mapper.ts:117` | 여행 정보 준비 중 | 데이트/일정에 부자연스러움 | 일정 정보 준비 중 |
| P1 | 여행/일정 전환 | `apps/mobile/src/services/trip-share.ts:214` | 여행 보기 링크를 확인해 보세요. | 공유 대상이 여행으로 고정됨 | 일정 링크를 확인해 보세요. |
| P1 | 여행/일정 전환 | `apps/mobile/src/screens/PublicTripViewScreen.tsx:228` | 공유 여행을 여는 중이에요 | 여행 고정 표현 | 공유 일정을 여는 중이에요 |
| P1 | 여행/일정 전환 | `apps/mobile/src/screens/TripInfoEditScreen.tsx:609` | 여행 정보 편집 | 제품 방향과 충돌 | 일정 정보 편집 |
| P1 | 여행/일정 전환 | `apps/mobile/src/screens/TripDetailScreen.tsx:4548` | 여행 정보를 불러오는 중 | 제품 방향과 충돌 | 일정 정보를 불러오는 중 |
| P1 | 여행/일정 전환 | `apps/mobile/src/screens/TripListScreen.tsx:1065` | 여행이 삭제한 여행으로 이동해요. | 일정/데이트에서 어색함 | 삭제한 일정으로 이동해요. |
| P1 | 여행/일정 전환 | `apps/mobile/src/screens/SettingsScreen.tsx:888` | 삭제한 여행 | 일정 앱 방향과 충돌 | 삭제한 일정 |
| P1 | 여행/일정 전환 | `apps/mobile/src/screens/CommunityScreen.tsx:1052` | 일정을 내 일정 목록에 추가했어요. | 플랜 가져오기 UX와 충돌 | 내 일정에 추가했어요. |
| P1 | 여행/일정 전환 | `apps/mobile/src/screens/TripCreateScreen.tsx:775` | 도시와 여행지를 중심으로 며칠짜리 일정을 만들어요. | 데이트 생성과 같은 화면에서 여행 중심 설명 | 목적에 맞는 장소와 날짜로 일정을 만들어요. |
| P1 | 권한 표현 | `apps/mobile/src/screens/TripDetailScreen.tsx:5026` | 수정 권한을 요청해 주세요. | 권한이라는 단어가 서비스/OS 권한과 섞임 | 편집 멤버에게 수정을 요청해 주세요. |
| P1 | 권한 표현 | `apps/mobile/src/screens/TripListScreen.tsx:2515` | 초대 링크와 권한을 바로 관리할 수 있어요. | 권한보다 역할/접근이 자연스러움 | 초대 링크와 멤버 역할을 관리할 수 있어요. |
| P1 | 권한 표현 | `apps/mobile/src/adapters/trips/FirebaseTripRepository.ts:1006` | 세션이 만료됐거나 권한이 바뀌어... | 세션/권한 조합이 시스템 메시지 같음 | 로그인 상태가 바뀌어 저장하지 못했어요. |
| P1 | 권한 표현 | `apps/mobile/src/adapters/trips/FirebaseTripRepository.ts:1344` | 이 여행을 볼 권한이 없어요. | 접근 제한을 권한으로만 말함 | 이 일정을 볼 수 없어요. |
| P1 | 계정 삭제 | `apps/mobile/src/screens/SettingsAccountScreen.tsx:185` | 커뮤니티 활동, 업로드 파일과 개인 데이터 | 업로드/커뮤니티가 기능명처럼 보임 | 공개한 플랜, 올린 파일, 개인 데이터 |
| P1 | 계정 삭제 | `apps/mobile/src/screens/SettingsAccountScreen.tsx:509` | 공유 여행은 남은 멤버에게 소유권이 넘어갈 수 있어요. | 여행 고정 + 법적 안내처럼 딱딱함 | 공유 일정은 남은 멤버에게 이어질 수 있어요. |
| P2 | 기본 사용자명 | `apps/mobile/src/mappers/community-mapper.ts:16` | 익명의 여행자 | 일정/데이트 앱으로 확장 시 좁음 | 익명 사용자 |
| P2 | 기본 사용자명 | `apps/mobile/src/components/ProfileSummaryCard.tsx:33` | PLIN 여행자 | 제품 확장 방향과 충돌 | PLIN 사용자 |
| P2 | 로딩/빈 상태 | `apps/mobile/src/hooks/useTripDetail.ts:104` | 현재는 마지막으로 불러온 내용을 계속 보여주고 있어요. | 길고 시스템 상태 설명 느낌 | 마지막으로 불러온 내용을 보여드릴게요. |
| P2 | 로딩/빈 상태 | `apps/mobile/src/hooks/useTripList.ts:220` | 현재는 마지막으로 불러온 목록을 보여주고 있어요. | 길고 설명적 | 마지막으로 불러온 목록을 보여드릴게요. |
| P2 | 장소 검색 | `apps/mobile/src/services/trip-place-search.ts:7` | 장소 이름만 입력하고 계속 만들 수 있어요. | “계속 만들 수”가 어색함 | 장소 이름만 입력해도 추가할 수 있어요. |
| P2 | 자동 경로 | `apps/mobile/src/services/trip-quick-route-search.ts:5` | 앞뒤 장소 정보를 확인한 뒤 다시 시도해 주세요. | 사용자가 “앞뒤 장소”를 바로 이해하기 어려움 | 이전/다음 장소를 확인해 주세요. |
| P2 | 추천/빈 상태 | `apps/mobile/src/screens/TripListScreen.tsx:1895` | 추천 여행지를 확인하고 영감을 얻어보세요. | 랜딩페이지식 카피 | 추천 장소를 둘러보세요. |
| P2 | iPad 안내 | `apps/mobile/src/screens/TabletRootShell.tsx:280` | 1차 전환에서는 기존 새 여행 화면의 검증과 저장 로직을 그대로 사용하고... | 개발 계획 문구가 앱에 노출됨 | iPad에서도 새 일정을 만들 수 있어요. |

## 괜찮다고 본 문구

| 유형 | 판단 |
| --- | --- |
| 사진/카메라/파일/위치/알림 권한 | OS 권한 요청 맥락이라 `권한` 표현 유지 가능 |
| 법적 약관명 | `유료서비스 약관`, `개인정보처리방침`은 정확성이 우선이라 유지 가능 |
| 결제 화면의 App Store / Google Play | 스토어별 안내가 필요하므로 유지 가능 |
| 파괴적 액션의 삭제/영구 삭제 | 경고성이 필요하므로 유지 가능 |

## 다음 수정 우선순위

1. Apple 로그인 토큰/인증 문구, 관광 API 파라미터, HTTP 실패 문구 같은 P0 잔여 내부 용어 제거
2. `큐레이션 플랜` 잔여를 `플랜` 또는 `PLIN Plus 플랜`으로 통일
3. 제품 전환 기준에 맞춰 `여행` 고정 카피를 `일정` 중심으로 단계 교체
4. `권한`을 OS 권한, 멤버 역할, 구독 제한으로 분리
