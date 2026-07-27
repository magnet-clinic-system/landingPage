import { Component, signal, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './core/components/navbar/navbar';
import * as AOS from 'aos';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit {
  protected readonly title = signal('saas-app');

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
