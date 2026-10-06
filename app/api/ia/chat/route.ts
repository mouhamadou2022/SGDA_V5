// app/api/ia/chat/route.ts
// Route API serveur pour l'assistant IA SGDA
// Multi-provider : AERORISQ (IA maison/Ollama) → Groq → OpenRouter → …
// Injecte la mémoire apprise d'AERORISQ (exemples validés 👍) en few-shot.
// Les données sensibles restent côté client — seul le contexte résumé est envoyé

import { NextResponse } from 'next/server'
import { CHAT_SYSTEM_PROMPT } from '@/lib/ia/prompts'
import { callWithFallback, isLLMConfigured } from '@/lib/ia/providers'
import { getFewShotContext } from '@/lib/ia/aerorisqRag'
import { textePdf } from '@/lib/pdfText'
import { retirerDiacritiques } from '@/lib/domaines'

// Budget local 240 s : même plafond que /api/ia/analyze (sinon la plateforme
// coupe avant la fin d'une inférence locale longue).
export const maxDuration = 300

/** Normalisation insensible accents/casse pour la détection d'intention. */
function normaliserTexte(texte: string): string {
  return retirerDiacritiques((texte || '').toLowerCase())
}

export interface ChatAPIRequest {
  message: string
  contexte?: {
    aerodrome?: {
      code_oaci: string
      nom: string
      categorie: string
      type: string
    }
    profil_risque?: {
      score_global: number
      niveau: string
      tendance: string
      c1: number; c2: number; c3: number; c4: number; c5: number
      alerte?: string
      statut_sgs?: string
    }
    ecarts_actifs?: Array<{
      reference: string
      site?: string
      libelle: string
      niveau_risque: string
      statut: string
      jours_restants?: number
    }>
    total_ecarts_ouverts?: number
    surveillance_en_cours?: {
      type: string
      date: string
      statut: string
      taux_conformite?: number
    }
    site_focus?: {
      code_oaci: string
      nom: string
      type?: string
      region?: string
      sgs?: string
      score?: number | null
      niveau?: string | null
      certification?: string
      nb_ecarts_ouverts: number
      critiques: Array<{ reference: string; libelle?: string; statut: string; ref_reglementaire?: string | null; delai_regularisation?: string | null }>
      dernieres_surveillances: Array<{ type: string; date: string; statut: string; score?: number | null }>
    }
    ecart_detail?: {
      reference: string
      site?: string
      libelle?: string
      domaine?: string
      ref_reglementaire?: string
      niveau_risque?: string
      statut?: string
      delai_pac?: string
      delai_regularisation?: string
      surveillance_liee?: { type: string; date: string; statut: string }
      pac?: { nb_actions: number; actions: Array<{ description?: string; responsable?: string; date_prevue?: string }>; soumis_le?: string; version?: number }
      evaluation_pac?: { note_globale?: number; decision?: string; commentaire?: string }
      preuves?: { nb_fichiers: number; validation?: string }
    }
    pacs_en_jeu?: Array<{ reference: string; statut: string; nb_actions: number; note_globale?: number; decision?: string }>
    surveillances_recentes?: Array<{ type: string; date: string; statut: string; score?: number | null; nb_ecarts: number; rapport_disponible: boolean }>
    plannings?: Array<{ type: string; date_debut: string; date_fin: string; statut: string; proposition: boolean }>
    blocs_modules?: string[]
    historique?: Array<{ role: 'user' | 'assistant'; content: string }>
    module?: string
  }
}

