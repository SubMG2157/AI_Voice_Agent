# API Documentation — Deepak Fertilisers AI Calling Agent

## 1. Base Behavior

The backend is served by `backend/server.ts`.

Responsibilities:

- REST APIs,
- Plivo webhooks,
- WebSocket bridges,
- static hosting for the built frontend,
- SPA fallback routing.

Default backend port: `3001`

---

## 2. REST Endpoints

### POST `/api/call`

Starts a real Plivo outbound call.

#### Request body

```json
{
  "phone": "+919975711324",
  "name": "Mayur",
  "lastProduct": "NPK 19-19-19",
  "language": "Marathi",
  "agentGender": "male"
}
```

#### Fields

| Field | Type | Required | Notes |
|------|------|----------|-------|
| `phone` | string | Yes | Required by backend validation |
| `name` | string | No | Stored as `customerName`; defaults to `शेतकरी` |
| `lastProduct` | string | No | Defaults to `NPK 19-19-19` |
| `language` | string | No | Stored in call context; current prompt still uses Marathi |
| `agentGender` | `male` or `female` | No | Controls prompt persona and Gemini voice |

#### Success response

```json
{
  "callId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "initiated",
  "message": "Call initiated"
}
```

#### Error behavior

- `400` if `phone` is missing
- `500` if Plivo credentials are missing or Plivo call creation fails

Important note:

- Unlike SMS sending, `/api/call` does not have a mock mode. It fails if Plivo credentials are unavailable.

---

### POST `/api/order`

Creates an in-memory order record.

The endpoint supports both:

1. modern `items` array payload,
2. legacy single `product + quantity` payload.

#### Request body with `items`

```json
{
  "customerName": "Mayur",
  "phone": "+919975711324",
  "items": [
    { "product": "NPK 19-19-19", "quantity": 2, "price": 1200 },
    { "product": "Mahadhan Smartek", "quantity": 1, "price": 1250 }
  ],
  "address": "यवत",
  "village": "यवत",
  "taluka": "दौंड",
  "pincode": "412104"
}
```

#### Legacy request body with single product

```json
{
  "customerName": "Mayur",
  "phone": "+919975711324",
  "product": "NPK 19-19-19",
  "quantity": 2,
  "village": "यवत",
  "taluka": "दौंड",
  "pincode": "412104"
}
```

#### Rules

- `phone` is required
- either `items` or `product + quantity` must be supplied
- if single product payload is used, backend resolves price via `getProductPrice()`

#### Success response

```json
{
  "success": true,
  "order": {
    "orderId": "DF-MLJNU6D6-1001",
    "customerName": "Mayur",
    "phone": "+919975711324",
    "items": [
      { "product": "NPK 19-19-19", "quantity": 2, "price": 1200 }
    ],
    "totalAmount": 2400,
    "paymentStatus": "pending",
    "paymentLink": "https://amrutpeth.com/product/mahadhan-smartek-102626"
  }
}
```

#### Error behavior

- `400` if phone is missing
- `400` if neither `items` nor `product + quantity` is present
- `500` on unexpected server failure

---

### POST `/api/send-sms`

Sends order confirmation SMS using Plivo SMS, or logs a mock SMS if Plivo is not configured.

#### Request body with `items`

```json
{
  "phone": "+919975711324",
  "customerName": "Mayur",
  "items": [
    { "product": "NPK 19-19-19", "quantity": 2, "price": 1200 }
  ],
  "village": "यवत",
  "taluka": "दौंड",
  "pincode": "412104",
  "orderId": "DF-MLJNU6D6-1001"
}
```

#### Supported aliases and legacy fields

| Field | Notes |
|------|-------|
| `phone` or `to` | Either is accepted for the destination number |
| `items` | Preferred payload |
| `product + quantity` | Legacy fallback payload |
| `orderId` | Required |

#### Rules

- destination phone is required,
- `orderId` is required,
- at least one item is required after normalization.

#### Success response

```json
{
  "success": true
}
```

If Plivo is not configured, the service logs the SMS body and still returns a successful mock result internally.

#### Error behavior

- `400` if phone or orderId or items are missing
- `500` only if request processing itself fails

---

### GET `/health`

Simple health check.

#### Response

```json
{
  "ok": true
}
```

---

## 3. Plivo Webhooks

### POST `/plivo/answer`

