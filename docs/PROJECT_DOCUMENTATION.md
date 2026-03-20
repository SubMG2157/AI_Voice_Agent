# PROJECT_DOCUMENTATION

## 1. Executive Summary

**Project name:** `impera-sales-bot` (Deepak Fertilisers AI Calling Agent)  
**Version:** `0.0.0` (root `package.json`), backend package version `1.0.0`  
**Current status:** Active development / staging (not production-hardened yet)

This project is a full-stack AI voice-calling system for Deepak Fertilisers that supports two execution modes: a browser demo mode (microphone -> Gemini Live) and a real outbound phone mode (Plivo phone call -> backend audio bridge -> Gemini Live). The app helps agri-advisors call farmers, run a guided Marathi-first conversation flow, capture order intent, and send post-call SMS confirmation with payment details. It targets internal sales/support operators and field teams who need fast outbound engagement with farmers.

Primary business problem solved:
- Automates repetitive outbound advisory and order-confirmation calls while preserving a controlled sales flow and response style.
- Streams live transcripts and call status to an operations dashboard.
- Reduces manual call-center workload for basic fertilizer upsell/order workflows.

---

## 2. Quick Start Guide

### Prerequisites
- Node.js `>=20.0.0`
- npm (project currently expects npm lockfiles)
- Internet access (Gemini Live + telephony APIs)
- Microphone permission for browser demo mode
- For real phone calls: Plivo credentials + public backend URL (ngrok or Railway)

### Installation
1. `npm install`
2. Configure environment variables (`.env.local` or `.env`)
3. Start frontend dev server: `npm run dev`
4. In another terminal, start backend: `npm run backend`

### Single command run (recommended quick smoke run)
- `npm run start`

This builds frontend and starts backend server on one port (default 3001).

### Verify it is working
1. Open `http://localhost:3001` (or `http://localhost:3000` when running Vite dev server).
2. Click `Call Farmer` in demo mode.
3. Confirm transcript bubbles and waveform update.
4. Check backend health endpoint: `GET /health` returns `{"ok": true}`.

### Common first-run issues and fixes
- **Issue:** Plivo callbacks fail  
  **Fix:** `BACKEND_BASE_URL` must be public (ngrok/Railway), not localhost.
- **Issue:** Agent does not speak / backend bridge fails  
  **Fix:** Verify `GEMINI_API_KEY` exists in backend environment.
- **Issue:** Demo mode mic error  
  **Fix:** Allow browser microphone permissions.
- **Issue:** Call API fails immediately  
  **Fix:** Verify Plivo credentials and phone formatting.

---

## 3. Tech Stack

### Frontend
- **Framework:** React `19`
- **Build tool:** Vite `6`
- **Language:** TypeScript (`tsx/ts`)
- **Styling:** Tailwind CSS v4 + custom CSS
- **State management:** React hooks (`useState`, `useEffect`, refs); no Redux/Zustand
- **Realtime:** Browser WebSocket for `/ui-sync`
- **Audio:** Web Audio API + ScriptProcessor pipeline

### Backend
- **Runtime:** Node.js 20+
- **Framework:** Express `4`
- **WebSocket server:** `ws`
- **Language:** TypeScript via `tsx` runtime
- **Telephony:** Plivo Voice callbacks + media streaming
- **SMS:** Twilio SDK (note: naming in files still references Plivo in some comments)
- **AI model integration:** `@google/genai` (Gemini Live native audio model)

### Database
- **Not Applicable: This project does not use a persistent database.**
- In-memory stores are used for:
  - call context
  - orders
  - call logs

### DevOps & Infrastructure
- **Deployment target:** Railway (configured)
- **Build strategy:** Nixpacks (`nixpacks.toml`) with Node 20
- **Public tunnel (local dev):** ngrok (`run.txt`)
- **CI/CD:** Needs Verification (no `.github/workflows` present in this repo)
- **Monitoring/logging:** File-based backend logs + in-memory frontend logs

### External Services
- **AI:** Google Gemini Live
- **Voice telephony:** Plivo
- **SMS:** Twilio
- **PDF export:** jsPDF
- **No payment gateway API integrated directly** (static payment URL currently used)

