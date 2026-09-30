import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Note: inject() must run before the first await (it only works synchronously in the guard's injection context).

/** App screens: signed in, or explicitly continuing as a guest. */
export const sessionGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.isSignedIn() || auth.hasSession() || auth.guest() ? true : router.parseUrl('/login');
};

/** Login screen: skip it when already signed in — resume workspace. */
export const loginGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.init();
  return auth.isSignedIn() || auth.hasSession() ? router.parseUrl('/resume') : true;
};
