import type { PwaCopy } from './types';

export const enPwaCopy: PwaCopy = {
  compatibilityAction: 'Update or reload',
  compatibilityChecking: 'Checking interface and service compatibility. Your question will stay here.',
  composerOffline: 'You are offline. Your question stays here; reconnect to send it.',
  incompatibleBody: 'This open interface does not match the current service version. Reload after saving any important work.',
  incompatibleTitle: 'Interface update required',
  offlineBody: 'You can keep the interface open and browse what was already shown, but search, answers, and admin actions need an internet connection.',
  offlineTitle: 'You are offline',
  unavailableBody: 'Service compatibility could not be checked. You can continue; the usual service error will appear if a request cannot be completed.',
  unavailableTitle: 'Service version could not be checked',
  updateAction: 'Update now',
  updateBody: 'A newer Daleel interface is ready. It will not be applied until you choose to update.',
  updateTitle: 'Update ready',
};
