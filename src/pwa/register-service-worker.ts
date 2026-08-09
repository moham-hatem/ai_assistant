import {
  PWA_APPLY_UPDATE_EVENT,
  PWA_UPDATE_READY_EVENT,
  type PwaUpdateReadyDetail,
} from './update-contract.ts';

interface VersionMessage {
  type: 'DALEEL_SW_VERSION';
  version: string;
}

export type ServiceWorkerRegistrationResult = 'registered' | 'skipped' | 'failed';

export interface ServiceWorkerRuntime {
  browserWindow?: Window;
  isProduction: boolean;
  serviceWorker?: ServiceWorkerContainer;
}

export async function registerServiceWorker(
  runtime: ServiceWorkerRuntime = readBrowserRuntime(),
): Promise<ServiceWorkerRegistrationResult> {
  if (!runtime.isProduction || !runtime.serviceWorker || !runtime.browserWindow) return 'skipped';

  try {
    await installRegistration(runtime.serviceWorker, runtime.browserWindow);
    return 'registered';
  } catch {
    return 'failed';
  }
}

async function installRegistration(
  serviceWorker: ServiceWorkerContainer,
  browserWindow: Window,
): Promise<void> {
  const registration = await serviceWorker.register('/sw.js');
  let waitingWorker = registration.waiting;
  let reloadRequested = false;
  let didReload = false;

  serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadRequested || didReload) return;
    didReload = true;
    browserWindow.location.reload();
  });

  browserWindow.addEventListener(PWA_APPLY_UPDATE_EVENT, () => {
    if (!waitingWorker) return;
    reloadRequested = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });

  async function announceUpdate(worker: ServiceWorker): Promise<void> {
    waitingWorker = worker;
    const detail: PwaUpdateReadyDetail = { version: await readWorkerVersion(worker, browserWindow) };
    browserWindow.dispatchEvent(new CustomEvent(PWA_UPDATE_READY_EVENT, { detail }));
  }

  if (waitingWorker) void announceUpdate(waitingWorker).catch(() => undefined);

  registration.addEventListener('updatefound', () => {
    const installingWorker = registration.installing;
    if (!installingWorker) return;
    installingWorker.addEventListener('statechange', () => {
      if (installingWorker.state === 'installed' && serviceWorker.controller) {
        void announceUpdate(installingWorker).catch(() => undefined);
      }
    });
  });
}

function readWorkerVersion(worker: ServiceWorker, browserWindow: Window): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let timeout: number | undefined;

    function finish(version: string | null): void {
      if (timeout !== undefined) browserWindow.clearTimeout(timeout);
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
      resolve(version);
    }

    timeout = browserWindow.setTimeout(() => finish(null), 1_000);
    channel.port1.onmessage = (event: MessageEvent<VersionMessage>) => {
      finish(event.data?.type === 'DALEEL_SW_VERSION' ? event.data.version : null);
    };
    try {
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

function readBrowserRuntime(): ServiceWorkerRuntime {
  const isProduction = (import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD === true;
  return {
    browserWindow: window,
    isProduction,
    serviceWorker: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
  };
}
