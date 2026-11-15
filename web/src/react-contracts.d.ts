// The installed React package ships no declarations. This small local surface checks our JS
// without introducing a dependency; JSON types come exclusively from the generated contracts.
declare module "react" {
  export type ReactNode = any;
  export type Ref<T> = { current: T | null } | ((instance: T | null) => void) | null;
  export type ForwardRefRenderFunction<T, P = {}> = (props: P, ref: Ref<T>) => ReactNode;
  export type ComponentType<P = any> = (props: P) => ReactNode;
  export class Component<P = any, S = any> {
    constructor(props: P);
    props: P;
    state: S;
    setState(state: Partial<S>): void;
  }
  export function useState<T = any>(initial?: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void];
  export function useRef<T = any>(initial?: T): { current: T };
  export function useEffect(effect: () => void | (() => void), dependencies?: any[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), dependencies?: any[]): void;
  export function useMemo<T>(factory: () => T, dependencies: any[]): T;
  export function useCallback<T>(callback: T, dependencies: any[]): T;
  export function useId(): string;
  export function createContext<T>(value: T): { Provider: ComponentType<any>; _type?: T };
  export function useContext<T>(context: { _type?: T }): T;
  export function useSyncExternalStore<T>(subscribe: any, snapshot: () => T, serverSnapshot?: () => T): T;
  export function forwardRef<T, P = any>(render: ForwardRefRenderFunction<T, P>): ComponentType<P & { ref?: Ref<T>; key?: string | number }>;
  export function lazy<T>(factory: () => Promise<T>): any;
  export const Suspense: ComponentType<any>;
  export const StrictMode: ComponentType<any>;
  export const Fragment: ComponentType<any>;
  export function memo<T>(component: T): T;
  export function cloneElement(element: any, props: any): any;
  export function isValidElement(element: any): boolean;
  export const Children: any;
}
declare module "react/jsx-runtime" {
  export namespace JSX {
    interface Element {}
    interface IntrinsicAttributes { key?: string | number }
    interface ElementChildrenAttribute { children: {} }
    interface IntrinsicElements { [name: string]: any }
  }
  export function jsx(type: any, props: any): any;
  export function jsxs(type: any, props: any): any;
  export const Fragment: any;
}
