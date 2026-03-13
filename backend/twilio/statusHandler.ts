/**
 * Provider status callback handler (Plivo-first).
 * - busy / no-answer: mark retry-eligible in logs.
 * - completed: finalize call log.
 */

import { broadcastUiSync } from './mediaStream.js';
import { appendCallLog } from '../logs/callLog.js';

export function handleTwilioStatus(body: Record<string, string>) {
  const callId = body.CallUUID || body.CallSid || body.call_uuid || body.request_uuid || '';
  const rawStatus = (body.CallStatus || body.call_status || '').toLowerCase();
  const mapped = mapStatus(rawStatus);

  if (callId) {
    broadcastUiSync({ type: 'CALL_STATUS', callId, status: mapped });
  }

  if (rawStatus === 'completed') {
    const duration = body.CallDuration ? parseInt(body.CallDuration, 10) : (body.Duration ? parseInt(body.Duration, 10) : 0);
    appendCallLog({
      callId,
      status: 'completed',
      durationSec: duration,
      ...body,
    });
  }

  // Optional: schedule retry on busy/no-answer (would need job queue; placeholder here)
  if (rawStatus === 'busy' || rawStatus === 'no-answer') {
    appendCallLog({
      callId,
      status: rawStatus,
      note: 'Retry eligible (max 2, +30 min) — implement with job queue if needed',
    });
  }
}

function mapStatus(providerStatus: string): string {
  const m: Record<string, string> = {
    queued: 'DIALING',
    ringing: 'RINGING',
    'in-progress': 'IN_PROGRESS',
    initiated: 'DIALING',
    answered: 'IN_PROGRESS',
    completed: 'ENDED',
    busy: 'FAILED',
    'no-answer': 'FAILED',
    failed: 'FAILED',
    canceled: 'ENDED',
  };
  return m[providerStatus] ?? providerStatus;
}
