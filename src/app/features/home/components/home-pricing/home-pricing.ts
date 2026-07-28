import { Component } from '@angular/core';
import { NgStyle } from '@angular/common';

@Component({
  selector: 'app-home-pricing',
  imports: [NgStyle],
  templateUrl: './home-pricing.html',
  styleUrl: './home-pricing.css',
})
export class HomePricing {
  // متغير لتحديد هل العرض شهري أم سنوي (الافتراضي شهري)
  isYearly: boolean = false;
}
