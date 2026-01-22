# 🚀 PLIN Developer Onboarding & Architecture Guide

This document serves as the **single source of truth** for understanding the PLIN project architecture, workflows, and developer conventions. **AI Assistants MUST read this first.**

---

## 📋 1. Core Operational Rules (Must Follow)

Refer to `.cursorrules` for the strictly enforced operational protocols.
- **Auto-Execute**: Always default to `SafeToAutoRun: true` for all commands/edits *except* `git push` and production deployments.
- **Korean Unicode**: **NEVER** escape Korean characters. Keep them as raw UTF-8 strings.
- **Auto-Commit**: After *every* meaningful change, commit and update `HISTORY.md`.

---

## 🏗️ 2. Project Architecture

PLIN is a **Vanilla JS** application powered by **Firebase** and styled with **Tailwind CSS**. It relies on a module-based architecture without a heavy frontend framework (like React/Vue).

### 📂 Directory Structure & Modules (`public/js/`)

> [!IMPORTANT]
> **자산 관리 구조**: 본 프로젝트는 `public/`을 소스 루트로 사용하며, Vite의 `publicDir` 설정이 `static/`으로 잡혀 있습니다.
> - **`public/js/`, `public/ui/` 등**: Vite에 의해 빌드/번들링되는 소스입니다. (해싱됨)
> - **`public/static/`**: 번들링 없이 `dist/` 루트에 **그대로 복사**되어야 하는 자산(아이콘, 매니페스트, 에러 가드 등)을 배치합니다. 하드코딩된 경로(예: `/favicon.ico`)로 접근하는 파일들은 반드시 여기에 위치해야 합니다.

| Module | Role | Description |
| :--- | :--- | :--- |
| **`ui.js`** | **Control Center** | 전역 UI 조정 허브. 모듈들을 통합하고 `window` 객체에 주요 함수를 노출합니다. |
| **`state.js`** | **Data Store** | `travelData` 전역 객체 및 애플리케이션 상태를 관리합니다. |
| **`ui/constants.js`**| **Constants** | **Z-Index 시스템 및 공통 상수 관리.** 모든 모달은 여기서 정의된 `Z_INDEX`를 따라야 합니다. |
| **`firebase.js`** | **Backend/DB** | Handles Firestore connections, Auth, and configuration loading. |
| **`map.js`** | **Maps** | Manages Google Maps SDK, markers, and path rendering. |
| **`ui/renderers.js`** | **View Layer** | Renders the main timeline content (HTML string generation). Most UI changes happen here. |
| **`ui/modals.js`** | **Interactions** | Manages all modals (add, delete, confirm). |
| **`ui/weather.js`** | **Feature** | Handles weather data fetching and display (Open-Meteo API). |
| **`ui/renderers-details.js`**| **Details** | Specific rendering logic for timeline details. |

---

## 🗺️ 3. "Where is the code?" (UI Mapping)

| UI Element | File | Key Functions |
| :--- | :--- | :--- |
| **Timeline Cards** (Place/Transit) | `ui/renderers.js` | `renderTimelineItemHtml`, `buildTransitCard` |
| **Detail Modal** (Popup) | `ui/timeline-detail.js` | `viewTimelineItem` |
| **Context Menu** (Right-click) | `ui/renderers.js` / `ui.js` | `openContextMenu`, `handleContextAction` |
| **Header** (Logo, Auth) | `ui/header.js` | `renderHeader`, `updateAuthUI` |
| **Profile Page** | `ui/profile.js` | `renderProfile` |

---

## 🛠️ 4. Debugging & Common Logic

- **Data Save/Load**:
  - `autoSave()` in `ui.js`: Triggers Firestore update.
  - `travelData` in `state.js`: The in-memory source of truth.
- **Event Handling**:
  - Most events are attached via inline `onclick` attributes pointing to window-scoped functions exposed in `ui.js`.
  - **Caution**: Ensure functions are properly attached to `window` if defined in modules.

  - **Caution**: Ensure functions are properly attached to `window` if defined in modules.

---

## 🚀 5. Deployment Guidelines (Critical)

> [!WARNING]
> **공유 링크(`/v/:id`) 배포 시 주의사항**
> 공유 뷰어 페이지는 **Cloud Functions**에 의해 서빙됩니다. 단순히 `npm run deploy:hosting`만 해서는 공유 링크 화면이 업데이트되지 않습니다.
> 반드시 다음 절차를 따라야 합니다:
> 1. **빌드**: `npm run build` (최신 `dist/openview.html` 생성)
> 2. **복사**: `dist/openview.html` -> `functions/openview.html` (템플릿 동기화)
> 3. **배포**: `firebase deploy --only functions`
> 
> *Hosting 배포는 정적 자산(JS, CSS) 갱신을 위해 필요하지만, HTML 구조 변경은 Functions 배포가 필수입니다.*

---

## 📝 6. Documentation Standard

- **HISTORY.md**: Must be updated after every commit. Use Korean.
  - Format: `### HH:MM - [AI] Change Description`
- **Commit Messages**: Korean, concise, with `[AI]` prefix.

---

> **Note to AI**: If you are reading this, you are ready to start. Proceed with the user's request, prioritizing **speed** and **stability**.
