/**
 * Conversation Engine — single source of truth for Deepak Fertilisers outbound agent prompts.
 * Used by: web (liveClient.ts) and backend (Twilio + Gemini Live).
 * No duplicate logic, no prompt drift.
 */

import type { Language, AgentGender } from '../types';
import { getEndGreetingForAppLanguage } from '../endGreetings';
import { buildSystemPrompt, getDeveloperPrompt } from './prompts';

/**
 * Build full system instruction for Gemini Live (web or backend).
 * Same prompt for demo (browser) and real calls (Twilio).
 */
export function getSystemInstruction(
  language: Language,
  customerName?: string,
  lastProduct?: string,
  agentGender?: AgentGender
): string {
  const nameForGreeting = customerName?.trim() ? customerName.trim() : 'शेतकरी';
  const product = lastProduct?.trim() ? lastProduct.trim() : 'NPK 19-19-19';
  const closingPhrase = getEndGreetingForAppLanguage('Marathi');
  return buildSystemPrompt(agentGender) + getDeveloperPrompt('Marathi', nameForGreeting, product, closingPhrase, agentGender);
}

export { buildSystemPrompt, getDeveloperPrompt, getAgentName } from './prompts';
