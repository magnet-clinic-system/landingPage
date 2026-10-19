import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';

import { PaymentService, PaymentResponse } from '../../../core/services/payment.service';
import { paymentKeys } from '../../../core/queries';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-checkout-success',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './checkout-success.component.html',
  styleUrl: './checkout-success.component.css',
})
export class CheckoutSuccessComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly paymentService = inject(PaymentService);

  readonly paymentId = signal<string>('');

  readonly countdown = signal<number>(6);
  readonly isAutoRedirecting = signal<boolean>(true);
  private countdownTimer: any = null;

  // --- TanStack Query for Payment Status ---
  readonly paymentStatusQuery = injectQuery(() => ({
    queryKey: paymentKeys.status(this.paymentId()),
    queryFn: () => lastValueFrom(this.paymentService.getPaymentStatus(this.paymentId())),
    enabled: !!this.paymentId(),
  }));

  readonly paymentDetails = computed<PaymentResponse | null>(() => this.paymentStatusQuery.data() || null);
  readonly loadingDetails = computed<boolean>(() => this.paymentStatusQuery.isPending());

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const id = params.get('paymentId') || params.get('id') || params.get('order') || '';
        this.paymentId.set(id);
      });
  }

  ngOnInit(): void {
    this.startAutoRedirect();
  }

  startAutoRedirect(): void {
    this.isAutoRedirecting.set(true);
    this.countdownTimer = setInterval(() => {
      const current = this.countdown();
      if (current > 1) {
        this.countdown.set(current - 1);
      } else {
        this.stopAutoRedirect();
        this.goToErp();
      }
    }, 1000);
  }

  stopAutoRedirect(): void {
    this.isAutoRedirecting.set(false);
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  goToErp(): void {
    this.stopAutoRedirect();
    const token = this.paymentService.getStoredToken();
    const targetUrl = new URL(environment.erpUrl, window.location.origin);
    if (token) {
      targetUrl.searchParams.set('token', token);
    }
    window.location.href = targetUrl.toString();
  }

  ngOnDestroy(): void {
    this.stopAutoRedirect();
  }
}
