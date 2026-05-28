# PLIN Design System

PLIN is a travel planning, sharing, and memory-keeping product.
Its UI should feel like a warm travel journal rather than a booking marketplace or a cold productivity dashboard.

## 0. How To Use This Document

- UI 작업 전 반드시 이 문서를 먼저 읽는다.
- 새 화면이나 리팩터링은 아래 순서로 결정한다.
  1. 화면 역할
  2. 정보 계층
  3. spacing/radius/token
  4. copy tone
  5. 검증 스크립트
- 모바일 UI 구현 기준은 `apps/mobile/src/theme/index.tsx`, bottom sheet 높이는 `apps/mobile/src/theme/bottomSheet.ts`를 따른다.
- 문서와 코드가 충돌하면 색상, spacing, radius 값은 코드 토큰을 우선하고, 제품 방향, 카피, 컴포넌트 역할은 `DESIGN.md`를 우선한다.

Reference blend:
- Notion 70: warm minimalism, calm spacing, soft surfaces
- Airbnb 20: travel imagery, rounded cards, discoverability
- Clay 10: editorial softness, gentle brand moments

This design system applies to both:
- `public/` web experience
- `apps/mobile/` mobile app

Implementation source of truth:
- Shared design direction: `DESIGN.md`
- Mobile token implementation: `apps/mobile/src/theme/index.tsx`
- Mobile bottom sheet height hierarchy: `apps/mobile/src/theme/bottomSheet.ts`
- Mobile app copy benchmark and rewrite rules: `docs/MOBILE_COPY_STYLE_GUIDE.md`
- Mobile spacing enforcement: `apps/mobile/scripts/spacing-audit.mjs`
- Mobile `radius.full` usage report: `apps/mobile/scripts/radius-full-report.mjs`

Design verification commands:
- `cd apps/mobile && npm run typecheck`
- `cd apps/mobile && npm run audit:spacing`
- `cd apps/mobile && npm run report:radius-full`
- `cd apps/mobile && npm run report:copy-audit`
- Root build check: `npm run build`

## 1. Visual Theme & Atmosphere

- Core mood: calm, warm, personal, tactile, reflective
- Product feeling: a travel notebook that also happens to be a capable planning tool
- Emotional keywords: journal, postcard, memory, itinerary, bookshelf, paper, sunlight
- Visual density should be moderate. Do not make PLIN feel sparse like a portfolio or dense like a business dashboard.
- Surfaces should feel layered like paper or cards on a desk: soft, readable, lightly elevated
- Warmth should come more from imagery, copy, and restrained orange accents than from beige-heavy chrome
- Photography matters, but should support the story of a trip rather than overwhelm the interface
- Planning flows should feel organized and trustworthy
- Memory and sharing flows should feel gentle, sentimental, and human

### Screen Role Rules

- `Home / Trip List`: anticipation, active planning, quick return to current trip
- `Trip Detail`: readable itinerary notebook, today-first clarity
- `Timeline Editor`: precise workflow surface, low decoration, clear save path
- `Map / Place Search`: map as canvas, sheet as decision surface
- `Plan Marketplace`: curated PLIN itinerary storefront, purchase-aware but still calm and editorial
- `Settings`: quiet utility surface, less editorial tone

## 2. Color Palette & Roles

The shared runtime palette intentionally adopts the exact Daangn light/dark values.
Keep the existing token names in code, but use the hex values and roles below as the design reference.

### Token Name Mapping

Use these conceptual names in design discussion, but keep the existing runtime code names:

| Design role | Mobile token |
|---|---|
| `paper` | `theme.colors.background` |
| `paper-elevated` | `theme.colors.surface` |
| `paper-muted` | `theme.colors.surfaceMuted` |
| `line-warm` | `theme.colors.border` |
| `ink` | `theme.colors.textPrimary` |
| `ink-soft` | `theme.colors.textSecondary` |
| `brand` | `theme.colors.accent` |
| `brand-strong` | `theme.colors.accentStrong` |
| `brand-soft` | `theme.colors.accentSoft` |
| `memory` | `theme.colors.warning` |
| `memory-soft` | `theme.colors.warningSoft` |

