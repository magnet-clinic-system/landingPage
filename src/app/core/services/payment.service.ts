import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PaymentMethod = 'CARD' | 'WALLET' | 'FAWRY';

export interface InitiatePaymentPayload {
  planId: string;
  paymentMethod: PaymentMethod;
  phone?: string;
  isYearly?: boolean;
  idempotencyKey?: string;
}

export interface UpgradePlanPayload {
  targetPlanId: string;
  paymentMethod: PaymentMethod;
  phone?: string;
  isYearly?: boolean;
  idempotencyKey?: string;
}

export interface PaymentResponse {
  paymentId: string;
  paymobOrderId?: string | null;
  paymentMethod: string;
  status: string;
  amount: number;
  redirectUrl?: string | null;
  fawryReference?: string | null;
  failureReason?: string | null;
  idempotencyKey: string;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/subscription-payments`;

  private createHeaders(token?: string | null): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const activeToken = token || this.getStoredToken();
    if (activeToken) {
      headers = headers.set('Authorization', `Bearer ${activeToken}`);
    }
    return headers;
  }

  getStoredToken(): string | null {
    try {
      return localStorage.getItem('algor_access_token') || sessionStorage.getItem('algor_access_token');
    } catch {
      return null;
    }
  }

  saveStoredToken(token: string, persist = true): void {
    try {
      if (persist) {
        localStorage.setItem('algor_access_token', token);
      } else {
        sessionStorage.setItem('algor_access_token', token);
      }
    } catch (e) {
      console.warn('Could not store token in browser storage', e);
    }
  }

  clearStoredToken(): void {
    try {
      localStorage.removeItem('algor_access_token');
      sessionStorage.removeItem('algor_access_token');
    } catch (e) {
      console.warn('Could not clear token from browser storage', e);
    }
  }

  /**
   * Initiate subscription payment for registered clinic
   */
  initiatePayment(payload: InitiatePaymentPayload, token?: string | null): Observable<PaymentResponse> {
    const finalPayload: InitiatePaymentPayload = {
      ...payload,
      idempotencyKey: payload.idempotencyKey || `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    return this.http.post<PaymentResponse>(
      `${this.apiUrl}/initiate`,
      finalPayload,
      { headers: this.createHeaders(token), withCredentials: true }
    );
  }

  /**
   * Upgrade subscription plan with prorated credit calculation
   */
  upgradePlan(payload: UpgradePlanPayload, token?: string | null): Observable<PaymentResponse> {
    const finalPayload: UpgradePlanPayload = {
      ...payload,
      idempotencyKey: payload.idempotencyKey || `idemp_up_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    };

    return this.http.post<PaymentResponse>(
      `${this.apiUrl}/upgrade`,
      finalPayload,
      { headers: this.createHeaders(token), withCredentials: true }
    );
  }

  /**
   * Query status of a payment transaction
   */
  getPaymentStatus(paymentId: string, token?: string | null): Observable<PaymentResponse> {
    return this.http.get<PaymentResponse>(
      `${this.apiUrl}/${paymentId}/status`,
      { headers: this.createHeaders(token), withCredentials: true }
    );
  }
}
