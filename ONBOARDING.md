# PLIN Onboarding

작업 전 빠르게 맥락을 잡기 위한 문서입니다. 세부 설치, 환경 변수, 운영 메모는 `README.md`를 기준으로 보고, 작업 규칙은 `AGENTS.md`를 따릅니다.

## 지금 기준으로 살아있는 표면

- 웹 앱: `public/` 기반 Vite 앱, 엔트리는 `public/index.html`
- 공개 뷰어: `public/openview.html`, 빌드 후 `functions/openview.html`로 복사
- 모바일 앱: `apps/mobile/` 기반 Expo 앱
- 모바일 웹: `apps/mobile`에서 export 되어 `dist/m`으로 배포, Hosting 경로는 `/m`
- 백엔드: `functions/index.js`, Hosting의 `/api`, `/v`, `/p` 요청 처리

## 먼저 볼 문서

1. `ONBOARDING.md`
2. `README.md`
3. `AGENTS.md`
4. UI 작업이면 `DESIGN.md`

## 빠른 시작

```bash
nvm install 20
nvm use 20

npm install
cd functions && npm install
cd ../apps/mobile && npm install
cd ../..
```

- 루트 `npm run dev`: 웹 앱과 공개 뷰어 개발 서버
- 루트 `npm run build`: 웹 앱 + 모바일 웹(`/m`) 빌드
- 루트 `npm run serve`: `dist/` 기준 Firebase Hosting 미리보기
- `cd apps/mobile && npm run start:ios`: 모바일 iOS 개발 서버
- `cd apps/mobile && npm run web`: Expo 기준 모바일 웹 개발 서버

## 꼭 기억할 것

- 웹 운영 코드는 `public/`, 모바일 운영 코드는 `apps/mobile/src/`, 서버 코드는 `functions/`가 기준입니다.
- UI 변경은 `DESIGN.md`의 screen role, spacing/radius, bottom sheet, copy 규칙을 먼저 확인합니다.
- 메인 앱은 `/static/css/input.css`를 직접 읽고, 공개 뷰어는 `/css/style.css`를 직접 읽습니다.
- `error-guard.js`는 `/js/error-guard.js`로 먼저 로드되므로 소스 위치는 `public/static/js/error-guard.js`를 유지합니다.
- `public/openview.html`을 수정했다면 배포 전 `npm run sync:openview`가 필요한 흐름인지 같이 확인합니다.
- 웹 로그인은 Google popup 우선, 필요 시 redirect 폴백을 사용합니다.
- 루트 Vite 개발 서버의 `/api`는 기본적으로 배포 Functions를 향합니다. 에뮬레이터를 쓰려면 `VITE_USE_FUNCTIONS_EMULATOR=true`가 필요합니다.

## 문서 업데이트 원칙

- `ONBOARDING.md`는 1분 안에 읽히는 빠른 안내만 유지합니다.
- 자세한 설치, 환경 변수, 배포 절차는 `README.md`에 둡니다.
- 작업 태도, 안전 규칙, 검증 원칙은 `AGENTS.md`에 둡니다.
