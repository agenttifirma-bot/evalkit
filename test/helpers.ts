/** Valerajapinta: palauttaa fetchin, joka vastaa /chat/completions-kutsuihin handlerin mukaan. */
export interface Call {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  authorization: string | null;
}

export type Reply = string | { status: number; body: string } | { delayMs: number; text: string } | { empty: true };

export function fakeLlm(handler: (call: Call, n: number) => Reply) {
  const calls: Call[] = [];
  const f = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const headers = new Headers(init?.headers);
    const call: Call = { ...body, authorization: headers.get("authorization") };
    calls.push(call);
    const r = handler(call, calls.length - 1);
    if (typeof r === "string") return json(r);
    if ("status" in r) return new Response(r.body, { status: r.status, statusText: "Err" });
    if ("empty" in r) return json("");
    // viive, joka noudattaa AbortSignalia
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, r.delayMs);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
    return json(r.text);
  }) as typeof fetch;
  return { fetch: f, calls };
}

function json(text: string): Response {
  return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: text } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
