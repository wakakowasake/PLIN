# PLIN - 계획이 기록이 되다

**설레는 계획부터 소중한 추억까지. 당신의 여행을 한 권의 책처럼 남겨보세요.**

PLIN은 여행 계획 및 기록 관리를 위한 웹/모바일 애플리케이션입니다.

## 🌟 주요 기능

- 📅 **여행 계획 관리**: 일정별 타임라인 구성, 장소 검색, 경로 최적화
- 🗺️ **지도 통합**: Google Maps API를 활용한 장소 검색 및 경로 표시
- 📸 **추억 기록**: 여행 중 사진과 메모를 추가하여 추억 보관
- 🌤️ **날씨 정보**: 여행지 날씨 예보 제공
- 💰 **예산 관리**: 여행 지출 내역 추적
- 🚆 **대중교통 경로**: 일본 철도 경로 검색 (Ekispert API)
- 🌓 **다크모드**: 라이트/다크 테마 지원
- 📱 **PWA**: 오프라인 지원 및 모바일 앱처럼 사용 가능
- 🔐 **Google 로그인**: Firebase Authentication을 통한 간편 로그인

## 🛠️ 기술 스택

### Frontend
- **HTML5 / CSS3**: Semantic HTML, Tailwind CSS v4
- **JavaScript (ES6+)**: 모듈화된 구조
- **Firebase SDK**: Authentication, Firestore, Storage

### Backend
- **Firebase Functions**: Node.js 기반 서버리스 함수
- **Express.js**: API 라우팅

### APIs
- Google Maps API (Places, Directions, Geocoding)
- Unsplash API (여행지 이미지)
- Ekispert API (일본 철도 경로)
- OpenWeatherMap API (날씨 정보)

### Tools & Services
- Firebase Hosting
- Firebase Emulator Suite
- Capacitor (모바일 빌드)

## 📦 설치 및 실행

### 사전 요구사항

- Node.js 18 이상
- Firebase CLI: `npm install -g firebase-tools`
- Google Cloud 프로젝트 (Maps API 활성화)

### 1. 저장소 클론

```bash
git clone <repository-url>
cd piln
```

### 2. 의존성 설치

```bash
# 루트 디렉토리
npm install

# Firebase Functions
cd functions
npm install
cd ..
```

### 3. 환경 변수 설정

`functions/.env` 파일을 생성하고 다음 내용을 입력하세요:

```bash
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
PLIN_FIREBASE_API_KEY=your_firebase_api_key
UNSPLASH_ACCESS_KEY=your_unsplash_access_key
EKISPERT_API_KEY=your_ekispert_api_key
```

> 📝 `.env.example` 파일을 참고하세요.

### 4. Firebase 프로젝트 설정

```bash
# Firebase 로그인
firebase login

# Firebase 프로젝트 선택
firebase use <your-project-id>
```

### 5. 로컬 개발 서버 실행

```bash
# Firebase Emulator Suite 실행 (권장)
firebase emulators:start

# 또는 개별 서비스만 실행
firebase serve --only hosting
```

앱이 실행되면 http://localhost:5000 에서 확인할 수 있습니다.

## 🚀 배포

### Firebase Hosting에 배포

```bash
# 전체 배포 (Hosting + Functions + Storage)
firebase deploy

# 특정 서비스만 배포
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only storage
```

### 모바일 앱 빌드 (Capacitor)

```bash
# Android
npx cap sync android
npx cap open android

# iOS
npx cap sync ios
npx cap open ios
```

## 📁 프로젝트 구조

```
piln/
├── public/                 # 정적 파일
│   ├── css/               # 스타일시트
│   │   ├── input.css      # Tailwind 입력 파일
│   │   └── style.css      # 컴파일된 CSS
│   ├── js/                # JavaScript 파일
│   │   ├── config.js      # 설정
│   │   ├── firebase.js    # Firebase 초기화
│   │   ├── map.js         # 지도 관련 기능
│   │   ├── state.js       # 상태 관리
│   │   ├── ui.js          # 메인 UI 로직
│   │   ├── ui-transit.js  # 대중교통 UI
│   │   ├── ui-utils.js    # UI 유틸리티
│   │   └── ui/            # UI 컴포넌트 모듈
│   ├── images/            # 이미지 리소스
│   ├── index.html         # 메인 페이지
│   ├── manifest.json      # PWA 매니페스트
│   └── sw.js              # Service Worker
├── functions/             # Firebase Functions
│   ├── index.js          # 함수 정의
│   ├── package.json
│   └── .env              # 환경 변수 (git 제외)
├── android/              # Android 프로젝트 (Capacitor)
├── .firebaserc           # Firebase 프로젝트 설정
├── firebase.json         # Firebase 배포 설정
├── storage.rules         # Storage 보안 규칙
├── firestore.rules       # Firestore 보안 규칙
└── package.json          # 프로젝트 메타데이터
```

## 🔒 보안

- **API 키 관리**: 민감한 API 키는 Firebase Functions를 통해 서버 측에서 관리
- **Firebase 보안 규칙**: Firestore와 Storage 접근 제어 적용
- **CORS**: Cross-Origin 요청 제한
- **인증**: Firebase Authentication을 통한 사용자 인증

## 🧪 테스트

```bash
# (추후 추가 예정)
npm test
```

## 📝 개발 가이드

### CSS 빌드

```bash
# Tailwind CSS 빌드
npx tailwindcss -i ./public/css/input.css -o ./public/css/style.css

# Watch 모드
npx tailwindcss -i ./public/css/input.css -o ./public/css/style.css --watch

# Minify
npx tailwindcss -i ./public/css/input.css -o ./public/css/style.css --minify
```

### 코드 스타일

- ES6+ 모듈 사용
- Camel case 변수명
- 주석을 통한 코드 설명
- 환경별 로깅 (개발/프로덕션 구분)

### Git 커밋 컨벤션

- `feat:` 새로운 기능
- `fix:` 버그 수정
- `docs:` 문서 변경
- `style:` 코드 포맷팅
- `refactor:` 리팩토링
- `test:` 테스트 추가/수정
- `chore:` 빌드 설정 등

## 🤝 기여

기여는 언제나 환영합니다! Pull Request를 보내주세요.

## 📄 라이선스

[라이선스 정보 추가 필요]

## 🔗 링크

- [프로덕션 사이트](https://plin.ink)
- [Firebase 콘솔](https://console.firebase.google.com)
- [문의하기](mailto:your-email@example.com)

## 📞 문제 해결

### Firebase Emulator 연결 오류
```bash
# Emulator를 먼저 실행한 후 앱을 실행하세요
firebase emulators:start
```

### API 키 오류
- `functions/.env` 파일에 모든 필수 환경 변수가 설정되었는지 확인
- Firebase Functions를 다시 배포: `firebase deploy --only functions`

### Firestore 권한 오류
- `firestore.rules` 파일의 보안 규칙 확인
- Firebase Console에서 규칙이 올바르게 배포되었는지 확인

---

**Made with ❤️ by PLIN Team**
