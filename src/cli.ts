import { writeFileSync } from "node:fs";
import { compare, readBaseline, toBaseline, writeBaseline, type Comparison } from "./baseline.js";
import { runEval, type Report } from "./run.js";
import { loadEvalSet } from "./schema.js";

export const EXIT_OK = 0;
export const EXIT_GATE_FAILED = 1;
export const EXIT_USAGE = 2;

export interface CliIo {
  env: Record<string, string | undefined>;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  /** Injektoitava fetch (testit, llm-cassette). */
  fetch?: typeof fetch;
}

const USAGE = `Käyttö:
  evalkit run <evalset.json> --models a,b --base-url <url> [valinnat]
  evalkit validate <evalset.json> [lisää tiedostoja]   Tarkistaa tiedostot ilman verkkoa ja kuluja

Valinnat:
  --models a,b            Mallit pilkulla eroteltuna (tai EVALKIT_MODELS)
  --base-url <url>        OpenAI-yhteensopiva osoite, esim. https://litellm.local/v1 (tai EVALKIT_BASE_URL)
  --api-key-env <NIMI>    Ympäristömuuttuja, josta API-avain luetaan (oletus LLM_API_KEY)
  --judge-model <malli>   Tuomarimalli minJudgeScore-ehdolle (valitse eri malli kuin arvioitavat)
  --baseline <tiedosto>   Vertaa edelliseen hyväksyttyyn ajoon; vain regressiot kaatavat ajon
  --update-baseline       Kirjoita tämän ajon tulokset baselineksi
  --max-pass-drop <0-1>   Salli yksittäiset regressiot, jos läpäisyprosentti ei laske yli rajan (oletus 0)
  --concurrency <n>       Samanaikaiset kutsut (oletus 4)
  --timeout-ms <ms>       Aikakatkaisu per kutsu (oletus 60000)
  --max-tokens <n>        max_tokens per kutsu (oletus 1024, katto 4096)
  --cassette <tiedosto>   Toista/tallenna mallivastaukset llm-cassette-tiedostosta (vaatii llm-cassette-paketin)
  --cassette-mode <tila>  replay (oletus, ei koskaan verkkoa), record tai auto
  --json <tiedosto>       Kirjoita koko raportti JSON-tiedostoon

Poistumiskoodit: 0 = ok, 1 = regressio tai epäonnistuneita tapauksia, 2 = virhe käytössä tai asetuksissa.
`;

interface Args {
  command: "run" | "validate";
  /** run: evalset-tiedosto (ensimmäinen); validate: kaikki tiedostot. */
  files: string[];
  flags: Record<string, string | true>;
}

const BOOL_FLAGS = new Set(["update-baseline", "help"]);

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const name = a.slice(2);
      if (BOOL_FLAGS.has(name)) flags[name] = true;
      else {
        const v = argv[++i];
        if (v === undefined || v.startsWith("--")) throw new Error(`Valinta --${name} tarvitsee arvon`);
        flags[name] = v;
      }
    } else positional.push(a);
  }
  const command = positional[0];
  if (command !== "run" && command !== "validate") throw new Error(command ? `Tuntematon komento '${command}'` : "Komento puuttuu");
  return { command, files: positional.slice(1), flags };
}

function intFlag(flags: Args["flags"], name: string): number | undefined {
  const v = flags[name];
  if (v === undefined) return undefined;
  const n = Number(v);
  if (typeof v !== "string" || !Number.isInteger(n) || n < 1) throw new Error(`--${name} täytyy olla positiivinen kokonaisluku`);
  return n;
}

function formatReport(report: Report): string {
  const lines: string[] = [];
  lines.push(`Evalkit${report.name ? `: ${report.name}` : ""}`);
  for (const m of report.perModel) {
    const rate = m.passRate === null ? "ei arvioitavia" : `${m.passed}/${m.evaluated} (${Math.round(m.passRate * 100)} %)`;
    lines.push(`  ${m.model}: läpäisi ${rate}, virheitä ${m.errors}`);
  }
  const failed = report.cases.filter((c) => c.passed === false);
  if (failed.length) {
    lines.push("Epäonnistuneet tapaukset:");
    for (const c of failed) lines.push(`  - ${c.model} / ${c.caseId}: ${c.failures[0] ?? "kaatui"}`);
  }
  return lines.join("\n");
}

function formatComparison(cmp: Comparison): string {
  const lines: string[] = ["Vertailu baselineen:"];
  lines.push(`  regressioita: ${cmp.regressions.length}, korjaantuneita: ${cmp.fixed.length}, uusia: ${cmp.newCases.length}, puuttuvia: ${cmp.missing.length}`);
  for (const r of cmp.regressions) lines.push(`  REGRESSIO ${r.key}: ${r.reason}`);
  for (const [model, d] of Object.entries(cmp.passRateDrop)) {
    if (d !== 0) lines.push(`  ${model}: läpäisyprosentti ${d > 0 ? "laski" : "nousi"} ${Math.abs(Math.round(d * 100))} %-yksikköä`);
  }
  return lines.join("\n");
}

