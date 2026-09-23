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
      const annual = standardPlans.filter((p) => p.durationDays >= 300);
      return annual.sort((a, b) => {
        const order = ['BASIC', 'PRO', 'ENTERPRISE'];
        const getIndex = (name: string) => order.findIndex((k) => name.toUpperCase().includes(k));
        return getIndex(a.name) - getIndex(b.name);
      });
    } else {
      // Monthly plans (<= 31 days)
      const monthly = standardPlans.filter((p) => p.durationDays <= 31);
      return monthly.sort((a, b) => {
        const order = ['BASIC', 'PRO', 'ENTERPRISE'];
        const getIndex = (name: string) => order.findIndex((k) => name.toUpperCase().includes(k));
        return getIndex(a.name) - getIndex(b.name);
      });
    }
  }

  choosePlan(planId?: string): void {
    if (planId) {
      this.router.navigate(['/checkout'], {
        queryParams: {
          planId,
          billingCycle: this.isYearly ? 'yearly' : 'monthly',
        },
      });
    } else {
      this.router.navigate(['/checkout']);
    }
  }

  isEnterprise(plan: Plan): boolean {
    return plan.name.toUpperCase().includes('ENTERPRISE');
  }

  isCustomPricing(plan: Plan): boolean {
    return this.isEnterprise(plan) && (this.isYearly || Number(plan.price) === 0 || plan.durationDays >= 300);
  }

  getPlanArabicTitle(name: string): string {
    const key = name.toUpperCase();
    if (key.includes('BASIC') || key.includes('STARTER')) return 'الأساسية (Starter)';
    if (key.includes('PRO')) return 'المتقدمة (Professional)';
    if (key.includes('ENTERPRISE')) return 'المؤسسية (Enterprise)';
    return name;
  }

  getPlanArabicSubtitle(plan: Plan): string {
    const key = plan.name.toUpperCase();
    if (key.includes('BASIC') || key.includes('STARTER')) return 'الفئة المستهدفة: عيادة فردية';
    if (key.includes('PRO')) return 'الفئة المستهدفة: مجمعات طبية (Polyclinics)';
    if (key.includes('ENTERPRISE')) return 'الفئة المستهدفة: سلاسل العيادات الكبرى';
    return plan.description || '';
  }

  getPlanFeatures(plan: Plan): string[] {
    const features: string[] = [];
    const key = plan.name.toUpperCase();

    if (key.includes('BASIC') || key.includes('STARTER')) {
      features.push('فرع واحد فقط');
      features.push('إدارة مواعيد وفواتير أساسية');
      features.push('بوابة حجز للمرضى (agent-web)');
      features.push('تقارير مبسطة');
    } else if (key.includes('PRO')) {
      features.push('حتى 3 فروع');
      features.push('تفعيل صارم للصلاحيات (RBAC)');
      features.push('عزل تام لبيانات موظفي الاستقبال');
      features.push('السجل المالي غير القابل للحذف');
      features.push('تكامل واتساب لإشعارات وتذكير المرضى');
      features.push('روشتة إلكترونية ذكية وطباعة فورية');
    } else if (key.includes('ENTERPRISE')) {
      features.push('فروع غير محدودة');
      features.push('لوحة تحكم الإدارة العليا (saas)');
      features.push('استضافة مخصصة');
      features.push('أولوية في الدعم الفني 24/7');
      features.push('قنوات واتساب غير محدودة');
      features.push('اتفاقية مستوى خدمة SLA وضمان التشغيل');
    } else {
      features.push('كافة مميزات النظام الأساسية');
      features.push('تحديثات أمان مستمرة ونسخ احتياطي يومي');
    }

    return features;
  }
}
