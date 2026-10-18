// Minimal typings for bidi-js 1.0.x (the package ships none); only what
// src/modules/pdf/arabicText.ts uses.
declare module 'bidi-js' {
  interface EmbeddingLevelsResult {
    levels: Uint8Array;
    paragraphs: Array<{ start: number; end: number; level: number }>;
  }

  interface Bidi {
    getEmbeddingLevels(text: string, explicitDirection?: 'ltr' | 'rtl'): EmbeddingLevelsResult;
    getReorderedIndices(text: string, levels: EmbeddingLevelsResult, start?: number, end?: number): number[];
    getMirroredCharactersMap(text: string, levels: Uint8Array, start?: number, end?: number): Map<number, string>;
  }

  export default function bidiFactory(): Bidi;
}
