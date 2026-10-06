// lib/ia/pilote/bouclePilote.ts
// Boucle agentique du pilote AERORISQ (client direct → Ollama local).
// L'IA RAISONNE + AGIT : elle appelle les outils déclarés (lecture directe,
// écriture UNIQUEMENT après confirmation humaine via onConfirmer), jusqu'à
// la réponse finale. Max 6 itérations — jamais de boucle infinie.

'use client'

import { listerOutils, declarerOutil, trouverOutil, type ContexteOutils } from './outils'
import { normaliserRecherche } from '@/lib/domaines'

export const MODELE_PILOTE = 'aerorisq'
export const URL_OLLAMA = 'http://localhost:11434'
const MAX_ITERATIONS = 6

/**
 * Configuration effective du pilote (surcharges via .env.local) :
 * - NEXT_PUBLIC_OLLAMA_URL : Ollama distant, Docker ou port personnalisé
 *   (ex. http://127.0.0.1:11434 ou http://192.168.1.20:11434)
 * - NEXT_PUBLIC_PILOTE_MODEL : modèle à utiliser au lieu du « aerorisq »
 *   personnalisé (ex. mistral, qwen3:8b) — doit supporter les outils.
 */
export function configPilote(): { url: string; modele: string } {
  const url = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OLLAMA_URL) || URL_OLLAMA
  const modele = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_PILOTE_MODEL) || MODELE_PILOTE
  return { url: url.replace(/\/$/, ''), modele }
}

/**
 * Variantes d'URL à essayer : le cas classique est localhost résolu en ::1
 * (IPv6) alors qu'Ollama n'écoute que 127.0.0.1 (IPv4), ou l'inverse.
 */
export function variantesUrlOllama(url: string): string[] {
  const sansFin = url.replace(/\/$/, '')
  const variantes = [sansFin]
  if (sansFin.includes('localhost')) variantes.push(sansFin.replace('localhost', '127.0.0.1'))
  else if (sansFin.includes('127.0.0.1')) variantes.push(sansFin.replace('127.0.0.1', 'localhost'))
  return variantes
}

/**
 * Politesses pures (« bonjour », « merci »…) : jamais d'outils, jamais de
 * boucle — un micro-appel direct (mesuré : la boucle complète avec les 35
 * outils prend 200 s+ sur CPU pour un simple « bonsoir »).
 * Strict : le message normalisé doit être EXACTEMENT une politesse.
 */
const SALUTATIONS = new Set([
  'bonjour', 'bonsoir', 'salut', 'hello', 'merci', 'ok',
  'au revoir', 'a bientot', 'ciao', 'yo', 'coucou',
]);

/**
 * Tâche dure = réflexion rentable malgré le coût CPU : évaluations,
 * analyses, synthèses, briefings, rapports, comparaisons, diagnostics.
 * Le reste (questions, états, listes) reste en réponse directe.
 */
const MOTS_DURS =
  /évalu|évalue|analy|synth|briefing|rapport|compar|recommand|audit|diagnostic|justifi|expliqu|pourquoi|plan d'action|contre-expertise/i;

export function necessiteReflexion(texte: string): boolean {
  const t = texte || '';
  return t.length > 250 || MOTS_DURS.test(t);
}

export function estSalutation(texte: string): boolean {
  // Le copilote préfixe « DEMANDE : … » (et joint des pièces) : on juge sur
  // la demande elle-même (DERNIER segment), sinon « bonsoir » + préfixe rate
  // le fast-path et le petit modèle résume son prompt système au lieu de
  // saluer (mesuré en prod).
  const morceaux = (texte || '').split(/demande\s*:/i);
  const cible = morceaux.length > 1 ? morceaux[morceaux.length - 1] : texte;
  const n = normaliserRecherche(cible);
  if (SALUTATIONS.has(n)) return true;
  // Politesse avec intensifieur seul (« merci beaucoup », « merci bien ») :
  // reste une salutation pure. Dès qu'un autre contenu suit (« merci pour
  // le rapport… »), ce n'est plus une salutation.
  if (/^merci(\s+(beaucoup|bien|infiniment))?$/.test(n)) return true;
  return false;
}

/**
 * Signature d'un écho du prompt système : le petit modèle, noyé sous les
 * consignes face à une demande vide, résume ses règles au lieu de répondre.
 * Ces formulations n'apparaissent jamais dans une vraie réponse d'inspecteur.
 */
const ECHO_PROMPT_SYSTEME = /règle de fonctionnement|synthèse de (ces|vos) règles|prompt système/i;

