declare namespace React {
  type Key = string | number;
  type ReactText = string | number;
  type ReactNode = ReactElement | ReactText | boolean | null | undefined | ReactNode[];
  type SetStateAction<S> = S | ((prevState: S) => S);
  type Dispatch<A> = (value: A) => void;
  type PropsWithChildren<P = {}> = P & { children?: ReactNode; key?: Key | null };
  type ComponentProps<T extends ComponentType<any>> = T extends ComponentType<infer P> ? P : never;

  interface Attributes {
    key?: Key | null;
  }

  interface ReactElement<P = unknown, T = unknown> {
    type: T;
    props: P;
    key: Key | null;
  }

  interface RefObject<T> {
    current: T | null;
  }

  interface MutableRefObject<T> {
    current: T;
  }

  interface FunctionComponent<P = {}> {
    (props: PropsWithChildren<P>): ReactElement | null;
  }

  type FC<P = {}> = FunctionComponent<P>;
  type ComponentType<P = {}> = FunctionComponent<P> | ComponentClass<P>;

  interface ComponentClass<P = {}, S = {}> {
    new (props: P): Component<P, S>;
  }

  class Component<P = {}, S = {}> {
    constructor(props: P);
    props: Readonly<P>;
    state: Readonly<S>;
    setState(state: Partial<S> | ((prevState: Readonly<S>, props: Readonly<P>) => Partial<S> | null)): void;
    render(): ReactNode;
  }

  interface ErrorInfo {
    componentStack?: string;
  }

  interface SyntheticEvent<T = any> {
    currentTarget: T;
    target: T;
    preventDefault(): void;
    stopPropagation(): void;
  }

  interface FormEvent<T = any> extends SyntheticEvent<T> {}
  interface MouseEvent<T = any> extends SyntheticEvent<T> {}
  interface KeyboardEvent<T = any> extends SyntheticEvent<T> {
    key: string;
  }
  interface ChangeEvent<T = any> extends SyntheticEvent<T> {
    target: T & {
      value: string;
      checked?: boolean;
      files?: FileList | null;
    };
    currentTarget: T & {
      value: string;
      checked?: boolean;
      files?: FileList | null;
    };
  }

  interface ForwardRefExoticComponent<P> {
    (props: P): ReactElement | null;
  }

  function createElement(type: unknown, props: unknown, ...children: unknown[]): ReactElement;
  function lazy<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): T;
  function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  function useRef<T>(initialValue: T): MutableRefObject<T>;
  function useRef<T>(initialValue: T | null): RefObject<T>;
  function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
  function useDeferredValue<T>(value: T): T;

  const Suspense: FC<{ fallback?: ReactNode }>;
  const StrictMode: FC;
  const Fragment: FC;
}

declare module 'react' {
  export = React;
  export as namespace React;
}

declare module 'react/jsx-runtime' {
  export const Fragment: unique symbol;
  export function jsx(type: unknown, props: unknown, key?: string): unknown;
  export function jsxs(type: unknown, props: unknown, key?: string): unknown;
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react';

  export function createRoot(container: Element | DocumentFragment): {
    render(children: ReactNode): void;
    unmount(): void;
  };
}

declare module 'react-dom/test-utils' {
  export function act(callback: () => void | Promise<void>): Promise<void> | void;
}

declare module '#react-local' {
  import React = require('react');
  export = React;
}

declare module '#react-dom-client-local' {
  import { createRoot } from 'react-dom/client';
  export { createRoot };
}

declare module '#react-dom-test-utils-local' {
  import { act } from 'react-dom/test-utils';
  export { act };
}

declare namespace JSX {
  interface DOMProps {
    onClick?: (event: React.MouseEvent<any>) => void;
    onChange?: (event: React.ChangeEvent<any>) => void;
    onSubmit?: (event: React.FormEvent<any>) => void;
    onKeyDown?: (event: React.KeyboardEvent<any>) => void;
  }

  interface ElementProps extends DOMProps {
    [propName: string]: unknown;
  }

  interface IntrinsicElements {
    [elemName: string]: ElementProps;
  }
}
