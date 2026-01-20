# 📝 개발 히스토리

> AI 지원 개발 변경사항 자동 기록

---

## 2026-01-20

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

### 09:37 - [AI] 비행기 모달 z-index 및 출발시간 기본값 버그 수정
- **z-index 계층 수정**: 비행기 입력 모달의 z-index를 z-[120]에서 z-[130]으로 상향 조정하여, 커스텀 시간 선택 모달(z-[140])이 비행기 모달 위에 정상적으로 표시되도록 계층 구조 개선
- **출발시간 필드 버그 수정**: 비행기 편집 모달에서 `item.time`(소요시간, 예: "30분")이 출발시간 필드에 잘못 들어가는 버그 수정. `departureTime`이 없으면 빈 문자열 표시하도록 변경
- **변경 파일**: public/index.html, public/js/ui-transit.js

### 09:26 - [AI] index.html CSP 설정에 Ekispert 프록시 주소 추가
- **CSP 정책 수정**: Content Security Policy의 `connect-src`에 `https://api-hkrwkegcrq-uc.a.run.app` 추가
- **효과**: Ekispert API 프록시 서버 호출 시 발생하던 "Failed to fetch" CSP 위반 오류 해결
- **변경 파일**: public/index.html

---

## 2026-01-19


### 23:45 - [AI] 비행 소요 시간 계산 변수 스코프 수정
- **버그 수정**: `saveFlightItem` 함수 내 `diff` 변수의 스코프 문제로 인해 소요 시간이 제대로 저장되지 않던 문제를 최종 수정
- **효과**: 플래너 모드에서 비행 시간이 30분으로 초기화되는 현상 완전 해결
- **변경 파일**: public/js/ui/flight-manager.js

### 23:55 - [AI] 항공편 수정/상세 모달 시간 입력 통일 및 이벤트 개선
- **UI 개선**: `viewRouteDetail` 함수 내 항공편 편집 모달에서도 기본 `input type="time"` 대신 커스텀 시간 선택기 적용
- **기능 개선**: 커스텀 시간 선택기(`time-picker.js`)가 값 변경 시 `change` 이벤트를 발생시키도록 수정하여, 자동 시간 계산 로직이 정상 작동하도록 보장
- **변경 파일**: public/js/ui-transit.js, public/js/ui/time-picker.js

### 23:38 - [AI] 항공편 시간 입력 방식 변경 (AM/PM 제거)
- **UI 변경**: 항공편 입력 모달의 시간 입력 필드를 기본 `input type="time"`에서 커스텀 시간 선택기(Place Card와 동일)로 교체
- **효과**: 브라우저 기본 로케일(오전/오후) 표시 문제를 해결하고, 24시간 형식 입력을 강제하여 데이터 일관성 확보
- **변경 파일**: public/js/ui/time-picker.js, public/js/ui.js, public/index.html

### 23:35 - [AI] 플래너 모드 비행 시간 표시 오류 수정
- **버그 수정**: 비행편 추가/수정 시 소요 시간(숫자)이 제대로 저장되지 않아, 타임라인 재계산 시 기본값 30분으로 초기화되던 문제 수정
- **변경 파일**: public/js/ui/flight-manager.js

### 23:28 - [AI] 새 항목 추가 시 시간 기본값 개선
- **기본값 로직 변경**: 새로운 장소나 메모 추가 시, 시작 시간을 '이전 항목 시작 시간 + 10분'에서 '**이전 항목 종료 시간**'으로 변경
- **계산 방식**: 이전 항목의 시작 시간 + 소요 시간(duration) = 새 항목 시작 시간
- **변경 파일**: public/js/ui.js

### 23:25 - [AI] 24시간 형식 적용 및 time-picker 버그 수정
- **24시간 형식 적용**: 장소 및 항공편 시간 형식을 12시간(오전/오후)에서 24시간(HH:mm)으로 변경
- **HTML 구조 수정**: 누락된 `flight-input-modal` 추가 (native time input 사용)
- **로직 개선**: `flight-manager.js`에서 기존 12시간 데이터를 24시간으로 자동 변환하도록 수정
- **버그 수정**: `time-picker.js`에서 `timeParts` 참조 오류 수정
- **변경 파일**: public/js/ui/time-picker.js, public/js/ui/flight-manager.js, public/index.html, public/js/ui-utils.js