export function estEchoPromptSysteme(reponse: string): boolean {
  return ECHO_PROMPT_SYSTEME.test(reponse || '');
}

/**
 * Socle toujours disponible : retrouver un site, chercher une info
 * externe, voir l'état d'un site. Couvre les règles « code incertain →
 * rechercher_aerodrome d'abord » et « AIP/SUP → rechercher_web ».
 */
const OUTILS_SOCLE = ['rechercher_aerodrome', 'etat_site', 'rechercher_web'];

/**
 * Sélection d'outils par intention (mot-clés sur texte normalisé) :
 * envoyer 6-9 outils au lieu de 35 divise le pré-remplissage CPU et
 * fiabilise le choix du petit modèle (mesuré : « Compare GOBD et GOTT »
 * timeout à 300 s avec les 35 outils, zéro outil appelé).
 * Règle de sécurité : aucune intention reconnue → liste COMPLÈTE
 * (comportement actuel, jamais de régression par outil manquant).
 */
const INTENTIONS_OUTILS: Array<{ motif: RegExp; outils: string[] }> = [
  { motif: /compar/, outils: ['comparer_sites', 'consulter_profil_risque', 'lister_ecarts'] },
  { motif: /briefing|rapport|pdf|word/, outils: ['generer_rapport_pdf', 'generer_rapport_word', 'lister_plannings', 'suivi_surveillances', 'rapport_surveillance'] },
  { motif: /planifi|program|surveillance/, outils: ['proposer_surveillance', 'preparer_checklist', 'lister_plannings', 'suivi_surveillances'] },
  { motif: /planning/, outils: ['lister_plannings', 'suivi_surveillances', 'proposer_surveillance'] },
  { motif: /ecart|pac|mise en oeuvre|suivi/, outils: ['lister_ecarts', 'detail_ecart', 'creer_ecart', 'suivi_surveillances'] },
  { motif: /\betat\b|conformite|certificat|homolog/, outils: ['etat_site', 'consulter_profil_risque', 'lister_ecarts', 'dossier_certification', 'dossier_homologation'] },
  { motif: /profil|risque|score|sgs|maturite/, outils: ['consulter_profil_risque', 'recalculer_profil_risque', 'comparer_sites', 'alertes_risque'] },
  { motif: /checklist/, outils: ['preparer_checklist', 'etat_checklist'] },
  { motif: /dossier/, outils: ['lister_dossiers', 'dossier_certification', 'dossier_homologation'] },
  { motif: /evenement|incident|accident/, outils: ['lister_evenements'] },
  { motif: /aip|sup|reglement|\bdoc\b|annexe|\bras\b|norme|exigence|conforme|conformite|guide|longueur de piste|actualite|meteo/, outils: ['rechercher_reglementaire', 'rechercher_web', 'documents_kit'] },
  { motif: /formation|competence|equipe|charge/, outils: ['etat_formation', 'charge_travail'] },
  { motif: /enquete/, outils: ['etat_enquetes'] },
  { motif: /registre/, outils: ['consulter_registre'] },
  { motif: /message|notification/, outils: ['messages_recents'] },
  { motif: /audit|journal/, outils: ['journal_audit'] },
  { motif: /activite|resume|synthese|tableau de bord/, outils: ['resumer_activite', 'alertes_risque'] },
  { motif: /kit|document|modele|fiche/, outils: ['documents_kit', 'fiche_aerodrome'] },
  { motif: /cours du soir|devoirs|revise.*kit|kit.*jour|relis.*documents/, outils: ['cours_du_soir', 'documents_kit'] },
  { motif: /prediction|tendance/, outils: ['consulter_profil_risque', 'etat_ml'] },
];

/**
 * Noms d'outils à déclarer à Ollama pour une instruction : intention(s)
 * reconnue(s) + socle, dédupliqués ; inconnu → tous (sûr).
 * Pure et testée (aucun réseau).
 */
export function selectionnerOutils(instruction: string): string[] {
  const n = normaliserRecherche(instruction || '');
  const extras: string[] = [];
  for (const { motif, outils } of INTENTIONS_OUTILS) {
    if (motif.test(n)) {
      for (const o of outils) if (!extras.includes(o)) extras.push(o);
    }
  }
  if (extras.length === 0) return listerOutils().map(o => o.nom);
  for (const o of OUTILS_SOCLE) if (!extras.includes(o)) extras.push(o);
  return extras;
}

