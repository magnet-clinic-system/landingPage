import { Component, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { PaymentService } from '../../services/payment.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  private readonly router = inject(Router);
  private readonly paymentService = inject(PaymentService);

  isMenuOpen = signal(false);
  erpUrl = environment.erpUrl;

  get isCheckoutPage(): boolean {
    return this.router.url.includes('/checkout');
  }

  get isAuthenticated(): boolean {
    return !!this.paymentService.getStoredToken();
  }

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
  }

  closeMenu() {
    this.isMenuOpen.set(false);
  }
}
