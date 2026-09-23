import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-checkout-failure',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './checkout-failure.component.html',
  styleUrl: './checkout-failure.component.css',
})
export class CheckoutFailureComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  errorMessage = 'تم رفض المعاملة من قِبل البنك المصدر أو تم إلغاء العملية.';
  paymentId = '';
  planId = '';

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const rawReason = params.get('message') || params.get('error') || params.get('data.message');
      if (rawReason) {
        this.errorMessage = this.mapErrorMessage(rawReason);
      }
      this.paymentId = params.get('paymentId') || params.get('id') || '';
      this.planId = params.get('planId') || '';
    });
  }

  private mapErrorMessage(reason: string): string {
    const lower = reason.toLowerCase();
    if (lower.includes('insufficient_funds') || lower.includes('balance')) {
      return 'رصيد البطاقة أو المحفظة غير كافٍ لإتمام العملية.';
    }
    if (lower.includes('declined') || lower.includes('rejected')) {
      return 'تم رفض العملية من قِبل البنك المصدر للبطاقة.';
    }
    if (lower.includes('expired_card')) {
      return 'البطاقة المستخدمة منتهية الصلاحية.';
    }
    if (lower.includes('cancelled') || lower.includes('canceled')) {
      return 'تم إلغاء عملية الدفع من قبل المستخدم.';
    }
    if (lower.includes('timeout')) {
      return 'انتهت المهلة المحددة للدفع، يرجى المحاولة مجدداً.';
    }
    return reason;
  }
}
