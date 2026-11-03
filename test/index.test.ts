import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as api from "../src/index.js";
import { EXIT_OK, EXIT_GATE_FAILED, EXIT_USAGE } from "../src/cli.js";
import { VERSIO } from "../src/versio.js";
import { evaluate } from "../src/checks.js";

describe("julkinen API (src/index.ts)", () => {
  it("vie kaikki dokumentoidut funktiot", () => {
    for (const name of ["parseEvalSet", "loadEvalSet", "groupOf", "evaluate", "chat", "runEval", "compare", "toBaseline", "readBaseline", "writeBaseline", "keyOf", "main"] as const) {
      expect(typeof api[name]).toBe("function");
    }
  });

  it("vie vakiot odotetuilla arvoilla", () => {
    expect(api.MAX_TOKENS_CAP).toBe(4096);
    expect(api.DEFAULT_MAX_TOKENS).toBe(1024);
    expect(api.MAX_CALLS_PER_RUN).toBe(200);
  });

  it("vietava evaluate on sama kuin moduulin evaluate", () => {
    expect(api.evaluate).toBe(evaluate);
    expect(api.evaluate({ contains: "a" }, "A", null).passed).toBe(true);
  });

  it("EmptyResponseError on Error, jolla on nimi ja mallin nimi viestissa", () => {
    const e = new api.EmptyResponseError("gpt");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("EmptyResponseError");
    expect(e.message).toContain("'gpt'");
  });
});

describe("poistumiskoodit ja versio", () => {
  it("poistumiskoodit ovat dokumentoidut: 0 ok, 1 portti, 2 kayttovirhe", () => {
    expect([EXIT_OK, EXIT_GATE_FAILED, EXIT_USAGE]).toEqual([0, 1, 2]);
  });

  it("VERSIO vastaa package.json:n versiota", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(VERSIO).toBe(pkg.version);
  });
});
