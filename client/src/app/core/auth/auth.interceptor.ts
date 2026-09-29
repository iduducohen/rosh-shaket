import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Adds the bearer token to API calls and retries once after a silent refresh on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  if (!req.url.startsWith(environment.apiBaseUrl) || req.url.includes('/api/auth/refresh')) return next(req);

  return next(withToken(req, auth.accessToken)).pipe(
    catchError((err: unknown) => {
      const isAuthCall = req.url.includes('/api/auth/') && !req.url.endsWith('/api/auth/me');
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !auth.accessToken || isAuthCall) return throwError(() => err);
      return from(auth.refresh()).pipe(
        switchMap(ok => (ok ? next(withToken(req, auth.accessToken)) : throwError(() => err)))
      );
    })
  );
};