---

## 4. System Architecture

### High-Level Design
- Pattern: **Full-stack app with real-time media bridge** (single deployable backend + SPA frontend)
- Structure: **Pseudo-monolith** with optional demo mode and telephony mode

```text
                +-------------------------+
                |   React Dashboard UI    |
                |        (App.tsx)        |
                +------------+------------+
                             |
            +----------------+----------------+
            |                                 |
            v                                 v
  Demo Mode (Browser)                 Phone Mode (Backend)
  Mic -> Gemini Live                  POST /api/call
  Direct transcript                   Plivo outbound call
  + local audio playback              /plivo/answer -> /media WS
                                      /media <-> Gemini Live bridge
                                      /ui-sync -> frontend updates
                                      Order save + SMS send
```

### Data Flow

```text
User -> Frontend -> Backend API -> Plivo Call
Plivo Media WS -> Backend mediaStream -> Gemini Live
Gemini transcript/audio -> Backend -> UI Sync WS -> Frontend transcript UI
Order extraction -> In-memory order store -> SMS service (Twilio)
```

### Authentication Flow
- **Not Applicable:** No user login/auth flow implemented.
- API endpoints currently do not require auth tokens.

### Key Design Patterns
- Prompt-driven conversation orchestration (policy in prompt text)
- Bridge pattern for audio format conversion and service interop
- In-memory repository-like modules (`orderStore`, `callContext`, `callLog`)
- Event-driven realtime messaging over WebSocket

### Component Interaction Notes
- Frontend communicates with backend over REST + WebSocket (`/ui-sync`).
- Inter-service communication is internal module calls (no microservice bus).
- Event-driven components:
  - Plivo webhooks (`/plivo/answer`, `/plivo/status`)
  - WS events (`start`, `media`, `stop`)
  - UI sync events (`AGENT_TURN`, `CUSTOMER_TURN`, etc.)
- Caching strategy:
  - No Redis/memcached.
  - Runtime state cached in memory maps and arrays only.

---

## 5. Project Structure Deep Dive

### Directory Tree

