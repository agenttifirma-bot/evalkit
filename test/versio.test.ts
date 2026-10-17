import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { main } from "../src/cli.js";

describe("--version", () => {
  it("tulostaa package.json:n version ja palauttaa 0", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    let out = "";
    let err = "";
    const code = await main(["--version"], { env: {}, stdout: (s) => void (out += s), stderr: (s) => void (err += s) });
    expect(code).toBe(0);
    expect(out.trim()).toBe(pkg.version);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(err).toBe("");
  });

  it("-v toimii samoin", async () => {
    let out = "";
    expect(await main(["-v"], { env: {}, stdout: (s) => void (out += s), stderr: () => {} })).toBe(0);
    expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
