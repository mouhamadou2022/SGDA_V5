// app/surveillance/[id]/ecarts/sgs/page.tsx
// Page dédiée à la rédaction des écarts SGS issus de l'évaluation PAOE (OACI Annexe 19)
// 0 style inline — Tailwind + classes globals.css uniquement
'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { upsertEcartsRedaction } from '@/lib/datastore';
import SurveillanceEcartsRedaction, {
  QuestionNSNV,
  EcartRedaction,
} from '@/components/modules/surveillance/SurveillanceEcartsRedaction';
import type { EvaluationSGS, PAOELevel } from '@/types/checklist';
import {
  ArrowLeft,
  AlertTriangle,
  Shield,
  ChevronRight,
  MapPin,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Target,
} from 'lucide-react';

/**
 * Niveaux PAOE déclenchant la rédaction d'un écart :
 * - absent   → élément inexistant (écart critique)
 * - present  → élément présent mais non approprié (écart)
 * - approprie → niveau minimum atteint mais améliorable (observation/recommandation)
 */
const NIVEAUX_NON_CONFORMES: PAOELevel[] = ['absent', 'present', 'approprie'];

/** Badge couleur selon le niveau PAOE */
function getPAOEBadgeCls(niveau: PAOELevel): string {
  switch (niveau) {
    case 'absent':       return 'badge danger';
    case 'present':      return 'badge warning';
    case 'approprie':    return 'badge neutral'; // niveau minimum — observation
    case 'operationnel': return 'badge success';
    case 'efficace':     return 'badge success';
    default:             return 'badge neutral';
  }
}

function getPAOELabel(niveau: PAOELevel): string {
  switch (niveau) {
    case 'absent':       return 'Absent';
    case 'present':      return 'Présent (P)';
    case 'approprie':    return 'Approprié (A) — à améliorer';
    case 'operationnel': return 'Opérationnel (O)';
    case 'efficace':     return 'Efficace (E)';
    default: return niveau;
  }
}

/** Icône selon le niveau */
function NiveauIcon({ niveau }: { niveau: PAOELevel }) {
  if (niveau === 'absent')    return <XCircle className="w-4 h-4 text-danger" />;
  if (niveau === 'present')   return <XCircle className="w-4 h-4 text-warning" />;
  if (niveau === 'approprie') return <MinusCircle className="w-4 h-4 text-muted-foreground" />;
  return <CheckCircle2 className="w-4 h-4 text-success" />;
}

