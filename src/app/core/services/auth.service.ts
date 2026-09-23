import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RegisterPayload {
  clinicName: string;
  name: string;
  fullName?: string;
  email: string;
  password: string;
  phone?: string;
  planId?: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    clinicId?: string;
    role?: string | { id: string; name: string };
  };
  redirectTo?: string;
  requiresOnboarding?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  /**
   * Register a new clinic and manager account.
   * Creates clinic, default branch, 14-day trial subscription, and manager user atomically.
   */
  register(payload: RegisterPayload): Observable<AuthResponse> {
    const body = {
      clinicName: payload.clinicName.trim(),
      name: (payload.name || payload.fullName || '').trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      phone: payload.phone?.trim() || undefined,
      planId: payload.planId || undefined,
    };

    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, body, {
      withCredentials: true,
    });
  }

  /**
   * Cross-Domain SSO Handoff:
   * Redirects user to ERP web application with access token in query param.
   */
  redirectToErp(accessToken: string): void {
    let baseUrl = environment.erpUrl || 'http://localhost:4200/login';

    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `http://localhost:4200${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
    }

    const targetUrl = new URL(baseUrl);

    // ضمان إضافة مسار /login إذا لم يكن موجوداً في الرابط
    if (!targetUrl.pathname.endsWith('/login')) {
      targetUrl.pathname = targetUrl.pathname.replace(/\/$/, '') + '/login';
    }

    targetUrl.searchParams.set('token', accessToken);
    window.location.href = targetUrl.toString();
  }
}
