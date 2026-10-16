import { describe, it, expect } from "vitest";
import { evaluate } from "../src/checks.js";

describe("evaluate", () => {
  it("ei odotuksia -> passed null", () => {
    expect(evaluate(undefined, "x", null)).toEqual({ passed: null, failures: [] });
    expect(evaluate({}, "x", null).passed).toBeNull();
  });
  it("contains on kirjainkoosta riippumaton", () => {
    expect(evaluate({ contains: "helsinki" }, "Pääkaupunki on HELSINKI.", null).passed).toBe(true);
    expect(evaluate({ contains: "Tukholma" }, "Helsinki", null).passed).toBe(false);
  });
  it("notContains kaataa kielletystä sanasta", () => {
    const r = evaluate({ notContains: ["en tiedä"] }, "Hmm, En Tiedä.", null);
    expect(r.passed).toBe(false);
    expect(r.failures[0]).toMatch(/notContains/);
  });
  it("regex", () => {
    expect(evaluate({ regex: "^\\d+$" }, "42", null).passed).toBe(true);
    expect(evaluate({ regex: "^\\d+$" }, "42 kpl", null).passed).toBe(false);
  });
  it("minJudgeScore: raja täsmälleen läpäisee, alle kaataa, puuttuva piste kaataa", () => {
    expect(evaluate({ minJudgeScore: 4 }, "x", 4).passed).toBe(true);
    expect(evaluate({ minJudgeScore: 4 }, "x", 3.9).passed).toBe(false);
    expect(evaluate({ minJudgeScore: 4 }, "x", null).passed).toBe(false);
  });
  it("kaikkien ehtojen pitää täyttyä ja jokainen epäonnistuminen raportoidaan", () => {
    const r = evaluate({ contains: "a", notContains: ["b"], regex: "^z" }, "b", null);
    expect(r.passed).toBe(false);
    expect(r.failures).toHaveLength(3);
  });
});
