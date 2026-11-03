import { describe, it, expect } from "vitest";
import { evaluate } from "../src/checks.js";

describe("evaluate: lisatestit", () => {
  it("minJudgeScore: pisteet 0 ei tulkita puuttuvaksi pisteeksi", () => {
    expect(evaluate({ minJudgeScore: 1 }, "x", 0).failures).toEqual(["minJudgeScore: 0 < 1"]);
  });

  it("regex ei kayta monirivilippua: ^ tasmaa vain tekstin alkuun", () => {
    expect(evaluate({ regex: "^b" }, "a\nb", null).passed).toBe(false);
    expect(evaluate({ regex: "b$" }, "a\nb", null).passed).toBe(true);
  });

  it("contains ja notContains vertaavat kirjainkokoa myos skandimerkeilla", () => {
    expect(evaluate({ contains: "ÄÖ" }, "täällä öisin", null).passed).toBe(false);
    expect(evaluate({ contains: "ÄÄ" }, "täällä", null).passed).toBe(true);
    expect(evaluate({ notContains: ["ÖÖ"] }, "töö", null).passed).toBe(false);
  });

  it("failures-jarjestys on contains, notContains, regex, minJudgeScore", () => {
    const r = evaluate({ contains: "a", notContains: ["b"], regex: "^z", minJudgeScore: 5 }, "b", 2);
    expect(r.failures.map((f) => f.split(":")[0])).toEqual(["contains", "notContains", "regex", "minJudgeScore"]);
  });
});
