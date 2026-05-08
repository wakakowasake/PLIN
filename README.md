# PLIN

여행 일정 작성, 공유, 기록을 위한 웹 + 모바일 + Firebase Functions 프로젝트입니다.

현재 운영 기준은 아래 세 표면을 함께 봐야 합니다.

- 웹 앱: `public/` 기반 바닐라 JS + Vite
- 모바일 앱: `apps/mobile/` 기반 Expo + React Native
- 백엔드 및 배포 연결: `functions/` + Firebase Hosting

## 현재 구조

- 메인 웹 앱: `public/index.html`
- 공개 뷰어: `public/openview.html`
- 웹 핵심 로직: `public/js/`
- 웹 정적 자산: `public/static/`
- 모바일 앱: `apps/mobile/`
- 모바일 웹 산출물: `dist/m` -> Hosting 경로 `/m`
- Firebase Functions: `functions/index.js`

## 기술 스택

- 웹: HTML, ES modules, Tailwind CSS v3, Vite
- 모바일: Expo, React Native, TypeScript, React Native Web export
- 백엔드: Firebase Functions, Express
- 데이터/인증: Firestore, Firebase Auth, Firebase Storage
- 외부 API: Google Maps, Unsplash, Ekispert, Open-Meteo

## 시작하기

사전 요구사항:

- nvm
- Node.js 20
- npm 9+
- Firebase CLI

Node 설정:

```bash
nvm install 20
nvm use 20
```

Firebase CLI 설치:

```bash
npm install -g firebase-tools
```

전체 의존성 설치:

```bash
npm install
cd functions && npm install
cd ../apps/mobile && npm install
cd ../..
```

- 웹 앱만 빠르게 볼 때는 루트 의존성만으로도 `npm run dev`가 동작할 수 있습니다.
- 다만 루트 `npm run build`, `/m` 프리뷰, 모바일 테스트까지 보려면 `apps/mobile` 설치가 필요합니다.

## 환경 변수

`functions/.env`에 최소한 아래 값들이 필요합니다.

```bash
# functions/.env
GOOGLE_MAPS_API_KEY=...
GOOGLE_MAPS_BROWSER_API_KEY=...
PLIN_FIREBASE_API_KEY=...
UNSPLASH_ACCESS_KEY=...
KOREA_OPEN_DATA_SERVICE_KEY=...

# functions/.env.local
EKISPERT_API_KEY=...
```

- `GOOGLE_MAPS_API_KEY`: Functions 서버가 Google Places / Directions / Photo API를 호출할 때 쓰는 서버용 키
- `GOOGLE_MAPS_BROWSER_API_KEY`: 웹 브라우저에서 `Maps JavaScript API`와 `Maps Embed API`를 로드할 때 쓰는 키
- `KOREA_OPEN_DATA_SERVICE_KEY`: 공공데이터포털/한국관광공사 TourAPI와 국내 공항 공공데이터 조회에 쓰는 서버용 키
- `EKISPERT_API_KEY`: 로컬 개발에서는 `functions/.env.local`에 두고, 배포 함수는 Firebase Secret Manager 값을 사용합니다.
- 웹용 키에는 `https://plin.ink/*`, `https://www.plin.ink/*`, `https://plin-db93d.web.app/*`, `http://localhost:*` 같은 HTTP referrer 제한을 거는 것을 권장합니다.

모바일 환경 변수:

- `apps/mobile/.env`에 `EXPO_PUBLIC_*` 값을 넣습니다.
- 예시는 `apps/mobile/.env.example`을 참고합니다.
- `EXPO_PUBLIC_*` 값을 바꾸면 Expo가 JS 번들에 값을 다시 박아야 하므로 앱을 반드시 재빌드하고 재설치해야 합니다.
- 원격 푸시 테스트까지 하려면 `EXPO_PUBLIC_PLIN_EAS_PROJECT_ID`도 함께 넣어야 합니다. 값이 없으면 공지용 Expo 푸시 토큰이 등록되지 않습니다.
- 내부 테스트용 standalone 앱은 `release APK/AAB`를 사용하세요. `debug APK`는 Metro 개발 서버에 의존할 수 있습니다.
- iOS도 동일합니다. 내부 테스트 설치본은 `Release/TestFlight/Archive` 빌드를 사용하세요. `Debug` 설치본은 Metro가 없으면 `No script URL provided` 또는 `unsanitizedScriptURLString = (null)`로 종료될 수 있습니다.

## 로컬 개발

웹 앱 개발 서버:

```bash
npm run dev
```

- 메인 앱: `http://localhost:5173/`
- 공개 뷰어: `http://localhost:5173/openview.html?id=[TRIP_ID]`
- `/api` 프록시는 기본적으로 배포 Functions를 사용하고, `VITE_USE_FUNCTIONS_EMULATOR=true`일 때만 로컬 Functions Emulator로 전환합니다.

모바일 앱 개발 서버:

```bash
cd apps/mobile
npm run start:ios
```

