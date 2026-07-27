import { Component, HostListener, signal } from '@angular/core';
import { HomeHero } from './components/home-hero/home-hero';
import { HomeTrustBuilders } from './components/home-trust-builders/home-trust-builders';
import { HomeAudience } from './components/home-audience/home-audience';
import { HomeShowcase } from './components/home-showcase/home-showcase';
import { HomeStatement } from './components/home-statement/home-statement';
import { HomeCta } from './components/home-cta/home-cta';

@Component({
  selector: 'app-home',
  imports: [HomeHero, HomeTrustBuilders, HomeShowcase, HomeAudience, HomeStatement, HomeCta],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  scrollProgress = signal(0);
  showIndicator = signal(false);

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const scrollOffset = window.scrollY || document.documentElement.scrollTop;
    const windowHeight = document.documentElement.clientHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    const scrollable = documentHeight - windowHeight;
    const progress = Math.min(100, Math.max(0, (scrollOffset / scrollable) * 100));
    
    this.scrollProgress.set(progress);
    this.showIndicator.set(scrollOffset > 300); // Show after scrolling 300px (past hero)
  }
}
