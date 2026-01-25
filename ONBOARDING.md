# PLIN Project Onboarding Guide

**PLIN**은 여행 계획을 쉽고 예쁘게 작성하고 공유할 수 있는 웹 애플리케이션입니다.

## 🛠 Tech Stack
- **Languages**: HTML5, CSS3 (TailwindCSS), JavaScript (ES6+ Modules)
- **Build Tool**: Vite
- **Backend/Infras**: Firebase (Firestore, Auth, Hosting, Functions, Storage)
- **Maps**: Google Maps JavaScript API

## 📂 Project Structure
```
piln/
├── public/              # Static assets (images, fonts) & HTML Entry points
│   ├── css/             # Global styles & Tailwind directives
│   ├── js/              # Core logic
│   │   ├── ui/          # UI Renderers, Drag&Drop, Modal logic
│   │   ├── utils/       # Helper functions (time, format, etc.)
│   │   ├── app.js       # Main Editor Entry Point (edit.html)
│   │   ├── viewer.js    # Viewer Entry Point (openview.html)
│   │   ├── map.js       # Google Maps Integration
│   │   └── state.js     # State Management (Signals/Proxies)
│   ├── index.html       # Landing Page
│   ├── edit.html        # Plan Editor Page (Auth required)
│   └── openview.html    # Public Viewer Page (Read-only)
├── functions/           # Firebase Cloud Functions (Node.js)
├── firestore.rules      # Database Security Rules
├── firebase.json        # Firebase Configuration
└── package.json         # Dependencies & Scripts
```

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+)
- npm
- Firebase CLI (`npm install -g firebase-tools`)

### 2. Installation
```bash
# Clone Repository
git clone [REPOSITORY_URL]
cd piln

# Install Dependencies
npm install
```

### 3. Local Development (`dev`)
로컬 개발 서버를 실행하여 실시간으로 변경 사항을 확인합니다.
```bash
npm run dev
```
*   편집기 접속: `http://localhost:5173/edit.html?id=[TRIP_ID]`
*   뷰어 접속: `http://localhost:5173/openview.html?id=[TRIP_ID]`

### 4. Deployment (`deploy`)
변경된 사항을 실제 서버(Firebase Hosting)에 배포합니다.

**전체 배포 (Hosting + Functions + Rules)**
```bash
npm run deploy:all
```

**프론트엔드만 빠르게 배포 (Hosting Only)**
```bash
npm run build
firebase deploy --only hosting
```

## 🔑 Key Features
*   **Timeline Editor**: 드래그 앤 드롭으로 일정 순서 변경, 시간 조정.
*   **Map Integration**: 일정에 등록된 장소를 지도에 마커와 경로로 시각화.
*   **Memory & Budget**: 사진 업로드, 메모 작성, 예산 관리 기능.
*   **Public Sharing**: 고유 링크를 통해 로그인 없이 여행 계획 열람 (Read-Only).
*   **Global Edit Mode**: '수정' 버튼 하나로 전체 앱의 편집 가능 여부 제어 (실수 방지 및 깔끔한 뷰잉 경험 제공).

## ⚠️ Development Notes
*   **Viewer Mode**: `viewer.js`는 `ui/renderers.js`를 공유하지만, `isReadOnlyMode` 플래그를 통해 편집 버튼 등을 숨깁니다.
*   **Map API**: `window.googleMapsApiKey`는 백엔드(`functions`)에서 받아와 보안을 유지합니다.
*   **Event Handling**: 보안 정책(CSP) 이슈 방지를 위해 `onclick="..."` 인라인 핸들러보다는 `addEventListener` 또는 코드 레벨에서의 `onclick` 바인딩을 권장합니다.
*   **Edit Mode Logic**: `window.isGlobalEditMode` 플래그를 사용하여 드래그 앤 드롭, 삭제 버튼, 컨텍스트 메뉴 등 모든 편집 UI의 표시 여부를 통합 제어합니다.
*   **Context Menu**: 모바일 롱프레스와 데스크탑 우클릭을 구분하기 위해 `window.lastTouchTime`을 활용하며, 수정 모드가 아닐 때는 메뉴 실행을 차단합니다.
