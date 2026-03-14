/**
 * Plivo Media Stream WebSocket + UI sync WebSocket — Deepak Fertilisers Farmer Agent.
 * - /media: Plivo streams μ-law 8kHz; we convert to PCM 16kHz → Gemini Live; Gemini PCM 24kHz → μ-law 8kHz → Plivo.
 * - Context and Gemini are initialized on Twilio "start" event (callSid from start payload), not from URL.
 * - Agent speaks first: customer audio is ignored until first Gemini turn (or 5s fallback).
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { getCallContext, updateContextItems } from './callContext.js';
import { buildSystemInstruction, getEngineContext } from '../engineBridge.js';
import { mulawToPcm, pcmToMulaw } from '../audio/mulaw.js';
import { resample } from '../audio/resample.js';
import { hangUpCall } from './callStarter.js';
import { isAgentClosingLine } from '../services/conversationEndDetector.js';
import { sanitizeTranscript } from '../../services/transcriptSanitizer.js';
import { sendOrderSms } from '../services/smsService.js';
import { saveOrder } from '../orders/orderStore.js';
import { findProduct, getProductPrice } from '../knowledge/productCatalog.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UI_SYNC_CLIENTS = new Set<import('ws').WebSocket>();
const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025';
const INBOUND_AUDIO_BATCH_MS = 60;
const MAX_INBOUND_AUDIO_FRAMES = 5;
const NOISE_GATE_THRESHOLD = 380;

/** When Plivo stream connects without call ID in query, use this call ID from the last answer webhook. */
let pendingStreamCallSid: string | null = null;

export function setPendingStreamCallSid(callSid: string) {
  pendingStreamCallSid = callSid;
}

export function broadcastUiSync(msg: object) {
  const data = JSON.stringify(msg);
  UI_SYNC_CLIENTS.forEach((ws) => {
    if (ws.readyState === 1) ws.send(data);
  });
}

export function handleUiSyncConnection(ws: import('ws').WebSocket) {
  UI_SYNC_CLIENTS.add(ws);
  ws.on('close', () => UI_SYNC_CLIENTS.delete(ws));
}

interface StreamState {
  callSid: string | null;
  streamSid: string | null;
  context: Awaited<ReturnType<typeof getCallContext>>;
  geminiSession: any;
  allowSendToGemini: boolean;
  outboundTimer: ReturnType<typeof setTimeout> | null;
  holdInterval: ReturnType<typeof setInterval> | null;
  initialized: boolean;
  silenceSent: boolean;
  agentBuffer: string;
  customerBuffer: string;
  silenceTimer: NodeJS.Timeout | null; // Added for speech buffering
  hangupScheduled: boolean;
  /** Set when closing phrase detected; hang up only after last TTS audio is sent (audio drain). */
  pendingFinalAudio: boolean;
  /** Prevents sending SMS more than once per call. */
  smsSent: boolean;
  /** True after SMS is triggered to prevent further order changes. */
  locked: boolean;
  /** Accumulated conversation transcript for order extraction. */
  fullTranscript: string;
  inboundAudioChunks: Buffer[];
  inboundFlushTimer: NodeJS.Timeout | null;
}

function isDevanagariChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x0900 && code <= 0x097F;
}

/** Matra / dependent sign — must attach to preceding consonant, never gets a space before it. */
function isDevanagariMatra(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  // ा ि ी ु ू ृ ॄ ॅ ॆ े ै ॉ ॊ ो ौ ् ं ः ँ
  return (code >= 0x093E && code <= 0x094D) || code === 0x0902 || code === 0x0903 || code === 0x0901;
}

function joinTranscriptChunk(buffer: string, chunk: string): string {
  const c = String(chunk || '');
  if (!c) return buffer;
  if (!buffer) return c;

  const prev = buffer[buffer.length - 1] ?? '';
  const next = c[0] ?? '';

  // Never double-space
  if (prev === ' ' || next === ' ') return `${buffer}${c}`;

  // If the new chunk starts with a matra (vowel sign / halant / nasalization),
  // it belongs to the previous consonant — no space.
  if (isDevanagariMatra(next)) return `${buffer}${c}`;

  // If previous char is halant (्), the next consonant is part of a conjunct — no space.
  if (prev === '\u094D') return `${buffer}${c}`;

  // Everything else (Latin-Latin, Devanagari-Devanagari words, mixed) — add space.
  return `${buffer} ${c}`;
}

