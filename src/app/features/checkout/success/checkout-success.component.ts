import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { PaymentService, PaymentResponse } from '../../../core/services/payment.service';
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

  paymentId = '';
  paymentDetails: PaymentResponse | null = null;
  loadingDetails = false;

  countdown = 6;
  countdownInterval: any;

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.paymentId = params.get('paymentId') || params.get('id') || params.get('order') || '';
      if (this.paymentId) {
        this.fetchDetails(this.paymentId);
      }
    });

    this.startAutoRedirect();
  }

  fetchDetails(id: string): void {
    this.loadingDetails = true;
    this.paymentService.getPaymentStatus(id).subscribe({
      next: (details) => {
        this.paymentDetails = details;
        this.loadingDetails = false;
      },
      error: () => {
        this.loadingDetails = false;
      },
    });
  }

  startAutoRedirect(): void {
    this.countdownInterval = setInterval(() => {
      if (this.countdown > 1) {
        this.countdown--;
      } else {
        this.stopAutoRedirect();
        this.goToErp();
      }
    }, 1000);
  }

  stopAutoRedirect(): void {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
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
