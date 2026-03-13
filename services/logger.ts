/** In-memory logger for call events. Use in UI to view/download logs (browser cannot write to logs folder). */
const logLines: { ts: string; msg: string }[] = [];
const MAX_LINES = 500;

export function log(msg: string): void {
  const ts = new Date().toISOString();
  logLines.push({ ts, msg });
  if (logLines.length > MAX_LINES) logLines.shift();
  console.log(`[${ts}] ${msg}`);
}

export function getLogs(): string[] {
  return logLines.map(({ ts, msg }) => `[${ts}] ${msg}`);
}

export function clearLogs(): void {
  logLines.length = 0;
}

export function downloadLogs(): void {
  const text = getLogs().join('\n') || 'No logs yet.';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
