import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvalSet, loadEvalSet, groupOf } from "../src/schema.js";

describe("evalset-skeema", () => {
  it("hyväksyy version 1 -muodon", () => {
    const s = parseEvalSet({ version: 1, name: "x", cases: [{ id: "a-01", prompt: "p", tags: ["t"], expect: { contains: "k", notContains: ["z"], regex: "^k", minJudgeScore: 4 } }] });
    expect(s.cases[0].expect?.minJudgeScore).toBe(4);
  });

  it("muuntaa vanhan taulukkomuodon (expectedContains, category)", () => {
    const s = parseEvalSet([
      { id: "yleinen-01", category: "yleinen tieto", prompt: "p", expectedContains: "Helsinki" },
      { id: "kirj-01", prompt: "q", systemPrompt: "s" },
    ]);
    expect(s.version).toBe(1);
    expect(s.cases[0]).toEqual({ id: "yleinen-01", prompt: "p", tags: ["yleinen tieto"], expect: { contains: "Helsinki" } });
    expect(s.cases[1]).toEqual({ id: "kirj-01", prompt: "q", systemPrompt: "s" });
  });

  it("hylkää tyhjän evalsetin", () => {
    expect(() => parseEvalSet({ version: 1, cases: [] })).toThrow(/vähintään yksi tapaus/);
    expect(() => parseEvalSet([])).toThrow(/vähintään yksi tapaus/);
  });

  it("hylkää kaksoisid:n", () => {
    expect(() => parseEvalSet({ version: 1, cases: [{ id: "a", prompt: "p" }, { id: "a", prompt: "q" }] })).toThrow(/'a' esiintyy useammin/);
  });

  it("hylkää virheellisen regexin ja tuntemattoman expect-kentän", () => {
    expect(() => parseEvalSet({ version: 1, cases: [{ id: "a", prompt: "p", expect: { regex: "(" } }] })).toThrow(/virheellinen lauseke/);
    expect(() => parseEvalSet({ version: 1, cases: [{ id: "a", prompt: "p", expect: { sisaltaa: "x" } }] })).toThrow();
  });

  it("hylkää minJudgeScore-arvon asteikon ulkopuolelta", () => {
    expect(() => parseEvalSet({ version: 1, cases: [{ id: "a", prompt: "p", expect: { minJudgeScore: 6 } }] })).toThrow();
    expect(() => parseEvalSet({ version: 1, cases: [{ id: "a", prompt: "p", expect: { minJudgeScore: 0 } }] })).toThrow();
  });

  it("hylkää tuntemattoman version", () => {
    expect(() => parseEvalSet({ version: 2, cases: [{ id: "a", prompt: "p" }] })).toThrow();
  });

  it("loadEvalSet antaa selkeän virheen puuttuvasta tiedostosta ja rikkinäisestä JSON:ista", () => {
    const dir = mkdtempSync(join(tmpdir(), "evalkit-"));
    try {
      expect(() => loadEvalSet(join(dir, "ei-ole.json"))).toThrow(/ei ole luettavissa/);
      writeFileSync(join(dir, "rikki.json"), "{ ei json");
      expect(() => loadEvalSet(join(dir, "rikki.json"))).toThrow(/ei ole luettavissa|ei ole kelvollista JSON/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("groupOf: tagi ensin, muuten id:n etuliite", () => {
    expect(groupOf({ id: "yleinen-01", prompt: "p", tags: ["tieto"] })).toBe("tieto");
    expect(groupOf({ id: "yleinen-01", prompt: "p" })).toBe("yleinen");
    expect(groupOf({ id: "ilman-numeroa", prompt: "p" })).toBe("ilman-numeroa");
  });
});
