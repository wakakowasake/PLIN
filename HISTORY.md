# 📝 개발 히스토리

> AI 지원 개발 변경사항 자동 기록

---

## [2.3.7] - 2026-01-22
### Added
- **라이트박스 슬라이드 전환 효과**: 추억 사진을 넘길 때 정적으로 바뀌지 않고, 좌우 방향에 맞춰 부드럽게 밀려 들어오는 애니메이션을 추가하여 감상 경험을 고도화했습니다. (편집 모드 및 공유 뷰어 공통 적용)

### 14:35 - [AI] 라이트박스 사진 전환 슬라이드 효과 구현
- **변경 파일**: public/css/style.css, public/js/ui/modals.js, public/js/viewer.js, HISTORY.md, task.md, walkthrough.md

---

## [2.3.6] - 2026-01-22
### Fixed
- **라이트박스(Lightbox) 시스템 안정화**: 
    - `constants.js`에 누락되었던 `MODAL_LIGHTBOX` 상수를 추가하고 `z-index: 300`을 부여하여 가시성 문제해결
    - `memories.js`에서 라이트박스 호출 시 파라미터(`dayIndex`, `itemIndex`) 순서가 뒤섞여 잘못된 이미지가 표시되던 중대한 버그 수정
- **z-index 체계 정합성 확보**: 모든 모달 및 오버레이 요소가 `constants.js`에 정의된 중앙 집중식 계층 구조를 따르도록 보강

### 14:25 - [AI] 라이트박스 z-index 정상화 및 호출 로직 버그 수정
- **변경 파일**: public/js/ui/constants.js, public/js/ui/memories.js, HISTORY.md, task.md, walkthrough.md

---

## [2.3.5] - 2026-01-22
### Added
- **쇼핑 추천 비주얼 효과 개선**: 
    - 추천 항목에 위아래로 부드럽게 움직이는 **'부유(Floating)' 애니메이션** 적용
    - 가독성을 위해 추천 항목 내 '추천' 텍스트 뱃지 제거 및 색상/그림자 강조로 대체
- **상세 모달 컨텍스트 연동**: 일정 상세 모달에서 지출 추가 시에도 해당 장소와 매칭되는 쇼핑 항목을 자동으로 추천하는 로직 구현

### Fixed
- **지출 및 쇼핑 연동 오류 수정**: 
    - `modals.js` 내 전역 변수 참조 오류(`ReferenceError`) 및 `expense-manager.js`와의 중복 로직 통합 해결
    - 지출 저장 시 실제 데이터(`travelData`) 반영 및 총 예산 실시간 갱신 문제 해결
- **모달 계층 및 가시성 개선**: 
    - 쇼핑 리스트 선택 모달이 지출 모달 뒤에 가려지는 Z-index 이슈 해결
    - 모달 오픈 시 DOM 순서 보장을 통해 레이어 우선순위 최적화
- **데이터 동기화 안정화**: 
    - 리스트 관리 창에서 항목 삭제 시 UI 및 일정 상세 모달에 즉시 반영되지 않던 문제 해결
    - 장소 매칭 로직에 `trim()` 등 예외 처리 강화로 정확도 향상

### 14:15 - [AI] 지출/쇼핑 통합 로직 개선 및 추천 비주얼 효과 고도화
- **변경 파일**: public/js/ui/modals.js, public/js/ui/expense-manager.js (삭제/통합), public/js/ui.js, public/css/style.css, HISTORY.md, task.md, implementation_plan.md, walkthrough.md

---

## [2.3.4] - 2026-01-22
### Fixed
- **콘솔 404 에러 완전 해결**: 
    - `error-guard.js`, 아이콘, 매니페스트 등이 빌드 시 누락되거나 경로가 바뀌는 문제 해결
    - `public/static` 구조 도입 및 Vite `publicDir: 'static'` 설정을 통한 정적 자산 서빙 안정화
- **브라우저 성능 경고(Violation) 제거**: 
    - 인라인으로 등록된 `touchstart`, `touchmove` 리스너를 JS의 `{ passive: false }` 리스너로 전면 교체
    - `#trip-info-container` ID 보강 및 CSS `touch-action: none !important` 적용으로 스크롤 성능 경고 해결
- **에러 가드 안정화**: `error-guard.js`를 의존성 없는 독립 스크립트로 리팩토링 및 비모듈 로드 방식으로 초기 오류 포착 능력 강화