function applyNoiseGate(pcm: Buffer, threshold: number): Buffer {
  const out = Buffer.allocUnsafe(pcm.length);
  for (let i = 0; i < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i);
    out.writeInt16LE(Math.abs(sample) < threshold ? 0 : sample, i);
  }
  return out;
}

/** Returns true when agent says the SMS/payment confirmation line. */
function isSmsLine(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes('sms') ||
    t.includes('पाठवतो') ||
    t.includes('पाठवते') ||
    t.includes('पेमेंट लिंक') ||
    (t.includes('मोबाईल') && t.includes('पाठव'))
  );
}

/** Strip spoken confirmation phrases from extracted text. */
function cleanAddressField(text: string): string {
  return text
    .replace(/\.?\s*हे बरोबर आहे का\??/gi, '')
    .replace(/\.?\s*बरोबर आहे का\??/gi, '')
    .replace(/\.?\s*confirm\s*करा\.?/gi, '')
    .replace(/\d{6}/g, '')       // Remove pincode (stored separately)
    .replace(/\s*[-–]\s*$/g, '') // Trailing dashes
    .replace(/,\s*,/g, ',')     // Double commas
    .replace(/,\s*$/g, '')      // Trailing comma
    .trim();
}

function getCallSidFromRequestUrl(req: import('http').IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    return url.searchParams.get('callUuid') || url.searchParams.get('callSid');
  } catch {
    return null;
  }
}

/** Plivo supports larger frames; 640 bytes = 80ms at 8kHz µ-law = fewer JSON sends = lower overhead. */
const FRAME_SIZE = 640;

/** Load hold.wav, convert to μ-law 8kHz, slice into 20 ms frames. Return array of base64 payloads. */
function loadHoldFrames(): string[] {
  const holdPath = join(__dirname, '..', '..', 'hold.wav');
  try {
    const buf = readFileSync(holdPath);
    if (buf.length < 44) return getSilenceHoldFrames();
    let pos = 12;
    let sampleRate = 8000;
    let numChannels = 1;
    let pcm: Buffer | null = null;
    while (pos + 8 <= buf.length) {
      const id = buf.toString('ascii', pos, pos + 4);
      const size = buf.readUInt32LE(pos + 4);
      if (id === 'fmt ') {
        numChannels = buf.readUInt16LE(pos + 10);
        sampleRate = buf.readUInt32LE(pos + 12);
      } else if (id === 'data') {
        pcm = buf.subarray(pos + 8, pos + 8 + size);
        break;
      }
      pos += 8 + size;
    }
    if (!pcm || pcm.length === 0) return getSilenceHoldFrames();
    let pcmMono = pcm;
    if (numChannels === 2) {
      const n = Math.floor(pcm.length / 4);
      pcmMono = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) {
        const l = pcm.readInt16LE(i * 4);
        const r = pcm.readInt16LE(i * 4 + 2);
        pcmMono.writeInt16LE(Math.round((l + r) / 2), i * 2);
      }
    }
    const pcm8k = resample(pcmMono, sampleRate, 8000);
    const mulaw = pcmToMulaw(pcm8k);
    const frames: string[] = [];
    for (let i = 0; i < mulaw.length; i += FRAME_SIZE) {
      const frame = mulaw.subarray(i, i + FRAME_SIZE);
      if (frame.length > 0) frames.push(frame.toString('base64'));
    }
    console.log('[MediaStream] Hold tone: hold.wav →', frames.length, '× 20 ms frames');
    return frames.length > 0 ? frames : getSilenceHoldFrames();
  } catch (e) {
    console.warn('[MediaStream] Could not load hold.wav, using silence:', (e as Error).message);
    return getSilenceHoldFrames();
  }
}

