import crypto from 'crypto';
import type { RawWebSocketConnection } from './ws-raw';

export interface CompanionTunnelInfo {
  tunnelId: string;
  targetPort: number;
  targetHost: string;
  connectedAt: string;
  lastHeartbeatAt: string;
}

export interface TunnelProxyRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
}

export interface TunnelProxyResponse {
  tunnelId: string;
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

interface PendingTunnelRequest {
  resolve: (res: TunnelProxyResponse) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class TunnelHub {
  private tunnels: Map<
    string,
    {
      info: CompanionTunnelInfo;
      ws: RawWebSocketConnection;
    }
  > = new Map();
  private pendingRequests: Map<string, PendingTunnelRequest> = new Map();
  private reloadListeners: Set<(payload: { tunnelId: string; timestamp: number }) => void> = new Set();

  public registerCompanion(
    ws: RawWebSocketConnection,
    tunnelId: string,
    targetHost: string,
    targetPort: number
  ): CompanionTunnelInfo {
    const info: CompanionTunnelInfo = {
      tunnelId,
      targetHost,
      targetPort,
      connectedAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    };
    this.tunnels.set(tunnelId, { info, ws });

    ws.on('message', (raw: string | Buffer) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
        if (msg.type === 'tunnel:response' && msg.requestId) {
          const pending = this.pendingRequests.get(msg.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingRequests.delete(msg.requestId);
            if (msg.error) {
              pending.reject(new Error(msg.error));
            } else {
              pending.resolve({
                tunnelId,
                statusCode: msg.statusCode || 200,
                headers: msg.headers || {},
                body: Buffer.from(msg.bodyBase64 || '', 'base64'),
              });
            }
          }
        } else if (msg.type === 'tunnel:heartbeat') {
          info.lastHeartbeatAt = new Date().toISOString();
        } else if (msg.type === 'tunnel:livereload') {
          for (const listener of this.reloadListeners) {
            listener({ tunnelId, timestamp: Date.now() });
          }
        }
      } catch {
        // ignore malformed frame
      }
    });

    ws.on('close', () => {
      this.tunnels.delete(tunnelId);
    });

    return info;
  }

  public onLiveReload(cb: (payload: { tunnelId: string; timestamp: number }) => void): () => void {
    this.reloadListeners.add(cb);
    return () => this.reloadListeners.delete(cb);
  }

  public hasActiveTunnel(tunnelId?: string): boolean {
    if (tunnelId) {
      return this.tunnels.has(tunnelId);
    }
    return this.tunnels.size > 0;
  }

  public getActiveTunnels(): CompanionTunnelInfo[] {
    return Array.from(this.tunnels.values()).map((t) => t.info);
  }

  public async proxyHttpRequest(
    tunnelId: string | undefined,
    req: TunnelProxyRequest,
    timeoutMs: number = 10000
  ): Promise<TunnelProxyResponse> {
    const entry = tunnelId
      ? this.tunnels.get(tunnelId)
      : Array.from(this.tunnels.values())[0];

    if (!entry) {
      throw new Error('Không tìm thấy kết nối Local Companion Tunnel đang hoạt động.');
    }

    const requestId = crypto.randomUUID();
    return new Promise<TunnelProxyResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Local Companion Tunnel timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      entry.ws.send(
        JSON.stringify({
          type: 'tunnel:request',
          requestId,
          method: req.method,
          url: req.url,
          headers: req.headers || {},
          bodyBase64: req.bodyBase64 || '',
        })
      );
    });
  }
}
