# Rise — Minimalist No-Snooze Alarm Clock

A mobile-first, offline-capable Progressive Web Application (PWA) with a strict **no-snooze philosophy**. Rise replaces postpone buttons with verified real-world physical and cognitive tasks to physically get you out of bed.

Designed with a **pure Dieter Rams / Braun-inspired aesthetic**: strictly black (`#000000`) and white (`#FFFFFF`) with subtle grayscale accents, clean geometric typography, large legible clock numerals, and zero gamified clutter.

---

## Core Differentiating Features

### 1. Zero Snooze Philosophy
There is no snooze button anywhere in the application. Postponement logic does not exist in either the client UI or the server database schema. An alarm can only be silenced by completing its verified dismissal task.

### 2. Camera-Based Real-World Verification Modes
All computer vision runs **100% client-side** in local memory using the HTML5 MediaDevices & Canvas APIs. **No photos, frames, or video streams are ever stored or transmitted to the backend.**

- **Multi-Stage Pushups + Math Combo (Default)**:
  - Place your phone on the floor or propped against a wall.
  - The client-side vision engine tracks upper-body vertical displacement and chest depth in real time at 30 FPS.
  - Recognizes 3-phase pushup biomechanics: starting plank, lowering chest below depth threshold, and ascending back up.
  - Increments live rep counter (`0 / 5 Pushups`) with auditory feedback.
  - Immediately transitions to quick arithmetic problems. The alarm silences **only** after both the 5 pushups and math problems are cleared.
- **Light / Brightness Detection**:
  - Requires turning on room/ceiling lights. Detects a sustained +40 luminance increase above room baseline for 2 seconds.
- **Face-Away Check**:
  - Requires standing up and facing away from bed. Front camera verifies no resting face is detected for 3 continuous seconds.
- **Object / Location Match**:
  - Register a photo of an out-of-reach location (kitchen coffee maker, bathroom mirror). To dismiss, point the camera at the spot to match feature descriptors.
- **Math Challenge Fallback**:
  - Escalating arithmetic equations with an on-screen tactile keypad for accessibility or camera-restricted environments.
- **Anti-Cheat Liveness Detection**:
  - Compares inter-frame sensor noise and micro-tremors to reject static photographs held up to the camera.

### 3. Gradual Volume Ramp & Pre-Alarm
- **Web Audio Harmonic Synthesizer**: Generates resonant chime alerts that gently begin at 3% volume and linearly ramp to 100% over 30 seconds.
- **Pre-Alarm Haptic Pulse**: Optional subtle haptic vibration 5 minutes prior to the scheduled alarm to ease the waking transition.

### 4. Sleep Window & Streak Insights
- **Wake-Up Consistency**: Tracks consecutive days the alarm was verified and dismissed within 10 minutes.
- **Sleep Window Line Chart**: Dieter Rams-style minimalist black-and-white SVG line chart displaying estimated rest duration.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS (strict black/white tokens), Lucide Icons, Vite PWA plugin.
- **Vision Engine**: Real-time canvas frame differencing, spatial centroid tracking, and luminance analysis.
- **Audio Engine**: Native Web Audio API synthesizer with GainNode envelope scheduling.
- **Backend**: Node.js, Express, TypeScript, Prisma ORM with SQLite (dev.db), Zod validation, JWT authentication, `express-rate-limit`.

---

## Project Structure

```
Rise/
├── client/                     # Vite + React 18 + TypeScript PWA
│   ├── src/
│   │   ├── api/client.ts       # REST client for backend synchronization
│   │   ├── components/
│   │   │   ├── alarm/          # DigitalClock, AlarmCard, AlarmEditorModal
│   │   │   ├── dismissal/      # PushupCameraView, BrightnessCameraView,
│   │   │   │                   # FaceAwayCameraView, ObjectMatchCameraView, MathChallengeView
│   │   │   ├── layout/         # Header, BottomNav
│   │   │   ├── onboarding/     # CameraPermissionModal
│   │   │   ├── ringing/        # RingingScreen (Fullscreen no-snooze overlay)
│   │   │   ├── settings/       # SettingsScreen (Theme, Audio test, Camera diagnostics)
│   │   │   └── stats/          # InsightsScreen (SVG sleep window chart & streaks)
│   │   ├── hooks/              # useAlarmScheduler, useCameraVision, usePushupVision, useTheme
│   │   ├── services/           # StorageService (offline-first), WebAudioSynth
│   │   ├── styles/             # globals.css (Dieter Rams token system)
│   │   ├── types/              # Alarm, DismissalType, UserProfile
│   │   ├── App.tsx             # Root coordinator
│   │   └── main.tsx
│   ├── vite.config.ts          # Vite & PWA configuration
│   └── package.json
├── server/                     # Express + TypeScript + Prisma
│   ├── prisma/schema.prisma    # SQLite User, Alarm, and WakeLog models
│   ├── src/
│   │   ├── middleware/         # authMiddleware, rate limiting
│   │   ├── routes/             # authRoutes, alarmRoutes, wakeLogRoutes
│   │   ├── utils/              # validation (Zod), auth (bcrypt, jwt)
│   │   ├── prisma.ts           # Prisma client singleton
│   │   └── index.ts            # Server entrypoint
│   └── package.json
├── package.json                # Workspaces root
└── README.md
```

---

## Getting Started

### Prerequisites
- Node.js 18+ (tested on Node v24)
- npm 9+

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Database
```bash
npm run prisma:generate --workspace=server
npm run prisma:push --workspace=server
```

### 3. Start Development Servers
To run both backend (`http://localhost:5000`) and frontend (`http://localhost:3000`) concurrently:
```bash
npm run dev
```

Or run individually:
```bash
# Terminal 1: Backend
npm run dev:server

# Terminal 2: Frontend
npm run dev:client
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Instant Simulation & Testing
You do not need to wait until tomorrow morning to test Rise:
1. Tap the **Zap / Lightning** icon in the header, or click **"SIMULATE RING NOW"** on the home screen.
2. The fullscreen ringing screen will trigger immediately:
   - The chime starts quiet and smoothly ramps in volume.
   - Position your camera to complete **5 pushups** (guided by live motion depth cues and rep counter).
   - Once 5 reps are verified, solve the 2 arithmetic questions.
   - Upon correct submission, the alarm turns off and logs your wake-up time.

---

## License
MIT