function getSilenceHoldFrames(): string[] {
  const silence = Buffer.alloc(FRAME_SIZE, 0x7f);
  const b64 = silence.toString('base64');
  return Array.from({ length: 100 }, () => b64);
}

const HOLD_FRAMES = loadHoldFrames();

function startHoldLoop(ws: import('ws').WebSocket, streamSid: string, state: StreamState) {
  if (state.holdInterval) return;
  if (!streamSid) {
    console.warn('[MediaStream] Cannot start hold loop: streamSid missing');
    return;
  }
  let idx = 0;
  let firstFrameSent = false;
  state.holdInterval = setInterval(() => {
    if (ws.readyState !== 1) {
      if (state.holdInterval) clearInterval(state.holdInterval);
      state.holdInterval = null;
      return;
    }
    const payload = HOLD_FRAMES[idx];
    ws.send(JSON.stringify({
      event: 'playAudio',
      media: {
        contentType: 'audio/x-mulaw',
        sampleRate: 8000,
        payload,
      },
    }));
    if (!firstFrameSent) {
      firstFrameSent = true;
      console.log('[MediaStream] First hold frame sent, streamSid:', streamSid);
    }
    idx = (idx + 1) % HOLD_FRAMES.length;
  }, 20);
  console.log('[MediaStream] Hold stream started (20 ms frames, streamSid:', streamSid, ')');
}

function stopHoldLoop(state: StreamState) {
  if (state.holdInterval) {
    clearInterval(state.holdInterval);
    state.holdInterval = null;
    console.log('[MediaStream] Hold audio stopped');
  }
}

