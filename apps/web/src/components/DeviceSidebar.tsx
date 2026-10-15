import React from '../runtime/react-shim';
import type { DeviceDefinition } from '@deviceview/shared';
import {
  setStudioState,
  showStudioToast,
  triggerUrlPreview,
  type StudioState,
} from '../store/useStudioStore';

export function DeviceSidebar({ state }: { state: StudioState }) {
  const filterBrands: Array<{ id: StudioState['brandFilter']; label: string }> = [
    { id: 'All', label: 'All' },
    { id: 'Apple', label: 'Apple' },
    { id: 'Samsung', label: 'Samsung' },
    { id: 'Google', label: 'Google' },
    { id: 'Tablet', label: 'Tablet' },
    { id: 'Foldable', label: 'Foldable' },
    { id: 'Desktop', label: 'Desktop' },
  ];

  const filteredDevices = state.devices.filter((d) => {
    if (state.sidebarTab === 'favorites' && !state.favoriteDeviceIds.includes(d.id)) {
      return false;
    }
    if (state.brandFilter === 'Apple' && d.brand !== 'Apple') return false;
    if (state.brandFilter === 'Samsung' && d.brand !== 'Samsung') return false;
    if (state.brandFilter === 'Google' && d.brand !== 'Google') return false;
    if (state.brandFilter === 'Tablet' && d.category !== 'tablet') return false;
    if (state.brandFilter === 'Foldable' && d.category !== 'foldable') return false;
    if (state.brandFilter === 'Desktop' && d.category !== 'desktop' && d.category !== 'laptop') return false;

    const q = state.searchQuery.trim().toLowerCase();
    if (q) {
      const hay = `${d.name} ${d.brand} ${d.series} ${d.viewport.width}x${d.viewport.height} ${
        d.physicalResolution ? `${d.physicalResolution.width}x${d.physicalResolution.height}` : ''
      }`.toLowerCase();
      return hay.includes(q);
    }
    return true;
  });

  // Group by series/brand group for clean scannability matching the mockup
  const groups = new Map<string, DeviceDefinition[]>();
  for (const dev of filteredDevices) {
    const groupTitle =
      dev.brand === 'Apple' && (dev.category === 'phone' || dev.category === 'foldable')
        ? 'iPhone'
        : dev.brand === 'Samsung'
        ? 'Samsung'
        : dev.brand === 'Google'
        ? 'Google Pixel'
        : dev.category === 'tablet'
        ? 'iPad & Tablet'
        : 'Mac & Desktop';
    if (!groups.has(groupTitle)) {
      groups.set(groupTitle, []);
    }
    groups.get(groupTitle)!.push(dev);
  }

  const toggleFavorite = (e: Event, id: string) => {
    e.stopPropagation();
    const exists = state.favoriteDeviceIds.includes(id);
    const next = exists
      ? state.favoriteDeviceIds.filter((f) => f !== id)
      : [...state.favoriteDeviceIds, id];
    setStudioState({ favoriteDeviceIds: next });
  };

  return (
    <aside className="studio-sidebar">
      <div className="sidebar-tabs">
        <button
          id="tab-devices"
          type="button"
          className={`sidebar-tab ${state.sidebarTab === 'devices' ? 'active' : ''}`}
          onClick={() => setStudioState({ sidebarTab: 'devices' })}
        >
          <span>📱 Devices</span>
        </button>
        <button
          id="tab-favorites"
          type="button"
          className={`sidebar-tab ${state.sidebarTab === 'favorites' ? 'active' : ''}`}
          onClick={() => setStudioState({ sidebarTab: 'favorites' })}
        >
          <span>★ Favorites ({state.favoriteDeviceIds.length})</span>
        </button>
        <button
          id="tab-presets"
          type="button"
          className={`sidebar-tab ${state.sidebarTab === 'presets' ? 'active' : ''}`}
          onClick={() => setStudioState({ sidebarTab: 'presets' })}
        >
          <span>⚡ Presets</span>
        </button>
      </div>

      {state.sidebarTab !== 'presets' ? (
        <>
          <div className="sidebar-controls">
            <div className="search-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="device-search-input"
                type="text"
                value={state.searchQuery}
                placeholder="Search devices... (iPhone 18, S26, iPad)"
                onChange={(e: any) => setStudioState({ searchQuery: e.target.value })}
              />
              {state.searchQuery && (
                <button
                  type="button"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                  onClick={() => setStudioState({ searchQuery: '' })}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="brand-pills">
              {filterBrands.map((b) => (
                <button
                  key={b.id}
                  id={`filter-brand-${b.id.toLowerCase()}`}
                  type="button"
                  className={`brand-pill ${state.brandFilter === b.id ? 'active' : ''}`}
                  onClick={() => setStudioState({ brandFilter: b.id })}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="device-list-scroll">
            {Array.from(groups.entries()).map(([groupName, items]) => (
              <div key={groupName}>
                <div className="device-group-header">
                  <span>{groupName}</span>
                  <span className="device-group-count">{items.length}</span>
                </div>
                {items.map((dev) => {
                  const isSelected = dev.id === state.selectedDeviceId;
                  const isFav = state.favoriteDeviceIds.includes(dev.id);
                  const resLabel = dev.physicalResolution
                    ? `${dev.physicalResolution.width} × ${dev.physicalResolution.height}`
                    : `${dev.viewport.width} × ${dev.viewport.height}`;

                  return (
                    <div
                      key={dev.id}
                      id={`device-card-${dev.id}`}
                      className={`device-card ${isSelected ? 'selected' : ''}`}
                      onClick={() =>
                        setStudioState({
                          selectedDeviceId: dev.id,
                          orientation: dev.defaultOrientation,
                          customViewport: {
                            enabled: false,
                            width: dev.viewport.width,
                            height: dev.viewport.height,
                            dpr: dev.dpr,
                          },
                        })
                      }
                    >
                      {/* Mini SVG Hardware Thumbnail */}
                      <div
                        style={{
                          width: '28px',
                          height: '44px',
                          borderRadius: dev.category === 'desktop' || dev.category === 'laptop' ? '4px' : '6px',
                          background: `linear-gradient(145deg, ${dev.frame.frameColor}, ${dev.frame.accentColor})`,
                          border: '1.5px solid rgba(255,255,255,0.2)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          paddingTop: '3px',
                          flexShrink: 0,
                        }}
                      >
                        {dev.frame.cutout === 'dynamic-island' && (
                          <div style={{ width: '9px', height: '2.5px', borderRadius: '2px', background: '#090d16' }} />
                        )}
                        {dev.frame.cutout === 'punch-hole-center' && (
                          <div style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#090d16' }} />
                        )}
                      </div>

                      <div className="device-card-info">
                        <div className="device-card-name">
                          <span>{dev.name}</span>
                          {dev.verificationStatus === 'estimated' && (
                            <span
                              title={dev.verificationNotes || 'Thông số dự kiến cần xác minh thêm'}
                              style={{
                                fontSize: '9.5px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(245, 158, 11, 0.16)',
                                color: '#d97706',
                                fontWeight: 700,
                              }}
                            >
                              Est.
                            </span>
                          )}
                        </div>
                        <div className="device-card-meta">
                          {dev.screenDiagonalInches ? `${dev.screenDiagonalInches}" • ` : ''}
                          {resLabel} ({dev.viewport.width}×{dev.viewport.height})
                        </div>
                      </div>

                      <button
                        type="button"
                        title={isFav ? 'Bỏ yêu thích' : 'Thêm vào Favorites'}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: isFav ? '#f59e0b' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '4px',
                        }}
                        onClick={(e: any) => toggleFavorite(e, dev.id)}
                      >
                        {isFav ? '★' : '☆'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}

            {filteredDevices.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Không tìm thấy thiết bị phù hợp với bộ lọc hiện tại.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="device-list-scroll" style={{ paddingTop: '14px' }}>
          <div style={{ marginBottom: '14px' }}>
            <button
              id="btn-save-preset"
              type="button"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', height: '36px', fontSize: '12.5px' }}
              onClick={() => {
                const primary = state.devices.find((d) => d.id === state.selectedDeviceId);
                const newPreset = {
                  id: `preset-${Date.now()}`,
                  name: `${primary?.name || state.selectedDeviceId} (${state.orientation})`,
                  url: state.urlInput,
                  primaryDeviceId: state.selectedDeviceId,
                  secondaryDeviceId: state.secondaryDeviceId,
                  compareMode: state.compareMode,
                  orientation: state.orientation,
                  engineMode: state.engineMode,
                  zoom: state.zoom,
                  showFrame: state.showFrame,
                  customViewport: { ...state.customViewport },
                  createdAt: new Date().toISOString(),
                };
                setStudioState({ presets: [newPreset, ...state.presets] });
                showStudioToast('Đã lưu cấu hình Workspace hiện tại!');
              }}
            >
              + Lưu cấu hình Workspace hiện tại
            </button>
          </div>

          <div className="device-group-header">
            <span>Workspace Presets</span>
            <span className="device-group-count">{state.presets.length}</span>
          </div>
          {state.presets.map((p) => (
            <div
              key={p.id}
              className="device-card"
              onClick={() => {
                setStudioState({
                  selectedDeviceId: p.primaryDeviceId,
                  secondaryDeviceId: p.secondaryDeviceId || state.secondaryDeviceId,
                  compareMode: p.compareMode,
                  orientation: p.orientation,
                  engineMode: p.engineMode,
                  zoom: p.zoom,
                  showFrame: p.showFrame,
                  customViewport: p.customViewport,
                });
                triggerUrlPreview(p.url);
                showStudioToast(`Đã nạp cấu hình: ${p.name}`);
              }}
            >
              <div className="device-card-info">
                <div className="device-card-name">{p.name}</div>
                <div className="device-card-meta">
                  {p.url} • {p.compareMode ? 'Side-by-Side' : 'Single'}
                </div>
              </div>
            </div>
          ))}

          <div className="device-group-header" style={{ marginTop: '18px' }}>
            <span>Recent URLs</span>
            <span className="device-group-count">{state.recentUrls.length}</span>
          </div>
          {state.recentUrls.map((u) => (
            <div
              key={u}
              className="device-card"
              onClick={() => triggerUrlPreview(u)}
            >
              <div className="device-card-info">
                <div className="device-card-name" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {u}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
