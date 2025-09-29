import fs from "fs";
import path from "path";

const INTER_PATH_SEGMENTS = ["node_modules", "@fontsource", "inter", "files"] as const;

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

export const resolveInterFontFilesPath = (): string | undefined => {
  const candidateRoots = unique([
    process.cwd(),
    path.resolve(process.cwd(), "HRPayMaster"),
    path.resolve(process.cwd(), "HRPayMaster", "dist"),
    import.meta.dirname,
    path.resolve(import.meta.dirname, ".."),
    path.resolve(import.meta.dirname, "..", ".."),
  ]);

  for (const root of candidateRoots) {
    const candidate = path.resolve(root, ...INTER_PATH_SEGMENTS);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
};
