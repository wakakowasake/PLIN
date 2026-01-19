# 📝 개발 히스토리

> AI 지원 개발 변경사항 자동 기록

---

## 2026-01-19

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
- **변경 파일**: public/js/state.js, public/js/ui/profile.js, public/js/ui/renderers.js, public/js/ui/time-helpers.js, public/js/ui.js

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
