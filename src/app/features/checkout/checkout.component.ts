import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { PlansService, Plan } from '../../core/services/plans.service';
import { PaymentService, PaymentMethod, PaymentResponse } from '../../core/services/payment.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css',
})
export class CheckoutComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly plansService = inject(PlansService);
  private readonly paymentService = inject(PaymentService);
  private readonly authService = inject(AuthService);

  readonly loginUrl = environment.erpUrl;

  selectedPlan: Plan | null = null;
  loadingPlan = true;
  planId = '';
  isYearly = false;

  selectedPaymentMethod: PaymentMethod = 'CARD';
  walletForm: FormGroup;
  quickRegisterForm: FormGroup;

  isAuthenticated = false;
  userToken: string | null = null;

  isProcessing = false;
  errorMessage: string | null = null;

  // Iframe modal for Paymob card payment
  showIframeModal = false;
  safeIframeUrl: SafeResourceUrl | null = null;
  rawRedirectUrl: string | null = null;

  // Fawry Reference Code display
  fawryCode: string | null = null;
  fawryCopied = false;

  constructor() {
    this.walletForm = this.fb.group({
      phone: ['', [Validators.required, Validators.pattern(/^(010|011|012|015)[0-9]{8}$/)]],
    });

    this.quickRegisterForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      clinicName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(/^(\+?[0-9]{7,15})?$/)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const queryPlanId = params.get('planId');
        const cycle = params.get('billingCycle');
        const token = params.get('token');

        if (token) {
          this.userToken = token;
          this.paymentService.saveStoredToken(token);
          this.isAuthenticated = true;
        } else {
          this.userToken = this.paymentService.getStoredToken();
          this.isAuthenticated = !!this.userToken;
        }

        if (cycle) {
          this.isYearly = cycle.toLowerCase() === 'yearly' || cycle.toLowerCase() === 'annual';
        }

        if (queryPlanId) {
          this.planId = queryPlanId;
          this.loadPlan(queryPlanId);
        } else {
          this.loadDefaultPlan();
        }
      });
  }

  private messageListener?: (event: MessageEvent) => void;

  ngOnInit(): void {
    this.messageListener = (event: MessageEvent) => {
      if (
        event.data &&
        (event.data.success === true ||
          event.data.status === 'success' ||
          (typeof event.data === 'string' && event.data.includes('success')))
      ) {
        this.closeIframeModal();
        this.router.navigate(['/checkout/success']);
      }
    };
    window.addEventListener('message', this.messageListener);
  }

  ngOnDestroy(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
    }
  }

  loadPlan(planId: string): void {
    this.loadingPlan = true;
    this.plansService.getPlanById(planId).subscribe({
      next: (plan) => {
        this.selectedPlan = plan;
        this.isYearly = plan.durationDays >= 300;
        this.loadingPlan = false;
      },
      error: () => {
        this.loadDefaultPlan();
      },
    });
  }

  loadDefaultPlan(): void {
    this.loadingPlan = true;
    this.plansService.getPlans().subscribe({
      next: (plans) => {
        const proPlan = plans.find((p) => p.name.includes('PRO')) || plans[0];
        if (proPlan) {
          this.selectedPlan = proPlan;
          this.planId = proPlan.id;
          this.isYearly = proPlan.durationDays >= 300;
        }
        this.loadingPlan = false;
      },
      error: (err) => {
        console.error('Failed to load default plan:', err);
        this.loadingPlan = false;
      },
    });
  }

  setPaymentMethod(method: PaymentMethod): void {
    this.selectedPaymentMethod = method;
    this.errorMessage = null;
  }

  get totalAmount(): number {
    if (!this.selectedPlan) return 0;
    const price = Number(this.selectedPlan.price);
    if (this.isYearly && this.selectedPlan.durationDays < 300) {
      return Math.round(price * 12 * 0.8);
    }
    return price;
  }

  confirmPayment(): void {
    this.errorMessage = null;

    // If not authenticated, ensure quick registration form is valid
    if (!this.isAuthenticated) {
      if (this.quickRegisterForm.invalid) {
        this.quickRegisterForm.markAllAsTouched();
        this.errorMessage = 'يرجى إكمال بيانات العيادة الأساسية للمتابعة';
        return;
      }
    }

    // If wallet, ensure wallet number is provided
    if (this.selectedPaymentMethod === 'WALLET' && this.walletForm.invalid) {
      this.walletForm.markAllAsTouched();
      this.errorMessage = 'يرجى إدخال رقم محفظة إلكترونية صحيح (مثال: 01012345678)';
      return;
    }

    this.isProcessing = true;

    if (!this.isAuthenticated) {
      // Step 1: Register clinic first, then initiate payment with the returned token
      const regValues = this.quickRegisterForm.value;
      this.authService
        .register({
          clinicName: regValues.clinicName.trim(),
          name: regValues.fullName.trim(),
          email: regValues.email.trim().toLowerCase(),
          password: regValues.password,
          phone: regValues.phone || undefined,
          planId: this.selectedPlan?.id,
        })
        .subscribe({
          next: (authRes) => {
            this.userToken = authRes.accessToken;
            this.paymentService.saveStoredToken(authRes.accessToken);
            this.isAuthenticated = true;
            this.executePaymentRequest(authRes.accessToken);
          },
          error: (err) => {
            this.isProcessing = false;
            this.errorMessage =
              err.error?.message ||
              'تعذر إنشاء حساب العيادة. يرجى مراجعة البيانات أو تسجيل الدخول.';
          },
        });
    } else {
      // User is already logged in
      this.executePaymentRequest(this.userToken!);
    }
  }

  private executePaymentRequest(token: string): void {
    if (!this.selectedPlan) {
      this.isProcessing = false;
      this.errorMessage = 'يرجى اختيار باقة للاشتراك';
      return;
    }

    const phone =
      this.selectedPaymentMethod === 'WALLET'
        ? this.walletForm.value.phone
        : this.quickRegisterForm.value.phone;

    this.paymentService
      .initiatePayment(
        {
          planId: this.selectedPlan.id,
          paymentMethod: this.selectedPaymentMethod,
          phone,
          isYearly: this.isYearly,
        },
        token
      )
      .subscribe({
        next: (res) => {
          this.isProcessing = false;
          this.handlePaymentSuccessResponse(res);
        },
        error: (err) => {
          this.isProcessing = false;
          console.error('Payment initiation error:', err);
          this.errorMessage =
            err.error?.message ||
            'تعذر بدء عملية الدفع عبر البوابة، يرجى المحاولة مرة أخرى.';
        },
      });
  }

  private handlePaymentSuccessResponse(res: PaymentResponse): void {
    if (this.selectedPaymentMethod === 'CARD') {
      if (res.redirectUrl) {
        this.rawRedirectUrl = res.redirectUrl;
        this.safeIframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(res.redirectUrl);
        this.showIframeModal = true;
      } else {
        this.router.navigate(['/checkout/success'], {
          queryParams: { paymentId: res.paymentId },
        });
      }
    } else if (this.selectedPaymentMethod === 'WALLET') {
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        this.router.navigate(['/checkout/success'], {
          queryParams: { paymentId: res.paymentId },
        });
      }
    } else if (this.selectedPaymentMethod === 'FAWRY') {
      this.fawryCode = res.fawryReference || `FAWRY-${res.paymobOrderId || '7891234'}`;
    }
  }

  closeIframeModal(): void {
    this.showIframeModal = false;
    this.safeIframeUrl = null;
  }

  openIframeInNewTab(): void {
    if (this.rawRedirectUrl) {
      window.open(this.rawRedirectUrl, '_blank');
    }
  }

  copyFawryCode(): void {
    if (this.fawryCode) {
      navigator.clipboard.writeText(this.fawryCode);
      this.fawryCopied = true;
      setTimeout(() => (this.fawryCopied = false), 3000);
    }
  }

  getPlanArabicTitle(name: string): string {
    const key = name.toUpperCase();
    if (key.includes('BASIC') || key.includes('STARTER')) return 'الأساسية (Starter)';
    if (key.includes('PRO')) return 'المتقدمة (Professional)';
    if (key.includes('ENTERPRISE')) return 'المؤسسية (Enterprise)';
    return name;
  }
}
