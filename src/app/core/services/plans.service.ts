import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Plan {
  id: string;
  name: string;
  maxUsers: number;
  maxBranches: number;
  maxAiMessages?: number;
  price: number;
  originalPrice?: number | null;
  discountPercentage: number;
  durationDays: number;
  isHot: boolean;
  description?: string | null;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlansService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/plans`;

  private plansCache$?: Observable<Plan[]>;

  /**
   * Fetch all available subscription plans with caching for snappy UI.
   */
  getPlans(forceRefresh = false): Observable<Plan[]> {
    if (!this.plansCache$ || forceRefresh) {
      this.plansCache$ = this.http.get<Plan[]>(this.apiUrl).pipe(
        shareReplay(1)
      );
    }
    return this.plansCache$;
  }

  /**
   * Fetch specific plan by UUID.
   */
  getPlanById(id: string): Observable<Plan> {
    return this.http.get<Plan>(`${this.apiUrl}/${id}`);
  }

  /**
   * Helper to format localized display names for standard plan keys.
   */
  getPlanDisplayName(name: string): { ar: string; en: string } {
    const key = name.toUpperCase();
    if (key.startsWith('TRIAL')) {
      return { ar: 'باقة التجربة المجانية', en: '14-Day Free Trial' };
    }
    if (key.startsWith('BASIC') || key.startsWith('STARTER')) {
      return { ar: 'الأساسية (Starter) — عيادة فردية', en: 'Starter Solo Practice' };
    }
    if (key.startsWith('PRO')) {
      return { ar: 'المتقدمة (Professional) — مجمعات طبية', en: 'Professional Polyclinics' };
    }
    if (key.startsWith('ENTERPRISE')) {
      return { ar: 'المؤسسية (Enterprise) — سلاسل العيادات الكبرى', en: 'Enterprise Network' };
    }
    return { ar: name, en: name };
  }
}
