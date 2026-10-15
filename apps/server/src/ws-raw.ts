import { EventEmitter } from 'events';
import http from 'http';
import net from 'net';
import Module from 'module';
import fs from 'fs';

for (const p of ['/usr/share/nodejs', '/usr/lib/nodejs', '/opt/spark/lib/node_modules']) {
  if (fs.existsSync(p) && !Module.globalPaths.includes(p)) {
    Module.globalPaths.push(p);
  }
}

// Load battle-tested 'ws' library (present in package.json and system nodejs)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WebSocketLib = require('ws');
const wssInstance = new WebSocketLib.WebSocketServer({ noServer: true, maxPayload: 50 * 1024 * 1024 });

export class RawWebSocketConnection extends EventEmitter {
  private ws: any;
  public readyState: number = 1;

  constructor(ws: any) {
    super();
    this.ws = ws;
    this.readyState = 1;
    ws.on('message', (data: Buffer | string, isBinary: boolean) => {
      this.emit('message', isBinary ? data : data.toString('utf8'));
    });
    ws.on('close', () => {
      this.readyState = 3;
      this.emit('close');
    });
    ws.on('error', (err: Error) => {
      this.emit('error', err);
    });
  }

  public send(data: string | Buffer): void {
    if (this.ws.readyState === WebSocketLib.OPEN) {
      this.ws.send(data);
    }
  }

  public close(): void {
    this.readyState = 3;
    try {
      this.ws.close();
    } catch {
      try { this.ws.terminate(); } catch {}
    }
  }
}

export function upgradeHttpToWebSocket(
  req: http.IncomingMessage,
  socket: net.Socket,
  head: Buffer
): Promise<RawWebSocketConnection> {
  return new Promise((resolve) => {
    wssInstance.handleUpgrade(req, socket, head, (ws: any) => {
      resolve(new RawWebSocketConnection(ws));
    });
  });
}

export function connectRawWebSocket(wsUrl: string): Promise<RawWebSocketConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocketLib(wsUrl, { maxPayload: 50 * 1024 * 1024 });
    ws.once('open', () => {
      resolve(new RawWebSocketConnection(ws));
    });
    ws.once('error', (err: Error) => {
      reject(err);
    });
  });
}