function messageDiagnosticOllama(urlEssayees: string[]): string {
  return [
    `Ollama est injoignable depuis le navigateur (${urlEssayees.join(' , ')}) — alors qu'il est peut-être démarré : le navigateur n'arrive pas à le joindre. Vérifiez dans l'ordre :`,
    `1. Ollama tourne-t-il ? Ouvrez un terminal : \`ollama list\` doit afficher vos modèles (mistral, qwen…). Sinon lancez \`ollama serve\`.`,
    `2. Depuis CE navigateur, ouvrez http://localhost:11434/ puis http://127.0.0.1:11434/ : l'un doit répondre « Ollama is running ». Si localhost échoue mais 127.0.0.1 répond (ou l'inverse), définissez NEXT_PUBLIC_OLLAMA_URL avec celui qui marche.`,
    `3. Page servie en HTTPS ou depuis une autre machine ? Le navigateur bloque alors http://localhost (contenu mixte/CORS) : servez l'app en HTTP local, ou fixez OLLAMA_ORIGINS et Ollama sur 0.0.0.0 puis NEXT_PUBLIC_OLLAMA_URL en conséquence.`,
    `4. Modèle pilote : \`ollama create aerorisq -f Modelfile.aerorisq\` (ou NEXT_PUBLIC_PILOTE_MODEL=mistral si votre mistral supporte les outils).`,
  ].join('\n')
}

export interface ActionPilote {
  outil: string
  resume: string
  /** 'executee' | 'refusee' | 'erreur' */
  statut: 'executee' | 'refusee' | 'erreur'
}

export interface ResultatPilote {
  reponse: string
  actions: ActionPilote[]
  /** Vrai si le modèle de vision/pilote est absent (guider l'install). */
  modeleAbsent: boolean
  /** Vrai si l'utilisateur a interrompu (signal) : réponse partielle, aucun outil lancé à moitié. */
  interrompu?: boolean
}

interface MessageOllama {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>
  tool_name?: string
}

const SYSTEME_PILOTE = `Tu es AERORISQ en MODE PILOTE : tu peux AGIR sur l'application SGDA via des outils, pas seulement répondre.
Règles : utilise les outils pour obtenir des données réelles (ne les invente jamais) ; enchaîne au besoin (état du site, puis profil, puis écarts) ; si un site est nommé sans code OACI certain, appelle d'abord rechercher_aerodrome — ne devine JAMAIS un code OACI ; pour toute info externe (AIP, SUP, guides, actus), appelle rechercher_web (autorités aviation) et cite l'URL ; quand l'utilisateur demande de planifier, appelle proposer_surveillance UNE fois avec les bons arguments (date AAAA-MM-JJ obligatoire — demande-la si absente) puis résume ; pour préparer une mission, appelle preparer_checklist (portée calculée depuis les écarts et le profil) ; pour un rapport PDF, appelle generer_rapport_pdf avec le bon type (briefing ou checklist par site, certification ou homologation pour le national) — le fichier se télécharge aussitôt ; chaque écriture a déjà été approuvée par l'utilisateur via l'interface, exécute-la UNE seule fois puis résume ; réponds en français, Markdown simple, sans LaTeX.
Trajectoires validées (imite-les) :
1. « état Tambacounda ? » → rechercher_aerodrome(Tambacounda) → etat_site(GOTT) + consulter_profil_risque(GOTT) → résumé chiffré.
2. « surveille les écarts de GOBD » + PAC non acceptés → suivi_ecarts via lister_ecarts, JAMAIS mise_oeuvre_pac (réservée aux PAC acceptés).
3. « SUP en vigueur à Diass ? » → rechercher_web("SUP AIP GOBD") → réponse avec l'URL ASECNA citée.
4. « planifie une périodique à Ziguinchor le 2026-11-10 » → proposer_surveillance UNE fois → « Brouillon créé, à valider dans Planning. »
 5. « le briefing de GOBD en Word » → generer_rapport_word(briefing, GOBD) → « Fichier téléchargé. »
 6. Exploitant demandant une écriture → refus poli + redirection vers son portail, jamais d'outil d'écriture.
 7. « Compare GOBD et GOTT » → comparer_sites UNE fois avec sites="GOBD,GOTT" (JAMAIS de comparaison manuelle via etat_site/profil/rechercher_web) → tableau cité avec les deux codes OACI.
 8. « Génère le briefing de GOBD en PDF » → generer_rapport_pdf(type="briefing", site="GOBD") UNE fois (même en banc d'essai où l'écriture est refusée : la PROPOSITION prouve le bon choix), puis résumé citant GOBD.
 9. « Selon le RAS 14… / Que dit le Doc 9859… / Quel § impose… ? » → rechercher_reglementaire UNE fois avec la question (Kit Inspecteur, cite le § exact) — JAMAIS rechercher_web pour le réglementaire. Miroir : « selon l'AIP / SUP en vigueur / donnée publiée ? » → rechercher_web (source externe à jour + URL citée).
Règles mesurées (banc d'essai — les respecter fait gagner ~20 points) :
 10. Cite TOUJOURS dans ta réponse les codes OACI exacts (GOBD, GOTT…), les références (écarts ECA-…, § RAS/Doc) et les paramètres clés de la demande (dates, sites) — jamais de résumé sans les identifiants. Question « mise en œuvre ou suivi ? » → réponds en utilisant explicitement le mot « suivi » quand les PAC ne sont pas acceptés.
 11. Question mentionnant AIP, SUP, guide ou réglementation → rechercher_web D'ABORD (autorités + URL citée), même si tu connais le site par les données internes. Plafond : 3 recherches web max par demande — affine la requête plutôt que de multiplier les appels (mesuré : 6 recherches = 504 s sur CPU pour le même 100/100).
 12. Code OACI incertain, inconnu ou refusé par un outil (« introuvable ») → rechercher_aerodrome AVANT tout autre outil de site ; après 2 échecs sur le même site, dis-le et propose une reformulation au lieu de réessayer.`

