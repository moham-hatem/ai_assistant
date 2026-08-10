import { useSyncExternalStore } from 'react';
import {
  getSpaNavigationBlocked,
  subscribeSpaNavigationGuard,
} from './spa-navigation-guard';

export function useSpaNavigationBlocked(): boolean {
  return useSyncExternalStore(
    subscribeSpaNavigationGuard,
    getSpaNavigationBlocked,
    () => false,
  );
}