### Light Theme

| Token | Hex | Role |
|---|---|---|
| `paper` | `#ffffff` | Main app background |
| `paper-elevated` | `#f7f8f9` | Cards, sheets, drawers |
| `paper-muted` | `#f3f4f5` | Secondary surfaces, badges, muted panels |
| `line-warm` | `#dcdee3` | Borders, dividers, hairlines |
| `ink` | `#1a1c20` | Primary text |
| `ink-soft` | `#868b94` | Secondary text, helper copy |
| `brand` | `#ff6600` | Primary action, active state, important highlights |
| `brand-strong` | `#e84500` | Pressed state, emphasized orange text, stronger CTA moments |
| `brand-soft` | `#fff2ec` | Brand-tinted backgrounds, chips, selected fills, focus fills |
| `memory` | `#f21e16` | Warnings, edits, destructive emphasis |
| `memory-soft` | `#fdf2f2` | Warning backgrounds |

### Dark Theme

| Token | Hex | Role |
|---|---|---|
| `paper-dark` | `#121212` | Main dark background |
| `paper-dark-elevated` | `#25272c` | Cards, sheets, drawers |
| `paper-dark-muted` | `#2c2e34` | Secondary surfaces |
| `line-dark` | `#3e4145` | Borders, separators |
| `ink-dark` | `#f3f4f5` | Primary text |
| `ink-dark-soft` | `#b0b3ba` | Secondary text |
| `brand-dark` | `#ff6600` | Primary action and highlights |
| `brand-dark-strong` | `#f75900` | Pressed state and stronger orange emphasis |
| `brand-dark-soft` | `#31241f` | Soft highlight fills |
| `memory-dark` | `#f73526` | Warning and editable emphasis |
| `memory-dark-soft` | `#322323` | Warning backgrounds |

### Color Rules

- White, light gray, and charcoal should dominate the product chrome. The UI should feel clean first, warm second.
- `brand` is the primary CTA color. Use it intentionally, not everywhere.
- `brand-soft` is the default selected, chip, and soft emphasis fill. Reach for it before inventing another accent family.
- `brand-strong` is for pressed states or high-emphasis orange text, not for full-screen fills.
- `memory` and `memory-soft` are the shared warning/edit pair across web and mobile.
- In light mode, runtime cards and sheets should sit one tone above the page background instead of fully blending into it.
- Avoid introducing bright blues, purples, or cold grays as dominant UI colors.
- Do not reintroduce beige, cocoa, or brown as the default app chrome unless a one-off editorial surface explicitly needs it.
- Pure white backgrounds are allowed and expected in the core runtime UI when paired with the neutral border/text system above.

## 3. Typography Rules

- Primary family for Korean UI: use the Pretendard family where available
- Primary family for dense body content: system UI sans is acceptable for long-form readability
- Overall typography should feel editorial but approachable
- Headings should feel firm and memorable, not corporate or sterile

### Hierarchy

| Role | Style |
|---|---|
| `Display` | Pretendard ExtraBold, 40-52px desktop / 32-40px mobile, tight tracking |
| `H1` | Pretendard Bold, 32-40px desktop / 28-32px mobile |
| `H2` | Pretendard Bold, 24-30px |
| `H3` | Pretendard SemiBold or Bold, 20-24px |
| `Body-L` | 17-18px, comfortable line height |
| `Body` | 15-16px, default paragraph size |
| `Caption` | 12-14px, never too faint |
| `Meta` | 11-13px, medium weight, slightly tighter tracking |

### Typography Rules

- Use bold display type for titles, section headers, and key trip names
- Keep paragraph text soft and readable with generous line height
- Use tighter tracking only for large lockups, never for body text
- Use sentence case in most UI labels
- Avoid all-caps except tiny metadata or overline labels
- If an occasional editorial English line is used, it should feel like a subtle brand moment, not a second design language

### Mobile Typography Scale