### 22:45 - [AI] 정렬 UI 개선 및 버그 수정
- **정렬 선택 모달 추가**: '정렬' 버튼 클릭 시 중앙 모달에서 '시간순 정렬'과 '시간 재계산' 선택 가능
- **버그 수정**: 최적 경로 추가 시 '시간 재계산'을 수행하면 소요시간이 유지되지 않는 문제 해결 (duration 필드 추가)

### 22:15 - [AI] 시간 재계산 정렬 기능 추가 및 디자인 개선
- **시간 재계산 정렬**: 순서를 유지하면서 첫 번째 아이템부터 소요시간 기준으로 전체 시간 재계산 기능 추가
- UI에 '시간 재계산' 버튼 추가
- **디자인 개선 (플래너 모드)**:
    - 시간 카드: 테두리 제거, 폰트 축소(xs), 검은색 변경, 가로폭 60px로 축소
    - 플러스 버튼: 원형 테두리 및 배경 제거, 심플한 아이콘으로 변경
    - 이동수단 카드: 총거리/요약 정보 표시 제거
    - 레이아웃: 시간 카드와 내용 카드의 상단 높이 정렬 맞춤

### 19:40 - [AI] 이동수단 카드 소요시간 표시 개선
- 이동수단 카드에서 소요시간을 읽기 쉬운 형식으로 표시하도록 개선
- 숫자(120)가 아닌 "2시간", "2시간 5분" 등으로 표시
- `formatDuration` 함수를 사용하여 숫자를 자동 포맷팅
- **변경 파일**: public/js/ui/renderers.js

### 19:35 - [AI] 이동수단 소요시간 수정 시 시간 카드 업데이트 버그 수정
- 플래너 모드에서 이동수단 소요시간 수정 시 시간 카드가 실시간으로 업데이트되지 않던 문제 해결
- `saveRouteItem` 함수에서 `duration`을 분 단위 숫자로 저장하도록 수정 (문자열 X)
- `transitInfo.end` 재계산 로직 추가하여 플래너 모드 시간 카드 자동 업데이트
- **변경 파일**: public/js/ui-transit.js

---

### 12:20 - [AI] 데이터 지속성 로직 재수정 및 파일 복구
- schedule `ui.js` 구문 오류(중복 함수 선언, 잘못된 brace) 수정
- 데이터 병합 로직(`saveNewItem`) 정상 복구 및 ID 생성 로직 적용

### 14:50 - [AI] 신형 모달 연결 수정
- `ui.js`: `viewTimelineItem` 함수에서 이동수단 클릭 시 `openTransitDetailModal` 호출하도록 수정
- 플래너 모드에서 이동수단 카드 클릭 시 신형 상세 모달이 정상적으로 열리도록 연결

### 14:05 - [AI] 구형 모달 제거 및 로직 클린업
- `index.html`: 더 이상 사용하지 않는 `flight-input-modal`, `transit-input-modal` HTML 코드 완전 제거
- `ui.js`: `editTimelineItem` 함수에서 구형 모달 호출 로직 제거 및 상세 모달(`openTransitDetailModal`)로 리다이렉트 처리

### 13:55 - [AI] 컨텍스트 메뉴 및 이동수단 수정 동선 개선
- 최적 경로 자동 생성 항목(`routeGroupId` 보유)에 대해 컨텍스트 메뉴 '수정' 버튼 제거
- 이동수단(일반/비행기) 우클릭 '수정' 시 구형 입력 모달 대신 상세 모달(`openTransitDetailModal`)이 열리도록 변경
- 사용자 요청 "상세 모달에서 수정 버튼을 누를 상태" 반영을 위한 동선 변경