### Optimized
- **콘솔 노이즈 제거**: `performance.js`, `ui.js` 등에서 부차적인 디버깅 로그들을 `logger.debug`로 전환하거나 제거
- **PWA 캐싱 전략**: Service Worker(`sw.js`) 내의 정적 캐시 목록에서 해싱되는 파일을 제거하고 런타임 캐싱으로 전환하여 설치 에러 방지
- **로거 전역화**: `window.logger`를 통해 모든 모듈에서 안전하게 로깅 시스템에 접근 가능하도록 개선

### 00:15 - [AI] 콘솔 클린업 및 정적 자산 구조 최적화 완료
- **변경 파일**: public/static/ (신설), vite.config.js, public/index.html, public/js/ui.js, public/js/ui/renderers.js, public/js/error-guard.js, public/static/sw.js, HISTORY.md, ONBOARDING.md

---

## [2.3.3] - 2026-01-21
### Fixed
- '추억 남기기' 모달이 상세 모달 뒤에 가려지는 Z-index 레이어 충돌 문제 해결
- `public/js/ui/constants.js`에 `Z_INDEX` 통합 관리 시스템 도입 (상세: 150, 입력: 210)

### Optimized
- **프로젝트 구조 단일화**: 중복되던 `assets/` 디렉토리를 제거하고 모든 자산을 `public/`으로 통합
- **Vite 설정 최적화**: `vite.config.js`에서 `publicDir` 설정을 제거하여 `public/`을 유일한 소스 및 자산 루트로 확립
- **코드 클린업**:
    - `index.html` 내 구형 모달 잔재(`경로 삭제`, `시간 재계산` 등) 전수 제거
    - 디버깅용 콘솔 로그(`[Z-DEBUG]`) 및 인덱스 파일 내 버전 쿼리 스트링 삭제
    - `ui-transit.js` 내 중복된 전역 함수 바인딩 로직 정리

### 22:15 - [AI] 모달 Z-index 체계 정규화 및 프로젝트 구조 최적화
- **변경 파일**: public/js/ui/constants.js, public/js/ui-transit.js, public/js/ui/modals.js, public/js/ui/memories.js, public/index.html, vite.config.js, HISTORY.md

## [2.3.2] - 2026-01-21
### Fixed
- Firebase Performance SDK API 오용 수정 (`perf.trace is not a function` 에러 해결)
- `performance.js` 파일을 최신 Modular API 방식으로 리팩토링
- 안드로이드 자산 내 `performance.js` 동기화 및 문법 오류 수정
- Vite WebSocket(HMR) 연결 오류 수정 (`host: true` 및 `hmr` 설정 추가)
- 이동 수단 상세 모달 내 하위 모달(추억 추가 등) `z-index` 겹침 현상 수정

## [2.3.1] - 2026-01-21
### Added
- 모바일 내비게이션 및 모달 뒤로가기 버튼 연동 기능 구현
    - `history.pushState` 및 `popstate` 이벤트를 이용한 SPA 방식의 내비게이션 관리
    - 모달 오픈 시 브라우저 히스토리 상태를 저장하여 뒤로가기 시 모달만 닫히도록 개선
    - 여행 계획 페이지에서 뒤로가기 시 메인 목록으로 자연스럽게 이동하도록 처리
    - `ui.js` 내 중앙 집중식 모달 관리 함수 `closeAllModals` 추가

### Fixed
- `modals.js` 내 쇼핑 리스트 선택 모달 렌더링 코드 깨짐 현상 수정
- `flight-manager.js`와 `ui-transit.js` 간의 모달 오픈 로직 일관성 확보

## [2.3.0] - 2026-01-21

### 16:51 - [x] 이동 수단 모달 z-index 문제 수정 `2026-01-21`
    - [x] 모달 간 z-index 계층 분석
    - [x] CSS 및 HTML 클래스 수정
    - [x] 레이어 겹침 현상 검증
### 16:51 - [x] Firebase Performance 에러 수정 `2026-01-21`
    - [x] `assets/js/performance.js` 리팩토링
    - [x] `android/` 자산 내 파일 동기화
