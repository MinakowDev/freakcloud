import { tauriApi } from '../api/tauri-client';

export type LogLevel = 'error' | 'warn' | 'info';

function formatContext(context?: unknown): string | undefined {
  if (context === undefined || context === null) return undefined;
  if (context instanceof Error) {
    return `${context.name}: ${context.message}\nStack: ${context.stack || 'N/A'}`;
  }
  if (typeof context === 'object') {
    try {
      return JSON.stringify(context);
    } catch {
      return String(context);
    }
  }
  return String(context);
}

class AppLogger {
  public log(level: LogLevel, message: string, context?: unknown): void {
    if (level === 'error') {
      console.error(`[ERROR] ${message}`, context !== undefined ? context : '');
    } else if (level === 'warn') {
      console.warn(`[WARN] ${message}`, context !== undefined ? context : '');
    } else {
      console.info(`[INFO] ${message}`, context !== undefined ? context : '');
    }
    tauriApi.logFrontendError(level, message, formatContext(context)).catch(() => {});
  }

  public info(message: string, context?: unknown): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: unknown): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: unknown): void {
    this.log('error', message, context);
  }
}

export const logger = new AppLogger();

/**
 * Attaches global listeners for unhandled errors and promise rejections
 * to automatically forward critical issues into the rotating log file.
 */
export function setupGlobalErrorLogging(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event: ErrorEvent) => {
    logger.error('Unhandled runtime error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error ? formatContext(event.error) : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    logger.error('Unhandled promise rejection', {
      reason: formatContext(event.reason),
    });
  });

  logger.info('Global error logging initialized');
}
