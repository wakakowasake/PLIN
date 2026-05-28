# 모바일 앱 카피 우선순위 추가 정리 리포트

작성일: 2026-05-28

기준 문서: `docs/MOBILE_COPY_STYLE_GUIDE.md`

## 적용 기준

| 기준 | 적용 방향 |
| --- | --- |
| P0 내부 용어 | 토큰, URL, API 파라미터, HTTP 실패, Firebase 설정 같은 개발/운영 용어를 사용자 문구에서 제거 |
| P1 플랜 체계 | 커뮤니티/큐레이션/업로드 중심 문구를 플랜/공개/내 일정 중심으로 정리 |
| P1 일정 체계 | 여행·데이트를 포함하는 상위 개념은 `일정`으로 통일 |
| P1 권한 표현 | OS 권한은 유지하되, 서비스 접근/편집 제한은 역할과 행동 중심으로 변경 |
| 유지 예외 | 목적 선택의 `여행`, 인기 여행지, 여행지 데이터, 여행 생성 화면의 목적 설명은 의미가 명확해 유지 |

## 수정 셀 리포트

| 우선순위 | 영역 | 주요 파일 | 변경 전 | 변경 후 | 비고 |
| --- | --- | --- | --- | --- | --- |
| P0 | Apple/이메일/소셜 로그인 | `apps/mobile/src/adapters/auth/FirebaseAuthSessionAdapter.ts` | Apple 인증, 토큰, 기존 방식 | Apple 로그인, 가입한 로그인 방식 | 내부 인증 용어 제거 |
| P0 | 공통 요청 오류 | `apps/mobile/src/services/backend-client.ts` | 요청에 실패했습니다. (status) | 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요. | HTTP 상태 노출 제거 |
| P0 | 관광 API 오류 | `apps/mobile/src/services/kto-tourism.ts` | contentId/baseYm/areaCode 필요 | 관광지/지역 정보를 불러오지 못했어요. | API 파라미터 노출 제거 |
| P0 | 프로필/항공편 | `FirebaseProfileSummaryAdapter.ts`, `flight-status.ts` | 사진 URL, 임시 카드 | 프로필 사진, 직접 입력한 항공편 | 데이터 구조/임시 상태 숨김 |
| P0 | 서버 인증 문구 | `functions/auth-social.js`, `functions/index.js` | 로그인이 필요합니다. | 로그인이 필요해요. | 앱 토스트 톤과 통일 |
| P1 | 공통 제목 검증 | `shared/features/trips/trip-title.js`, `trip-canonical.js`, `trip-create-helpers.js` | 여행 제목 | 일정 제목 | 서버/앱 공통 검증 기준 변경 |
| P1 | 서버 일정 오류 | `functions/index.js` | 여행 목록/상세/사본/복구/삭제 | 일정 목록/상세/사본/복구/삭제 | 앱에 그대로 표시되는 백엔드 메시지 정리 |
| P1 | 플랜 공개/가져오기 | `CommunityScreen.tsx`, `useCommunityFeed.ts`, community adapters | 큐레이션 플랜, 업로드, 내 일정 | 플랜, 공개, 내 일정 | 커뮤니티에서 플랜 체계로 정리 |
| P1 | 플랜 공유 문구 | `CommunityScreen.tsx`, `CommunityPostDetailScreen.tsx` | PLIN 큐레이션 플랜 확인 | PLIN에서 플랜 확인 | 공유 문장 축약 |
| P1 | 일정 상세/목록 | `TripDetailScreen.tsx`, `TripListScreen.tsx`, `RootNavigator.tsx` | 여행 상세/정보/목록/바로 가기 | 일정 상세/정보/목록/바로 가기 | 여행·데이트 포함 상위 체계 적용 |
| P1 | 공유/멤버 | `TripShareSheet.tsx`, `useTripDetailShareActions.ts` | 여행 공유, 여행에 참여, 권한 제거 | 일정 공유, 일정에 참여, 내보내기 | 역할/행동 중심 |
| P1 | 삭제/복구/기록 | `SettingsScreen.tsx`, `TripRevisionHistorySheet.tsx` | 삭제한 여행, 여행 복구, 여행 내용 수정 | 삭제한 일정, 일정 복구, 일정 내용 수정 | 설정/기록 흐름 통일 |
| P1 | 첨부/알림/사진 | `trip-attachment-upload.ts`, `trip-reminders.ts`, upload services | 여행 계획당, 여행 일정 알림, 이 여행은 열람만 가능 | 일정당, 일정 알림, 이 일정은 열람만 가능 | 기능별 반복 문구 정리 |
| P2 | 홈/빈 상태 | `TripListScreen.tsx` | 지금 여행 중, 여행 바로 가기, 추천 여행지 | 진행 중, 일정 바로 가기, 추천 장소 | 일정·데이트 확장에 맞춤 |
| P2 | 태블릿/웹 패널 | `TabletRootShell.tsx`, `TripWorkspaceMapPanel.web.tsx` | 여행, 새 여행, 여행 지도 | 일정, 새 일정, 일정 지도 | 큰 화면 보조 UI 정리 |
| P2 | 기본 사용자명 | `MockCommunityRepository.ts`, `shared/features/community/community-item-helpers.js` | 익명의 여행자/먹방 여행자 | PLIN 사용자 | 여행자 페르소나 고정 제거 |

## 남긴 표현

| 표현 | 판단 |
| --- | --- |
| `여행` 목적 필터 | 여행/데이트 중 하나를 고르는 명확한 카테고리라 유지 |
| `인기 여행지`, `선택한 여행지` | 여행 목적 생성 화면의 장소 선택 문맥이라 유지 |
| 여행지 데이터의 `대표 여행지`, `국내 여행지` | 실제 관광지 데이터 설명이라 유지 |
| `사진 접근 권한`, `파일 접근 권한` | OS 권한 문맥이라 유지 |
| 서버/앱 오류 분류용 `여행 제목` 비교 문자열 | 과거 서버 메시지를 `일정 제목`으로 바꾸기 위한 호환 처리라 유지 |

## 확인 필요

| 항목 | 이유 |
| --- | --- |
| 홈 카피 | 기존 요청의 `지금 여행 중이시네요!`에서 최신 제품 방향에 맞춰 `진행 중인 일정이 있어요!`로 바꿨으므로 실기기에서 톤 확인 필요 |
| 여행 생성 화면 | 목적이 `여행`일 때는 여행지 문구가 맞으나, 추후 데이트 장소 DB가 커지면 목적별 카피를 더 분리할 수 있음 |
| 서버 배포 | `functions/` 카피도 정리했지만, 실제 사용자 반영은 Firebase Functions 배포 후 적용됨 |

## 검증 결과

| 명령 | 결과 | 메모 |
| --- | --- | --- |
| `cd apps/mobile && npm run typecheck` | 통과 | TypeScript 오류 없음 |
| `cd apps/mobile && npm run report:copy-audit` | 통과 | `reports/mobile-copy-audit.csv` 갱신 |
| `node --check functions/index.js` | 통과 | Functions 문법 오류 없음 |
| `git diff --check` | 통과 | 공백/패치 포맷 문제 없음 |
| `cd apps/mobile && npm run audit:spacing` | 통과 | 기존 transform-offset review 경고만 출력 |
| `cd apps/mobile && npm run report:radius-full` | 통과 | 기존 radius.full 사용 현황 리포트 출력 |