export default function SGSEcartsPage() {
  const params = useParams();
  const router = useRouter();
  const surveillanceId = params.id as string;

  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes    = useAppStore(s => s.aerodromes);
  const user          = useAppStore(s => s.user);
  const getEcartsBySurveillance = useAppStore(s => s.getEcartsBySurveillance);
  const setEcartsRedaction = useAppStore(s => s.setEcartsRedaction);
  const allEcartsRedaction = useAppStore(s => s.ecartsRedaction);

  const handleSaveEcarts = (ecarts: EcartRedaction[]) => {
    const otherEcarts = allEcartsRedaction.filter(e => e.surveillance_id !== surveillanceId);
    const enrichedEcarts = ecarts.map(e => ({
      ...e,
      surveillance_id: surveillanceId,
      aerodrome_id: surveillance?.aerodrome_id || '',
      domaine: e.domaine || 'SGS',
      created_by: e.created_by || user?.id || '',
      updated_by: user?.id || '',
    }));
    // Mise à jour store (instantanée)
    setEcartsRedaction([...otherEcarts, ...enrichedEcarts]);
    // Persistance Supabase — en arrière-plan pour survivre aux rechargements de page
    upsertEcartsRedaction(enrichedEcarts).catch(err =>
      console.error('[SGSEcartsPage] upsertEcartsRedaction failed:', err)
    );
  };

  // ── data-role sur body pour les variables CSS de rôle (btn-primary, bg-role-gradient…) ──
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome    = aerodromes.find(a => a.id === surveillance?.aerodrome_id);

  // Chargement de l'évaluation PAOE depuis la surveillance
  const sgsEvaluation = useMemo<EvaluationSGS | null>(() => {
    if (!surveillance?.sgs_evaluation_prepa) return null;
    return surveillance.sgs_evaluation_prepa as EvaluationSGS;
  }, [surveillance]);

  /**
   * Extraction des éléments non conformes (absent ou présent) depuis les composantes PAOE.
   * Chaque élément non conforme devient une QuestionNSNV pour SurveillanceEcartsRedaction.
   */
  const itemsNonConformes = useMemo<QuestionNSNV[]>(() => {
    if (!sgsEvaluation) return [];

    const items: QuestionNSNV[] = [];

    sgsEvaluation.composantes.forEach(composante => {
      composante.elements.forEach(element => {
        if (!NIVEAUX_NON_CONFORMES.includes(element.niveauGlobal)) return;

        // Référence SGS (ex: "SGS-1.2" pour composante 1, element 2)
        const elementIdx = composante.elements.indexOf(element) + 1;
        const ref = `SGS-${composante.id}.${elementIdx}`;

        // Description issue des questions non conformes ou du label de l'élément
        const questionsNS = element.questions.filter(
          q => NIVEAUX_NON_CONFORMES.includes(q.niveau)
        );
        const descriptionParts = questionsNS.length > 0
          ? questionsNS.map(q => q.texte).join(' / ')
          : element.label;

        items.push({
          id: `sgs-${composante.id}-${element.elementId}`,
          numero: ref,
          reference_reglementaire: `OACI Annexe 19 — Composante ${composante.id}: ${composante.label}`,
          description: `[${element.label}] ${descriptionParts}`,
          domaine: 'SGS',
          sousDomaine: `Composante ${composante.id}: ${composante.label}`,
          sousSousDomaine: element.label,
          resultat: 'NS' as const,
          paoeLevel: element.niveauGlobal as 'absent' | 'present' | 'approprie',
        });
      });
    });

    return items;
  }, [sgsEvaluation]);

  /** Écarts SGS déjà saisis pour cette surveillance */
  const ecartsExistants = useMemo<EcartRedaction[]>(() => {
    return getEcartsBySurveillance(surveillanceId).filter(
      e => (e as any).domaine === 'SGS'
    ) as unknown as EcartRedaction[];
  }, [surveillanceId, getEcartsBySurveillance]);

  // Statistiques
  const composantesNonConformes = useMemo(() => {
    if (!sgsEvaluation) return [];
    return sgsEvaluation.composantes.filter(c =>
      NIVEAUX_NON_CONFORMES.includes(c.niveauGlobal)
    );
  }, [sgsEvaluation]);

  const totalElements = useMemo(() => {
    if (!sgsEvaluation) return 0;
    return sgsEvaluation.composantes.reduce((acc, c) => acc + c.elements.length, 0);
  }, [sgsEvaluation]);

  const elementsNonConformes = useMemo(() => itemsNonConformes.length, [itemsNonConformes]);
  const progression = totalElements > 0
    ? Math.round(((totalElements - elementsNonConformes) / totalElements) * 100)
    : 100;

  // Handlers
  const handleEcartsSignes = (_signatureUrl?: string) => {
    useAppStore.getState().updateSurveillance(surveillanceId, { statut: 'ecarts_signes' });
    router.push(`/surveillance/${surveillanceId}`);
  };

  // Gardes
  if (!surveillance) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-danger" />
          </div>
          <p className="text-lg font-medium text-foreground mb-2">Surveillance introuvable</p>
          <button onClick={() => router.push('/surveillance')} className="btn btn-primary">
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  if (!sgsEvaluation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-warning/10 flex items-center justify-center">
            <Shield className="w-10 h-10 text-warning" />
          </div>
          <p className="text-lg font-medium text-foreground mb-2">Évaluation SGS non trouvée</p>
          <p className="text-sm text-muted-foreground mb-4">
            Veuillez d'abord compléter l'évaluation PAOE dans la checklist SGS.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => router.push(`/surveillance/${surveillanceId}/checklist?type=sgs`)}
              className="btn btn-primary gap-2"
            >
              <Shield className="w-4 h-4" />
              Ouvrir l'évaluation SGS
            </button>
            <button
              onClick={() => router.push(`/surveillance/${surveillanceId}`)}
              className="btn btn-secondary"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" data-role={user?.role} data-module="ecarts-sgs">

      {/* En-tête sticky */}
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/surveillance/${surveillanceId}`)}
                className="btn btn-secondary btn-sm gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>

              {/* Breadcrumb */}
              <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                <span>Surveillance</span>
                <ChevronRight className="w-3 h-3" />
                <span>{aerodrome?.code_oaci}</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-role-primary font-medium">Écarts SGS</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center">
                  <Shield className="w-4 h-4 text-role-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-foreground">
                    Rédaction des écarts SGS — {aerodrome?.code_oaci} {aerodrome?.nom}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    Évaluation PAOE (OACI Annexe 19) •{' '}
                    {elementsNonConformes} élément(s) non conforme(s) sur {totalElements}
                  </p>
                </div>
              </div>
            </div>

            {/* KPIs header */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-danger" />
                <span className="text-muted-foreground">
                  {elementsNonConformes} non conforme(s)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-success" />
                <span className="text-muted-foreground">
                  {totalElements - elementsNonConformes} conforme(s)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="progress h-1.5 w-24">
                  <div
                    className={`progress-bar ${progression >= 70 ? 'bg-success' : progression >= 40 ? 'bg-warning' : 'bg-danger'}`}
                    style={{ width: `${progression}%` }}
                  />
                </div>
                <span className="text-xs font-semibold">{progression}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6 space-y-6 max-w-7xl">

        {/* Infos surveillance */}
        <div className="card border-border">
          <div className="card-content p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-role-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Aérodrome</p>
                  <p className="font-medium">{aerodrome?.code_oaci} — {aerodrome?.nom}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-role-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Période</p>
                  <p className="font-medium">
                    {new Date(surveillance.date_debut).toLocaleDateString('fr-FR')} →{' '}
                    {new Date(surveillance.date_fin).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-role-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Équipe</p>
                  <p className="font-medium">{surveillance.equipe_ids?.length || 0} inspecteur(s)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-role-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Score global PAOE</p>
                  <p className="font-bold text-role-primary text-lg">
                    {sgsEvaluation.scoreGlobal}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Synthèse par composante */}
        <div className="card border-border">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Shield className="w-4 h-4 text-role-primary" />
              Synthèse PAOE par composante
            </div>
          </div>
          <div className="card-content">
            <div className="space-y-3">
              {sgsEvaluation.composantes.map(composante => {
                const nonConformes = composante.elements.filter(e =>
                  NIVEAUX_NON_CONFORMES.includes(e.niveauGlobal)
                );
                const isNonConforme = NIVEAUX_NON_CONFORMES.includes(composante.niveauGlobal);

                return (
                  <div
                    key={composante.id}
                    className={`p-3 rounded-xl border ${isNonConforme
                      ? 'border-danger/30 bg-danger/5'
                      : 'border-success/30 bg-success/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <NiveauIcon niveau={composante.niveauGlobal} />
                        <span className="font-semibold text-sm">
                          Composante {composante.id}: {composante.label}
                        </span>
                        <span className={getPAOEBadgeCls(composante.niveauGlobal)}>
                          {getPAOELabel(composante.niveauGlobal)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Score: <strong>{composante.score}%</strong></span>
                        {nonConformes.length > 0 && (
                          <span className="badge danger">
                            {nonConformes.length} élément(s) NC
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Éléments non conformes détaillés */}
                    {isNonConforme && nonConformes.length > 0 && (
                      <div className="mt-2 pl-6 space-y-1">
                        {nonConformes.map(element => {
                          const elemIdx = composante.elements.indexOf(element) + 1;
                          return (
                            <div key={element.elementId} className="flex items-center gap-2 text-xs">
                              <XCircle className="w-3 h-3 text-danger flex-shrink-0" />
                              <span className="text-muted-foreground font-mono">
                                SGS-{composante.id}.{elemIdx}
                              </span>
                              <span className="text-foreground">{element.label}</span>
                              <span className={`${getPAOEBadgeCls(element.niveauGlobal)} text-[10px]`}>
                                {getPAOELabel(element.niveauGlobal)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Zone de rédaction des écarts */}
        {itemsNonConformes.length === 0 ? (
          <div className="card border-border">
            <div className="card-content py-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4 opacity-70" />
              <p className="text-lg font-semibold text-success mb-2">
                Aucun écart SGS à rédiger
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Tous les éléments PAOE évalués sont au moins au niveau "Approprié".
              </p>
              <button
                onClick={() => handleEcartsSignes()}
                className="btn btn-primary gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Valider et continuer
              </button>
            </div>
          </div>
        ) : (
          <SurveillanceEcartsRedaction
            surveillanceId={surveillanceId}
            aerodromeId={surveillance.aerodrome_id}
            itemsNSNV={itemsNonConformes}
            ecartsExistants={ecartsExistants}
            onSave={handleSaveEcarts}
            onSigner={handleEcartsSignes}
            userRole={user?.role || 'inspector'}
          />
        )}
      </div>
    </div>
  );
}
