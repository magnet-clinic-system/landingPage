import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PlansService, Plan } from '../../../../core/services/plans.service';

@Component({
  selector: 'app-home-pricing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-pricing.html',
  styleUrl: './home-pricing.css',
})
export class HomePricing implements OnInit {
  private readonly plansService = inject(PlansService);
  private readonly router = inject(Router);

  isYearly: boolean = false;
  plans: Plan[] = [];
  loading: boolean = true;
  error: string | null = null;

  ngOnInit(): void {
    this.loadPlans();
  }

  loadPlans(): void {
    this.loading = true;
    this.error = null;

    this.plansService.getPlans().subscribe({
      next: (data) => {
        // Exclude trial from standard grid (trial is offered in hero/CTA)
        this.plans = data || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load plans:', err);
        this.error = 'تعذر تحميل باقات الأسعار حالياً، يرجى المحاولة لاحقاً';
        this.loading = false;
      },
    });
  }

  /**
   * Filter and order plans based on active monthly/yearly toggle.
   */
  get visiblePlans(): Plan[] {
    if (!this.plans.length) return [];

    // Filter out trial plan for main pricing cards
    const standardPlans = this.plans.filter((p) => !p.name.toUpperCase().startsWith('TRIAL'));

    if (this.isYearly) {
      // Annual plans (>= 300 days)
      return standardPlans
        .filter((p) => p.durationDays >= 300)
        .sort((a, b) => a.price - b.price);
    } else {
      // Monthly plans (<= 31 days)
      const monthly = standardPlans.filter((p) => p.durationDays <= 31);
      // Include Enterprise if present in database for institutional clients
      const enterprise = standardPlans.find((p) => p.name.toUpperCase().includes('ENTERPRISE'));
      if (enterprise && !monthly.some((p) => p.id === enterprise.id)) {
        return [...monthly.sort((a, b) => a.price - b.price), enterprise];
      }
      return monthly.sort((a, b) => a.price - b.price);
    }
  }

  choosePlan(planId?: string): void {
    if (planId) {
      this.router.navigate(['/register'], {
        queryParams: { planId },
      });
    } else {
      this.router.navigate(['/register']);
    }
  }

  getPlanArabicTitle(name: string): string {
    const key = name.toUpperCase();
    if (key.includes('BASIC')) return 'طبيب فردي';
    if (key.includes('PRO')) return 'العيادة الذكية';
    if (key.includes('ENTERPRISE')) return 'مستشفى / مجمع طبي';
    return name;
  }

  getPlanArabicSubtitle(plan: Plan): string {
    if (plan.description) return plan.description;
    const key = plan.name.toUpperCase();
    if (key.includes('BASIC')) return 'طبيب فردي مع موظف استقبال — البداية الرقمية الأسهل';
    if (key.includes('PRO')) return 'الخيار الأمثل للعيادات النشطة والمتطورة';
    if (key.includes('ENTERPRISE')) return 'حلول متكاملة للمجمعات الطبية متعددة التخصصات';
    return 'خطة متكاملة لإدارة عيادتك الطبية';
  }

  getPlanFeatures(plan: Plan): string[] {
    const features: string[] = [];

    features.push(`${plan.maxUsers} ${plan.maxUsers > 1 ? 'مستخدمين / أطباء' : 'مستخدم واحد'}`);
    features.push(`${plan.maxBranches} ${plan.maxBranches > 1 ? 'فروع طبية' : 'فرع واحد'}`);
    
    const key = plan.name.toUpperCase();
    if (key.includes('BASIC')) {
      features.push('إدارة المواعيد وسجلات المرضى');
      features.push('الفواتير والتقارير المالية الأساسية');
      features.push('١٠٠ رصيد ذكاء اصطناعي / شهر');
    } else if (key.includes('PRO')) {
      features.push('ملف تخصص طبي متكامل');
      features.push('تكامل واتساب لإشعارات وتذكير المرضى');
      features.push('روشتة إلكترونية ذكية وطباعة فورية');
      features.push('١,٠٠٠ رصيد ذكاء اصطناعي / شهر');
      features.push('دعم فني مخصص وأولوية في الاستجابة');
    } else if (key.includes('ENTERPRISE')) {
      features.push('قنوات واتساب غير محدودة');
      features.push('إدارة الصلاحيات المتقدمة لكل موظف');
      features.push('تكامل API كامل وترحيل بيانات العيادة');
      features.push('اتفاقية مستوى خدمة SLA وضمان التشغيل');
      features.push('تدريب مباشر لطاقم العمل ومدير حساب مخصص');
    } else {
      features.push('كافة مميزات النظام الأساسية');
      features.push('تحديثات أمان مستمرة ونسخ احتياطي يومي');
    }

    return features;
  }
}
