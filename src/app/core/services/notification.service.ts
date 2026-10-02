import { Injectable, signal } from '@angular/core';

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private notificationsSignal = signal<ToastNotification[]>([]);
  readonly notifications = this.notificationsSignal.asReadonly();

  show(type: 'success' | 'error' | 'warning' | 'info', message: string, durationMs = 5000): void {
    const id = Math.random().toString(36).substring(2, 9);
    const notification: ToastNotification = { id, type, message };

    this.notificationsSignal.update((list) => [...list, notification]);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }
  }

  success(message: string, durationMs = 4000): void {
    this.show('success', message, durationMs);
  }

  error(message: string, durationMs = 6000): void {
    this.show('error', message, durationMs);
  }

  warning(message: string, durationMs = 5000): void {
    this.show('warning', message, durationMs);
  }

  info(message: string, durationMs = 4000): void {
    this.show('info', message, durationMs);
  }

  dismiss(id: string): void {
    this.notificationsSignal.update((list) => list.filter((n) => n.id !== id));
  }
}
