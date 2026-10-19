declare module 'react-native' { export type ImageSourcePropType = number | { uri: string }; }
declare module 'zustand' {
  export type Set<T> = (p: Partial<T> | ((s: T) => Partial<T>)) => void;
  export type Init<T> = (set: Set<T>, get: () => T) => T;
  export function create<T>(): (init: Init<T>) => (<U>(sel: (s: T) => U) => U) & (() => T) & { getState(): T; setState(p: Partial<T>): void };
}
declare function require(p: string): any;
declare module 'zustand/middleware' {
  import type { Init } from 'zustand';
  export function persist<T>(init: Init<T>, opts: { name: string; version?: number; storage?: any; partialize?: (s: T) => Partial<T>; onRehydrateStorage?: () => (state?: T) => void; migrate?: (persisted: unknown, version: number) => unknown }): Init<T>;
  export function createJSONStorage(f: () => any): any;
}
declare module '@react-native-async-storage/async-storage' { const x: any; export default x; }
declare module 'react-native' { export const Platform: { OS: string }; }
declare const process: { env: Record<string, string | undefined> };
declare module 'expo-image-manipulator' { export const SaveFormat: { JPEG: string }; export function manipulateAsync(uri: string, actions: any[], opts: any): Promise<{ uri: string; base64?: string }>; }
declare module 'expo-file-system' { export class File { constructor(...parts: any[]); delete(): void; copy(to: File): void; base64(): string; get exists(): boolean; get uri(): string; } export const Paths: { document: any }; }
