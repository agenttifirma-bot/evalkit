import type { Expect } from "./schema.js";

export interface CheckResult {
  /** null = tapauksella ei ole odotuksia (ei arvioitu). */
  passed: boolean | null;
  failures: string[];
}

/** Arvioi vastauksen ehtoja vasten. Kaikkien annettujen ehtojen pitää täyttyä. */
export function evaluate(expect: Expect | undefined, text: string, judgeScore: number | null): CheckResult {
  if (!expect || Object.keys(expect).length === 0) return { passed: null, failures: [] };
  const failures: string[] = [];
  const lower = text.toLowerCase();

  if (expect.contains !== undefined && !lower.includes(expect.contains.toLowerCase())) {
    failures.push(`contains: vastaus ei sisällä '${expect.contains}'`);
  }
  for (const s of expect.notContains ?? []) {
    if (lower.includes(s.toLowerCase())) failures.push(`notContains: vastaus sisältää kielletyn '${s}'`);
  }
  if (expect.regex !== undefined && !new RegExp(expect.regex).test(text)) {
    failures.push(`regex: vastaus ei täsmää lausekkeeseen /${expect.regex}/`);
  }
  if (expect.minJudgeScore !== undefined) {
    if (judgeScore === null) failures.push("minJudgeScore: tuomaripistettä ei saatu");
    else if (judgeScore < expect.minJudgeScore) failures.push(`minJudgeScore: ${judgeScore} < ${expect.minJudgeScore}`);
  }
  return { passed: failures.length === 0, failures };
}
