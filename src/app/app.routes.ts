import { Routes } from '@angular/router';
import { Home } from './features/home/home';

export const routes: Routes = [
  { path: '', component: Home },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/register/register.component').then(
        (m) => m.RegisterComponent
      ),
  },
  {
    path: 'checkout',
    loadComponent: () =>
      import('./features/checkout/checkout.component').then(
        (m) => m.CheckoutComponent
      ),
  },
  {
    path: 'checkout/success',
    loadComponent: () =>
      import('./features/checkout/success/checkout-success.component').then(
        (m) => m.CheckoutSuccessComponent
      ),
  },
  {
    path: 'checkout/failure',
    loadComponent: () =>
      import('./features/checkout/failure/checkout-failure.component').then(
        (m) => m.CheckoutFailureComponent
      ),
  },
  { path: '**', redirectTo: '' },
];

