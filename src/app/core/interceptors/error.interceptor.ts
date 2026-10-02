import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { NotificationService } from '../services/notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notification = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'حدث خطأ غير متوقع';

      if (error.error && typeof error.error === 'object' && error.error.message) {
        errorMessage = Array.isArray(error.error.message)
          ? error.error.message.join(', ')
          : error.error.message;
      } else if (typeof error.error === 'string' && error.error.length > 0) {
        errorMessage = error.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (error.status === 400) {
        notification.error(errorMessage || 'طلب غير صالح، يرجى التأكد من صحة البيانات المدخلة.');
      } else if (error.status === 401) {
        notification.warning('انتهت صلاحية جلسة التحقق، يرجى المحاولة مرة أخرى.');
      } else if (error.status === 403) {
        notification.error(errorMessage || 'ليس لديك الصلاحية الكافية لإتمام هذا الإجراء.');
      } else if (error.status === 404) {
        notification.error(errorMessage || 'بيانات الاشتراك أو الباقة المطلوبة غير متوفرة.');
      } else if (error.status === 409) {
        notification.error(errorMessage || 'تعارض: البريد الإلكتروني أو بيانات الحساب مسجلة مسبقاً.');
      } else if (error.status === 422) {
        notification.error(errorMessage || 'تعذر معالجة الطلب لمخالفته شروط الاشتراك أو شروط الدفع.');
      } else if (error.status === 429) {
        notification.warning('تم تجاوز عدد المحاولات المسموح بها، يرجى الانتظار قليلاً.');
      } else if (error.status >= 500) {
        notification.error('حدث خطأ في الخادم أثناء معالجة العملية، يرجى المحاولة بعد قليل.');
      }

      return throwError(() => error);
    })
  );
};