- `apps/mobile/src/theme/index.tsx` currently tokenizes font family only. Mobile font size and line-height rules live in this document until explicit typography size tokens are added.
- Preferred mobile text tiers:
  - `Display`: `32~40`, hero-only, onboarding, empty-state hero, major trip lockup
  - `Screen Title / H1`: `28~32`, top-level screen title
  - `Section Title / H2`: `20~24`, section headers, modal titles
  - `Card Title / H3`: `18~20`, trip card titles, detail block titles
  - `Body-L`: `16~17`, prominent descriptive copy
  - `Body`: `15~16`, default paragraph and form body copy
  - `Support`: `13~14`, helper text, secondary description, dense inline copy
  - `Meta / Chip / Caption`: `11~12`, metadata, chip labels, timestamps, counters
- Button and chip labels:
  - primary action button text: `15~16`
  - compact button, filter chip, meta chip text: `12~13`
- One mobile screen should usually stay within `3~4` text tiers. Avoid introducing many near-duplicate font sizes on the same screen.
- Prefer line-height ratios that keep Korean text airy and readable:
  - large headings: approximately `1.15~1.25`
  - body copy: approximately `1.4~1.55`
  - caption/meta: approximately `1.3~1.45`

### Mobile Typography Decision Table

| Use case | Size | Line height | Weight |
|---|---:|---:|---|
| Screen title | 28-32 | 34-40 | bold/display |
| Section title | 20-24 | 26-32 | bold |
| Card title | 18-20 | 24-28 | semibold/bold |
| Primary body | 15-16 | 22-24 | regular/medium |
| Support text | 13-14 | 18-20 | regular/medium |
| Chip/meta | 11-12 | 14-16 | medium/semibold |

Rules:
- One screen should normally use only 3-4 tiers.
- Do not add near-duplicate values such as 14, 15, 16, 17 all in the same component group.
- Keep letter spacing at `0` unless it is a tiny metadata label.

## 4. Component Stylings

### Mobile Component Decision Rules

Trip cards:
- Feed/list cards prioritize title, destination/date, status, collaborators.
- Hero cards may use larger photography but must keep text legible with veil/overlay.

Timeline rows:
- Time and title are primary.
- Place, movement, memo, expense are secondary.
- Edit controls must appear only in edit mode or explicit action surfaces.

Bottom navigation:
- Keep labels visible.
- Active state uses `accent`; inactive state uses `textSecondary`.
- Navigation should not compete visually with trip cards or CTAs.

Action rows:
- One primary action per footer.
- Secondary actions should be text/ghost unless they are destructive.

Expense rows:
- Show total/summary above the list; do not hide total below transaction rows.
- Transaction rows prioritize description on the left and amount on the right.
- Do not repeat currency/status metadata in row subtitles when the amount already carries currency.
- Persistent transaction rows should not show transient "just added" or "just edited" effects.
- Delete controls should stay visually secondary unless the user is in a destructive confirmation flow.

### Buttons

- Primary buttons: `brand` fill, white text, medium-to-bold weight, `radius.md(16)` by default
- Secondary buttons: white or `paper-muted` background, neutral border, dark text
- Ghost buttons: transparent with strong hover or pressed feedback
- Compact buttons, tags, and segmented controls use `radius.sm(8)`
- Buttons should feel soft and substantial, not sharp, glossy, or overly tinted

### Navigation

- Web side navigation and mobile bottom navigation should look like calm, lightly elevated rails
- Active items use `brand` and stronger text contrast
- Inactive items stay on `ink-soft`, never flat black
- Navigation should feel supportive and quiet, not dominant

### Trip Cards

- Trip cards are a core PLIN component and should carry the strongest visual identity
- Use large cover imagery with neutral dark overlays where needed for legibility
- Card bodies should include trip title, date, destination, and a small emotional cue such as duration or memory count
- Cards should feel like keepsakes or journal covers, not marketplace listings
- Rounded corners should be generous but tokenized: `radius.md(16)` for standard cards, `radius.lg(24)` for large hero cards

### Timeline and Day Cards

