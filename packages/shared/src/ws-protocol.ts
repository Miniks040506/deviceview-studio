import type {
  ConsoleLogEntry,
  JsErrorEntry,
  NetworkRequestEntry,
  RestrictionReasonCode,
} from './types';

export type ClientToServerWsMessage =
  | {
      type: 'session:init';
      url: string;
      width: number;
      height: number;
      dpr: number;
      userAgent?: string;
      touchCapable?: boolean;
      tunnelId?: string;
    }
  | {
      type: 'session:navigate';
      url: string;
    }
  | {
      type: 'session:resize';
      width: number;
      height: number;
      dpr: number;
      userAgent?: string;
      touchCapable?: boolean;
    }
  | {
      type: 'session:reload';
    }
  | {
      type: 'input:mouse';
      action: 'click' | 'move' | 'down' | 'up';
      x: number;
      y: number;
      button?: 'left' | 'right' | 'middle';
    }
  | {
      type: 'input:wheel';
      x: number;
      y: number;
      deltaX: number;
      deltaY: number;
    }
  | {
      type: 'input:key';
      action: 'press' | 'type' | 'down' | 'up';
      text?: string;
      key?: string;
    }
  | {
      type: 'session:screenshot';
      fullPage?: boolean;
      requestId?: string;
    };

export type ServerToClientWsMessage =
  | {
      type: 'session:ready';
      sessionId: string;
      driver: 'playwright' | 'cdp';
      url: string;
      title: string;
      width: number;
      height: number;
      dpr: number;
    }
  | {
      type: 'session:frame';
      sessionId: string;
      dataUrl: string;
      url: string;
      title: string;
      timestamp: number;
      viewport: { width: number; height: number; dpr: number; scrollY?: number };
    }
  | {
      type: 'session:screenshot:result';
      sessionId: string;
      requestId?: string;
      fullPage: boolean;
      dataUrl: string;
      width: number;
      height: number;
    }
  | {
      type: 'session:console';
      sessionId: string;
      entry: ConsoleLogEntry;
    }
  | {
      type: 'session:jserror';
      sessionId: string;
      entry: JsErrorEntry;
    }
  | {
      type: 'session:network';
      sessionId: string;
      entry: NetworkRequestEntry;
    }
  | {
      type: 'session:restriction';
      sessionId: string;
      code: RestrictionReasonCode;
      message: string;
      url: string;
    }
  | {
      type: 'session:error';
      sessionId?: string;
      message: string;
      code?: string;
    };
