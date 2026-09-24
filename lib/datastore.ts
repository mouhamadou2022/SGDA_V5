// lib/datastore.ts — SGDA V5 : HUB (point d entree unique).
// Source unique de verite pour tous les acces Supabase.
// R3 : 0 fetch() dans les composants — tout passe ici.
// R4 : implementations reparties en lib/datastore/<domaine>.ts,
// re-exportees ici — les importateurs (`@/lib/datastore`) sont inchanges.
// Socle partage (types + helpers purs) : lib/datastore/_shared.ts.

import { supabase } from './supabase';
import type {
  Aerodrome,
  Surveillance,
  Ecart,
  Dossier,
  Utilisateur,
  Planning,
  Certification,
  Homologation,
  ProfilRisque,
  Notification,
  ChecklistItem,
  CodeAcces,
  Exemption,
  Inspecteur,
  Formation,
  Competence,
  KitDocument,
  Message,
  ApiKey,
  RegistreEntry,
  Delegation,
  Enquete,
  ReponseEnquete,
  ChecklistMemoryRecord,
} from './store'
import type { AmdecAnalyse } from './risque/amdecEngine'
import type { ArbreFTA } from './risque/ftaEngine'
import {
  DatastoreResult,
  groupEquipeIds,
  normalizeInspecteurCompetences,
  sanitizeEcart,
  unmarshalMessage,
  unmarshalDelegation,
  unmarshalReponseEnquete,
} from './datastore/_shared';

export interface InitialData {
  aerodromes: Aerodrome[]
  surveillances: Surveillance[]
  ecarts: Ecart[]
  dossiers: Dossier[]
  utilisateurs: Utilisateur[]
  plannings: Planning[]
  certifications: Certification[]
  homologations: Homologation[]
  profilsRisque: ProfilRisque[]
  notifications: Notification[]
  checklistItems: ChecklistItem[]
  codesAcces: CodeAcces[]
  formations: Formation[]
  inspecteurs: Inspecteur[]
  competences: Competence[]
  kitDocuments: KitDocument[]
  messages: Message[]
  apiKeys: ApiKey[]
  registreEntries: RegistreEntry[]
  amdecAnalyses: AmdecAnalyse[]
  ftaAnalyses: ArbreFTA[]
  exemptions: Exemption[]
  delegations: Delegation[]
  enquetes: Enquete[]
  reponsesEnquetes: ReponseEnquete[]
  checklistMemory: ChecklistMemoryRecord[]
}

