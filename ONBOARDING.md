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

| Module | Role | Description |
| :--- | :--- | :--- |
| **`ui.js`** | **Control Center** | The central hub coordinating all UI modules. Exposes global functions (`window.renderItinerary`, etc.). |
| **`state.js`** | **Data Store** | Manages the global `travelData` object and application state. |
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

---

## 📝 5. Documentation Standard

- **HISTORY.md**: Must be updated after every commit. Use Korean.
  - Format: `### HH:MM - [AI] Change Description`
- **Commit Messages**: Korean, concise, with `[AI]` prefix.

---

> **Note to AI**: If you are reading this, you are ready to start. Proceed with the user's request, prioritizing **speed** and **stability**.
