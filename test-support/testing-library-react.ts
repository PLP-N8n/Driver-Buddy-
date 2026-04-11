import React from '#react-local';
import { createRoot } from '#react-dom-client-local';
import { act } from '#react-dom-test-utils-local';

type HookResult<T> = {
  current: T;
};

type RenderHookReturn<T> = {
  result: HookResult<T>;
  rerender: () => void;
  unmount: () => void;
};

export { act };

export function renderHook<T>(callback: () => T): RenderHookReturn<T> {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const result: HookResult<T> = {
    current: undefined as T,
  };

  let root: ReturnType<typeof createRoot> | null = createRoot(container);

  function TestComponent() {
    result.current = callback();
    return null;
  }

  const render = () => {
    if (!root) return;
    root.render(React.createElement(TestComponent, null));
  };

  act(() => {
    render();
  });

  return {
    result,
    rerender: () =>
      act(() => {
        render();
      }),
    unmount: () =>
      act(() => {
        root?.unmount();
        root = null;
        container.remove();
      }),
  };
}