- Day sections should feel orderly, like well-arranged notebook pages
- Timeline items use paper surfaces, soft borders, and modest shadows
- Use color and emphasis to signal priority, weather, transport, or edits without becoming noisy
- Date chips and plan labels should be compact and tactile

### Plan Marketplace Cards

- Marketplace surfaces should feel like a curated bookshelf of travel plans, not an open social feed
- Prioritize cover image, destination, duration, PLIN curation signal, and purchase/access state
- Avoid loud price badges, engagement counters, or aggressive commerce chrome

### Sheets, Modals, and Editors

- Bottom sheets and modals should feel like thick paper cards or travel folders
- Use large radii (`radius.lg(24)` or `radius.xl(32)`), soft borders, and a restrained blur backdrop
- Forms should be calm and forgiving with clear grouping and enough padding

#### Mobile Bottom Sheet Height Hierarchy

Mobile sheet height is role-based. Do not choose sheet height per screen mood or available content amount.
Use `apps/mobile/src/theme/bottomSheet.ts` as the implementation source of truth.

| Tier | Height | Use For | Examples |
|---|---:|---|---|
| Workflow sheet | `100%` | Any flow where the user enters, edits, uploads, reviews, saves data, or manages a timeline item with direct edit/delete/add actions | schedule detail view, schedule edit, budget/expense add, memo add, memory add, quick route add, existing item copy, manual transit add, trip share, participant announcement |
| Detail sheet | expanded `92%`, compact `60%` | Read-first detail surfaces that can be expanded but are not primarily form entry | budget summary, revision history |
| Map exploration sheet | peek `8%`, default `52%`, expanded `84%` | A map remains the primary canvas and the sheet is used to search, browse, or confirm places | new place search and direct map selection |
| Contextual action sheet | `78%` max | A focused menu or launcher that leads to another workflow | add-item option sheet |
| Picker sheet | `70%` max or intrinsic picker height | One-field or one-choice selection | transit type, date, time, duration, currency |

### Sheet Implementation Mapping

| Sheet kind | Required behavior |
|---|---|
| Workflow | Full height, fixed footer CTA or header actions, safe-area top/bottom padding |
| Detail | Compact/expanded snap, read-first, rounded top corners allowed |
| Map exploration | Map remains visible; sheet default must not cover the map |
| Contextual action | Launcher/menu only; no long form entry |
| Picker | One decision only; compact height preferred |

Rules:
- Never choose sheet height based only on content length.
- A save button means the sheet is probably `Workflow`.
- A selected item preview over a map means the sheet is probably `Map exploration`.

Rules:
- Workflow sheets should use full height even when their content is short. This prevents nested editing flows from changing visual weight unexpectedly.
- Full-height workflow sheets may remove top radius and rely on the handle/header for sheet affordance.
- Full-height workflow sheet chrome uses the sheet surface. Handles and headers should sit on `surface`; editable/readable content groups sit on white `background` cards with subtle separation.
- Detail sheets may keep rounded top corners because they sit on top of an existing view state.
- Map exploration sheets must not default to full height because the map is part of the active task.
- Picker sheets should stay visually lighter than workflow sheets and should not become full-screen unless they become a multi-step editor.

### Inputs and Search

- Inputs use neutral surfaces and visible borders
- Focus state should use `brand-soft` fill plus an orange accent ring
- Search should feel lightweight and conversational, not enterprise-heavy

### Empty States

- Empty states should be optimistic, gentle, and story-oriented
- Prefer copy that suggests possibility: planning, saving, remembering, sharing
- If illustrations are used, they should feel postcard-like, not cartoonish

## 5. Layout Principles

- Mobile layout follows an 8pt grid. All layout values are limited to `0`, `1(hairline)`, `4`, and multiples of `8`
- Do not use the old `6 / 10` spacing rhythm in new or refactored mobile UI
- Mobile spacing tokens are `4 / 8 / 16 / 24 / 32 / 40 / 48 / 64`
- Prefer strong section grouping over many tiny containers
- Keep outer padding generous, especially on mobile hero and detail screens
- Web layouts should avoid overly wide content blocks; reading areas should remain comfortable
- Major pages should be built around 3 layers:
  - page background
  - primary content surface
  - focused interaction surface such as modal, sheet, or selected card
