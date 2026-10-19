import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { injectQuery, injectMutation } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';

import { PlansService, Plan } from '../../core/services/plans.service';
import { PaymentService, PaymentMethod, PaymentResponse, ValidateCouponResponse, InitiatePaymentPayload } from '../../core/services/payment.service';
import { AuthService, RegisterPayload } from '../../core/services/auth.service';
import { planKeys } from '../../core/queries';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
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

  readonly queryPlanId = signal<string | null>(null);
  readonly isYearly = signal<boolean>(false);
  private hasExplicitCycleParam = false;

  readonly selectedPaymentMethod = signal<PaymentMethod>('CARD');
  readonly walletForm: FormGroup;
  readonly quickRegisterForm: FormGroup;

  readonly isAuthenticated = signal<boolean>(false);
  readonly userToken = signal<string | null>(null);

  readonly errorMessage = signal<string | null>(null);

  // Coupon state
  couponCodeInput = '';
  readonly appliedCoupon = signal<ValidateCouponResponse | null>(null);
  readonly couponError = signal<string | null>(null);
  readonly couponSuccess = signal<string | null>(null);

  // Iframe modal for Paymob card payment
  readonly showIframeModal = signal<boolean>(false);
  readonly safeIframeUrl = signal<SafeResourceUrl | null>(null);
  readonly rawRedirectUrl = signal<string | null>(null);

  // Fawry Reference Code display
  readonly fawryCode = signal<string | null>(null);
  readonly fawryCopied = signal<boolean>(false);

  private messageListener?: (event: MessageEvent) => void;

  // --- TanStack Queries ---
  readonly planDetailQuery = injectQuery(() => ({
    queryKey: planKeys.detail(this.queryPlanId() || ''),
    queryFn: () => lastValueFrom(this.plansService.getPlanById(this.queryPlanId()!)),
    enabled: !!this.queryPlanId(),
  }));

  readonly plansListQuery = injectQuery(() => ({
    queryKey: planKeys.lists(),
    queryFn: () => lastValueFrom(this.plansService.getPlans()),
    enabled: !this.queryPlanId() || this.planDetailQuery.isError(),
  }));

  readonly selectedPlan = computed<Plan | null>(() => {
    if (this.queryPlanId()) {
      const detail = this.planDetailQuery.data();
      if (detail) return detail;
    }
    const list = this.plansListQuery.data() || [];
    return list.find((p) => p.name.includes('PRO')) || list[0] || null;
  });

  readonly loadingPlan = computed<boolean>(() => {
    if (this.queryPlanId()) {
      return this.planDetailQuery.isPending();
    }
    return this.plansListQuery.isPending();
  });

  // --- TanStack Mutations ---
  readonly validateCouponMutation = injectMutation(() => ({
    mutationFn: ({ code, planId, isYearly, token }: { code: string; planId?: string; isYearly: boolean; token?: string | null }) =>
      lastValueFrom(this.paymentService.validateCoupon(code, planId, isYearly, token)),
    onSuccess: (res) => {
      if (res.valid) {
        this.appliedCoupon.set(res);
        this.couponSuccess.set(res.message || 'تم تطبيق كود الخصم بنجاح');
        this.couponError.set(null);
      } else {
        this.appliedCoupon.set(null);
        this.couponError.set(res.message || 'كود الخصم غير صالح أو منتهي الصلاحية');
        this.couponSuccess.set(null);
      }
    },
    onError: (err: any) => {
      this.appliedCoupon.set(null);
      this.couponError.set(err.error?.message || 'تعذر التحقق من كود الخصم. يرجى التأكد من صحة الكود.');
      this.couponSuccess.set(null);
    },
  }));

  readonly registerMutation = injectMutation(() => ({
    mutationFn: (payload: RegisterPayload) =>
      lastValueFrom(this.authService.register(payload)),
  }));

  readonly initiatePaymentMutation = injectMutation(() => ({
    mutationFn: ({ payload, token }: { payload: InitiatePaymentPayload; token?: string | null }) =>
      lastValueFrom(this.paymentService.initiatePayment(payload, token)),
    onSuccess: (res) => {
      this.handlePaymentSuccessResponse(res);
    },
    onError: (err: any) => {
      console.error('Payment initiation error:', err);
      this.errorMessage.set(
        err.error?.message || 'تعذر بدء عملية الدفع عبر البوابة، يرجى المحاولة مرة أخرى.'
      );
    },
  }));

  readonly isProcessing = computed(() => {
    return this.registerMutation.isPending() || this.initiatePaymentMutation.isPending();
  });

  readonly isValidatingCoupon = computed(() => {
    return this.validateCouponMutation.isPending();
  });

  readonly baseAmount = computed(() => {
    const plan = this.selectedPlan();
    if (!plan) return 0;
    const price = Number(plan.price);
    if (this.isYearly() && plan.durationDays < 300) {
      return Math.round(price * 12 * 0.8);
    }
    return price;
  });

  readonly totalAmount = computed(() => {
    const coupon = this.appliedCoupon();
    if (coupon) {
      return coupon.finalAmount;
    }
    return this.baseAmount();
  });

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

        const storedToken = this.paymentService.getStoredToken();
        this.userToken.set(storedToken);
        this.isAuthenticated.set(!!storedToken);

        if (cycle) {
          this.hasExplicitCycleParam = true;
          this.isYearly.set(cycle.toLowerCase() === 'yearly' || cycle.toLowerCase() === 'annual');
        }

        if (queryPlanId) {
          this.queryPlanId.set(queryPlanId);
        }
      });

    effect(() => {
      const plan = this.selectedPlan();
      if (plan && !this.hasExplicitCycleParam) {
        this.isYearly.set(plan.durationDays >= 300);
      }
    });
  }

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

  setPaymentMethod(method: PaymentMethod): void {
    this.selectedPaymentMethod.set(method);
    this.errorMessage.set(null);
  }

  applyCoupon(): void {
    const plan = this.selectedPlan();
    if (!plan) {
      this.couponError.set('يرجى اختيار باقة أولاً لتطبيق كود الخصم');
      return;
    }

    const code = this.couponCodeInput.trim().toUpperCase();
    if (!code) {
      this.couponError.set('يرجى إدخال كود الخصم');
      return;
    }

    this.couponError.set(null);
    this.couponSuccess.set(null);

    this.validateCouponMutation.mutate({
      code,
      planId: plan.id,
      isYearly: this.isYearly(),
      token: this.userToken(),
    });
  }

  clearCoupon(): void {
    this.couponCodeInput = '';
    this.appliedCoupon.set(null);
    this.couponError.set(null);
    this.couponSuccess.set(null);
  }

  confirmPayment(): void {
    this.errorMessage.set(null);

    // If not authenticated, ensure quick registration form is valid
    if (!this.isAuthenticated()) {
      if (this.quickRegisterForm.invalid) {
        this.quickRegisterForm.markAllAsTouched();
        this.errorMessage.set('يرجى إكمال بيانات العيادة الأساسية للمتابعة');
        return;
      }
    }

    // If wallet and not 100% free, ensure wallet number is provided
    if (this.totalAmount() > 0 && this.selectedPaymentMethod() === 'WALLET' && this.walletForm.invalid) {
      this.walletForm.markAllAsTouched();
      this.errorMessage.set('يرجى إدخال رقم محفظة إلكترونية صحيح (مثال: 01012345678)');
      return;
    }

    if (!this.isAuthenticated()) {
      // Step 1: Register clinic first, then initiate payment with the returned token
      const regValues = this.quickRegisterForm.value;
      const plan = this.selectedPlan();

      this.registerMutation.mutate(
        {
          clinicName: regValues.clinicName.trim(),
          name: regValues.fullName.trim(),
          email: regValues.email.trim().toLowerCase(),
          password: regValues.password,
          phone: regValues.phone || undefined,
          planId: plan?.id,
        },
        {
          onSuccess: (authRes) => {
            this.userToken.set(authRes.accessToken);
            this.paymentService.saveStoredToken(authRes.accessToken);
            this.isAuthenticated.set(true);
            this.executePaymentRequest(authRes.accessToken);
          },
          onError: (err: any) => {
            this.errorMessage.set(
              err.error?.message ||
              'تعذر إنشاء حساب العيادة. يرجى مراجعة البيانات أو تسجيل الدخول.'
            );
          },
        }
      );
    } else {
      // User is already logged in
      this.executePaymentRequest(this.userToken()!);
    }
  }

  private executePaymentRequest(token: string): void {
    const plan = this.selectedPlan();
    if (!plan) {
      this.errorMessage.set('يرجى اختيار باقة للاشتراك');
      return;
    }

    const phone =
      this.selectedPaymentMethod() === 'WALLET'
        ? this.walletForm.value.phone
        : this.quickRegisterForm.value.phone;

    this.initiatePaymentMutation.mutate({
      payload: {
        planId: plan.id,
        paymentMethod: this.selectedPaymentMethod(),
        phone,
        isYearly: this.isYearly(),
        couponCode: this.appliedCoupon() ? this.appliedCoupon()!.code : undefined,
      },
      token,
    });
  }

  private handlePaymentSuccessResponse(res: PaymentResponse): void {
    // 100% Free checkout handling: redirect immediately to success screen without launching Paymob
    if (res.amount === 0 || res.status === 'SUCCESSFUL' || (!res.redirectUrl && this.selectedPaymentMethod() !== 'FAWRY')) {
      this.router.navigate(['/checkout/success'], {
        queryParams: { paymentId: res.paymentId },
      });
      return;
    }

    if (this.selectedPaymentMethod() === 'CARD') {
      if (res.redirectUrl) {
        this.rawRedirectUrl.set(res.redirectUrl);
        this.safeIframeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(res.redirectUrl));
        this.showIframeModal.set(true);
      } else {
        this.router.navigate(['/checkout/success'], {
          queryParams: { paymentId: res.paymentId },
        });
      }
    } else if (this.selectedPaymentMethod() === 'WALLET') {
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        this.router.navigate(['/checkout/success'], {
          queryParams: { paymentId: res.paymentId },
        });
      }
    } else if (this.selectedPaymentMethod() === 'FAWRY') {
      this.fawryCode.set(res.fawryReference || `FAWRY-${res.paymobOrderId || '7891234'}`);
    }
  }

  closeIframeModal(): void {
    this.showIframeModal.set(false);
    this.safeIframeUrl.set(null);
  }

  openIframeInNewTab(): void {
    const rawUrl = this.rawRedirectUrl();
    if (rawUrl) {
      window.open(rawUrl, '_blank');
    }
  }

  copyFawryCode(): void {
    const code = this.fawryCode();
    if (code) {
      navigator.clipboard.writeText(code);
      this.fawryCopied.set(true);
      setTimeout(() => this.fawryCopied.set(false), 3000);
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
