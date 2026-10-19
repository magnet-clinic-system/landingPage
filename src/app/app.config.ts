import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  QueryClient,
  QueryCache,
  MutationCache,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';

import { errorInterceptor } from './core/interceptors/error.interceptor';
import { GlobalErrorHandler } from './core/services/global-error-handler';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideTanStackQuery(
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            console.error(
              `[Global TanStack Query Error] [${JSON.stringify(query.queryKey)}]:`,
              error
            );
          },
        }),
        mutationCache: new MutationCache({
          onError: (error) => {
            console.error('[Global TanStack Mutation Error]:', error);
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 2, // 2 minutes fresh cache window
            gcTime: 1000 * 60 * 10, // 10 minutes garbage collection time
            refetchOnWindowFocus: true, // Auto-sync multi-user updates on tab focus
            retry: 1, // Retry failed queries once before throwing
          },
        },
      })
    ),
  ],
};

