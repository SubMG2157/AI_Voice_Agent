# Deepak Fertilisers — AI Calling Agent

Outbound AI voice agent for Deepak Fertilisers. The project can either call a farmer through Plivo or run the same conversation flow in browser demo mode through Gemini Live.

Current implementation summary:

- shared prompt engine for demo mode and Plivo phone mode,
- outbound-first greeting trigger,
- Marathi-first runtime behavior,
- real-time transcript streaming to the UI,
- in-memory order creation,
- SMS confirmation with static payment link,
- automatic call hangup after a closing line.

Important current-state note:

- The live prompt path is strict Marathi only.
- Some helper files and tests in the repository are older utility residue and are not part of the active fertilizer runtime.

## Stack

- React 19 + Vite
- Express + WebSocket
- Plivo Voice and SMS
- Google Gemini Live

## Main Runtime Paths

### Browser demo mode

- `App.tsx` creates `LiveClient`
- browser microphone streams directly to Gemini Live
- transcript bubbles, waveform visualization, log download, and transcript export all happen in the frontend

### Plivo phone mode

- `POST /api/call` starts the outbound call
- Plivo hits `/plivo/answer`
- `/media` bridges Plivo audio to Gemini Live
- `/ui-sync` streams transcript and call status updates back to the dashboard

## Key Implementation Notes

- Order tracking is stored per call in `backend/twilio/callContext.ts` using an in-memory `Map<string, number>`.
- Product pricing and alias matching come from `backend/knowledge/productCatalog.ts`.
- Order extraction currently depends on finalized agent turns, not only raw customer ASR.
- SMS is triggered when the agent says an SMS/payment phrase and the order has not already been locked.
- Orders, call context, and call logs are all in-memory only.
- Backend runtime logs are written to `backend/logs/logs.txt`.

## Environment Variables

Backend reads environment values from:

1. root `.env`
2. root `.env.local`
3. `backend/.env`

Typical setup:

```env
PLIVO_AUTH_ID=MAxxxxxxxxxxxxxxxxxx
PLIVO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PLIVO_NUMBER=+919876543210
DLT_ENTITY_ID=1234567890123456
DLT_TEMPLATE_ID=1234567890123456789
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxx
BACKEND_BASE_URL=https://xxxx.railway.app
PORT=3001
```

Notes:

- `BACKEND_BASE_URL` must be public for Plivo, usually via Railway or ngrok.
- `PORT` dictates the Express server's listening port (default is 3001 if omitted). Railway sets this automatically.
- Vite injects `GEMINI_API_KEY` into browser demo mode during build/dev.
- For Indian SMS, DLT entity/template configuration is required.

## Node.js Requirement

This project requires **Node.js v20.0.0 or higher** due to the `@google/genai` dependency and ESM resolution logic.

## Run Locally

### Development

```bash
npm install
npm run dev
```

In another terminal:

```bash
npm run backend
```

### Single-port run

```bash
npm install
npm run start
```

In another terminal:

```bash
ngrok http 3001
```

Then update `BACKEND_BASE_URL` and restart the backend.

## Railway Deployment

The project contains a `railway.json` and a `.nixpacks.toml` configured for Railway deployment.

1. Ensure all environment variables above are configured in Railway.
2. Railway will automatically build using `npm run build` and start the server using `npx tsx backend/server.ts`.
3. The Nixpacks configuration forces Node.js 20.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend dev server on port 3000 |
| `npm run build` | Production frontend build |
| `npm run start` | Build frontend and start backend on port 3001 |
| `npm run backend` | Start backend only |
| `npm run backend:dev` | Start backend with file watching |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run Vitest once |

## Endpoints

| Method | Endpoint |
|--------|----------|
| POST | `/api/call` |
| POST | `/api/order` |
| POST | `/api/send-sms` |
| GET | `/health` |
| POST | `/plivo/answer` |
| POST | `/plivo/status` |
| WS | `/media` |
| WS | `/ui-sync` |

## Documentation

- [docs/TECHNICAL_DOCUMENTATION.md](./docs/TECHNICAL_DOCUMENTATION.md)
- [docs/PROJECT_FLOW.md](./docs/PROJECT_FLOW.md)
- [docs/PROMPTS_REFERENCE.md](./docs/PROMPTS_REFERENCE.md)
- [docs/API_DOCUMENTATION.md](./docs/API_DOCUMENTATION.md)