function buildContextMessage(contexte: ChatAPIRequest['contexte']): string {
  if (!contexte) return ''

  const parts: string[] = []

  if (contexte.aerodrome) {
    const a = contexte.aerodrome
    parts.push(`AÉRODROME ACTUEL : ${a.code_oaci} — ${a.nom} (${a.categorie}, ${a.type})`)
  }

  if (contexte.site_focus) {
    const f = contexte.site_focus
    const lignes = [
      `SITE DEMANDÉ : ${f.code_oaci} — ${f.nom} (${f.type || '—'}, ${f.region || '—'}) — SGS ${f.sgs || 'complet'}`,
      `Risque : ${f.score != null ? `${f.score}/100 (${f.niveau || ''})` : 'non calculé'} — Certification : ${f.certification || '—'} — Écarts ouverts : ${f.nb_ecarts_ouverts}`,
    ]
    if (f.critiques.length > 0) {
      lignes.push(`Écarts critiques :`)
      for (const c of f.critiques) lignes.push(`  - ${c.reference} : ${(c.libelle || '').substring(0, 120)} (${c.statut})${c.ref_reglementaire ? ` — réf. ${c.ref_reglementaire}` : ''}${c.delai_regularisation ? ` — régularisation ${c.delai_regularisation}` : ''}`)
    }
    if (f.dernieres_surveillances.length > 0) {
      lignes.push(`Dernières surveillances :`)
      for (const s of f.dernieres_surveillances) lignes.push(`  - ${(s.type || '').replace(/_/g, ' ')} du ${s.date} — ${s.statut}${s.score != null ? ` — score ${s.score}/100` : ''}`)
    }
    parts.push(lignes.join('\n'))
  }

  if (contexte.profil_risque) {
    const p = contexte.profil_risque
    const sgsNonApplicable = p.statut_sgs === 'non_applicable'
    parts.push(
      `PROFIL DE RISQUE :
  - Score global : ${p.score_global}/100 — Niveau : ${p.niveau.toUpperCase()}
  ${sgsNonApplicable ? '- SGS : non applicable (exclu du score global)' : `- C1 (Maturité SGS) : ${p.c1}/100`}
  - C2 (Efficacité PAC) : ${p.c2}/100
  - C3 (Conformité) : ${p.c3}/100
  - C4 (Charge critique) : ${p.c4}/100
  - C5 (Résilience) : ${p.c5}/100
  ${p.alerte ? `- Alerte active : ${p.alerte}` : ''}`
    )
  }

  if (contexte.ecarts_actifs && contexte.ecarts_actifs.length > 0) {
    const critiques = contexte.ecarts_actifs.filter(e => e.niveau_risque === 'critique')
    const enRetard = contexte.ecarts_actifs.filter(e => e.statut === 'en_retard')
    const totalOuverts = contexte.total_ecarts_ouverts ?? contexte.ecarts_actifs.length
    parts.push(
      `ÉCARTS OUVERTS : ${totalOuverts} au total (${contexte.ecarts_actifs.length} détaillés ci-dessous — ne jamais présenter ce sous-ensemble comme le total)
  - Critiques : ${critiques.length}${critiques.length > 0 ? ' → ' + critiques.slice(0, 3).map(e => (e.site ? `[${e.site}] ` : '') + e.reference + ': ' + e.libelle.substring(0, 80)).join('; ') : ''}
  - En retard : ${enRetard.length}`
    )
  }

  if (contexte.surveillance_en_cours) {
    const s = contexte.surveillance_en_cours
    parts.push(
      `SURVEILLANCE EN COURS : ${s.type} du ${s.date} — ${s.statut}${s.taux_conformite != null ? ` — Conformité : ${s.taux_conformite}%` : ''}`
    )
  }

  if (contexte.ecart_detail) {
    const e = contexte.ecart_detail
    const lignes = [
      `ÉCART VISÉ : ${e.reference}${e.site ? ` (${e.site})` : ''} — ${e.domaine || ''} — ${e.niveau_risque || ''} — statut ${e.statut || ''}`,
      `Libellé : ${e.libelle || '—'}`,
      `Référence réglementaire : ${e.ref_reglementaire || '—'}`,
      `Délais : PAC ${e.delai_pac || '—'} · régularisation ${e.delai_regularisation || '—'}`,
    ]
    if (e.surveillance_liee) lignes.push(`Surveillance liée : ${e.surveillance_liee.type} du ${e.surveillance_liee.date} (${e.surveillance_liee.statut})`)
    if (e.pac) {
      lignes.push(`PAC v${e.pac.version || 1} soumis le ${e.pac.soumis_le || '—'} — ${e.pac.nb_actions} action(s) :`)
      for (const a of (e.pac.actions || []).slice(0, 5)) lignes.push(`  - ${a.description || '—'} (resp. ${a.responsable || '—'}, prévue ${a.date_prevue || '—'})`)
    } else lignes.push('PAC : aucun soumis.')
    if (e.evaluation_pac) lignes.push(`Évaluation PAC : ${e.evaluation_pac.note_globale ?? '—'}/100 — décision ${e.evaluation_pac.decision || '—'}${e.evaluation_pac.commentaire ? ` — « ${e.evaluation_pac.commentaire} »` : ''}`)
    if (e.preuves) lignes.push(`Preuves : ${e.preuves.nb_fichiers} fichier(s) — validation ${e.preuves.validation || 'en attente'}`)
    parts.push(lignes.join('\n'))
  }

  if (contexte.pacs_en_jeu && contexte.pacs_en_jeu.length > 0) {
    parts.push(
      `PACS EN JEU :\n` + contexte.pacs_en_jeu.map((p) =>
        `- ${p.reference} (${p.statut}) — ${p.nb_actions} action(s)${p.note_globale != null ? ` — note ${p.note_globale}/100` : ''}${p.decision ? ` — ${p.decision}` : ''}`
      ).join('\n')
    )
  }

  if (contexte.surveillances_recentes && contexte.surveillances_recentes.length > 0) {
    parts.push(
      `DERNIÈRES SURVEILLANCES :\n` + contexte.surveillances_recentes.map((s) =>
        `- ${(s.type || '').replace(/_/g, ' ')} du ${s.date} — ${s.statut}${s.score != null ? ` — score ${s.score}/100` : ''} — ${s.nb_ecarts} écart(s)${s.rapport_disponible ? ' — rapport disponible' : ''}`
      ).join('\n')
    )
  }

  if (contexte.plannings && contexte.plannings.length > 0) {
    parts.push(
      `PLANNINGS :\n` + contexte.plannings.map((p) =>
        `- ${p.type} du ${p.date_debut} au ${p.date_fin} — ${p.statut}${p.proposition ? ' (PROPOSITION à valider)' : ''}`
      ).join('\n')
    )
  }

  // Blocs par module pré-rendus côté client (données SGDA réelles, compactes).
  if (contexte.blocs_modules && contexte.blocs_modules.length > 0) {
    for (const bloc of contexte.blocs_modules.slice(0, 6)) {
      if (typeof bloc === 'string' && bloc.trim()) parts.push(bloc.slice(0, 1500))
    }
  }

  if (contexte.module) {
    parts.push(`MODULE ACTIF : ${contexte.module}`)
    // Injecter les référentiels métier propres à chaque module
    if (contexte.module === 'plans-actions') {
      parts.push(
        `RÉFÉRENTIEL PAC — Critères d'évaluation des Plans d'Actions Correctives :
- Pertinence : les actions répondent-elles exactement à l'écart constaté ?
- Exhaustivité : toutes les composantes de l'écart sont-elles traitées ?
- Précision : les actions sont-elles suffisamment détaillées ?
- Spécificité : les formulations sont-elles concrètes (pas vagues) ?
- Réalisme : les délais et ressources sont-ils réalistes ?
- Cohérence : le plan est-il logiquement structuré ?
Seuils décision : ≥70 = accepté, <70 = refusé (améliorations requises)
Réponds en français avec un feedback constructif et précis.`
      )
    } else if (contexte.module === 'planning') {
      parts.push(
        `RÉFÉRENTIEL PLANNING :
La fréquence de surveillance est déterminée par le niveau de risque :
- CRITIQUE (0-29) : surveillance mensuelle obligatoire
- ÉLEVÉ (30-49) : surveillance trimestrielle renforcée
- MOYEN (50-69) : surveillance semestrielle standard
- FAIBLE (70-100) : surveillance annuelle
Les missions peuvent être programmées, inopinées, spéciales, ou de maintien.
Une équipe d'inspection comprend un chef de mission et des inspecteurs.
Conseille sur la planification en fonction des profils de risque et des disponibilités.`
      )
    } else if (contexte.module === 'ecarts-redaction') {
      parts.push(
        `RÉFÉRENTIEL RÉDACTION D'ÉCARTS :
Les libellés d'écarts doivent :
- Citer précisément la référence réglementaire violée (RAS 14, Annexe 14, Doc OACI, procédure ANACIM)
- Décrire l'écart constaté de façon factuelle et objective
- Être rédigés au présent de l'indicatif
- Être compréhensibles par l'exploitant de l'aérodrome
- Suivre le format : "Non-conformité constatée en regard de [référence] : [description factuelle]"
N'utilise pas de matrice de risque OACI (probabilité × gravité) pour les écarts SGS — utilise le modèle PAOE.`
      )
    } else if (contexte.module === 'certification') {
      parts.push(
        `RÉFÉRENTIEL CERTIFICATION :
Le processus de certification comprend 5 phases :
1. Expression d'Intérêt (15 jours)
2. Demande Formelle (30 jours)
3. Vérification sur Site (45 jours)
4. Délivrance du Certificat (20 jours)
5. Publication du Statut (10 jours)
Conseille sur les blocages, les lettres officielles et les étapes à suivre.`
      )
    } else if (contexte.module === 'risk' || contexte.module === 'profil-risque') {
      parts.push(
        `RÉFÉRENTIEL PROFIL DE RISQUE :
Le profil de risque est calculé sur 5 critères (C1-C5) :
- C1 : Maturité du Système de Gestion de la Sécurité (SGS)
- C2 : Efficacité du traitement des Plans d'Actions Correctives (PAC)
- C3 : Conformité technique et opérationnelle (résultats des checklists)
- C4 : Charge critique (nombre et gravité des écarts actifs)
- C5 : Résilience opérationnelle (capacité de réponse SLI, formation)
Seuils : 0-29 CRITIQUE, 30-49 ÉLEVÉ, 50-69 MOYEN, 70-100 FAIBLE
Cite les références réglementaires exactes (Annexe 14, Doc 9859 SGS, RAS 14).`
      )
    } else if (contexte.module === 'sgs') {
      parts.push(
        `RÉFÉRENTIEL SGS — Évaluation PAOE :
Le modèle PAOE mesure la maturité SGS sur 4 niveaux :
- Absent (—) : l'élément SGS n'existe pas ou n'est pas documenté
- Présent (P) : l'élément existe mais n'est pas adapté au contexte opérationnel
- Approprié (A) : l'élément est en place et adapté, mais pas encore pleinement opérationnel
- Opérationnel (O) : l'élément fonctionne efficacement au quotidien
- Efficace (E) : l'élément démontre une amélioration continue mesurable
N'utilise jamais de matrice de risque OACI (probabilité × gravité) pour le SGS.`
      )
    } else if (contexte.module === 'registres') {
      parts.push(
        `RÉFÉRENTIEL REGISTRE :
Tu maîtrises RAS 14 (aérodromes), Annexe 14 OACI, Doc 9859 SGS, Doc 9157 AGA,
les circulaires et bulletins ANACIM, l'historique réglementaire du secteur.
Analyse l'impact des documents réglementaires et réponds aux questions.`
      )
    }
  }

  return parts.length > 0 ? `[CONTEXTE SGDA]\n${parts.join('\n')}\n[FIN CONTEXTE]\n\n` : ''
}

