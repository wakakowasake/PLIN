# 📝 개발 히스토리

> AI 지원 개발 변경사항 자동 기록

---

## 2026-01-20

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
