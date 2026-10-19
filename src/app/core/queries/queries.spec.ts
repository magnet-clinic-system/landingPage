import { describe, it, expect } from 'vitest';
import { planKeys } from './plan.keys';
import { paymentKeys } from './payment.keys';

describe('Query Key Factories (SaaS)', () => {
  it('should generate hierarchical plan query keys', () => {
    expect(planKeys.all).toEqual(['plans']);
    expect(planKeys.lists()).toEqual(['plans', 'list']);
    expect(planKeys.details()).toEqual(['plans', 'detail']);
    expect(planKeys.detail('plan-123')).toEqual(['plans', 'detail', 'plan-123']);
  });

  it('should generate hierarchical payment query keys', () => {
    expect(paymentKeys.all).toEqual(['payments']);
    expect(paymentKeys.statuses()).toEqual(['payments', 'status']);
    expect(paymentKeys.status('pay-456')).toEqual(['payments', 'status', 'pay-456']);
  });
});