function detectPdfRequest(message: string): { type?: string } | null {
  const lower = message.toLowerCase()
  const keywordsPdf = ['pdf', 'rapport', 'génère', 'télécharge', 'exporter', 'document']
  const hasPdfKeyword = keywordsPdf.some(k => lower.includes(k))

  if (!hasPdfKeyword) return null

  if (lower.includes('surveillance') || lower.includes('inspection')) return { type: 'surveillance' }
  if (lower.includes('certification') || lower.includes('certificat')) return { type: 'certification' }
  if (lower.includes('checklist')) return { type: 'checklist' }
  if (lower.includes('registre')) return { type: 'registre' }

  return null
}

// ✅ NOUVEAU : Génère un PDF de base quand l'utilisateur demande un rapport dans le chat
// Pour l'instant, on génère une structure PDF valide avec les métadonnées
// Dans une version future, cette fonction appellera les services complets de génération de PDF
async function generatePdfReport(request: { type?: string }, contexte?: any, messageBrut?: string): Promise<{
  filename?: string
  blobBase64?: string
  message: string
}> {
  return await genererVraiPdfDepuisBase(request, contexte, messageBrut)
}

async function genererVraiPdfDepuisBase(request: { type?: string }, contexte?: any, messageBrut?: string): Promise<{
  filename?: string
  blobBase64?: string
  message: string
}> {
  // VRAI rapport depuis Supabase (service_role) — jamais de contenu factice.
  const type = request.type || 'surveillance'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return { message: "Génération PDF indisponible (base non configurée côté serveur). Utilisez le Mode action de l'assistant pour générer le rapport depuis vos données locales." }
  }

  // Site : contexte prioritaire, sinon code OACI détecté dans le message (ex. GOOY).
  const codeContexte = ((contexte as any)?.aerodrome?.code_oaci || '').toUpperCase()
  const m = (/[A-Z]{4}/.exec((messageBrut || '').toUpperCase()) || [])[0] || ''
  const codeSite = codeContexte || m
  const estNational = type === 'certification' || type === 'registre'

  if (!estNational && !codeSite) {
    return { message: 'Pour générer ce rapport PDF, précisez le site (ex. « rapport de surveillance pour GOOY »). Ou basculez en Mode action : le pilote téléchargera le vrai document institutionnel.' }
  }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const dateJour = new Date().toISOString().split('T')[0]
    const dateFR = new Date().toLocaleDateString('fr-FR')
    let y = 15
    const ligne = (texte: string, taille = 10, gras = false) => {
      doc.setFontSize(taille)
      doc.setFont('times', gras ? 'bold' : 'normal')
      const lignes = doc.splitTextToSize(textePdf(texte), 180) as string[]
      for (const l of lignes) {
        if (y > 280) { doc.addPage(); y = 15 }
        doc.text(l, 15, y)
        y += taille * 0.45
      }
      y += 1.5
    }
    const intertitre = (texte: string) => {
      if (y > 260) { doc.addPage(); y = 15 }
      doc.setFontSize(13)
      doc.setFont('times', 'bold')
      doc.text(texte, 15, y)
      y += 8
    }

    if (estNational) {
      const [aerosRes, certsRes] = await Promise.all([
        admin.from('aerodromes').select('*').is('deleted_at', null),
        admin.from('certifications').select('aerodrome_id,statut_global,date_expiration,phase_active'),
      ])
      const aeros = (((aerosRes.data || []) as any[])).filter(a => ((a.type || '') as string).toLowerCase() === 'international')
      const certs = ((certsRes.data || []) as any[])
      const parStatut: Record<string, number> = {}
      for (const c of certs) parStatut[c.statut_global || '?'] = (parStatut[c.statut_global || '?'] || 0) + 1
      ligne('ANACIM SENEGAL — RAPPORT NATIONAL DE CERTIFICATION', 15, true)
      ligne(`Date : ${dateFR} — ${aeros.length} aérodrome(s) international(aux), ${certs.length} dossier(s).`, 10)
      intertitre('Synthèse')
      ligne(`Certifiés : ${parStatut['certifie'] || 0} — En cours : ${parStatut['en_cours'] || 0} — Suspendus : ${parStatut['suspendu'] || 0} — Expirés : ${parStatut['expire'] || 0}.`, 10)
      intertitre('Situation par aérodrome')
      for (const a of aeros) {
        const c = certs.find(x => x.aerodrome_id === a.id)
        ligne(`${a.code_oaci || '?'} — ${a.nom || ''} : ${c?.statut_global || 'non certifié'}${c?.date_expiration ? ` (expiration ${String(c.date_expiration).split('T')[0]})` : ''}${c?.phase_active ? ` — phase ${c.phase_active}/5` : ''}`, 10)
      }
      const sortieNational = doc.output('arraybuffer') as ArrayBuffer
      return {
        filename: `Rapport_Certifications_${dateJour}.pdf`,
        blobBase64: Buffer.from(sortieNational).toString('base64'),
        message: `Vrai rapport national de certification généré depuis la base (${aeros.length} sites, ${certs.length} dossiers) — ${dateFR}.`,
      }
    }

    const aeroRes = await admin.from('aerodromes').select('*').ilike('code_oaci', codeSite).is('deleted_at', null).limit(1).single()
    if (aeroRes.error || !aeroRes.data) {
      return { message: `Site « ${codeSite} » introuvable dans la base — vérifiez le code OACI.` }
    }
    const aero = aeroRes.data as any
    const [ecartsRes, survsRes, evtsRes, certRes] = await Promise.all([
      admin.from('ecarts').select('reference,libelle,niveau_risque,statut,created_at').eq('aerodrome_id', aero.id).neq('statut', 'cloture').order('created_at', { ascending: false }).limit(30),
      admin.from('surveillances').select('type,statut,date_debut,score_global').eq('aerodrome_id', aero.id).order('date_debut', { ascending: false }).limit(10),
      admin.from('evenements_securite').select('type,gravite,date,statut').eq('aerodrome_id', aero.id).order('date', { ascending: false }).limit(10),
      admin.from('certifications').select('statut_global,date_expiration,phase_active').eq('aerodrome_id', aero.id).limit(1),
    ])
    const ecarts = ((ecartsRes.data || []) as any[])
    const survs = ((survsRes.data || []) as any[])
    const evts = ((evtsRes.data || []) as any[])
    const cert = ((certRes.data || []) as any[])[0]
    const critiques = ecarts.filter(e => ((e.niveau_risque || '') as string).toLowerCase() === 'critique').length

    ligne('ANACIM SENEGAL — FICHE DE SITUATION', 15, true)
    ligne(`${aero.code_oaci} — ${aero.nom || ''} (${aero.type || '—'}, ${aero.region || '—'}) — ${dateFR}`, 11, true)
    intertitre('Certification')
    ligne(cert ? `Statut : ${cert.statut_global}${cert.date_expiration ? ` — expiration ${String(cert.date_expiration).split('T')[0]}` : ''}${cert.phase_active ? ` — phase ${cert.phase_active}/5` : ''}.` : 'Aucun dossier de certification.', 10)
    intertitre(`Écarts ouverts (${ecarts.length}, dont ${critiques} critique(s))`)
    if (ecarts.length === 0) ligne('Aucun écart ouvert.', 10)
    for (const e of ecarts.slice(0, 25)) {
      ligne(`- [${e.niveau_risque || '?'}] ${e.reference || ''} — ${((e.libelle || '') as string).substring(0, 120)} (${e.statut || ''})`, 9)
    }
    intertitre(`Dernières surveillances (${survs.length})`)
    if (survs.length === 0) ligne('Aucune surveillance enregistrée.', 10)
    for (const s of survs) {
      ligne(`- ${((s.type || '') as string).replace(/_/g, ' ')} du ${String(s.date_debut || '').split('T')[0]} — ${s.statut || ''}${s.score_global != null ? ` — score ${s.score_global}/100` : ''}`, 9)
    }
    intertitre(`Événements récents (${evts.length})`)
    if (evts.length === 0) ligne('Aucun événement récent.', 10)
    for (const v of evts) {
      ligne(`- ${((v.type || '') as string).replace(/_/g, ' ')} — ${v.gravite || ''} — ${String(v.date || '').split('T')[0]} (${v.statut || ''})`, 9)
    }
    ligne(`Document généré automatiquement par AERORISQ depuis la base SGDA le ${dateFR}.`, 8)
    const sortie = doc.output('arraybuffer') as ArrayBuffer
    return {
      filename: `Fiche_${codeSite}_${dateJour}.pdf`,
      blobBase64: Buffer.from(sortie).toString('base64'),
      message: `Vraie fiche de situation ${codeSite} générée depuis la base (${ecarts.length} écart(s) ouvert(s), ${survs.length} surveillance(s)) — ${dateFR}.`,
    }
  } catch (err) {
    return { message: `Génération PDF impossible côté serveur (${(err as Error)?.message || 'erreur'}). Utilisez le Mode action pour le vrai document.` }
  }
  /* BLOC FACTICE HISTORIQUE — DÉSACTIVÉ (ancien faux PDF, conservé pour traçabilité, ne pas réactiver) :
  // FIN génération réelle — ancien contenu factice supprimé (ne jamais régénérer de faux PDF)\n%SGDA Rapport Auto-généré\n%\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 72 720 Td SGDA Rapport Auto-généré ET Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000107 00000 n \n0000000200 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n250\n%%EOF'

  const base64 = btoa(dummyContent)
  const type = request.type || 'surveillance'
  const filename = `Rapport_${type}_${new Date().toISOString().split('T')[0]}.pdf`

  const typeMessages: Record<string, string> = {
    certification: '🎓 Type: Rapport de certification national',
    checklist: '✅ Type: Export checklist',
    surveillance: '📋 Type: Rapport de surveillance'
  }

  const typeMessage = (request.type && typeMessages[request.type]) || typeMessages.surveillance

  const messages = [
    `✅ PDF rapport ${type} en cours de génération`,
    `📄 Format: PDF institutionnel ANACIM`,
    `📅 Date: ${new Date().toLocaleDateString('fr-FR')}`,
    typeMessage
  ]

  FIN-BLOC-FACTICE */
}

