import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';
import { NotificationService } from './notification.service';
import { environment } from '../../../environments/environment';

export interface StructuredClientError {
  timestamp: string;
  url: string;
  message: string;
  stack?: string;
  userAgent: string;
}

@Injectable({
  providedIn: 'root',
})
export class GlobalErrorHandler implements ErrorHandler {
  private lastToastTime = 0;
  private readonly toastThrottleMs = 3000;

  constructor(
    private injector: Injector,
    private ngZone: NgZone
  ) {}

  handleError(error: any): void {
    const message = error?.message || (typeof error === 'string' ? error : 'Unknown error');
    const stack = error?.stack || '';

    // 1. ChunkLoadError / Dynamic Import Stale Cache Recovery (SPA Deployment Edge-Case)
    if (this.isChunkLoadingError(message)) {
      this.handleChunkLoadError();
      return;
    }

    // 2. Structured Log Extraction
    const errorPayload: StructuredClientError = {
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      message,
      stack,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };

    // 3. Environment-aware output
    if (!environment.production) {
      console.error('[GlobalErrorHandler Uncaught Exception]:', error);
    } else {
      console.error('[Production Uncaught Error]:', errorPayload.message);
      this.sendToMonitoring(errorPayload);
    }

    // 4. User Notification (Throttled to avoid toast flooding on recursive errors)
    const now = Date.now();
    if (now - this.lastToastTime > this.toastThrottleMs) {
      this.lastToastTime = now;
      this.ngZone.run(() => {
        try {
          const notificationService = this.injector.get(NotificationService);
          const lang =
            typeof document !== 'undefined' && document.documentElement.lang === 'en'
              ? 'en'
              : 'ar';
          const userMessage =
            lang === 'en'
              ? 'An unexpected error occurred. Please refresh or try again.'
              : 'حدث خطأ غير متوقع في النظام. يرجى تحديث الصفحة أو المحاولة لاحقاً.';
          notificationService.error(userMessage);
        } catch {
          // Fallback if NotificationService is unavailable during critical bootstrap teardown
        }
      });
    }
  }

  private isChunkLoadingError(message: string): boolean {
    const chunkRegex =
      /Loading chunk [\d\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i;
    return chunkRegex.test(message);
  }

  private handleChunkLoadError(): void {
    if (typeof window === 'undefined') return;

    const reloadKey = 'algor_saas_chunk_reload_timestamp';
    const lastReload = sessionStorage.getItem(reloadKey);
    const now = Date.now();

    // Prevent reload loops if the asset is genuinely missing (within 15s window)
    if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
      sessionStorage.setItem(reloadKey, String(now));
      console.warn('[GlobalErrorHandler] New application version detected. Refreshing page...');
      window.location.reload();
    } else {
      console.error(
        '[GlobalErrorHandler] Repeated chunk loading failure detected. Check CDN/network.'
      );
    }
  }

  private sendToMonitoring(payload: StructuredClientError): void {
    try {
      if (typeof window !== 'undefined' && (window as any)._errorReportingQueue) {
        (window as any)._errorReportingQueue.push(payload);
      }
    } catch {
      // Ignore monitoring queue errors to prevent cascade
    }
  }
}