export interface AppelOllamaAssemble {
  content: string
  toolCalls: Array<{ function: { name: string; arguments: Record<string, unknown> } }>
  /** Motif de fin Ollama : 'length' = coupé au plafond → suite automatique. */
  doneReason?: string
}

/**
 * Assemble une réponse Ollama /api/chat en streaming (NDJSON) : concatène
 * les fragments de texte et fusionne les appels d'outils (objets complets
 * ou fragments de chaîne à parser en fin). Pur et testé.
 */
export function assemblerReponseStream(lignes: string[]): AppelOllamaAssemble {
  let content = ''
  let doneReason: string | undefined
  const outils = new Map<string, { argsFrags: string[]; argsObj: Record<string, unknown> }>()
  for (const ligne of lignes) {
    const t = (ligne || '').trim()
    if (!t || t === '[DONE]') continue
    let chunk: any
    try { chunk = JSON.parse(t) } catch { continue }
    if (typeof chunk?.done_reason === 'string' && chunk.done_reason) doneReason = chunk.done_reason
    const msg = chunk?.message || {}
    if (typeof msg.content === 'string' && msg.content) content += msg.content
    const tcs = Array.isArray(msg.tool_calls) ? msg.tool_calls : []
    for (const tc of tcs) {
      const nom = tc?.function?.name || tc?.name || ''
      if (!nom) continue
      let entree = outils.get(nom)
      if (!entree) { entree = { argsFrags: [], argsObj: {} }; outils.set(nom, entree) }
      const args = tc?.function?.arguments ?? tc?.arguments
      if (typeof args === 'string') {
        if (args) entree.argsFrags.push(args)
      } else if (args && typeof args === 'object') {
        Object.assign(entree.argsObj, args)
      }
    }
  }
  const toolCalls = [...outils.entries()].map(([name, e]) => {
    let parsed: Record<string, unknown> = {}
    if (e.argsFrags.length > 0) {
      try { parsed = JSON.parse(e.argsFrags.join('')) } catch { parsed = {} }
    }
    return { function: { name, arguments: { ...e.argsObj, ...parsed } } }
  })
  return { content, toolCalls, doneReason }
}

/**
 * Cache des résultats d'outils LECTURE : « état GOBD ? » posé 3 fois = 1
 * seule lecture, les redites viennent du cache. Jamais les écritures,
 * jamais la messagerie ni l'audit (frais et personnels).
 */
const TTL_DEFAUT_OUTIL_MS = 5 * 60 * 1000;
const TTL_CACHE_OUTIL: Record<string, number> = {
  rechercher_reglementaire: 24 * 3600 * 1000,
  documents_kit: 24 * 3600 * 1000,
  fiche_aerodrome: 15 * 60 * 1000,
  dossier_certification: 15 * 60 * 1000,
  dossier_homologation: 15 * 60 * 1000,
};
const OUTILS_SANS_CACHE = new Set(['messages_recents', 'journal_audit']);

/** Normalisation sémantique légère : « État GOBD » ≡ « etat gobd ». */
export function normaliserValeurCache(valeur: unknown): unknown {
  if (typeof valeur === 'string') {
    return normaliserRecherche(valeur);
  }
  if (Array.isArray(valeur)) return valeur.map(normaliserValeurCache);
  if (valeur && typeof valeur === 'object') {
    const trie: Record<string, unknown> = {};
    for (const k of Object.keys(valeur).sort()) {
      trie[k] = normaliserValeurCache((valeur as Record<string, unknown>)[k]);
    }
    return trie;
  }
  return valeur;
}

