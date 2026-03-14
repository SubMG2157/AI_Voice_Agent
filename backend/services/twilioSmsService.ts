import twilio from 'twilio';
import { formatSmsBody } from './smsFormatter.js';
import type { OrderSmsPayload } from './smsService.js';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_SMS_NUMBER;

export async function sendOrderSmsTwilio(params: OrderSmsPayload): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (!accountSid || !authToken || !twilioNumber) {
    throw new Error('Twilio credentials not configured');
  }

  const client = twilio(accountSid, authToken);

  // Reuse your existing SMS body formatter from smsService.ts
  const body = formatSmsBody(params);

  try {
    const message = await client.messages.create({
      body,
      from: twilioNumber,
      to: params.phone,
    });

    console.log('[Twilio SMS] Sent to', params.phone, ':', message.sid);
    return { success: true, sid: message.sid };
  } catch (err: any) {
    console.error('[Twilio SMS] Failed:', err?.message);
    return { success: false, error: err?.message ?? 'SMS send failed' };
  }
}