function validateFiles(files: string[], io: CliIo): number {
  if (files.length === 0) {
    io.stderr(`Virhe: validate tarvitsee vähintään yhden evalset-tiedoston\n\n${USAGE}`);
    return EXIT_USAGE;
  }
  let bad = 0;
  for (const f of files) {
    try {
      const set = loadEvalSet(f);
      io.stdout(`OK ${f}: ${set.cases.length} tapausta\n`);
    } catch (err) {
      bad++;
      io.stderr(`${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  return bad === 0 ? EXIT_OK : EXIT_USAGE;
}

async function cassetteFetchFor(path: string, mode: string | undefined, realFetch: typeof fetch | undefined): Promise<typeof fetch> {
  let mod: typeof import("llm-cassette");
  try {
    mod = await import("llm-cassette");
  } catch {
    throw new Error("--cassette vaatii llm-cassette-paketin: npm install --save-dev github:tonyweckstrom1987/llm-cassette");
  }
  return mod.cassetteFetch({ path, mode: (mode as "replay" | "record" | "auto" | undefined) ?? "replay", fetch: realFetch });
}

/** Ajaa komentorivin ja palauttaa poistumiskoodin. Ei kutsu process.exit-funktiota. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  let args: Args;
  try {
    if (argv.includes("--help") || argv.length === 0) {
      io.stdout(USAGE);
      return argv.length === 0 ? EXIT_USAGE : EXIT_OK;
    }
    args = parseArgs(argv);
  } catch (err) {
    io.stderr(`${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
    return EXIT_USAGE;
  }

  if (args.command === "validate") return validateFiles(args.files, io);

  try {
    const setFile = args.files[0];
    if (!setFile) throw new Error("Evalset-tiedosto puuttuu");
    const modelsRaw = (args.flags["models"] as string | undefined) ?? io.env.EVALKIT_MODELS;
    const baseUrl = (args.flags["base-url"] as string | undefined) ?? io.env.EVALKIT_BASE_URL;
    if (!modelsRaw) throw new Error("Mallit puuttuvat (--models tai EVALKIT_MODELS)");
    if (!baseUrl) throw new Error("Osoite puuttuu (--base-url tai EVALKIT_BASE_URL)");
    const models = modelsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const keyEnv = (args.flags["api-key-env"] as string | undefined) ?? "LLM_API_KEY";
    const maxPassDropRaw = args.flags["max-pass-drop"];
    const maxPassDrop = maxPassDropRaw === undefined ? 0 : Number(maxPassDropRaw);
    if (typeof maxPassDropRaw === "string" && !(maxPassDrop >= 0 && maxPassDrop <= 1)) throw new Error("--max-pass-drop täytyy olla luku väliltä 0-1");

    const set = loadEvalSet(setFile);
    const baselinePath = args.flags["baseline"] as string | undefined;
    const update = args.flags["update-baseline"] === true;
    if (update && !baselinePath) throw new Error("--update-baseline tarvitsee --baseline <tiedosto>");
    const baseline = baselinePath && !update ? readBaseline(baselinePath) : null;
    if (baselinePath && !update && !baseline) {
      throw new Error(`Baselinea '${baselinePath}' ei löydy. Luo se ensin: lisää --update-baseline`);
    }

    const cassettePath = args.flags["cassette"] as string | undefined;
    const cassetteMode = args.flags["cassette-mode"] as string | undefined;
    if (cassetteMode !== undefined && !cassettePath) throw new Error("--cassette-mode tarvitsee --cassette <tiedosto>");
    const fetchImpl = cassettePath ? await cassetteFetchFor(cassettePath, cassetteMode, io.fetch) : io.fetch;

    const report = await runEval({
      set,
      models,
      baseUrl,
      apiKey: io.env[keyEnv],
      fetch: fetchImpl,
      judgeModel: args.flags["judge-model"] as string | undefined,
      concurrency: intFlag(args.flags, "concurrency"),
      timeoutMs: intFlag(args.flags, "timeout-ms"),
      maxTokens: intFlag(args.flags, "max-tokens"),
    });

    io.stdout(formatReport(report) + "\n");
    const jsonPath = args.flags["json"] as string | undefined;
    if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");

    if (update && baselinePath) {
      writeBaseline(baselinePath, toBaseline(report));
      io.stdout(`Baseline päivitetty: ${baselinePath}\n`);
      return EXIT_OK;
    }
    if (baseline) {
      const cmp = compare(report, baseline, maxPassDrop);
      io.stdout(formatComparison(cmp) + "\n");
      return cmp.ok ? EXIT_OK : EXIT_GATE_FAILED;
    }
    // Ei baselinea: kaikkien arvioitavien tapausten pitää läpäistä.
    const anyFailed = report.cases.some((c) => c.passed === false);
    return anyFailed ? EXIT_GATE_FAILED : EXIT_OK;
  } catch (err) {
    io.stderr(`Virhe: ${err instanceof Error ? err.message : String(err)}\n`);
    return EXIT_USAGE;
  }
}