/** Clé de cache : outil + arguments normalisés (ordre et casse indifférents). */
export function cleCacheOutil(nom: string, args: Record<string, unknown>): string {
  return `${nom}::${JSON.stringify(normaliserValeurCache(args) ?? {})}`;
}

interface EntreeCacheOutil {
  resultat: string;
  expireLe: number;
}

const cacheOutils = new Map<string, EntreeCacheOutil>();
const statsCache = { lectures: 0, hits: 0 };

export function statsCacheOutils(): { lectures: number; hits: number; taux: number; taille: number } {
  return {
    lectures: statsCache.lectures,
    hits: statsCache.hits,
    taux: statsCache.lectures > 0 ? Math.round((statsCache.hits / statsCache.lectures) * 100) : 0,
    taille: cacheOutils.size,
  };
}

/** Résultat caché si outil lisible, cachable et non expiré (sinon null). */
export function lireCacheOutil(
  nom: string,
  args: Record<string, unknown>,
  ecriture: boolean,
  maintenant: number = Date.now(),
): string | null {
  if (ecriture || OUTILS_SANS_CACHE.has(nom)) return null;
  statsCache.lectures++;
  const entree = cacheOutils.get(cleCacheOutil(nom, args));
  if (!entree || entree.expireLe <= maintenant) {
    if (entree) cacheOutils.delete(cleCacheOutil(nom, args));
    return null;
  }
  statsCache.hits++;
  return entree.resultat;
}

export function ecrireCacheOutil(
  nom: string,
  args: Record<string, unknown>,
  ecriture: boolean,
  resultat: string,
  maintenant: number = Date.now(),
): void {
  if (ecriture || OUTILS_SANS_CACHE.has(nom)) return;
  const ttl = TTL_CACHE_OUTIL[nom] ?? TTL_DEFAUT_OUTIL_MS;
  cacheOutils.set(cleCacheOutil(nom, args), { resultat, expireLe: maintenant + ttl });
  if (cacheOutils.size > 200) {
    const premiere = cacheOutils.keys().next().value;
    if (premiere) cacheOutils.delete(premiere);
  }
}

/** Combine un signal externe (interruption) et un timeout en un seul signal. */
function combinerSignaux(externe: AbortSignal | undefined, delaiMs: number): { signal: AbortSignal; annuler: () => void } {
  const controleur = new AbortController()
  const timer = setTimeout(() => controleur.abort(new DOMException('Délai dépassé', 'TimeoutError')), delaiMs)
  const surInterruption = () => {
    clearTimeout(timer)
    controleur.abort(new DOMException('Interrompu par l’utilisateur', 'AbortError'))
  }
  if (externe) {
    if (externe.aborted) surInterruption()
    else externe.addEventListener('abort', surInterruption, { once: true })
  }
  return { signal: controleur.signal, annuler: () => { clearTimeout(timer); externe?.removeEventListener('abort', surInterruption) } }
}