```text
project-root/
|-- App.tsx                          # Main dashboard and call controls
|-- index.tsx                        # React mount entry
|-- index.html                       # HTML shell + import map
|-- index.css                        # Tailwind import + global styles
|-- types.ts                         # Shared app-level types
|-- package.json                     # Root scripts/dependencies
|-- vite.config.ts                   # Vite dev/proxy/test/config injection
|-- tsconfig.json                    # TS compiler settings
|-- tailwind.config.js               # Tailwind content config
|-- postcss.config.js                # PostCSS plugins
|-- railway.json                     # Railway build/deploy settings
|-- nixpacks.toml                    # Node runtime pinning for Railway
|-- README.md                        # Runtime overview
|-- PROJECT_DOCUMENTATION.md         # This document
|
|-- backend/
|   |-- server.ts                    # Main backend server
|   |-- engineBridge.ts              # Shared prompt bridge for backend
|   |-- package.json                 # Backend package metadata
|   |-- hold.wav                     # Hold tone asset
|   |
|   |-- twilio/                      # Telephony flow handlers (Plivo-first runtime)
|   |   |-- callStarter.ts
|   |   |-- voiceWebhook.ts
|   |   |-- mediaStream.ts
|   |   |-- statusHandler.ts
|   |   |-- callContext.ts
|   |
|   |-- services/                    # Backend helpers (SMS, logging, analysis)
|   |   |-- smsService.ts
|   |   |-- twilioSmsService.ts
|   |   |-- smsFormatter.ts
|   |   |-- fileLogger.ts
|   |   |-- conversationEndDetector.ts
|   |   |-- diseaseMatcher.ts
|   |   |-- intentClassifier.ts
|   |   |-- emotionDetector.ts
|   |   |-- inventoryService.ts
|   |   |-- callState.ts
|   |
|   |-- orders/
|   |   |-- orderStore.ts            # In-memory order repository
|   |
|   |-- knowledge/
|   |   |-- productCatalog.ts        # Active product+alias+price logic
|   |   |-- products.json            # Legacy/reference product data
|   |   |-- diseases.json            # Disease data entries
|   |
|   |-- audio/
|   |   |-- mulaw.js                 # µ-law <-> PCM conversion
|   |   |-- resample.js              # PCM sample-rate conversion
|   |
|   |-- logs/
|       |-- logs.txt                 # Runtime backend logs
|       |-- callLog.ts               # In-memory call log module
|
|-- services/                        # Frontend/shared utilities
|   |-- liveClient.ts                # Browser Gemini live client
|   |-- audioUtils.ts                # Browser audio helpers
|   |-- logger.ts                    # Frontend in-memory logs
|   |-- transcriptSanitizer.ts       # Transcript cleanup/filter
|   |-- transcriptDisplay.ts         # Display normalization
|   |-- transcriptExport.ts          # CSV/PDF export
|   |-- endGreetings.ts              # Closing phrase library
|   |-- consentGate.ts               # Legacy/utility helper
|   |-- languageDetection.ts         # Legacy/utility helper
|   |-- domainGuard.ts               # Legacy/utility helper
|   |-- purposeDetection.ts          # Legacy (loan-domain) helper
|   `-- conversationEngine/
|       |-- index.ts                 # Prompt assembly entrypoint
|       |-- prompts.ts               # Main agent flow/policy prompt
|
|-- components/
|   |-- Visualizer.tsx               # Canvas waveform ring visualizer
|   |-- LanguageSelector.tsx         # Present but unused in current App flow
|
|-- tests/                           # Vitest unit tests for utility modules
|   |-- consentGate.test.ts
|   |-- domainGuard.test.ts
|   |-- languageDetection.test.ts
|   |-- purposeDetection.test.ts
|   `-- transcriptSanitizer.test.ts
|
|-- docs/                            # Existing internal docs
|   |-- TECHNICAL_DOCUMENTATION.md
|   |-- API_DOCUMENTATION.md
|   |-- PROJECT_FLOW.md
|   `-- PROMPTS_REFERENCE.md
|
|-- files/                           # Historical optimization notes/snippets
|   |-- mediaStream-OPTIMIZED.ts
|   |-- COPY_PASTE_FIXES.md
|   `-- IMPLEMENTATION_GUIDE (1).md
|
|-- logs/                            # Legacy/stale logs from older app domain
|   `-- logs.txt
`-- dist/                            # Frontend build output (generated)
```

### Major Directory Responsibilities
- `backend/`: Real call orchestration and telephony/audio bridging.
- `services/`: Frontend/shared behavior and prompt composition.
- `tests/`: Unit validation for utility modules only.
- `docs/`: Existing architecture/API/prompt notes.
- `files/`: Experimental or migration guidance artifacts, not active runtime.

### Naming Conventions
- Utility/service modules use `camelCase` filenames (e.g., `languageDetection.ts`).
- Telephony files grouped under `backend/twilio/`.
- Prompt logic isolated in `services/conversationEngine/`.

---

## 6. Core Modules & Components

### Module: `backend/server.ts`
- **Purpose:** Central API and WebSocket host.
- **Responsibilities:** Env load, route registration, static hosting, WS upgrades.
- **Dependencies:** `express`, `ws`, Twilio/Plivo helpers, order/SMS services.
- **Dependents:** Frontend dashboard and telephony providers.
- **Design decision:** Single process serves both API and static app for one-port deployments.

### Module: `backend/twilio/mediaStream.ts`
- **Purpose:** Real-time audio bridge between telephony and Gemini Live.
- **Responsibilities:** Audio conversion, call session state, transcript buffering, UI sync broadcast, order lock/SMS trigger, auto-hangup.
- **Dependencies:** audio utilities, prompt bridge, call context, order store, SMS service.
- **Design decision:** In-memory stream state per call for low-latency handling.

