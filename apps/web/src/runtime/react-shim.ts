const SVG_TAGS = new Set([
  'svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'g', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'text', 'tspan'
]);

export interface VNode {
  type: any;
  props: Record<string, any>;
  children: any[];
}

export const Fragment = Symbol.for('react.fragment');

export function createElement(type: any, props: Record<string, any> | null, ...children: any[]): VNode {
  const flatChildren: any[] = [];
  const flatten = (arr: any[]) => {
    for (const item of arr) {
      if (Array.isArray(item)) {
        flatten(item);
      } else if (item !== null && item !== undefined && item !== false && item !== true) {
        flatChildren.push(item);
      }
    }
  };
  flatten(children);
  return {
    type,
    props: { ...(props || {}), children: flatChildren },
    children: flatChildren,
  };
}

interface HookSlot {
  tag: 'state' | 'effect' | 'memo' | 'ref';
  value: any;
  deps?: any[];
  cleanup?: (() => void) | void;
}

const componentHooks = new Map<string, HookSlot[]>();
const pendingEffects: Array<() => void> = [];
let currentComponentKey = 'root';
let currentHookIndex = 0;
let scheduleRootRender: (() => void) | null = null;
let renderQueued = false;

function triggerReRender() {
  if (renderQueued || !scheduleRootRender) return;
  renderQueued = true;
  Promise.resolve().then(() => {
    renderQueued = false;
    if (scheduleRootRender) scheduleRootRender();
  });
}

function getHookSlot(): HookSlot[] {
  let list = componentHooks.get(currentComponentKey);
  if (!list) {
    list = [];
    componentHooks.set(currentComponentKey, list);
  }
  return list;
}

function depsChanged(prevDeps: any[] | undefined, nextDeps: any[] | undefined): boolean {
  if (!prevDeps || !nextDeps) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  for (let i = 0; i < prevDeps.length; i++) {
    if (!Object.is(prevDeps[i], nextDeps[i])) return true;
  }
  return false;
}

export function useState<T>(initialValue: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] {
  const hooks = getHookSlot();
  const idx = currentHookIndex++;
  if (idx >= hooks.length) {
    const init = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    hooks.push({ tag: 'state', value: init });
  }
  const compKey = currentComponentKey;
  const setState = (next: T | ((prev: T) => T)) => {
    const targetHooks = componentHooks.get(compKey);
    if (!targetHooks || !targetHooks[idx]) return;
    const prev = targetHooks[idx].value;
    const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    if (!Object.is(prev, resolved)) {
      targetHooks[idx].value = resolved;
      triggerReRender();
    }
  };
  return [hooks[idx].value as T, setState];
}

export function useRef<T>(initialValue: T): { current: T } {
  const hooks = getHookSlot();
  const idx = currentHookIndex++;
  if (idx >= hooks.length) {
    hooks.push({ tag: 'ref', value: { current: initialValue } });
  }
  return hooks[idx].value;
}

export function useMemo<T>(factory: () => T, deps?: any[]): T {
  const hooks = getHookSlot();
  const idx = currentHookIndex++;
  if (idx >= hooks.length) {
    const val = factory();
    hooks.push({ tag: 'memo', value: val, deps });
    return val;
  }
  const slot = hooks[idx];
  if (depsChanged(slot.deps, deps)) {
    slot.value = factory();
    slot.deps = deps;
  }
  return slot.value;
}

export function useCallback<T extends (...args: any[]) => any>(cb: T, deps?: any[]): T {
  return useMemo(() => cb, deps);
}

export function useEffect(effect: () => void | (() => void), deps?: any[]): void {
  const hooks = getHookSlot();
  const idx = currentHookIndex++;
  if (idx >= hooks.length) {
    const slot: HookSlot = { tag: 'effect', value: effect, deps };
    hooks.push(slot);
    pendingEffects.push(() => {
      slot.cleanup = effect();
    });
    return;
  }
  const slot = hooks[idx];
  if (depsChanged(slot.deps, deps)) {
    slot.value = effect;
    slot.deps = deps;
    pendingEffects.push(() => {
      if (typeof slot.cleanup === 'function') {
        try { slot.cleanup(); } catch {}
      }
      slot.cleanup = effect();
    });
  }
}

