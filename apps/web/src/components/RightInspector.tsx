import React from '../runtime/react-shim';
import {
  getActiveViewportForDevice,
  getSelectedDevice,
  setStudioState,
  showStudioToast,
  triggerUrlPreview,
  type StudioState,
} from '../store/useStudioStore';
import { exportDeviceScreenshotPng } from '../utils/screenshot';

export function RightInspector({ state }: { state: StudioState }) {
  const device = getSelectedDevice(state);
  const viewport = getActiveViewportForDevice(device, state, true);
  const isFav = state.favoriteDeviceIds.includes(device.id);

  if (!state.rightPanelOpen) {
    return (
      <aside className="studio-inspector collapsed">
        <button
          id="btn-expand-inspector"
          type="button"
          className="btn-icon"
          title="Mở bảng thông số & DevTools"
          onClick={() => setStudioState({ rightPanelOpen: true })}
        >
          ◀
        </button>
      </aside>
    );
  }

  const physicalStr = device.physicalResolution
    ? `${device.physicalResolution.width} × ${device.physicalResolution.height}`
    : `${viewport.width * viewport.dpr} × ${viewport.height * viewport.dpr}`;

  return (
    <aside className="studio-inspector">
      {/* Device Overview & Specs Card (matching mockup) */}
      <div className="inspector-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '52px',
                borderRadius: '7px',
                background: `linear-gradient(145deg, ${device.frame.frameColor}, ${device.frame.accentColor})`,
                border: '2px solid rgba(255,255,255,0.2)',
                display: 'flex',
                justifyContent: 'center',
                paddingTop: '4px',
              }}
            >
              <div style={{ width: '10px', height: '3px', borderRadius: '2px', background: '#090d16' }} />
            </div>
            <div>
              <div id="inspector-device-name" style={{ fontSize: '15px', fontWeight: 800 }}>
                {device.name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {device.brand} • {device.series}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn-icon"
              style={{ minWidth: '32px', height: '32px', padding: 0 }}
              title="Yêu thích"
              onClick={() => {
                const next = isFav
                  ? state.favoriteDeviceIds.filter((id) => id !== device.id)
                  : [...state.favoriteDeviceIds, device.id];
                setStudioState({ favoriteDeviceIds: next });
              }}
            >
              {isFav ? '♥' : '♡'}
            </button>
            <button
              id="btn-collapse-inspector"
              type="button"
              className="btn-icon"
              style={{ minWidth: '32px', height: '32px', padding: 0 }}
              title="Thu gọn panel phải"
              onClick={() => setStudioState({ rightPanelOpen: false })}
            >
              ▶
            </button>
          </div>
        </div>

        <div className="spec-row">
          <span className="spec-label">📏 Screen size</span>
          <span className="spec-value">
            {device.screenDiagonalInches ? `${device.screenDiagonalInches} inches` : 'Standard'}
          </span>
        </div>

        <div className="spec-row">
          <span className="spec-label">📐 CSS Viewport</span>
          <span id="inspector-css-viewport" className="spec-value">
            {viewport.width} × {viewport.height}
          </span>
        </div>

        <div className="spec-row">
          <span className="spec-label">🔍 Physical Resolution</span>
          <span className="spec-value">{physicalStr}</span>
        </div>

        <div className="spec-row">
          <span className="spec-label">🖼️ Aspect ratio</span>
          <span className="spec-value">{device.frame.aspectRatioLabel}</span>
        </div>

        <div className="spec-row">
          <span className="spec-label">⚡ Pixel ratio (DPR)</span>
          <span className="spec-value">{viewport.dpr}x</span>
        </div>

        <div className="spec-row">
          <span className="spec-label">🔄 Orientation</span>
          <select
            id="inspector-orientation-select"
            className="engine-select"
            style={{ height: '30px', fontSize: '12px' }}
            value={state.orientation}
            onChange={(e: any) => setStudioState({ orientation: e.target.value })}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>

        <div className="spec-row">
          <span className="spec-label">✓ Spec Status</span>
          <a
            href={device.sourceUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '11.5px',
              fontWeight: 700,
              color: device.verificationStatus === 'verified' ? '#10b981' : '#f59e0b',
              textDecoration: 'none',
            }}
          >
            {device.verificationStatus === 'verified' ? 'Verified Source ↗' : 'Estimated (Verify) ↗'}
          </a>
        </div>

        {/* Custom Viewport Override */}
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <input
              id="chk-custom-viewport"
              type="checkbox"
              checked={state.customViewport.enabled}
              onChange={(e: any) =>
                setStudioState({
                  customViewport: {
                    ...state.customViewport,
                    enabled: Boolean(e.target.checked),
                  },
                })
              }
            />
            <span>Tuỳ chỉnh kích thước (Custom Width / Height / DPR)</span>
          </label>

          {state.customViewport.enabled && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', gap: '6px', marginTop: '8px' }}>
              <input
                id="input-custom-width"
                type="number"
                className="engine-select"
                value={state.customViewport.width}
                placeholder="Width"
                onChange={(e: any) =>
                  setStudioState({
                    customViewport: { ...state.customViewport, width: Number(e.target.value) || 375 },
                  })
                }
              />
              <input
                id="input-custom-height"
                type="number"
                className="engine-select"
                value={state.customViewport.height}
                placeholder="Height"
                onChange={(e: any) =>
                  setStudioState({
                    customViewport: { ...state.customViewport, height: Number(e.target.value) || 812 },
                  })
                }
              />
              <input
                id="input-custom-dpr"
                type="number"
                step="0.5"
                className="engine-select"
                value={state.customViewport.dpr}
                placeholder="DPR"
                onChange={(e: any) =>
                  setStudioState({
                    customViewport: { ...state.customViewport, dpr: Number(e.target.value) || 2 },
                  })
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Quick Tools Card (matching mockup) */}
      <div className="inspector-card">
        <div className="inspector-card-title">Quick tools</div>
        <div className="quick-tools-grid">
          <button
            id="btn-quick-rotate"
            type="button"
            className="quick-tool-tile"
            onClick={() =>
              setStudioState({
                orientation: state.orientation === 'portrait' ? 'landscape' : 'portrait',
              })
            }
          >
            <span style={{ fontSize: '16px' }}>🔄</span>
            <span>Rotate</span>
          </button>

          <button
            id="btn-quick-screenshot"
            type="button"
            className="quick-tool-tile"
            onClick={() => exportDeviceScreenshotPng(device, viewport, state.orientation, false)}
          >
            <span style={{ fontSize: '16px' }}>📷</span>
            <span>Screenshot</span>
          </button>

          <button
            id="btn-quick-zoom-in"
            type="button"
            className="quick-tool-tile"
            onClick={() =>
              setStudioState({
                autoFit: false,
                zoom: Math.min(1.5, Number((state.zoom + 0.1).toFixed(2))),
              })
            }
          >
            <span style={{ fontSize: '16px' }}>➕</span>
            <span>Zoom in</span>
          </button>

          <button
            id="btn-quick-zoom-out"
            type="button"
            className="quick-tool-tile"
            onClick={() =>
              setStudioState({
                autoFit: false,
                zoom: Math.max(0.25, Number((state.zoom - 0.1).toFixed(2))),
              })
            }
          >
            <span style={{ fontSize: '16px' }}>➖</span>
            <span>Zoom out</span>
          </button>

          <button
            id="btn-quick-fullpage"
            type="button"
            className="quick-tool-tile"
            onClick={() => exportDeviceScreenshotPng(device, viewport, state.orientation, true)}
          >
            <span style={{ fontSize: '16px' }}>📜</span>
            <span>Full-Page PNG</span>
          </button>

          <button
            id="btn-quick-reload"
            type="button"
            className="quick-tool-tile"
            onClick={() => triggerUrlPreview(state.urlInput)}
          >
            <span style={{ fontSize: '16px' }}>⚡</span>
            <span>Reload URL</span>
          </button>
        </div>

        {/* Secondary device selector when Compare Mode is active */}
        {state.compareMode && (
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              Thiết bị so sánh thứ 2 (Side-by-Side):
            </div>
            <select
              id="select-secondary-device"
              className="engine-select"
              style={{ width: '100%' }}
              value={state.secondaryDeviceId}
              onChange={(e: any) => setStudioState({ secondaryDeviceId: e.target.value })}
            >
              {state.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.viewport.width}×{d.viewport.height})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Developer Tools Telemetry Card (Console, JS Errors, Network, Headers) */}
      <div className="inspector-card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="inspector-card-title">
          <span>Developer Tools</span>
          <button
            type="button"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: '11px',
              cursor: 'pointer',
            }}
            onClick={() => setStudioState({ consoleLogs: [], jsErrors: [], networkRequests: [] })}
          >
            Clear
          </button>
        </div>

        <div className="devtools-tabs">
          <button
            id="devtab-console"
            type="button"
            className={`devtools-tab ${state.activeDevTab === 'console' ? 'active' : ''}`}
            onClick={() => setStudioState({ activeDevTab: 'console' })}
          >
            Console ({state.consoleLogs.length})
          </button>
          <button
            id="devtab-errors"
            type="button"
            className={`devtools-tab ${state.activeDevTab === 'errors' ? 'active' : ''}`}
            onClick={() => setStudioState({ activeDevTab: 'errors' })}
          >
            Errors ({state.jsErrors.length})
          </button>
          <button
            id="devtab-network"
            type="button"
            className={`devtools-tab ${state.activeDevTab === 'network' ? 'active' : ''}`}
            onClick={() => setStudioState({ activeDevTab: 'network' })}
          >
            Network ({state.networkRequests.length})
          </button>
          <button
            id="devtab-security"
            type="button"
            className={`devtools-tab ${state.activeDevTab === 'security' ? 'active' : ''}`}
            onClick={() => setStudioState({ activeDevTab: 'security' })}
          >
            Headers
          </button>
        </div>

        {state.activeDevTab === 'console' && (
          <div className="log-list">
            {state.consoleLogs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '12px 4px' }}>
                Chưa có bản ghi Console. Trong Browser Mode, mọi lệnh console.log/warn/error từ trang web sẽ hiển thị trực tiếp tại đây.
              </div>
            ) : (
              state.consoleLogs.map((entry) => (
                <div key={entry.id} className={`log-item ${entry.level}`}>
                  <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '10px', opacity: 0.75 }}>
                    [{entry.level}] {new Date(entry.timestamp).toLocaleTimeString()}
                  </div>
                  <div>{entry.text}</div>
                </div>
              ))
            )}
          </div>
        )}

        {state.activeDevTab === 'errors' && (
          <div className="log-list">
            {state.jsErrors.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '12px 4px' }}>
                ✓ Không phát hiện lỗi Uncaught JavaScript Exception.
              </div>
            ) : (
              state.jsErrors.map((err) => (
                <div key={err.id} className="log-item error">
                  <div style={{ fontWeight: 700 }}>{err.message}</div>
                  {err.source && <div style={{ fontSize: '10px', opacity: 0.8 }}>{err.source}</div>}
                </div>
              ))
            )}
          </div>
        )}

        {state.activeDevTab === 'network' && (
          <div className="log-list">
            {state.networkRequests.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '12px 4px' }}>
                Chuyển sang Browser Mode để theo dõi lưu lượng HTTP/XHR/Fetch theo thời gian thực.
              </div>
            ) : (
              state.networkRequests.map((req) => (
                <div key={req.id} className={`log-item ${req.failed ? 'error' : 'info'}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>
                      {req.method} {req.status ?? 'ERR'}
                    </span>
                    <span>{req.durationMs !== null ? `${req.durationMs}ms` : ''}</span>
                  </div>
                  <div style={{ fontSize: '10.5px', opacity: 0.85, wordBreak: 'break-all' }}>{req.url}</div>
                </div>
              ))
            )}
          </div>
        )}

        {state.activeDevTab === 'security' && (
          <div className="log-list" style={{ fontSize: '11.5px' }}>
            <div className="log-item info">
              <strong>Active Engine:</strong> {state.resolvedEngine.toUpperCase()}
            </div>
            <div className="log-item">
              <strong>X-Frame-Options:</strong>{' '}
              {state.probeResult?.headers.xFrameOptions || 'Không giới hạn (Allow)'}
            </div>
            <div className="log-item">
              <strong>CSP frame-ancestors:</strong>{' '}
              {state.probeResult?.headers.frameAncestorsDirective || 'Không giới hạn'}
            </div>
            <div className="log-item">
              <strong>SSRF & Metadata Guard:</strong> Enabled (Blocks 169.254.169.254 & unauthorized internal IPs)
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
