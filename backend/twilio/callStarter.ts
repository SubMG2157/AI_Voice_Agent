/**
 * Start outbound call via Plivo for Deepak Fertilisers farmer agent.
 * Uses PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_NUMBER.
 */

export interface CallContext {
  customerName: string;
  lastProduct: string;
  language: string;
  /** Agent persona: 'female' = Ankita, 'male' = Omkar. Affects voice + name + verb forms. */
  agentGender?: 'female' | 'male';
}

export interface OutboundCallResult {
  id: string;
  provider: 'plivo';
  raw: unknown;
}

function normalizeToE164Indian(phone: string): string {
  const trimmed = String(phone || '').trim().replace(/\s+/g, '');
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function getPlivoAuthHeader(authId: string, authToken: string): string {
  return `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`;
}

export async function startCall(phone: string, context: CallContext): Promise<OutboundCallResult> {
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  const fromNumber = process.env.PLIVO_NUMBER;
  const baseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3001';

  if (!authId || !authToken || !fromNumber) {
    throw new Error('PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, PLIVO_NUMBER required');
  }

  const to = normalizeToE164Indian(phone);
  const from = normalizeToE164Indian(fromNumber);

  const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Call/`, {
    method: 'POST',
    headers: {
      Authorization: getPlivoAuthHeader(authId, authToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      answer_url: `${baseUrl}/plivo/answer`,
      answer_method: 'POST',
      ring_url: `${baseUrl}/plivo/status`,
      ring_method: 'POST',
      hangup_url: `${baseUrl}/plivo/status`,
      hangup_method: 'POST',
      fallback_url: `${baseUrl}/plivo/answer`,
      fallback_method: 'POST',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errMsg = typeof data?.error === 'string' ? data.error : JSON.stringify(data);
    throw new Error(`Plivo call create failed (${response.status}): ${errMsg}`);
  }

  const id = data?.request_uuid || data?.requestUuid;
  if (!id) {
    throw new Error('Plivo call create response missing request_uuid');
  }

  return {
    id,
    provider: 'plivo',
    raw: data,
  };
}

/** End the call from the server (agent hangs up). Used when conversation is closed. */
export async function hangUpCall(callId: string): Promise<void> {
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  if (!authId || !authToken || !callId) return;

  const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(authId)}/Call/${encodeURIComponent(callId)}/`, {
    method: 'DELETE',
    headers: {
      Authorization: getPlivoAuthHeader(authId, authToken),
    },
  });

  if (!response.ok && response.status !== 204) {
    const body = await response.text().catch(() => '');
    throw new Error(`Plivo hangup failed (${response.status}): ${body}`);
  }
}