- [x] `HISTORY.md` 업데이트 및 커밋
- **버그 수정**: `stopTrace is not an export` (SyntaxError) 해결
  - 원인: `PerformanceTrace`는 인스턴스 메서드(`.start()`, `.stop()`)를 사용해야 함을 간과함
  - 조치: `trace(perf, name)` 함수로 객체 생성 후 인스턴스 메서드 호출 방식으로 최종 수정
- **변경 파일**: public/js/performance.js, HISTORY.md

### 16:50 - [AI] Firebase Performance SDK API 사용 방식 수정
- **버그 수정**: `ve.trace is not a function` (TypeError) 오류 해결
  - 원인: Modular SDK(v10)를 사용하면서 Namespaced 방식(`.trace()`)으로 호출함
  - 조치: Modular functional 방식(`trace()`, `startTrace()`, `stopTrace()` 등)으로 코드 전면 수정
- **변경 파일**: public/js/performance.js, HISTORY.md

### 16:44 - [AI] 개인정보처리방침 페이지 추가
- **기능 추가**: 법적 필수 사항인 개인정보처리방침(`privacy.html`) 페이지 생성 및 적용
- **조치 내용**: 
  1. 사용자 제공 텍스트 기반으로 프리미엄 디자인의 `public/privacy.html` 생성
  2. `vite.config.js`에 멀티 페이지 빌드 엔트리 추가
  3. `public/index.html` 하단 푸터(Footer)에 해당 페이지 링크 연결
- **변경 파일**: public/privacy.html, public/index.html, vite.config.js, HISTORY.md

### 16:36 - [AI] Firestore 보안 규칙 최적화 및 읽기 권한 강화
- **보안 강화**: 비공개 여행에 대한 읽기(조회) 권한도 작성자 및 멤버로 제한
  - `isMember` 헬퍼 함수를 통해 권한 체크 로직 통합
  - 불필요한 코드 정리 및 규칙 구조 개선
- **변경 파일**: firestore.rules, HISTORY.md

### 16:25 - [AI] Firestore 보안 규칙 강화 (긴급 패치)
- **보안 수정**: 여행 계획의 수정/삭제 권한 IDOR 취약점 해결
  - `allow update/delete: if isAuthenticated()` -> `if canModifyTrip(resource)`로 변경
  - `canModifyTrip`: 생성자(`createdBy`), 멤버(`members`), 또는 구형 데이터(`userId`) 일치 여부 확인
- **변경 파일**: firestore.rules, HISTORY.md

### 16:07 - [AI] 공유 페이지 정적 자산 경로 수정
- **버그 수정**: 공유 뷰어(`/v/:id`)에서 `style.css` 및 `viewer.js` 로드 실패(404) 문제 해결
- **조치 내용**: 
  1. `openview.html`의 리소스 경로를 절대 경로(`/`)로 수정
  2. `copy` 명령을 통해 `public/js` 및 `public/css/style.css`를 `assets/` 디렉토리로 강제 동기화 (배포 시 포함되도록 조치)
- **변경 파일**: functions/openview.html, assets/ (파일 복사), HISTORY.md

### 15:58 - [AI] Firebase Performance 초기화 오류 수정
- **버그 수정**: `Firebase: No Firebase App '[DEFAULT]'` 오류 해결을 위해 성능 모니터링(`getPerformance`) 호출 시점을 `firebaseReady` 완료 이후로 지연시킴
- **변경 파일**: public/js/performance.js

### 15:52 - [AI] UI 여백 및 삭제 모달 개선
- **UX 개선**: 추억 사진 및 여행 목록 삭제 시 브라우저 기본창 대신 커스텀 삭제 모달(`openConfirmationModal`) 적용하여 일관성 확보
- **UI 개선**: 계획 페이지 하단(`detail-view`)에 충분한 여백(`pb-64` + Spacer)을 추가하여 푸터와의 간격 확보
- **변경 파일**: public/js/ui/modals.js, public/js/ui/memories.js, public/js/ui/trips.js, public/index.html, HISTORY.md

### 15:20 - [AI] 정적 자산(파비콘, 이미지) 배포 누락 문제 해결
- **오류 수정**: `vite.config.js`의 경로 설정(`publicDir: '../assets'`) 차이로 인해 배포 시 이미지와 아이콘이 404가 뜨는 문제 해결
- **조치 내용**: `public` 디렉토리의 주요 정적 파일들을 `assets` 디렉토리로 동기화하고 빌드 파이프라인 재실행
- **변경 파일**: assets/ (파비콘 및 이미지 복사), HISTORY.md

