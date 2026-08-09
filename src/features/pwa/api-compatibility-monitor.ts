import type { ApiCompatibilityState } from '../../pwa/check-api-compatibility.ts';
import type { PwaStatusAction } from './model.ts';

export type CompatibilityCheck = () => Promise<ApiCompatibilityState>;

export function startApiCompatibilityCheck(
  checkCompatibility: CompatibilityCheck,
  dispatch: (action: PwaStatusAction) => void,
): () => void {
  let isCurrent = true;
  dispatch({ type: 'compatibility_check_started' });

  void checkCompatibility().then(
    (result) => {
      if (isCurrent) dispatch({ status: result.status, type: 'compatibility_checked' });
    },
    () => {
      if (isCurrent) dispatch({ status: 'unavailable', type: 'compatibility_checked' });
    },
  );

  return () => { isCurrent = false; };
}
