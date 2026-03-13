/**
 * Bridge: Twilio call ↔ Conversation Engine (same prompts as web).
 * getSystemInstruction from services/conversationEngine — no duplicate logic.
 * Per-call Gemini Live session.
 */

import { getSystemInstruction } from '../services/conversationEngine/index.js';
import type { Language, AgentGender } from '../types.js';
import type { CallContext } from './twilio/callStarter.js';

export interface CallSessionContext extends CallContext {
  callSid: string;
}

export function buildSystemInstruction(context: CallSessionContext): string {
  return getSystemInstruction(
    context.language as Language,
    context.customerName,
    context.lastProduct,
    (context.agentGender ?? 'female') as AgentGender
  );
}

export function getEngineContext(callSid: string, context: CallContext): CallSessionContext {
  return {
    callSid,
    customerName: context.customerName ?? 'शेतकरी',
    lastProduct: context.lastProduct ?? 'NPK 19-19-19',
    language: context.language ?? 'Marathi',
    agentGender: context.agentGender ?? 'female',
  };
}