- Hero areas should combine photography and metadata cleanly, with readable overlays
- Maps, weather, transport, and checklist blocks should feel integrated into the same visual language rather than separate widgets

### Mobile Audit Rules

The spacing audit treats these as failures:
- raw layout values outside `0`, `1`, `4`, or multiples of `8`
- `theme.spacing.* + number`
- `theme.radius.* + number`
- inline layout styles for static margin/padding/gap/radius/position

The radius report treats these as review targets:
- `radius.full` on chips, buttons, controls, or generic containers
- `radius.full` is acceptable for avatars, circular controls, drag handles, dots, indicators

### Mobile 8pt Rules

- Treat spacing as two layers:
  - layout spacing: screen padding and section separation, usually `24` or `32`
  - content spacing: component internals, usually `8` or `16`
- Default spacing usage:
  - `4`: divider, border, and icon-text micro alignment only; this should read as nearly invisible spacing
  - `8`: the minimum visible interactive inline spacing such as labels, chips, and small rows
  - `16`: component internal padding
  - `24`: section spacing and default screen padding
  - `32`: hero/header separation
  - `40+`: only for hero, onboarding, and empty-state breathing room; never use `40` on standard screens
- Default density tiers:
  - comfortable: `24`
  - default: `16`
  - compact: `8`
- A single screen should keep one density as its baseline. Other density values are exception-only and should not become a second default on the same screen.
- Spacing choice order is: component role > screen density > token value
- Repeated siblings in the same hierarchy should use `gap`; outer separation should use `margin`
- When `gap` is used for a row/list, remove per-item spacing margin from its children
- Do not stack sibling item spacing by mixing `gap` and per-item margin for the same row/list
- Basic layout spacing should be chosen from `8~32`. Use `4` only for divider/micro spacing and `40+` only for hero, onboarding, and empty-state layouts.
- Default mobile whitespace rhythm:
  - screen horizontal padding: usually `24`
  - section-to-section spacing: usually `24`
  - card/list internal padding: usually `16`
  - card-to-card spacing in the same list: usually `16`
  - text block spacing inside a component: usually `8`
  - chip group spacing: usually `4`
  - hero, onboarding, empty-state top breathing room: `32` or `40`
- Media-text spacing:
  - image or thumbnail edge to card border: usually `16`
  - image or thumbnail to text copy: usually `16`
  - text copy to trailing action/control: at least `8`
  - use `8` only for very dense compact rows; travel list cards should default to `16` for visual stability
- Safe-area defaults:
  - screen root: `paddingTop = insets.top + 24`, `paddingBottom = insets.bottom + 16`
  - bottom sheet: `paddingBottom = insets.bottom + 24`
  - bottom sheet scroll content, including selection sheets such as the manual transit type picker, should keep final content breathing room with `paddingBottom = insets.bottom + 24`
  - bottom sheet fixed action rows should use `paddingBottom = insets.bottom + 24` so primary actions stay clear of the home indicator or system navigation
  - fixed bottom action/navigation area: at least `insets.bottom + 16`
  - apply safe-area padding at the screen root or top-level sheet container only, not inside nested components
- Radius tiers:
  - `radius.xs(4)`: optically corrected micro chip radius for `24`-height compact chips only
  - `radius.sm(8)`: compact button, tag, segmented control, small input
  - `radius.md(16)`: card, list item, standard action surface
  - `radius.lg(24)`: modal, sheet, large grouped section
  - `radius.xl(32)`: large hero container
  - `radius.full`: avatar, pill chip, circular control, drag handle
