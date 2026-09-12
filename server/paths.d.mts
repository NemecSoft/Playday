// server/paths.mjs 的类型声明。
// 只为让 TS（含 parity 单测）能带上类型引用这个零依赖 .mjs；
// 实现与 shared/pathConfig.ts 是同语义的两份（有 parity 测试保证不漂移）。
export declare function resolveConfiguredPath(raw: unknown, baseDir: string): string | null;
export declare function resolveConfiguredDir(
  raw: unknown,
  dataRoot: string,
  defaultName: string,
  baseDir?: string,
): string;
export declare function resolveLibraryPaths(opts: {
  dataRoot: string;
  baseDir?: string;
  libraryDir?: unknown;
  sourceLibraryDir?: unknown;
}): { root: string; sourceDir: string; source: string; runtime: string };
export declare function resolveAnnouncementFile(
  raw: unknown,
  dataRoot: string,
  baseDir?: string,
): string;
export declare function readSettingsFile(opts: { dataRoot: string; appRoot: string }): {
  file: string;
  settings: Record<string, unknown>;
  fromLegacy: boolean;
};
export declare function resolveServerPaths(opts: { dataRoot: string; appRoot: string }): {
  configFile: string;
  settings: Record<string, unknown>;
  library: { root: string; source: string; runtime: string };
  dbPath: string;
  coverDir: string;
  detailsDir: string;
  announcementsFile: string;
};