### 13:45 - [AI] 비행기 도착 시간 표시 오류 수정
- 플래너 모드에서 비행기 도착 시간이 `NaN:NaN`으로 표시되는 문제 해결
- `flight-manager.js`: `transitInfo`에 `start`, `end` 속성 추가 (기존 `depTime`, `arrTime`과 병행 저장)
- `renderers.js`: `transitInfo` 시간 데이터 참조 시 `depTime`/`arrTime` fallback 로직 추가

### 12:15 - [AI] 데이터 지속성 및 버그 수정 (Fixing)
- 일정 수정 시 지출 내역, 추억, 첨부파일 등이 초기화되는 문제 수정 (ID 기반 데이터 병합 로직 추가)
- `saveNewItem` 함수 리팩토링: 기존 데이터 보존 로직 구현
- `ui.js` 내 `showLoading` ReferenceError 수정 (모달 함수 명시적 import)
- **변경 파일**: public/js/ui.js

### 12:02 - [AI] 추억 모달 사진 업로드 오류 수정
- 추억 남기기 모달 열 때 미리보기 영역 초기화 로직 오류 수정
- 필수 DOM 요소(`#memory-photo-img` 등)까지 삭제되어 클릭 시 오류가 발생하는 문제 해결
- **변경 파일**: public/js/ui/memories.js

### 11:55 - [AI] 시간 카드 너비 및 폰트 인라인 스타일 강제 적용
- CSS 빌드 누락 시에도 스타일이 적용되도록 인라인 스타일(`style="..."`) 추가
- `width: 74px; min-width: 74px;` 강제 적용
- `font-variant-numeric: tabular-nums;` 강제 적용
- **변경 파일**: public/js/ui/renderers.js

### 11:45 - [AI] 시간 카드 너비 고정 (w-74px)
- `tabular-nums`로 해결되지 않은 미세한 너비 차이 해결
- `min-w-[70px]`(최소 너비)를 `w-[74px]`(고정 너비)로 변경하여 강제 통일
- **변경 파일**: public/js/ui/renderers.js

### 11:42 - [AI] 시간 카드 숫자에 고정폭 글꼴(tabular-nums) 적용
- 플래너 모드 시간 카드에서 숫자 '0' 너비 차이로 인한 정렬 문제 해결
- CSS `tabular-nums` 클래스 추가로 모든 숫자가 동일한 너비를 갖도록 수정
- **변경 파일**: public/js/ui/renderers.js

### 10:45 - [AI] 플래너 모드 마지막 플러스 버튼 추가 및 이동수단 소요시간 입력 개선
- 플래너 모드에서 마지막 아이템 뒤에도 플러스 버튼 추가
- 이동수단 소요시간 입력을 숫자만 받도록 변경 (장소 카드와 동일)
- 빠른 선택 버튼 분 단위로 변경 (10, 30, 60, 120)
- 저장 시 `formatDuration` 사용하여 자동 포맷팅 (120분 → "2시간")
- `updateTransitArrivalTime` 함수 숫자 입력에 맞게 수정
- **변경 파일**: public/js/ui/renderers.js, public/js/ui-transit.js

### 10:32 - [AI] 최적 경로 추가 오류 수정 - totalMinutes 변수 정의
- `totalDuration` 문자열을 `parseDurationStr`로 분 단위로 변환
- `totalMinutes` 변수 정의 누락으로 발생한 ReferenceError 수정
- 최적 경로 추가 기능 정상 작동
- **변경 파일**: public/js/ui-transit.js

### 10:26 - [AI] 이동수단 소요시간 변경 시 도착시간 실시간 업데이트 구현
- `route-edit-duration` 입력 필드에 `oninput` 이벤트 추가
- `updateTransitArrivalTime()` 함수 생성
- 소요 시간 입력 시 도착 시간 자동 계산 및 표시
- **변경 파일**: public/js/ui-transit.js

### 10:24 - [AI] 최적 경로 찾기 시 transitInfo 자동 계산 구현
- 직선거리 계산 이동수단 생성 시 transitInfo 자동 생성 (1278-1316줄)
- Google Maps API 경로 계산 시 transitInfo 자동 생성 (1805-1851줄)
- 이전 장소 종료 시간 기반으로 시작 시간 계산
- 경로 소요 시간 기반으로 도착 시간 계산
- 최적 경로로 추가된 이동수단도 플래너 모드에서 시간 표시됨
- **변경 파일**: public/js/ui-transit.js

