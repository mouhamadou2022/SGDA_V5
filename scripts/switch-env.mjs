// scripts/switch-env.mjs — Bascule .env.local entre PROD et STAGING.
// Usage : node scripts/switch-env.mjs staging | node scripts/switch-env.mjs prod
// - staging : sauvegarde .env.local -> .env.local.prod-bak (1ere fois), puis copie .env.staging.
// - prod    : restaure .env.local.prod-bak.
// Ne committe jamais rien : .env* est ignore par git.

import { copyFileSync, existsSync } from 'fs';

const cible = process.argv[2];
const PROD = '.env.local';
const BAK = '.env.local.prod-bak';
const STAGING = '.env.staging';

if (cible === 'staging') {
  if (!existsSync(STAGING)) {
    console.error('Manquant : .env.staging (copiez .env.staging.example et renseignez les cles).');
    process.exit(1);
  }
  if (!existsSync(BAK)) copyFileSync(PROD, BAK);
  copyFileSync(STAGING, PROD);
  console.log('OK : .env.local pointe vers STAGING (prod sauvegardee dans .env.local.prod-bak).');
} else if (cible === 'prod') {
  if (!existsSync(BAK)) {
    console.error('Pas de sauvegarde prod (.env.local.prod-bak introuvable).');
    process.exit(1);
  }
  copyFileSync(BAK, PROD);
  console.log('OK : .env.local restaure vers PROD.');
} else {
  console.error('Usage : node scripts/switch-env.mjs staging|prod');
  process.exit(1);
}
