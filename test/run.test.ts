import { describe, it, expect } from "vitest";
import { runEval } from "../src/run.js";
import { parseEvalSet } from "../src/schema.js";
import { fakeLlm } from "./helpers.js";

const baseUrl = "http://llm.local/v1";
const set = (cases: unknown[]) => parseEvalSet({ version: 1, cases });

describe("runEval", () => {
  it("ajaa jokaisen mallin jokaisella tapauksella ja laskee läpäisyn", async () => {
    const l = fakeLlm((c) => (c.model === "hyva" ? "Helsinki" : "Oslo"));
    const r = await runEval({ set: set([{ id: "a-01", prompt: "p", expect: { contains: "Helsinki" } }]), models: ["hyva", "huono"], baseUrl, fetch: l.fetch });
    expect(r.perModel.find((m) => m.model === "hyva")?.passRate).toBe(1);
    expect(r.perModel.find((m) => m.model === "huono")?.passRate).toBe(0);
    expect(l.calls).toHaveLength(2);
  });

  it("lähettää systemPromptin ensin ja promptin käyttäjäviestinä", async () => {
    const l = fakeLlm(() => "ok");
    await runEval({ set: set([{ id: "a", prompt: "kysymys", systemPrompt: "ohje" }]), models: ["m"], baseUrl, fetch: l.fetch });
    expect(l.calls[0].messages).toEqual([{ role: "system", content: "ohje" }, { role: "user", content: "kysymys" }]);
  });

  it("yksi virhe ei keskeytä muita; virhe odotuksellisella tapauksella = ei läpäissyt", async () => {
    const l = fakeLlm((c) => (c.model === "rikki" ? { status: 500, body: "x" } : "Helsinki"));
    const r = await runEval({ set: set([{ id: "a", prompt: "p", expect: { contains: "Helsinki" } }]), models: ["rikki", "ok"], baseUrl, fetch: l.fetch });
    const rikki = r.cases.find((c) => c.model === "rikki")!;
    expect(rikki.error).toMatch(/500/);
    expect(rikki.passed).toBe(false);
    expect(r.cases.find((c) => c.model === "ok")?.passed).toBe(true);
    expect(r.perModel.find((m) => m.model === "rikki")?.errors).toBe(1);
  });

  it("virhe tapauksella ilman odotuksia ei tee siitä arvioitua (passed null)", async () => {
    const l = fakeLlm(() => ({ status: 500, body: "x" }));
    const r = await runEval({ set: set([{ id: "a", prompt: "p" }]), models: ["m"], baseUrl, fetch: l.fetch });
    expect(r.cases[0].passed).toBeNull();
    expect(r.perModel[0].passRate).toBeNull();
  });

  it("säilyttää tulosten järjestyksen (malli ulompana) vaikka kutsut valmistuisivat eri järjestyksessä", async () => {
    const l = fakeLlm((_c, n) => ({ delayMs: n === 0 ? 60 : 1, text: "ok" }));
    const r = await runEval({ set: set([{ id: "a", prompt: "1" }, { id: "b", prompt: "2" }]), models: ["m1", "m2"], baseUrl, fetch: l.fetch, concurrency: 4 });
    expect(r.cases.map((c) => `${c.model}/${c.caseId}`)).toEqual(["m1/a", "m1/b", "m2/a", "m2/b"]);
  });

  it("rajoittaa samanaikaiset kutsut concurrency-arvoon", async () => {
    let active = 0;
    let peak = 0;
    const f = (async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 15));
      active--;
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    }) as typeof fetch;
    const cases = Array.from({ length: 8 }, (_, i) => ({ id: `c-${i}`, prompt: "p" }));
    await runEval({ set: set(cases), models: ["m"], baseUrl, fetch: f, concurrency: 2 });
    expect(peak).toBe(2);
  });

  it("kutsuraja: täsmälleen raja sallitaan, ylitys hylätään ennen yhtäkään kutsua", async () => {
    const cases = Array.from({ length: 10 }, (_, i) => ({ id: `c-${i}`, prompt: "p" }));
    const ok = fakeLlm(() => "ok");
    await runEval({ set: set(cases), models: ["m"], baseUrl, fetch: ok.fetch, maxCalls: 10 });
    expect(ok.calls).toHaveLength(10);

    const never = fakeLlm(() => "ok");
    await expect(runEval({ set: set(cases), models: ["m"], baseUrl, fetch: never.fetch, maxCalls: 9 })).rejects.toThrow(/enintään 9/);
    expect(never.calls).toHaveLength(0);
  });

  it("oletuskatto on 200 kutsua", async () => {
    const cases = Array.from({ length: 101 }, (_, i) => ({ id: `c-${i}`, prompt: "p" }));
    const never = fakeLlm(() => "ok");
    await expect(runEval({ set: set(cases), models: ["a", "b"], baseUrl, fetch: never.fetch })).rejects.toThrow(/202 mallikutsua/);
    expect(never.calls).toHaveLength(0);
  });

  it("minJudgeScore ilman tuomarimallia hylätään ennen kutsuja", async () => {
    const never = fakeLlm(() => "ok");
    await expect(runEval({ set: set([{ id: "a", prompt: "p", expect: { minJudgeScore: 4 } }]), models: ["m"], baseUrl, fetch: never.fetch })).rejects.toThrow(/tuomarimallia/);
    expect(never.calls).toHaveLength(0);
  });

  it("tuomari: pisteet luetaan, tuomarikutsut lasketaan kutsurajaan ja raja arvioidaan", async () => {
    const l = fakeLlm((c) => (c.model === "tuomari" ? "Arvio: 5" : "vastaus"));
    const r = await runEval({
      set: set([{ id: "a", prompt: "p", expect: { minJudgeScore: 4 } }]),
      models: ["m"],
      baseUrl,
      fetch: l.fetch,
      judgeModel: "tuomari",
    });
    expect(r.cases[0].judgeScore).toBe(5);
    expect(r.cases[0].passed).toBe(true);
    expect(l.calls).toHaveLength(2);

    const never = fakeLlm(() => "ok");
    await expect(
      runEval({ set: set([{ id: "a", prompt: "p", expect: { minJudgeScore: 4 } }, { id: "b", prompt: "p", expect: { minJudgeScore: 4 } }]), models: ["m"], baseUrl, fetch: never.fetch, judgeModel: "t", maxCalls: 3 }),
    ).rejects.toThrow(/4 mallikutsua/);
  });

  it("tuomarin virhe ei kaada ajoa: piste puuttuu ja minJudgeScore-tapaus kaatuu", async () => {
    const l = fakeLlm((c) => (c.model === "tuomari" ? { status: 500, body: "x" } : "vastaus"));
    const r = await runEval({ set: set([{ id: "a", prompt: "p", expect: { minJudgeScore: 4 } }]), models: ["m"], baseUrl, fetch: l.fetch, judgeModel: "tuomari" });
    expect(r.cases[0].judgeScore).toBeNull();
    expect(r.cases[0].passed).toBe(false);
  });
});
