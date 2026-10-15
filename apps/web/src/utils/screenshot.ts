import type { DeviceDefinition, DeviceOrientation } from '@deviceview/shared';
import { getStudioState, showStudioToast } from '../store/useStudioStore';

export async function exportDeviceScreenshotPng(
  device: DeviceDefinition,
  viewport: { width: number; height: number; dpr: number },
  orientation: DeviceOrientation,
  fullPage = false
): Promise<string> {
  const st = getStudioState();
  showStudioToast(fullPage ? 'Đang chụp ảnh Full-Page qua Browser Engine...' : 'Đang kết xuất ảnh chụp PNG...');

  try {
    // Request high-accuracy screenshot from the backend Browser Engine (Chromium CDP)
    const resp = await fetch('/api/browser/screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: st.activeUrl.startsWith('/') ? `${window.location.origin}${st.activeUrl}` : st.activeUrl,
        width: viewport.width,
        height: viewport.height,
        dpr: viewport.dpr,
        userAgent: device.userAgent,
        touchCapable: device.touchCapable,
        fullPage,
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.dataUrl) {
        triggerDownload(
          data.dataUrl,
          `${device.id}-${orientation}-${viewport.width}x${viewport.height}${fullPage ? '-fullpage' : ''}.png`
        );
        showStudioToast(`Đã tải xuống ảnh PNG (${viewport.width}×${viewport.height} @ ${viewport.dpr}x)!`);
        return data.dataUrl;
      }
    }
  } catch {
    // Fallback to client-side frame canvas synthesis if server screenshot is unavailable
  }

  // Fallback client-side device mockup render
  const canvas = document.createElement('canvas');
  const pad = 32;
  canvas.width = viewport.width + pad * 2;
  canvas.height = viewport.height + pad * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(pad - 8, pad - 8, viewport.width + 16, viewport.height + 16);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad, pad, viewport.width, viewport.height);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(`${device.name} (${viewport.width}×${viewport.height} @ ${viewport.dpr}x)`, pad + 20, pad + 40);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#475569';
  ctx.fillText(st.activeUrl, pad + 20, pad + 68);

  const dataUrl = canvas.toDataURL('image/png');
  triggerDownload(dataUrl, `${device.id}-${orientation}-${viewport.width}x${viewport.height}.png`);
  showStudioToast(`Đã xuất ảnh khung thiết bị ${device.name}!`);
  return dataUrl;
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
