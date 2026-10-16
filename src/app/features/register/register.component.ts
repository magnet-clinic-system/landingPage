import { Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';
import { PlansService, Plan } from '../../core/services/plans.service';
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

  registerForm: FormGroup;
  showPassword = false;
  submitting = false;
  successSso = false;
  errorMessage: string | null = null;

  planId: string | null = null;
  selectedPlan: Plan | null = null;
  loadingPlan = false;

  // OTP Verification States
  showOtpModal = false;
  otpCode = '';
  otpSubmitting = false;
  sendingOtp = false;
  otpError: string | null = null;
  otpSuccessMessage: string | null = null;
  resendCooldown = 0;
  private resendInterval: any = null;
  verificationTicket: string | null = null;

  constructor() {
    this.registerForm = this.fb.group({
      fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
      clinicName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(320)]],
      phone: ['', [Validators.pattern(/^(\+?[0-9]{7,15})?$/)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      terms: [true, [Validators.requiredTrue]],
    });

    // Read optional query params (planId, email) with automatic unsubscription
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const planParam = params.get('planId');
        const emailParam = params.get('email');

        if (emailParam) {
          this.registerForm.patchValue({ email: emailParam });
        }

        if (planParam) {
          this.planId = planParam;
          this.loadSelectedPlan(planParam);
        }
      });
  }

  ngOnDestroy(): void {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }

  loadSelectedPlan(planId: string): void {
    this.loadingPlan = true;
    this.plansService.getPlanById(planId).subscribe({
      next: (plan) => {
        this.selectedPlan = plan;
        this.loadingPlan = false;
      },
      error: (err) => {
        console.warn('Could not load plan details for planId:', planId, err);
        this.loadingPlan = false;
      },
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
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

    if (this.verificationTicket) {
      this.executeRegistration();
      return;
    }

    this.requestOtp();
  }

  requestOtp(isResend = false): void {
    const email = this.registerForm.value.email?.trim().toLowerCase();
    if (!email) return;

    this.sendingOtp = true;
    this.errorMessage = null;
    this.otpError = null;

    this.authService.requestEmailVerification(email).subscribe({
      next: () => {
        this.sendingOtp = false;
        this.showOtpModal = true;
        this.otpSuccessMessage = isResend
          ? 'تم إعادة إرسال رمز التحقق بنجاح.'
          : 'تم إرسال رمز تحقق (6 أرقام) إلى بريدك الإلكتروني.';
        this.startResendCooldown();
      },
      error: (err) => {
        this.sendingOtp = false;
        const msg = err.error?.message || 'تعذر إرسال رمز التحقق، يرجى المحاولة بعد قليل.';
        const formatted = Array.isArray(msg) ? msg.join(' • ') : msg;
        if (isResend) {
          this.otpError = formatted;
        } else {
          this.errorMessage = formatted;
        }
      },
    });
  }

  confirmOtp(): void {
    const email = this.registerForm.value.email?.trim().toLowerCase();
    const code = this.otpCode.trim();

    if (!code || !/^[0-9]{6}$/.test(code)) {
      this.otpError = 'يرجى إدخال رمز التحقق المكون من 6 أرقام.';
      return;
    }

    this.otpSubmitting = true;
    this.otpError = null;

    this.authService.confirmEmailVerification(email, code).subscribe({
      next: (res) => {
        this.otpSubmitting = false;
        this.verificationTicket = res.verificationTicket;
        this.showOtpModal = false;
        this.executeRegistration();
      },
      error: (err) => {
        this.otpSubmitting = false;
        const msg = err.error?.message;
        this.otpError = Array.isArray(msg)
          ? msg.join(' • ')
          : (msg || 'رمز التحقق غير صحيح أو انتهت صلاحيته.');
      },
    });
  }

  closeOtpModal(): void {
    this.showOtpModal = false;
    this.otpCode = '';
    this.otpError = null;
  }

  private startResendCooldown(): void {
    this.resendCooldown = 60;
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
    this.resendInterval = setInterval(() => {
      if (this.resendCooldown > 1) {
        this.resendCooldown--;
      } else {
        this.resendCooldown = 0;
        clearInterval(this.resendInterval);
        this.resendInterval = null;
      }
    }, 1000);
  }

  private executeRegistration(): void {
    this.submitting = true;
    this.errorMessage = null;

    const formValues = this.registerForm.value;

    const payload = {
      clinicName: formValues.clinicName.trim(),
      name: formValues.fullName.trim(),
      email: formValues.email.trim().toLowerCase(),
      phone: formValues.phone ? formValues.phone.trim() : undefined,
      password: formValues.password,
      planId: this.planId || undefined,
      verificationTicket: this.verificationTicket || undefined,
    };

    this.authService.register(payload).subscribe({
      next: (res) => {
        this.successSso = true;
        this.submitting = false;

        setTimeout(() => {
          this.authService.redirectToErp(res.accessToken);
        }, 1500);
      },
      error: (err) => {
        this.submitting = false;
        console.error('Registration failed:', err);

        const status = err.status;
        const serverMsg = err.error?.message;

        if (status === 400 || status === 409) {
          if (Array.isArray(serverMsg)) {
            this.errorMessage = serverMsg.join(' • ');
          } else if (serverMsg && serverMsg.toLowerCase().includes('email')) {
            this.errorMessage = 'البريد الإلكتروني مسجل بالفعل، يرجى تسجيل الدخول أو استخدام بريد آخر.';
          } else {
            this.errorMessage = serverMsg || 'بيانات التسجيل غير صالحة، يرجى مراجعة الحقول.';
          }
        } else if (status === 429) {
          this.errorMessage = 'تم تجاوز عدد محاولات التسجيل المسموح بها، يرجى الانتظار دقيقة.';
        } else {
          this.errorMessage = 'حدث خطأ غير متوقع أثناء إنشاء الحساب، يرجى المحاولة لاحقاً.';
        }
      },
    });
  }
}