### Module: `services/liveClient.ts`
- **Purpose:** Browser-only Gemini Live client for demo mode.
- **Responsibilities:** Mic capture, outbound-first guard, audio playback scheduling, transcript buffering, volume monitoring.
- **Dependencies:** `@google/genai`, Web Audio APIs, transcript sanitizer.
- **Design decision:** Mirrors backend call behavior to keep demo and phone mode aligned.

### Module: `services/conversationEngine/prompts.ts`
- **Purpose:** Prompt-level business policy and conversation flow.
- **Responsibilities:** Persona, language lock, flow control, escalation rules, disease handling text, closure lines.
- **Dependents:** Both frontend demo and backend phone mode.
- **Design decision:** Prompt-first orchestration reduces coded branching but increases prompt coupling risk.

### Module: `backend/orders/orderStore.ts`
- **Purpose:** Order persistence abstraction (currently memory-only).
- **Responsibilities:** ID generation, save/read/update order data.
- **Design decision:** MVP speed over durability; easy future DB swap target.

### Module: `backend/services/smsService.ts` + `twilioSmsService.ts`
- **Purpose:** Build and send order confirmation SMS.
- **Responsibilities:** payload normalization, body formatting, provider send.
- **Design decision:** Provider logic separated from formatting for easier service swap.

---

## 7. Function-Level Documentation (Critical Functions)

### `getSystemInstruction(language, customerName, lastProduct, agentGender): string`
- **File:** `services/conversationEngine/index.ts`
- **Purpose:** Assembles final prompt text for Gemini sessions.
- **Parameters:**
  - `language`: currently passed but prompt path hardcoded to Marathi in active implementation
  - `customerName`: inserted into greeting line
  - `lastProduct`: used in feedback step
  - `agentGender`: influences name/voice and gendered Marathi verbs
- **Returns:** Full system instruction string.
- **Side effects:** None.
- **Error handling:** Defaults fallback values for missing args.
- **Example usage:**

```ts
const prompt = getSystemInstruction(Language.MARATHI, 'Mayur', 'NPK 19-19-19', 'male');
```

### `startCall(phone, context): Promise<OutboundCallResult>`
- **File:** `backend/twilio/callStarter.ts`
- **Purpose:** Initiates outbound call via Plivo API.
- **Parameters:**
  - `phone`: destination number (normalized to E.164)
  - `context`: customer metadata used later in prompt/session
- **Returns:** Provider call request UUID + provider metadata.
- **Side effects:** External HTTP request to Plivo.
- **Error handling:** Throws when credentials missing or provider returns non-OK.

### `handleMediaConnection(ws, req): void`
- **File:** `backend/twilio/mediaStream.ts`
- **Purpose:** Owns full lifecycle for each `/media` WebSocket connection.
- **Responsibilities:** session init, hold loop, ASR transcript processing, TTS sendback, SMS/order logic, close cleanup.
- **Side effects:** WebSocket IO, AI API calls, in-memory state mutation, potential SMS send/order save.
- **Error handling:** local try/catch in message handler; logs and graceful cleanup on close/error.

### `sanitizeTranscript(text, options): SanitizeResult`
- **File:** `services/transcriptSanitizer.ts`
- **Purpose:** Remove unsupported scripts/noise and normalize likely telephony ASR artifacts.
- **Parameters:** raw text + flags (`preferDevanagari`, `dropUnclear`, etc.)
- **Returns:** `{ output: string | null, isUnclear: boolean }`
- **Side effects:** None.
- **Error handling:** Defensive fallbacks; null output for invalid/noise text.

### `voiceWebhook(baseUrl, callId): string`
- **File:** `backend/twilio/voiceWebhook.ts`
- **Purpose:** Build Plivo XML response pointing to `/media` stream URL.
- **Returns:** XML string.
- **Side effects:** None.

### `saveOrder(orderData): Order`
- **File:** `backend/orders/orderStore.ts`
- **Purpose:** Persist order object in memory and generate order ID.
- **Side effects:** Appends to in-memory array.
- **Error handling:** No explicit validation inside function; assumes upstream validation.

