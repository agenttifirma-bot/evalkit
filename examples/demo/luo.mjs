// Luo demon tallenteet. Ajo repon juuresta, kun `npm run build` on tehty:
//   node examples/demo/luo.mjs
// Ei verkkokutsuja eika avaimia: vastaukset tulevat alla olevasta kasin kirjoitetusta valemallista.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { main } from "../../dist/cli.js";

const dir = dirname(fileURLToPath(import.meta.url));
const set = join(dir, "..", "yleinen-fi.json");
const BASE_URL = "https://litellm.example/v1";

function valemalli(vastaukset) {
  return async (_url, init) => {
    const prompt = JSON.parse(String(init.body)).messages.at(-1).content;
    const avain = Object.keys(vastaukset).find((k) => prompt.includes(k));
    if (!avain) throw new Error("Ei valevastausta promptille");
    return new Response(
      JSON.stringify({ model: "demo", choices: [{ message: { content: vastaukset[avain] } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

const hiljaa = () => {};
async function tallenna(vastaukset, cassette, extra) {
  const io = { env: {}, stdout: hiljaa, stderr: hiljaa, fetch: valemalli(vastaukset) };
  return main(["run", set, "--models", "demo", "--base-url", BASE_URL, "--cassette", join(dir, cassette), "--cassette-mode", "record", ...extra], io);
}

const OIKEAT = { "Ruotsin pääkaupunki": "Tukholma", Kalevalan: "Elias Lönnrot", "17 + 25": "42" };
const VIRHEELLINEN = { ...OIKEAT, "17 + 25": "41" };

// 1) Hyvaksytty tila: kaikki lapi. Tallentuu baselineksi.
await tallenna(OIKEAT, "jalkeen.cassette.json", ["--baseline", join(dir, "baseline.json"), "--update-baseline"]);
// 2) "Rikkoutunut" malli: lasku-01 vastaa 41. Baselinea ei paiviteta.
await tallenna(VIRHEELLINEN, "ennen.cassette.json", []);