- `radius.sm(8)` is for interactive UI only. Do not use it as the default radius for container surfaces; containers should use `radius.md(16)` or above.
- Rounded container surfaces should not use visible borders by default. Cards, list items, grouped sections, summary panels, sheets, and modals should be separated with background tone, spacing, and only subtle elevation when needed.
- Borders on rounded UI are reserved for explicit affordance states such as inputs, focus, error, selection, or small controls that need stronger interaction feedback.
- Avoid raw layout values such as `10`, `12`, `14`, `18`
- Avoid token arithmetic such as `theme.spacing.* + 2` or `theme.radius.* + n`
- Static layout spacing should live in stylesheet tokens, not inline styles
- Inline style is allowed only for animation values and truly dynamic size/position values
- Transform-based offset hacks should be treated as exceptions and reviewed explicitly

### Mobile Chip Rules

- Compact information chips, filter chips, status chips, and meta pills should default to `radius.sm(8)`. Do not default these to `radius.full`.
- Use `radius.full` only when the element is intentionally circular or pill-specific: avatar, circular control, drag handle, or a deliberately emphasized hero pill.
- Chip radius should be optically corrected by chip height so visually similar chips keep a similar perceived curve.
- Optical chip radius mapping:
  - `minHeight = 24` compact chips use `radius.xs(4)`
  - `minHeight = 32` selectable/action chips use `radius.sm(8)`
  - `40+` height emphasized chips may use `radius.md(16)` only when they are intentionally button-like
- If two chips look equally “compact” but one is noticeably smaller, do not force the same radius token. Choose the radius tier that preserves similar apparent curvature instead.
- Default compact chip sizing:
  - `paddingHorizontal = 8`
  - `paddingVertical = 4`
  - `minHeight = 24` when a minimum height is needed
- Default selectable/action chip sizing:
  - `paddingHorizontal = 16`
  - `paddingVertical = 4`
  - `minHeight = 32`
- Chip groups should feel tidy and quiet. Prefer `gap: 4` between sibling chips and avoid visual badge overload on cards and feeds.
- Chip labels usually sit in the `Meta / Chip / Caption` tier: typically `11~12`, medium or semibold weight.

## 6. Depth & Elevation

- For rounded surfaces, prefer tonal contrast first, shadows second, borders last
- Shadows should be soft, short, and neutral
- Default surfaces should feel almost flat, like stacked paper
- Hover elevation on desktop should be subtle: small translate and shadow increase
- Dark mode should rely more on tonal contrast than heavy shadow
- Glass or blur effects are allowed only for focused moments such as auth, modal backdrops, or premium hero overlays

## 7. Do's and Don'ts

### Do

- Make PLIN feel like a personal travel journal with real utility
- Keep planning screens structured and trustworthy
- Let imagery create anticipation and memory without taking over task flows
- Use clean white/light-gray neutrals as the foundation of the experience
- Give cards and sheets enough breathing room to feel calm
- Preserve emotional tone in Korean copy: warm, inviting, thoughtful

### Don't

- Do not make PLIN look like a flight, hotel, or commodity booking marketplace
- Do not replace the shared orange with bright red, coral, or secondary accent families as the main brand color
- Do not introduce cold SaaS blue, purple-heavy gradients, or overly glossy effects
- Do not pack screens with too many pills, outlines, and badges
- Do not wrap every rounded card or sheet in a visible outline
- Do not over-animate routine actions
- Do not make community screens feel like a noisy social media feed

## 8. Responsive Behavior

- Design mobile-first for all primary trip flows
- Mobile cards should usually stack in one column with clear vertical rhythm
- Desktop can expand to 2-3 columns for cards, but content should remain readable and warm
- Touch targets should stay at or above 44px
- Hero text must never sit directly on busy imagery without a tint, veil, or blur support
- Bottom sheets are preferred on mobile; centered dialogs are preferred on larger screens
- Navigation labels should remain visible when needed for clarity, especially on first-use flows

## 9. Motion & Interaction

- Motion should feel soft and confident, like pages sliding into place
- Use short fades, small upward motion, and gentle scale changes
- Prioritize page transitions, card reveal, bottom-sheet entrance, and success feedback
- Avoid springy or playful motion that feels toy-like
- Drag-and-drop and timeline editing should feel precise, not flashy

