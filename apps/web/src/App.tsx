import React, { useEffect, useState } from './runtime/react-shim';
import {
  getActiveViewportForDevice,
  getSecondaryDevice,
  getSelectedDevice,
  getStudioState,
  setStudioState,
  subscribeStudioStore,
  triggerUrlPreview,
} from './store/useStudioStore';
import { Header } from './components/Header';
import { DeviceSidebar } from './components/DeviceSidebar';
import { DeviceFrame } from './components/DeviceFrame';
import { FloatingToolbar } from './components/FloatingToolbar';
import { RightInspector } from './components/RightInspector';

export function App() {
  const [, setTick] = useState(0);
  const state = getStudioState();

  useEffect(() => {
    const unsub = subscribeStudioStore(() => {
      setTick((t) => t + 1);
    });
    // Initial probe of default URL
    triggerUrlPreview(state.urlInput);

    // Global Keyboard Shortcuts
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (e.key === '/' && !isEditingInput) {
        e.preventDefault();
        const searchEl = document.getElementById('device-search-input');
        if (searchEl) searchEl.focus();
      } else if ((e.key === 'r' || e.key === 'R') && !isEditingInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const cur = getStudioState();
        setStudioState({ orientation: cur.orientation === 'portrait' ? 'landscape' : 'portrait' });
      } else if ((e.key === 'f' || e.key === 'F') && !isEditingInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const cur = getStudioState();
        setStudioState({ showFrame: !cur.showFrame });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      unsub();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const primaryDevice = getSelectedDevice(state);
  const primaryViewport = getActiveViewportForDevice(primaryDevice, state, true);

  const secondaryDevice = getSecondaryDevice(state);
  const secondaryViewport = getActiveViewportForDevice(secondaryDevice, state, false);

  return (
    <div className="studio-shell">
      {state.toastMessage && (
        <div className="toast-container">
          <div className="toast-item">{state.toastMessage}</div>
        </div>
      )}

      <Header state={state} />

      <div className="studio-body">
        <DeviceSidebar state={state} />

        <main className="studio-workspace">
          <div className="studio-stage-scroll">
            <DeviceFrame
              device={primaryDevice}
              viewport={primaryViewport}
              state={state}
              isPrimary={true}
            />

            {state.compareMode && (
              <DeviceFrame
                device={secondaryDevice}
                viewport={secondaryViewport}
                state={state}
                isPrimary={false}
              />
            )}
          </div>

          <FloatingToolbar state={state} />
        </main>

        <RightInspector state={state} />
      </div>
    </div>
  );
}

export default App;
