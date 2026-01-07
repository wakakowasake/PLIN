# PLIN Trip Planner - AI Coding Guidelines

## Architecture Overview
PLIN is a single-page web app for trip planning using Firebase (Firestore + Auth) and Google Maps. No build system - ES6 modules loaded directly from CDN. Core structure:
- `public/index.html`: Main UI with Tailwind CSS styling and dark mode
- `public/js/state.js`: Global state management with exported variables and setters
- `public/js/ui.js`: UI interactions, Firebase operations, modal management
- `public/js/firebase.js`: Firebase initialization and exports
- `public/js/map.js`: Google Maps integration with Places autocomplete

## Key Patterns
- **State Management**: Use `setTravelData()`, `setCurrentDayIndex()` etc. from `state.js` instead of direct assignment
- **Firebase Operations**: Import Firestore functions directly in `ui.js`; use `onSnapshot` for real-time updates
- **Modal System**: Hide/show with `classList.add/remove('hidden')`; animations via CSS classes
- **Timeline Items**: Each has `time`, `title`, `location`, `icon`, `tag`, `tagColor`, `image`; transit items have `isTransit: true`
- **Day Structure**: `travelData.days[dayIndex].timeline` array; current day tracked by `currentDayIndex`

## Conventions
- **Icons**: Use Material Symbols Outlined (e.g., `directions_walk`, `restaurant`); defined in `icon` field
- **Colors**: `tagColor` values: "green", "gray", "blue", "red", "orange", "purple"
- **Authentication**: Google Auth via `signInWithRedirect`; user profile stored in `currentUser`
- **Data Persistence**: Trips saved as Firestore documents with user ID; unsubscribe listeners with `currentTripUnsubscribe`
- **Search Modes**: `searchMode` in `map.js` toggles between 'item' (timeline) and 'trip' (new trip creation)
- **Touch Handling**: Custom touch events for context menus on mobile (`touchStart`, `touchEnd`, `touchMove`)

## Development Workflow
- Deploy via `firebase deploy` (configured in `firebase.json`)
- Test locally with `firebase serve` if Firebase CLI installed
- No package.json - all dependencies via CDN imports
- Edit mode toggled via `isEditing` flag; affects UI interactions and styling

## Common Tasks
- Adding timeline items: Use `addTimelineItem()` with index and day index
- Updating meta: Call `updateMeta()` after state changes
- Weather fetch: `fetchWeather()` updates `travelData.meta.weather`
- Route modal: Opens Google Maps directions for current day locations</content>
<parameter name="filePath">g:\다른 컴퓨터\내 노트북 (2)\SoongSil Univ\Trip\.github\copilot-instructions.md