### `sendOrderSmsTwilio(params): Promise<{success, sid?, error?}>`
- **File:** `backend/services/twilioSmsService.ts`
- **Purpose:** Send SMS through Twilio API.
- **Side effects:** External API request, logs.
- **Error handling:** returns `{ success: false, error }` on provider failure; throws for missing credentials.

### `isAgentClosingLine(text): boolean`
- **File:** `backend/services/conversationEndDetector.ts`
- **Purpose:** Detect terminal closing lines to trigger hangup safely.
- **Logic:** Requires specific Marathi closing phrase combinations.
- **Risk note:** Overly strict patterns may miss variant close phrases.

---

## 8. API Documentation

### Base URL
- Local unified runtime: `http://localhost:3001`
- Dev split mode: frontend `http://localhost:3000`, backend `http://localhost:3001`

### Auth
- **Authentication:** None implemented
- **Authorization:** None implemented

### Endpoints

#### `[POST] /api/call`
- **Purpose:** Start outbound phone call.
- **Request headers:** `Content-Type: application/json`
- **Body:**
  - `phone` (required)
  - `name`, `lastProduct`, `language`, `agentGender` (optional)
- **Success:** `200` with `{ callId, status, message }`
- **Errors:** `400` missing phone, `500` provider/setup failures

#### `[POST] /api/order`
- **Purpose:** Save order in in-memory store.
- **Request:** `items[]` or (`product` + `quantity`) plus `phone`
- **Success:** `200` with `{ success: true, order }`
- **Errors:** `400` validation failure, `500` unexpected error

#### `[POST] /api/send-sms`
- **Purpose:** Send SMS confirmation for an order.
- **Request:** `phone`/`to`, `orderId`, and order items
- **Success:** provider response wrapper (JSON)
- **Errors:** `400` missing required payload fields, `500` unexpected error

#### `[GET] /health`
- **Purpose:** Service health check.
- **Success:** `{ ok: true }`

#### `[POST] /plivo/answer`
- **Purpose:** Telephony answer webhook; returns XML stream instructions.

#### `[POST] /plivo/status`
- **Purpose:** Telephony status callback; broadcasts mapped call state.

#### `[POST] /plivo/sms-status`
- **Purpose:** SMS provider delivery callback logging.

#### `[WS] /media`
- **Purpose:** Telephony media bridge channel.

#### `[WS] /ui-sync`
- **Purpose:** Dashboard realtime status/transcript stream.

### Rate Limiting
- **Needs Verification:** No explicit rate-limiter middleware found.

### Example cURL

```bash
curl -X POST http://localhost:3001/api/call \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"+919999999999\",\"name\":\"Farmer\",\"lastProduct\":\"NPK 19-19-19\",\"agentGender\":\"male\"}"
```

---

## 9. Database Schema

**Not Applicable: This project does not use a persistent SQL/NoSQL database.**

### In-Memory Data Models (Current Runtime)

#### Store: Call Context (`callContext.ts`)
- **Purpose:** Map call IDs to active runtime context and order items.
- **Fields:**
  - `callSid` (Map key)
  - `customerName`, `lastProduct`, `language`, `agentGender`, `phone`
  - `items: Map<string, number>`

#### Store: Orders (`orderStore.ts`)
- **Purpose:** Save generated orders before/after SMS step.
- **Fields:**
  - `orderId` (generated)
  - `customerName`, `phone`
  - `items[]` (`product`, `quantity`, `price`)
  - `totalAmount`
  - `address`, `village`, `taluka`, `pincode`
  - `paymentStatus`, `paymentLink`, `timestamp`

#### Store: Call Logs (`callLog.ts`)
- `callId`, `status`, `durationSec`, arbitrary payload + timestamp

### Relationship Diagram (In Memory)

```text
CallContext(callSid) ----> Items Map(product -> qty)
        |
        +--(on SMS trigger)--> Order(orderId, items, total, address...)
        |
        +--(status events)--> CallLog entries
```

### Indexes/Triggers
- **Not Applicable:** No DB indexes/triggers in in-memory implementation.

---

## 10. Configuration & Environment

### Environment Variables

