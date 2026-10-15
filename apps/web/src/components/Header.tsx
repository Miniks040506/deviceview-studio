import React from '../runtime/react-shim';
import type { PreviewEngineMode } from '@deviceview/shared';
import {
  getActiveViewportForDevice,
  getSelectedDevice,
  setStudioState,
  showStudioToast,
  triggerUrlPreview,
  type StudioState,
} from '../store/useStudioStore';
import { exportDeviceScreenshotPng } from '../utils/screenshot';

export function Header({ state }: { state: StudioState }) {
  const primaryDevice = getSelectedDevice(state);
  const viewport = getActiveViewportForDevice(primaryDevice, state, true);

  const handleFormSubmit = (e: Event) => {
    e.preventDefault();
    triggerUrlPreview(state.urlInput);
  };

  const handleCopyShareUrl = () => {
    const shareUrl = new URL(window.location.href);
    shareUrl.searchParams.set('url', state.urlInput);
    shareUrl.searchParams.set('device', state.selectedDeviceId);
    shareUrl.searchParams.set('orientation', state.orientation);
    shareUrl.searchParams.set('engine', state.engineMode);
    try {
      navigator.clipboard.writeText(shareUrl.toString());
    } catch {}
    showStudioToast('Đã sao chép liên kết cấu hình Workspace vào Clipboard!');
  };

  return (
    <header className="studio-header">
      {/* Left: Brand Logo & Identity */}
      <div className="brand-cluster">
        <svg width="38" height="38" viewBox="0 0 64 64" fill="none">
          <defs>
            <linearGradient id="hdrLogoGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="55%" stopColor="#4F46E5" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="15" fill="url(#hdrLogoGrad)" />
          <rect x="13" y="11" width="24" height="42" rx="5" fill="#0F172A" stroke="#E0E7FF" strokeWidth="2.5" />
          <rect x="21" y="14.5" width="8" height="2.5" rx="1.25" fill="#60A5FA" />
          <rect x="28" y="19" width="23" height="34" rx="4.5" fill="#1E1B4B" stroke="#38BDF8" strokeWidth="2.5" />
          <circle cx="39.5" cy="23.5" r="1.6" fill="#38BDF8" />
        </svg>
        <div>
          <div className="brand-title-row">
            <span className="brand-name">DeviceView</span>
            <span className="badge-beta">Studio</span>
          </div>
          <div className="brand-subtitle">Preview your website on real devices</div>
        </div>
      </div>

      {/* Center: URL Input Bar + Engine Selector + Preview Action */}
      <form className="url-omnibar" onSubmit={handleFormSubmit as any}>
        <div className="url-input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <input
            id="url-omnibar-input"
            className="url-input"
            type="text"
            value={state.urlInput}
            placeholder="Nhập URL website, localhost:3000, localhost:5173 hoặc IP..."
            onChange={(e: any) => setStudioState({ urlInput: e.target.value })}
          />
          <button
            type="button"
            title="Chọn nhanh trang kiểm thử mẫu"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
              padding: '2px 6px',
            }}
            onClick={() => {
              const nextUrl = state.urlInput === '/api/demo-site' ? '/api/demo-blocked' : '/api/demo-site';
              triggerUrlPreview(nextUrl);
            }}
          >
            {state.urlInput === '/api/demo-blocked' ? '🔒 Demo Chặn Iframe' : '⚡ Demo Tương Tác'}
          </button>
        </div>

        <button id="btn-preview-go" type="submit" className="btn-primary">
          {state.isProbing ? 'Đang tải...' : 'Go'}
        </button>

        <select
          id="select-engine-mode"
          className="engine-select"
          title="Chế độ Preview Engine (Direct Iframe hoặc Remote Browser Playwright/CDP)"
          value={state.engineMode}
          onChange={(e: any) => {
            const mode = e.target.value as PreviewEngineMode;
            const resolved =
              mode === 'browser'
                ? 'browser'
                : mode === 'direct'
                ? 'direct'
                : state.probeResult && !state.probeResult.embeddableInIframe
                ? 'browser'
                : 'direct';
            setStudioState({ engineMode: mode, resolvedEngine: resolved });
            showStudioToast(
              `Đã chuyển chế độ Engine sang: ${
                mode === 'auto' ? `Auto (${resolved.toUpperCase()})` : mode.toUpperCase()
              }`
            );
          }}
        >
          <option value="auto">Engine: Auto ({state.resolvedEngine.toUpperCase()})</option>
          <option value="direct">Direct Mode (Iframe)</option>
          <option value="browser">Browser Mode (Playwright/CDP)</option>
        </select>

        <button
          id="btn-copy-workspace-link"
          type="button"
          className="btn-icon"
          title="Sao chép liên kết cấu hình Workspace"
          onClick={handleCopyShareUrl}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>

        <button
          id="btn-header-screenshot"
          type="button"
          className="btn-icon"
          title="Chụp ảnh màn hình PNG"
          onClick={() => exportDeviceScreenshotPng(primaryDevice, viewport, state.orientation, false)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
      </form>

      {/* Right: Compare Mode Toggle, Theme Toggle & Avatar Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          id="btn-compare-toggle"
          type="button"
          className={`btn-icon ${state.compareMode ? 'active' : ''}`}
          title="So sánh Responsive 2 thiết bị song song (Side-by-Side)"
          onClick={() => setStudioState({ compareMode: !state.compareMode })}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="18" rx="1.5" />
            <rect x="14" y="3" width="7" height="18" rx="1.5" />
          </svg>
          <span>Compare</span>
        </button>

        <button
          id="btn-theme-toggle"
          type="button"
          className="btn-icon"
          title="Chuyển đổi giao diện Sáng / Tối (Light / Dark Mode)"
          onClick={() => setStudioState({ theme: state.theme === 'dark' ? 'light' : 'dark' })}
        >
          {state.theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <div
          title="Localhost & Security Guard Active"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3b82f6, #4f46e5)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            position: 'relative',
          }}
        >
          DV
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: '#10b981',
              border: '2px solid var(--bg-panel)',
            }}
          />
        </div>
      </div>
    </header>
  );
}
