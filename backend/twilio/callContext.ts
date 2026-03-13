/**
 * In-memory store: callSid → context (name, lastProduct, language, phone).
 * Used when Twilio Media Stream connects so we have context for Gemini.
 */

import type { CallContext } from './callStarter.js';

export interface StoredCallContext extends CallContext {
  phone?: string;
  items?: Map<string, number>; // Product name -> Quantity
}

const store = new Map<string, StoredCallContext>();

export function setCallContext(callSid: string, context: StoredCallContext) {
  // Ensure items is initialized if not present
  if (!context.items) {
    context.items = new Map();
  }
  store.set(callSid, context);
}

export function getCallContext(callSid: string): StoredCallContext | undefined {
  return store.get(callSid);
}

export function updateContextItems(callSid: string, product: string, quantity: number) {
  const ctx = store.get(callSid);
  if (ctx) {
    if (!ctx.items) ctx.items = new Map();
    if (quantity > 0) {
      ctx.items.set(product, quantity);
    } else {
      ctx.items.delete(product);
    }
    // Log update for debugging
    console.log(`[CallContext] Updated ${callSid}: ${product} = ${quantity} | Total items: ${ctx.items.size}`);
  }
}

export function deleteCallContext(callSid: string) {
  store.delete(callSid);
}