| Variable | Purpose | Required | Default | Sensitive |
|---|---|---|---|---|
| `PLIVO_AUTH_ID` | Voice API auth | Yes (phone mode) | none | Yes |
| `PLIVO_AUTH_TOKEN` | Voice API auth token | Yes (phone mode) | none | Yes |
| `PLIVO_NUMBER` | Outbound call number | Yes (phone mode) | none | Yes |
| `TWILIO_ACCOUNT_SID` | SMS provider auth | Yes (SMS mode) | none | Yes |
| `TWILIO_AUTH_TOKEN` | SMS provider token | Yes (SMS mode) | none | Yes |
| `TWILIO_SMS_NUMBER` | SMS sender number | Yes (SMS mode) | none | Yes |
| `GEMINI_API_KEY` | Gemini Live API access | Yes | none | Yes |
| `BACKEND_BASE_URL` | Public callback/media URL | Yes for real calls | localhost fallback | Medium |
| `PORT` | Backend listen port | No | `3001` | No |
| `BACKEND_PORT` | Port fallback | No | `3001` | No |
| `DLT_ENTITY_ID` | India DLT compliance metadata | Optional | empty | Medium |
| `DLT_TEMPLATE_ID` | India DLT template metadata | Optional | empty | Medium |
| `VITE_API_URL` | Frontend API base override | Optional | browser origin | No |

### Config Files
- `package.json`: scripts, dependencies, node engine.
- `vite.config.ts`: dev proxies, test config, env injection.
- `railway.json`: build/start and health policy for Railway.
- `nixpacks.toml`: Node 20 pinning.
- `tailwind.config.js`, `postcss.config.js`: styling pipeline.
- `.gitignore`: excludes env files and sensitive artifacts.

### Security Note
- A tracked `.env.local` and `Twilio-account_info.txt` are present in the repository history/workspace. Treat as sensitive and rotate credentials.

---

## 11. Application Flow & User Journeys

### Startup Sequence
1. `backend/server.ts` loads env (`.env`, `.env.local`, `backend/.env`).
2. Initializes file logger.
3. Registers middleware (CORS, JSON body parser).
4. Registers REST endpoints.
5. Creates HTTP server + WS upgrade handling (`/media`, `/ui-sync`).
6. Serves static frontend from `dist`.
7. Starts listening on configured port.

### Key User Flow A: Demo Call
1. Operator fills farmer details in UI.
2. Clicks `Call Farmer` in demo mode.
3. Browser requests mic.
4. `LiveClient` opens Gemini session with shared prompt.
5. Agent greeting is triggered first.
6. Transcript/audio stream updates in dashboard.
7. Operator can export transcript (CSV/PDF).

### Key User Flow B: Real Phone Call
1. Operator chooses phone mode.
2. UI sends `POST /api/call`.
3. Backend starts Plivo call and stores call context.
4. Plivo hits `/plivo/answer` and opens `/media`.
5. Backend bridges phone audio <-> Gemini.
6. Backend emits transcript/status to `/ui-sync`.
7. On close phrase and final audio drain, backend hangs up call.

### Key User Flow C: Order + SMS
1. Agent final turns include item/quantity confirmations.
2. `mediaStream.ts` parses and updates call-context item map.
3. SMS/payment phrase triggers order lock.
4. Order saved in memory with generated `orderId`.
5. SMS formatted and sent via Twilio.

---

## 12. Security Implementation

### Implemented
- Basic input checks on key APIs (`phone`, required payload fields).
- Environment-based secret loading.
- No direct SQL usage (SQL injection not applicable in current architecture).
- Prompt-level domain guard and safety constraints.

### Missing / Weak Areas
- No API authentication/authorization.
- CORS currently permissive (`origin: true`).
- No CSRF strategy (mostly JSON API; still relevant for browser contexts).
- No formal rate limiting middleware.
- Secrets present in tracked local files (operational risk).
- In-memory storage means no encrypted-at-rest persistence strategy yet.

### Transport Security
- Local dev can run HTTP; production telephony callbacks require public HTTPS URL.

---

## 13. Testing Strategy

### Framework
- Vitest (`npm run test`, `npm run test:run`)