### 15:10 - [AI] 이동수단 지출 추가 시 스크롤 잠금 오류 수정
- **버그 수정**: 이동수단 상세 모달에서 지출 추가 후 모달이 닫힐 때 스크롤 잠금(`overflow: hidden`)이 해제되지 않는 문제 해결
  - `saveRouteExpense` 함수에서 `window.closeExpenseModal()`을 호출하도록 변경하여 정상적인 모달 종료 및 스크롤 복구 처리
- **변경 파일**: public/js/ui-transit.js, HISTORY.md

### 15:00 - [AI] 지출 관리 기능 안정화 및 오류 수정
- **버그 수정**: 지출/경로 상세 모달에서 데이터 접근 시 발생하던 `TypeError` 및 `NaN` 오류 수정
  - `saveExpense`: 유효하지 않은 타겟에 대한 방어 로직 추가
  - `viewRouteDetail`: 잘못된 인덱스 전달 시 크래시 방지 및 `null` 금액 데이터에 대한 예외 처리 (`toLocaleString`)
  - `saveRouteExpense`: 금액 입력 값의 콤마(,) 제거 로직 추가로 `NaN` 저장 문제 해결
  - `deleteExpenseFromDetail`: 삭제 시 아이템 존재 여부 검증 강화
- **변경 파일**: public/js/ui/modals.js, public/js/ui-transit.js, public/js/ui.js, HISTORY.md

### 14:30 - [AI] 동적 OG 태그 적용 및 공유 링크 형식 개선
- **기능 구현**: 여행 공유 시 SNS 미리보기(OG 태그)가 동적으로 생성되도록 Cloud Functions 엔드포인트(`/v/:tripId`) 구현 및 배포
- **UI 개선**: 공유 링크 생성 시 동적 태그가 적용된 URL(`/v/...`)을 기본으로 사용하도록 변경
- **배포 수정**: `openview.html` 템플릿 누락 문제 해결 및 Functions 배포 완료
- **변경 파일**: functions/index.js, functions/openview.html, public/js/ui/header.js, HISTORY.md

### 13:16 - [AI] 오픈 뷰어 버튼 디자인 미세 조정
- **UI 최적화**: '나도 계획 만들기' 버튼의 좌우 패딩을 줄여(`px-8` -> `px-5`) 버튼 폭을 슬림하게 조정
- **변경 파일**: public/openview.html, HISTORY.md

### 13:15 - [AI] 배포 오류 조치 및 UI 반영
- **부분 배포 완료**: Functions의 Pub/Sub API 지연으로 인한 전체 배포 실패를 Hosting 단독 배포로 우회하여 UI 변경 사항 반영 완료
- **조치 내용**: `dist` 빌드 후 `firebase deploy --only hosting` 실행
- **변경 파일**: HISTORY.md

