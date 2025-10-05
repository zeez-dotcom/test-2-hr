import path from "path";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { existsSync } from "node:fs";

import { resolveInterFontFilesPath } from "./fontStatic";

describe("static font files", () => {
  it("serves the Inter font from /files", async () => {
    const fontPath = resolveInterFontFilesPath();
    expect(fontPath, "Inter font directory should be resolvable").toBeTruthy();

    const app = express();
    app.use("/files", express.static(fontPath!));

    const response = await request(app).get("/files/inter-latin-400-normal.woff2");

    expect(response.status).toBe(200);
  });

  it("falls back to alternate strategies when require.resolve fails", () => {
    const failingResolve = vi.fn(() => {
      throw new Error("mocked resolution failure");
    });

    const fontPath = resolveInterFontFilesPath(failingResolve);

    expect(failingResolve).toHaveBeenCalled();
    expect(fontPath, "Fallback path should be resolved").toBeTruthy();
    expect(path.basename(fontPath!)).toBe("files");
    expect(
      existsSync(path.join(fontPath!, "inter-latin-400-normal.woff2")),
      "Fallback path should contain Inter font files",
    ).toBe(true);
  });
});
