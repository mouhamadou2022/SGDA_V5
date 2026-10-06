// components/modules/planning/useLancerSurveillance.ts
// Orchestration du lancement planning → surveillance, extraite de
// PlanningModule (comportement identique). La logique pure vit dans
// lib/planning-lancement.ts ; ici uniquement l'orchestration async
// (gardes, écritures store, notifications, navigation).

import { useRouter } from 'next/navigation';
import {
  useAppStore, type AppStore, type Planning, type Aerodrome, type Utilisateur,
  type Certification, type Homologation, type Notification,
} from '@/lib/store';
import { isSGSApplicable } from '@/lib/risque';
import { normalizePlanningType } from '@/lib/planning';
import { verifierCompositionEquipe, getDomaineLabel, justifierSurveillancePAC } from '@/lib/domaines';
import { kitDocAgent } from '@/lib/ia/agents/kitDocAgent';
import { startOfToday } from './planningDates';
import {
  calculerPorteeLancement,
  porteeCertification,
  buildNouvelleSurveillance,
  convertirDelegationsPlanning,
  resoudreTypeSurveillance,
  construireMessageExploitants,
  nomsEquipe,
  appliquerPredictionsPrefill,
  estChefDePlanning,
  filtresTemplatesParType,
  validerQualiteDelegations,
  equipeASignataire,
} from '@/lib/planning-lancement';
type Notifier = (n: Omit<Notification, 'id' | 'sent_at'>) => void;

export interface DepsLancement {
  user: AppStore['user'];
  aerodromesActifs: Aerodrome[];
  aerodromes: Aerodrome[];
  utilisateurs: Utilisateur[];
  inspecteurs: Array<{ id: string; user_id?: string }>;
  profilsRisque: AppStore['profilsRisque'];
  addNotification: Notifier;
  updatePlanning: (id: string, data: Partial<Planning>) => Promise<void>;
  enregistrerFeedbackPlanning: (planning: Planning, acceptee: boolean, raison?: string) => void;
}

