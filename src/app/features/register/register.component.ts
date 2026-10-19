import { Component, inject, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { injectQuery, injectMutation } from '@tanstack/angular-query-experimental';
import { lastValueFrom } from 'rxjs';

import { AuthService, RegisterPayload } from '../../core/services/auth.service';
import { PlansService, Plan } from '../../core/services/plans.service';
import { planKeys } from '../../core/queries';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly plansService = inject(PlansService);

  readonly loginUrl = environment.erpUrl;

  readonly registerForm: FormGroup;
  readonly showPassword = signal(false);
  readonly successSso = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly planId = signal<string | null>(null);

  // OTP Verification States
  readonly showOtpModal = signal(false);
  otpCode = '';
  readonly otpError = signal<string | null>(null);
  readonly otpSuccessMessage = signal<string | null>(null);
  readonly resendCooldown = signal(0);
  private resendInterval: any = null;
  readonly verificationTicket = signal<string | null>(null);

  // --- TanStack Query for Plan Detail ---
  readonly planQuery = injectQuery(() => ({
    queryKey: planKeys.detail(this.planId() || ''),
    queryFn: () => lastValueFrom(this.plansService.getPlanById(this.planId()!)),
    enabled: !!this.planId(),
  }));

  readonly selectedPlan = computed<Plan | null>(() => this.planQuery.data() || null);
  readonly loadingPlan = computed<boolean>(() => this.planQuery.isPending());

  // --- TanStack Mutations ---
  readonly requestOtpMutation = injectMutation(() => ({
    mutationFn: (email: string) =>
      lastValueFrom(this.authService.requestEmailVerification(email)),
  }));

  readonly confirmOtpMutation = injectMutation(() => ({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      lastValueFrom(this.authService.confirmEmailVerification(email, code)),
  }));

  readonly registerMutation = injectMutation(() => ({
    mutationFn: (payload: RegisterPayload) =>
      lastValueFrom(this.authService.register(payload)),
  }));

  readonly submitting = computed(() => this.registerMutation.isPending());
  readonly sendingOtp = computed(() => this.requestOtpMutation.isPending());
  readonly otpSubmitting = computed(() => this.confirmOtpMutation.isPending());

  constructor() {
    this.registerForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      clinicName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
      phone: ['', [Validators.pattern(/^(\+?[0-9]{7,15})?$/)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      terms: [true, [Validators.requiredTrue]],
    });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const planParam = params.get('planId');
        const emailParam = params.get('email');

        if (emailParam) {
          this.registerForm.patchValue({ email: emailParam });
        }

        if (planParam) {
          this.planId.set(planParam);
        }
      });
  }

  ngOnDestroy(): void {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
  }

  isFieldInvalid(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): { ar: string; en: string } | null {
    const field = this.registerForm.get(fieldName);
    if (!field || !field.errors) return null;

    if (field.errors['required']) {
      return { ar: 'هذا الحقل مطلوب', en: 'This field is required' };
    }
    if (field.errors['email']) {
      return { ar: 'يرجى إدخال بريد إلكتروني صحيح', en: 'Please enter a valid email' };
    }
    if (field.errors['minlength']) {
      return {
        ar: `يجب أن يكون ${field.errors['minlength'].requiredLength} أحرف على الأقل`,
        en: `Must be at least ${field.errors['minlength'].requiredLength} characters`,
      };
    }
    if (field.errors['requiredTrue']) {
      return { ar: 'يجب الموافقة على الشروط للمتابعة', en: 'Must accept terms to proceed' };
    }
    if (field.errors['pattern'] && fieldName === 'phone') {
      return { ar: 'يرجى إدخال رقم هاتف صحيح (مثال: 01012345678 أو +201012345678)', en: 'Please enter a valid phone number' };
    }

    return null;
  }

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    if (this.verificationTicket()) {
      this.executeRegistration();
      return;
    }

    this.requestOtp();
  }

  requestOtp(isResend = false): void {
    const email = this.registerForm.value.email?.trim().toLowerCase();
    if (!email) return;

    this.errorMessage.set(null);
    this.otpError.set(null);

    this.requestOtpMutation.mutate(email, {
      onSuccess: () => {
        this.showOtpModal.set(true);
        this.otpSuccessMessage.set(
          isResend
            ? 'تم إعادة إرسال رمز التحقق بنجاح.'
            : 'تم إرسال رمز تحقق (6 أرقام) إلى بريدك الإلكتروني.'
        );
        this.startResendCooldown();
      },
      onError: (err: any) => {
        const msg = err.error?.message || 'تعذر إرسال رمز التحقق، يرجى المحاولة بعد قليل.';
        const formatted = Array.isArray(msg) ? msg.join(' • ') : msg;
        if (isResend) {
          this.otpError.set(formatted);
        } else {
          this.errorMessage.set(formatted);
        }
      },
    });
  }

  confirmOtp(): void {
    const email = this.registerForm.value.email?.trim().toLowerCase();
    const code = this.otpCode.trim();

    if (!code || !/^[0-9]{6}$/.test(code)) {
      this.otpError.set('يرجى إدخال رمز التحقق المكون من 6 أرقام.');
      return;
    }

    this.otpError.set(null);

    this.confirmOtpMutation.mutate(
      { email, code },
      {
        onSuccess: (res) => {
          this.verificationTicket.set(res.verificationTicket);
          this.showOtpModal.set(false);
          this.executeRegistration();
        },
        onError: (err: any) => {
          const msg = err.error?.message;
          this.otpError.set(
            Array.isArray(msg)
              ? msg.join(' • ')
              : (msg || 'رمز التحقق غير صحيح أو انتهت صلاحيته.')
          );
        },
      }
    );
  }

  closeOtpModal(): void {
    this.showOtpModal.set(false);
    this.otpCode = '';
    this.otpError.set(null);
  }

  private startResendCooldown(): void {
    this.resendCooldown.set(60);
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
    this.resendInterval = setInterval(() => {
      const current = this.resendCooldown();
      if (current > 1) {
        this.resendCooldown.set(current - 1);
      } else {
        this.resendCooldown.set(0);
        clearInterval(this.resendInterval);
        this.resendInterval = null;
      }
    }, 1000);
  }

  private executeRegistration(): void {
    this.errorMessage.set(null);

    const formValues = this.registerForm.value;

    const payload: RegisterPayload = {
      clinicName: formValues.clinicName.trim(),
      name: formValues.fullName.trim(),
      email: formValues.email.trim().toLowerCase(),
      phone: formValues.phone ? formValues.phone.trim() : undefined,
      password: formValues.password,
      planId: this.planId() || undefined,
      verificationTicket: this.verificationTicket() || undefined,
    };

    this.registerMutation.mutate(payload, {
      onSuccess: (res) => {
        this.successSso.set(true);

        setTimeout(() => {
          this.authService.redirectToErp(res.accessToken);
        }, 1500);
      },
      onError: (err: any) => {
        console.error('Registration failed:', err);

        const status = err.status;
        const serverMsg = err.error?.message;

        if (status === 400 || status === 409) {
          if (Array.isArray(serverMsg)) {
            this.errorMessage.set(serverMsg.join(' • '));
          } else if (serverMsg && serverMsg.toLowerCase().includes('email')) {
            this.errorMessage.set('البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول أو استخدام بريد آخر.');
          } else {
            this.errorMessage.set(serverMsg || 'بيانات التسجيل غير صالحة، يرجى مراجعة الحقول.');
          }
        } else if (status === 429) {
          this.errorMessage.set('تم تجاوز عدد محاولات التسجيل المسموح بها، يرجى الانتظار دقيقة.');
        } else {
          this.errorMessage.set('حدث خطأ غير متوقع أثناء إنشاء الحساب، يرجى المحاولة لاحقاً.');
        }
      },
    });
  }
}