- iOS Simulator + Expo Go 조합에서는 `localhost` 고정이 가장 안정적입니다.
- `npm run start:ios`는 `expo start --ios --localhost`를 실행해 `exp://...`가 VPN/LAN IP를 타지 않게 합니다.
- 외부 네트워크에서 테스트해야 하거나 `simctl openurl ... Operation timed out`가 반복되면 `npm run start:tunnel`로 전환하세요.
- `npm run ios`는 Expo Go가 아니라 네이티브 iOS 앱을 다시 빌드하는 명령(`expo run:ios`)입니다.
- 실기기 개발 빌드는 `cd apps/mobile && npm run ios -- --device`를 사용합니다. 이 경로는 기본값이 `Debug`라서 Metro가 함께 떠야 합니다.
- Metro 없이 열릴 배포용 실기기 빌드는 `cd apps/mobile && npm run ios:release -- --device`를 사용합니다.

모바일 웹 개발/프리뷰:

```bash
cd apps/mobile
npm run web
```

- Expo 기준으로 모바일 웹 화면을 바로 확인할 때 사용합니다.
- Hosting에 올라갈 `/m` 결과물을 확인하려면 루트에서 `npm run build && npm run serve`를 실행한 뒤 `http://localhost:5000/m`를 확인합니다.

## 주요 스크립트

루트:

```bash
npm run dev
npm run build:web
npm run build:mobile-web
npm run build
npm run build:css
npm run watch:css
npm run sync:openview
npm run serve
npm run test:mobile
```

- `build:web`: `public/` 기반 웹 앱을 `dist/`로 빌드합니다.
- `build:mobile-web`: `apps/mobile`을 `dist/m`으로 export 합니다.
- `build`: 웹 앱 + 모바일 웹을 함께 빌드합니다.
- `build:css`와 `watch:css`는 `public/static/css/input.css`에서 `public/static/css/style.css`를 생성합니다.
- `sync:openview`는 `dist/openview.html`을 `functions/openview.html`로 복사합니다.

모바일 워크스페이스:

```bash
cd apps/mobile
npm run start:ios
npm run start:tunnel
npm run ios
npm run ios:release
npm run web
npm run test
npm run typecheck
npm run audit:spacing
npm run report:radius-full
```

## 모바일 홈 배너 설정

- 기본 운영값은 Firestore 문서 `app_config/mobile_trip_list_banner`에서 읽습니다.
- Firebase Console에서 해당 문서를 만들고 아래 필드를 넣으면, 모바일 여행 리스트 홈에서 프로필 카드 아래 배너가 서버 응답(`/config`) 기준으로 노출됩니다.
- `enabled=true`이고 `targetUrl`이 있으며 `title` 또는 `body` 중 하나가 있어야 실제로 보입니다.
- 문서가 없거나 일부 필드가 비어 있으면 서버는 기존 `functions/.env`의 `MOBILE_TRIP_LIST_BANNER_*` 값을 fallback으로 사용합니다.

예시 문서:

```json
{
  "enabled": true,
  "eyebrow": "PROMOTION",
  "title": "PLIN 여행 혜택 모아보기",
  "body": "제휴 혜택, 이벤트, 추천 링크를 한곳에서 확인해 보세요.",
  "ctaLabel": "열어보기",
  "targetUrl": "https://example.com/promo"
}
```

선택 fallback 환경 변수:

```bash
MOBILE_TRIP_LIST_BANNER_ENABLED=false
MOBILE_TRIP_LIST_BANNER_EYEBROW=
MOBILE_TRIP_LIST_BANNER_TITLE=
MOBILE_TRIP_LIST_BANNER_BODY=
MOBILE_TRIP_LIST_BANNER_CTA_LABEL=
MOBILE_TRIP_LIST_BANNER_TARGET_URL=
```

## 디자인 시스템

- 공통 디자인 기준은 `DESIGN.md`를 source of truth로 사용합니다.
- 모바일 spacing/radius 토큰 구현은 `apps/mobile/src/theme/index.tsx`를 확인합니다.
- 모바일 bottom sheet 높이 기준은 `apps/mobile/src/theme/bottomSheet.ts`를 확인합니다.
- 모바일 spacing 규칙 검사는 `cd apps/mobile && npm run audit:spacing`으로 실행합니다.
- 모바일 `radius.full` 사용 현황 리포트는 `cd apps/mobile && npm run report:radius-full`로 확인합니다.
- 모바일 카피 점검은 `cd apps/mobile && npm run report:copy-audit`으로 실행합니다.
- UI 변경 전에는 `DESIGN.md`의 `UI Change Checklist`를 먼저 확인합니다.

## 배포 메모

- Hosting 루트는 `dist/`입니다.
- 루트 `npm run build`는 `dist/` 웹 앱과 `dist/m` 모바일 웹을 함께 만듭니다.
- 배포 전 공개 뷰어 변경이 포함되면 `npm run sync:openview`로 `functions/openview.html`을 갱신합니다.
- Service Worker 소스는 `public/static/sw.js`입니다.

## 주의사항

- 메인 웹 런타임은 `public/js/ui.js`와 `public/js/ui-transit.js`입니다.
- 공개 뷰어 런타임은 `public/js/viewer.js`입니다.
- 메인 앱은 `/static/css/input.css`를 직접 읽고, 공개 뷰어는 `/css/style.css`를 직접 읽습니다.
- Firebase 설정은 `public/js/firebase.js`와 백엔드 `/config` 응답을 함께 사용합니다.
