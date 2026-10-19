export const paymentKeys = {
  all: ['payments'] as const,
  statuses: () => [...paymentKeys.all, 'status'] as const,
  status: (id: string) => [...paymentKeys.statuses(), id] as const,
};
