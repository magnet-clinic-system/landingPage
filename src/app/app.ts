import { Component, signal, inject, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Navbar } from './core/components/navbar/navbar';
import { NotificationService } from './core/services/notification.service';
import * as AOS from 'aos';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit {
  protected readonly title = signal('saas-app');
  protected readonly notificationService = inject(NotificationService);

  ngAfterViewInit() {
    setTimeout(() => {
      AOS.init({
        once: true,
        duration: 800,
        offset: 50,
      });
      AOS.refresh();
    }, 100);
  }
}