export async function executerPilote(params: {
  instruction: string
  historique?: Array<{ role: 'user' | 'assistant'; content: string }>
  contexte?: ContexteOutils
  /** Appelé pour chaque outil d'ÉCRITURE : true = l'utilisateur approuve. */
  onConfirmer: (outil: string, args: Record<string, unknown>) => Promise<boolean>
  onTrace?: (etape: string) => void
  /** Flux de texte au fil de la génération (streaming : impression immédiate). */
  onToken?: (texte: string) => void
  /** Interruption réelle : aucun outil ne démarre après abort. */
  signal?: AbortSignal
}): Promise<ResultatPilote> {
  const actions: ActionPilote[] = []
  // Rappel collé à la demande (effet de récence) : les consignes critiques
  // survivent mieux ici qu'enfouies dans le système avec les 34 outils.
  const RAPPEL_CONSIGNES = ` Rappel : cite les codes OACI, références et dates exacts ; AIP/SUP/guide → rechercher_web d'abord ; code incertain → rechercher_aerodrome d'abord ; Compare X et Y → comparer_sites une fois ; briefing PDF → generer_rapport_pdf(type="briefing") ; mise en oeuvre ou suivi → écris le mot suivi (PAC non acceptés) ; Doc/RAS/§/conformité → rechercher_reglementaire (Kit) ; AIP/SUP publié → rechercher_web.`;
  const messages: MessageOllama[] = [
    { role: 'system', content: SYSTEME_PILOTE },
    ...(params.historique || []).slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: params.instruction.length < 500 ? params.instruction + RAPPEL_CONSIGNES : params.instruction },
  ]
  // Pré-vol : vérifie Ollama AVANT la boucle (8 s max par variante) au lieu
  // de laisser l'utilisateur attendre jusqu'à 6 × 180 s dans le vide.
  const { url: urlConfiguree, modele } = configPilote()
  const urls = variantesUrlOllama(urlConfiguree)
  let urlActive: string | null = null
  for (const u of urls) {
    try {
      const sonde = await fetch(`${u}/api/tags`, { signal: AbortSignal.timeout(8000) })
      if (sonde.ok) { urlActive = u; break }
      params.onTrace?.(`⚠️ ${u} répond HTTP ${(sonde as Response).status} — essai suivant…`)
    } catch {
      params.onTrace?.(`⚠️ ${u} injoignable — essai suivant…`)
    }
  }
  if (!urlActive) {
    return { reponse: messageDiagnosticOllama(urls), actions, modeleAbsent: false }
  }
  if (urlActive !== urlConfiguree) {
    params.onTrace?.(`✅ Ollama joignable via ${urlActive} (pensez à fixer NEXT_PUBLIC_OLLAMA_URL=${urlActive})`)
  } else {
    params.onTrace?.('✅ Ollama joignable — raisonnement en cours…')
  }

  // Politesse pure : micro-appel direct SANS outils (rapide), jamais la boucle.
  if (estSalutation(params.instruction)) {
    params.onTrace?.('👋 Simple salutation — réponse directe.')
    const { signal, annuler } = combinerSignaux(params.signal, 60000)
    try {
      const salut = await fetch(`${urlActive}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modele,
          messages: [
            { role: 'system', content: 'Tu es AERORISQ, l\u2019inspecteur virtuel de l\u2019ANACIM. Salue brièvement en une phrase et propose ton aide.' },
            { role: 'user', content: params.instruction },
          ],
          stream: typeof params.onToken === 'function',
          think: false,
          keep_alive: '30m',
          options: { temperature: 0.3, num_ctx: 2048, num_predict: 100 },
        }),
        signal,
      })
      if (!salut.ok) {
        return { reponse: 'Bonjour ! Je suis AERORISQ. Comment puis-je vous aider ?', actions, modeleAbsent: false }
      }
      if (typeof params.onToken === 'function' && salut.body) {
        const lecteur = salut.body.getReader()
        const decodeur = new TextDecoder()
        let texte = ''
        for (;;) {
          const { done, value } = await lecteur.read()
          if (done) break
          const lignes = (decodeur.decode(value, { stream: true })).split('\n')
          for (const ligne of lignes) {
            const t = ligne.trim()
            if (!t || t === '[DONE]') continue
            try {
              const partiel = JSON.parse(t)?.message?.content
              if (typeof partiel === 'string' && partiel) {
                texte += partiel
                params.onToken(partiel)
              }
            } catch { /* fragment incomplet : ignoré */ }
          }
        }
        return { reponse: texte.trim() || 'Bonjour ! Je suis AERORISQ. Comment puis-je vous aider ?', actions, modeleAbsent: false }
      }
      const dataSalut = await salut.json().catch(() => null)
      const texteSalut = (dataSalut?.message?.content || '').trim()
      if (texteSalut && typeof params.onToken === 'function') params.onToken(texteSalut)
      return { reponse: texteSalut || 'Bonjour ! Je suis AERORISQ. Comment puis-je vous aider ?', actions, modeleAbsent: false }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || params.signal?.aborted) {
        return { reponse: '', actions, modeleAbsent: false, interrompu: true }
      }
      return { reponse: 'Bonjour ! Je suis AERORISQ. Comment puis-je vous aider ?', actions, modeleAbsent: false }
    } finally {
      annuler()
    }
  }
  // Réflexion sélective : vite par défaut, profond sur demande (tâche dure).
  const reflexionProfonde = necessiteReflexion(params.instruction);
  if (reflexionProfonde) {
    params.onTrace?.('🧠 Réflexion approfondie activée — plus lent, plus rigoureux.');
  }
  // Sélection par intention : 6-9 outils pertinents au lieu de 35 —
  // pré-remplissage CPU réduit et choix fiabilisé. Inconnu → tous.
  const nomsOutils = selectionnerOutils(params.instruction);
  const outils = nomsOutils
    .map(n => listerOutils().find(o => o.nom === n))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .map(declarerOutil)
  // Suites après coupure au plafond (done_reason length) : max 2 par demande.
  let continuations = 0
  if (nomsOutils.length < listerOutils().length) {
    params.onTrace?.(`🧰 ${outils.length} outils pertinents (${nomsOutils.slice(0, 5).join(', ')}…)`);
  }

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (params.signal?.aborted) {
      return { reponse: '', actions, modeleAbsent: false, interrompu: true }
    }
    const veutStream = typeof params.onToken === 'function'
    // 300 s : aligné sur maxDuration des routes IA (300 s). Une itération
    // lourde (gros prompt CPU) ne doit plus passer pour « injoignable ».
    // L'utilisateur garde la main via Interrompre (signal).
    const { signal, annuler } = combinerSignaux(params.signal, 300000)
    let appel: Response
    try {
      appel = await fetch(`${urlActive}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modele,
          messages,
          tools: outils,
          stream: veutStream,
          // think:false TOUJOURS : qwen3 réfléchit sinon en cachette (~200
          // tokens invisibles = des minutes sur CPU). Mesuré : bonjour
          // 85s → 2s ; banc d'essai : comparer 665s et briefing 1082s avec
          // think:true (timeout 600s dépassé). La « réflexion approfondie »
          // reste un simple tag de trace, jamais du think Ollama.
          think: false,
          keep_alive: '30m',
          // num_predict 800 (≈ 1 min max sur CPU au lieu de ~3 min à 1200) :
          // la plupart des réponses tiennent dedans ; si Ollama coupe au
          // plafond (done_reason length), la boucle demande UNE suite (max 2).
          // Le contenu des rapports vient des outils, le texte n'est qu'un
          // résumé — sans borne, le modèle divague sans fin.
          // temperature 0.1 : outil d'inspection = déterminisme > créativité.
          // Mesuré : à 0.2 le choix d'outil varie d'une exécution à l'autre
          // (detail_ecart 100/100 deux fois puis 20/100 sans aucun appel).
          options: { temperature: 0.1, num_ctx: 16384, num_predict: 800 },
        }),
        signal,
      })
    } catch (err) {
      annuler()
      if ((err as Error)?.name === 'AbortError' || params.signal?.aborted) {
        return { reponse: '', actions, modeleAbsent: false, interrompu: true }
      }
      // Timeout (5 min) : Ollama tourne mais rame sur un gros prompt CPU —
      // ce N'EST PAS une panne : conseillez de découper, pas de redémarrer.
      if ((err as Error)?.name === 'TimeoutError') {
        return {
          reponse: 'Ollama met trop longtemps à répondre (gros traitement sur ce poste) — ce n\u2019est pas une panne. Reformulez en plus petites étapes, ou interrompez et réessayez.',
          actions, modeleAbsent: false,
        }
      }
      return {
        reponse: 'Ollama est injoignable — vérifiez qu’Ollama est démarré sur cette machine, puis réessayez.',
        actions, modeleAbsent: false,
      }
    }
    if (!appel.ok) {
      annuler()
      const err = await appel.text().catch(() => '')
      if (/not found|does not exist/i.test(err)) {
        return {
          reponse: `Le modèle pilote « ${modele} » est absent d'Ollama (vos mistral/qwen existants ne suffisent pas tels quels). Créez-le : \`ollama create aerorisq -f Modelfile.aerorisq\` — ou fixez NEXT_PUBLIC_PILOTE_MODEL=mistral (si ce modèle supporte les outils) puis rechargez la page.`,
          actions, modeleAbsent: true,
        }
      }
      return { reponse: `Le pilote a échoué (HTTP ${appel.status}). Réessayez.`, actions, modeleAbsent: false }
    }
    let contenuAssemble = ''
    let toolCalls: Array<{ function: { name: string; arguments: Record<string, unknown> } }> = []
    let doneReason: string | undefined
    try {
      if (veutStream && appel.body) {
        // Streaming : texte affiché au fil de l'eau, outils assemblés à la fin.
        const lecteur = appel.body.getReader()
        const decodeur = new TextDecoder()
        let tampon = ''
        const lignes: string[] = []
        for (;;) {
          const { done, value } = await lecteur.read()
          if (done) break
          tampon += decodeur.decode(value, { stream: true })
          const morceaux = tampon.split('\n')
          tampon = morceaux.pop() || ''
          for (const morceau of morceaux) {
            const t = morceau.trim()
            if (!t || t === '[DONE]') continue
            lignes.push(t)
            try {
              const partiel = JSON.parse(t)?.message?.content
              if (typeof partiel === 'string' && partiel) params.onToken!(partiel)
            } catch { /* fragment JSON incomplet : ignoré, repris au tour suivant */ }
          }
        }
        if (tampon.trim() && tampon.trim() !== '[DONE]') lignes.push(tampon.trim())
        const assemble = assemblerReponseStream(lignes)
        contenuAssemble = assemble.content
        toolCalls = assemble.toolCalls
        doneReason = assemble.doneReason
      } else {
        const data = await appel.json()
        const msg = data?.message || {}
        contenuAssemble = msg.content || ''
        toolCalls = msg.tool_calls || []
        doneReason = typeof data?.done_reason === 'string' ? data.done_reason : undefined
      }
    } catch (err) {
      annuler()
      if ((err as Error)?.name === 'AbortError' || params.signal?.aborted) {
        return { reponse: contenuAssemble, actions, modeleAbsent: false, interrompu: true }
      }
      return { reponse: `Le pilote a échoué en lecture. Réessayez.`, actions, modeleAbsent: false }
    } finally {
      annuler()
    }

    if (toolCalls.length === 0) {
      const texte = (contenuAssemble || '').trim()
      // Écho du prompt système (demande vide + petit modèle noyé) : repli
      // salutation plutôt que de servir un résumé des consignes internes.
      if (texte && estEchoPromptSysteme(texte)) {
        params.onTrace?.('⚠️ Écho du prompt système — repli salutation.')
        return { reponse: 'Bonjour ! Je suis AERORISQ. Comment puis-je vous aider ?', actions, modeleAbsent: false }
      }
      // Coupé au plafond (800) avec du texte : UNE suite, bornée (max 2 par
      // demande) — les réponses courantes sortent vite, les longues aboutissent.
      if (doneReason === 'length' && texte && continuations < 2) {
        continuations++
        params.onTrace?.('✂️ Réponse coupée au plafond — suite…')
        messages.push({ role: 'assistant', content: contenuAssemble || '' })
        messages.push({ role: 'user', content: 'Continuez EXACTEMENT où vous vous êtes arrêté, sans répéter.' })
        continue
      }
      return { reponse: texte || 'Le pilote n’a pas produit de réponse.', actions, modeleAbsent: false }
    }

    messages.push({ role: 'assistant', content: contenuAssemble || '', tool_calls: toolCalls })
    for (const tc of toolCalls) {
      const nom = tc.function?.name || ''
      const args = tc.function?.arguments || {}
      const outil = trouverOutil(nom)
      if (!outil) {
        messages.push({ role: 'tool', content: JSON.stringify({ erreur: `Outil « ${nom} » inconnu.` }), tool_name: nom })
        continue
      }
      params.onTrace?.(`${outil.ecriture ? '✋' : '⚙️'} ${nom}`)
      if (outil.ecriture) {
        const approuve = await params.onConfirmer(nom, args)
        if (!approuve) {
          actions.push({ outil: nom, resume: 'Action refusée par l’utilisateur.', statut: 'refusee' })
          messages.push({ role: 'tool', content: JSON.stringify({ refuse: true, note: 'L’utilisateur a refusé cette action.' }), tool_name: nom })
          continue
        }
      }
      try {
        // Cache des lectures : même question → réponse servie sans réexécuter.
        const enCache = lireCacheOutil(nom, args, outil.ecriture)
        if (enCache !== null) {
          params.onTrace?.(`⚡ ${nom} (cache)`)
          actions.push({ outil: nom, resume: enCache.slice(0, 200), statut: 'executee' })
          messages.push({ role: 'tool', content: enCache, tool_name: nom })
          continue
        }
        // Timeout d'exécution par outil (90 s) : un outil qui pend (réseau,
        // calcul) ne doit jamais figer la boucle — il échoue et on continue.
        const resultat = await Promise.race([
          outil.executer(args, params.contexte || {}),
          new Promise<never>((_, rejeter) => setTimeout(
            () => rejeter(new Error(`Délai d'exécution dépassé (90 s) pour « ${nom} »`)),
            90000,
          )),
        ])
        ecrireCacheOutil(nom, args, outil.ecriture, resultat)
        actions.push({ outil: nom, resume: resultat.slice(0, 200), statut: 'executee' })
        messages.push({ role: 'tool', content: resultat, tool_name: nom })
      } catch (err) {
        const message = (err as Error)?.message || 'échec'
        actions.push({ outil: nom, resume: message, statut: 'erreur' })
        messages.push({ role: 'tool', content: JSON.stringify({ erreur: message }), tool_name: nom })
      }
    }
  }
  return {
    reponse: 'Le pilote a enchaîné trop d’actions sans conclure — reformulez en étapes plus petites.',
    actions, modeleAbsent: false,
  }
}
