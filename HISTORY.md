# Project History & Changelog

## 🚀 Version 1.0.0 (Recent Updates)

### 🌟 New Features
1. **Public Viewer (공개 뷰어)**
   - 로그인 없이 여행 계획을 공유하고 볼 수 있는 `openview.html` 페이지 구현.
   - 읽기 전용 모드(`Read-Only Mode`)를 적용하여 데이터 수정 방지.
   - 타임라인, 지도, 예산, 체크리스트 등 핵심 정보 뷰어 이식.

2. **Detailed Modals (상세 보기)**
   - **장소 상세 (`item-detail-modal`)**: 지도 미리보기, 메모, 사진, 지출 내역, 첨부 파일 확인 기능.
   - **이동 수단 상세 (`transit-detail-modal`)**: 소요 시간, 예산, 메모 확인 기능.
   - **지출 상세 (`expense-detail-modal`)**: 일자별 지출 내역 및 총액 확인.
   - 모바일 환경 및 특정 브라우저 보안 이슈(CSP) 대응을 위한 이벤트 바인딩 로직 개선 (`onclick` -> `attachInteractionHandlers`).

3. **Navigation (길찾기)**
   - 장소 상세 화면에 **[길찾기]** 버튼 추가.
   - 클릭 시 구글 지도(`https://www.google.com/maps/search/...`)로 자동 연결되어 경로 탐색 가능.

### 🛠 Improvements & Fixes
- **Stub Functions**: `viewer.js`에서 편집 기능(`delete`, `add` 등) 호출 시 에러가 나지 않도록 빈 함수(Stub) 처리.
- **Scope Fixes**: 자바스크립트 모듈 환경(`type="module"`)에서의 함수 호출 범위(`Scope`) 문제 해결 (window 객체 의존성 제거).
- **Mobile Touch**: 모바일 터치 이벤트 오동작 방지 및 스크롤 개선.
- **Budget Sync**: 메인 화면의 예산 위젯과 상세 내역 데이터 동기화 로직 추가.

---

## 📅 Chronological Updates

### [2026-01-25]
- **편집 경험 개편 (Editing Experience Overhaul)**:
    - **전역 수정 모드(Global Edit Mode) 도입**: 기존 '추억 잠금' 기능을 완전히 대체.
        - 여행 시기와 무관하게 하단 [수정] 버튼으로 언제든 모드 토글 가능.
        - [수정 완료] 상태(ON)에서만 드래그 앤 드롭, 삭제/수정 버튼, 아이템 추가(+) 기능 활성화.
    - **일관된 UX**: 타임라인 목록뿐만 아니라 **장소 상세 모달**, **이동수단 상세 모달**, **우클릭 메뉴**까지 모두 `isGlobalEditMode` 규칙 적용.

- **UI/UX 개선 (Refinements)**:
    - **우클릭(Context Menu) 로직 고도화**:
        - 기존 창 크기 기반 차단 방식 제거 -> `touchstart` 감지 로직으로 변경.
        - 모바일 롱프레스는 차단하되, 데스크탑에서는 좁은 화면에서도 우클릭 정상 허용.
        - 보기 모드(수정 모드 OFF) 시 우클릭 메뉴 원천 차단으로 깔끔한 화면 제공.
    - **라이트박스(Lightbox) 가시성 확보**:
        - 화살표 버튼의 DOM 순서를 변경하여 이미지 뒤로 숨는 현상 해결(Always on Top).
        - 버튼 배경 스타일을 진하게(`backdrop-blur-md`) 개선하여 밝은 사진 위에서도 식별 용이.
    
- **코드 정리 (Code Cleanup)**:
    - 레거시 로직(`memoryLocked`, `toggleMemoryLock`) 전수 조사 및 제거/Deprecated 처리.
    - `renderers.js`, `ui.js`, `ui-transit.js`, `timeline-detail.js` 등 전반적인 리팩토링 수행.

- **이동 수단 상세 모달(viewRouteDetail) 버튼 로직 초기 개선** (Pre-work):
    - 글로벌 편집 상태(`isEditing`) 및 읽기 전용 모드(`isReadOnlyMode`) 연동.
    - 장소 카드(`buildDefaultCard`)와 동일한 버튼 표시 규칙 적용 ([수정], [삭제], [닫기] 동적 노출).
    - `isEditMode` 매개변수를 `isRouteEditMode`로 변경하여 가독성 강화.

### [2026-01-23]
- **간단 모드 제거**: 타임라인 뷰 모드를 '플래너 모드'로 단일화하고 관련 레거시 코드 삭제.
- **다크 모드 가시성 개선 (UX)**:
    - 텍스트 가독성 강화 (Primary: Amber-500, Muted: Slate-400 적용).
    - 카드 배경 대비 강화 (다크 모드 카드 배경색을 `#2a3848`로 밝게 조정).
    - 푸터(Footer) 영역 다크 모드 스타일 적용.
- **모바일 스와이프 내비게이션**: 타임라인 좌우 스와이프로 날짜 이동 및 슬라이드 애니메이션 구현.

### [2026-01-22]
- 공개 뷰어용 장소/이동수단 상세 모달 이식 및 구현.
- 뷰어 모드 클릭 이벤트 핸들러(인라인 -> DOM 프로퍼티) 전면 수정.
- 장소 상세 모달에 '구글 길찾기' 버튼 추가.
- 배포 스크립트(`deploy:all`) 실행 및 검증 완료.

### [Previous]
- 초기 프로젝트 세팅 (Vite + Vanilla JS + TailwindCSS).
- Firebase Firestore/Auth/Hosting/Functions 연동.
- 메인 편집기(`edit.html`) 기능 구현 (드래그 앤 드롭 타임라인, 지도 연동 등).
