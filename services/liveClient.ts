import { GoogleGenAI, LiveServerMessage, Modality, EndSensitivity } from '@google/genai';
import { Language, AgentGender } from '../types';
import { getSystemInstruction } from './conversationEngine';
import { base64ToBytes, createPcmBlob, decodeAudioData } from './audioUtils';
import { sanitizeTranscript } from './transcriptSanitizer';
import { log } from './logger';

export interface LiveClientConfig {
  language: Language;
  /** Farmer name; used in greeting e.g. "नमस्कार मयूरजी" */
  customerName?: string;
  /** Agent persona: female = Ankita (voice: Kore), male = Omkar (voice: Puck). */
  agentGender?: AgentGender;
  /** Last product purchased by farmer (e.g. NPK 19-19-19) */
  lastProduct?: string;
  onTranscript: (text: string, source: 'user' | 'model', isFinal: boolean) => void;
  onVolumeUpdate: (inputVol: number, outputVol: number) => void;
  onClose: () => void;
  onError: (error: Error) => void;
}

export class LiveClient {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private analyzerInput: AnalyserNode | null = null;
  private analyzerOutput: AnalyserNode | null = null;
  private nextStartTime = 0;
  private session: any = null; // Type as 'any' or specific session type if available
  private config: LiveClientConfig;
  private stream: MediaStream | null = null;
  private volumeInterval: number | null = null;
  /** Outbound guard: do not send customer audio until agent has spoken first (or fallback timeout). */
  private allowSendAudio = false;
  private outboundGuardTimer: ReturnType<typeof setTimeout> | null = null;
  private firstAgentTurnReceived = false;
  /** Buffer transcript by turn so we emit one bubble per sentence/turn, not per token. */
  private agentBuffer = '';
  private customerBuffer = '';
  /** Response timeout: if customer speaks but agent doesn't respond within 8s, auto-disconnect */
  private responseTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private customerAudioSent = false;
  private lastAgentResponseTime = 0;

