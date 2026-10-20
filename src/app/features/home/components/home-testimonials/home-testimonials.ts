import { Component, ElementRef, ViewChild } from '@angular/core';

@Component({
  selector: 'app-home-testimonials',
  imports: [],
  templateUrl: './home-testimonials.html',
  styleUrl: './home-testimonials.css',
})
export class HomeTestimonials {
  // بنمسك السلايدر من الـ HTML
  @ViewChild('reviewsSlider') slider!: ElementRef;

  // دالة السكرول (التحريك يمين وشمال)
  scrollReviews(direction: number) {
    if (this.slider) {
      const container = this.slider.nativeElement;
      const card = container.firstElementChild as HTMLElement | null;
      // حساب عرض الكارت الفعلي + المسافة البينية (24px)
      const cardWidth = card ? card.offsetWidth + 24 : 400;
      const scrollAmount = direction * -cardWidth;
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  }
}
