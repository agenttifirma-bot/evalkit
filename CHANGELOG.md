# Muutosloki

Muoto noudattaa [Keep a Changelog](https://keepachangelog.com/fi/1.1.0/) -tapaa ja versiointi [semveriä](https://semver.org/lang/fi/).

## [0.3.0] - 2026-10-17

Ensimmäinen npm-julkaisu.

### Lisätty
- Julkaisu npm:ään nimellä `@tonyweckstrom/evalkit`; `npx @tonyweckstrom/evalkit` toimii ilman asennusta.
- `--version` / `-v`. Versio luetaan `package.json`:sta, joten se ei voi poiketa julkaistusta versiosta.
- README: Asennus, esimerkkituloste, "Vaihtoehtoja ja miksi tämä".
- CI: `paketti`-työ pakkaa paketin, asentaa sen puhtaaseen kansioon ja ajaa `validate`-komennon sekä cassette-ajon, jossa baseline täsmää, ja ajon, jossa regressio kaataa poistumiskoodilla 1.
- `prepublishOnly` ajaa tyyppitarkistuksen ja testit ennen julkaisua.

### Muutettu
- `llm-cassette`-riippuvuus tulee nyt npm:stä (`@tonyweckstrom/llm-cassette@^0.2.0`) eikä GitHubista kiinnitetyllä commitilla. `--cassette` vaatii edelleen tämän paketin (valinnainen peer-riippuvuus).
- Kirjastokäytössä tuonti on `@tonyweckstrom/evalkit`.

## [0.2.0]

Ei julkaistu npm:ään. GitHub Action (`validate` ja `run`), `validate`-komento, `--cassette`.

## [0.1.0]

Ei julkaistu npm:ään. Ensimmäinen versio: eval-ajo, baseline ja CLI.