export function handleMediaConnection(ws: import('ws').WebSocket, req: import('http').IncomingMessage) {
  const urlCallSid = getCallSidFromRequestUrl(req);
  const callSidToUse = urlCallSid ?? pendingStreamCallSid;
  if (pendingStreamCallSid && !urlCallSid) {
    console.log('[MediaStream] Using pending callSid (URL had none):', pendingStreamCallSid);
    pendingStreamCallSid = null;
  }
  console.log('[MediaStream] New WebSocket connection, callId:', callSidToUse ?? 'none', 'req.url:', (req.url ?? '').slice(0, 80));

  const state: StreamState = {
    callSid: callSidToUse,
    streamSid: null,
    context: callSidToUse ? getCallContext(callSidToUse) : undefined,
    geminiSession: null,
    allowSendToGemini: false,
    outboundTimer: null,
    holdInterval: null,
    initialized: false,
    silenceSent: false,
    agentBuffer: '',
    customerBuffer: '',
    silenceTimer: null,
    hangupScheduled: false,
    pendingFinalAudio: false,
    smsSent: false,
    locked: false,
    fullTranscript: '',
    inboundAudioChunks: [],
    inboundFlushTimer: null,
  };

  function getCallIdForLog() {
    return state.callSid ?? 'unknown';
  }

  // --- Helper to init Gemini ---
  async function initGemini() {
    if (state.initialized) return;
    if (!state.context || !state.callSid) {
      // Try to fetch context again if callSid is now available
      if (state.callSid) state.context = getCallContext(state.callSid);
      if (!state.context) {
        console.warn('[MediaStream] Cannot init Gemini - no context for callSid', state.callSid);
        return;
      }
    }
    state.initialized = true;
    broadcastUiSync({ type: 'CALL_STATUS', callId: state.callSid, status: 'CONNECTED' });

    const engineContext = { ...state.context, callSid: state.callSid };
    const systemInstruction = buildSystemInstruction(engineContext);

    // Select voice based on agent gender from context
    const voiceName = state.context.agentGender === 'male' ? 'Puck' : 'Kore';
    console.log('[MediaStream] Agent voice:', voiceName);

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.error('[MediaStream] GEMINI_API_KEY not set');
      return;
    }

    try {
      const { GoogleGenAI, Modality, EndSensitivity } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      console.log('[MediaStream] Gemini model:', GEMINI_LIVE_MODEL);
      const sessionPromise = ai.live.connect({
        model: GEMINI_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              silenceDurationMs: 500,
              prefixPaddingMs: 0,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            },
          },
          thinkingConfig: { thinkingBudget: 0 },
          temperature: 0.5,
        },
        callbacks: {
          onopen: () => console.log('[MediaStream] Gemini WebSocket opened'),
          onmessage: (msg: any) => handleGeminiMessage(msg),
          onclose: () => {
            state.geminiSession = null;
            console.log('[MediaStream] Gemini session closed');
            stopHoldLoop(state);
          },
          onerror: (e: any) => {
            console.error('[MediaStream] Gemini error:', e?.message ?? e);
            stopHoldLoop(state);
          }
        }
      });
      state.geminiSession = await sessionPromise;
      console.log('[MediaStream] Gemini session connected successfully');

      // Trigger agent to speak first
      try {
        await state.geminiSession.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{ text: 'कॉल कनेक्ट झाला आहे. आता तुझं मराठी ग्रीटिंग लगेच सांग. ग्राहकाची वाट पाहू नको.' }]
          }],
          turnComplete: true,
        });
        console.log('[MediaStream] Greeting trigger sent');
      } catch (e: any) {
        console.error('[MediaStream] Failed to send greeting trigger:', e?.message);
      }

      // Start guard timer
      if (!state.allowSendToGemini) {
        state.outboundTimer = setTimeout(() => {
          console.log('[MediaStream] No agent audio for 5s, forcing allowSendToGemini');
          state.allowSendToGemini = true;
          state.outboundTimer = null;
        }, 5000);
      }
    } catch (err: any) {
      console.error('[MediaStream] Gemini connection failed:', err?.message);
    }
  }

  // --- Gemini Message Handler ---
  function handleGeminiMessage(msg: any) {
    const content = msg?.serverContent;
    if (content?.modelTurn && !state.allowSendToGemini) {
      state.allowSendToGemini = true;
      if (state.outboundTimer) {
        clearTimeout(state.outboundTimer);
        state.outboundTimer = null;
      }
      console.log('[MediaStream] Agent spoke first — enabling customer audio');
    }

    const outText = content?.outputTranscription?.text;
    const inText = content?.inputTranscription?.text;
    const turnComplete = !!content?.turnComplete;
    const base64Audio = content?.modelTurn?.parts?.[0]?.inlineData?.data;

    // --- Latency tracking: log time from customer silence to first agent audio ---
    if (inText && !(state as any)._lastCustomerSpeechMs) {
      (state as any)._lastCustomerSpeechMs = Date.now();
    }
    if (base64Audio && (state as any)._lastCustomerSpeechMs) {
      const latencyMs = Date.now() - (state as any)._lastCustomerSpeechMs;
      console.log(`[MediaStream] ⏱️ Customer→Agent latency: ${latencyMs}ms`);
      (state as any)._lastCustomerSpeechMs = 0;
    }

    // customer transcript - WITH BUFFERING (FIX 1)
    if (inText) {
      state.customerBuffer = joinTranscriptChunk(state.customerBuffer, inText);

      // Clear previous timer
      if (state.silenceTimer) clearTimeout(state.silenceTimer);

      // Faster flush for telephony ASR to reduce visible transcript lag.
      state.silenceTimer = setTimeout(() => {
        const rawText = state.customerBuffer.trim();
        if (rawText) {
          const custResult = sanitizeTranscript(rawText, {
            preferDevanagari: true,
            dropIsolatedLatinWords: true,
            dropUnclear: true,
            applyTelephonyCorrections: true,
          });
          if (custResult.output) {
            broadcastUiSync({ type: 'CUSTOMER_TURN', callId: state.callSid!, text: custResult.output });
            state.fullTranscript += '\nCUSTOMER: ' + custResult.output;
          } else {
            console.log('[MediaStream] Customer transcript dropped by sanitizer:', JSON.stringify(rawText.slice(0, 60)));
          }
        }
        state.customerBuffer = ''; // Reset buffer
        state.silenceTimer = null;
      }, 800);
    }

    // agent transcript
    if (outText) {
      // NOTE: We don't buffer agent text as heavily because it usually comes in larger chunks, 
      // but if needed we could apply similar logic. For now, we just flush customer buffer if agent interrupts.
      if (state.customerBuffer.trim()) {
        const rawText = state.customerBuffer.trim();
        const custResult = sanitizeTranscript(rawText, {
          preferDevanagari: true,
          dropIsolatedLatinWords: true,
          dropUnclear: true,
          applyTelephonyCorrections: true,
        });
        if (custResult.output) {
          broadcastUiSync({ type: 'CUSTOMER_TURN', callId: state.callSid!, text: custResult.output });
          state.fullTranscript += '\nCUSTOMER: ' + custResult.output;
        } else {
          console.log('[MediaStream] Customer transcript dropped by sanitizer (interrupted):', JSON.stringify(rawText.slice(0, 60)));
        }
        state.customerBuffer = '';
        if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null; }
      }

      if (!state.agentBuffer) broadcastUiSync({ type: 'AGENT_SPEAKING', callId: state.callSid!, value: true });
      state.agentBuffer = joinTranscriptChunk(state.agentBuffer, outText);
    }

    // Turn complete logic
    if (turnComplete) {
      if (state.agentBuffer.trim()) {
        const agentText = state.agentBuffer.trim();
        broadcastUiSync({ type: 'AGENT_TURN', callId: state.callSid!, text: agentText });
        broadcastUiSync({ type: 'AGENT_SPEAKING', callId: state.callSid!, value: false });
        state.agentBuffer = '';
        state.fullTranscript += '\nAGENT: ' + agentText;

        // Helper to parse quantity
        function parseQuantity(text: string): number | null {
          if (text.match(/एक|one/i) && !text.match(/एकर/i)) return 1;
          if (text.match(/दोन|two/i)) return 2;
          if (text.match(/तीन|three/i)) return 3;
          if (text.match(/चार|four/i)) return 4;
          if (text.match(/पाच|five/i)) return 5;
          const num = text.match(/(\d+)/);
          return num ? parseInt(num[1]) : null;
        }

        // Real-time order tracking (FIX 2: Multi-product support)
        // Only update if order is not locked (SMS not sent yet)
        if (!state.locked && agentText.includes('पिशव्या')) {
          // Use a loop to find ALL product mentions in the agent's definition
          // e.g. "Nitrogen Booster दोन पिशव्या, NPK 19-19-19 तीन पिशव्या"
          const productRegex = /(.*?)(?:\s*[-–]\s*|\s+)(\d+|एक|दोन|तीन|चार|पाच)\s*पिशव/g;

          // Since regex in JS doesn't support overlapping matches nicely for the first part, 
          // we split logic: match the pattern (Product)... (Quantity) पिशव्या

          // Let's use a simpler approach: extract all chunks that look like products

          // Regex to capture (Product Name) + (Quantity)
          // Look for pattern: <words> <number> पिशव्या
          // We iterate over the string finding matches

          const pendingProducts: { name: string, qty: number }[] = [];

          // Match 1: "Mahadhan Nitrogen Booster दोन पिशव्या"
          // We can use the regex from before but in a global loop manually

          // Better logic: Split by comma or 'आणि' (and) then parse each chunk
          const chunks = agentText.split(/,|आणि|\+/);

          for (const chunk of chunks) {
            const qty = parseQuantity(chunk);
            if (qty !== null && chunk.includes('पिशव')) {
              // Extract product name from this chunk
              // Remove quantity and 'पिशव्या'
              let cleanName = chunk.replace(/(\d+|एक|दोन|तीन|चार|पाच)\s*पिशव.*/, '').trim();
              cleanName = cleanName.replace(/^(ठीक|ठीक\s*\.|ठीक\s*आहे|बरोबर|हो|okay|ok)[.\s]*/gi, '').trim();
              cleanName = cleanName.replace(/AGENT:|बरोबर|आहे|का|order|confirmed/gi, '').trim();

              if (cleanName.length > 2) {
                pendingProducts.push({ name: cleanName, qty });
              }
            }
          }

          for (const item of pendingProducts) {
            if (state.callSid) {
              // FIX 3: Canonical name resolution
              const canonical = findProduct(item.name);
              const finalName = canonical ? canonical.name : item.name;
              updateContextItems(state.callSid, finalName, item.qty);
            }
          }
        }

        // Auto-send SMS
        if (!state.locked && isSmsLine(agentText)) {
          lockOrder(agentText);
        }

        if (state.callSid && !state.hangupScheduled && isAgentClosingLine(agentText)) {
          state.pendingFinalAudio = true;
          console.log('[MediaStream] [Agent] Final closing detected');
        }
      }
    }

    // Audio handling
    if (base64Audio && ws.readyState === 1 && state.streamSid) {
      stopHoldLoop(state);
      const pcm24 = Buffer.from(base64Audio, 'base64');
      const pcm8 = resample(pcm24, 24000, 8000);
      const mulaw = pcmToMulaw(pcm8);

      for (let i = 0; i < mulaw.length; i += FRAME_SIZE) {
        const frame = mulaw.subarray(i, i + FRAME_SIZE);
        if (frame.length === 0) continue;
        ws.send(JSON.stringify({
          event: 'playAudio',
          media: {
            contentType: 'audio/x-mulaw',
            sampleRate: 8000,
            payload: frame.toString('base64'),
          },
        }));
      }

      if (state.pendingFinalAudio && state.callSid && !state.hangupScheduled) {
        scheduleHangup(state.callSid);
      }
    } else if (state.pendingFinalAudio && state.callSid && !state.hangupScheduled && turnComplete) {
      scheduleHangup(state.callSid);
    }
  }

  function flushInboundAudio() {
    if (state.inboundFlushTimer) {
      clearTimeout(state.inboundFlushTimer);
      state.inboundFlushTimer = null;
    }

    if (!state.geminiSession || !state.allowSendToGemini || state.inboundAudioChunks.length === 0) {
      state.inboundAudioChunks = [];
      return;
    }

    const combinedMulaw = Buffer.concat(state.inboundAudioChunks);
    state.inboundAudioChunks = [];

    const pcm8 = mulawToPcm(combinedMulaw);
    const gatedPcm8 = applyNoiseGate(pcm8, NOISE_GATE_THRESHOLD);
    const pcm16 = resample(gatedPcm8, 8000, 16000);
    state.geminiSession.sendRealtimeInput?.({
      media: {
        data: pcm16.toString('base64'),
        mimeType: 'audio/pcm;rate=16000'
      }
    });
  }

  function scheduleHangup(sid: string) {
    state.pendingFinalAudio = false;
    state.hangupScheduled = true;
    setTimeout(() => {
      hangUpCall(sid).then(() => console.log('[MediaStream] Call ended:', sid)).catch(e => console.error('Hangup failed', e));
    }, 1000);
  }

  function lockOrder(agentText: string) {
    if (state.smsSent || state.locked || !state.callSid || !state.context) return;
    state.locked = true; // Lock items from changing
    console.log('[MediaStream] Order locked, will send SMS at call end');
  }

  async function sendFinalSms() {
    if (state.smsSent || !state.callSid || !state.context) return;
    const ctx = state.context;
    // IMPORTANT: Re-read context to get latest items updated in this turn
    // (Though ctx is a reference, the items Map inside might have been updated)

    // Safety: ensure we rely on the map in memory which updateContextItems modifies
    const sessionItems = ctx.items || new Map();
    if (sessionItems.size === 0 && ctx.lastProduct) {
      sessionItems.set(ctx.lastProduct, 1);
    }
    if (sessionItems.size === 0) return;

    state.smsSent = true;

    const orderItems = Array.from(sessionItems.entries()).map(([p, q]) => ({
      product: p, quantity: q, price: getProductPrice(p)
    }));

    // Log items for debugging
    console.log('[MediaStream] Final SMS Items:', JSON.stringify(orderItems));

    const totalAmount = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    let village = '', taluka = '', pincode = '';
    const lines = state.fullTranscript.split('\n');
    for (const l of lines) {
      if (l.includes('AGENT:')) {
        if (l.includes('पत्ता:')) {
          const pinMatch = l.match(/(\d{6})/);
          if (pinMatch) pincode = pinMatch[1];
          const villageMatch = l.match(/पत्ता:\s*(.+?)(?:,|\s*तालुका)/i);
          if (villageMatch) village = cleanAddressField(villageMatch[1]);
          const talukaMatch = l.match(/तालुका\s+(.+?)(?:\s*[-–]|,|\s*\d{6}|\s*\.|\s*हे)/i);
          if (talukaMatch) taluka = cleanAddressField(talukaMatch[1]);
        }
        
        if (!pincode) {
          const pinMatch = l.match(/(\d{6})/);
          if (pinMatch) pincode = pinMatch[1];
        }
        if (!taluka) {
          const talukaMatch = l.match(/तालुका\s+([^\s,]+)/i);
          if (talukaMatch) taluka = cleanAddressField(talukaMatch[1]);
        }
        if (!village && taluka) {
          const villageMatch = l.match(/([^\s,]+(?:\s+खुर्द|बुद्रुक)?)\s*,\s*तालुका/i);
          if (villageMatch) village = cleanAddressField(villageMatch[1]);
        }
      }
    }

    console.log('[MediaStream] Sending SMS:', JSON.stringify(orderItems));
    if (orderItems.length > 0) { // Changed check to check orderItems length
      // Lock the order to prevent changes
      state.locked = true;
      state.smsSent = true;

      try {
        const order = saveOrder({
          customerName: ctx.customerName || 'शेतकरी',
          phone: ctx.phone,
          items: orderItems,
          totalAmount,
          address: village || '',
          village: village || '',
          taluka: taluka || '',
          pincode: pincode || '',
          paymentStatus: 'pending',
        });
        sendOrderSms({
          customerName: ctx.customerName || 'शेतकरी',
          phone: ctx.phone,
          items: orderItems,
          totalAmount,
          address: village,
          village,
          taluka,
          pinCode: pincode,
          orderId: order.orderId,
        })
          .then(r => console.log('[SMS] Sent', r))
          .catch(e => {
            console.error('[SMS] Send failed, unlocking for retry:', e);
            state.smsSent = false;
            state.locked = false;
          });
      } catch (e) {
        console.error('[SMS] Error', e);
        state.smsSent = false;
        state.locked = false; // Unlock if failed
      }
    }
  }

  // --- WebSocket Events ---
  ws.on('message', (raw: Buffer | string) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.event === 'start') {
        const sid = msg.start?.streamSid || msg.start?.streamId || msg.streamSid || msg.streamId;
        if (sid) {
          state.streamSid = sid;
          if (!state.silenceSent) { startHoldLoop(ws, sid, state); state.silenceSent = true; }
        }
        const callSid = msg.start?.callSid || msg.start?.callUuid || msg.start?.callUUID || msg.callSid || msg.callUuid || msg.callUUID;
        if (!state.callSid && callSid) {
          state.callSid = callSid;
          state.context = getCallContext(callSid);
        }
        if (callSid) { initGemini(); }
      } else if (msg.event === 'media' && msg.media?.payload) {
        if (state.geminiSession && state.allowSendToGemini) {
          state.inboundAudioChunks.push(Buffer.from(msg.media.payload, 'base64'));
          if (state.inboundAudioChunks.length >= MAX_INBOUND_AUDIO_FRAMES) {
            flushInboundAudio();
          } else if (!state.inboundFlushTimer) {
            state.inboundFlushTimer = setTimeout(flushInboundAudio, INBOUND_AUDIO_BATCH_MS);
          }
        }
      } else if (msg.event === 'stop') {
        console.log('[MediaStream] Stop event');
        sendFinalSms();
        flushInboundAudio();
        state.geminiSession = null;
        stopHoldLoop(state);
      }
    } catch (e) { console.error('[MediaStream] WS error', e); }
  });

  ws.on('close', () => {
    console.log('[MediaStream] Client disconnected');
    sendFinalSms();
    flushInboundAudio();
    state.geminiSession = null;
    stopHoldLoop(state);
    if (state.inboundFlushTimer) {
      clearTimeout(state.inboundFlushTimer);
      state.inboundFlushTimer = null;
    }
  });

  if (state.callSid) initGemini();
}
