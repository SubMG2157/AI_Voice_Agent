import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionState, Language, TranscriptItem, AgentGender } from './types';
import { LiveClient } from './services/liveClient';
import Visualizer from './components/Visualizer';
import { getLogs, downloadLogs, log } from './services/logger';
import { normalizeGreetingForDisplay } from './services/transcriptDisplay';
import { exportTranscriptCSV, exportTranscriptPDF } from './services/transcriptExport';
import { sanitizeTranscript } from './services/transcriptSanitizer';

const getApiBase = () => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) return envUrl;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3001';
};

const API_BASE = getApiBase();
const WS_BASE = API_BASE.replace(/^http/, 'ws').replace(/^https/, 'wss');

const PRODUCT_OPTIONS = [
  'NPK 19-19-19',
  'NPK 00-52-34',
  'NPK 13-00-45',
  'Mahadhan Smartek',
  'Mahadhan Nitrogen Booster',
] as const;

const AGENT_GENDER_OPTIONS: { value: AgentGender; label: string }[] = [
  { value: 'female', label: 'Ankita (Female)' },
  { value: 'male', label: 'Omkar (Male)' },
];

export type CallMode = 'demo' | 'phone';
export type PhoneCallStatus = 'IDLE' | 'DIALING' | 'RINGING' | 'CONNECTED' | 'IN_PROGRESS' | 'CALLBACK_SCHEDULED' | 'ENDED' | 'FAILED';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [language] = useState<Language>(Language.MARATHI);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [volumes, setVolumes] = useState({ input: 0, output: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [callMode, setCallMode] = useState<CallMode>('demo');
  const [phoneCallStatus, setPhoneCallStatus] = useState<PhoneCallStatus>('IDLE');
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  // Farmer details — editable when not on a call
  const [customerName, setCustomerName] = useState('Mayur');
  const [customerPhone, setCustomerPhone] = useState('+91 9975711324');
  const [lastProduct, setLastProduct] = useState<string>(PRODUCT_OPTIONS[0]);
  const [village, setVillage] = useState('');
  const [agentGenderSelection, setAgentGenderSelection] = useState<AgentGender>('male');

  const isCallActive = connectionState === 'connected' || connectionState === 'connecting' ||
    ['DIALING', 'RINGING', 'CONNECTED', 'IN_PROGRESS'].includes(phoneCallStatus);

  const clientRef = useRef<LiveClient | null>(null);
  const wsUiSyncRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logRefresh, setLogRefresh] = useState(0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  const handleTranscript = useCallback((text: string, source: 'user' | 'model', isFinal: boolean) => {
    if (!text.trim()) return;
    setTranscripts(prev => {
      // Only render FINAL (complete) transcripts — ignore partial streaming chunks
      // This prevents fragmented bubbles like "नमस्कार Mayur" appearing separately
      if (!isFinal) return prev; // Skip partial chunks entirely
      return [...prev, { id: Date.now().toString(), source, text: text.trim(), timestamp: new Date() }];
    });
  }, []);

  const handleVolume = useCallback((input: number, output: number) => {
    setVolumes({ input, output });
  }, []);

  const handleConnect = async () => {
    if (callMode === 'phone') {
      if (connectionState === 'connected' || connectionState === 'connecting' || phoneCallStatus === 'IN_PROGRESS' || phoneCallStatus === 'CONNECTED' || phoneCallStatus === 'RINGING' || phoneCallStatus === 'DIALING') {
        setConnectionState('disconnected');
        setPhoneCallStatus('ENDED');
        setActiveCallId(null);
        setLogRefresh((n) => n + 1);
        return;
      }
      setConnectionState('connecting');
      setErrorMsg(null);
      setTranscripts([]);
      setPhoneCallStatus('DIALING');
      try {
        const res = await fetch(`${API_BASE}/api/call`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: customerPhone.replace(/\s/g, ''),
            name: customerName.trim() || 'Farmer',
            lastProduct,
            language,
            agentGender: agentGenderSelection,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to start call');
        setActiveCallId(data.callId ?? null);
        setConnectionState('connected');
        setPhoneCallStatus('RINGING');
        log(`Phone call initiated: ${data.callId}`);
      } catch (err: any) {
        setErrorMsg(err?.message ?? 'Failed to start call');
        setConnectionState('error');
        setPhoneCallStatus('FAILED');
        log(`Phone call failed: ${err?.message}`);
      }
      setLogRefresh((n) => n + 1);
      return;
    }

    // Demo: browser mic + Gemini Live
    if (connectionState === 'connected' || connectionState === 'connecting') {
      clientRef.current?.disconnect();
      setConnectionState('disconnected');
      setVolumes({ input: 0, output: 0 });
      log('Call ended by user');
      setLogRefresh((n) => n + 1);
      return;
    }

    setConnectionState('connecting');
    setErrorMsg(null);
    setTranscripts([]);

    const client = new LiveClient({
      language,
      customerName: customerName.trim() || 'Farmer',
      agentGender: agentGenderSelection,
      lastProduct,
      onTranscript: handleTranscript,
      onVolumeUpdate: handleVolume,
      onClose: () => {
        setConnectionState('disconnected');
        setLogRefresh((n) => n + 1);
      },
      onError: (err) => {
        setErrorMsg(err.message);
        setConnectionState('error');
        setLogRefresh((n) => n + 1);
      }
    });

    clientRef.current = client;
    await client.connect();
    setConnectionState('connected');
    setLogRefresh((n) => n + 1);
  };

  const activeCallIdRef = useRef<string | null>(null);
  activeCallIdRef.current = activeCallId;

  // UI-sync WebSocket: only connect when we have an active call
  useEffect(() => {
    if (callMode !== 'phone' || !activeCallId) return;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const maxRetries = 3;
    let retries = 0;

    const connect = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(`${WS_BASE}/ui-sync`);
      } catch {
        if (!cancelled && retries < maxRetries) {
          retries += 1;
          retryTimer = setTimeout(connect, 1500);
        }
        return;
      }
      ws.onopen = () => {
        retries = 0;
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const currentCallId = activeCallIdRef.current;
          if (!currentCallId || msg.callId !== currentCallId) return;
          if (msg.type === 'AGENT_TURN' || msg.type === 'CUSTOMER_TURN') {
            const source = msg.type === 'AGENT_TURN' ? 'model' : 'user';
            let text = (msg.text ?? '').trim();
            if (source === 'user' && text) {
              const result = sanitizeTranscript(text, {
                preferDevanagari: true,
                dropIsolatedLatinWords: true,
                dropUnclear: true,
                applyTelephonyCorrections: true,
              });
              text = result.output ?? '';
            }
            if (text) {
              setTranscripts(prev => [...prev, {
                id: crypto.randomUUID?.() ?? Date.now().toString(),
                source,
                text,
                timestamp: new Date()
              }]);
            }
          }
          if (msg.type === 'AGENT_SPEAKING') {
            setAgentSpeaking(!!msg.value);
          }
          if (msg.type === 'CALL_STATUS') {
            setPhoneCallStatus((msg.status as PhoneCallStatus) ?? 'IDLE');
            if (msg.status === 'ENDED' || msg.status === 'FAILED') {
              setConnectionState('disconnected');
              setActiveCallId(null);
              setAgentSpeaking(false);
            }
          }
        } catch (_) { }
      };
      ws.onerror = () => { /* retry on close */ };
      ws.onclose = () => {
        wsUiSyncRef.current = null;
        if (!cancelled && retries < maxRetries) {
          retries += 1;
          retryTimer = setTimeout(connect, 1500);
        }
      };
      wsUiSyncRef.current = ws;
    };

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        ws.close();
        wsUiSyncRef.current = null;
      }
    };
  }, [callMode, activeCallId]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      wsUiSyncRef.current?.close();
    };
  }, []);

  const agentDisplayName = agentGenderSelection === 'male' ? 'Omkar' : 'Ankita';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Deepak Fertilisers Dashboard Header */}
      <header className="bg-[#1B5E20] text-white shadow-lg border-b-4 border-[#FDD835]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center font-bold text-[#FDD835] text-lg">
              🌾
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Deepak Fertilisers</h1>
              <p className="text-xs text-white/80">Farmer AI Voice Agent</p>
            </div>
          </div>
          <div className="text-right text-sm">
            <span className="text-white/70">Agri Advisor Dashboard</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Left: Farmer Card + Call Controls */}
          <div className="lg:col-span-1 space-y-4">
            {/* Farmer Card */}
            <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
              <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  🧑‍🌾 Farmer Details
                </h2>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1">Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    disabled={isCallActive}
                    placeholder="e.g. Mayur"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FDD835] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1">Phone</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    disabled={isCallActive}
                    placeholder="e.g. +91 9975711324"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FDD835] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1">Last Product Purchased</label>
                  <select
                    value={lastProduct}
                    onChange={(e) => setLastProduct(e.target.value)}
                    disabled={isCallActive}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-[#FDD835] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2394a3b8'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '1.25rem', paddingRight: '2rem' }}
                  >
                    {PRODUCT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} className="bg-slate-800 text-white">{opt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1">Village</label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    disabled={isCallActive}
                    placeholder="e.g. Vadgaon"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FDD835] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 uppercase tracking-wide mb-1">Agent Voice</label>
                  <div className="flex gap-2">
                    {AGENT_GENDER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAgentGenderSelection(opt.value)}
                        disabled={isCallActive}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${agentGenderSelection === opt.value
                          ? 'bg-[#FDD835] text-slate-900 border-[#FDD835]'
                          : 'bg-slate-800 text-slate-400 border-slate-600 hover:border-slate-500'
                          } disabled:opacity-60 disabled:cursor-not-allowed`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Call Panel */}
            <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-xl p-6 flex flex-col items-center">
              <div className="mb-4">
                <Visualizer
                  inputVolume={volumes.input}
                  outputVolume={volumes.output}
                  isConnected={connectionState === 'connected'}
                />
              </div>

              {/* Demo vs Phone call mode */}
              <div className="mt-3 w-full flex rounded-lg overflow-hidden border border-slate-700">
                <button
                  type="button"
                  onClick={() => { setCallMode('demo'); setPhoneCallStatus('IDLE'); setActiveCallId(null); }}
                  className={`flex-1 py-2 text-xs font-medium ${callMode === 'demo' ? 'bg-[#FDD835] text-slate-900' : 'bg-slate-800 text-slate-400'}`}
                >
                  🎙️ Demo
                </button>
                <button
                  type="button"
                  onClick={() => setCallMode('phone')}
                  className={`flex-1 py-2 text-xs font-medium ${callMode === 'phone' ? 'bg-[#FDD835] text-slate-900' : 'bg-slate-800 text-slate-400'}`}
                >
                  📞 Phone
                </button>
              </div>
              {callMode === 'phone' && phoneCallStatus !== 'IDLE' && phoneCallStatus !== 'ENDED' && phoneCallStatus !== 'FAILED' && (
                <p className="text-xs text-[#FDD835] mt-1">
                  Status: {phoneCallStatus}
                </p>
              )}

              {errorMsg && (
                <div className="mt-3 w-full text-red-400 text-xs px-3 py-2 bg-red-950/30 rounded-lg border border-red-900/50">
                  {errorMsg}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={connectionState === 'connecting'}
                className={`
                  mt-4 w-full py-4 rounded-xl font-bold text-base transition-all duration-300 flex items-center justify-center gap-2
                  ${connectionState === 'connected'
                    ? 'bg-red-600 hover:bg-red-700 text-white border-2 border-red-500'
                    : 'bg-[#1B5E20] hover:bg-[#2E7D32] text-white border-2 border-[#FDD835] hover:border-[#FFEE58]'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {connectionState === 'connecting' ? (
                  <span className="animate-pulse">{callMode === 'phone' ? 'Starting Call...' : 'Connecting...'}</span>
                ) : connectionState === 'connected' ? (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                    End Call
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    🌾 Call Farmer
                  </>
                )}
              </button>
              {callMode === 'demo' && (
                <p className="text-xs text-slate-500 text-center mt-3 px-2">
                  Microphone required. AI agent simulated in browser.
                </p>
              )}

              {/* Logs */}
              <div className="mt-4 w-full border-t border-slate-700 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogs((s) => !s)}
                    className="text-xs font-medium text-slate-400 hover:text-slate-300"
                  >
                    {showLogs ? 'Hide Logs' : 'Show Logs'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { downloadLogs(); setLogRefresh((n) => n + 1); }}
                    className="text-xs font-medium text-[#FDD835] hover:text-[#FFEE58]"
                  >
                    Download Logs
                  </button>
                </div>
                {showLogs && (
                  <div className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-slate-950 border border-slate-700 p-2 text-[10px] font-mono text-slate-400" key={logRefresh}>
                    {getLogs().length === 0 ? (
                      <p className="text-slate-500">No logs yet. Start a call.</p>
                    ) : (
                      getLogs().map((line, i) => <div key={i} className="truncate">{line}</div>)
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Call Transcript */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-xl flex flex-col flex-1 min-h-100">
              <div className="bg-slate-800/80 px-4 py-3 border-b border-slate-700 flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  🎙️ Live Call Transcript
                </h2>
                <div className="flex items-center gap-2">
                  {connectionState === 'connected' && (
                    <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      Call Active
                    </span>
                  )}
                  {transcripts.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => exportTranscriptCSV(transcripts)}
                        className="text-xs font-medium text-slate-400 hover:text-[#FDD835] border border-slate-600 hover:border-[#FDD835] rounded px-2 py-1"
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => exportTranscriptPDF(transcripts)}
                        className="text-xs font-medium text-slate-400 hover:text-[#FDD835] border border-slate-600 hover:border-[#FDD835] rounded px-2 py-1"
                      >
                        PDF
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 min-h-80">
                {agentSpeaking && (
                  <div className="text-sm text-slate-400 italic flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#FDD835] animate-pulse" />
                    {agentDisplayName} is speaking…
                  </div>
                )}
                {transcripts.length === 0 && !agentSpeaking ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3 py-12">
                    <svg className="w-10 h-10 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <p className="text-sm">Call a farmer — conversation will appear here.</p>
                    <p className="text-xs text-slate-600">Greeting → Feedback → Disease Check → Order → Payment</p>
                  </div>
                ) : transcripts.length > 0 ? (
                  transcripts.map((t, i) => (
                    <div
                      key={i}
                      className={`flex ${t.source === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`
                          max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                          ${t.source === 'user'
                            ? 'bg-[#1B5E20] text-white rounded-br-none border border-[#FDD835]/30'
                            : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-600'}
                        `}
                      >
                        <div className="text-[10px] opacity-70 mb-1 uppercase font-bold tracking-wide">
                          {t.source === 'user' ? '🧑‍🌾 Farmer' : `🌾 ${agentDisplayName} (Deepak)`}
                        </div>
                        {t.source === 'user' ? normalizeGreetingForDisplay(t.text) : t.text}
                      </div>
                    </div>
                  ))
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
