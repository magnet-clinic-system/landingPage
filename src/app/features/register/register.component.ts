import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';
import { PlansService, Plan } from '../../core/services/plans.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
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

  // Field validity helper
  isFieldInvalid(fieldName: string): boolean {
    const field = this.registerForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched || this.submitting));
  }

  getFieldError(fieldName: string): { ar: string; en: string } | null {
    const field = this.registerForm.get(fieldName);
    if (!field || !field.errors) return null;

    if (field.errors['required']) {
      switch (fieldName) {
        case 'fullName':
          return { ar: 'اسم الطبيب / المدير مطلوب', en: 'Full name is required' };
        case 'clinicName':
          return { ar: 'اسم العيادة أو المركز الطبي مطلوب', en: 'Clinic name is required' };
        case 'email':
          return { ar: 'البريد الإلكتروني مطلوب', en: 'Email address is required' };
        case 'password':
          return { ar: 'كلمة المرور مطلوبة', en: 'Password is required' };
        case 'terms':
          return { ar: 'يجب الموافقة على الشروط والأحكام', en: 'You must accept the terms & conditions' };
      }
    }

    if (field.errors['minlength']) {
      const min = field.errors['minlength'].requiredLength;
      if (fieldName === 'password') {
        return { ar: `كلمة المرور يجب ألا تقل عن ${min} أحرف`, en: `Password must be at least ${min} characters` };
      }
      return { ar: `يجب إدخال ${min} أحرف على الأقل`, en: `Must be at least ${min} characters` };
    }

    if (field.errors['email']) {
      return { ar: 'يرجى إدخال بريد إلكتروني صحيح (مثال: doctor@clinic.com)', en: 'Please enter a valid email address' };
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
    };

    this.authService.register(payload).subscribe({
      next: (res) => {
        // Trigger SSO Handoff screen
        this.successSso = true;
        this.submitting = false;

        // Smooth redirect to ERP with access token
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