### 10:18 - [AI] 이동수단 추가 시 자동 시간 계산 구현
- `addTransitItem` 함수에서 이전 장소 종료 시간 기반으로 `transitInfo` 자동 생성
- 이전 아이템이 이동수단이면 `transitInfo.end` 사용
- 일반 장소면 `time + duration`으로 종료 시간 계산
- 기본 30분 duration으로 도착 시간 자동 계산
- **변경 파일**: public/js/ui-transit.js

### 10:10 - [AI] 플래너 모드 렌더러 문법 오류 수정 및 이동수단 시간 표시 구현
- 중복된 `if (item.time)` 조건문 제거
- 변수 선언을 조건문 밖으로 이동
- 이동수단(`isTransit`) 아이템은 `transitInfo.start/end` 사용하도록 수정
- 일반 아이템은 기존 `time` 필드 파싱 유지
- **변경 파일**: public/js/ui/renderers.js

### 09:58 - [AI] 플래너 모드 디테일 개선 - 세로선 제거 및 시간 간격 조정
- 플래너 모드에서 왼쪽 회색 세로선 제거
- 시간 카드 시간 표시를 `justify-between`으로 변경하여 위아래로 배치
- 화살표 여백 제거 (`my-0.5` 삭제)
- 시간이 카드 전체 높이에 맞춰 배치됨
- **변경 파일**: public/js/ui/renderers.js

### 09:53 - [AI] 플래너 모드 UX 개선 - 시간 카드 높이 동일화 및 수평 구분선 추가
- 시간 카드의 높이를 우측 카드와 동일하게 설정 (`h-full`)
- 플러스 버튼을 `----(+)----` 형태의 수평 구분선으로 변경
- 각 카드 사이사이에 구분선과 함께 플러스 버튼 배치
- 마지막 아이템에는 구분선 표시 안 함
- **변경 파일**: public/js/ui/renderers.js

### 09:35 - [AI] 플래너 모드 레이아웃 개선 - 시간을 세로 카드 형태로 변경
- 시간 레이블을 왼쪽에 세로로 긴 카드 형태로 표시
- 기존 아이콘+수직선 구조와 동일한 위치에 배치
- 시간 카드: 흰색 배경, primary 테두리, 둥근 모서리
- 수직선은 시간 카드 뒤로 이어지도록 유지
- **변경 파일**: public/js/ui/renderers.js

### 09:20 - [AI] 플래너 모드 구현 완료 - 시간 표시 일정표 형식 추가
- 설정에서 "간단 모드" ↔ "플래너 모드" 전환 기능 추가
- 플래너 모드: 왼쪽에 시작/종료 시간 레이블 표시
- 시간 계산 헬퍼 함수 추가 (time-helpers.js)
- viewMode를 meta에 저장하고 Firebase 동기화
- 렌더링 로직을 viewMode에 따라 분기 처리
- **변경 파일**: public/js/ui/state.js, public/js/ui/profile.js, public/js/ui/renderers.js, public/js/ui/time-helpers.js, public/js/ui.js

### 09:11 - [AI] DND 고스트 가시성 대폭 개선 - 투명도 0.98로 상향
- 드래그 중인 고스트 카드 투명도를 0.98로 대폭 증가 (거의 불투명)
- 고스트 크기를 1.0으로 설정하여 원래 크기 유지
- 그림자 강도 증가 (0.3 → 0.4)
- 원래 자리 카드 투명도를 0.3으로 감소하여 대비 강화
- **변경 파일**: public/js/ui/dnd.js

### 09:07 - [AI] UI 개선: 아이콘 배경색 통일, DND 애니메이션 개선, 드래그 고스트 가시성 향상
- 이동수단과 장소 아이콘 배경색을 흰색/카드 배경으로 통일
- DND 시 원래 자리의 카드에 shake 애니메이션 적용 (`dragging` 클래스 추가)
- 드래그 중인 고스트 카드 투명도 증가 (0.9 → 0.95)
- 아이콘 수직 정렬 개선 (mt-1 제거로 완벽한 중앙 배치)
- **변경 파일**: public/js/ui/renderers.js, public/js/ui/dnd.js

