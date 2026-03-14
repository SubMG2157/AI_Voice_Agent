# Technical Documentation — Deepak Fertilisers AI Calling Agent

## 1. Current System Overview

This repository contains a full-stack outbound calling agent for Deepak Fertilisers. It has two real execution paths:

1. Browser demo mode
   React UI connects directly to Gemini Live from the browser microphone.
2. Plivo phone mode
  Express backend places a Plivo outbound call and bridges Plivo Audio Streams to Gemini Live.

The same prompt engine is shared by both modes through `services/conversationEngine`.

Important current-state note:

- The prompt path is currently strict Marathi only.
- The codebase still contains some older helper utilities and tests from a previous non-fertiliser workflow. Those files are documented below as legacy or not wired into the active runtime.

---

## 2. Runtime Architecture

```text
React UI (App.tsx)
  |- Demo mode -> services/liveClient.ts -> Gemini Live
  |- Phone mode -> POST /api/call -> backend/server.ts -> Plivo outbound call
  |- UI sync -> WebSocket /ui-sync
  |- Transcript export -> CSV / PDF
  |- Frontend logs -> in-memory download

Backend (backend/server.ts)
  |- REST: /api/call, /api/order, /api/send-sms, /health
  |- Plivo webhooks: /plivo/answer, /plivo/status
  |- Compatibility aliases: /twilio/voice, /twilio/status
  |- WebSockets: /media, /ui-sync
  |- Static hosting: dist/ + SPA fallback

Plivo bridge (backend/twilio/mediaStream.ts)
  |- Plivo mu-law 8 kHz -> PCM 16 kHz -> Gemini Live
  |- Gemini PCM 24 kHz -> PCM 8 kHz -> mu-law 8 kHz -> Plivo
  |- Hold audio loop until first Gemini speech
  |- UI transcript broadcast
  |- Session item tracking
  |- SMS trigger and order locking
  |- Auto-hangup after closing line
```

---

## 3. Active Runtime Modules

### Frontend

| File | Purpose |
|------|---------|
| `App.tsx` | Main dashboard, demo/phone toggle, farmer form, transcript UI, export buttons, log viewer |
| `services/liveClient.ts` | Browser-mode Gemini Live client with mic capture, transcript buffering, audio playback, outbound-first guard |
| `services/conversationEngine/index.ts` | Shared prompt entrypoint used by browser demo and backend phone bridge |
| `services/conversationEngine/prompts.ts` | Actual agent persona, flow rules, disease guidance, ordering rules, closures |
| `services/audioUtils.ts` | PCM conversion and browser audio decoding helpers |
| `services/transcriptSanitizer.ts` | Filters unsupported scripts and noise from transcript output |
| `services/transcriptDisplay.ts` | UI-only greeting normalization |
| `services/transcriptExport.ts` | CSV and PDF export of transcript bubbles |
| `services/logger.ts` | In-memory frontend log capture and download |
| `components/Visualizer.tsx` | Live audio visualization |

### Backend

| File | Purpose |
|------|---------|
| `backend/server.ts` | Express server, REST endpoints, Plivo webhook registration, WebSocket upgrade handling, static hosting |
| `backend/twilio/callStarter.ts` | Starts and ends Plivo calls |
| `backend/twilio/voiceWebhook.ts` | Returns Plivo XML `<Response><Stream>` response |
| `backend/twilio/mediaStream.ts` | Core Plivo/Gemini bridge, transcript buffering, order detection, SMS trigger, hangup logic |
| `backend/twilio/callContext.ts` | In-memory per-call context store including `items: Map<string, number>` |
| `backend/twilio/statusHandler.ts` | Maps provider callback states to UI states and appends call logs |
| `backend/engineBridge.ts` | Converts stored call context into the shared system instruction |
| `backend/orders/orderStore.ts` | In-memory order persistence with generated order IDs |
| `backend/services/smsService.ts` | Plivo SMS sender and SMS body formatter |
| `backend/services/fileLogger.ts` | Redirects backend console output to `backend/logs/logs.txt` |
| `backend/services/conversationEndDetector.ts` | Detects only real closing turns for auto-hangup |
| `backend/audio/mulaw.js` | mu-law conversion |
| `backend/audio/resample.js` | Audio sample-rate conversion |

### Knowledge Sources

| File | Status | Purpose |
|------|--------|---------|
| `backend/knowledge/productCatalog.ts` | Active and authoritative | Product names, alias matching, canonical resolution, prices |
| `backend/knowledge/diseases.json` | Data file available | Disease entries used by matcher helper |
| `backend/knowledge/products.json` | Present but not authoritative | Legacy/reference catalog |

---

## 4. Phone Mode Call Lifecycle

### 4.1 Call initiation

1. UI sends `POST /api/call` with phone, name, last product, language, and agent gender.
2. Backend validates `phone`.
3. `startCall()` places the Plivo outbound call.
4. `setCallContext()` stores customer metadata plus an empty `items` map keyed by product name.