  constructor(config: LiveClientConfig) {
    this.config = config;
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  public async connect() {
    try {
      // Initialize Audio Contexts
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      // CRITICAL: Resume audio contexts immediately (browsers suspend them until user interaction)
      await this.inputAudioContext.resume();
      await this.outputAudioContext.resume();

      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      // Analyzers for visualization
      this.analyzerInput = this.inputAudioContext.createAnalyser();
      this.analyzerInput.fftSize = 256;
      this.analyzerOutput = this.outputAudioContext.createAnalyser();
      this.analyzerOutput.fftSize = 256;
      this.outputNode.connect(this.analyzerOutput);

      this.startVolumeMonitoring();

      // Get Microphone Stream – constraints for clearer speech (better ASR accuracy)
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: { ideal: 16000 },
          },
        });
      } catch (micError: any) {
        // Microphone permission denied or not available
        const errMsg = micError?.name === 'NotAllowedError'
          ? 'Microphone permission denied. Please allow microphone access to make calls.'
          : 'Microphone not available. Please check your device and try again.';
        log(`Microphone error: ${errMsg}`);
        this.config.onError(new Error(errMsg));
        throw micError;
      }

      const systemInstruction = getSystemInstruction(this.config.language, this.config.customerName, this.config.lastProduct, this.config.agentGender);
      // Select voice: female agent = Kore (Ankita), male agent = Puck (Omkar)
      const voiceName = this.config.agentGender === 'male' ? 'Puck' : 'Kore';
      log(`Call connecting (farmer: ${this.config.customerName ?? '—'}, lastProduct: ${this.config.lastProduct ?? 'NPK 19-19-19'}, agentVoice: ${voiceName})`);

      const sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log("Live Client: Connection Opened");
            this.allowSendAudio = false;
            this.firstAgentTurnReceived = false;
            // Enable sending after first agent speech, or after 5s fallback so call can continue
            this.outboundGuardTimer = setTimeout(() => {
              if (!this.firstAgentTurnReceived) {
                this.allowSendAudio = true;
                log('Outbound guard: fallback 5s — enabling customer audio');
              }
              this.outboundGuardTimer = null;
            }, 5000);
            this.startAudioInput(sessionPromise);
          },
          onmessage: (message: LiveServerMessage) => this.handleMessage(message),
          onclose: (e) => {
            console.log("Live Client: Connection Closed", e);
            log('Call disconnected');
            this.config.onClose();
          },
          onerror: (e) => {
            console.error("Live Client: Error", e);
            log(`Error: ${e?.message ?? 'Connection error'}`);
            this.config.onError(new Error("Connection error"));
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } }
          },
          systemInstruction: systemInstruction,
          // Lower latency: end-of-speech after 300ms silence; high sensitivity = respond sooner
          realtimeInputConfig: {
            automaticActivityDetection: {
              silenceDurationMs: 200,
              prefixPaddingMs: 0,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            },
          },
          // Disable thinking for faster first token (model-dependent)
          thinkingConfig: { thinkingBudget: 0 },
          temperature: 0.8,
        }
      });

      this.session = await sessionPromise;

      // CRITICAL: Force agent to speak first immediately — do not wait for customer audio
      try {
        this.session.sendClientContent?.({
          turns: [{
            role: 'user',
            parts: [{ text: 'कॉल कनेक्ट झाला आहे. आता तुझं मराठी ग्रीटिंग लगेच सांग. ग्राहकाची वाट पाहू नको.' }]
          }],
          turnComplete: true,
        });
        log('Greeting trigger sent — agent should speak first immediately');
      } catch (triggerErr: any) {
        console.warn('sendClientContent trigger failed:', triggerErr?.message);
      }

      log('Call connected');
    } catch (error: any) {
      console.error("Failed to connect:", error);
      log(`Connect failed: ${error?.message ?? error}`);
      this.config.onError(error);
      this.disconnect();
    }
  }

  private startAudioInput(sessionPromise: Promise<any>) {
    if (!this.inputAudioContext || !this.stream) return;

    this.inputSource = this.inputAudioContext.createMediaStreamSource(this.stream);
    this.inputSource.connect(this.analyzerInput!);

    // Use ScriptProcessor for raw PCM – 2048 = ~128ms chunks (lower latency than 4096)
    this.processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.allowSendAudio) return;
      const inputData = e.inputBuffer.getChannelData(0);
      // Check if significant audio is being sent (peaks above noise floor)
      const peak = Math.max(...Array.from(inputData).map(Math.abs));
      if (peak > 0.01) { // Significant audio detected
        if (!this.customerAudioSent) {
          this.customerAudioSent = true;
          // Start response timeout when customer first sends audio
          this.startResponseTimeout();
        }
      }
      const pcmBlob = createPcmBlob(inputData);
      sessionPromise.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private startResponseTimeout() {
    // Clear any existing timeout
    if (this.responseTimeoutTimer) clearTimeout(this.responseTimeoutTimer);

    // Use generous timeout — Gemini can pause during streaming, don't kill the session
    const timeoutDuration = 30000; // 30 seconds

    this.responseTimeoutTimer = setTimeout(() => {
      const timeSinceLastResponse = Date.now() - this.lastAgentResponseTime;
      if (timeSinceLastResponse > timeoutDuration) {
        log(`WARN: Agent has not responded for ${timeoutDuration / 1000}s — connection may be stuck`);
        // Only warn, do NOT auto-disconnect. Let the user end the call manually if needed.
        // Gemini streaming can have natural pauses; killing the session causes a worse UX.
      }
    }, timeoutDuration);
  }

  private async handleMessage(message: LiveServerMessage) {
    // First agent turn: enable customer audio so agent has spoken first
    if (message.serverContent?.modelTurn && !this.firstAgentTurnReceived) {
      this.firstAgentTurnReceived = true;
      this.allowSendAudio = true;
      if (this.outboundGuardTimer) {
        clearTimeout(this.outboundGuardTimer);
        this.outboundGuardTimer = null;
      }
      log('Outbound guard: agent spoke first — enabling customer audio');
    }

    // Agent responded - reset response timeout
    if (message.serverContent?.modelTurn) {
      this.lastAgentResponseTime = Date.now();
      if (this.responseTimeoutTimer) {
        clearTimeout(this.responseTimeoutTimer);
        this.responseTimeoutTimer = null;
      }
      this.customerAudioSent = false; // Reset for next turn
    }

    // Handle Audio Output
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && this.outputAudioContext && this.outputNode) {
      this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);

      const audioBuffer = await decodeAudioData(
        base64ToBytes(base64Audio),
        this.outputAudioContext,
        24000,
        1
      );

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputNode);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    }

    // Buffer transcript by turn: emit exactly one bubble per turn (only on turnComplete, never per chunk)
    const outText = message.serverContent?.outputTranscription?.text;
    const inText = message.serverContent?.inputTranscription?.text;
    const turnComplete = !!message.serverContent?.turnComplete;

    if (inText) this.customerBuffer += inText;
    if (outText) {
      if (this.customerBuffer.trim()) {
        const custResult = sanitizeTranscript(this.customerBuffer.trim());
        if (custResult.output) {
          this.config.onTranscript(custResult.output, 'user', true);
        }
        this.customerBuffer = '';
      }
      this.agentBuffer += outText;
    }
    if (turnComplete) {
      if (this.agentBuffer.trim()) {
        this.config.onTranscript(this.agentBuffer.trim(), 'model', true);
        this.agentBuffer = '';
      }
      if (this.customerBuffer.trim()) {
        const custFlush = sanitizeTranscript(this.customerBuffer.trim());
        if (custFlush.output) {
          this.config.onTranscript(custFlush.output, 'user', true);
        }
        this.customerBuffer = '';
      }
    }
  }

  private startVolumeMonitoring() {
    this.volumeInterval = window.setInterval(() => {
      if (!this.analyzerInput || !this.analyzerOutput) return;

      const inputData = new Uint8Array(this.analyzerInput.frequencyBinCount);
      this.analyzerInput.getByteFrequencyData(inputData);
      const inputVol = inputData.reduce((a, b) => a + b) / inputData.length;

      const outputData = new Uint8Array(this.analyzerOutput.frequencyBinCount);
      this.analyzerOutput.getByteFrequencyData(outputData);
      const outputVol = outputData.reduce((a, b) => a + b) / outputData.length;

      this.config.onVolumeUpdate(inputVol, outputVol);
    }, 50);
  }

  public disconnect() {
    if (this.session) {
      // Session cleanup
    }

    if (this.inputSource) this.inputSource.disconnect();
    if (this.processor) this.processor.disconnect();
    if (this.outputNode) this.outputNode.disconnect();

    this.inputAudioContext?.close();
    this.outputAudioContext?.close();

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    if (this.volumeInterval) clearInterval(this.volumeInterval);
    if (this.outboundGuardTimer) clearTimeout(this.outboundGuardTimer);
    if (this.responseTimeoutTimer) clearTimeout(this.responseTimeoutTimer);

    this.allowSendAudio = false;
    this.outboundGuardTimer = null;
    this.responseTimeoutTimer = null;
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.session = null;
    this.nextStartTime = 0;
  }
}
