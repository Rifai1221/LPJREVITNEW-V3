/**
 * Centralized Application Logger
 * Provides structured logging with levels, module context, and safe error serialization.
 * Replaces silent catch blocks throughout the storage and sync layers.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
  error?: {
    name?: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
}

class Logger {
  private history: LogEntry[] = [];
  private maxHistory = 150;

  private formatError(err: unknown) {
    if (!err) return undefined;
    if (err instanceof Error) {
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: (err as any).code,
      };
    }
    return {
      message: typeof err === 'object' ? JSON.stringify(err) : String(err),
    };
  }

  private log(level: LogLevel, context: string, message: string, data?: any, err?: unknown) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      data,
      error: this.formatError(err),
    };

    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const prefix = `[${entry.timestamp.substring(11, 19)}] [${level.toUpperCase()}] [${context}]`;

    switch (level) {
      case 'error':
        console.error(`${prefix} ${message}`, data ?? '', entry.error ?? '');
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`, data ?? '', entry.error ?? '');
        break;
      case 'info':
        console.info(`${prefix} ${message}`, data ?? '');
        break;
      case 'debug':
        console.debug(`${prefix} ${message}`, data ?? '');
        break;
    }
  }

  debug(context: string, message: string, data?: any) {
    this.log('debug', context, message, data);
  }

  info(context: string, message: string, data?: any) {
    this.log('info', context, message, data);
  }

  warn(context: string, message: string, data?: any, err?: unknown) {
    this.log('warn', context, message, data, err);
  }

  error(context: string, message: string, err?: unknown, data?: any) {
    this.log('error', context, message, data, err);
  }

  getRecentLogs(): LogEntry[] {
    return [...this.history];
  }

  clearLogs() {
    this.history = [];
  }
}

export const logger = new Logger();