### 03:25 - [AI] 성능 최적화 - DNS preconnect 및 이미지 압축 개선
- DNS preconnect 추가 (cdn.jsdelivr.net, maps.googleapis.com)
- 이미지 압축 디바이스별 최적화
  - 모바일: 800px, quality 0.65
  - 데스크톱: 1024px, quality 0.7
- 재시도 횟수 감소로 업로드 속도 40-50% 개선 예상
- **변경 파일**: public/index.html, public/js/ui/memories.js

### 03:12 - [AI] 드래그앤드롭 커스텀 고스트 및 자동 스크롤 구현
- iOS/Android 커스텀 드래그 고스트 구현 (카드만 표시, 아이콘 제외)
- 웹/모바일 자동 스크롤 영역 확대 (상단 150px, 하단 200px)
- 원래 자리 흔들림 애니메이션 추가 (shake 효과)
- 웹 드래그 시 requestAnimationFrame 기반 자동 스크롤
- 모든 플랫폼 투명도 0.5로 통일
- **변경 파일**: public/js/ui/dnd.js, public/index.html

### 03:05 - [AI] 추억 사진 모달 열 때 미리보기 완전 초기화
- `addMemoryItem` 함수에서 previewContainer의 모든 자식 요소 제거
- 이전 업로드 사진이 미리보기에 남아있지 않도록 개선
- **변경 파일**: public/js/ui/memories.js

### 02:59 - [AI] 커밋 메시지를 한국어로 작성하도록 규칙 변경
- Git 커밋 메시지도 한국어로 작성하도록 .cursorrules 수정
- HISTORY.md와 일관성 유지
- **변경 파일**: .cursorrules, HISTORY.md

### 02:57 - [AI] HISTORY.md 한국어 작성 규칙 추가
- HISTORY.md를 항상 한국어로 작성하도록 규칙 추가
- 기존 HISTORY.md 내용을 한국어로 변환
- **변경 파일**: .cursorrules, HISTORY.md

### 02:53 - [AI] 자동 커밋 시스템 구축
- `.cursorrules`에 자동 실행 및 코드 품질 규칙 생성
- 자동 커밋 워크플로우 구현
- 지금까지의 개발 히스토리 기록
- **변경 파일**: .cursorrules, HISTORY.md 생성

### 02:42 - [AI] 코드 품질 검증 규칙 추가
- 중복 선언 체크 추가
- 순환 참조 감지 추가
- 문법 오류 검증 추가
- 구조적 문제 검증 추가
- **변경 파일**: .cursorrules

### 02:37 - [AI] AI 코딩 가이드라인 설정
- AI 어시스턴트용 `.cursorrules` 파일 생성
- 불필요한 `.agent/rules.md` 파일 삭제
- 초공격적 자동 실행 정책 수립
- 한글 유니코드 변환 방지 규칙 추가
- **변경 파일**: .cursorrules 생성, .agent/rules.md 삭제

### 00:15 - [AI] 첨부파일 업로드 오류 수정
- `showLoading` 및 `hideLoading` ReferenceError 수정
- 직접 호출을 `Modals.showLoading()` 및 `Modals.hideLoading()`으로 변경
- **변경 파일**: public/js/ui.js

### 이전 세션 - 드래그앤드롭 개선
- 가져온 일정 삽입 위치 수정
- 교통수단 아이콘 배경색 통일
- 모바일 드래그앤드롭 UX 개선
- 추억 사진 미리보기 초기화 수정
- **변경 파일**: public/js/ui/memories.js, public/js/ui/renderers.js, public/js/ui/modals.js, public/index.html

---

## 범례
- `[AI]` 접두사는 AI가 생성한 커밋을 의미
- 시간 형식: HH:MM (24시간, KST)
- 각 항목은 간략한 설명과 수정된 파일 포함
