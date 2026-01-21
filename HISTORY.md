# 📝 개발 히스토리

> AI 지원 개발 변경사항 자동 기록

---

## 2026-01-21

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
