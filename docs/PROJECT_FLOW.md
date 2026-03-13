# Project Flow — Deepak Fertilisers AI Calling Agent

## 1. Execution Modes

The project supports two separate execution modes:

1. Demo mode
   Browser microphone talks directly to Gemini Live.
2. Phone mode
  Plivo calls the farmer and streams audio through the backend.

The shared conversation logic comes from `services/conversationEngine` in both cases.

---

## 2. Demo Mode Flow

```text
User opens dashboard
  -> selects Demo mode
  -> enters farmer name / last product / agent voice
  -> clicks Call Farmer

App.tsx
  -> creates LiveClient
  -> passes customerName, lastProduct, agentGender

LiveClient
  -> gets microphone permission
  -> opens Gemini Live session
  -> sends greeting trigger
  -> waits for first model turn or 5s fallback
  -> starts sending mic audio

Gemini Live
  -> returns model audio + input/output transcripts

LiveClient
  -> buffers transcript by full turn
  -> plays audio in browser
  -> sends transcript callbacks to App.tsx

App.tsx
  -> renders transcript bubbles
  -> shows visualizer and frontend logs
  -> allows transcript export to CSV/PDF
```

Key behavior:

- customer audio is intentionally blocked until the agent speaks first,
- transcripts are emitted only on final turn boundaries,
- browser mode never touches Plivo or backend order logic.

---

## 3. Phone Mode Flow

### 3.1 Dashboard to outbound call

```text
App.tsx
  -> POST /api/call
     body: phone, name, lastProduct, language, agentGender

backend/server.ts
  -> startCall(phone, context)
  -> setCallContext(callSid, context + empty items map)
  -> returns callId to UI
```

UI effects:

- `App.tsx` stores `activeCallId`
- UI status moves through `DIALING` and `RINGING`
- frontend opens `/ui-sync` WebSocket for live events

### 3.2 Plivo answer flow

```text
Plivo answers outbound call
  -> POST /plivo/answer

server.ts
  -> setPendingStreamCallSid(CallUUID)
  -> respond with Plivo XML <Response><Stream>

Plivo
  -> opens WebSocket /media
  -> sends start event with streamSid and callSid
```

### 3.3 Media bridge initialization

```text
mediaStream.ts
  -> start hold-loop frames
  -> load call context
  -> build system instruction via engineBridge.ts
  -> connect to Gemini Live
  -> send explicit greeting trigger
  -> block customer audio until first model turn or 5s fallback
```

Notes:

- If the query-string `callSid` is missing, the backend can fall back to `pendingStreamCallSid` from the earlier webhook.
- If `hold.wav` is unavailable, the backend uses silence frames instead.

### 3.4 Conversation loop

```text
Farmer speaks on phone
  -> Plivo sends mu-law frames
  -> mediaStream.ts converts to PCM 16 kHz
  -> Gemini receives realtime audio

Gemini responds
  -> mediaStream.ts receives PCM 24 kHz audio + transcripts
  -> converts back to mu-law 8 kHz
  -> sends frames to Plivo
  -> Plivo plays audio to farmer
```

Transcript handling during the loop:

- customer transcript is buffered and flushed after 1.2 seconds of silence,
- agent transcript is buffered until `turnComplete`,
- both are broadcast through `/ui-sync`,
- `App.tsx` filters events by `callId` before rendering.

---

## 4. Real-Time Order Logic

Current order capture is driven by finalized agent turns.

### 4.1 Item extraction

When an agent turn completes:

1. backend checks whether the turn contains `पिशव`.
2. it splits the text by comma, `आणि`, or `+`.
3. it parses Marathi or numeric quantities such as `एक`, `दोन`, `तीन`, or digits.
4. it removes confirmation filler text.
5. it canonicalizes product names using `findProduct()`.
6. it updates the per-call `items` map in `callContext.ts`.

### 4.2 SMS trigger

SMS is triggered when the agent turn contains any of these patterns:

- `sms`
- `पाठवतो`
- `पाठवते`
- `पेमेंट लिंक`
- mobile-send phrasing using `मोबाईल` and `पाठव`

### 4.3 Locking and save flow

```text
Agent says SMS/payment line
  -> mediaStream.ts sets locked = true and smsSent = true
  -> session items are converted into orderItems
  -> totalAmount is computed from productCatalog prices
  -> address fields are extracted from transcript lines containing पत्ता:
  -> saveOrder() stores in-memory order
  -> sendOrderSms() sends Plivo SMS
```

If SMS send fails with an exception:

- `smsSent` is reset to `false`
- `locked` is reset to `false`

---

## 5. Address Handling in Phone Mode

The prompt instructs the agent to collect village, taluka, district, and pincode. The current backend extraction path is simpler:

1. it scans finalized transcript lines,
2. it looks specifically for agent lines containing `पत्ता:`,
3. it extracts pincode using a 6-digit regex,
4. it heuristically extracts village and taluka text,
5. it passes those structured fields into the order and SMS payload.

This is why consistent agent confirmation wording matters for reliable SMS output.

---

## 6. Auto Hangup Flow

```text
Agent final turn matches closing phrase
  -> conversationEndDetector.ts marks pending final audio
  -> backend waits for last model audio frames to flush
  -> backend waits 1 extra second
  -> hangUpCall(callSid)
  -> Plivo marks call completed
```

The detector is intentionally conservative so a mid-conversation `धन्यवाद` does not end the call accidentally.

---

## 7. UI Sync Event Flow

`/ui-sync` sends JSON messages to the dashboard.

Active event types:

| Type | Purpose |
|------|---------|
| `CALL_STATUS` | Updates phone call state in the UI |
| `CUSTOMER_TURN` | Finalized customer transcript bubble |
| `AGENT_TURN` | Finalized agent transcript bubble |
| `AGENT_SPEAKING` | Toggles the “agent is speaking” indicator |

`App.tsx` ignores events that do not match the current `activeCallId`.

---

## 8. Plivo Status Flow

```text
Plivo POST /plivo/status
  -> statusHandler.ts maps raw provider status
  -> broadcastUiSync({ type: 'CALL_STATUS', ... })
  -> appendCallLog(...) for completed/busy/no-answer
```

Mapped states:

- `queued` -> `DIALING`
- `ringing` -> `RINGING`
- `in-progress` -> `IN_PROGRESS`
- `completed` -> `ENDED`
- `busy` / `no-answer` / `failed` -> `FAILED`

Busy and no-answer are only marked retry-eligible in the log. There is no scheduler yet.

---

## 9. Supporting Logic That Exists But Is Not In The Main Flow

These modules are present but are not currently called from the live demo or Plivo media bridge:

- `backend/services/diseaseMatcher.ts`
- `backend/services/intentClassifier.ts`
- `backend/services/emotionDetector.ts`
- `backend/services/inventoryService.ts`
- `backend/services/callState.ts`
- `services/consentGate.ts`
- `services/domainGuard.ts`
- `services/languageDetection.ts`

The live experience depends primarily on the shared prompt plus transcript/audio orchestration.