export function useLancerSurveillance(deps: DepsLancement) {
  const router = useRouter();
  const { user, aerodromesActifs, aerodromes, utilisateurs, inspecteurs, profilsRisque, addNotification, updatePlanning, enregistrerFeedbackPlanning } = deps;

  const handleLancer = async (planning: Planning, dateDebutReelle?: string, dateFinReelle?: string) => {
    const store = useAppStore.getState()
    const { addSurveillance, setChecklistHierarchy, updateSurveillance } = store;
    if (planning.est_proposition) {
      addNotification({
        user_id: user?.id || '', type: 'danger',
        title: 'Validation requise',
        message: 'Ce planning doit d\'abord être validé via la validation N+1 avant d\'être exécuté.',
        canal: 'in_app',
      });
      return;
    }
    if ((planning as Planning & { isLancee?: boolean }).isLancee) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Déjà lancée',
        message: 'Cette surveillance a déjà été lancée',
        canal: 'in_app',
      });
      return;
    }

    // Chef d'équipe requis : sans chef désigné, on bloque avec un message
    // d'action (pas de chef auto-asssigné — voir addPlanning).
    if (!planning.chef_id) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Chef d\'équipe à désigner',
        message: 'Aucun chef d\'équipe désigné pour ce planning. Modifiez le planning pour désigner un chef inspecteur avant de lancer.',
        canal: 'in_app',
      });
      return;
    }
    // Règle métier verrouillée : une mise en œuvre PAC ne se lance que s'il y
    // a quelque chose à vérifier (preuves en attente, régularisation
    // dépassée, ou action à échéance proche/dépassée selon le risque).
    if (planning.type === 'mise_oeuvre_pac') {
      const justification = justifierSurveillancePAC(store.ecarts, planning.aerodrome_id)
      if (!justification.justifiee) {
        addNotification({
          user_id: user?.id || '',
          type: 'warning',
          title: 'Surveillance PAC prématurée',
          message: justification.motif,
          canal: 'in_app',
        });
        return;
      }
    }
    // R1 — qualité verrouillée : délégués signataires uniquement, et équipe
    // avec au moins un signataire (observateurs : voient tout, signent rien).
    {
      const fiches = store.inspecteurs || []
      const comptes = store.utilisateurs || []
      const invalides = validerQualiteDelegations(
        planning.delegations as Record<string, string> | undefined, fiches, comptes)
      if (invalides.length > 0) {
        addNotification({
          user_id: user?.id || '',
          type: 'danger',
          title: 'Délégation non qualifiée',
          message: `${invalides.map(i => `${i.nom} (${i.domaine})`).join(', ')} — seuls les inspecteurs titulaires et principaux peuvent recevoir une délégation. Réassignez ces domaines.`,
          canal: 'in_app',
        });
        return;
      }
      if (!equipeASignataire(planning.equipe_ids, planning.chef_id, fiches, comptes)) {
        addNotification({
          user_id: user?.id || '',
          type: 'danger',
          title: 'Mission sans signataire',
          message: 'Impossible de lancer : l\u2019équipe (chef compris) ne compte aucun inspecteur titulaire ou principal — personne ne pourrait signer.',
          canal: 'in_app',
        });
        return;
      }
    }
    // Seul le chef d'équipe désigné peut lancer la surveillance (garde de
    // sécurité, source unique avec résolution compte ↔ inspecteur)
    if (!estChefDePlanning(user, inspecteurs, planning)) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Réservé au chef d\'équipe',
        message: 'Seul le chef d\'équipe désigné peut exécuter cette surveillance.',
        canal: 'in_app',
      });
      return;
    }

    enregistrerFeedbackPlanning(planning, true, 'Planning validé et lancé');

    const planningAerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id);
    const sgsApplicable = isSGSApplicable(planningAerodrome);
    // Cycle de certification (initiale vs renouvellement) : pilote la
    // portée (renouvellement = OPS + SGS + COP). Inconnu → portée complète.
    const relatedCert = planning.type === 'certification'
      ? store.certifications.find(
        c => c.aerodrome_id === planning.aerodrome_id && c.phase_active === 3 && c.statut_global === 'en_cours'
      )
      : undefined;
    const cycleCertification = (relatedCert?.type_certification === 'renouvellement' ? 'renouvellement'
      : relatedCert?.type_certification === 'initiale' ? 'initiale'
      : undefined) as 'initiale' | 'renouvellement' | undefined;

    // Dates réelles d'exécution : celles ajustées par le chef d'équipe si renseignées,
    // sinon les dates programmées du planning.
    const dateDebutReelleISO = dateDebutReelle ? new Date(dateDebutReelle).toISOString() : planning.date_debut;
    const dateFinReelleISO = dateFinReelle ? new Date(dateFinReelle).toISOString() : planning.date_fin;

    const porteeComplete = planning.type === 'certification'
      ? porteeCertification(cycleCertification, sgsApplicable)
      : calculerPorteeLancement(planning.type, planning.portee, sgsApplicable)

    // Vérifier la composition de l'équipe avant de lancer
    const equipeIds = planning.equipe_ids || [];
    if (equipeIds.length > 0) {
      const { valide, erreurs } = verifierCompositionEquipe(equipeIds, utilisateurs, porteeComplete)
      if (!valide) {
        addNotification({
          user_id: user?.id || '', type: 'danger',
          title: 'Équipe incompatible',
          message: erreurs.join('. '),
          canal: 'in_app',
        })
        return
      }
    }

    const surveillance = await addSurveillance(
      buildNouvelleSurveillance(planning, porteeComplete, dateDebutReelleISO, dateFinReelleISO),
    );

    if (surveillance && surveillance.id) {
      updatePlanning(planning.id, {
        statut: 'en_cours',
        surveillance_id: surveillance.id,
        updated_at: new Date().toISOString(),
      });

      // Transférer la checklist préparée depuis le planning vers la surveillance
      if (planning.checklist_hierarchy && planning.checklist_hierarchy.length > 0) {
        setChecklistHierarchy(surveillance.id, planning.checklist_hierarchy);
        updateSurveillance(surveillance.id, { checklist_hierarchy: planning.checklist_hierarchy });
        console.debug('[Planning] Checklist préparée transférée depuis le planning:', planning.id);
      }
      // Transférer l'évaluation SGS PAOE préparée si présente
      if (planning.sgs_evaluation_prepa) {
        updateSurveillance(surveillance.id, { sgs_evaluation_prepa: planning.sgs_evaluation_prepa });
        console.debug('[Planning] Évaluation SGS préparée transférée:', planning.id);
      }

      // Convertir les délégations planning → store Delegation[]
      const now = new Date().toISOString()
      const hierarchy = surveillance.checklist_hierarchy || planning.checklist_hierarchy || []
      const delegations = convertirDelegationsPlanning(
        planning, surveillance.id,
        planning.chef_id || surveillance.chef_id || '',
        hierarchy, user?.id || '', now,
      )
      for (const delegation of delegations) {
        store.addDelegation(delegation)
      }
      if (delegations.length > 0) {
        console.debug('[Planning] Délégations converties pour la surveillance:', surveillance.id);
      }

      if (!(planning.checklist_hierarchy && planning.checklist_hierarchy.length > 0)) {
        // Fallback : générer la checklist si aucune n'a été préparée
        await genererChecklistFallback(store, planning, surveillance.id, planningAerodrome, profilsRisque, addNotification, user?.id || '');
      }

      // ── Pre-remplir les items checklist avec les prédictions IA (checklistMemory) ──
      try {
        const profil = store.profilsRisque?.[planning.aerodrome_id]
        const surv = store.surveillances.find(s => s.id === surveillance.id)
        const hierarchyPrefill = surv?.checklist_hierarchy

        if (hierarchyPrefill && profil) {
          const typeSurv = resoudreTypeSurveillance(normalizePlanningType(surv?.type))
          const changed = appliquerPredictionsPrefill(hierarchyPrefill as never, {
            aerodromeId: planning.aerodrome_id,
            typeSurv,
            profil,
          })
          if (changed) {
            updateSurveillance(surveillance.id, { checklist_hierarchy: hierarchyPrefill })
            store.setChecklistHierarchy(surveillance.id, hierarchyPrefill)
          }
        }
      } catch { /* silencieux si checklistMemory indisponible */ }
    }

    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Surveillance lancée',
      message: `La surveillance pour ${(planning as Planning & { aeroCode?: string }).aeroCode} a été créée`,
      canal: 'in_app',
    });

    // ── Notifier les exploitants de l'aérodrome ──────────────────
    {
      const typeLabel = (planning.type as string)?.replace(/_/g, ' ') ?? 'surveillance';
      const domainesLabels = (planning.portee || []).map(getDomaineLabel).join(', ');
      const dateDebut = new Date(dateDebutReelleISO).toLocaleDateString('fr-FR');
      const dateFin = new Date(dateFinReelleISO).toLocaleDateString('fr-FR');
      const equipeNoms = nomsEquipe(planning.equipe_ids || [], utilisateurs);
      const aerodrome = aerodromes.find(a => a.id === planning.aerodrome_id);
      const aeroCode = aerodrome?.code_oaci || '';
      const message = construireMessageExploitants({
        typeLabel, domainesLabels, dateDebut, dateFin, equipeNoms, aeroCode,
      });
      // Liste vivante des exploitants (le store peut être périmé si un compte a été créé après le chargement)
      const { chargerExploitants } = await import('@/lib/services/exploitants')
      const exploitants = await chargerExploitants(planning.aerodrome_id, utilisateurs)
      exploitants
        .forEach(u =>
          addNotification({
            user_id: u.id,
            type: 'warning',
            title: `Surveillance programmée — ${aeroCode}`,
            message,
            canal: 'email',
            link: `/surveillance/${surveillance.id}`,
          })
        );
    }

    // ── Synchroniser surveillance_id vers la certification/homologation liée ──
    if (planning.type === 'certification') {
      const relatedCert = store.certifications.find(
        c => c.aerodrome_id === planning.aerodrome_id && c.phase_active === 3 && c.statut_global === 'en_cours'
      );
      if (relatedCert) {
        const currentPhase3 = relatedCert.phases_data?.phase3;
        store.updateCertification(relatedCert.id, {
          phases_data: {
            ...relatedCert.phases_data,
            phase3: {
              ...(currentPhase3 || {}),
              surveillance_id: surveillance.id,
            } as NonNullable<Certification['phases_data']['phase3']>,
          },
        });
      }
    } else if (planning.type === 'homologation') {
      const relatedHomo = store.homologations.find(
        (h: Homologation) => h.aerodrome_id === planning.aerodrome_id && h.phase_active === 2 && h.statut_global === 'en_cours'
      );
      if (relatedHomo) {
        const currentPhase2 = relatedHomo.phases_data?.phase2;
        store.updateHomologation(relatedHomo.id, {
          phases_data: {
            ...relatedHomo.phases_data,
            phase2: {
              ...(currentPhase2 || {}),
              surveillance_id: surveillance.id,
            } as NonNullable<Homologation['phases_data']['phase2']>,
          },
        });
      }
    }
    // ─────────────────────────────────────────────────────────────

    // Naviguer vers la page de la surveillance (pas directement la checklist)
    router.push(`/surveillance/${surveillance.id}`);
  };

  const handleConfirmExecute = async (args: {
    executeTarget: Planning | null;
    executeDateDebut: string;
    executeDateFin: string;
    onClose: () => void;
  }) => {
    const { executeTarget, executeDateDebut, executeDateFin, onClose } = args;
    if (!executeTarget) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Lancement impossible',
        message: 'Planning introuvable au moment du lancement (données non chargées, rechargez la page).',
        canal: 'in_app',
      });
      return;
    }
    // Garde de sécurité : les dates réelles sont obligatoires avant lancement.
    if (!executeDateDebut || !executeDateFin) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Dates requises',
        message: 'Renseignez les dates réelles de début et de fin avant de lancer la surveillance.',
        canal: 'in_app',
      });
      return;
    }
    if (new Date(executeDateDebut).getTime() < startOfToday().getTime()) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Date de début invalide',
        message: 'La date de début doit être égale ou postérieure à la date du jour.',
        canal: 'in_app',
      });
      return;
    }
    if (new Date(executeDateFin).getTime() < new Date(executeDateDebut).getTime()) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Dates incohérentes',
        message: 'La date de fin ne peut pas précéder la date de début.',
        canal: 'in_app',
      });
      return;
    }
    onClose();
    await handleLancer(executeTarget, executeDateDebut, executeDateFin);
  };

  return { handleLancer, handleConfirmExecute };
}