### 4.2 Plivo webhook and stream setup

1. Plivo hits `POST /plivo/answer` when the call is answered.
2. Backend stores the `CallUUID` as `pendingStreamCallSid` in case the query string is stripped.
3. `voiceWebhook()` returns Plivo XML with a `/media` WebSocket stream URL.
4. Plivo connects to `/media` and sends the `start` event.

### 4.3 Gemini session bootstrap

When `/media` receives the stream start:

1. Hold-loop audio starts immediately.
2. Call context is loaded from `callContext.ts`.
3. `engineBridge.ts` builds the shared prompt instruction.
4. Gemini Live session opens using model `gemini-2.5-flash-native-audio-preview-09-2025`.
5. Voice is selected from `agentGender`:
   - `male` -> `Puck`
   - `female` -> `Kore`
6. Backend sends an explicit greeting trigger so the agent speaks first.
7. Customer audio remains blocked until either:
   - the first Gemini model turn arrives, or
   - a 5 second fallback timer expires.

### 4.4 Audio flow

Inbound path:

`Plivo mu-law 8 kHz -> PCM 8 kHz -> PCM 16 kHz -> Gemini sendRealtimeInput`

Outbound path:

`Gemini PCM 24 kHz -> PCM 8 kHz -> mu-law 8 kHz -> Plivo media frames`

If `hold.wav` is missing, the backend generates silence frames instead.

### 4.5 Transcript flow

- Customer transcript chunks are buffered and flushed after 1.2 seconds of silence.
- Agent transcript is buffered until Gemini marks `turnComplete`.
- Sanitized transcript messages are broadcast to `/ui-sync`.
- `App.tsx` displays only messages matching the active `callId`.

### 4.6 Order tracking logic

Current implementation detail:

- Order extraction is driven from finalized agent turns, not directly from raw customer ASR.
- The parser looks for Marathi quantity phrases plus `पिशव` in the agent turn.
- The turn is split by commas, `आणि`, or `+` to support multi-item responses.
- Product names are canonicalized through `findProduct()` in `productCatalog.ts`.
- Quantities are stored in the per-call `items` map via `updateContextItems()`.

This means order state depends on what the agent has confirmed back during the conversation.

### 4.7 SMS trigger and order lock

The backend sends SMS only when all of the following are true:

1. the agent turn contains an SMS/payment phrase,
2. SMS has not already been sent for the call,
3. the order is not locked,
4. the call context exists.

At that point:

1. Session items are converted into priced order items.
2. Address parts are extracted from the transcript by scanning agent lines containing `पत्ता:`.
3. `saveOrder()` creates an in-memory order with generated `orderId`.
4. `sendOrderSms()` formats and sends the SMS.
5. `locked` is set to `true` to prevent further order changes.

If SMS sending throws, the code unlocks the order again.

### 4.8 Call closure

- `conversationEndDetector.ts` only matches real closing turns.
- When a closing line is detected, hangup waits until final audio has been flushed.
- Backend adds a 1-second delay, then calls Plivo hangup for the current `callSid`/`callUUID`.

### 4.9 Status updates

`statusHandler.ts` maps Plivo states into UI-friendly values such as `RINGING`, `IN_PROGRESS`, `ENDED`, and `FAILED`.

Busy and no-answer cases are only logged as retry-eligible. There is no actual retry queue implementation yet.

---

## 5. Browser Demo Mode

Browser demo mode in `services/liveClient.ts` mirrors the prompt and outbound-first behavior without Plivo:

1. Browser requests microphone access.
2. Vite injects `GEMINI_API_KEY` into browser code through `process.env.API_KEY` and `process.env.GEMINI_API_KEY`.
3. `LiveClient` opens Gemini Live directly from the browser.
4. The same shared system instruction is used.
5. Customer audio is blocked until the first agent turn or a 5-second fallback.
6. Transcript bubbles are emitted only on final turn boundaries.

Demo mode also exposes:

- live waveform visualizer,
- in-memory log viewer,
- log download,
- transcript export to CSV and PDF.

---

## 6. Prompt and Behavior Layer

The shared prompt system is built from two parts:

1. `buildSystemPrompt(agentGender)`
2. `getDeveloperPrompt(language, customerName, lastProduct, closingPhrase, agentGender)`

Important runtime facts:

- `getSystemInstruction()` currently hardcodes Marathi prompt generation even though the type system still includes Hindi and English.
- Agent names are gender-based:
  - female -> Ankita
  - male -> Omkar
- The prompt contains the real business logic for conversation flow, interruptions, complaints, disease guidance, order capture, callback scheduling, and closure.

The main runtime depends more on prompt instructions than on deterministic business-rule code.

---

## 7. Environment and Build Configuration

### Backend environment loading

`backend/server.ts` loads environment files in this order:

1. project root `.env`
2. project root `.env.local`
3. `backend/.env`

