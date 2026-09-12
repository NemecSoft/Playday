// server/coverMatch.mjs 的类型声明（只为让 TS / parity 单测能带类型引用它）。
// 实现与 shared/coverMatch.ts 同语义，有 parity 测试保证不漂移。
export declare const COVER_IMAGE_EXTS: string[];
export declare function extOf(file: string): string;
export declare function normalizeCoverName(s: string): string;
export declare function coverFormatPriority(ext: string, isApng: boolean): number;
export declare function isBetterCover(
  candidate: { file: string; isApng: boolean },
  current: { file: string; isApng: boolean },
): boolean;
export declare function coverCandidateNames(game: {
  name?: string;
  localizedNames?: Array<{ language: string; name: string }>;
  alternateNames?: string[];
}): string[];