type AppStoreType = ReturnType<typeof useAppStore.getState>;

async function genererChecklistFallback(
  store: AppStoreType,
  planning: Planning,
  surveillanceId: string,
  aerodrome: Aerodrome | undefined,
  profilsRisque: AppStore['profilsRisque'],
  addNotification: Notifier,
  userId: string,
) {
  const profil = profilsRisque?.[planning.aerodrome_id] || undefined;
  const normalizedType = normalizePlanningType(planning.type)
  const typeSurv = resoudreTypeSurveillance(normalizedType);

  // Portée SGS uniquement : pas de hiérarchie checklist attendue — le SGS
  // est couvert par l'évaluation PAOE (transférée plus haut si préparée).
  // Ne pas crier à l'erreur « template manquant » dans ce cas normal.
  const porteeSansSGS = (planning.portee || []).filter(p => (p || '').toUpperCase() !== 'SGS')
  if (porteeSansSGS.length === 0) {
    if (planning.sgs_evaluation_prepa) {
      addNotification({
        user_id: userId, type: 'info',
        title: 'Évaluation SGS reprise',
        message: 'Portée SGS : l’évaluation PAOE préparée a été transférée vers la surveillance (pas de checklist hiérarchique attendue).',
        canal: 'in_app',
      })
    } else {
      addNotification({
        user_id: userId, type: 'warning',
        title: 'Évaluation SGS à préparer',
        message: 'Portée SGS uniquement : préparez l’évaluation SGS (PAOE) depuis la page Préparation — aucune checklist hiérarchique requise.',
        canal: 'in_app',
      })
    }
    return
  }

  // Strict puis assemblage par domaine (données réelles uniquement).
  const resolution = store.resoudreChecklist(planning.portee || [],
    filtresTemplatesParType(planning.type),
    aerodrome ? { type_entite: aerodrome.type_entite, helistation: aerodrome.helistation } : undefined);
  if (resolution) {
    if (resolution.manquants.length > 0) {
      console.warn(
        '[Planning] Domaines sans template :',
        resolution.manquants.join(', '),
        '— importez un template les couvrant.',
      );
      addNotification({
        user_id: userId, type: 'warning',
        title: 'Couverture partielle',
        message: `Aucun template pour : ${resolution.manquants.join(', ')} (le SGS relève de l’évaluation PAOE, pas des templates). Checklist partielle chargée — importez un template dans le kit inspecteur.`,
        canal: 'in_app',
      });
    }
    const snapshot = JSON.parse(JSON.stringify(resolution.checklist));
    const filtered = aerodrome ? kitDocAgent.filterChecklistByAerodrome(snapshot, aerodrome) : snapshot;
    const enriched = kitDocAgent.applyRiskProfileToChecklist(filtered, {
      entite_id: planning.aerodrome_id,
      type_entite: aerodrome?.type_entite ?? 'aerodrome',
      // TypeSurveillanceKit aligné sur TypeInspection : plus de cast.
      type_surveillance: typeSurv,
      portee: planning.portee || [],
      profil_risque: profil,
    });
    store.setChecklistHierarchy(surveillanceId, enriched);
    store.updateSurveillance(surveillanceId, { checklist_hierarchy: enriched });
  } else {
    // PAS de génération IA ici (données réelles uniquement) : sans template
    // du kit couvrant la portée, la checklist reste à préparer — importez un
    // template dans le kit inspecteur (ou préparez-la dans Préparation).
    const sansSGS = (planning.portee || []).filter(p => (p || '').toUpperCase() !== 'SGS')
    console.error(
      '[Planning] Aucun template du kit ne couvre la portée (hors SGS) :',
      sansSGS,
      '— checklist non générée.',
    );
    addNotification({
      user_id: userId, type: 'warning',
      title: 'Checklist à préparer',
      message: `Aucun template du kit ne couvre : ${sansSGS.join(', ') || '—'} (hors SGS, couvert par l’évaluation PAOE). Importez un template dans le kit inspecteur ou préparez la checklist manuellement.`,
      canal: 'in_app',
    });
  }
}