### Current coverage scope
- Utility unit tests only:
  - `consentGate`
  - `domainGuard`
  - `languageDetection`
  - `purposeDetection`
  - `transcriptSanitizer`

### Not covered
- `/media` WebSocket integration
- Plivo webhook lifecycle
- Gemini live bridge behavior
- Order extraction and SMS send integration
- UI end-to-end flows

### Coverage metrics
- **Needs Verification:** No coverage report config/output found.

### Mocking strategy
- Mostly deterministic pure-function testing; no heavy external-service mocking framework observed.

---

## 14. Error Handling & Logging

### Error Handling Patterns
- Route-level try/catch with JSON error responses.
- Runtime logging on external service failures.
- Graceful WS cleanup on disconnect/error.
- SMS send returns structured success/failure object.

### Logging
- Backend:
  - `fileLogger.ts` overrides `console` and writes to `backend/logs/logs.txt`.
- Frontend:
  - `services/logger.ts` keeps in-memory logs and supports download.

### Log Levels
- INFO/WARN/ERROR via overridden console wrappers.
- No centralized structured logging backend (e.g., ELK, Datadog) configured.

### Error reporting service
- **Not Applicable:** No Sentry/App Insights/etc. configured in current codebase.

---

## 15. Performance & Optimization

### Implemented optimizations
- Outbound-first gating avoids user speech collision at call start.
- Inbound audio batching (`INBOUND_AUDIO_BATCH_MS` and max frames).
- Noise gate before sending audio to Gemini.
- Hold-loop to keep call alive before agent response.
- Transcript buffering by turn/silence to avoid fragmented UI.

### Observed performance behavior
- Existing backend logs show customer->agent latency around ~1-2 seconds in sampled runs.

### Known bottlenecks
- In-memory and single-process architecture limits horizontal scale.
- Prompt-heavy logic can increase model turn latency variance.
- Address and order extraction depends on transcription quality.

### CDN/asset optimization
- Frontend served via Vite build output; no explicit CDN configuration found.

---

## 16. Deployment & DevOps

### Local Development
- Frontend dev: `npm run dev` on port 3000.
- Backend: `npm run backend` on port 3001.
- Unified local serve: `npm run start`.
- Tunnel for callbacks: `ngrok http 3001`.

### Deployment Process (Railway)
1. Set all required environment variables.
2. Railway build command: `npm install && npm run build`.
3. Start command: `npx tsx backend/server.ts`.
4. Verify health endpoint and callback URLs.

### Post-deploy verification
- Hit `/health`.
- Trigger test call through `/api/call`.
- Validate `/plivo/answer` reachable publicly.
- Confirm `/ui-sync` and transcript updates.

### Rollback
- **Needs Verification:** No scripted rollback process found.

### Infrastructure notes
- Hosting: Railway.
- Auto-scaling rules: Needs Verification.
- Backup strategy: Not available (in-memory data only).

---

## 17. Dependencies & Package Management

### Major runtime dependencies
- `@google/genai`: Gemini Live integration
- `express`, `ws`, `cors`, `dotenv`: backend runtime
- `react`, `react-dom`: UI
- `twilio`: SMS sending
- `jspdf`: transcript PDF export

### Dev dependencies
- `vite`, `@vitejs/plugin-react`
- `typescript`, `tsx`
- `vitest`
- Tailwind/PostCSS stack

### Version constraints
- Node engine pinned to `>=20.0.0` due to runtime compatibility.

### Deprecated/cleanup candidates
- Residual loan-domain helpers/tests (`purposeDetection`, parts of `domainGuard`) conflict with current fertilizer domain.
- Duplicate backend package manifests and nested lockfiles may increase maintenance overhead.

### License compliance
- **Needs Verification:** No license file observed in root for this repository snapshot.

---

## 18. Known Issues & Limitations

- No persistent database; data lost on process restart.
- No API auth/authorization.
- No rate limiting middleware found.
- Static payment link is not order-specific.
- Callback retry logic for busy/no-answer is logged only, not executed.
- Some modules/docs still reflect older loan-support domain.
- Sensitive credential files exist in workspace and should be rotated.
- Address extraction is heuristic and prompt-phrase dependent.

