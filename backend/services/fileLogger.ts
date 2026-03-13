/**
 * File Logger — Writes all runtime logs to logs/logs.txt
 * Captures console.log, console.warn, console.error output.
 * Auto-creates logs directory if missing.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const logsDir = path.join(root, 'logs');
const logFile = path.join(logsDir, 'logs.txt');

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Clear old logs on startup and write header
fs.writeFileSync(logFile, `# Deepak Fertilisers AI Agent — Runtime Logs\n# Started: ${new Date().toISOString()}\n${'─'.repeat(60)}\n\n`);

/**
 * Append a log line to logs/logs.txt with timestamp.
 */
function writeToFile(level: string, ...args: any[]): void {
    const ts = new Date().toISOString();
    const msg = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a, null, 2); }
        catch { return String(a); }
    }).join(' ');
    const line = `[${ts}] [${level}] ${msg}\n`;
    try {
        fs.appendFileSync(logFile, line);
    } catch {
        // Silently fail if file write errors
    }
}

// Store original console methods
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

/**
 * Override console.log/warn/error to also write to logs/logs.txt.
 * Call this once at server startup.
 */
export function initFileLogger(): void {
    console.log = (...args: any[]) => {
        originalLog.apply(console, args);
        writeToFile('INFO', ...args);
    };

    console.warn = (...args: any[]) => {
        originalWarn.apply(console, args);
        writeToFile('WARN', ...args);
    };

    console.error = (...args: any[]) => {
        originalError.apply(console, args);
        writeToFile('ERROR', ...args);
    };

    console.log('File logger initialized → logs/logs.txt');
}

/**
 * Get the absolute path to the log file.
 */
export function getLogFilePath(): string {
    return logFile;
}
