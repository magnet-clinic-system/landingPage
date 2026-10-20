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
  readonly Math = Math;

  readonly activePlanId = signal<string | null>(null);
  readonly isYearly = signal<boolean>(false);
  private hasExplicitCycleParam = false;
  readonly showPlanSelectorModal = signal<boolean>(false);

  readonly selectedPaymentMethod = signal<PaymentMethod>('CARD');
  readonly walletForm: FormGroup;
  readonly quickRegisterForm: FormGroup;
  readonly loginForm: FormGroup;

  readonly authMode = signal<'register' | 'login'>('register');
  readonly isAuthenticated = signal<boolean>(false);
  readonly userToken = signal<string | null>(null);
  readonly authenticatedUser = signal<{ name?: string; email?: string; clinicName?: string } | null>(null);

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
  readonly plansListQuery = injectQuery(() => ({
    queryKey: planKeys.lists(),
    queryFn: () => lastValueFrom(this.plansService.getPlans()),
  }));

  readonly availablePlans = computed<Plan[]>(() => {
    const list = this.plansListQuery.data() || [];
    const valid = list.filter(
      (p) =>
        !p.name.toUpperCase().startsWith('TRIAL') &&
        !p.name.toUpperCase().startsWith('AI_')
    );
    const order = ['BASIC', 'PRO', 'ENTERPRISE'];
    const getIndex = (name: string) =>
      order.findIndex((k) => name.toUpperCase().includes(k));

    if (this.isYearly()) {
      const annual = valid.filter((p) => p.durationDays >= 300);
      if (annual.length > 0) {
        return [...annual].sort((a, b) => getIndex(a.name) - getIndex(b.name));
      }
    } else {
      const monthly = valid.filter((p) => p.durationDays <= 31);
      if (monthly.length > 0) {
        return [...monthly].sort((a, b) => getIndex(a.name) - getIndex(b.name));
      }
    }
    return valid;
  });

  readonly planDetailQuery = injectQuery(() => ({
    queryKey: planKeys.detail(this.activePlanId() || ''),
    queryFn: () => lastValueFrom(this.plansService.getPlanById(this.activePlanId()!)),
    enabled: !!this.activePlanId(),
  }));

  readonly selectedPlan = computed<Plan | null>(() => {
    const all = this.plansListQuery.data() || [];
    const currentId = this.activePlanId();
    if (currentId && all.length > 0) {
      const found = all.find((p) => p.id === currentId);
      if (found) return found;
    }
    const detail = this.planDetailQuery.data();
    if (detail) return detail;
    const plans = this.availablePlans();
    if (plans.length > 0) {
      return plans.find((p) => p.name.toUpperCase().includes('PRO')) || plans[0] || null;
    }
    return null;
  });

  readonly loadingPlan = computed<boolean>(() => {
    return (
      (this.plansListQuery.isPending() && !this.selectedPlan()) ||
      (!!this.activePlanId() && this.planDetailQuery.isPending() && !this.selectedPlan())
    );
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

  readonly loginMutation = injectMutation(() => ({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      lastValueFrom(this.authService.login(email, password)),
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
    return (
      this.registerMutation.isPending() ||
      this.loginMutation.isPending() ||
      this.initiatePaymentMutation.isPending()
    );
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

    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });

    // 1. Immediate Synchronous Check from URL and Storage
    // This executes before the first render cycle to completely prevent any flicker of the registration forms!
    const searchParams =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search)
        : null;
    const directToken = searchParams?.get('token');
    const directClinicName = searchParams?.get('clinicName');
    const directPlanId = searchParams?.get('planId');
    const directCycle = searchParams?.get('billingCycle');

    if (directPlanId) {
      this.activePlanId.set(directPlanId);
    }
    if (directCycle) {
      this.hasExplicitCycleParam = true;
      this.isYearly.set(
        directCycle.toLowerCase() === 'yearly' ||
          directCycle.toLowerCase() === 'annual',
      );
    }

    const initialToken = directToken || this.paymentService.getStoredToken();
    if (initialToken && this.isTokenValid(initialToken)) {
      const cleanToken = initialToken.replace(/^Bearer\s+/i, '').trim();
      this.paymentService.saveStoredToken(cleanToken, true);
      this.userToken.set(cleanToken);
      this.isAuthenticated.set(true);
      this.extractAndFetchUserInfo(
        cleanToken,
        directClinicName || undefined,
      );
    }

    // 2. Reactive queryParamMap Subscription
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const queryPlanId = params.get('planId');
        const cycle = params.get('billingCycle');
        const tokenParam = params.get('token');
        const clinicNameParam = params.get('clinicName');
        const modeParam = params.get('mode');
        const emailParam = params.get('email');

        if (modeParam === 'login' && !this.isAuthenticated()) {
          this.authMode.set('login');
        }

        if (emailParam) {
          this.loginForm.patchValue({ email: emailParam });
          this.quickRegisterForm.patchValue({ email: emailParam });
        }

        if (tokenParam) {
          const cleanToken = tokenParam.replace(/^Bearer\s+/i, '').trim();
          if (this.isTokenValid(cleanToken)) {
            this.paymentService.saveStoredToken(cleanToken, true);
            this.userToken.set(cleanToken);
            this.isAuthenticated.set(true);
            this.extractAndFetchUserInfo(
              cleanToken,
              clinicNameParam || directClinicName || undefined,
            );
            this.cleanTokenFromUrl();
          }
        } else if (!this.isAuthenticated()) {
          const storedToken = this.paymentService.getStoredToken();
          if (storedToken && this.isTokenValid(storedToken)) {
            const cleanToken = storedToken.replace(/^Bearer\s+/i, '').trim();
            this.userToken.set(cleanToken);
            this.isAuthenticated.set(true);
            this.extractAndFetchUserInfo(
              cleanToken,
              clinicNameParam || directClinicName || undefined,
            );
          }
        }

        if (cycle) {
          this.hasExplicitCycleParam = true;
          this.isYearly.set(
            cycle.toLowerCase() === 'yearly' ||
              cycle.toLowerCase() === 'annual',
          );
        }

        if (queryPlanId && queryPlanId !== this.activePlanId()) {
          this.activePlanId.set(queryPlanId);
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

  setAuthMode(mode: 'register' | 'login'): void {
    this.authMode.set(mode);
    this.errorMessage.set(null);
  }

  submitLogin(autoInitiatePayment = false): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.errorMessage.set('يرجى إدخال البريد الإلكتروني وكلمة المرور للمتابعة');
      return;
    }
    this.errorMessage.set(null);
    const { email, password } = this.loginForm.value;

    this.loginMutation.mutate(
      { email, password },
      {
        onSuccess: (res) => {
          this.userToken.set(res.accessToken);
          this.paymentService.saveStoredToken(res.accessToken, true);
          this.isAuthenticated.set(true);
          this.extractAndFetchUserInfo(res.accessToken);
          if (autoInitiatePayment) {
            this.executePaymentRequest(res.accessToken);
          }
        },
        onError: (err: any) => {
          this.errorMessage.set(
            err.error?.message || 'بيانات الدخول غير صحيحة. يرجى التأكد من صحة البريد وكلمة المرور.'
          );
        },
      }
    );
  }

  logoutOrSwitchAccount(): void {
    this.paymentService.clearStoredToken();
    this.userToken.set(null);
    this.isAuthenticated.set(false);
    this.authenticatedUser.set(null);
    this.authMode.set('login');
  }

  private cleanTokenFromUrl(): void {
    if (typeof window !== 'undefined' && window.location.search.includes('token=')) {
      const cleanSearch = window.location.search
        .replace(/([&?])token=[^&]+(&|$)/, '$1')
        .replace(/[&?]$/, '')
        .replace(/\?&/, '?');
      const cleanUrl =
        window.location.pathname +
        (cleanSearch ? (cleanSearch.startsWith('?') ? cleanSearch : `?${cleanSearch}`) : '');
      window.history.replaceState({}, document.title, cleanUrl || window.location.pathname);
    }
  }

  isTokenValid(token?: string | null): boolean {
    if (!token || typeof token !== 'string') return false;
    const clean = token.replace(/^Bearer\s+/i, '').trim();
    const decoded: any = this.authService.decodeToken(clean);
    if (!decoded) return false;
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return false; // Expired token
    }
    return true;
  }

  openPlanSelectorModal(): void {
    this.showPlanSelectorModal.set(true);
  }

  closePlanSelectorModal(): void {
    this.showPlanSelectorModal.set(false);
  }

  private getTierKey(name: string): string {
    const upper = name.toUpperCase();
    if (upper.includes('BASIC') || upper.includes('STARTER')) return 'BASIC';
    if (upper.includes('PRO')) return 'PRO';
    if (upper.includes('ENTERPRISE')) return 'ENTERPRISE';
    return upper;
  }

  selectPlan(plan: Plan): void {
    this.activePlanId.set(plan.id);
    this.hasExplicitCycleParam = true;
    this.isYearly.set(plan.durationDays >= 300);
    this.showPlanSelectorModal.set(false);
    this.errorMessage.set(null);
    if (this.appliedCoupon()) {
      this.revalidateAppliedCoupon(plan.id);
    }
  }

  setBillingCycle(yearly: boolean): void {
    this.hasExplicitCycleParam = true;
    this.isYearly.set(yearly);
    const current = this.selectedPlan();
    if (current) {
      const allPlans = this.plansListQuery.data() || [];
      const tierKey = this.getTierKey(current.name);
      const matching = allPlans.find(
        (p) =>
          this.getTierKey(p.name) === tierKey &&
          (yearly ? p.durationDays >= 300 : p.durationDays <= 31)
      );
      if (matching) {
        this.activePlanId.set(matching.id);
      }
      if (this.appliedCoupon()) {
        this.revalidateAppliedCoupon(matching?.id || current.id);
      }
    }
  }

  private revalidateAppliedCoupon(newPlanId: string): void {
    const coupon = this.appliedCoupon();
    if (!coupon) return;
    this.validateCouponMutation.mutate({
      code: coupon.code,
      planId: newPlanId,
      isYearly: this.isYearly(),
      token: this.userToken(),
    });
  }

  getPlanPrice(plan: Plan, isYearly: boolean): number {
    const price = Number(plan.price);
    if (plan.durationDays >= 300) {
      return price;
    }
    if (isYearly) {
      return Math.round(price * 12 * 0.8);
    }
    return price;
  }

  getPlanFeatures(plan: Plan): string[] {
    const list: string[] = [];
    if (plan.maxUsers === 1) {
      list.push('طبيب ومستخدم واحد');
    } else if (plan.maxUsers > 1) {
      list.push(`حتى ${plan.maxUsers} مستخدمين وأطباء`);
    } else {
      list.push('عدد غير محدود من الأطباء');
    }

    if (plan.maxBranches === 1) {
      list.push('فرع رئيسي واحد');
    } else if (plan.maxBranches > 1) {
      list.push(`حتى ${plan.maxBranches} فروع`);
    } else {
      list.push('فروع متعددة بلا حدود');
    }

    if (plan.maxAiMessages && plan.maxAiMessages > 0) {
      list.push(`${plan.maxAiMessages} رسالة ذكاء اصطناعي شهرياً`);
    } else if (plan.maxAiMessages === -1) {
      list.push('مساعد طبي ذكي غير محدود');
    }

    list.push('ملفات المرضى والروشتات الإلكترونية');
    list.push('الفواتير والتقارير المالية والضريبية');
    return list;
  }

  private extractAndFetchUserInfo(
    token: string,
    fallbackClinicName?: string,
  ): void {
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    const decoded: any = this.authService.decodeToken(cleanToken);
    if (decoded) {
      this.authenticatedUser.set({
        name: decoded.name || 'طبيب / مدير العيادة',
        email: decoded.email || '',
        clinicName:
          fallbackClinicName ||
          decoded.clinicName ||
          'عيادة الشفاء الطبية',
      });
    }

    this.authService.getClinicDetails(cleanToken).subscribe({
      next: (clinic: any) => {
        if (clinic) {
          this.authenticatedUser.update((prev) => ({
            name: prev?.name || 'طبيب / مدير العيادة',
            email: prev?.email || '',
            clinicName:
              clinic.name ||
              fallbackClinicName ||
              prev?.clinicName ||
              'عيادة الشفاء الطبية',
          }));
        }
      },
      error: (err) => {
        console.warn('Could not fetch clinic details in checkout:', err);
      },
    });
  }

  confirmPayment(): void {
    this.errorMessage.set(null);

    // If not authenticated, validate whichever form is active
    if (!this.isAuthenticated()) {
      if (this.authMode() === 'login') {
        this.submitLogin(true);
        return;
      }

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
            this.paymentService.saveStoredToken(authRes.accessToken, true);
            this.isAuthenticated.set(true);
            this.extractAndFetchUserInfo(authRes.accessToken);
            this.executePaymentRequest(authRes.accessToken);
          },
          onError: (err: any) => {
            const status = err.status;
            const serverMsg = err.error?.message;
            const isEmailConflict =
              status === 409 ||
              (typeof serverMsg === 'string' &&
                (serverMsg.toLowerCase().includes('email') ||
                  serverMsg.includes('مسجل') ||
                  serverMsg.includes('already')));

            if (isEmailConflict) {
              this.authMode.set('login');
              this.loginForm.patchValue({ email: regValues.email.trim().toLowerCase() });
              this.errorMessage.set(
                'هذا البريد مسجل بالفعل لعيادة سابقة. يرجى إدخال كلمة المرور لتسجيل الدخول وترقية عيادتك الحالية فوراً دون تكرار التسجيل.'
              );
            } else {
              this.errorMessage.set(
                (Array.isArray(serverMsg) ? serverMsg.join(' • ') : serverMsg) ||
                  'تعذر إنشاء حساب العيادة. يرجى مراجعة البيانات أو تسجيل الدخول.'
              );
            }
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
