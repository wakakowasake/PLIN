# PLIN Agent Rules

## 1. 기본 전제

- 작업 시작 전에 `ONBOARDING.md`, `README.md`, `AGENTS.md`를 먼저 읽는다.
- UI 작업이면 `DESIGN.md`도 함께 읽는다.
- 현재 운영 기준은 `public/` 웹 앱, `apps/mobile/` 모바일 앱, `functions/` 백엔드를 함께 본다.
- 웹 운영 코드는 `public/`, 모바일 운영 코드는 `apps/mobile/src/`를 기준으로 본다.
- 루트의 실험용 `src/`, 테스트용 프로토타입, 오래된 마이그레이션 문서는 기본적으로 현재 런타임의 기준 문서로 취급하지 않는다.
- 항상 "먼저 검토, 그다음 최소 변경" 원칙을 따른다.

## 2. 기본 작업 방식

- 가능한 한 바로 실행한다. 불필요한 확인 질문은 하지 않는다.
- 문제 해결에 필요한 최소 범위만 수정한다.
- 관련 없는 리팩터링, 네이밍 변경, 대규모 포맷 변경은 하지 않는다.
- 수정 전후로 아래를 확인한다.
  - 중복 선언
  - 순환 참조
  - 문법 오류
  - 끊긴 import / 참조
  - 수정 범위 안의 유령 함수 / 유령 파일

## 3. 자동 실행 가능한 작업

- 파일 읽기, 검색, 비교
- 파일 생성, 수정, 이동, 이름 변경
- 사용되지 않는 코드나 파일 정리
- `npm`, `npx`, `node`, `vite`, `firebase serve`, `npm --prefix apps/mobile ...` 등 개발용 명령 실행
- 빌드, 테스트, 린트, 타입체크 등 검증 명령 실행
- `git status`, `git diff`, `git log`, `git add`, `git commit`
- 필요한 의존성 설치/제거/업데이트

## 4. 반드시 확인이 필요한 작업

- `git push` 또는 원격 저장소 변경
- 프로덕션 배포
- 히스토리를 바꾸는 git 명령
  - `git reset --hard`
  - `git checkout --`
  - `git clean`
  - `git rebase`
  - `git push --force`
- 사용자가 명시하지 않은 광범위 삭제
  - 큰 폴더 전체 삭제
  - 여러 파일 대량 삭제
  - 현재 참조 여부가 불명확한 자산 삭제
- 관리자 권한이나 샌드박스 바깥 권한이 필요한 명령

## 5. 커밋 원칙

- 파일 수정마다 자동 커밋하지 않는다.
- 커밋은 작업이 끝난 뒤 한 번만 한다.
- 사용자가 커밋을 원하지 않으면 커밋하지 않는다.
- 로컬 커밋만 허용한다. `git push`는 별도 확인이 필요하다.
- 커밋 메시지는 간결하게 작성한다.
  - 가능하면 `[AI]` 접두사 사용
  - 한국어 우선

## 6. 프로젝트 고정 주의사항

- 메인 웹 앱 엔트리는 `public/index.html`이다.
- 공개 뷰어 엔트리는 `public/openview.html`이다.
- `functions/openview.html`은 배포용 복사본 성격이 강하므로, 보통은 `public/openview.html`을 먼저 수정한다.
- 루트 `npm run build`는 웹 앱과 모바일 웹(`/m`)을 함께 빌드한다.
- `public/index.html`에서 `/js/error-guard.js`, `/sw.js` 경로는 실제 정적 파일과 항상 맞아야 한다.
- `error-guard.js` 소스 위치는 `public/static/js/error-guard.js` 기준으로 유지한다.
- 메인 앱은 `/static/css/input.css`를 직접 읽고, 공개 뷰어는 `/css/style.css`를 직접 읽는다.
- 공개 뷰어는 `/css/style.css`를 직접 사용하므로 CSS 경로를 바꾸면 뷰어를 반드시 확인한다.
- `ui-transit.js`의 공항 자동완성은 키보드 입력을 직접 처리한다.
  - `ArrowUp`, `ArrowDown`: 후보 이동
  - `Enter`: 후보 선택
  - `Escape`: 목록 닫기

## 7. 검증 원칙

- 코드 변경 후에는 가능한 한 가장 작은 적절한 검증을 바로 실행한다.
- 모바일 UI 변경이면 `DESIGN.md`의 `UI Change Checklist`를 기준으로 검증한다.
- 기본 검증 우선순위:
  - `npm run build`
  - 모바일 UI 변경이면 `cd apps/mobile && npm run typecheck`
  - 모바일 UI 변경이면 `cd apps/mobile && npm run audit:spacing`
  - 모바일 UI 변경이면 `cd apps/mobile && npm run report:radius-full`
  - 필요 시 `npm run build:css`
  - 모바일 변경이면 관련 `apps/mobile` 검증
  - 변경 기능에 대한 최소 수동 테스트 포인트 정리
- 완료 보고에는 아래를 포함한다.
  - 바꾼 파일
  - 잠재 위험
  - 사용자가 직접 확인할 테스트 포인트

## 8. 한글 처리

- 한글을 유니코드 escape로 바꾸지 않는다.
- 문자열, 주석, 에러 메시지, 로그는 사람이 읽을 수 있는 한글 그대로 유지한다.
- 파일 인코딩은 UTF-8 기준으로 유지한다.

## 9. 요약

- 빠르게 실행하되, 파괴적 작업은 보수적으로 다룬다.
- 최소 수정으로 해결한다.
- 현재 운영 구조는 `public/`, `apps/mobile/`, `functions/`를 함께 본다.
- 커밋은 마지막에 한 번만, 푸시는 하지 않는다.
