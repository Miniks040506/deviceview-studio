import type {
  DeviceBrand,
  DeviceCategory,
  DeviceDefinition,
  DeviceOrientation,
} from '@deviceview/shared';
import rawDevices from '../data/devices.json';

export interface DeviceFilterOptions {
  query?: string;
  brand?: DeviceBrand | 'All';
  category?: DeviceCategory | 'All';
  verifiedOnly?: boolean;
}

export class DeviceRegistry {
  private devices: Map<string, DeviceDefinition> = new Map();

  constructor(initialDevices: DeviceDefinition[] = rawDevices as DeviceDefinition[]) {
    this.loadDevices(initialDevices);
  }

  public loadDevices(list: DeviceDefinition[]): void {
    this.devices.clear();
    for (const item of list) {
      this.validateDevice(item);
      this.devices.set(item.id, item);
    }
  }

  public registerCustomDevice(device: DeviceDefinition): void {
    this.validateDevice(device);
    this.devices.set(device.id, device);
  }

  public validateDevice(device: DeviceDefinition): void {
    if (!device.id || !device.name || !device.brand) {
      throw new Error(`Invalid device definition: missing id, name, or brand`);
    }
    if (
      !device.viewport ||
      typeof device.viewport.width !== 'number' ||
      typeof device.viewport.height !== 'number' ||
      device.viewport.width < 100 ||
      device.viewport.height < 100
    ) {
      throw new Error(`Invalid viewport dimensions for device "${device.id}"`);
    }
    if (typeof device.dpr !== 'number' || device.dpr <= 0 || device.dpr > 6) {
      throw new Error(`Invalid DPR "${device.dpr}" for device "${device.id}"`);
    }
  }

  public getAll(): DeviceDefinition[] {
    return Array.from(this.devices.values());
  }

  public getById(id: string): DeviceDefinition | undefined {
    return this.devices.get(id);
  }

  public filter(options: DeviceFilterOptions = {}): DeviceDefinition[] {
    const q = (options.query || '').trim().toLowerCase();
    return this.getAll().filter((d) => {
      if (options.brand && options.brand !== 'All' && d.brand !== options.brand) {
        return false;
      }
      if (options.category && options.category !== 'All' && d.category !== options.category) {
        return false;
      }
      if (options.verifiedOnly && d.verificationStatus !== 'verified') {
        return false;
      }
      if (q) {
        const hay = `${d.name} ${d.brand} ${d.series} ${d.category} ${d.viewport.width}x${d.viewport.height} ${
          d.physicalResolution ? `${d.physicalResolution.width}x${d.physicalResolution.height}` : ''
        }`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }

  public getEffectiveViewport(
    device: DeviceDefinition,
    orientation: DeviceOrientation
  ): { width: number; height: number; dpr: number } {
    const minSide = Math.min(device.viewport.width, device.viewport.height);
    const maxSide = Math.max(device.viewport.width, device.viewport.height);
    if (orientation === 'landscape') {
      return { width: maxSide, height: minSide, dpr: device.dpr };
    }
    return { width: minSide, height: maxSide, dpr: device.dpr };
  }
}

export const defaultDeviceRegistry = new DeviceRegistry();
export const DEFAULT_DEVICES: DeviceDefinition[] = rawDevices as DeviceDefinition[];
