/**
 * Plivo XML response: connect call to bidirectional Media Stream WebSocket.
 * Plivo streams audio to wss://BASE_URL/media?callUuid=... so we can look up context.
 */

export function voiceWebhook(baseUrl: string, callId: string): string {
  const wsScheme = baseUrl.startsWith('https') ? 'wss' : 'ws';
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const streamUrl = `${wsScheme}://${host}/media${callId ? `?callUuid=${encodeURIComponent(callId)}` : ''}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">
    ${streamUrl}
  </Stream>
</Response>`;
}
