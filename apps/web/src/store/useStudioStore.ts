import { DEFAULT_DEVICES, defaultDeviceRegistry } from '@deviceview/device-registry';
import {
  normalizeInputUrl,
  type ActiveEngineType,
  type ConsoleLogEntry,
  type DeviceBrand,
  type DeviceCategory,
  type DeviceDefinition,
  type DeviceOrientation,
  type JsErrorEntry,
  type NetworkRequestEntry,
  type PreviewEngineMode,
  type ProbeResult,
  type WorkspacePreset,
} from '@deviceview/shared';

const STORAGE_KEY = 'deviceview_studio_workspace_v1';

export interface StudioState {
  theme: 'light' | 'dark';
  devices: DeviceDefinition[];
  selectedDeviceId: string;
  secondaryDeviceId: string;
  compareMode: boolean;
  orientation: DeviceOrientation;
  zoom: number;
  autoFit: boolean;
  showFrame: boolean;
  showMobileBrowserBar: boolean;
  rightPanelOpen: boolean;

  urlInput: string;
  activeUrl: string;
  engineMode: PreviewEngineMode;
  resolvedEngine: ActiveEngineType;
  isProbing: boolean;
  probeResult: ProbeResult | null;
  reloadCounter: number;
  autoRefreshSec: number;

  searchQuery: string;
  brandFilter: DeviceBrand | 'All' | 'Tablet' | 'Foldable' | 'Desktop';
  sidebarTab: 'devices' | 'favorites' | 'presets';
  favoriteDeviceIds: string[];
  recentUrls: string[];
  presets: WorkspacePreset[];

  customViewport: {
    enabled: boolean;
    width: number;
    height: number;
    dpr: number;
  };

  consoleLogs: ConsoleLogEntry[];
  jsErrors: JsErrorEntry[];
  networkRequests: NetworkRequestEntry[];
  activeDevTab: 'console' | 'errors' | 'network' | 'security';
  toastMessage: string | null;
  latestBrowserFrame: string | null;
  browserSessionStatus: 'idle' | 'connecting' | 'connected' | 'error';
}

function loadPersisted(): Partial<StudioState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePersisted(state: StudioState): void {
  try {
    const subset = {
      theme: state.theme,
      selectedDeviceId: state.selectedDeviceId,
      secondaryDeviceId: state.secondaryDeviceId,
      compareMode: state.compareMode,
      orientation: state.orientation,
      engineMode: state.engineMode,
      showFrame: state.showFrame,
      favoriteDeviceIds: state.favoriteDeviceIds,
      recentUrls: state.recentUrls,
      presets: state.presets,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subset));
  } catch {
    // ignore storage quota errors
  }
}

const persisted = typeof window !== 'undefined' ? loadPersisted() : {};

let state: StudioState = {
  theme: persisted.theme || 'light',
  devices: DEFAULT_DEVICES,
  selectedDeviceId: persisted.selectedDeviceId || 'iphone-18-pro-max',
  secondaryDeviceId: persisted.secondaryDeviceId || 'galaxy-s26-ultra',
  compareMode: persisted.compareMode || false,
  orientation: persisted.orientation || 'portrait',
  zoom: 0.72,
  autoFit: true,
  showFrame: persisted.showFrame ?? true,
  showMobileBrowserBar: true,
  rightPanelOpen: true,

  urlInput: '/api/demo-site',
  activeUrl: '/api/demo-site',
  engineMode: persisted.engineMode || 'auto',
  resolvedEngine: 'direct',
  isProbing: false,
  probeResult: null,
  reloadCounter: 0,
  autoRefreshSec: 0,

  searchQuery: '',
  brandFilter: 'All',
  sidebarTab: 'devices',
  favoriteDeviceIds: persisted.favoriteDeviceIds || [
    'iphone-18-pro-max',
    'galaxy-s26-ultra',
    'pixel-10-pro-xl',
    'ipad-pro-13-m5',
  ],
  recentUrls: persisted.recentUrls || [
    '/api/demo-site',
    '/api/demo-blocked',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://example.com',
  ],
  presets: persisted.presets || [
    {
      id: 'preset-flagship-2026',
      name: 'iPhone 18 Pro Max vs Galaxy S26 Ultra',
      url: '/api/demo-site',
      primaryDeviceId: 'iphone-18-pro-max',
      secondaryDeviceId: 'galaxy-s26-ultra',
      compareMode: true,
      orientation: 'portrait',
      engineMode: 'auto',
      zoom: 0.65,
      showFrame: true,
      customViewport: { enabled: false, width: 440, height: 956, dpr: 3 },
      createdAt: '2026-10-15T00:00:00.000Z',
    },
  ],

  customViewport: {
    enabled: false,
    width: 440,
    height: 956,
    dpr: 3,
  },

  consoleLogs: [],
  jsErrors: [],
  networkRequests: [],
  activeDevTab: 'console',
  toastMessage: null,
  latestBrowserFrame: null,
  browserSessionStatus: 'idle',
};