---

## 19. Future Roadmap & Improvements

- Add persistent storage (PostgreSQL/MongoDB) for orders/calls.
- Add authenticated admin/operator access to APIs/dashboard.
- Implement rate limiting + request validation schemas (e.g., Zod/Joi).
- Replace static payment link with generated order-specific payment URLs.
- Build integration tests for telephony/websocket/audio bridge.
- Introduce retry queue for failed/no-answer calls.
- Clean residual legacy modules and align tests to fertilizer domain only.
- Add observability stack (structured logs, metrics, traces).

---

## 20. Troubleshooting Guide

### Issue: Cannot start outbound call
- **Symptoms:** `/api/call` returns error.
- **Cause:** Missing telephony credentials or invalid public callback URL.
- **Solution:** Verify `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_NUMBER`, `BACKEND_BASE_URL`.

### Issue: Plivo cannot connect to webhook
- **Symptoms:** Call starts then disconnects or no audio.
- **Cause:** Backend URL points to localhost/private address.
- **Solution:** Use ngrok/Railway public HTTPS URL.

### Issue: Agent silent in demo mode
- **Symptoms:** Connected UI but no response.
- **Cause:** Missing `GEMINI_API_KEY` or blocked browser audio context.
- **Solution:** Check env injection and microphone/audio permissions.

### Issue: Transcript contains unclear artifacts
- **Symptoms:** Fragmented or dropped customer text.
- **Cause:** ASR ambiguity, sanitizer thresholds, noisy input.
- **Solution:** Improve call audio quality; review `transcriptSanitizer` options.

### Issue: SMS not sent
- **Symptoms:** Order appears but no confirmation SMS.
- **Cause:** Missing Twilio credentials or message send failure.
- **Solution:** Verify `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_NUMBER`.

### Issue: Data disappears after restart
- **Symptoms:** No previous orders/call context.
- **Cause:** In-memory-only stores.
- **Solution:** Implement persistent DB-backed repository.

---

## 21. Glossary & Conventions

### Project-specific terminology
- **UI Sync:** WebSocket channel for transcript and call-status updates.
- **Outbound-first guard:** Block customer audio until agent speaks first.
- **Call context:** In-memory per-call metadata and item map.
- **Turn complete:** Gemini signal used to flush finalized transcript segments.

### Coding conventions (observed)
- TypeScript modules with ESM syntax.
- Service-oriented file naming (`*Service.ts`, `*Detector.ts`).
- Shared prompt logic in dedicated conversation engine module.

### Naming conventions
- `camelCase` for functions/variables.
- `PascalCase` for React components and TS types/interfaces.
- Group by domain directory (`twilio`, `knowledge`, `orders`, `services`).

### Git workflow / code review process
- **Needs Verification:** No explicit CONTRIBUTING or workflow policy file found.

---

## 22. Resources & References

### Internal docs
- `README.md`
- `docs/TECHNICAL_DOCUMENTATION.md`
- `docs/API_DOCUMENTATION.md`
- `docs/PROJECT_FLOW.md`
- `docs/PROMPTS_REFERENCE.md`

### External references
- [Gemini API documentation](https://ai.google.dev/)
- [Plivo Voice API documentation](https://www.plivo.com/docs/voice/)
- [Twilio SMS API documentation](https://www.twilio.com/docs/sms)
- [Vite documentation](https://vite.dev/)
- [Vitest documentation](https://vitest.dev/)
- [Railway documentation](https://docs.railway.com/)

### Maintainers
- **Needs Verification:** No maintainers/team contact metadata file found.

---

## Appendix: Explicit Non-Applicability Notes

- **Persistent relational/non-relational DB schema:** Not applicable (in-memory only).
- **RBAC/ABAC authorization model:** Not applicable (no auth layer implemented).
- **Distributed microservice communication:** Not applicable (single backend process architecture).
- **Kubernetes/container orchestration details:** Needs Verification (not defined in repo configs).