export async function loadInitialData(userId: string, role: string): Promise<DatastoreResult<InitialData>> {
  try {
    const [
      aerodromesRes,
      surveillancesRes,
      ecartsRes,
      dossiersRes,
      utilisateursRes,
      planningsRes,
      certificationsRes,
      homologationsRes,
      profilsRes,
      notificationsRes,
      codesAccesRes,
      formationsRes,
      inspecteursRes,
      competencesRes,
      kitDocumentsRes,
      messagesRes,
      apiKeysRes,
      planningEquipeRes,
      registreEntriesRes,
      amdecRes,
      ftaRes,
      exemptionsRes,
      delegationsRes,
      enquetesRes,
      reponsesEnquetesRes,
      checklistMemoryRes,
    ] = await Promise.all([
      supabase.from('aerodromes').select('*').order('nom'),
      supabase.from('surveillances').select('*').order('date_debut', { ascending: false }),
      supabase.from('ecarts').select('*').order('created_at', { ascending: false }),
      supabase.from('dossiers').select('*').order('created_at', { ascending: false }),
      supabase.from('utilisateurs').select('*').order('nom'),
      supabase.from('plannings').select('*').order('date_debut', { ascending: false }),
      supabase.from('certifications').select('*'),
      supabase.from('homologations').select('*'),
      supabase.from('profils_risque').select('*'),
      supabase.from('notifications').select('*').eq('user_id', userId).order('sent_at', { ascending: false }).limit(50),
      supabase.from('codes_acces').select('*'),
      supabase.from('formations').select('*').order('date', { ascending: false }),
      supabase.from('inspecteurs').select('*').is('deleted_at', null).order('nom'),
      supabase.from('competences').select('*'),
      supabase.from('kit_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('messages').select('*').or(`from_id.eq.${userId},to_id.eq.${userId}`).order('created_at', { ascending: false }).limit(200),
      supabase.from('api_keys').select('*').order('service').order('fallback_order'),
      supabase.from('planning_equipe').select('*'),
      supabase.from('registre_entries').select('*').order('date_entree', { ascending: false }),
      supabase.from('amdec_analyses').select('*').order('updated_at', { ascending: false }),
      supabase.from('fta_analyses').select('*').order('updated_at', { ascending: false }),
      supabase.from('exemptions').select('*').order('updated_at', { ascending: false }),
      supabase.from('delegations').select('*').order('assigne_le', { ascending: false }),
      supabase.from('enquetes').select('*').order('updated_at', { ascending: false }),
      supabase.from('reponses_enquetes').select('*').order('submitted_at', { ascending: false }),
      supabase.from('checklist_memory').select('*').order('updated_at', { ascending: false }).limit(5000),
    ])

    const planningsData = (planningsRes.data ?? []) as Planning[]
    const equipeRows = (planningEquipeRes?.data ?? []) as { planning_id: string; utilisateur_id: string }[]
    const planningsAvecEquipe = groupEquipeIds(planningsData, equipeRows)

    const errors = [
      aerodromesRes.error,
      surveillancesRes.error,
      ecartsRes.error,
      dossiersRes.error,
      utilisateursRes.error,
      planningsRes.error,
      certificationsRes.error,
      homologationsRes.error,
      profilsRes.error,
      notificationsRes.error,
      codesAccesRes?.error,
      formationsRes.error,
      inspecteursRes.error,
      competencesRes.error,
      kitDocumentsRes.error,
      messagesRes?.error,
      apiKeysRes?.error,
      registreEntriesRes?.error,
    ].filter(Boolean)

    if (errors.length > 0) {
      console.error('[datastore] Erreurs chargement initial:', errors)
    }

    // Créer une fonction interne pour calculer les profils manquants
    const aerodromes = (aerodromesRes.data ?? []) as Aerodrome[];
    const profilsExistants = (profilsRes.data ?? []) as ProfilRisque[];
    const profilsMap = new Map(profilsExistants.map(p => [p.aerodrome_id, p]));
    const nouveauxProfils: ProfilRisque[] = [];

    // Importer une seule fois hors de la boucle
    const { calculerProfilInitial } = await import('@/lib/risque/initialProfile');
    const upsertPromises = aerodromes
      .filter(a => !profilsMap.has(a.id))
      .map(async (aero) => {
        try {
          const result = calculerProfilInitial(aero as Aerodrome);
          await supabase.from('profils_risque').upsert(result.profil);
          console.log(`[Datastore] Profil calculé pour ${aero.code_oaci}`);
          return result.profil;
        } catch (err) {
          console.error(`[Datastore] Erreur calcul profil pour ${aero.code_oaci}:`, err);
          return null;
        }
      });
    const resolved = await Promise.all(upsertPromises);
    nouveauxProfils.push(...resolved.filter(Boolean) as ProfilRisque[]);

    return {
      data: {
        aerodromes: aerodromes,
        surveillances: (surveillancesRes.data ?? []) as Surveillance[],
        ecarts: ((ecartsRes.data ?? []) as Ecart[]).map(sanitizeEcart),
        dossiers: (dossiersRes.data ?? []) as Dossier[],
        utilisateurs: (utilisateursRes.data ?? []) as Utilisateur[],
        plannings: planningsAvecEquipe,
        certifications: (certificationsRes.data ?? []) as Certification[],
        homologations: (homologationsRes.data ?? []) as Homologation[],
        profilsRisque: [...profilsExistants, ...nouveauxProfils],
        notifications: (notificationsRes.data ?? []) as Notification[],
        checklistItems: [],
        codesAcces: (codesAccesRes.data ?? []) as CodeAcces[],
        formations: (formationsRes.data ?? []) as Formation[],
        inspecteurs: ((inspecteursRes.data ?? []) as any[]).map(ins => {
          const normalise = normalizeInspecteurCompetences(ins)
          // Si l'inspecteur n'a pas de compétences dans le JSONB (Path B),
          // les récupérer depuis la table competences séparée
          if ((!normalise.competences || normalise.competences.length === 0) && competencesRes.data) {
            const comps = (competencesRes.data as any[]).filter(c => c.inspecteur_id === ins.id)
            if (comps.length > 0) normalise.competences = comps
          }
          return normalise
        }),
        competences: [], // fusionné dans inspecteurs, plus besoin séparément
        kitDocuments: (kitDocumentsRes.data ?? []) as KitDocument[],
        messages: (messagesRes?.data ?? []).map(unmarshalMessage) as Message[],
        apiKeys: (apiKeysRes?.data ?? []) as ApiKey[],
        registreEntries: (registreEntriesRes?.data ?? []) as RegistreEntry[],
        amdecAnalyses: (amdecRes?.data ?? []) as AmdecAnalyse[],
        ftaAnalyses: (ftaRes?.data ?? []) as ArbreFTA[],
        exemptions: (exemptionsRes?.data ?? []) as Exemption[],
        delegations: ((delegationsRes?.data ?? []) as any[]).map(unmarshalDelegation),
        enquetes: (enquetesRes?.data ?? []) as Enquete[],
        reponsesEnquetes: ((reponsesEnquetesRes?.data ?? []) as any[]).map(unmarshalReponseEnquete),
        checklistMemory: (checklistMemoryRes?.data ?? []) as ChecklistMemoryRecord[],
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}


// ─────────────────────────────────────────────────────────────
// RE-EXPORTS DES DOMAINES (surface publique inchangee)
// ─────────────────────────────────────────────────────────────
export * from './datastore/messages';
export * from './datastore/exemptions';
export * from './datastore/delegations';
export * from './datastore/enquetes';
export * from './datastore/aerodromes';
export * from './datastore/surveillances';
export * from './datastore/ecarts';
export * from './datastore/checklist';
export * from './datastore/plannings';
export * from './datastore/utilisateurs';
export * from './datastore/kitDocuments';
export * from './datastore/notifications';
export * from './datastore/iaFeedbacks';
export * from './datastore/iaModeles';
export * from './datastore/profilsRisque';
export * from './datastore/certifications';
export * from './datastore/homologations';
export * from './datastore/fichiers';
export * from './datastore/registre';
export * from './datastore/amdecFta';
export * from './datastore/realtime';
export * from './datastore/inspecteurs';
export * from './datastore/formations';
export * from './datastore/evenements';
export * from './datastore/competences';
export * from './datastore/codesAcces';
export * from './datastore/apiKeys';
export * from './datastore/dossiers';
export * from './datastore/checklistTemplates';
export * from './datastore/checklistMemory';
export type { DatastoreResult } from './datastore/_shared';
export { sanitizeEcart } from './datastore/_shared';
