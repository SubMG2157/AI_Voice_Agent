/**
 * In-memory call log; append to file (logs/calls.jsonl) when implemented.
 * Bank-ready structure: phone, segment, language, outcome, callbackTime, attempt, durationSec.
 */

export interface CallLogEntry {
  callId: string;
  status: string;
  durationSec?: number;
  [key: string]: unknown;
}

const inMemoryLog: CallLogEntry[] = [];

export function appendCallLog(entry: CallLogEntry) {
  inMemoryLog.push({ ...entry, ts: new Date().toISOString() });
  console.log('[CallLog]', entry.callId, entry.status, entry.durationSec ?? '');
}

export function getCallLogs(): CallLogEntry[] {
  return [...inMemoryLog];
}
