import React, { useEffect, useRef, useState } from '../runtime/react-shim';
import type { DeviceDefinition, ServerToClientWsMessage } from '@deviceview/shared';
import {
  setStudioState,
  showStudioToast,
  triggerUrlPreview,
  type StudioState,
} from '../store/useStudioStore';

function BuiltinPlaygroundSurface({
  viewport,
  isPrimary,
}: {
  viewport: { width: number; height: number; dpr: number };
  isPrimary: boolean;
}) {
  const [clickCount, setClickCount] = useState(0);
  const [demoInput, setDemoInput] = useState('');

  const bpLabel =
    viewport.width < 640
      ? 'Mobile (<640)'
      : viewport.width < 1024
      ? 'Tablet (640-1023)'
      : 'Desktop (>=1024)';

  const pushLog = (level: 'log' | 'info' | 'warn' | 'error', text: string) => {
    if (!isPrimary) return;
    setStudioState((prev) => ({
      consoleLogs: [
        {
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          timestamp: new Date().toISOString(),
          level,
          text,
        },
        ...prev.consoleLogs,
      ].slice(0, 120),
    }));
  };

  return (
    <div
      id={isPrimary ? 'direct-preview-playground' : 'direct-preview-playground-secondary'}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        background: 'linear-gradient(160deg, #090d16 0%, #111827 55%, #1e1b4b 100%)',
        color: '#f8fafc',
        padding: '18px',
        fontFamily: 'Inter, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '11px',
          fontWeight: 600,
          background: 'rgba(99, 102, 241, 0.2)',
          color: '#a5b4fc',
          border: '1px solid rgba(99, 102, 241, 0.35)',
        }}
      >
        ⚡ Live Interactive Viewport
      </div>

      <h2 style={{ fontSize: viewport.width >= 700 ? '24px' : '19px', margin: '10px 0 6px', letterSpacing: '-0.02em' }}>
        DeviceView Studio — Playground
      </h2>
      <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.45, margin: '0 0 14px' }}>
        Tương tác trực tiếp: click nút đếm, nhập liệu, xoay chiều màn hình và kiểm tra Console / Network ở panel bên phải.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: viewport.width >= 700 ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: '8px',
          marginBottom: '14px',
        }}
      >
        <div style={{ background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '10px', padding: '10px' }}>
          <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>CSS Viewport</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginTop: '3px', fontFamily: 'monospace' }}>
            {viewport.width} × {viewport.height}
          </div>
        </div>
        <div style={{ background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '10px', padding: '10px' }}>
          <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Pixel Ratio</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginTop: '3px', fontFamily: 'monospace' }}>
            {viewport.dpr}x
          </div>
        </div>
        <div style={{ background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '10px', padding: '10px' }}>
          <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Breakpoint</div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#a5b4fc', marginTop: '3px', fontFamily: 'monospace' }}>
            {bpLabel}
          </div>
        </div>
        <div style={{ background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '10px', padding: '10px' }}>
          <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Interactions</div>
          <div id="playground-click-count" style={{ fontSize: '14px', fontWeight: 700, color: '#34d399', marginTop: '3px', fontFamily: 'monospace' }}>
            {clickCount}
          </div>
        </div>
      </div>

      <div style={{ background: 'rgba(30, 41, 59, 0.88)', border: '1px solid rgba(148,163,184,0.22)', borderRadius: '12px', padding: '14px', marginBottom: '12px' }}>
        <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Kiểm thử Click, Input & DevTools Telemetry</div>
        <input
          id={isPrimary ? 'playground-demo-input' : 'playground-demo-input-2'}
          type="text"
          value={demoInput}
          placeholder="Nhập thử nội dung kiểm thử tại đây..."
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid #475569',
            background: '#0f172a',
            color: '#fff',
            fontSize: '12px',
            marginTop: '8px',
          }}
          onChange={(e: any) => {
            setDemoInput(e.target.value);
            pushLog('log', `[Playground] Input thay đổi: "${e.target.value}"`);
          }}
        />
        <div style={{ fontSize: '11.5px', color: '#a5b4fc', marginTop: '6px' }}>
          Giá trị hiện tại: {demoInput || '(trống)'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '10px' }}>
          <button
            id="playground-btn-inc"
            type="button"
            style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => {
              const next = clickCount + 1;
              setClickCount(next);
              pushLog('info', `[Playground] Đã click nút bộ đếm -> count = ${next}`);
            }}
          >
            +1 Tăng bộ đếm
          </button>
          <button
            id="playground-btn-warn"
            type="button"
            style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => pushLog('warn', '[Playground] Cảnh báo kiểm thử từ DeviceView Studio')}
          >
            Ghi Console Warn
          </button>
          <button
            id="playground-btn-net"
            type="button"
            style={{ background: '#334155', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            onClick={async () => {
              const t0 = Date.now();
              try {
                await fetch('/api/demo-ping');
              } catch {}
              setStudioState((prev) => ({
                networkRequests: [
                  {
                    id: 'net-' + Date.now(),
                    requestId: 'req-' + Date.now(),
                    timestamp: new Date().toISOString(),
                    method: 'GET',
                    url: '/api/demo-ping',
                    resourceType: 'Fetch',
                    status: 200,
                    durationMs: Math.max(4, Date.now() - t0),
                  },
                  ...prev.networkRequests,
                ].slice(0, 120),
              }));
              pushLog('info', '[Playground] Đã gửi Fetch GET /api/demo-ping (200 OK)');
            }}
          >
            Gửi Fetch API
          </button>
          <button
            id="playground-btn-err"
            type="button"
            style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            onClick={() => {
              setStudioState((prev) => ({
                jsErrors: [
                  {
                    id: 'err-' + Date.now(),
                    timestamp: new Date().toISOString(),
                    message: 'Uncaught TypeError: Cannot read properties of undefined (reading "responsiveProfile")',
                    source: 'playground.tsx:118',
                  },
                  ...prev.jsErrors,
                ].slice(0, 60),
                activeDevTab: 'errors',
              }));
            }}
          >
            Tạo JS Error mẫu
          </button>
        </div>
      </div>

      <div style={{ background: 'rgba(30, 41, 59, 0.72)', border: '1px dashed #475569', borderRadius: '12px', padding: '14px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#34d399' }}>✓ Vùng kiểm thử Cuộn trang & Bố cục</div>
        <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '4px' }}>
          Chuyển đổi giữa iPhone 18 Pro Max, Galaxy S26 Ultra, Pixel 10 Pro XL và iPad Pro 13" ở thanh bên trái để kiểm tra tự động co giãn (Auto-Fit) và thay đổi Breakpoint.
        </div>
      </div>
    </div>
  );
}

