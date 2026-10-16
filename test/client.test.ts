import { describe, it, expect } from "vitest";
import { chat, EmptyResponseError } from "../src/client.js";
import { fakeLlm } from "./helpers.js";

const base = { baseUrl: "http://llm.local/v1/", model: "m", messages: [{ role: "user" as const, content: "hei" }] };

describe("chat", () => {
  it("palauttaa tekstin ja käytön, lähettää Authorization-otsikon ja oletus-max_tokensin", async () => {
    const l = fakeLlm(() => "moi");
    const r = await chat({ ...base, apiKey: "avain", fetch: l.fetch });
    expect(r.text).toBe("moi");
    expect(r.usage?.promptTokens).toBe(3);
    expect(l.calls[0].authorization).toBe("Bearer avain");
    expect(l.calls[0].max_tokens).toBe(1024);
  });
  it("ei lähetä Authorization-otsikkoa ilman avainta", async () => {
    const l = fakeLlm(() => "moi");
    await chat({ ...base, fetch: l.fetch });
    expect(l.calls[0].authorization).toBeNull();
  });
  it("hylkää liian suuren tai virheellisen maxTokensin ennen kutsua", async () => {
    const l = fakeLlm(() => "moi");
    for (const bad of [4097, 0, -1, 1.5, Number.NaN]) {
      await expect(chat({ ...base, maxTokens: bad, fetch: l.fetch })).rejects.toThrow(/maxTokens/);
    }
    expect(l.calls).toHaveLength(0);
    await chat({ ...base, maxTokens: 4096, fetch: l.fetch });
    expect(l.calls).toHaveLength(1);
  });
  it("ei-2xx heittää virheen statuksella", async () => {
    const l = fakeLlm(() => ({ status: 503, body: "alhaalla" }));
    await expect(chat({ ...base, fetch: l.fetch })).rejects.toThrow(/503/);
  });
  it("tyhjä vastaus on EmptyResponseError", async () => {
    const l = fakeLlm(() => ({ empty: true }));
    await expect(chat({ ...base, fetch: l.fetch })).rejects.toBeInstanceOf(EmptyResponseError);
  });
  it("aikakatkaisu keskeyttää kutsun selkeällä viestillä", async () => {
    const l = fakeLlm(() => ({ delayMs: 500, text: "liian myöhään" }));
    await expect(chat({ ...base, timeoutMs: 20, fetch: l.fetch })).rejects.toThrow(/aikakatkaistiin \(20 ms\)/);
  });
});
