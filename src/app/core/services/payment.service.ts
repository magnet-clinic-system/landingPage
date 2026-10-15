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
  couponCode?: string;
  idempotencyKey?: string;
}

export interface UpgradePlanPayload {
  targetPlanId: string;
  paymentMethod: PaymentMethod;
  phone?: string;
  isYearly?: boolean;
  couponCode?: string;
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

export interface ValidateCouponResponse {
  valid: boolean;
  couponId?: string;
  code: string;
  discountType?: 'PERCENTAGE' | 'FIXED';
  discountValue?: number;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/subscription-payments`;
  private readonly couponApiUrl = `${environment.apiUrl}/subscriptions/coupons`;

  private createHeaders(token?: string | null): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const activeToken = token || this.getStoredToken();
    if (activeToken) {
      headers = headers.set('Authorization', `Bearer ${activeToken}`);
    }
    return headers;
  }

  private inMemoryToken: string | null = null;
  getStoredToken(): string | null {
    return this.inMemoryToken;
  }

  saveStoredToken(token: string, _persist = false): void {
    this.inMemoryToken = token;
  }

  clearStoredToken(): void {
    this.inMemoryToken = null;
  }

  /**
   * Validate coupon code against a specific plan
   */
  validateCoupon(
    code: string,
    planId?: string,
    isYearly = false,
    token?: string | null
  ): Observable<ValidateCouponResponse> {
    const payload = {
      code: code.trim(),
      planId: planId || '',
      isYearly,
    };

    return this.http.post<ValidateCouponResponse>(
      `${this.couponApiUrl}/validate`,
      payload,
      { headers: this.createHeaders(token), withCredentials: true }
    );
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
