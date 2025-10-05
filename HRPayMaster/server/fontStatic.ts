import path from "path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const resolveInterFontFilesPath = (): string | undefined => {
  try {
    const resolvedFontPath = require.resolve(
      "@fontsource/inter/files/inter-latin-400-normal.woff2",
    );

    return path.dirname(resolvedFontPath);
  } catch {
    return undefined;
  }
};
