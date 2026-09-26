# AGENTS.md — StudyForge PWA (study-forge-learn-platform)

> Guide for AI agents and human contributors working on Satyam's StudyForge app.
> Single user today (Satyam, ADGIPS B.Tech IT Sem 1, Sec E); scaling to whole-college use later.

## 1. Project Overview

**StudyForge** is an offline-first, installable PWA study companion: goals/tasks/notes, XP + streaks,
weekly sprints, calendar, AI flashcards, voice notes (STT/TTS), an AI study buddy, and a live
Sec-E class timetable with a Today agenda layer. **No backend, no database, no auth** (login page is a
local bypass flag). All user data lives in the browser's `localStorage` on the device.

Status: live in production at `https://studyforged.vercel.app` (and `https://studyforged.netlify.app`) (currently **v0.6.21** [build 81]). AI buddy, voice,
and most editing still happen through the local dev loop (PC + USB). No test suite; verification is
`node --check` + purpose-built smoke harnesses + live serve checks (see §6).

Related folders (under `C:\Users\Administrator\Desktop\codex projects\SF\` — do not confuse them):
- `study-forge-pwa/` — **THE WORKSHOP. All edits go here.**
- `study-forge-deploy/` — clean copy for Netlify Drop (no `serve-pwa.js`, plus `version.json`). Rebuilt, never hand-edited.
- `study-forge-real-app/` — **PRISTINE backup** of the original August APK extraction. Never edit; reference only.
- Phone holds the original native app `com.studyforge.app` v1.0 (Capacitor shell, installed via EasyShare). Never modify/delete it from here.

## 2. Tech Stack

| Layer | Tech | Notes |
|---|---|---|
| Language | Vanilla JS + HTML5 + CSS3, no bundler | `script.js` ~5.9k lines, `styles.css` ~2.8k lines, single files |
| Data pack | `syllabus.js` (loads before `script.js`) | Profile, timetable, faculty, subjects, seed builders; all consumers guard with `typeof` |
| Persistence | `localStorage` only | `studyForgeState-v1` (main), `sf_ai_chats`, `sf_ai_active_chat`, `studyForge_flashcards`, `activeTab`, `sf_theme`, `isLoggedIn`, `userEmail` |
| Offline | Service worker `sw.js`, **network-first**, cache-fallback | Old cache-first worker caused stuck deploys; never go back |
| AI & Voice | Dual-Provider: Token Harbor (`https://tokenharbor.ai/v1`, ACTIVE for 20-day plan) + Vercel AI Gateway (`https://ai-gateway.vercel.sh/v1`, STANDBY for Day 20) + Deepgram nova-2 STT + aura TTS | Universal keys (`sf_tokenharbor_api_key`, `sf_vercel_ai_key`, `sf_deepgram_api_key`) live in client `localStorage` via in-app 🔑 Settings modal; default fallbacks remain in `script.js` for Satyam's private repo. |
| Voice | MediaRecorder + `getUserMedia` | No Capacitor plugins used (`capacitor.plugins.json` is `{}`) — fully browser-safe |
| CDN (progressive enhancement only) | Tailwind (login page), KaTeX, canvas-confetti, Google Fonts | Core app must work cached/offline without them |
| Dev server | `node serve-pwa.js` (zero-dep, `:3000`, `Cache-Control: no-store` on everything) | Serves the folder live; no restart needed after edits |
| Phone link | `adb reverse tcp:3000 tcp:3000` + `http://localhost:3000` on device | Campus/home Wi-Fi blocks phone↔PC; USB is the reliable pipe |
| Hosting | Vercel (`https://studyforged.vercel.app`) via GitHub (`IMMENSE-BUILDER/Study-Forge`) + Netlify Drop backup | 100 free deploys/day on Vercel; git push triggers automatic instant deploy |
| Future APK route | Capacitor re-wrap of this exact folder | Same codebase ships native; needs same signing key forever once released |

## 3. Project Structure

```
Desktop/study-forge-pwa/     # edit here
├── AGENTS.md                # this file (dev doc — exclude from Netlify deploys)
├── index.html               # 5 panels (timetable/goals/tasks/notes/snapshot) + bottom nav + dialogs
│                            # + AI page. Loads: confetti CDN, syllabus.js, script.js, SW register
├── script.js                # all app logic (~87 top-level functions, see §4)
├── syllabus.js              # SF_* data pack: profile, timetable, faculty, subjects, seed/migration helpers
├── styles.css               # neo-brutalist theme via CSS vars, mobile-first
├── sw.js                    # network-first worker; CACHE_NAME bumped every release
├── manifest.json            # StudyForge identity + icons[]
├── icons/                   # generated from logo.png (book+flame brand); app.png/logo.jpg are unused leftovers
├── login.html               # Tailwind bypass login → sets isLoggedIn
├── serve-pwa.js             # dev-only static server (never deployed)
├── _redirects               # SPA fallback (keep)
└── cordova.js / cordova_plugins.js  # 0-byte legacy stubs, harmless

Desktop/study-forge-deploy/  # = pwa minus serve-pwa.js/AGENTS.md, plus version.json {latest, versionCode, apkUrl}
Desktop/study-forge-real-app/ # pristine extraction — reference only
%LOCALAPPDATA%/Temp/opencode/ # sf-smoke-*.js harnesses, audit/analysis scripts (not part of the app)
```

Entry points: `index.html` → `syllabus.js` (data) → `script.js` (`let state = loadState()` →
`DOMContentLoaded` wires events, renders all). Debug from `renderAll()` and `getTodayAgenda()`.

## 4. Core Architecture & Key Decisions

- **One global `state` + explicit persistence.** `loadState()` merges stored JSON over fresh seed through
  `normalizeGoal/normalizeTask/normalizeNote/normalizeGauges`; `saveState()` writes whole object.
  New state fields must extend the normalizers + seed, never assume stored shape.
- **Seed + versioned migration, never wipe.** `buildIPUSeed()` builds the Sec-E starter pack;
  `migrateStateVersion()` (current `SF_STATE_VERSION = 6`) merges new content by title/ID match.
  Migrations must be idempotent (re-runs add zero dupes) and preserve user progress/XP.
- **Full re-render.** Every `render*()` rebuilds its panel from `state`; `renderAll()` refreshes all plus
  a 60s interval for the live timetable. No fine-grained reactivity — keep it that way.
- **Data pack pattern.** Timetable (`SF_TIMETABLE` Mon–Fri, `SF_TT_SLOTS`), faculty (`SF_FACULTY`),
  subjects (`SF_SEM1_SUBJECTS`), exam intel live in `syllabus.js`; `script.js` degrades gracefully if absent.
  Timetable aliases resolve via `ttResolve`/`ttInfo`; labs never show Room 2310 (lab halls differ).
- **Today engine is the hub.** `getTodayAgenda(state, now)` (pure, injectable date — always unit-test it)
  feeds greeting, today's subjects, focus-task matching (goal title prefix `ALIAS · …`), sprint-staleness.
- **AI Layer (Dual-Provider Architecture — Token Harbor Active & Vercel AI Gateway Standby):**
  - **Active Provider (MANDATORY for 20-Day Plan):** Token Harbor with default model `glm-5.3-flash`. Satyam has an active paid plan running for 20 more days (until ~Oct 10, 2026). All chat completions, vision OCR, and flashcard generations MUST default to Token Harbor to fully utilize this plan without wasting tokens.
  - **Standby Provider (Vercel AI Gateway):** Fully plumbed and integrated via `vercel.json` edge rewrites (`/api/ai/:path*` ➔ `https://ai-gateway.vercel.sh/v1/:path*`). Zero-code activation on Day 20 via the in-app 🔑 Settings modal (`#aiProviderSelect`). Supports `google/gemini-2.0-flash`, `openai/gpt-4o-mini`, `anthropic/claude-3-5-sonnet`, `deepseek/deepseek-chat`.
  - **Same-Origin Reverse Proxy:** Routes `/th-api/v1/chat/completions` and `/api/ai/chat/completions` via `vercel.json` to bypass browser CORS blocks natively.
  - **API Credentials & Private Repo Policy:** Universal keys (`sf_tokenharbor_api_key`, `sf_vercel_ai_key`, `sf_deepgram_api_key`) live in client `localStorage` via in-app 🔑 Settings modal (priority 1). Satyam confirmed the GitHub repository is kept strictly PRIVATE, so default keys in `script.js` remain intact as convenience fallbacks. Never sanitize or wipe keys without explicit user request.
  - **Academic Grounding:** `AI_SYSTEM_PROMPT` + `getUserContext()` ground answers in Satyam's syllabus & timetable. Always maintains "StudyForged" tutor identity.
- **Hold-to-select, not native selection.** Global `user-select:none`; 2s press-and-hold (`HOLD_SELECT_MS`)
  unlocks + auto-selects; inputs stay native. A post-hold click is consumed so holds never trigger tap actions.
- **Triple version discipline (load-bearing).** Every release bumps together:
  `SF_APP_VERSION` (syllabus.js) + `CACHE_NAME` (sw.js) + `version.json` (`latest`/`versionCode`).
  `version.json` is the future in-app-APK-updater backbone — keep its schema stable.
- **AGENTS.md sync (user demand).** Update this file after every build: version, `SF_STATE_VERSION`,
  AI provider, new seed/migration notes, and known gaps. Doc stays excluded from Netlify deploys.
- **Origins are separate universes.** `localhost:3000` (USB) vs LAN IP vs Netlify URL = three isolated
  storages. Always confirm which origin the user runs before debugging "lost data".
- **Default landing is forced to timetable** (`initBottomNav` pins `timetable`, middle tab). This was an
  explicit user demand after the branch-tab saga — do not "restore last tab" without asking.

## 5. Coding Style & Rules

Must-follow:
- Vanilla JS only, function declarations, `const`/`let` (note: `var` used for harness-tunable constants).
- Build DOM with `createElement`/`textContent` — **never `innerHTML` with user data** (XSS).
- Open/close dialogs only via `openDialog`/`closeDialog`; dismiss buttons use `data-close` (auto-wired).
- Z-index scale: content < menus (500) < bottom-nav (1000) < AI page (2000). Popups must paint above the AI bar; never restyle the AI bar to fix overlap.
- Mobile-first: design at 360px; no fixed px widths on layout elements; wide grids scroll internally (`overflow-x:auto`), never push the viewport (`body overflow-x:hidden` hides sins — audit instead).
- Fixed-height grid cells for alignment (timetable boxes), ellipsis + tap-toast for overflow text.
- Keep `user-select` discipline: locked by default, `allow-select` only via hold flow; never re-enable globally.
- Every change is verified: `node --check`, relevant `sf-smoke-*.js` harness, live-serve assertion. No exceptions.

Things to NEVER do:
- Never edit `study-forge-deploy/` by hand (rebuild it) or `study-forge-real-app/` at all.
- Never ship without bumping all three versions (§4); never rename `version.json` fields.
- Never add/remove bottom-nav tabs, change landing tab, or reorder nav without explicit approval (sore spot — see §7).
- Never add backend/auth/database/bundler/build step without approval — static files only.
- Never trust campus Wi-Fi for phone↔PC; always offer the USB path.
- Never paste API keys into chat/outputs; never commit new secrets; flag key rotation before any public share.
- Never present 2025-scheme syllabus content as current — user gathers official 2026 syllabi first (syllabus viewer was removed for exactly this; restore only on their data).
- Never invent timetable/faculty/subject facts — Sec-E PDF + photo legend are ground truth; mark anything uncertain.
- NEVER switch default AI provider away from Token Harbor (`glm-5.3-flash`) until the 20-day plan expires (~Oct 10, 2026). Vercel AI Gateway is in standby mode.
- Never remove or wipe fallback API keys from `script.js` without explicit user instruction — the repository is strictly private and the user relies on default fallbacks alongside `localStorage`.

Project constraints:
- Timetable = Sec E, Room 2310, AY 2026–27, Mon–Fri (Sat/Sun = weekend mode). E1/E2 are lab batches.
- EGL (Engineering Graphics) + PD (Personality Development) are college-run papers — not in USS scheme docs; EGL units follow the ETME-159 pattern.
- API credentials live in client `localStorage` via in-app 🔑 Settings modal; `script.js` defaults serve as convenience fallbacks for Satyam's private repo.
- Keep total cached assets small; SW ASSETS must list every new static file (icons!) or offline breaks.

## 6. Common Commands & Workflows

> **USER DIRECTIVE (Mandatory):** Do NOT run local dev server (`node serve-pwa.js`). All changes must be committed and pushed directly to GitHub (`origin main`), triggering automatic Vercel deployments. The user inspects and verifies all changes directly on the live website (`https://studyforged.vercel.app`).

```powershell
# Deploy loop: commit and push to GitHub (auto-deploys to Vercel)
git add .
git commit -m "feat/fix: description (vN)"
git push origin main

# Verify after any JS edit
node --check C:\Users\Administrator\Desktop\study-forge-pwa\script.js
node --check C:\Users\Administrator\Desktop\study-forge-pwa\syllabus.js

# Smoke harnesses (AppData\Local\Temp\opencode)
node sf-smoke3.js        # seed + v2→v3 migration + AI prompt grounding
node sf-smoke-today.js   # Today agenda on fixed dates
node sf-smoke-sat.js     # weekend mode + 5-day grid
node sf-smoke-hold.js    # hold-to-select state machine
node sf-smoke-liquid.js  # liquid-fill states on mocked Tue 11:45
node sf-smoke-branch.js  # (retired with branch tab; keep for reference)
node sf-smoke-syllabus.js# (retired with viewer; keep for reference)

# Phone over USB
& '...\platform-tools\adb.exe' devices
& '...\platform-tools\adb.exe' reverse tcp:3000 tcp:3000  # then phone opens http://localhost:3000

# Ship a release: rebuild deploy dir + bump version.json, then drag-drop to Netlify
Copy-Item "$src\*" $dst -Recurse -Exclude 'serve-pwa.js','AGENTS.md'
# set version.json {latest:"vN", versionCode:N, ...}

# Inspect phone artifacts (read-only; never modify the device)
adb shell pm list packages | grep -i forge
adb pull /data/app/~~.../com.studyforge.app-.../base.apk
adb pull /sdcard/Download/<file>

# PDF syllabus extraction
python readpdf.py / readscheme*.py / analyze_*.py  # pypdf-based, live in Temp/opencode
```

## 7. Current Status / Important Notes

Recent major changes (Sep 2026, now v0.6.21):
- v0.6.21 (Build 81):
  - Voice cost cut (user demand): TTS → Aura-1 Hera `aura-hera-en` (verified in Deepgram docs table; ~2x cheaper than Aura-2). Error surfacing from v0.6.20 kept.
  - Triple bump `v0.6.21` / `versionCode: 81` / `CACHE_NAME: study-forge-v0.6.21`.
- v0.6.20 (Build 80):
- v0.6.20 (Build 80):
  - TTS voice correction: `aura-iris-en` does NOT exist (Deepgram docs list Iris only as `aura-2-iris-en`, Aura-2, feminine Young Adult en-us) — old name would 400, and the missing `res.ok` check then played an error blob into silence with the button stuck on "Reading...". Fixed name + API errors now toast visibly and reset the button.
  - Triple bump `v0.6.20` / `versionCode: 80` / `CACHE_NAME: study-forge-v0.6.20`.
- v0.6.19 (Build 79):
- v0.6.19 (Build 79):
  - Voice upgrade (user demand): AI read-aloud TTS `aura-asteria-en` → `aura-iris-en` (`script.js` speak endpoint). STT stays `nova-2`.
  - Triple bump `v0.6.19` / `versionCode: 79` / `CACHE_NAME: study-forge-v0.6.19`.
- v0.6.18 (Build 78):
- v0.6.18 (Build 78):
  - Start-at-top fix (user demand): reloads and tab switches landed mid/bottom-page. Root causes: browser scroll restoration on reload + leftover scrollTop from a taller panel clamping the new shorter panel to its bottom. Fix: `history.scrollRestoration='manual'` + `scrollPageToTop()` on boot, on `load`, and on every `switchTab`.
  - Triple bump `v0.6.18` / `versionCode: 78` / `CACHE_NAME: study-forge-v0.6.18`.
- v0.6.17 (Build 77):
- v0.6.17 (Build 77):
  - Hint Buddy breathing room (user demand): chat area taller (150px min, up to 48vh/420px), roomier bubbles with relaxed line height, and the page smooth-scrolls the whole panel into view on open so nothing sits cut off.
  - Triple bump `v0.6.17` / `versionCode: 77` / `CACHE_NAME: study-forge-v0.6.17`.
- v0.6.16 (Build 76):
- v0.6.16 (Build 76):
  - Hint Buddy in quizzes (user demand): top-right 💡 Ask AI button on quiz page opens tutor chat grounded in topic + current question/options (answer hiddenly known, HARD RULE never to reveal it). Socratic nudges only (formula blanks, single-option elimination, leading questions, ≤80 words), quick chips (hint/formula/eliminate), per-question context dividers, result-screen follow-ups, Esc/back to dismiss, history resets per run.
  - Triple bump `v0.6.16` / `versionCode: 76` / `CACHE_NAME: study-forge-v0.6.16`.
- v0.6.15 (Build 75):
- v0.6.15 (Build 75):
  - Quiz `Unexpected token ... not valid JSON` fix: 5-Q response truncated under CoT load and both parsers choked. Same 4-tier recovery as flashcards (parse → salvage balanced objects → regex fields → merge/dedupe, needs ≥3 valid), 5-Q budget 4500→6000, and parser gibberish never reaches the UI (friendly "Quiz came back garbled — try again").
  - Triple bump `v0.6.15` / `versionCode: 75` / `CACHE_NAME: study-forge-v0.6.15`.
- v0.6.14 (Build 74):
- v0.6.14 (Build 74):
  - Living flashcard loader (user demand): mock skeleton keeps its breathing + sheen and now cycles build-stage messages every 1.6s (blueprint → derivations → traps → hooks → diagrams, with fade swap) plus an indeterminate progress bar; timer auto-stops on Card 1 / cache hit / error / abort / new request.
  - Triple bump `v0.6.14` / `versionCode: 74` / `CACHE_NAME: study-forge-v0.6.14`.
- v0.6.13 (Build 73):
- v0.6.13 (Build 73):
  - AI Quiz Arena (user demand, no nav change): `quizBlock` at bottom of flashcard section in Notes — topic input + 5/10 selector + Start button + Past Scores history (`studyForge_quiz`).
  - Dedicated in-app quiz page (`#quizPage`, z 2400 above AI bar / below zoom): Q progress, live score, 4-option MCQ with shuffled order, instant correct/wrong marking + Why + Trap per question, Next flow, result card (score %, +10 XP/correct +20 perfect bonus, confetti ≥80%, Retake/Done). Subject-grounded prompts reuse Token Harbor active model + flashcard JSON parsers.
  - Triple bump `v0.6.13` / `versionCode: 73` / `CACHE_NAME: study-forge-v0.6.13`.
- v0.6.12 (Build 72):
- v0.6.12 (Build 72):
  - Zoom close-button fix: ✕ glyph overflowed its 36px circle (font ascent/descent metrics). Bulletproofed `.fc-zoom-close-btn` (`line-height:1`, `padding:0`, centered text, clipped overflow) — glyph can never paint outside the circle, both themes.
  - Triple bump `v0.6.12` / `versionCode: 72` / `CACHE_NAME: study-forge-v0.6.12`.
- v0.6.11 (Build 71):
- v0.6.11 (Build 71):
  - Phase 2 now 1-by-1 (user demand): each background card is its own request, so 6/8-count decks land visibly card-by-card with live counter; single-card 4500 budget (matches Phase 1, no truncation).
  - Triple bump `v0.6.11` / `versionCode: 71` / `CACHE_NAME: study-forge-v0.6.11`.
- v0.6.10 (Build 70):
- v0.6.10 (Build 70):
  - Phase-2 stall fix (asked 6, got 1, banner stuck on "Generating remaining..."): one big 5-card background request could stall/truncate → zero follow-ups, and the old catch swallowed the reason then still claimed "All N ready".
  - Background now sends max-3-card batches (6000 cap each) with already-covered titles to avoid dupes; zero-progress batch breaks the loop instead of hammering; partial decks keep ready cards + persistent honest banner (`⚠️ Only X of N arrived (reason) — tap 🔥 Generate to retry`) + matching toast, instead of stuck/misleading status.
  - Triple bump `v0.6.10` / `versionCode: 70` / `CACHE_NAME: study-forge-v0.6.10`.
- v0.6.9 (Build 69):
- v0.6.9 (Build 69):
  - Invisible-flashcard root-cause fix (NOT backend/model/banner): `createCardDOM()` in `script.js` built front+back into `inner` but never appended `inner` to `cardEl` — only the `.fc-tap-hint` rendered, matching the blank-deck + hint-only screenshots exactly. One-line `cardEl.append(inner)` restores main + zoom cards. 3s Card-1 timing is genuine (single-card fast-path benchmark 1–2.5s), banner was truthful — renderer dropped the body. Saved-deck data was always fine.
  - Triple bump `v0.6.9` / `versionCode: 69` / `CACHE_NAME: study-forge-v0.6.9`.
- v0.6.8 (Build 68):
- v0.6.8 (Build 68):
  - Blank-Card-1 fix (v0.6.7 regression): status said "Card 1 ready" with 1/8 counter but deck area empty (hint only).
  - Root cause: Phase1 4500→3500 cut starved GLM 5.3 Flash CoT → truncated JSON → partial shell rendered as blank.
  - Restored safe budgets Phase1 4500 + Phase2 `min(8000,n*2000)`; kept snappy wins (schema caps, cache, throttle, 700ms retry, preconnect, chat opts).
  - Added `isValidCard` guard in both phase callbacks + cache-hit validation — shells with no title/content are skipped, never rendered/counted/saved; empty result now throws to error UI instead of blank.
  - Triple bump `v0.6.8` / `versionCode: 68` / `CACHE_NAME: study-forge-v0.6.8`.
- v0.6.7 (Build 67):
- Sec-E personalization pack: profile, timetable, faculty, exam intel, seed + migration (v1→v3).
- Timetable tab: 5-day aligned grid, live liquid-fill + done states, tap-to-toast (labs omit room), Today card.
- App hardening: responsive overhaul, hold-to-select, menu-over-AI-bar fix, no-wrap header, inner breathing room.
- PWA install fixed with exact-size icons; SW is network-first (v9+) after painful stuck-cache saga.
- v28→v31: timetable re-decoded from Sec-E photo (v4: Tue/Wed/Thu/Fri; v5: Mon lab double + BEE shift),
  E1/E2 batch splits in lab tap-toast, AI provider now TokenForge `claude-opus-5`. Deploy = exact copy of
  workshop at v31 (`versionCode` 31) minus `serve-pwa.js`/`AGENTS.md`.
- v32: XSS safe-display fix (`escapeHtml` + `textContent` builds for calendar preview, flashcards,
  deck list, chat history titles, `mdToHtml` escape-first) + `login.html` added to SW ASSETS.
  Triple bump `v32`/`versionCode` 32. No visual change by design.
- v33: SK signature strip (`sf-base-sign`, background gap below card, shared by all tabs) +
  Generate overflow fix (input `min-width:0` + row wrap) + AI logo hover tilt→zoom +
  `SMT-1`→`SMT` rename (data + stored-goal/task migration) + short lab labels (`ttShort`) +
  stacked timetable boxes (time/subject/teacher, 2-line clamp, fixed heights kept).
  Triple bump `v33`/`versionCode` 33.
- v34: Shifted top-actions buttons (theme toggle, calendar, new sprint) 9px left + removed visible sprint date
  line from top header + moved compact 3-dot sprint menu (`22×22px`) directly beside "Study Forge" title
  in `.title-row` with rightward dropdown alignment (`.title-row .menu-list { left: 0; right: auto; }`).
  Triple bump `v34`/`versionCode` 34.
- v35: Replaced Snapshot page with 4-card Official Syllabus & Academic OS guide matching the official ADGIPS
  Sec-E 4-page PDF blueprint (`StudyForge_ADGIPS_BTech_IT_Guide_4p.pdf`). Card 1: Schedule & Exam Architecture;
  Card 2: PPS, SMT-1, BEE; Card 3: PHL, EM, CSL; Card 4: EVSL, EGL, PD + Academic Action Playbook.
  Bottom nav tab 5 updated to 📜 Syllabus with quick sticky jump pills. PDF bundled for direct download.
  Other 4 panels (TT, Goals, Tasks, Notes) kept 100% untouched. Triple bump `v35`/`versionCode` 35.
- v36: Whole-app auto-adjusting responsive architecture. Fixed DOM tree bug where `.top-actions` was trapped
  in unclosed `.brand` container. Added `viewport-fit=cover` and safe-area insets (`env(safe-area-inset-*)`).
  Fluid header with icon-pill adaptation: compact 36px icon circles on mobile (<480px) that never clip or touch screen
  edges; expanding to full labelled pills on tablets/iPads/desktops. App container centered with `max-width: 1100px`
  preventing awkward stretched layouts on iPads and monitors. Fluid `clamp()` typography and radii across panels,
  cards, and headings. Mobile taskboard stacked; tablet/desktop 3-column Kanban.
  Syllabus panel polish: eliminated panel-level jumping on button clicks, unnested 4 syllabus cards, removed redundant
  banner, and repositioned PDF download button cleanly as a badge beside the title.
  Vertical header alignment: shifted `.top-actions` 7px upward (`top: -7px`), aligning buttons with the Study Forge title
  baseline and opening an 8px clean vertical gap above the `🔥 0` streak badge.
  Triple bump `v36`/`versionCode` 36. Deploy dir rebuilt and synchronized.
- v37:
  - Softened whole-app tone and glare across `styles.css` (archival paper `#f2ebd9`, muted ambient radial gradient, toned-down mint/accent/sky colors, reduced search backdrop saturation boost).
  - Token Harbor unified API integration: connected to `https://tokenharbor.ai/v1/chat/completions` with user pass model `glm-5.3-flash` (Zhipu AI / Z-AI GLM 5.3 Flash, tier "value", full multimodal vision + reasoning support).
  - Multimodal vision support for diagrams/notes/equations, camera/file upload button, `Ctrl+V` clipboard paste, thumbnail preview tray, in-app Token Harbor settings modal (`#tokenharborKeyDialog`) with Universal Key (`thk_live_...`) and model selector.
  - Upgraded AI Flashcards in Notes: powered by Token Harbor `glm-5.3-flash`, full curriculum grounding, Focus Mode selector (High-Yield End-Sem 12-markers, Formulas & KaTeX Derivations, Viva Voce & Lab Traps, Quick Recall), Card Count selector (4 Blitz, 6 Standard, 8 Deep Dive), Quick Subject Chips (PPS, BEE, SMT, PHL, EM, PPS Viva, BEE Viva), 3D flip card animation, KaTeX math formula rendering on front & back, subject tags, difficulty badges (High-Yield, Medium, Easy), viva trap / exam intel callouts (`💡 Exam Intel / Trap:`), deck controls (Flip, Shuffle, Prev/Next, Clear All), and a custom state-machine JSON parser that robustly preserves all LaTeX backslashes without syntax errors.
  - Deep academic context & curriculum grounding: tailored AI tutor persona for Satyam Kumar (ADGIPS B.Tech IT Sem-1, Sec-E, Room 2310). Injects faculty details, textbooks, lab requirements, and unit intel for all 9 subjects (PPS, SMT, BEE, PHL, EM, CSL, EVSL, PD, EGL). Real-time schedule injection via `getTodayAgenda()`, active sprint goals (% progress), Kanban tasks, recent notes with focus ratings, and 40 Internal / 60 External exam blueprint. KaTeX math syntax formatting.
  - Gemini/ChatGPT chatbot experience & input hygiene: fixed bug where "Hi" was auto-filled/restored on reload/open (added `autocomplete="off"` to `aiChatInput`, explicit clearing on open/load, purged orphan 1-message chats from localStorage, and starts with fresh session). Added personalized time-of-day greeting ("Good morning / afternoon / evening, Satyam Kumar 👋"), live timetable schedule status pill, 4 contextual prompt starter cards, balanced header layout (left back button, centered title, right settings/history/new chat), and Copy response + Deepgram Aura TTS Read action bar on assistant messages.
  - Added interactive `[ 🔄 Retry ]` button with smooth spin animation on hover/click to re-generate assistant responses without duplicate bubbles or loss of context.
  - Triple bump `v37` / `versionCode: 37` / `CACHE_NAME: study-forge-v37`. Deploy dir rebuilt and synchronized.
- v38:
  - Overhauled AI Flashcards into animated, flashy Visual Revision Cheat-Sheet Study Cards (responding to user demand for quick revision notes instead of interrogative Q&A quizzes).
  - Hybrid Visual Generative Component Engine: StudyForge native neo-brutalist shell with 3D flip physics, coupled with Token Harbor `glm-5.3-flash` generating structured micro-components.
  - Front of card: Concept title, 1-line essence definition, visual illustration container (supporting live-parsed inline SVG circuit/memory diagrams with dark-mode stroke inversion and display KaTeX math formula blocks), and 3 bullet takeaways with accent chevrons.
  - Back of card: 4-step numbered procedure/derivation flow, prominent ⚠️ Common Exam Trap warning callout (highlighting professor mark deductions and viva traps), and 💡 memorable Memory Hook/mnemonic.
  - Slim customized scrollbars for card faces and KaTeX visual containers; expanded card min-height to 350px for zero vertical overflow on standard viewports.
  - Backward compatibility: gracefully handles legacy `{ q, a, tip }` decks stored in `localStorage`.
  - Triple bump `v38` / `versionCode: 38` / `CACHE_NAME: study-forge-v38`. Deploy dir rebuilt and synchronized.
- v39:
  - Progressive real-time streaming card-by-card engine for AI Flashcards (`stream: true` SSE over Token Harbor `glm-5.3-flash`).
  - First-card time drastically dropped from ~40s blocking wait to **~4.3s**: Card 1 renders on screen immediately with full SVG diagrams, KaTeX display math, essence definition, and 3 takeaway points.
  - Background streaming pipeline: parses balanced `{ ... }` card objects on-the-fly (`extractCompleteObjects`) while user reads/flips Card 1; dynamic counter updates (`1 / 1 (Generating...)` → `1 / 4 Complete`) and `Next →` button unlocks automatically when Card 2 arrives.
  - Interactive live stream badge: `.fc-stream-status` with amber pulsing dot (`🟡 Card 1 ready • Generating card 2 of 4...`) converting to green checkmark (`🟢 ✓ All 4 visual cards ready! 🔥`) on completion.
  - Multi-generation cancellation protection (`currentGenerationId`) and non-streaming fallback.
  - Triple bump `v39` / `versionCode: 39` / `CACHE_NAME: study-forge-v39`. Deploy dir rebuilt and synchronized.
- v40:
  - Subject Chip Selection Before Generation: Addressed user demand where clicking a subject chip button (`PPS`, `BEE`, `SMT`, `PHL`, `EM`, `PPS Viva`, `BEE Viva`) previously auto-generated cards immediately.
  - Chips now highlight cleanly (`.fc-chip.active` with neo-brutalist amber fill and offset shadow) on click and populate the input with `${subject}: ` (e.g. `EM: `) while dynamically updating the input placeholder with contextual high-yield topic hints (e.g. `e.g. Friction, Coplanar Forces, Equilibrium...`).
  - Cursor is auto-focused at the end of the input so the user can immediately type their specific topic.
  - Real-time input synchronization: typing a subject prefix (`EM:`, `PPS:`, etc.) automatically activates the corresponding chip button.
  - Empty-topic validation: clicking `🔥 Generate Cards` when only a subject prefix is present prompts the user via toast (`Please write your specific topic to study in EM!`) without starting an unwanted generation.
  - Triple bump `v40` / `versionCode: 40` / `CACHE_NAME: study-forge-v40`. Deploy dir rebuilt and synchronized.
- v41:
  - Ask AI Fresh Session Engine & Orphan Chat Elimination: Resolved bug where reopening Ask AI displayed an old unanswered user prompt without an assistant answer.
  - Opening Ask AI from the home search bar now always initiates a brand-new, clean chatbox session with the curated StudyForge academic welcome screen (personalized time-of-day greeting, live today's timetable schedule pill, and 4 high-yield prompt starter cards).
  - Orphan Chat Purge & Memory Hygiene: `getAllChats()` and startup routines now automatically scrub and purge any empty or orphan 1-message chats without valid assistant answers from `localStorage`.
  - Conversational Lifecycle Safety: If an AI call fails, is aborted, or if the student taps Back before generation completes, dangling user messages are cleanly popped from `chatHistory` so context remains uncorrupted. Completed conversations are safely archived in the Chat History sidebar.
  - Tapping `+` (`aiNewChatBtn`) initiates a clean session with `New chat started ✨` visual toast feedback.
  - Triple bump `v41` / `versionCode: 41` / `CACHE_NAME: study-forge-v41`. Deploy dir rebuilt and synchronized.
- v42:
  - Subject-Curated Flashcard Engine: Added active academic subject banner (`#fcSubjectContext`) inside the Flashcard generation area.
  - Context Banner Display: Displays active subject badge (`#fcSubjBadge` e.g. `PPS · ICT-101 / ETCS-107`), course title (`#fcSubjTitle` e.g. `Programming for Problem Solving`), and academic metadata (`#fcSubjMeta` e.g. `Ms. Alka · Mr. Ankit Jain (Lab) · C Programming · Units I–IV`).
  - Bi-directional Synchronization: Clicking any subject chip (`PPS`, `BEE`, `SMT`, `PHL`, `EM`, `PPS Viva`, `BEE Viva`) or typing a subject prefix into `fcTopicInput` dynamically updates the subject context banner, input placeholder, and active chip styling.
  - Strict Academic Grounding in AI Prompts: Injected `TARGET ACADEMIC SUBJECT` and `MANDATORY SUBJECT-CURATION DIRECTIVE` into Token Harbor `glm-5.3-flash` system prompt and user payload. Even when asking general questions (e.g. "What is recursion?"), the model now grounds all cards strictly in that subject (ANSI C99/C11, memory stack frames, pointers, and professor viva traps by Mr. Ankit Jain for PPS; network theorems and KCL/KVL for BEE).
  - Subject Tags & Saved Decks: Generated cards enforce subject-prefixed tags (`${subjAlias} · Unit X`), and saved decks preserve the subject association.
  - Triple bump `v42` / `versionCode: 42` / `CACHE_NAME: study-forge-v42`. Deploy dir rebuilt and synchronized.
- v43:
  - AI Chat Thinking Animation: Added an animated thinking indicator card in the Ask AI chat while the model processes answers.
  - Neo-brutalist thinking card component (`.ai-thinking-card`) featuring an animated glowing/spinning sparkle icon, bold "Thinking" label with 3 animated wave dots (`● ● ●`), live elapsed time ticker (`1s`, `2s`...), shimmering gradient progress line, and dynamic academic context status ticker that cycles smoothly through syllabus-relevant processing steps ("Connecting to syllabus & timetable...", "Reviewing core concepts & formulas...", "Synthesizing step-by-step explanation...").
  - Seamless Lifecycle & Retries: Integrates with `callAI()`, image attachments (triggers "Analyzing attached study diagram..."), `makeRetryHandler()`, and `handleStopGeneration()` (cleanly cancels tickers and cleans up intervals).
  - Compact Thought Badge: Automatically records `thoughtSec` upon answer delivery and displays a sleek `⚡ Thought for Xs` badge above the assistant's response and during typewriter streaming.
  - Triple bump `v43` / `versionCode: 43` / `CACHE_NAME: study-forge-v43`. Deploy dir rebuilt and synchronized.
- v44:
  - Real-Time SSE Token Streaming & Chat Speed Overhaul: Resolved user report of slow responses (28–45s wait times) by replacing blocking `res.json()` with progressive Server-Sent Events (`stream: true` SSE) over Token Harbor `glm-5.3-flash`.
  - Sub-2-Second First Token: Time-to-first-visible-word dropped from **~40–45s** down to **1.98s**! The student starts reading the answer almost immediately.
  - Thinking Animation Transition: The glowing `.ai-thinking-card` animates during the model's brief initial reasoning phase (~1–2s), then seamlessly collapses into the compact `⚡ Thought for Xs` badge right as the first streamed token appears.
  - Smooth 30fps Typing & Rendering: Tokens stream directly into `.ai-bot-content` using a 35ms throttled renderer with a live blinking block cursor (`.ai-block-cursor`), finalizing with full KaTeX math notation, syllabus unit citations, exam traps, viva pointers, and action buttons (`Copy`, `Read`, `Retry`).
  - High-Speed Dev Reverse Proxy (`serve-pwa.js`): Added a shared `https.Agent({ keepAlive: true, maxSockets: 16 })` connection pool to reuse warm TLS sockets (saving 500–800ms per request) and unbuffered immediate chunk forwarding with `res.socket.setNoDelay(true)`.
  - Context & Token Optimization: Set `max_tokens: 1500` and updated `trimmedBuddyBlock()` to produce compact high-yield summaries when 4+ subjects match, preventing runaway prompt bloat.
  - Lifecycle & Abort Support: Full stop-generation integration (`AbortController` immediately closes stream reader) and seamless retry streaming via `makeRetryHandler()`.
  - Triple bump `v44` / `versionCode: 44` / `CACHE_NAME: study-forge-v44`. Deploy dir rebuilt and synchronized.
- v45:
  - Mobile Aspect Ratio & Responsive Architecture Overhaul for Flashcards: Addressed severe mobile layout collisions on small phone viewports (360px–420px).
  - Clean Stacked Dropdown Controls: Fixed horizontal collision where `CARD TYPE:` and `CARD COUNT:` previously overlapped and painted over each other. Re-architected both into 100% full-width stacked select controls with label above each select on mobile (<580px) and 2-column grid on desktop, custom inline SVG arrow indicators, and graceful text truncation (`text-overflow: ellipsis`) preventing container blowout.
  - Fluid Subject Context Banner: Converted `#fcSubjectContext` into an adaptive 2-tier card on mobile with badge + ellipsis title on row 1 and wrapping, high-yield metadata on row 2, expanding to a wide single row on desktop (>=680px).
  - Thumb-Friendly Full-Width Input & Generate Button: Stacked `#fcTopicInput` and `#fcGenerateBtn` vertically on mobile (<540px) so the topic input has ample room to display subject prefixes and placeholders, paired with a full-width neo-brutalist action button.
  - Smooth Quick Chips Scrolling: Added touch momentum scrolling (`-webkit-overflow-scrolling: touch; scroll-padding: 4px;`) with edge padding so chips never clip at the card border.
  - Responsive 3D Visual Study Cards: Fluid clamp padding (`14px` on mobile, `18px–28px` on desktop) with zero viewport overflow.
  - Intuitive 2-Tier Flashcard Controls: Restructured mobile controls into a clean 3-column navigation row (`← Prev`, `1 / N`, `Next →`) above a balanced 2-button action row (`🔄 Flip`, `🔀 Shuffle`).
  - Graceful Saved Decks Truncation: Long deck titles now truncate cleanly with single-line ellipsis, preserving alignment with count badges and delete buttons.
  - Purged Legacy CSS Overrides: Cleaned out conflicting v33 compact flashcards rules (`styles.css:3798-3836` & `3869-3880`).
- v46:
  - AI Flashcards "1 + N" Fast-Path Pipeline: Slashed Card 1 initial wait time from 25–40s down to ~1–2.5s (benchmarked at 0.98s for foundational topics) using a 2-phase architecture.
  - Phase 1 (Instant Card 1): Dispatches a dedicated, ultra-focused single-card request (`max_tokens: 1400`, `cardCount: 1`) to Token Harbor `glm-5.3-flash`. Instantly renders on screen as soon as it arrives, mounts 3D flip card, compiles KaTeX math and SVG diagrams, sets counter to `1 / N`, and displays pulsing background badge (`⚡ Card 1 ready • Generating remaining N-1 cards in background...`).
  - Phase 2 (Background Asynchronous Stream): Automatically kicks off in the background while the student is already actively reading Card 1. Passes Card 1's title and essence to prevent duplicate coverage, streams remaining cards (Cards 2..N), dynamically updates navigation (`1 / 2`, `1 / 3`...) and unlocks `Next →` button the moment Card 2 lands.
  - Fail-Safe JSON Auto-Repair Engine (`repairTruncatedJsonCard`): Dynamically balances unclosed strings, trailing commas, and brackets/braces (`"`, `}`) to prevent lost cards even if model output cuts off mid-stream.
  - Incremental Persistence (`syncCurrentDeckToStorage`): Automatically syncs each card to `localStorage` (`studyForge_flashcards`) the instant it arrives, preserving decks even if the student leaves or changes tabs early.
  - Triple bump `v46` / `versionCode: 46` / `CACHE_NAME: study-forge-v46`. Deploy dir rebuilt and synchronized.
- v47:
  - Normal Chat ("Ask AI") Latency Overhaul: Fixed 25–50s response delay on Token Harbor `glm-5.3-flash`, achieving sub-2s time-to-first-token (benchmarked at 1.2–1.5s) and 5–8s total answer delivery.
  - High-Density System Prompt: Replaced verbose 4,200-char static prompt with a crisp, high-yield ~550-char prompt preserving identity, KaTeX rigor, ANSI C code, and GGSIPU exam structure without reasoning attention bloat.
  - Just-In-Time Context Grounding: Replaced full 9-subject curriculum and 5-day timetable dumps with lightweight, active-day schedule injection (`Today's Classes: ...`), target subject intel, and top 2 active goals/tasks (shrinking prompt from ~2,600 tokens down to ~220 tokens).
  - Balanced Sliding Chat History: Preserves full formulas, derivations, numbers, and ANSI C code across the last 6 conversation turns in full detail, with a generous 1,500-char safety cap only for outlier essays.
  - SSE Stream Headers & Proxy Flushing: Added explicit `Accept: text/event-stream` and `Cache-Control: no-cache` in `callAI()` and `serve-pwa.js` to eliminate upstream gateway buffering.
  - Intelligent Thinking Card Ticker: Displays live gateway queue feedback (`Awaiting Token Harbor gateway response...`) if upstream connection queues during peak traffic.
  - Triple bump `v47` / `versionCode: 47` / `CACHE_NAME: study-forge-v47`. Deploy dir rebuilt and synchronized.
- v48:
  - Model & Provider Brand Sanitization: Removed third-party provider and raw model badges (`GLM 5.3 FLASH`) from Ask AI (`#aiModelBadge`) and Notes AI Study Cards (`.fc-model-badge`) headers.
  - Neutral UI & System Labels: Replaced "Token Harbor Settings" with "AI Settings" in tooltips, aria labels, and dialog titles; streamlined loading prompts ("Crafting Card 1 for...") and status tickers ("Synthesizing response...").
  - Triple bump `v48` / `versionCode: 48` / `CACHE_NAME: study-forge-v48`. Deploy dir rebuilt and synchronized.
- v49:
  - Default Model Upgrade to `deepseek-v4.1-flash`: Set `deepseek-v4.1-flash` as primary default model across `script.js` and `index.html` settings dialog.
  - Auto-Migration of Stored Models: Automatically migrates previous users from legacy `glm-5.3-flash` to `deepseek-v4.1-flash` in `getTokenHarborModel()`.
  - Triple bump `v49` / `versionCode: 49` / `CACHE_NAME: study-forge-v49`. Deploy dir rebuilt and synchronized.
- v50:
  - Default Model Switch to `deepseek-v4-flash:free`: Set `deepseek-v4-flash:free` as primary default model across `script.js` and `index.html` AI settings modal.
  - Auto-Migration of Stored Models: Automatically migrates legacy `glm-5.3-flash`, `glm-5.3`, `deepseek-v4.1-flash`, and `deepseek-v4.1-flash:free` in `getTokenHarborModel()`.
  - Multi-Model Selection in Datalist: Added `deepseek-v4-flash:free` as Default Free Tier, plus `mimo-v2.5` (Xiaomi 1M context ultra-fast 800ms), `mimo-v2.5:free`, `deepseek-v4-flash`, `th-orchestra`, and frontier options.
  - Triple bump `v50` / `versionCode: 50` / `CACHE_NAME: study-forge-v50`. Deploy dir rebuilt and synchronized.
- v51:
  - Default Model Upgrade to `mimo-v2.5`: Switched default model to `mimo-v2.5` (Xiaomi MiMo, 1M context window, benchmarked at 800ms non-stream / 2.6s streaming TTFT on Token Harbor Universal Key). Solves public free queue congestion (eliminating 35–50s delays) with 10x faster response delivery.
  - Seamless Model Migration: Auto-migrated `deepseek-v4-flash:free`, `deepseek-v4.1-flash`, and legacy models to `mimo-v2.5` in `getTokenHarborModel()`.
  - Updated AI Settings UI: Pinned `mimo-v2.5` as active default in `#tokenharborModelInput` and datalist dropdown.
  - Triple bump `v51` / `versionCode: 51` / `CACHE_NAME: study-forge-v51`. Deploy dir rebuilt and synchronized.
- v52:
  - Default Model Switch to `deepseek-v4.1-flash`: Set `deepseek-v4.1-flash` as primary default model across `script.js` and `index.html` per user request for direct verification.
  - Auto-Migration of Stored Models: Automatically migrates previous defaults (`mimo-v2.5`, `deepseek-v4-flash:free`, `deepseek-v4.1-flash:free`, `glm-5.3-flash`) to `deepseek-v4.1-flash` in `getTokenHarborModel()`.
  - Updated AI Settings UI: Pinned `deepseek-v4.1-flash` as active default in `#tokenharborModelInput` and datalist dropdown.
  - Triple bump `v52` / `versionCode: 52` / `CACHE_NAME: study-forge-v52`. Deploy dir rebuilt and synchronized.
- v53:
  - Complete Credential Sanitization: Completely eliminated all hardcoded API keys (`DEEPGRAM_API_KEY`, `DEFAULT_TOKENHARBOR_KEY`) from `script.js` and codebase.
  - Unified Local Credential Management: Added Deepgram Voice Key input (`#deepgramKeyInput`) alongside Token Harbor Universal Key in the in-app 🔑 AI & Voice Settings modal (`#tokenharborKeyDialog`).
  - Zero-Leak Local Storage Architecture: All AI and Voice credentials are saved exclusively in client browser `localStorage` (`sf_tokenharbor_api_key`, `sf_deepgram_api_key`) and are never committed or pushed to GitHub.
  - Triple bump `v53` / `versionCode: 53` / `CACHE_NAME: study-forge-v53`. Deploy dir rebuilt and synchronized.
- v54:
  - Active Default Key Integration: Pinned older working credentials as defaults (`DEFAULT_TOKENHARBOR_KEY`, `DEFAULT_DEEPGRAM_KEY`) for immediate out-of-the-box AI and voice execution without requiring user rotation.
  - Private Repository Security Model: Ensured seamless functionality while repository remains protected under private GitHub access and strict `.gitignore` patterns.
  - Triple bump `v54` / `versionCode: 54` / `CACHE_NAME: study-forge-v54`. Deploy dir rebuilt and synchronized.
- v55:
  - Official 2026 Syllabus Integration (5 Subjects): Decoded and integrated official Affiliated B.Tech 2026 scheme blueprints for EM (`ICT-119`), BEE (`ICT-103T/ICT-106T`), PPS (`ICT-101`), SMT-1 (`ICT-107`), and EVS (`ICT-117T`).
  - Authoritative Data Synchronization: Updated `SF_SEM1_SUBJECTS` and `SF_FACULTY` in `syllabus.js` with exact codes, textbook citations, and verbatim 4-unit topics.
  - Enhanced Syllabus Panel: Updated Card 2 (Core Tech: PPS, SMT-1, BEE), Card 3 (Applied Sciences: EM), and Card 4 (Labs & Skills: EVS) in `index.html` with Course Outcomes, marking schemes (including EVS 100-mark NUES), and reference textbooks.
  - Grounded AI Tutor: Updated `AI_SYSTEM_PROMPT` and subject topic aliases in `script.js` with official 2026 curricula for precise question-setting and flashcard generation.
  - Triple bump `v55` / `versionCode: 55` / `CACHE_NAME: study-forge-v55`. Deploy dir rebuilt and synchronized.
- v56:
  - Unified GLM 5.3 Flash Everywhere: Activated `glm-5.3-flash` as primary default model across both Ask AI chat and AI Flashcards generator per user command.
  - Resolved Reasoning Token Latency: Fixed the 35–45s delay where `deepseek-v4.1-flash` emitted thousands of invisible chain-of-thought tokens (`reasoning_content`) before starting card JSON. GLM 5.3 Flash generates direct structured JSON with rich SVG diagrams, KaTeX formulas, and 2026 exam traps.
  - Auto-Migration: Updated `getTokenHarborModel()` to auto-migrate stored keys from `deepseek-v4.1-flash` to `glm-5.3-flash` seamlessly.
  - Increased Token Budget: Raised Phase 1 max tokens to 1,800 and Phase 2 max tokens to 3,800 to prevent SVG truncation.
  - Triple bump `v56` / `versionCode: 56` / `CACHE_NAME: study-forge-v56`. Deploy dir rebuilt and synchronized.
- v57:
  - Luminous Breathing Mock Flashcard Animation: Replaced static loading spinner during flashcard generation with a full-size mock flashcard skeleton (`.fc-mock-card`).
  - Subtle Brightness & Ambient Glow Pulse: Features a 2.4s ease-in-out breathing animation (`@keyframes fc-mock-breathe` and `fc-mock-breathe-dark`) oscillating `filter: brightness()` between 0.96 and 1.22 with a golden amber aura (`rgba(245, 158, 11, 0.45)`).
  - Sweeping Light Sheen: Added diagonal 2.6s light wave sheen (`::after` pseudo-element) gliding across the card face to simulate active concept synthesis.
  - Interactive Skeleton Structure: Shimmering concept title, gradient skeleton lines for essence/takeaways, glowing schematic preview box (`.fc-mock-visual`) with floating spark (`⚡`), and an amber pulse indicator beacon dot.
  - Zero Layout Shift: Matches exact dimensions (`min-height: 350px`, `max-width: 520px`) of live cards for a seamless morph when Card 1 arrives.
  - Triple bump `v57` / `versionCode: 57` / `CACHE_NAME: study-forge-v57`. Deploy dir rebuilt and synchronized.
- v58:
  - Resilient AI Visual Flashcards Architecture & Quality Overhaul: Completely addressed intermittent generation errors and elevated visual aesthetic of study cards.
  - Generous Token Allocation for GLM 5.3 Flash CoT: Raised Phase 1 max tokens to 4,500 and Phase 2 max tokens to 8,000 (resolving issues where GLM 5.3 Flash internal reasoning tokens previously starved the completion budget and truncated cards mid-JSON).
  - 4-Tier Resilient Parser: Integrated extractCardFields() regex field extractor as an ultimate fallback alongside JSON.parse, parseLlmCards, and repairTruncatedJsonCard, gracefully recovering cards even if unescaped quotes or formatting quirks occur.
  - Network Resilience: Added automatic 2-attempt fetch retry with 1.2s backoff on 5xx/network errors, plus safe try-catch wrapping around reader.read() so stream drops cleanly degrade to accumulated card recovery rather than hard failures.
  - Card Aesthetics & Layout Overhaul: Upgraded .fc-card & .fc-card-inner min-height to 380px and max-width to 530px; larger bold title (1.18rem); styled executive essence definition box with amber border; elevated visual box (min-height 85px, max-height 230px, dark-mode SVG contrast inversion); micro-card takeaways with golden chevrons; numbered step circular badges with step cards on back side; high-contrast red Professor Trap alert callouts; and amber Memory Hook cards.
  - Forgiving SVG XML/HTML Dual Parser: Ensures SVG diagrams render cleanly without XML parser errors on unescaped entities and never dump raw code onto the card face.
  - Matched mock card dimensions (.fc-mock-card 380px min-height, 530px max-width) for seamless transitions.
  - Triple bump 58 / ersionCode: 58 / CACHE_NAME: study-forge-v58. Deploy dir rebuilt and synchronized.
- v0.6.7 (Build 67):
  - Snappy AI overhaul (quality preserved, Token Harbor `glm-5.3-flash` stays active):
  - Chat: `max_tokens` 1000→850 (still covers 250–350 words + math), history 6→5 turns + 1500→1200 cap (lighter prompt, faster TTFT in long chats), `mdToHtml(text, skipMath)` fast-path (KaTeX skipped per 35ms stream frame, full math on final render), near-bottom autoscroll guard (<140px) to avoid yanking + layout thrash.
  - Flashcards: Phase1 4500→3500 + Phase2 `min(8000,n*2000)`→`min(7000,n*1700)` (cuts tail ~20%), schema length caps (essence ≤25w, takeaways ≤14w, steps ≤22w, SVG ≤12 shapes / 380×90 / ≤10-line C) for crisper cards + smaller payloads, Phase2 concise-visual directive, `extractCompleteObjects` throttled (>250 chars or `}` close), retry backoff 1200→700ms, instant 5-min deck cache hit (same subject+topic+mode+count renders with zero network).
  - Network: `index.html` preconnect + dns-prefetch to `tokenharbor.ai`, `ai-gateway.vercel.sh`, `api.deepgram.com` (saves 200–500ms TLS on first AI/voice call).
  - Triple bump `v0.6.7` / `versionCode: 67` / `CACHE_NAME: study-forge-v0.6.7`.
- v0.6.6 (Build 66):
  - Interactive "By SK" Redirection Button: Upgraded the bottom signature strip badge (`.sf-base-box`) into an accessible, interactive neo-brutalist link button pointing directly to Satyam's GitHub profile (`https://github.com/IMMENSE-BUILDER`).
  - Tactile Neo-Brutalist Micro-Interactions: Added responsive hover (`transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--shadow);` with amber accent fill) and active tap press-down states (`transform: translate(2px, 2px); box-shadow: 0 0 0;`) across both light and dark themes.
  - Accessibility & Safety: Configured `target="_blank" rel="noopener noreferrer"` with informative title attribute; removed `aria-hidden="true"` on the wrapper; excluded links and buttons from global 2s hold-to-select timer in `holdTargetOk()`.
  - Repository Privacy & API Credentials Policy: Satyam confirmed the GitHub repository is kept strictly PRIVATE. The fallback keys in `script.js` remain intact as convenience fallbacks, with `localStorage` taking primary priority.
  - Triple bump `v0.6.6` / `versionCode: 66` / `CACHE_NAME: study-forge-v0.6.6`.
- v0.6.5 (Build 65):
  - 2026 Seed Goal Code Alignment: Fixed v55 gap where `SF_FACULTY` was updated to official 2026 course
    codes but `buildIPUSeed()` goal titles still carried stale codes/names. Corrected six seed titles to
    match `SF_FACULTY`: SMT → ICT-107, EM → ICT-119, BEE → ICT-103T/ICT-106T, PHL → Engineering Physics–I
    (ICT-111T, was "Semiconductor Engineering ICT-110/117"), CSL → ICT-113, EVSL → ICT-117T.
  - Idempotent Stored-Goal Migration: `migrateStateVersion()` renames stored goals in place by stable
    `ipu-goal-*` id with exact-title match only (`GOAL_TITLE_FIXES_2026`, runs before the title-match seed
    merge — v33 SMT-1 precedent), so re-runs add zero dupes; user-renamed goals, progress, XP and
    task `goalId` links fully preserved. `SF_STATE_VERSION` bumped 5 → 6.
  - Fixed `syllabus.js` header comment typo ("Sec F" → "Sec E").
  - API Credentials Policy Resolution: User confirmed the GitHub repository is kept strictly private; default fallback keys in `script.js` remain active alongside `localStorage` (which holds top precedence).

  - Triple bump `v0.6.5` / `versionCode: 65` / `CACHE_NAME: study-forge-v0.6.5`.
- v0.6.4 (Build 64):
  - Flashcard Fullscreen Focus Zoom Redesign & Alignment Fix: Completely addressed broken controls, downward text misalignment, and KaTeX rendering issues in the flashcard focus lightbox.
  - Streamlined Header: Replaced cluttered multi-color controls with a minimal top bar displaying dynamic academic tag (e.g. `PPS · Unit 1`), counter (`1 / 4`), and a clean circular `✕` close button.
  - Balanced Symmetrical Navigation Dock: Replaced the squeezed footer with a unified 3-button floating dock (`[ ← Prev ] [ 🔄 Flip Card ] [ Next → ]`) with identical dark/light styling, accent focus, and zero text wrapping or button distortion.
  - Natural Diagram Sizing & Downward Push Fix: Removed arbitrary forced 220px min-height on `.fc-visual-box`; SVGs scale proportionally without creating massive empty voids that previously pushed takeaways off the screen.
  - Leaked Tap-Hint Overlap Eliminated: Suppressed `.fc-tap-hint` inside the zoomed card element, ending bottom edge text collision with navigation controls.
  - KaTeX HTML Entity Unescape & Error Guard: Added `unescapeKatex` decoder in `mdToHtml` restoring `<` and `>` before KaTeX parsing, plus `.katex-error` CSS styling reset to eliminate glaring red parse errors.
  - Triple bump `v0.6.4` / `versionCode: 64` / `CACHE_NAME: study-forge-v0.6.4`.
- v0.6.3 (Build 63):
  - Fullscreen Focus Zoom Lightbox for Flashcards: Added a dedicated, enlarged focus modal for visual study cards with clear diagram and label inspection.
  - Click-and-Hold / Long-Press Activation: Holding a card steady for 480ms triggers haptic vibration feedback (`navigator.vibrate(40)`) and seamlessly opens the zoomed lightbox view.
  - Gesture Disambiguation: Movement exceeding 8px immediately cancels the hold timer, preserving smooth horizontal swiping and vertical internal scrolling without false zoom triggers. Global 2s text selection timer is cleared on activation.
  - Enlarged Visual Schematics: Zoom dialog expands up to 660px wide and 78vh high; visual container expands up to 48vh with 100% SVG width and auto-height, rendering complex circuit diagrams, truth tables, and math derivations at >2.5× original scale.
  - Full Navigation & Flip Controls in Zoom: Includes dedicated `🔍 Zoom` button in toolbar, `✕` close button, backdrop tap to dismiss, `🔄 Flip` button, prev/next navigation, touch swipe support in zoom mode, synchronized state with main deck, and `Escape` / arrow keyboard shortcuts.
  - Preserves 20-day Token Harbor (`glm-5.3-flash`) active plan; Vercel AI Gateway remains on standby.
  - Triple bump `v0.6.3` / `versionCode: 63` / `CACHE_NAME: study-forge-v0.6.3`.
- v0.6.2 (Build 62):
  - Fixed Mobile Touch Swipe Gesture Engine: Resolved issue where swiping left/right on mobile phones only moved slightly without transitioning to the next card.
  - Root Cause Fixed: Mobile Chrome/Safari passive event listeners previously prevented horizontal swipe capture, while a tight 8px vertical threshold locked out natural thumb arcs.
  - Dedicated Touch Events Implementation: Added non-passive `{ passive: false }` touchmove listener calling `e.preventDefault()` during active horizontal drags, completely blocking browser back/forward history navigation and scroll hijacking.
  - Universal `touch-action: pan-y !important`: Enforced across `.fc-card`, `.fc-card-inner`, `.fc-card-front`, `.fc-card-back`, and `.fc-card-body` to prevent child elements from dropping touch-action inheritance.
  - Responsive Trigger Thresholds: Relaxed swipe trigger to 38px drag or 0.22 px/ms velocity flick with direct inline exit transform animations.
  - Triple bump `v0.6.2` / `versionCode: 62` / `CACHE_NAME: study-forge-v0.6.2`.
- v0.6.1 (Build 61):
  - Official SemVer Transition: Transitioned release versioning from legacy integer tags (v60, v61) to standard 3-digit Semantic Versioning (`v0.6.1`). Pre-release development sits at `0.x.y`, progressing toward `v1.0.0` for college-wide launch. Internal `versionCode: 61` remains an increasing integer for Android APK compatibility.
  - Dual-Provider AI Gateway Architecture: Integrated Vercel AI Gateway (`ai-gateway.vercel.sh/v1`) as a pre-plumbed standby provider alongside the active Token Harbor (`glm-5.3-flash`) engine.
  - Created `vercel.json` with edge proxy rewrites: `/api/ai/:path*` -> `https://ai-gateway.vercel.sh/v1/:path*` (and `/th-api/:path*` -> `https://tokenharbor.ai/:path*`) eliminating client-side CORS issues natively without backend code or build steps.
  - Zero-disruption 20-day plan preservation: Token Harbor with `glm-5.3-flash` remains the 100% active default engine for Ask AI and Visual Flashcards. Not a single token of the user's ongoing plan is disturbed.
  - Upgraded AI Settings Modal: Added AI Gateway Provider selector (`aiProviderSelect`) allowing seamless toggling between Token Harbor (active) and Vercel AI Gateway (standby) with model dropdowns (`google/gemini-2.0-flash`, `openai/gpt-4o-mini`, etc.) and separate key persistence (`sf_vercel_ai_key`, `sf_vercel_ai_model`).
  - Dynamic model status badges and mock card indicators: `#aiModelBadge` dynamically displays provider prefix and active model; mock flashcard displays active model in synthesis pulse.
  - Triple bump `v0.6.1` / `versionCode: 61` / `CACHE_NAME: study-forge-v0.6.1`.
- v60:
  - Rebranded app name from **Study Forge** to **Study Forged** everywhere across the UI.
  - Updated: `<title>`, `<h1>` brand header, all 4 syllabus card footers and section header, `login.html` title and hero heading, `manifest.json` name/short_name, `version.json` app field, `script.js` all share titles/AI identity prompts/card labels/init log/download filename, `syllabus.js` file comment.
  - Storage keys (`studyForgeState-v1`, `studyForge_flashcards`, etc.) intentionally preserved — renaming them would wipe user data.
  - SW cache key pattern preserved as `study-forge-vN` (internal identifier, only N incremented).
  - Triple bump `v60` / `versionCode: 60` / `CACHE_NAME: study-forge-v60`.
- v59:
  - Interactive Touch & Pointer Swipe Gestures: Added native swipe gesture navigation to flashcards. Swiping left slides to the next study card; swiping right slides to the previous study card.
  - Real-Time Drag Physics & Tilt: Card tracks touch/mouse drag in real-time with translate3d tilt rotation and opacity feedback. Features elastic spring snap-back when released below threshold or at deck boundaries with helpful toast notifications.
  - Scroll Disambiguation & Tap Decoupling: Distinguishes vertical scrolling from horizontal swiping so long derivation steps can be scrolled naturally, and suppresses tap-to-flip during swipe gestures.
  - Keyboard Navigation: Added ArrowLeft (prev), ArrowRight (next), and Space/Enter (flip) keyboard shortcuts for seamless laptop/desktop study.
  - Triple bump 59 / ersionCode: 59 / CACHE_NAME: study-forge-v59. Deploy dir rebuilt and synchronized.
- v35 remaining gap: `renderToday` still dead (`#todayCard` missing in `index.html`,
  so Today helper never paints) — fix on approval.
- **Branch-tab saga (lesson):** built a subjects tab the user read as a duplicate, reverted twice, then learned the
  "IT section" meant the timetable itself — now middle tab + forced landing. Do not relitigate nav without asking.
- **Syllabus viewer added then removed:** 2025-scheme units were correct but user demands official 2026 syllabi,
  which they will gather. Data file stays dormant; restore viewer only on their data. Same for EGL/PD details.

Open decisions / parked:
- AI buddy phase 2 (day-aware answers, viva mock), multi-section packs (CSE/ECE/ME), student config panel,
  homework tracker, attendance, marks ledger, sessional countdown, backup export/import, Capacitor APK +
  in-app updater via `version.json` (user chose Netlify over GH Pages; APK after dev milestone).

Gotchas:
- Phone Wi-Fi blocks PC traffic (proven 3×); USB+adb is the only reliable local path. PC DHCP IP drifts (was .33/.50) — always re-check before giving LAN URLs.
- Installed PWA loads fully offline from cache — "close/reopen the icon" does NOT fetch updates; use a fresh Chrome tab or bump SW.
- `study-forge-learn-platform/` (old Expo prototype) was deleted; `Studycure/`, `app-release.apk` (Orca), `OmniTutor` files are unrelated — ignore.
- User communicates by voice-typing; "IT section" meant timetable, "columns" means lines, "E going downwards" meant text-wrap. When in doubt after one misread, ask with concrete options instead of building.
