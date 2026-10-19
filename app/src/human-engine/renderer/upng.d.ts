// Types minimaux pour upng-js (MIT) : décodage PNG en JavaScript pur (utilisé sur iPhone/Android).
declare module 'upng-js' {
  type Image = { width: number; height: number; depth: number; ctype: number; frames: unknown[]; tabs: Record<string, unknown>; data: ArrayBuffer };
  const UPNG: {
    decode(buf: ArrayBuffer): Image;
    toRGBA8(img: Image): ArrayBuffer[];
  };
  export default UPNG;
}
