/**
 * Deepak Fertilisers Farmer Bot — Plivo Outbound Backend
 * - POST /api/call — start outbound call (phone, name, lastProduct, language)
 * - POST /api/order — save order
 * - POST /api/send-sms — send order SMS
 * - POST /plivo/answer — Plivo XML: Connect to Media Stream
 * - POST /plivo/status — status callback
 * - WebSocket /media — Plivo Media Stream ↔ Gemini Live
 * - WebSocket /ui-sync — transcript + call status to React UI
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { startCall } from './twilio/callStarter.js';
import { voiceWebhook } from './twilio/voiceWebhook.js';
import { handleTwilioStatus } from './twilio/statusHandler.js';
import { handleMediaConnection, handleUiSyncConnection, setPendingStreamCallSid } from './twilio/mediaStream.js';
import { setCallContext } from './twilio/callContext.js';
import { saveOrder } from './orders/orderStore.js';
import { sendOrderSms } from './services/smsService.js';
import { generatePaymentLink } from './services/smsFormatter.js';
import { initFileLogger } from './services/fileLogger.js';

// Load .env from project root and backend/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });

// Initialize file logger — all console output goes to logs/logs.txt
initFileLogger();

const PORT = Number(process.env.PORT) || Number(process.env.BACKEND_PORT) || 3001;
const BASE_URL = process.env.BACKEND_BASE_URL || `http://localhost:${PORT}`;
const plivoOk = !!(process.env.PLIVO_AUTH_ID && process.env.PLIVO_AUTH_TOKEN && process.env.PLIVO_NUMBER);
console.log('Plivo:', plivoOk ? 'LOADED' : 'MISSING (set PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_NUMBER in .env or backend/.env)');
if (plivoOk && (BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1'))) {
  console.warn('BACKEND_BASE_URL is localhost — Plivo cannot reach it. Set BACKEND_BASE_URL to your ngrok URL (e.g. https://xxxx.ngrok-free.app) in .env or backend/.env');
}

const app = express();

// CORS: allow frontend from any origin (ngrok, localhost, customer PCs)
app.use(cors({
  origin: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ——— API: Start outbound call ———
app.post('/api/call', async (req, res) => {
  console.log('CALL API HIT', req.body);
  try {
    const { phone, name, lastProduct, language, agentGender } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'phone required' });
      return;
    }
    const context = {
      customerName: name || 'शेतकरी',
      lastProduct: lastProduct || 'NPK 19-19-19',
      language: language || 'Marathi',
      agentGender: agentGender ?? 'female',
    };
    const call = await startCall(phone, context);
    setCallContext(call.id, { ...context, phone });
    res.json({
      callId: call.id,
      status: 'initiated',
      message: 'Call initiated via Plivo',
    });
  } catch (err: any) {
    console.error('Start call error:', err);
    res.status(500).json({ error: err?.message || 'Failed to start call' });
  }
});

import { getProductPrice } from './knowledge/productCatalog.js';

// ——— API: Save order ———
app.post('/api/order', (req, res) => {
  try {
    const { customerName, phone, product, quantity, items, address, village, taluka, pincode } = req.body;

    // Support both single product (legacy) and items array
    let orderItems: any[] = [];
    if (items && Array.isArray(items)) {
      orderItems = items;
    } else if (product && quantity) {
      orderItems = [{ product, quantity: Number(quantity), price: getProductPrice(product) }];
    } else {
      res.status(400).json({ error: 'items array OR product+quantity required' });
      return;
    }

    if (!phone) {
      res.status(400).json({ error: 'phone required' });
      return;
    }

    const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const order = saveOrder({
      customerName: customerName || 'शेतकरी',
      phone,
      items: orderItems,
      totalAmount,
      address: address || '',
      village,
      taluka,
      pincode,
      paymentStatus: 'pending',
    });
    // Update payment link with real order ID
    // Note: saveOrder doesn't return paymentLink, we generate it here or in smsService
    // Actually saveOrder returns the full order object which has paymentLink as optional? 
    // In our new orderStore it doesn't set paymentLink. It sets orderId.
    // The previous code set it. Let's add it back if needed, or rely on smsService to generate it.
    order.paymentLink = generatePaymentLink(order.orderId);

    res.json({ success: true, order });
  } catch (err: any) {
    console.error('Save order error:', err);
    res.status(500).json({ error: err?.message || 'Failed to save order' });
  }
});

// ——— API: Send SMS ———
app.post('/api/send-sms', async (req, res) => {
  try {
    const { to, customerName, product, quantity, items, address, village, taluka, pincode, orderId } = req.body;
    const phone = to || req.body.phone;

    let orderItems: any[] = [];
    if (items && Array.isArray(items)) {
      orderItems = items;
    } else if (product && quantity) {
      orderItems = [{ product, quantity: Number(quantity), price: getProductPrice(product) }];
    }

    if (!phone || orderItems.length === 0 || !orderId) {
      res.status(400).json({ error: 'phone, items (or product+quantity), orderId required' });
      return;
    }

    const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const sent = await sendOrderSms({
      customerName: customerName || 'शेतकरी',
      phone,
      items: orderItems,
      totalAmount,
      address: address || '',
      village,
      taluka,
      pinCode: pincode,
      orderId,
    });
    res.json(sent);
  } catch (err: any) {
    console.error('Send SMS error:', err);
    res.status(500).json({ error: err?.message || 'Failed to send SMS' });
  }
});

// ——— Plivo webhooks ———
app.post('/plivo/answer', (req, res) => {
  res.type('text/xml');
  const callId = (req.body && (req.body.CallUUID || req.body.CallSid || req.body.call_uuid)) || '';
  if (callId) setPendingStreamCallSid(callId);
  res.send(voiceWebhook(BASE_URL, callId));
});

app.post('/plivo/status', (req, res) => {
  handleTwilioStatus(req.body);
  res.sendStatus(200);
});

app.post('/plivo/sms-status', (req, res) => {
  console.log('[Plivo] SMS status:', req.body);
  res.sendStatus(200);
});

// Backward-compatible aliases while migrating dashboards/tools.
app.post('/twilio/voice', (req, res) => {
  res.type('text/xml');
  const callId = (req.body && (req.body.CallUUID || req.body.CallSid || req.body.call_uuid)) || '';
  if (callId) setPendingStreamCallSid(callId);
  res.send(voiceWebhook(BASE_URL, callId));
});

app.post('/twilio/status', (req, res) => {
  handleTwilioStatus(req.body);
  res.sendStatus(200);
});

// ——— Health ———
app.get('/health', (_, res) => res.json({ ok: true }));

// ——— Serve built frontend (dist/) so both run on one port + one ngrok URL ———
const distPath = path.join(root, 'dist');
app.use(express.static(distPath));
// SPA fallback: any route that isn't /api, /twilio, /health, /media, /ui-sync → serve index.html
app.get('*', (req, res) => {
  const p = req.path;
  if (p.startsWith('/api') || p.startsWith('/twilio') || p.startsWith('/plivo') || p.startsWith('/health')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

const httpServer = createServer(app);

// WebSocket servers with noServer so we own the upgrade and strip extensions.
const wssMedia = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const wssUiSync = new WebSocketServer({ noServer: true, perMessageDeflate: false });

httpServer.on('upgrade', (req, socket, head) => {
  delete (req.headers as Record<string, string>)['sec-websocket-extensions'];
  const pathname = req.url?.split('?')[0] ?? '';
  if (pathname === '/media') {
    wssMedia.handleUpgrade(req, socket, head, (ws) => {
      wssMedia.emit('connection', ws, req);
    });
  } else if (pathname === '/ui-sync') {
    wssUiSync.handleUpgrade(req, socket, head, (ws) => {
      wssUiSync.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wssMedia.on('connection', (ws, req) => {
  const ext = (ws as any).extensions;
  console.log('[MediaStream] WS /media connected, extensions:', ext === undefined || ext === '' ? '(none)' : ext);
  handleMediaConnection(ws, req);
});

wssUiSync.on('connection', (ws) => {
  handleUiSyncConnection(ws);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Deepak Fertilisers Agent — Running on port ${PORT}`);
  console.log(`──────────────────────────────────────────`);
  console.log(`  🌐 Frontend:  http://localhost:${PORT}`);
  console.log(`  📡 API:       http://localhost:${PORT}/api/...`);
  console.log(`  📞 Plivo:     ${BASE_URL}/plivo/answer`);
  console.log(`  🔗 ngrok URL: ${BASE_URL}`);
  console.log(`──────────────────────────────────────────`);
  console.log(`  Share this with customers: ${BASE_URL}`);
  console.log(`──────────────────────────────────────────\n`);
});