function renderVNodeToDom(vnode: any, pathKey: string, isSvgContext = false): Node {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') {
    return document.createTextNode('');
  }
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return document.createTextNode(String(vnode));
  }
  if (Array.isArray(vnode)) {
    const frag = document.createDocumentFragment();
    vnode.forEach((child, i) => {
      frag.appendChild(renderVNodeToDom(child, `${pathKey}.${i}`, isSvgContext));
    });
    return frag;
  }
  if (vnode.type === Fragment) {
    const frag = document.createDocumentFragment();
    (vnode.children || []).forEach((child: any, i: number) => {
      frag.appendChild(renderVNodeToDom(child, `${pathKey}.f${i}`, isSvgContext));
    });
    return frag;
  }
  if (typeof vnode.type === 'function') {
    const prevKey = currentComponentKey;
    const prevIdx = currentHookIndex;
    const compName = vnode.type.name || 'Anon';
    const explicitKey = vnode.props && vnode.props.key !== undefined ? String(vnode.props.key) : '';
    currentComponentKey = `${pathKey}:${compName}${explicitKey ? '#' + explicitKey : ''}`;
    currentHookIndex = 0;
    let rendered: any;
    try {
      rendered = vnode.type(vnode.props || {});
    } finally {
      currentComponentKey = prevKey;
      currentHookIndex = prevIdx;
    }
    return renderVNodeToDom(rendered, `${pathKey}.c`, isSvgContext);
  }

  const tagName = String(vnode.type);
  const isSvg = isSvgContext || SVG_TAGS.has(tagName);
  const el = isSvg
    ? document.createElementNS('http://www.w3.org/2000/svg', tagName)
    : document.createElement(tagName);

  const props = vnode.props || {};
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children' || k === 'key' || v === undefined || v === null || v === false) continue;
    if (k === 'ref' && typeof v === 'object' && v !== null) {
      (v as any).current = el;
      continue;
    }
    if (k === 'className') {
      if (isSvg) {
        el.setAttribute('class', String(v));
      } else {
        (el as HTMLElement).className = String(v);
      }
      continue;
    }
    if (k === 'style' && typeof v === 'object') {
      const styleObj = (el as HTMLElement).style;
      for (const [sk, sv] of Object.entries(v)) {
        if (sv !== undefined && sv !== null) {
          (styleObj as any)[sk] = sv;
        }
      }
      continue;
    }
    if (k === 'dangerouslySetInnerHTML' && v && typeof v.__html === 'string') {
      (el as HTMLElement).innerHTML = v.__html;
      continue;
    }
    if (k.startsWith('on') && typeof v === 'function') {
      const evtName = k.slice(2).toLowerCase();
      const mappedEvt = evtName === 'change' && (tagName === 'input' || tagName === 'textarea') ? 'input' : evtName;
      el.addEventListener(mappedEvt, v as EventListener);
      continue;
    }
    if (k === 'checked' && tagName === 'input') {
      (el as HTMLInputElement).checked = Boolean(v);
      continue;
    }
    if (k === 'value' && (tagName === 'input' || tagName === 'select' || tagName === 'textarea')) {
      (el as HTMLInputElement).value = String(v);
      el.setAttribute('value', String(v));
      continue;
    }
    if (k === 'disabled') {
      if (v) {
        el.setAttribute('disabled', 'true');
        (el as HTMLButtonElement).disabled = true;
      }
      continue;
    }
    const attrName = k === ' htmlFor' || k === 'htmlFor' ? 'for' : k;
    el.setAttribute(attrName, String(v));
  }

  for (let i = 0; i < (vnode.children || []).length; i++) {
    const child = vnode.children[i];
    el.appendChild(renderVNodeToDom(child, `${pathKey}.${i}`, isSvg));
  }

  if (tagName === 'select' && props.value !== undefined) {
    (el as HTMLSelectElement).value = String(props.value);
  }

  return el;
}

export function createRoot(container: HTMLElement) {
  let rootVNode: any = null;

  const performRender = () => {
    if (!rootVNode) return;
    // Preserve active input focus and cursor position across renders
    const active = document.activeElement as HTMLInputElement | null;
    const activeId = active?.id || '';
    const selStart = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    const selEnd = active && typeof active.selectionEnd === 'number' ? active.selectionEnd : null;

    // Preserve existing Direct Mode iframe DOM elements if src matches so iframe doesn't reload unnecessarily on unrelated state updates!
    const existingIframes = new Map<string, HTMLIFrameElement>();
    container.querySelectorAll('iframe[data-preserve-key]').forEach((node) => {
      const iframe = node as HTMLIFrameElement;
      const key = iframe.getAttribute('data-preserve-key');
      if (key) existingIframes.set(key, iframe);
    });

    const newDom = renderVNodeToDom(rootVNode, '0', false);
    container.innerHTML = '';
    container.appendChild(newDom);

    if (existingIframes.size > 0) {
      container.querySelectorAll('iframe[data-preserve-key]').forEach((node) => {
        const nextIframe = node as HTMLIFrameElement;
        const key = nextIframe.getAttribute('data-preserve-key');
        const prevIframe = key ? existingIframes.get(key) : undefined;
        if (prevIframe && prevIframe.getAttribute('src') === nextIframe.getAttribute('src')) {
          prevIframe.className = nextIframe.className;
          prevIframe.setAttribute('style', nextIframe.getAttribute('style') || '');
          nextIframe.replaceWith(prevIframe);
        }
      });
    }

    if (activeId) {
      const nextActive = document.getElementById(activeId) as HTMLInputElement | null;
      if (nextActive) {
        nextActive.focus();
        try {
          if (selStart !== null && selEnd !== null && nextActive.setSelectionRange) {
            nextActive.setSelectionRange(selStart, selEnd);
          }
        } catch {}
      }
    }

    while (pendingEffects.length > 0) {
      const eff = pendingEffects.shift();
      if (eff) {
        try { eff(); } catch (e) { console.error(e); }
      }
    }
  };

  scheduleRootRender = performRender;

  return {
    render(vnode: any) {
      rootVNode = vnode;
      performRender();
    },
  };
}

const ReactShim = {
  createElement,
  Fragment,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  createRoot,
};

export default ReactShim;
