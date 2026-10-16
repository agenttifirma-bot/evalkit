// Luo GitHub Actionin CI-testin tallenteet: cassette ja kaksi baselinea.
// Ajo repon juuresta, kun `npm run build` on tehty: node test/fixtures/action/luo.mjs
// Ei verkkokutsuja: vastaukset tulevat alla olevasta valemallista.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { main } from "../../../dist/cli.js";

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "..", "..", "..");
const BASE_URL = "https://litellm.example/v1";

// yleinen-01 ja yleinen-02 osuvat, lasku-01 vastaa väärin (jotta regressiota voi testata).
const VASTAUKSET = { "Ruotsin pääkaupunki": "Tukholma", Kalevalan: "Elias Lönnrot", "17 + 25": "41" };

const fakeFetch = async (_url, init) => {
  const body = JSON.parse(String(init.body));
  const prompt = body.messages.at(-1).content;
  const avain = Object.keys(VASTAUKSET).find((k) => prompt.includes(k));
  if (!avain) throw new Error(`Ei valevastausta promptille: ${prompt}`);
  return new Response(
    JSON.stringify({ model: "demo", choices: [{ message: { content: VASTAUKSET[avain] } }], usage: { prompt_tokens: 5, completion_tokens: 2 } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};

const io = { env: {}, stdout: (s) => process.stdout.write(s), stderr: (s) => process.stderr.write(s), fetch: fakeFetch };
const set = join(root, "examples", "yleinen-fi.json");
const cassette = join(dir, "yleinen.cassette.json");
const baselineOk = join(dir, "baseline-ok.json");
const baselineRegressio = join(dir, "baseline-regressio.json");

const code = await main(["run", set, "--models", "demo", "--base-url", BASE_URL, "--cassette", cassette, "--cassette-mode", "record", "--baseline", baselineOk, "--update-baseline"], io);
if (code !== 0) process.exit(code);

// Regressiobaseline: lasku-01 olisi ennen läpäissyt, mutta kaatuu nyt.
writeFileSync(baselineRegressio, JSON.stringify({ version: 1, results: { "demo::lasku-01": true, "demo::yleinen-01": true, "demo::yleinen-02": true } }, null, 2) + "\n", "utf8");