export async function POST(request: Request) {
  try {
    const body: ChatAPIRequest = await request.json()

    if (!isLLMConfigured()) {
      return NextResponse.json(
        { error: 'Aucune clé API configurée', code: 'NO_API_KEY' },
        { status: 503 }
      )
    }

    // ✅ NOUVEAU : Détection automatique de demande de rapport PDF dans le message
    const pdfRequest = detectPdfRequest(body.message)

    if (pdfRequest) {
      // Rapport PDF réel depuis la base — jamais de contenu factice.
      const pdfResult = await generatePdfReport(pdfRequest, body.contexte, body.message)
      if (pdfResult.blobBase64 && pdfResult.filename) {
        return NextResponse.json({
          pdf: {
            filename: pdfResult.filename,
            base64: pdfResult.blobBase64,
          },
          message: pdfResult.message,
        })
      }
      return NextResponse.json({ message: pdfResult.message })
    }

    const contextMessage = buildContextMessage(body.contexte)
    const userMessage = contextMessage + body.message

    // Mémoire apprise d'AERORISQ : exemples validés 👍 pour ce module (best-effort, '' si aucun)
    const fewShot = await getFewShotContext(body.contexte?.module)

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT + (fewShot ? `\n\n${fewShot}` : '') },
    ]

    if (body.contexte?.historique && body.contexte.historique.length > 0) {
      const recentHistory = body.contexte.historique.slice(-6)
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    messages.push({ role: 'user', content: userMessage })

    // Synthèses et rapports : budget tokens large (une « synthèse complète »
    // coupée à 1024/2048 s'arrêtait en plein milieu — mesuré en prod).
    // Détection large (avec et sans accents) + 4096 tokens de sortie.
    const estRapportDetaille = /rapport|detaill|synthes|complet|resume|bilan|situation|etat (du|des|de)|fiche/i.test(
      normaliserTexte(body.message || ''),
    )
    const maxDemande = estRapportDetaille ? 4096 : 1024
    const result = await callWithFallback({
      messages,
      temperature: 0.4,
      max_tokens: maxDemande,
      top_p: 0.9,
    })

    // Suite automatique si coupé au plafond (compteurs du provider) : UNE
    // suite allégée (fin du texte + 4 derniers messages), jamais de boucle.
    // Sans elle, les très longues synthèses s'arrêtent en pleine phrase.
    let messageFinal = result.content
    const tokensGeneres = result.usage?.completion_tokens ?? 0
    if (tokensGeneres >= Math.floor(maxDemande * 0.9) && (result.content || '').trim()) {
      const suite = await callWithFallback({
        messages: [
          ...messages.slice(-4),
          { role: 'assistant', content: result.content.slice(-3000) },
          { role: 'user', content: 'Continuez EXACTEMENT où vous vous êtes arrêté, sans répéter ni résumer.' },
        ],
        temperature: 0.4,
        max_tokens: maxDemande,
        top_p: 0.9,
      }).catch(() => null)
      if (suite?.content?.trim()) messageFinal = `${result.content}\n${suite.content.trim()}`
    }

    return NextResponse.json({
      message: messageFinal,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
    })
  } catch (error) {
    console.error('[IA Chat API]', error)
    return NextResponse.json(
      { error: (error as Error).message, code: 'ALL_PROVIDERS_FAILED' },
      { status: 503 }
    )
  }
}