### 13:10 - [AI] 일차 탭 폰트 크기 상향 조정
- **가독성 개선**: 일차 별 탭(전체, 1일차 등)의 텍스트 크기 상향 (`text-xs` -> `text-base`)
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 13:05 - [AI] 오픈 뷰어 배경색 동기화
- **디자인 일관성**: 오픈 뷰어(`openview.html`)의 배경색을 메인 페이지와 동일한 `bg-manuscript`(#f9f5eb)로 변경
- **변경 파일**: public/openview.html, HISTORY.md

### 13:00 - [AI] 디자인 미세 조정 (시계 축소 및 볼드 제거)
- **스타일 최적화**: 타임라인 시계 크기 하향 조정 (`text-lg` -> `text-base`)
- **스타일 최적화**: 장소 및 이동 수단 카드의 제목, 체류 시간에서 `font-bold` 제거
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 12:55 - [AI] 메모 상세 수정 연동 및 스크롤 버그 최종 해결
- **수정 완결**: 우클릭 '수정' 클릭 시 및 상세 모달 내 '수정' 버튼 작동 불가 문제 해결
- **내용**: `openMemoModal`에 인덱스 전달 로직 추가 및 `onclick` 핸들러의 전역 참조(`Modals.`) 수정
- **버그 수정**: 'X' 버튼 클릭 시 스크롤 잠금이 해제되지 않던 문제 해결
- **변경 파일**: public/js/ui.js, public/js/ui/modals.js, HISTORY.md

### 12:51 - [AI] 메모 상세 수정 연동 및 스크롤 버그 해결
- **기능 개선**: 메모 수정 시 전용 입력창 대신 상세 모달의 수정 모드가 직접 열리도록 변경 (사용자 요청 반영)
- **버그 수정**: 메모 상세 모달 종료 후 스크롤이 작동하지 않던 문제 해결 (배경 클릭 닫기 추가 및 스크롤 잠금 해제 보강)
- **변경 파일**: public/js/ui.js, public/js/ui/modals.js, HISTORY.md

### 12:48 - [AI] 메모 카드 수정 로직 개선 (전용 모달 연동)
- **기능 개선**: 메모 수정 시 장소 모달 대신 전용 메모 수정 모달(`openManualInputModal`)이 열리도록 개선
- **수정 내용**: `ui.js`의 `editTimelineItem` 내 메모 분기 추가 및 `buildMemoCard`의 클릭 핸들러 상속 로직 수정
- **변경 파일**: public/js/ui.js, public/js/ui/renderers.js, HISTORY.md

### 12:45 - [AI] 메모 카드 우클릭 수정 버그 해결
- **버그 수정**: 종속된 메모 카드 우클릭 시 부모 장소가 수정되던 문제 해결
- **수정 내용**: `buildMemoCard`에 독립적인 컨텍스트 메뉴 핸들러 추가 및 이벤트 버블링 차단(`stopPropagation`)
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 12:42 - [AI] 메모 카드 카메라 버튼 제거
- **기능 조정**: 메모 카드에서 불필요한 추억 추가(카메라 아이콘) 버튼 제거
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 12:40 - [AI] 추억 및 메모 출력 순서 조정
- **순서 조정**: 카드 내용 바로 밑에 추억(사진)들이 먼저 나오고, 그 아래에 메모가 오도록 순서 변경
- **수정 내용**: `renderTimelineItemHtml` 및 `renderTimelineItemHtmlPlanner` 함수 내 렌더링 순서 스왑
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 12:35 - [AI] 메모 카드 종속형 배치 개선 (레이아웃 최적화)
- **UI 개선**: 메모 카드를 이전 일정(장소, 이동수단 등) 아래에 종속된 형태로 렌더링
- **효과**: 시간 레이블 공백 제거 및 다이어리 스타일의 소속감 강화
- **수정 내용**: `renderItinerary` 루프에서 메모 그룹화 로직 적용 및 통합 렌더링 구현
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 12:28 - [AI] 메모 카드 디자인 개선 (시간 제거 및 스타일 강화)
- **UI 개선**: 메모 카드에서 시간(시간 카드/아이콘) 표시 제거
- **스타일링**: 메모 카드 상단에 테이프 효과 추가 및 무작위 회전 적용하여 감성 스타일 강화
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 12:25 - [AI] 메모 추가 버그 수정
- **버그 수정**: 메모 추가 시 도보(Transit) 항목이 자동 생성되던 문제 해결
- **수정 내용**: `modals.js`의 `selectAddType` 함수에서 `'note'` 타입 처리 추가 및 `index.html` 인자 통일
- **변경 파일**: public/js/ui/modals.js, public/index.html, HISTORY.md

### 12:21 - [AI] 추억 UI 개선 (감성 스타일 강화)
- **UI 개선**: 추억(사진/메모) 요소를 타임라인 카드 외부로 분리
- **스타일링**: 각 추억 요소에 테이프 효과(Tape effect) 및 무작위 회전(rotate) 적용
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 12:20 - [AI] 배경 격자 제거 및 테마 정리
- **테마 수정**: `.bg-manuscript` 클래스에서 격자 패턴(linear-gradient) 제거하여 깔끔한 단색 배경 적용
- **변경 파일**: public/css/input.css, HISTORY.md

### 12:17 - [AI] 폰트 크기 2차 미세 조정 (사용자 피드백 반영)
- **추가 조정**:
  - 장소 태그 및 주요 정보 텍스트(시간, 소요시간, 메모 등): `text-lg` → `text-base` (한 단계 더 하향)
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 11:59 - [AI] 폰트 크기 미세 조정 (사용자 피드백 반영)
- **미세 조정**:
  - 타임라인 시계: `text-2xl` → `text-lg` (2단계 하향)
  - 장소 태그: `text-xl` → `text-lg` (1단계 하향)
- **변경 파일**: public/js/ui/renderers.js, HISTORY.md

### 11:55 - [AI] 폰트 크기 표준화 및 가독성 개선
- **표준화**: '메모먼트꾹꾹' 폰트 특성에 맞춰 전역적으로 폰트 크기 위계를 재설정
  - 타임라인 시계: `text-xl` → `text-2xl`
  - 카드 제목: `text-xl` → `text-2xl`
  - 배지 및 본문 텍스트: `text-xs`/`text-sm` → `text-base`/`text-lg`로 상향
- **가독성**: 이동 수단 상세 모달 및 주소 표시줄의 텍스트 크기를 키워 시각적 균형과 가독성 동시 확보
- **변경 파일**: public/js/ui/renderers.js, public/js/ui-transit.js, HISTORY.md

### 20:30 - [AI] 플래너 원고지 테마 적용 및 전역 폰트 교체
- **디자인 테마**: '원고지(Manuscript)' 컨셉 적용
  - 따뜻한 크림색 배경(`#f9f5eb`)과 부드러운 회색 격자 눈금 구현
  - 모든 카드(타임라인, 이동수단 등)의 모서리를 직각(`rounded-sm`)으로 변경하여 종이 느낌 강조
  - 카드 상단에 투명 테이프 효과를 추가하여 다이어리 감성 극대화
- **폰트 전역 교체**: '나눔손글씨 펜'에서 **'메모먼트꾹꾹'**으로 전격 교체
  - `tailwind.config.js`를 통해 모든 기본 폰트군을 교체하고, CSS 베이스 레이어에서 버튼 및 입력창까지 강제 적용
  - PDF 내보내기, 에러 메시지, 404 페이지 등 모든 시스템 영역에 폰트 상속 완료
- **최적화**: 사용하지 않는 레거시 Google Fonts 임포트 제거로 로딩 성능 개선
- **한글화**: 사용자의 요청에 따라 모든 개발 문서 및 AI 사고 과정을 한국어로 전환
- **변경 파일**: public/css/input.css, tailwind.config.js, public/index.html, public/openview.html, public/js/ui.js, public/js/ui/header.js, public/js/ui/renderers.js, public/js/ui/trips.js, *.md

### 19:00 - [AI] 모달 리팩토링 및 UI 디테일 개선
- **구조 개선**: `index.html`에 하드코딩된 모달(`item-detail-modal`, `transit-detail-modal`, `flight-input-modal`)을 제거하고 `ui-transit.js`, `ui/timeline-detail.js`에서 동적으로 생성(`ensureModal`)하도록 리팩토링
- **UI 개선**:
  - **장소 상세 모달**: "내 위치에서 길찾기" 버튼을 별도 행으로 분리하여 전체 너비 적용, 구글맵 앱 보기 버튼을 지도 하단(`flex-col` footer)에 고정하여 반응형 대응 및 가림 현상 해결
  - **타임라인**: 편집 모드에서 '+' 버튼 주변의 상하 간격이 불균형하던 문제를 해결하기 위해 카드 하단 여백(`mb-6`)을 조건부로 제거(뷰 모드에선 유지)
- **효과**: `index.html` 코드량 대폭 감소, 모바일 및 다양한 화면 크기에서의 UI 안정성 확보
- **변경 파일**: public/index.html, public/js/ui-transit.js, public/js/ui/timeline-detail.js, public/js/ui/renderers.js

---

## 2026-01-20

### 21:05 - [AI] 공개 링크 전용 뷰어(openview.html) 구현 및 구조 개선
- **기능 개선**: `index.html` 기반의 뷰어 모드 대신 전용 페이지 `openview.html` 도입으로 로딩 속도 및 보안 강화
- **파일 추가**: `openview.html` (경량 뷰어 HTML), `public/js/viewer.js` (읽기 전용 로직)
- **로직 수정**: `header.js`에서 링크 생성 시 뷰어 페이지로 연결, `ui.js`에서 구버전 링크 자동 리다이렉트 처리
- **문서화**: 모든 기술 문서(`task.md`, `view.html` 등) 한글화 완료
- **변경 파일**: header.js, ui.js, openview.html, viewer.js, *.md

### 15:05 - [AI] 로그인 없이 보기 가능한 '공개 공유' 모드 구현
- **기능 추가**: 로그인 없이 여행 일정만 확인할 수 있는 **공개 보기(View-Only)** 기능 추가
- **UI 변경**: 
  - **공유 모달**: "공개 링크 공유" 토글 스위치 추가 (ON/OFF에 따라 Firestore `isPublic` 업데이트)
  - **링크 구분**: 토글 ON 시 `?share=...` 링크 생성, 기존 초대 링크(`?invite=...`)와 별도 운영
  - **읽기 전용 모드**: 공개 링크로 접속 시 수정/삭제/추가 버튼 및 드래그앤드롭이 비활성화된 '읽기 전용' 모드로 진입
- **보안**: `firestore.rules` 업데이트로 `isPublic == true`인 문서에 대해 비로그인 읽기 허용
- **변경 파일**: public/js/ui/header.js, public/js/ui.js, public/index.html, firestore.rules

### 14:55 - [AI] 사용자 프로필 권한 및 이미지 오류 수정
- **보안 규칙 수정**: `users` 컬렉션 읽기 권한을 '본인만'에서 '로그인한 사용자 누구나'로 변경하여 여행 멤버 목록 표시 가능하게 수정
- **버그 수정**: 프로필 사진이 없는 사용자(`undefined`)의 경우 기본 이미지(`icon-192.png`)를 표시하도록 `header.js` 수정
- **변경 파일**: firestore.rules, public/js/ui/header.js

### 14:53 - [AI] 여행 초대 확인 모달 디자인 개선
- **UI 개선**: 여행 초대 링크 클릭 시 나타나는 확인창을 브라우저 기본 `confirm` 창에서 **커스텀 디자인 모달**로 변경
- **디자인 적용**: 중앙 정렬, 블러 배경, 애니메이션(슬라이드 인) 적용으로 시각적 경험 향상
- **기능 변경**: `ui.js` 내 `checkInviteLink` 로직을 수정하여 `openInviteModal`을 호출하도록 변경
- **변경 파일**: public/index.html, public/js/ui.js

### 14:45 - [AI] Firestore 보안 규칙 수정 (초대 링크 오류 해결)
- **버그 수정**: 초대 링크로 접속 시 `Missing or insufficient permissions` 오류가 발생하는 문제 해결
- **원인**: `firestore.rules`가 사용되지 않는 `trips` 컬렉션만 허용하고, 실제 사용 중인 `plans` 컬렉션에 대한 규칙이 누락됨
- **조치**: `plans` 컬렉션에 대한 읽기/쓰기 권한 규칙 추가 및 `firebase.json`에 firestore 설정 추가
- **변경 파일**: firestore.rules, firebase.json

### 13:58 - [AI] 빈 일차 탭 전환 오류 수정
- **버그 수정**: 여행 계획 탭 전환 시, 일정이 없는 날짜(빈 배열)인 경우 화면 갱신 함수(`renderItinerary`)가 호출되지 않아 탭이 넘어가지 않는 문제 수정
- **로직 개선**: `ui.js`의 `recalculateTimeline` 함수에서 일정이 없더라도 강제로 화면을 갱신하도록 로직 수정
- **변경 파일**: public/js/ui.js

### 13:51 - [AI] 여행 계획 페이지 장소 카드 체류 시간 표시 개선
- **UI 개선**: 장소 카드의 체류 시간(duration)을 기존 분 단위 숫자(예: "80분")에서 읽기 편한 텍스트 형식(예: "1시간 20분")으로 변경
- **저장 로직 유지**: 내부 데이터는 여전히 분 단위(80)로 저장되어 계산 로직에 영향 없음, 표시 방식만 `formatDuration` 포매터 적용
- **변경 파일**: public/js/ui/renderers.js

### 13:48 - [AI] 일본 대중교통(Ekispert) 시작 시간 계산 오류 수정
- **버그 수정**: Ekispert API 경로 추가 시, 이전 장소의 소요 시간(예: "1시간 30분")을 파싱하지 못해 시작 시간이 잘못 계산되던 문제 수정
- **로직 개선**: `ui-transit.js` 내 `getEkispertRoute` 함수에서 `parseDurationStr` 함수를 활용해 다양한 형식의 시간 문자열을 정확히 분 단위로 변환하도록 개선
- **효과**: 오사카 등 일본 지역에서 대중교통 경로 추가 시 시작 및 도착 시간이 정확하게 표시됨
- **변경 파일**: public/js/ui-transit.js