## 10. Content Tone

- Copy should feel warm, encouraging, and quietly emotional
- Prefer language that supports anticipation, memory, and companionship
- Avoid overly technical phrasing on user-facing surfaces unless the user is in a settings or diagnostic context
- For payment, marketplace, settings, and error copy, follow `docs/MOBILE_COPY_STYLE_GUIDE.md`, which is based on third-party mobile app references rather than PLIN web copy.
- Good tone examples:
  - "여행을 한 권의 책처럼 남겨보세요."
  - "설레는 계획부터 소중한 추억까지."
  - "다음 여행의 첫 장을 시작해보세요."

### Mobile Copy Decision Rules

- Empty states: possibility + one clear next action
- Loading states: what is being prepared, not system status
- Errors: what happened + what the user can try next
- Destructive confirmations: question form
- Save success: outcome wording, not implementation wording

Examples:
- `일정 저장 완료` -> `일정에 담았어요`
- `오류 발생` -> `여행 정보를 불러오지 못했어요. 다시 시도해 주세요.`
- `데이터 없음` -> `아직 담긴 일정이 없어요`

### Copy Rules

- Prefer user-understandable language over internal product or implementation terms
- Write around the user's action or outcome, not the feature name alone
- Status and feedback copy should read like product guidance, not system logs
- Error copy should suggest the next action whenever possible
- Confirmation dialogs should usually use question form
- Emotional copy is welcome, but it should stay one step more practical on core task screens
- Use the same wording pattern across web and mobile when the same action means the same thing

### Preferred Patterns

- Prefer "가져오기", "담기", "공유하기" over internal terms like "복제", "퍼블리시", "생성"
- Prefer "자동 추천 경로" over ambiguous promises like "빠른 경로"
- Prefer "공유 창을 닫았어요" over system-like labels such as "공유 창 닫힘"
- Prefer "여행 정보를 불러오는 중" over vague progress labels such as "여행 상세 준비 중"
- Prefer "삭제할까요?", "제거할까요?" over one-sided statements in destructive confirmations

### Example Pairs

- "복제" -> "내 일정으로 가져오기"
- "복제 완료" -> "내 일정에 담기"
- "빠른 경로" -> "자동 추천 경로"
- "공유 창 닫힘" -> "공유 창을 닫았어요"
- "여행 상세 준비 중" -> "여행 정보를 불러오는 중"

## 11. Agent Prompt Guide

### Quick Direction

- Build warm, journal-like travel UI for PLIN
- Keep the structure clear enough for planning, but the mood soft enough for memory-keeping
- Prefer Notion warmth over Airbnb marketplace energy
- Borrow Airbnb only for photo presentation, card discoverability, and travel context
- Borrow Clay only for restrained editorial softness
- Use clean white/light-gray surfaces with restrained `#FF6600` accents, not beige-heavy chrome
- On mobile, keep spacing and radius tokenized to the 8pt layout system described above

### Priorities When Designing New Screens

1. Preserve readability and task clarity
2. Maintain clean paper-like surfaces with neutral contrast
3. Highlight the emotional value of trips and memories
4. Keep the UI calm, never loud

### Ready-to-Use Prompt

Use `PLIN`'s `DESIGN.md`.
Design this screen as a warm travel journal interface with clean white/light-gray paper surfaces, restrained carrot-orange accents, generous rounded cards, strong but calm Korean typography, and photography used as emotional context.
For mobile, use tokenized 8pt spacing and radius tiers instead of arbitrary layout values.
Do not make it look like a booking marketplace or a generic SaaS dashboard.

## 12. UI Change Checklist

Before editing UI:
- Identify screen role.
- Pick the correct spacing density.
- Pick the correct sheet tier if a sheet is involved.
- Confirm primary/secondary CTA hierarchy.
- Check whether copy follows PLIN tone.

Before finishing UI:
- Run mobile typecheck.
- Run spacing audit.
- Run radius.full report.
- Check light/dark mode.
- Check Korean text wrapping.
- Check iOS/Android safe-area behavior for bottom UI.
