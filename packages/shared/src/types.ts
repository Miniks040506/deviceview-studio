export type DeviceCategory = 'phone' | 'tablet' | 'foldable' | 'laptop' | 'desktop';
export type DeviceBrand = 'Apple' | 'Samsung' | 'Google' | 'Generic';
export type DeviceOrientation = 'portrait' | 'landscape';
export type CutoutType = 'dynamic-island' | 'notch' | 'punch-hole-center' | 'punch-hole-left' | 'macbook-notch' | 'none';
export type VerificationStatus = 'verified' | 'estimated';

export interface FrameProfile {
  borderRadius: number;
  screenBorderRadius: number;
  bezelWidth: number;
  frameColor: string;
  accentColor: string;
  cutout: CutoutType;
  cutoutWidth?: number;
  cutoutHeight?: number;
  hasHomeIndicator: boolean;
  hasSideButtons: boolean;
  aspectRatioLabel: string;
}

export interface DeviceDefinition {
  id: string;
  name: string;
  brand: DeviceBrand;
  series: string;
  category: DeviceCategory;
   releaseYear: number;
  viewport: {
    width: number;
    height: number;
  };
  physicalResolution: {
    width: number;
    height: number;
  } | null;
  dpr: number;
  screenDiagonalInches: number | null;
  ppi: number | null;
  defaultOrientation: DeviceOrientation;
  userAgent: string;
  touchCapable: boolean;
  frame: FrameProfile;
  verificationStatus: VerificationStatus;
  verificationNotes?: string;
  sourceUrl: string;
}

export type PreviewEngineMode = 'auto' | 'direct' | 'browser';
export type ActiveEngineType = 'direct' | 'browser';

export type RestrictionReasonCode =
  | 'NONE'
  | 'X_FRAME_OPTIONS_DENY'
  | 'X_FRAME_OPTIONS_SAMEORIGIN'
  | 'CSP_FRAME_ANCESTORS_BLOCKED'
  | 'CAPTCHA_CHALLENGE'
  | 'DRM_PROTECTED'
  | 'AUTH_REQUIRED'
  | 'NETWORK_UNREACHABLE'
  | 'SSRF_BLOCKED'
  | 'LOCALHOST_CLOUD_TUNNEL_REQUIRED'
  | 'TLS_CERTIFICATE_ERROR'
  | 'TIMEOUT';

export interface ProbeResult {
  requestedUrl: string;
  normalizedUrl: string;
  finalUrl: string;
  reachable: boolean;
  statusCode: number | null;
  embeddableInIframe: boolean;
  recommendedEngine: ActiveEngineType;
  restrictionCode: RestrictionReasonCode;
  restrictionMessage: string | null;
  headers: {
    xFrameOptions: string | null;
    contentSecurityPolicy: string | null;
    frameAncestorsDirective: string | null;
    contentType: string | null;
    server: string | null;
  };
  isLocalhost: boolean;
  viaCompanionTunnel: boolean;
  checkedAt: string;
}

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  location?: string;
}

export interface JsErrorEntry {
  id: string;
  timestamp: string;
  message: string;
  stack?: string;
  source?: string;
}

export interface NetworkRequestEntry {
  id: string;
  requestId: string;
  timestamp: string;
  method: string;
  url: string;
  resourceType: string;
  status: number | null;
  statusText?: string;
  mimeType?: string;
  durationMs: number | null;
  failed?: boolean;
  errorText?: string;
}

export interface BrowserSessionConfig {
  sessionId?: string;
  url: string;
  width: number;
  height: number;
  dpr: number;
  userAgent?: string;
  touchCapable?: boolean;
  tunnelId?: string;
}

export interface WorkspacePreset {
  id: string;
  name: string;
  url: string;
  primaryDeviceId: string;
  secondaryDeviceId: string | null;
  compareMode: boolean;
  orientation: DeviceOrientation;
  engineMode: PreviewEngineMode;
  zoom: number;
  showFrame: boolean;
  customViewport: {
    enabled: boolean;
    width: number;
    height: number;
    dpr: number;
  };
  createdAt: string;
}
