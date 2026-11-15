# ⚡ StudyForge

> Offline-first, installable PWA study companion tailored for Satyam Kumar (ADGIPS B.Tech IT, Sem 1, Sec E).
> Features a live academic timetable, weekly sprints, Kanban task board, AI study cards, voice notes, and unified AI study companion.

[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat&logo=vercel)](https://vercel.com)
[![PWA](https://img.shields.io/badge/PWA-Installable-blue?style=flat&logo=pwa)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Version](https://img.shields.io/badge/Release-v0.6.61-emerald?style=flat)]()

---

## 🌟 Core Features

- 📅 **Live Class Timetable**: 5-day aligned timetable (AY 2026–27, Sec E, Room 2310) with real-time class indicators, batch splits (E1/E2), and today's schedule agenda.
- 🎴 **Visual AI Study Cards**: Generates instant animated revision cards with inline SVG diagrams, KaTeX math derivations, essence definitions, and common exam traps.
- ✨ **Ask AI Tutor**: Academic tutor with sub-2s streaming responses, timetable awareness, syllabus grounding, and multi-turn conversational memory.
- 🎯 **Goals & Sprints**: Track academic goals, sprint velocity, and weekly focus metrics.
- 📋 **Kanban Task Board**: Responsive 3-column task board (Plan / In Progress / Done) with goal linking.
- 📜 **Official Syllabus Guide**: Built-in 4-card Academic OS and blueprint matching the official ADGIPS B.Tech IT guide.
- 🔒 **Offline-First**: Zero backend, zero database. All data lives in local device storage (`localStorage`).

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Neo-Brutalist CSS3.
- **Math & Markdown**: KaTeX math rendering, native SVG diagram parsing.
- **PWA**: Service Worker (`sw.js`) with network-first offline strategy and Web App Manifest.
- **AI Integration**: Vercel AI Gateway with streaming Server-Sent Events (SSE) (default model: `meta/muse-ember`).
- **Deployment**: Vercel (`vercel.json`) with SPA fallback routing and proxy rewrites.

---

## 🚀 Local Development

```bash
# Serve locally
node serve-pwa.js

# Open in browser
http://localhost:3000
```
