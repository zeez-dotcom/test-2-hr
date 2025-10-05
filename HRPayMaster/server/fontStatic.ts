import path from "path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type ModuleResolver = (specifier: string) => string;

const nodeRequire = createRequire(import.meta.url);
const resolveWithRequire: ModuleResolver = (specifier) =>
  nodeRequire.resolve(specifier);

export const resolveInterFontFilesPath = (
  resolver: ModuleResolver = resolveWithRequire,
): string | undefined => {
  try {
    const resolvedFontPath = resolver(
      "@fontsource/inter/files/inter-latin-400-normal.woff2",
    );

    return path.dirname(resolvedFontPath);
  } catch {
    const fallbackStrategies: Array<() => string> = [
      () => {
        const packageJsonPath = nodeRequire.resolve("@fontsource/inter/package.json");
        return path.join(path.dirname(packageJsonPath), "files");
      },
      () => {
        const packageJsonUrl = import.meta.resolve("@fontsource/inter/package.json");
        const packageJsonPath = fileURLToPath(packageJsonUrl);
        return path.join(path.dirname(packageJsonPath), "files");
      },
    ];

    for (const strategy of fallbackStrategies) {
      try {
        return strategy();
      } catch {
        // try next strategy
      }
    }

    return undefined;
  }
};
