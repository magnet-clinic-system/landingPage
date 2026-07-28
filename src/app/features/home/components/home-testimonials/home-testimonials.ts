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
      // 400 هو تقريباً عرض الكارت الواحد + المسافة
      // في الـ RTL (العربي) بنعكس الاتجاه
      const scrollAmount = direction * -400; 
      this.slider.nativeElement.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  }
}