export function PreviewViewport({
  device,
  viewport,
  state,
  isPrimary,
}: {
  device: DeviceDefinition;
  viewport: { width: number; height: number; dpr: number };
  state: StudioState;
  isPrimary: boolean;
}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [wsError, setWsError] = useState<string | null>(null);

  const resolvedUrl = state.activeUrl.startsWith('/')
    ? `${window.location.origin}${state.activeUrl}`
    : state.activeUrl;

  const isBrowserMode = state.resolvedEngine === 'browser';

  useEffect(() => {
    if (!isBrowserMode) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/browser`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setWsError(null);
    if (isPrimary) {
      setStudioState({ browserSessionStatus: 'connecting' });
    }

    ws.onopen = () => {
      setWsConnected(true);
      if (isPrimary) {
        setStudioState({ browserSessionStatus: 'connected' });
      }
      ws.send(
        JSON.stringify({
          type: 'session:init',
          url: resolvedUrl,
          width: viewport.width,
          height: viewport.height,
          dpr: viewport.dpr,
          userAgent: device.userAgent,
          touchCapable: device.touchCapable,
        })
      );
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as ServerToClientWsMessage;
        if (msg.type === 'session:frame') {
          setFrameDataUrl(msg.dataUrl);
          if (isPrimary) {
            setStudioState({ latestBrowserFrame: msg.dataUrl });
          }
        } else if (msg.type === 'session:console' && isPrimary) {
          setStudioState((prev) => ({
            consoleLogs: [msg.entry, ...prev.consoleLogs].slice(0, 120),
          }));
        } else if (msg.type === 'session:jserror' && isPrimary) {
          setStudioState((prev) => ({
            jsErrors: [msg.entry, ...prev.jsErrors].slice(0, 60),
          }));
        } else if (msg.type === 'session:network' && isPrimary) {
          setStudioState((prev) => ({
            networkRequests: [msg.entry, ...prev.networkRequests].slice(0, 120),
          }));
        } else if (msg.type === 'session:error') {
          setWsError(msg.message);
          if (isPrimary) {
            setStudioState({ browserSessionStatus: 'error' });
          }
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      setWsError('Không thể thiết lập kết nối WebSocket tới Browser Engine.');
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [isBrowserMode, resolvedUrl, state.reloadCounter]);

  useEffect(() => {
    if (isBrowserMode && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'session:resize',
          width: viewport.width,
          height: viewport.height,
          dpr: viewport.dpr,
          userAgent: device.userAgent,
          touchCapable: device.touchCapable,
        })
      );
    }
  }, [viewport.width, viewport.height, viewport.dpr, device.id]);

  if (
    state.probeResult &&
    (state.probeResult.restrictionCode === 'SSRF_BLOCKED' ||
      state.probeResult.restrictionCode === 'LOCALHOST_CLOUD_TUNNEL_REQUIRED')
  ) {
    return (
      <div
        style={{
          flex: 1,
          background: '#0f172a',
          color: '#f8fafc',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 700,
          }}
        >
          🛡️
        </div>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>
          {state.probeResult.restrictionCode === 'LOCALHOST_CLOUD_TUNNEL_REQUIRED'
            ? 'Yêu cầu Local Companion Tunnel'
            : 'Truy cập bị chặn bởi SSRF Security Guard'}
        </div>
        <div style={{ fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.5, maxWidth: '320px' }}>
          {state.probeResult.restrictionMessage}
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ marginTop: '6px', height: '34px', fontSize: '12px' }}
          onClick={() => triggerUrlPreview('/api/demo-site')}
        >
          Mở Trang Demo Tương Tác
        </button>
      </div>
    );
  }

  if (!isBrowserMode && state.probeResult && !state.probeResult.embeddableInIframe) {
    return (
      <div
        style={{
          flex: 1,
          background: '#0f172a',
          color: '#f8fafc',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '26px' }}>🔒</div>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>
          Website không cho phép nhúng Direct Iframe ({state.probeResult.restrictionCode})
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
          {state.probeResult.restrictionMessage}
        </div>
        <button
          id="btn-switch-to-browser-mode"
          type="button"
          className="btn-primary"
          style={{ height: '36px', fontSize: '12.5px' }}
          onClick={() => {
            setStudioState({ engineMode: 'browser', resolvedEngine: 'browser' });
            showStudioToast('Đã chuyển sang Browser Mode (Playwright / Chromium CDP)!');
          }}
        >
          Chuyển sang Browser Mode (Playwright / CDP)
        </button>
      </div>
    );
  }

  if (isBrowserMode) {
    const handleImageMouse = (e: MouseEvent, action: 'click' | 'move') => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const relX = ((e.clientX - rect.left) / rect.width) * viewport.width;
      const relY = ((e.clientY - rect.top) / rect.height) * viewport.height;
      wsRef.current.send(
        JSON.stringify({
          type: 'input:mouse',
          action,
          x: Math.round(relX),
          y: Math.round(relY),
          button: 'left',
        })
      );
    };

    const handleImageWheel = (e: WheelEvent) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / (rect.width || 1)) * viewport.width;
      const relY = ((e.clientY - rect.top) / (rect.height || 1)) * viewport.height;
      wsRef.current.send(
        JSON.stringify({
          type: 'input:wheel',
          x: Math.round(relX),
          y: Math.round(relY),
          deltaX: Math.round(e.deltaX),
          deltaY: Math.round(e.deltaY),
        })
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        wsRef.current.send(JSON.stringify({ type: 'input:key', action: 'type', text: e.key }));
      } else {
        wsRef.current.send(JSON.stringify({ type: 'input:key', action: 'press', key: e.key }));
      }
    };

    return (
      <div
        id={isPrimary ? 'browser-mode-surface' : 'browser-mode-surface-secondary'}
        tabIndex={0}
        style={{
          flex: 1,
          position: 'relative',
          width: '100%',
          height: '100%',
          background: '#0f172a',
          outline: 'none',
          overflow: 'hidden',
          cursor: 'pointer',
        }}
        onClick={(e: any) => handleImageMouse(e, 'click')}
        onWheel={(e: any) => handleImageWheel(e)}
        onKeyDown={(e: any) => handleKeyDown(e)}
      >
        {frameDataUrl ? (
          <img
            src={frameDataUrl}
            alt="Remote Browser Interactive Stream"
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'fill',
              display: 'block',
              userSelect: 'none',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              padding: '20px',
              textAlign: 'center',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
              {wsError
                ? `Lỗi phiên Browser Mode: ${wsError}`
                : wsConnected
                ? 'Đang khởi tạo Chromium Headless & kết xuất trang...'
                : 'Đang kết nối WebSocket tới Browser Engine...'}
            </div>
            <div style={{ fontSize: '11.5px' }}>
              Click, cuộn chuột và nhập bàn phím sẽ được truyền trực tiếp tới trình duyệt từ xa.
            </div>
          </div>
        )}
      </div>
    );
  }

  // Built-in interactive playground for default /api/demo-site
  if (state.activeUrl === '/api/demo-site' || resolvedUrl.endsWith('/api/demo-site')) {
    return <BuiltinPlaygroundSurface viewport={viewport} isPrimary={isPrimary} />;
  }

  // Direct Mode (Interactive Iframe for external / localhost URLs)
  return (
    <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', background: '#ffffff' }}>
      <iframe
        id={isPrimary ? 'direct-preview-iframe' : 'direct-preview-iframe-secondary'}
        data-preserve-key={`${isPrimary ? 'primary' : 'secondary'}-${resolvedUrl}-${state.reloadCounter}`}
        src={resolvedUrl}
        title={`Preview on ${device.name}`}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: '#ffffff',
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}
