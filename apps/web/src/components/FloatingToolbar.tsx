import React from '../runtime/react-shim';
import {
  getActiveViewportForDevice,
  getSelectedDevice,
  setStudioState,
  showStudioToast,
  type StudioState,
} from '../store/useStudioStore';
import { exportDeviceScreenshotPng } from '../utils/screenshot';

export function FloatingToolbar({ state }: { state: StudioState }) {
  const primaryDevice = getSelectedDevice(state);
  const viewport = getActiveViewportForDevice(primaryDevice, state, true);

  const toggleOrientation = () => {
    const next = state.orientation === 'portrait' ? 'landscape' : 'portrait';
    setStudioState({ orientation: next });
    showStudioToast(`Đã xoay thiết bị sang chế độ ${next === 'portrait' ? 'Portrait (Dọc)' : 'Landscape (Ngang)'}`);
  };

  const adjustZoom = (delta: number) => {
    const next = Math.max(0.25, Math.min(1.5, Number((state.zoom + delta).toFixed(2))));
    setStudioState({ autoFit: false, zoom: next });
  };

  return (
    <div className="floating-toolbar" role="toolbar" aria-label="Device Manipulation Toolbar">
      <button
        id="btn-toolbar-rotate"
        type="button"
        className="btn-icon"
        title="Xoay ngang / dọc (Phím tắt: R)"
        onClick={toggleOrientation}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        <span>Rotate</span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 4px' }}>
        <button
          id="btn-toolbar-zoom-out"
          type="button"
          className="btn-icon"
          style={{ minWidth: '30px', height: '32px', padding: '0 6px' }}
          title="Thu nhỏ (Zoom Out)"
          onClick={() => adjustZoom(-0.1)}
        >
          −
        </button>
        <span
          id="toolbar-zoom-label"
          style={{
            fontSize: '12px',
            fontWeight: 700,
            minWidth: '52px',
            textAlign: 'center',
            fontFamily: 'monospace',
          }}
        >
          {state.autoFit ? 'Fit' : `${Math.round(state.zoom * 100)}%`}
        </span>
        <button
          id="btn-toolbar-zoom-in"
          type="button"
          className="btn-icon"
          style={{ minWidth: '30px', height: '32px', padding: '0 6px' }}
          title="Phóng to (Zoom In)"
          onClick={() => adjustZoom(0.1)}
        >
          +
        </button>
      </div>

      <button
        id="btn-toolbar-fit"
        type="button"
        className={`btn-icon ${state.autoFit ? 'active' : ''}`}
        title="Tự động co giãn vừa khít khung làm việc (Fit to screen)"
        onClick={() => setStudioState({ autoFit: !state.autoFit, zoom: 1.0 })}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
        <span>Fit</span>
      </button>

      <button
        id="btn-toolbar-frame-toggle"
        type="button"
        className={`btn-icon ${!state.showFrame ? 'active' : ''}`}
        title="Ẩn / Hiện vỏ khung thiết bị (Phím tắt: F)"
        onClick={() => setStudioState({ showFrame: !state.showFrame })}
      >
        <span>{state.showFrame ? 'Hide Frame' : 'Show Frame'}</span>
      </button>

      <button
        id="btn-toolbar-screenshot"
        type="button"
        className="btn-icon"
        title="Chụp ảnh màn hình thiết bị PNG"
        onClick={() => exportDeviceScreenshotPng(primaryDevice, viewport, state.orientation, false)}
      >
        <span>📷 Screenshot</span>
      </button>
    </div>
  );
}
