import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compare, toBaseline, readBaseline, writeBaseline } from "../src/baseline.js";
import type { Report, CaseResult } from "../src/run.js";

function row(model: string, caseId: string, passed: boolean | null): CaseResult {
  return { caseId, group: "g", model, passed, failures: passed === false ? [`contains: puuttuu ${caseId}`] : [], latencyMs: 1, response: "", judgeScore: null, error: null };
}
function report(rows: CaseResult[]): Report {
  return { models: [...new Set(rows.map((r) => r.model))], cases: rows, perModel: [] };
}

describe("baseline: lisatestit", () => {
  it("toBaseline tyhjasta raportista antaa tyhjan results-kentan", () => {
    expect(toBaseline(report([]))).toEqual({ version: 1, results: {} });
  });

  it("raportti vertailtuna omaan baselineensa: ei regressioita, kaikki laskut nollia", () => {
    const r = report([row("a", "x", true), row("a", "y", false), row("b", "x", true)]);
    const c = compare(r, toBaseline(r));
    expect(c.ok).toBe(true);
    expect(c.regressions).toEqual([]);
    expect(c.fixed).toEqual([]);
    expect(c.newCases).toEqual([]);
    expect(c.missing).toEqual([]);
    expect(c.passRateDrop).toEqual({ a: 0, b: 0 });
  });

  it("tyhja raportti: kaikki baselinen tapaukset puuttuvat, portti ei kaadu", () => {
    const c = compare(report([]), { version: 1, results: { "m::a": true, "m::b": false } });
    expect(c.missing).toEqual(["m::a", "m::b"]);
    expect(c.passRateDrop).toEqual({});
    expect(c.ok).toBe(true);
  });

  it("regressiot listataan raportin jarjestyksessa", () => {
    const base = { version: 1 as const, results: { "m::a": true, "m::b": true, "m::c": true } };
    const c = compare(report([row("m", "c", false), row("m", "a", false), row("m", "b", false)]), base);
    expect(c.regressions.map((r) => r.key)).toEqual(["m::c", "m::a", "m::b"]);
  });

  it("sama tapaus-id eri malleilla on eri avain", () => {
    const c = compare(report([row("b", "x", false)]), { version: 1, results: { "a::x": true } });
    expect(c.newCases).toEqual(["b::x"]);
    expect(c.missing).toEqual(["a::x"]);
    expect(c.regressions).toEqual([]);
    expect(c.ok).toBe(true);
  });

  it("maxPassDrop kaatuu jos yksikin malli ylittaa rajan; tasan raja sallitaan", () => {
    const base = { version: 1 as const, results: { "a::x": true, "b::x": true } };
    const r = report([row("a", "x", true), row("b", "x", false)]);
    expect(compare(r, base, 0.5).passRateDrop).toEqual({ a: 0, b: 1 });
    expect(compare(r, base, 0.5).ok).toBe(false);
    expect(compare(r, base, 1).ok).toBe(true);
  });

  it("writeBaseline korvaa olemassa olevan tiedoston kokonaan", () => {
    const dir = mkdtempSync(join(tmpdir(), "evalkit-ow-"));
    try {
      const p = join(dir, "b.json");
      writeBaseline(p, { version: 1, results: { "m::vanha": true, "m::a": true } });
      writeBaseline(p, { version: 1, results: { "m::a": false } });
      expect(JSON.parse(readFileSync(p, "utf8"))).toEqual({ version: 1, results: { "m::a": false } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("readBaseline-virheilmoitus nimeaa tiedoston", () => {
    const dir = mkdtempSync(join(tmpdir(), "evalkit-rn-"));
    try {
      const rikki = join(dir, "rikki.json");
      const vieras = join(dir, "vieras.json");
      writeFileSync(rikki, "{ ei json");
      writeFileSync(vieras, JSON.stringify({ version: 2, results: {} }));
      expect(() => readBaseline(rikki)).toThrow(rikki);
      expect(() => readBaseline(vieras)).toThrow(vieras);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
