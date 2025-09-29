import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

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
});
