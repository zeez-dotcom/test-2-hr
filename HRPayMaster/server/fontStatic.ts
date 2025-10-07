import path from "path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type ModuleResolver = (specifier: string) => string;

const REQUIRED_FONT_FILE = "inter-latin-400-normal.woff2";

const nodeRequire = createRequire(import.meta.url);
const resolveWithRequire: ModuleResolver = (specifier) =>
  nodeRequire.resolve(specifier);

const directoryHasRequiredFont = (directory: string): boolean =>
  existsSync(path.join(directory, REQUIRED_FONT_FILE));

const validateDirectory = (
  directory: string | undefined,
): string | undefined =>
  directory && directoryHasRequiredFont(directory) ? directory : undefined;

export const resolveInterFontFilesPath = (
  resolver: ModuleResolver = resolveWithRequire,
): string | undefined => {
  try {
    const resolvedFontPath = resolver(
      "@fontsource/inter/files/" + REQUIRED_FONT_FILE,
    );
    const candidateDirectory = validateDirectory(path.dirname(resolvedFontPath));
    if (candidateDirectory) {
      return candidateDirectory;
    }
  } catch {
    // fall through to fallback strategies
  }

  const fallbackStrategies: Array<() => string | undefined> = [
    () => {
      const packageJsonPath = nodeRequire.resolve("@fontsource/inter/package.json");
      return validateDirectory(path.join(path.dirname(packageJsonPath), "files"));
    },
    () => {
      const packageJsonUrl = import.meta.resolve("@fontsource/inter/package.json");
      const packageJsonPath = fileURLToPath(packageJsonUrl);
      return validateDirectory(path.join(path.dirname(packageJsonPath), "files"));
    },
    () => {
      const moduleDir = fileURLToPath(new URL(".", import.meta.url));
      return validateDirectory(path.join(moduleDir, "files"));
    },
    () => validateDirectory(path.join(process.cwd(), "server", "files")),
    () =>
      validateDirectory(
        path.join(process.cwd(), "HRPayMaster", "server", "files"),
      ),
  ];

  for (const strategy of fallbackStrategies) {
    try {
      const result = strategy();
      if (result) {
        return result;
      }
    } catch {
      // try next strategy
    }
  }

  return undefined;
};
