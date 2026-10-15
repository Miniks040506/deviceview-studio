import React, { createRoot } from './runtime/react-shim';
import App from './App';

const rootEl = document.getElementById('root');
if (rootEl) {
  const root = createRoot(rootEl);
  root.render(<App />);
}
