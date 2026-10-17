import { createRequire } from "node:module";

/** Paketin versio luetaan package.json:sta, jotta se ei voi poiketa julkaistusta versiosta. */
export const VERSIO: string = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
