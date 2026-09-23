import { Component, HostListener, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home-cta',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './home-cta.html',
  styleUrl: './home-cta.css'
})
export class HomeCta {
  private readonly router = inject(Router);
  
  planeOffset = 0;
  email = '';

  @HostListener('window:scroll')
  onWindowScroll() {
    const element = document.getElementById('subscribe');
    if (element) {
      const rect = element.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate parallax offset based on element position in viewport
      // As you scroll down (rect.top decreases), the offset increases (moves down)
      const offset = ((windowHeight / 2) - rect.top) * 0.15;
      
      // Constrain the movement to avoid flying too far off screen
      this.planeOffset = Math.max(-100, Math.min(100, offset));
    }
  }

  startTrial() {
    this.router.navigate(['/register'], {
      queryParams: this.email ? { email: this.email.trim() } : {}
    });
  }
}