const listeners = new Set<() => void>();

export function getStudioState(): StudioState {
  return state;
}

export function setStudioState(updater: Partial<StudioState> | ((prev: StudioState) => Partial<StudioState>)): void {
  const patch = typeof updater === 'function' ? updater(state) : updater;
  state = { ...state, ...patch };
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', state.theme === 'dark');
  }
  savePersisted(state);
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeStudioStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showStudioToast(message: string): void {
  setStudioState({ toastMessage: message });
  setTimeout(() => {
    if (state.toastMessage === message) {
      setStudioState({ toastMessage: null });
    }
  }, 3200);
}

export function getSelectedDevice(st: StudioState = state): DeviceDefinition {
  return (
    st.devices.find((d) => d.id === st.selectedDeviceId) ||
    defaultDeviceRegistry.getById(st.selectedDeviceId) ||
    st.devices[0]
  );
}

export function getSecondaryDevice(st: StudioState = state): DeviceDefinition {
  return (
    st.devices.find((d) => d.id === st.secondaryDeviceId) ||
    defaultDeviceRegistry.getById(st.secondaryDeviceId) ||
    st.devices[1] ||
    st.devices[0]
  );
}

export function getActiveViewportForDevice(
  device: DeviceDefinition,
  st: StudioState = state,
  isPrimary = true
): { width: number; height: number; dpr: number } {
  if (isPrimary && st.customViewport.enabled) {
    const w = st.orientation === 'landscape'
      ? Math.max(st.customViewport.width, st.customViewport.height)
      : Math.min(st.customViewport.width, st.customViewport.height);
    const h = st.orientation === 'landscape'
      ? Math.min(st.customViewport.width, st.customViewport.height)
      : Math.max(st.customViewport.width, st.customViewport.height);
    return { width: w, height: h, dpr: st.customViewport.dpr };
  }
  return defaultDeviceRegistry.getEffectiveViewport(device, st.orientation);
}

export async function triggerUrlPreview(rawUrl?: string): Promise<void> {
  const input = (rawUrl !== undefined ? rawUrl : state.urlInput).trim();
  if (!input) {
    showStudioToast('Vui lòng nhập địa chỉ URL cần kiểm thử.');
    return;
  }

  const isLocalRelative = input.startsWith('/');
  const targetUrl = isLocalRelative ? `${window.location.origin}${input}` : normalizeInputUrl(input);

  const updatedRecents = [input, ...state.recentUrls.filter((u) => u !== input)].slice(0, 10);

  setStudioState({
    urlInput: input,
    activeUrl: targetUrl,
    isProbing: true,
    recentUrls: updatedRecents,
  });

  try {
    const resp = await fetch('/api/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    });
    const probe: ProbeResult = await resp.json();

    let nextEngine: ActiveEngineType = 'direct';
    if (state.engineMode === 'browser') {
      nextEngine = 'browser';
    } else if (state.engineMode === 'direct') {
      nextEngine = 'direct';
    } else {
      // Auto mode: use direct if embeddable, otherwise automatically switch to Browser Mode!
      nextEngine = probe.embeddableInIframe ? 'direct' : 'browser';
    }

    setStudioState({
      isProbing: false,
      probeResult: probe,
      resolvedEngine: nextEngine,
      reloadCounter: state.reloadCounter + 1,
    });

    if (!probe.embeddableInIframe && state.engineMode === 'auto') {
      showStudioToast(`Website chặn iframe (${probe.restrictionCode}) — đã tự động chuyển sang Browser Mode!`);
    }
  } catch (err: unknown) {
    setStudioState({
      isProbing: false,
      resolvedEngine: state.engineMode === 'browser' ? 'browser' : 'direct',
      reloadCounter: state.reloadCounter + 1,
    });
  }
}
