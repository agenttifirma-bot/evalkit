# evalkit

[![CI](https://github.com/tonyweckstrom1987/evalkit/actions/workflows/ci.yml/badge.svg)](https://github.com/tonyweckstrom1987/evalkit/actions/workflows/ci.yml) ![Lisenssi: MIT](https://img.shields.io/badge/lisenssi-MIT-blue.svg)

Aja sama prompt-sarja usealla mallilla ja estä regressiot CI:ssä. Evalkit vertaa tuloksia edelliseen hyväksyttyyn ajoon (baseline) ja kaataa ajon vain, jos jokin aiemmin toiminut tapaus lakkaa toimimasta.

**English summary:** A small CLI that runs one prompt set against several models through any OpenAI-compatible endpoint (LiteLLM, OpenRouter) and compares the results with a stored baseline. Only regressions fail the run, so you can use it as a CI gate. Zod-validated eval set format, hard call caps, no API keys in output. The runner takes an injectable `fetch`, so it works with [llm-cassette](https://github.com/tonyweckstrom1987/llm-cassette) for free, deterministic CI runs. Node 22/24, TypeScript.

**Teknologiat:** TypeScript, Node.js 22/24, zod, vitest.

> **Tila:** Ensimmäinen versio. Ydin (skeema, ajo, ehdot, baseline, CLI) on testattu mallia kutsumatta. Cassette-tuki on toistaiseksi kirjastotasolla (`fetch`-asetus); CLI-valinta ja GitHub Action ovat seuraavia vaiheita.

## Pika-aloitus

```bash
npm ci
npm run build
export LLM_API_KEY=...   # ei tarvita, jos rajapinta ei vaadi avainta

# 1) Luo baseline hyväksytystä tilasta
node dist/bin.js run examples/yleinen-fi.json \
  --models openrouter/deepseek/deepseek-v4.1-flash \
  --base-url https://litellm.local/v1 \
  --baseline evalkit.baseline.json --update-baseline

# 2) Aja CI:ssä: kaatuu vain regressioon
node dist/bin.js run examples/yleinen-fi.json \
  --models openrouter/deepseek/deepseek-v4.1-flash \
  --base-url https://litellm.local/v1 \
  --baseline evalkit.baseline.json
```

Commitoi `evalkit.baseline.json` repoon. Kun muutat promptia tai mallia ja tulos on tarkoituksella erilainen, päivitä baseline uudelleen `--update-baseline`-valinnalla ja katselmoi muutos.

## Evalsetin muoto (versio 1)

```json
{
  "version": 1,
  "name": "yleinen-fi",
  "cases": [
    {
      "id": "yleinen-01",
      "prompt": "Mikä on Ruotsin pääkaupunki?",
      "systemPrompt": "Vastaa yhdellä sanalla.",
      "tags": ["yleinen tieto"],
      "expect": {
        "contains": "Tukholma",
        "notContains": ["Helsinki"],
        "regex": "^Tukholma\\.?$",
        "minJudgeScore": 4
      }
    }
  ]
}
```

| Kenttä | Merkitys |
| --- | --- |
| `version` | Aina `1`. |
| `cases[].id` | Yksilöllinen tunniste. Samaa id:tä ei saa käyttää kahdesti. |
| `cases[].prompt` | Käyttäjän viesti mallille. |
| `cases[].systemPrompt` | Valinnainen järjestelmäviesti. |
| `cases[].tags` | Valinnainen. Ensimmäinen tagi on raportoinnin ryhmä; ilman tageja ryhmä päätellään id:n etuliitteestä (`yleinen-01` → `yleinen`). |
| `cases[].expect` | Valinnainen lista ehtoja. Tapaus läpäisee, kun **kaikki** annetut ehdot täyttyvät. Ilman `expect`-kenttää tapausta ei arvioida (vastaus vain tallentuu raporttiin). |
| `expect.contains` | Vastaus sisältää tekstin (kirjainkoosta riippumatta). |
| `expect.notContains` | Vastaus ei sisällä mitään listan teksteistä. |
| `expect.regex` | Vastaus täsmää säännölliseen lausekkeeseen. Virheellinen lauseke hylätään ennen ajoa. |
| `expect.minJudgeScore` | Tuomarimallin pisteet (1–5) vähintään tämän verran. Vaatii `--judge-model`. |

**Vanha muoto:** mcp-model-routerin taulukkomuoto (`expectedContains`, `category`) luetaan edelleen ja muunnetaan versioksi 1, joten olemassa olevat prompt-tiedostot toimivat sellaisenaan.

## Baseline ja regressioportti

`evalkit.baseline.json` tallentaa jokaisen arvioidun tapauksen tuloksen avaimella `malli::tapausId`.

- **Regressio:** tapaus läpäisi baselinessa mutta ei nyt (myös virhe, esim. aikakatkaisu, lasketaan kaatumiseksi).
- **Korjaantunut:** tapaus kaatui baselinessa mutta läpäisee nyt.
- **Uusi:** tapaus ei ole baselinessa. Uusi kaatuva tapaus ei kaada ajoa; päivitä baseline, kun olet tarkistanut sen.
- **Puuttuva:** tapaus on baselinessa mutta ei tässä ajossa (tapaus poistettu tai mallia ei ajettu).
- **Epävakaa malli:** `--max-pass-drop 0.1` sallii yksittäiset regressiot, kunhan minkään mallin läpäisyprosentti ei laske yli 10 %-yksikköä. Oletus on 0: yksikin regressio kaataa ajon.

Ilman `--baseline`-valintaa kaikkien arvioitavien tapausten pitää läpäistä.

## Poistumiskoodit

| Koodi | Merkitys |
| --- | --- |
| 0 | Ok |
| 1 | Regressio tai (ilman baselinea) epäonnistuneita tapauksia |
| 2 | Virhe käytössä tai asetuksissa (puuttuva valinta, rikkinäinen evalset, puuttuva baseline, ylitetty kutsuraja) |

## Valinnat

| Valinta | Merkitys |
| --- | --- |
| `--models a,b` | Mallit pilkulla eroteltuna (tai `EVALKIT_MODELS`). |
| `--base-url <url>` | OpenAI-yhteensopiva osoite (tai `EVALKIT_BASE_URL`). |
| `--api-key-env <NIMI>` | Ympäristömuuttuja, josta avain luetaan (oletus `LLM_API_KEY`). Avainta ei anneta komentoriville. |
| `--judge-model <malli>` | Tuomarimalli. Valitse eri malli kuin arvioitavat, koska malli suosii omaa vastaustyyliään. |
| `--baseline <tiedosto>` | Vertaa baselineen. |
| `--update-baseline` | Kirjoita tämän ajon tulokset baselineksi. |
| `--max-pass-drop <0-1>` | Sallittu läpäisyprosentin lasku (oletus 0). |
| `--concurrency <n>` | Samanaikaiset kutsut (oletus 4). |
| `--timeout-ms <ms>` | Aikakatkaisu per kutsu (oletus 60000). |
| `--max-tokens <n>` | `max_tokens` per kutsu (oletus 1024, katto 4096). |
| `--json <tiedosto>` | Kirjoita koko raportti JSON-tiedostoon. |

## Kulut ja turvallisuus

- **Kovat katot koodissa:** yksi ajo tekee enintään 200 mallikutsua (tuomarikutsut mukaan lukien), ja `max_tokens` on enintään 4096 per kutsu. Raja tarkistetaan ennen yhtäkään kutsua; sen voi ylittää vain kirjastokäytössä `maxCalls`-asetuksella.
- **API-avain** luetaan vain ympäristömuuttujasta eikä sitä tulosta raporttiin tai virheilmoituksiin.
- Raportti (`--json`) sisältää mallien vastaukset sellaisinaan. Älä commitoi sitä, jos promptit sisältävät arkaluonteista tietoa.

## Kirjastokäyttö ja llm-cassette

`runEval` ottaa `fetch`-asetuksen. Antamalla sille [llm-cassette](https://github.com/tonyweckstrom1987/llm-cassette):n palauttaman funktion CI-ajo toistaa tallennetut vastaukset ilman verkkoa ja ilman kuluja:

```ts
import { runEval, loadEvalSet } from "evalkit";
import { cassetteFetch } from "llm-cassette";

const report = await runEval({
  set: loadEvalSet("examples/yleinen-fi.json"),
  models: ["m"],
  baseUrl: "https://litellm.local/v1",
  fetch: cassetteFetch({ path: "test/cassettes/yleinen.json" }), // oletus: replay
});
```

## Rajoitukset

- Tuomarimalli on vain yhden luvun arvio (1–5), eikä se korvaa ihmisen tarkistusta. Käytä sitä täydentävänä mittarina.
- Striimausta ei tueta, ja vain tekstivastauksia arvioidaan.
- CLI ei vielä tue cassettea valintana eikä ole valmis GitHub Action. Ne tulevat seuraavissa versioissa.

## Kehitys

```bash
npm ci
npm run typecheck
npm test
npm run build
```
