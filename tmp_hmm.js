const { readFileSync, writeFileSync } = require('fs');
let f = readFileSync('lib/riskEngine.ts','utf8');

// Add HMM helper function before determineTypeSurveillanceContinue
const helper = `
function applyHMMOverride(
  result: { type: string; raison: string; priorite: string; delaiRecommandation: number; domainesCibles: string[]; typesChecklist: string[]; suggestionsMaintien: any[] },
  hmmState?: string
) {
  if (!hmmState) return result;
  if (hmmState === 'critical') {
    result.priorite = 'critique';
    result.delaiRecommandation = Math.min(result.delaiRecommandation, 7);
    result.raison = '[HMM] État critique détecté — ' + result.raison;
  } else if (hmmState === 'degrading') {
    if (result.priorite !== 'critique') result.priorite = 'haute';
    result.delaiRecommandation = Math.min(result.delaiRecommandation, 30);
    result.raison = '[HMM] Transition silencieuse détectée — ' + result.raison;
  }
  return result;
}

`;

// Insert before the function
const fnStart = f.indexOf('export function determineTypeSurveillanceContinue(');
f = f.slice(0, fnStart) + helper + f.slice(fnStart);

// Now replace each return statement in the function to apply HMM
// Find the function body start
const fnBodyStart = f.indexOf('{\n', fnStart) + 2;

// Replace all "return {" at appropriate indentation with HMM override
// Pattern: find "    return {" at indentation level 4 within the function
const pattern = /\n    return \{/g;
let count = 0;
f = f.replace(pattern, (match) => {
  count++;
  return `\n    const _hmmResult${count} = {`;
});

// After each result assignment, add the HMM override and return
for (let i = 1; i <= count; i++) {
  f = f.replace(
    `_hmmResult${i}`,
    `_hmmResult${i}`
  );
}

writeFileSync('lib/riskEngine.ts', f);
console.log('Count:', count);