Returns Plivo XML for live media streaming.

Behavior:

1. sets response type to `text/xml`,
2. reads `CallUUID` from Plivo request body,
3. stores that value as `pendingStreamCallSid`,
4. returns `<Response><Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">wss://.../media</Stream></Response>`.

The stream URL includes `callSid` as a query parameter when available.

### POST `/plivo/status`

Receives Plivo call status callbacks.

Current behavior:

- maps Plivo status to dashboard status,
- broadcasts `/ui-sync` call updates,
- appends in-memory call logs,
- marks busy/no-answer as retry-eligible in the log only.

Compatibility note:

- `/twilio/voice` and `/twilio/status` are still available as migration aliases and route to the same handlers.

There is no real retry scheduler yet.

---

## 4. WebSocket Endpoints

### WS `/media`

Plivo Audio Stream endpoint.

Purpose:

- receive Plivo phone audio,
- bridge it to Gemini Live,
- send Gemini audio back to Plivo,
- manage session transcript, order tracking, SMS trigger, and hangup logic.

Important runtime behaviors:

- starts hold audio immediately,
- greeting trigger forces the agent to speak first,
- customer audio is blocked until first model turn or 5-second fallback,
- order extraction occurs from finalized agent turns,
- SMS trigger occurs from finalized agent text.

### WS `/ui-sync`

Dashboard synchronization channel.

The backend sends JSON messages with the following `type` values:

| Type | Shape |
|------|-------|
| `CALL_STATUS` | `{ type, callId, status }` |
| `CUSTOMER_TURN` | `{ type, callId, text }` |
| `AGENT_TURN` | `{ type, callId, text }` |
| `AGENT_SPEAKING` | `{ type, callId, value }` |

The frontend only renders messages for the active call ID.

---

## 5. SMS Format

`backend/services/smsService.ts` formats SMS with:

- customer name,
- mobile number,
- structured address,
- itemized products,
- per-item subtotal,
- total amount,
- generated order ID,
- payment link,
- 24-hour payment instruction,
- 3 to 4 day delivery note.

The payment link is currently static:

```text
https://amrutpeth.com/product/mahadhan-smartek-102626
```

`generatePaymentLink(orderId)` does not yet produce an order-specific URL.

---

## 6. Environment Variables

### Required for real phone mode

| Variable | Purpose |
|----------|---------|
| `PLIVO_AUTH_ID` | Plivo Voice and SMS authentication |
| `PLIVO_AUTH_TOKEN` | Plivo Voice and SMS authentication |
| `PLIVO_NUMBER` | Caller ID and SMS sender |
| `GEMINI_API_KEY` | Gemini Live session creation |
| `BACKEND_BASE_URL` | Public webhook and media URL for Plivo |

### Optional for India SMS DLT

| Variable | Purpose |
|----------|---------|
| `DLT_ENTITY_ID` | Sender principal entity for India DLT compliance |
| `DLT_TEMPLATE_ID` | Approved template ID for transactional SMS |

### Optional

| Variable | Purpose |
|----------|---------|
| `BACKEND_PORT` | Express port, default `3001` |

### Environment loading order

Backend loads:

1. root `.env`
2. root `.env.local`
3. `backend/.env`

Frontend demo mode receives the same Gemini key through Vite `define` injection.

---

## 7. Error and Fallback Behavior

| Scenario | Actual behavior |
|----------|-----------------|
| Missing Plivo creds for `/api/call` | endpoint fails with server error |
| Missing Plivo creds for SMS | SMS body is logged in mock mode and treated as success |
| Missing `GEMINI_API_KEY` in media bridge | backend logs error and Gemini session is not established |
| `hold.wav` missing | backend falls back to generated silence frames |
| Agent never speaks first | customer audio unblocks after 5 seconds |
| SMS trigger send throws | lock and smsSent are reset |
| Busy or no-answer | logged as retry-eligible only, no automatic retry |
| Missing call context in media stream | backend warns and cannot initialize Gemini until context exists |

---

## 8. Persistence Model

This backend currently uses in-memory storage only.

| Store | File |
|------|------|
| Per-call context | `backend/twilio/callContext.ts` |
| Orders | `backend/orders/orderStore.ts` |
| Call logs | `backend/logs/callLog.ts` |

All of these reset when the backend process restarts.
