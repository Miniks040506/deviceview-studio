import React from '../runtime/react-shim';
import type { DeviceDefinition } from '@deviceview/shared';
import type { StudioState } from '../store/useStudioStore';
import { PreviewViewport } from './PreviewViewport';

export function DeviceFrame({
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
  const isPortrait = state.orientation === 'portrait';
  const showHardware = state.showFrame;
  const bezel = showHardware ? device.frame.bezelWidth : 0;
  const outerRadius = showHardware ? device.frame.borderRadius : 8;
  const screenRadius = showHardware ? device.frame.screenBorderRadius : 6;

  // Compute scale factor so large viewports (like iPad Pro 13" or 1080p Desktop) fit comfortably in the studio workspace
  const maxStageHeight = 640;
  const maxStageWidth = state.compareMode ? 440 : 880;
  const totalW = viewport.width + bezel * 2;
  const totalH = viewport.height + bezel * 2;

  const fitScale = Math.min(1, maxStageWidth / totalW, maxStageHeight / totalH);
  const effectiveScale = state.autoFit ? Number(fitScale.toFixed(2)) : state.zoom;

  const scaledWrapperWidth = Math.round(totalW * effectiveScale);
  const scaledWrapperHeight = Math.round(totalH * effectiveScale);

  const isMobileOrTablet = device.category === 'phone' || device.category === 'foldable' || device.category === 'tablet';

  return (
    <div
      className="device-stage-wrapper"
      style={{
        width: `${scaledWrapperWidth}px`,
        height: `${scaledWrapperHeight + 34}px`,
        position: 'relative',
      }}
    >
      {/* Top Device Pill Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          marginBottom: '8px',
          fontSize: '12px',
          color: 'var(--text-secondary)',
          fontWeight: 600,
        }}
      >
        <span>
          {device.name} •{' '}
          <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>
            {viewport.width} × {viewport.height}
          </strong>{' '}
          ({viewport.dpr}x)
        </span>
        <span
          style={{
            fontSize: '10.5px',
            padding: '2px 7px',
            borderRadius: '999px',
            background: state.resolvedEngine === 'browser' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
            color: state.resolvedEngine === 'browser' ? '#10b981' : '#3b82f6',
            fontWeight: 700,
          }}
        >
          {state.resolvedEngine === 'browser' ? 'Browser CDP' : 'Direct Iframe'}
        </span>
      </div>

      {/* Scaled Hardware Container */}
      <div
        style={{
          width: `${totalW}px`,
          height: `${totalH}px`,
          transform: `scale(${effectiveScale})`,
          transformOrigin: 'top center',
        }}
      >
        <div
          className="device-hardware-shell"
          style={{
            width: `${totalW}px`,
            height: `${totalH}px`,
            padding: `${bezel}px`,
            borderRadius: `${outerRadius}px`,
            background: showHardware
              ? `linear-gradient(145deg, ${device.frame.frameColor} 0%, #090d16 100%)`
              : 'transparent',
            border: showHardware ? `2px solid ${device.frame.accentColor}55` : '1px solid var(--border-strong)',
          }}
        >
          {/* Physical Side Buttons (Portrait mode on phones) */}
          {showHardware && device.frame.hasSideButtons && isPortrait && (
            <>
              {/* Action Button */}
              <div
                style={{
                  position: 'absolute',
                  left: '-4px',
                  top: '115px',
                  width: '3px',
                  height: '26px',
                  borderRadius: '2px 0 0 2px',
                  background: device.frame.frameColor,
                }}
              />
              {/* Volume Up */}
              <div
                style={{
                  position: 'absolute',
                  left: '-4px',
                  top: '160px',
                  width: '3px',
                  height: '52px',
                  borderRadius: '2px 0 0 2px',
                  background: device.frame.frameColor,
                }}
              />
              {/* Volume Down */}
              <div
                style={{
                  position: 'absolute',
                  left: '-4px',
                  top: '224px',
                  width: '3px',
                  height: '52px',
                  borderRadius: '2px 0 0 2px',
                  background: device.frame.frameColor,
                }}
              />
              {/* Power Button */}
              <div
                style={{
                  position: 'absolute',
                  right: '-4px',
                  top: '185px',
                  width: '3px',
                  height: '74px',
                  borderRadius: '0 2px 2px 0',
                  background: device.frame.frameColor,
                }}
              />
            </>
          )}

          {/* Inner Screen Viewport */}
          <div
            className="device-screen-inner"
            style={{
              borderRadius: `${screenRadius}px`,
              width: `${viewport.width}px`,
              height: `${viewport.height}px`,
            }}
          >
            {/* Status Bar & Camera Cutout (Dynamic Island / Notch / Punch-hole) */}
            {showHardware && isMobileOrTablet && (
              <div
                style={{
                  height: isPortrait ? '44px' : '28px',
                  minHeight: isPortrait ? '44px' : '28px',
                  background: '#0f172a',
                  color: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 22px',
                  fontSize: '12px',
                  fontWeight: 700,
                  position: 'relative',
                  zIndex: 10,
                }}
              >
                <span>9:41</span>

                {/* Cutout Rendering */}
                {isPortrait && device.frame.cutout === 'dynamic-island' && (
                  <div
                    style={{
                      width: `${device.frame.cutoutWidth || 120}px`,
                      height: `${device.frame.cutoutHeight || 34}px`,
                      borderRadius: '999px',
                      background: '#000000',
                      position: 'absolute',
                      left: '50%',
                      top: '6px',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      paddingRight: '12px',
                      boxShadow: 'inset 0 0 2px rgba(255,255,255,0.18)',
                    }}
                  >
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, #1e3a8a 25%, #090d16 80%)',
                      }}
                    />
                  </div>
                )}

                {isPortrait && device.frame.cutout === 'notch' && (
                  <div
                    style={{
                      width: `${device.frame.cutoutWidth || 146}px`,
                      height: `${device.frame.cutoutHeight || 28}px`,
                      borderRadius: '0 0 16px 16px',
                      background: '#000000',
                      position: 'absolute',
                      left: '50%',
                      top: 0,
                      transform: 'translateX(-50%)',
                    }}
                  />
                )}

                {isPortrait && device.frame.cutout === 'punch-hole-center' && (
                  <div
                    style={{
                      width: `${device.frame.cutoutWidth || 14}px`,
                      height: `${device.frame.cutoutHeight || 14}px`,
                      borderRadius: '50%',
                      background: '#000000',
                      position: 'absolute',
                      left: '50%',
                      top: '10px',
                      transform: 'translateX(-50%)',
                      boxShadow: 'inset 0 0 2px rgba(56,189,248,0.4)',
                    }}
                  />
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}>
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>
            )}

            {/* Main Interactive Website Viewport */}
            <PreviewViewport
              device={device}
              viewport={viewport}
              state={state}
              isPrimary={isPrimary}
            />

            {/* Bottom Safari/Mobile Chrome Bar & Home Indicator (matching mockup) */}
            {showHardware && device.frame.hasHomeIndicator && (
              <div
                style={{
                  height: '22px',
                  minHeight: '22px',
                  background: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: '134px',
                    height: '5px',
                    borderRadius: '999px',
                    background: 'rgba(248, 250, 252, 0.45)',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