### Required backend variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `PLIVO_AUTH_ID` | phone mode, SMS | Required for real Plivo operations |
| `PLIVO_AUTH_TOKEN` | phone mode, SMS | Required for real Plivo operations |
| `PLIVO_NUMBER` | phone mode, SMS | Outbound caller ID and SMS sender |
| `GEMINI_API_KEY` | Plivo media bridge | Primary backend AI key |
| `BACKEND_BASE_URL` | Plivo webhook URLs | Must be public for Plivo, usually Railway public URL or ngrok |
| `PORT` | Express server | Typical Railway port environment variable. Falls back to `BACKEND_PORT` or `3001` |
| `DLT_ENTITY_ID` | Plivo SMS (India) | Optional DLT entity for India compliance |
| `DLT_TEMPLATE_ID` | Plivo SMS (India) | Optional DLT template for India compliance |

### Browser demo key injection

`vite.config.ts` injects `GEMINI_API_KEY` into frontend code under both:

- `process.env.API_KEY`
- `process.env.GEMINI_API_KEY`

This is why `services/liveClient.ts` reads `process.env.API_KEY` successfully in the browser build.

---

## 8. Logging

### Backend runtime logging

- `backend/services/fileLogger.ts` overrides `console.log`, `console.warn`, and `console.error`.
- Active backend log file: `backend/logs/logs.txt`
- The file is cleared and recreated on every backend startup.

### Frontend logging

- `services/logger.ts` keeps the latest 500 log lines in memory.
- UI can show and download these logs.

### Legacy log file note

The root-level `logs/logs.txt` contains stale text from an older project and is not the active backend runtime log target.

---

## 9. Product, Pricing, and Knowledge Logic

### Authoritative product catalog

`backend/knowledge/productCatalog.ts` is the source of truth for matching and pricing.

| Product | Price | Alias examples |
|---------|-------|----------------|
| NPK 19-19-19 | 1200 | `19:19:19`, `Start` |
| NPK 12-61-00 | 1450 | `12:61:00`, `MAP` |
| NPK 00-52-34 | 1800 | `00:52:34`, `MKP` |
| NPK 13-00-45 | 1350 | `13:00:45`, `KNO3` |
| NPK 00-00-50 | 1900 | `00:00:50`, `SOP` |
| Mahadhan Amruta | 1250 | `अमृता`, `Amruta` |
| Mahadhan Bensulf | 750 | `बेंसल्फ` |
| Mahadhan Chakri | 1100 | `चक्री` |
| Mahadhan Smartek | 1250 | `समारटेक`, `Smart Tech`, `Nitrogen Booster` |
| Mahadhan Zincsulf | 750 | `झिंकसल्फ`, `Zinc Sulphate` |

### Placeholder payment link

`generatePaymentLink()` currently returns a static placeholder URL and ignores `orderId`.

---

## 10. Supporting Modules Not Wired Into Live Runtime

The following files exist and work as utilities, but they are not part of the main phone or demo call path today:

| File | Status |
|------|--------|
| `backend/services/diseaseMatcher.ts` | Helper available; not invoked in live media pipeline |
| `backend/services/intentClassifier.ts` | Helper available; not invoked in live media pipeline |
| `backend/services/emotionDetector.ts` | Helper available; not invoked in live media pipeline |
| `backend/services/inventoryService.ts` | Helper available; not invoked in live media pipeline |
| `backend/services/callState.ts` | Stage-tracking helper available; not invoked in live media pipeline |
| `services/consentGate.ts` | Utility tested, but prompt enforces consent behavior at runtime |
| `services/domainGuard.ts` | Utility tested, but main runtime uses prompt-based blocking |
| `services/languageDetection.ts` | Utility tested, but current prompt path stays Marathi-only |

---

## 11. Legacy Residue in the Repository

Some files still reflect an older loan-support codebase. They are not part of the Deepak Fertilisers runtime and should be treated as leftover utility residue until cleaned up.

Examples:

- `services/purposeDetection.ts`
- parts of `services/domainGuard.ts`
- comments in `services/transcriptSanitizer.ts`
- some test descriptions and assertions
- root `logs/logs.txt`

These do not drive the active phone or demo runtime.

---

## 12. Test Coverage

Current Vitest coverage is limited to frontend utility modules:

- `tests/consentGate.test.ts`
- `tests/domainGuard.test.ts`
- `tests/languageDetection.test.ts`
- `tests/purposeDetection.test.ts`

There are currently no automated integration tests for:

- Plivo webhook flow,
- `/media` audio bridge,
- order extraction,
- SMS trigger logic,
- prompt adherence,
- `/ui-sync` WebSocket events.

---

## 13. Known Limitations

1. Order extraction depends on agent confirmation wording and transcript quality.
2. Address extraction is heuristic and expects the agent to produce a `पत्ता:` confirmation line.
3. Orders and call state are in-memory only and disappear on restart.
4. SMS payment link is static, not per order.
5. Automatic retry after busy/no-answer is not implemented.
6. Several helper modules exist but are not yet integrated into the live flow.
7. Runtime language switching is not active even though helper files and types still reference it.
