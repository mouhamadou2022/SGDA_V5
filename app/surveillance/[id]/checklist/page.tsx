// app/surveillance/[id]/checklist/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAppStore, useDecisionChecklist } from '@/lib/store';
import { SurveillanceChecklistStandard } from '@/components/modules/surveillance';
import { SurveillanceChecklistSuiviEcarts } from '@/components/modules/surveillance';
import { SurveillanceChecklistPAC } from '@/components/modules/surveillance';
import { SGSEvaluationContent } from '@/components/modules/surveillance/SGSEvaluation';
import type { DomaineChecklist, EvaluationSGS } from '@/types/checklist';
import type { TypeChecklist } from '@/lib/domaines';
import { ArrowLeft, Wifi, WifiOff, ClipboardList, AlertTriangle, CheckCircle2, LayoutGrid, FileText, Shield, Users, Keyboard, PenLine, Type } from 'lucide-react';

// Composant pour la version MIXTE (3 checklists dans des onglets)
function ChecklistMixte({
  surveillanceId,
  aerodromeId,
  onSave,
  onComplete,
  userRole,
  initialTab,
}: {
  surveillanceId: string;
  aerodromeId: string;
  onSave?: (domaines: DomaineChecklist[]) => void;
  onComplete: () => void;
  userRole: string;
  initialTab?: 'standard' | 'suivi' | 'pac';
}) {
  const [activeTab, setActiveTab] = useState<'standard' | 'suivi' | 'pac'>(initialTab || 'standard');
  const surveillances = useAppStore(s => s.surveillances);
  const surveillance = surveillances.find(s => s.id === surveillanceId);

  const portee = surveillance?.portee || [];
  const isMixedWithSGS = portee.includes('SGS') && portee.length > 1;

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  if (!surveillance) return null;

  return (
    <div className="space-y-4">
      <div className="tabs border-b border-border">
        <button
          onClick={() => setActiveTab('standard')}
          className={`tab py-2 px-4 ${activeTab === 'standard' ? 'active' : ''}`}
        >
          <ClipboardList className="w-4 h-4 inline mr-2" />
          Checklist standard
        </button>
        <button
          onClick={() => setActiveTab('suivi')}
          className={`tab py-2 px-4 ${activeTab === 'suivi' ? 'active' : ''}`}
        >
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          Suivi des écarts
        </button>
        <button
          onClick={() => setActiveTab('pac')}
          className={`tab py-2 px-4 ${activeTab === 'pac' ? 'active' : ''}`}
        >
          <CheckCircle2 className="w-4 h-4 inline mr-2" />
          Mise en œuvre PAC
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'standard' && (
          <SurveillanceChecklistStandard
            surveillanceId={surveillanceId}
            surveillance={{
              aerodrome: { code_oaci: aerodromeId, nom: '' },
              type: surveillance.type,
              date_debut: surveillance.date_debut,
              equipe_ids: surveillance.equipe_ids || [],
              chef_id: surveillance.chef_id || '',
            }}
            onSave={onSave}
            onComplete={onComplete}
            userRole={userRole}
            excludeDomaines={isMixedWithSGS ? ['SGS'] : []}
          />
        )}
        {activeTab === 'suivi' && (
          <SurveillanceChecklistSuiviEcarts
            surveillanceId={surveillanceId}
            aerodromeId={aerodromeId}
            onComplete={onComplete}
            userRole={userRole}
          />
        )}
        {activeTab === 'pac' && (
          <SurveillanceChecklistPAC
            surveillanceId={surveillanceId}
            aerodromeId={aerodromeId}
            onComplete={onComplete}
            userRole={userRole}
          />
        )}
      </div>
    </div>
  );
}

// Composant pour la synthèse (onglet dans la version mixte)
function ChecklistSynthese({
  surveillanceId,
}: {
  surveillanceId: string;
}) {
  const surveillances = useAppStore(s => s.surveillances);
  const checklistItems = useAppStore(s => s.checklistItems);
  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const items = checklistItems[surveillanceId] || [];
  
  const total = items.length;
  const sa = items.filter(i => i.resultat === 'SA').length;
  const ns = items.filter(i => i.resultat === 'NS').length;
  const nv = items.filter(i => i.resultat === 'NV' || !i.resultat).length;
  const na = items.filter(i => i.resultat === 'NA').length;
  const progression = total > 0 ? Math.round(((sa + ns + na) / total) * 100) : 0;
  const tauxConformite = total > 0 ? Math.round((sa / (sa + ns + nv)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Statistiques globales */}
      <div className="card border-border">
        <div className="card-header">
          <div className="card-title">Synthèse de la surveillance</div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-success/10 rounded-xl">
              <div className="text-2xl font-bold text-success">{sa}</div>
              <div className="text-xs text-muted-foreground">Satisfaisant</div>
            </div>
            <div className="text-center p-3 bg-danger/10 rounded-xl">
              <div className="text-2xl font-bold text-danger">{ns}</div>
              <div className="text-xs text-muted-foreground">Non satisfaisant</div>
            </div>
            <div className="text-center p-3 bg-warning/10 rounded-xl">
              <div className="text-2xl font-bold text-warning">{nv}</div>
              <div className="text-xs text-muted-foreground">Non vérifié</div>
            </div>
            <div className="text-center p-3 bg-gray-100 rounded-xl">
              <div className="text-2xl font-bold text-gray-600">{na}</div>
              <div className="text-xs text-muted-foreground">Non applicable</div>
            </div>
            <div className="text-center p-3 bg-role-primary-soft rounded-xl">
              <div className="text-2xl font-bold text-role-primary">{total}</div>
              <div className="text-xs text-muted-foreground">Total items</div>
            </div>
          </div>
        </div>
      </div>

      {/* Progression */}
      <div className="card border-border">
        <div className="card-header">
          <div className="card-title">Progression globale</div>
        </div>
        <div className="card-content space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-semibold">{progression}%</span>
          </div>
          <div className="progress h-2">
            <div className="progress-bar progress-fill" style={{ '--pf': progression } as React.CSSProperties} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Taux de conformité réel</span>
            <span className={`font-semibold ${tauxConformite >= 70 ? 'text-success' : tauxConformite >= 50 ? 'text-warning' : 'text-danger'}`}>
              {tauxConformite}%
            </span>
          </div>
          <div className="progress h-2">
            <div
              className={`progress-bar progress-fill ${tauxConformite >= 70 ? 'bg-success' : tauxConformite >= 50 ? 'bg-warning' : 'bg-danger'}`}
              style={{ '--pf': tauxConformite } as React.CSSProperties}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            NV sont considérés comme non satisfaisants
          </p>
        </div>
      </div>

      {/* Informations surveillance */}
      {surveillance && (
        <div className="card border-border">
          <div className="card-header">
            <div className="card-title">Informations</div>
          </div>
          <div className="card-content space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium capitalize">{surveillance.type?.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date début</span>
              <span className="font-medium">{new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date fin</span>
              <span className="font-medium">{new Date(surveillance.date_fin).toLocaleDateString('fr-FR')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Équipe</span>
              <span className="font-medium">{surveillance.equipe_ids?.length || 0} inspecteur(s)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const surveillanceId = params.id as string;
  const typeParam = searchParams.get('type'); // 'standard' | 'suivi' | 'pac' | 'mixte'

  const surveillances = useAppStore(s => s.surveillances)
  const aerodromes = useAppStore(s => s.aerodromes)
  const user = useAppStore(s => s.user)
  const ecarts = useAppStore(s => s.ecarts)
  const addNotification = useAppStore(s => s.addNotification)
  const setChecklistHierarchy = useAppStore(s => s.setChecklistHierarchy)
  const setChecklistItems = useAppStore(s => s.setChecklistItems)
  const updateSurveillance = useAppStore(s => s.updateSurveillance)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const checklistItems = useAppStore(s => s.checklistItems)

  const { decision, determineChecklistType } = useDecisionChecklist();

  const [isOffline, setIsOffline] = useState(false);
  const [profileDerivedType, setProfileDerivedType] = useState<'standard' | 'suivi' | 'pac' | 'mixte' | null>(null);
  const [profileDerivedInitialTab, setProfileDerivedInitialTab] = useState<'standard' | 'suivi' | 'pac'>('standard');
  const [modeSaisie, setModeSaisie] = useState<'clavier' | 'stylet' | 'mixte'>('clavier');

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);

  const deriveUiFromDecisionChecklist = (
    typesChecklist: TypeChecklist[]
  ): {
    uiType: 'standard' | 'suivi' | 'pac' | 'mixte';
    initialTab: 'standard' | 'suivi' | 'pac';
  } => {
    const hasStandard = typesChecklist.includes('standard');
    const hasSuivi = typesChecklist.includes('suivi_ecarts');
    const hasPac = typesChecklist.includes('pac');

    // priorité au mode "mixte" si on a plusieurs briques
    if ((hasStandard && hasSuivi && hasPac) || (hasStandard && (hasSuivi || hasPac) && (hasSuivi || hasPac))) {
      // choix du tab initial: pac > suivi > standard
      if (hasPac) return { uiType: 'mixte' as const, initialTab: 'pac' as const };
      if (hasSuivi) return { uiType: 'mixte' as const, initialTab: 'suivi' as const };
      return { uiType: 'mixte' as const, initialTab: 'standard' as const };
    }
    if (hasSuivi && hasPac) return { uiType: 'mixte' as const, initialTab: hasPac ? 'pac' : 'suivi' as const };
    if (hasSuivi) return { uiType: 'suivi' as const, initialTab: 'suivi' as const };
    if (hasPac) return { uiType: 'pac' as const, initialTab: 'pac' as const };
    return { uiType: 'standard' as const, initialTab: 'standard' as const };
  };

  // Sauvegarde de l'évaluation SGS dans le store surveillance
  const handleSaveSGSEvaluation = React.useCallback((evaluation: EvaluationSGS) => {
    updateSurveillance(surveillanceId, { sgs_evaluation_prepa: evaluation });
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Évaluation SGS sauvegardée',
      message: 'Les données de l\'évaluation SGS ont été enregistrées',
      canal: 'in_app',
    });
  }, [surveillanceId, updateSurveillance, addNotification, user?.id]);

  // Signature de l'évaluation SGS
  const handleSignSGSEvaluation = React.useCallback((signatureUrl: string) => {
    updateSurveillance(surveillanceId, {
      statut: 'checklist_signee',
      signatures_checklist: [{ signataire_id: user?.id || '', signataire_nom: `${user?.prenom || ''} ${user?.nom || ''}`, date_signature: new Date().toISOString(), signature_url: signatureUrl }],
    });
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Évaluation SGS signée',
      message: 'L\'évaluation SGS a été signée avec succès',
      canal: 'in_app',
    });
  }, [surveillanceId, updateSurveillance, addNotification, user]);

  // Save full hierarchy + flat items to persisted store
  const handleSaveChecklist = React.useCallback((domaines: DomaineChecklist[]) => {
    // Flatten all items from hierarchy into checklistItems
    const flatItems: any[] = [];
    const walk = (d: DomaineChecklist) => {
      (d.items || []).forEach(item => flatItems.push({ ...item }));
      (d.sousDomaines || []).forEach(sd => {
        (sd.items || []).forEach(item => flatItems.push({ ...item }));
        (sd.sousSousDomaines || []).forEach(ssd =>
          (ssd.items || []).forEach(item => flatItems.push({ ...item }))
        );
      });
    };
    domaines.forEach(d => walk(d));
    setChecklistHierarchy(surveillanceId, domaines as any);
    setChecklistItems(surveillanceId, flatItems as any);
    updateSurveillance(surveillanceId, { checklist_hierarchy: domaines as any });
  }, [surveillanceId, setChecklistHierarchy, setChecklistItems, updateSurveillance]);

  // Déterminer le composant à afficher en fonction du paramètre type (priorité URL → profil → surveillance.type)
  const getComponentByType = () => {
    // 1) URL prioritaire
    if (typeParam === 'mixte') {
      return {
        component: (
          <ChecklistMixte
            surveillanceId={surveillanceId}
            aerodromeId={surveillance?.aerodrome_id || ''}
            initialTab={profileDerivedInitialTab}
            onSave={handleSaveChecklist}
            onComplete={() => {
              addNotification({
                user_id: user?.id || '',
                type: 'success',
                title: 'Checklist complétée',
                message: 'Toutes les checklists ont été complétées avec succès',
                canal: 'in_app',
              });
              router.push(`/surveillance/${surveillanceId}`);
            }}
            userRole={user?.role || 'inspector'}
          />
        ),
        title: 'Checklist mixte',
        icon: LayoutGrid,
      };
    }

    if (typeParam === 'suivi') {
      return {
        component: (
          <SurveillanceChecklistSuiviEcarts
            surveillanceId={surveillanceId}
            aerodromeId={surveillance?.aerodrome_id || ''}
            onComplete={() => {
              router.push(`/surveillance/${surveillanceId}`);
            }}
            userRole={user?.role || 'inspector'}
          />
        ),
        title: 'Suivi des écarts',
        icon: AlertTriangle,
      };
    }

    if (typeParam === 'pac') {
      return {
        component: (
          <SurveillanceChecklistPAC
            surveillanceId={surveillanceId}
            aerodromeId={surveillance?.aerodrome_id || ''}
            onComplete={() => {
              router.push(`/surveillance/${surveillanceId}`);
            }}
            userRole={user?.role || 'inspector'}
          />
        ),
        title: 'Mise en œuvre PAC',
        icon: CheckCircle2,
      };
    }

    // Cas SGS explicite (?type=sgs) → évaluation PAOE plein écran (sans checklist standard en arrière-plan)
    if (typeParam === 'sgs') {
      return {
        component: (
          <SGSEvaluationContent
            aerodromeId={aerodrome?.id || surveillance?.aerodrome_id || ''}
            surveillanceId={surveillanceId}
            aerodromeNom={aerodrome?.nom}
            surveillanceType={surveillance?.type}
            surveillanceDate={surveillance?.date_debut}
            equipeCount={surveillance?.equipe_ids?.length}
            inspecteurId={user?.id || ''}
            inspecteurNom={`${user?.prenom || ''} ${user?.nom || ''}`.trim()}
            existingEvaluation={(surveillance?.sgs_evaluation_prepa as EvaluationSGS) ?? null}
            onSave={handleSaveSGSEvaluation}
            onSigner={handleSignSGSEvaluation}
            onComplete={() => {
              router.push(`/surveillance/${surveillanceId}`);
            }}
            isSigned={surveillance?.statut === 'checklist_signee' || !!(surveillance?.signatures_checklist as any[])?.length}
            onBack={() => router.push(`/surveillance/${surveillanceId}`)}
          />
        ),
        title: 'Évaluation SGS',
        icon: Shield,
      };
    }

    // Cas Standard explicite (?type=standard) avec détection portée SGS mixte
    if (typeParam === 'standard') {
      const portee = surveillance?.portee || [];
      const isMixedWithSGS = portee.includes('SGS') && !(portee.length === 1 && portee[0] === 'SGS');
      return {
        component: (
          <SurveillanceChecklistStandard
            surveillanceId={surveillanceId}
            surveillance={{
              aerodrome: { code_oaci: aerodrome?.code_oaci || '', nom: aerodrome?.nom || '' },
              type: surveillance?.type || 'programmee',
              date_debut: surveillance?.date_debut || '',
              equipe_ids: surveillance?.equipe_ids || [],
              chef_id: surveillance?.chef_id || '',
            }}
            onSave={handleSaveChecklist}
            onComplete={() => { router.push(`/surveillance/${surveillanceId}`); }}
            userRole={user?.role || 'inspector'}
            excludeDomaines={isMixedWithSGS ? ['SGS'] : []}
            modeSaisie={modeSaisie}
          />
        ),
        title: 'Checklist standard',
        icon: ClipboardList,
      };
    }

    // 2) Profil (si calculé) : profileDerivedType
    if (!typeParam && profileDerivedType) {
      if (profileDerivedType === 'mixte') {
        return {
          component: (
            <ChecklistMixte
              surveillanceId={surveillanceId}
              aerodromeId={surveillance?.aerodrome_id || ''}
              initialTab={profileDerivedInitialTab}
              onSave={handleSaveChecklist}
              onComplete={() => {
                router.push(`/surveillance/${surveillanceId}`);
              }}
              userRole={user?.role || 'inspector'}
            />
          ),
          title: 'Checklist mixte',
          icon: LayoutGrid,
        };
      }
      if (profileDerivedType === 'suivi') {
        return {
          component: (
            <SurveillanceChecklistSuiviEcarts
              surveillanceId={surveillanceId}
              aerodromeId={surveillance?.aerodrome_id || ''}
              onComplete={() => {
                router.push(`/surveillance/${surveillanceId}`);
              }}
              userRole={user?.role || 'inspector'}
            />
          ),
          title: 'Suivi des écarts',
          icon: AlertTriangle,
        };
      }
      if (profileDerivedType === 'pac') {
        return {
          component: (
            <SurveillanceChecklistPAC
              surveillanceId={surveillanceId}
              aerodromeId={surveillance?.aerodrome_id || ''}
              onComplete={() => {
                router.push(`/surveillance/${surveillanceId}`);
              }}
              userRole={user?.role || 'inspector'}
            />
          ),
          title: 'Mise en œuvre PAC',
          icon: CheckCircle2,
        };
      }
    }

    // 3) Fallback : surveillance.type
    if (surveillance?.type === 'suivi_ecarts') {
      return {
        component: (
          <SurveillanceChecklistSuiviEcarts
            surveillanceId={surveillanceId}
            aerodromeId={surveillance.aerodrome_id}
            onComplete={() => {
              router.push(`/surveillance/${surveillanceId}`);
            }}
            userRole={user?.role || 'inspector'}
          />
        ),
        title: 'Suivi des écarts',
        icon: AlertTriangle,
      };
    }

    if (surveillance?.type === 'mise_oeuvre_pac') {
      return {
        component: (
          <SurveillanceChecklistPAC
            surveillanceId={surveillanceId}
            aerodromeId={surveillance.aerodrome_id}
            onComplete={() => {
              router.push(`/surveillance/${surveillanceId}`);
            }}
            userRole={user?.role || 'inspector'}
          />
        ),
        title: 'Mise en œuvre PAC',
        icon: CheckCircle2,
      };
    }

    // Détection portée SGS-only → évaluation PAOE plein écran
    const portee = surveillance?.portee || [];
    const isSgsOnly = portee.length === 1 && portee[0] === 'SGS';
    const isMixedWithSGS = portee.includes('SGS') && !isSgsOnly;

    if (isSgsOnly) {
      return {
        component: (
          <SGSEvaluationContent
            aerodromeId={aerodrome?.id || surveillance?.aerodrome_id || ''}
            surveillanceId={surveillanceId}
            aerodromeNom={aerodrome?.nom}
            surveillanceType={surveillance?.type}
            surveillanceDate={surveillance?.date_debut}
            equipeCount={surveillance?.equipe_ids?.length}
            inspecteurId={user?.id || ''}
            inspecteurNom={`${user?.prenom || ''} ${user?.nom || ''}`.trim()}
            existingEvaluation={(surveillance?.sgs_evaluation_prepa as EvaluationSGS) ?? null}
            onSave={handleSaveSGSEvaluation}
            onSigner={handleSignSGSEvaluation}
            onComplete={() => {
              router.push(`/surveillance/${surveillanceId}`);
            }}
            isSigned={surveillance?.statut === 'checklist_signee' || !!(surveillance?.signatures_checklist as any[])?.length}
            onBack={() => router.push(`/surveillance/${surveillanceId}`)}
          />
        ),
        title: 'Évaluation SGS',
        icon: Shield,
      };
    }

    // Portée mixte SGS + autres domaines → checklist standard SANS les items SGS
    // (l'évaluation SGS est accessible via le bouton dédié dans le header)
    return {
      component: (
        <SurveillanceChecklistStandard
          surveillanceId={surveillanceId}
          surveillance={{
            aerodrome: {
              code_oaci: aerodrome?.code_oaci || '',
              nom: aerodrome?.nom || '',
            },
            type: surveillance?.type || 'programmee',
            date_debut: surveillance?.date_debut || '',
            equipe_ids: surveillance?.equipe_ids || [],
            chef_id: surveillance?.chef_id || '',
          }}
          onSave={handleSaveChecklist}
          onComplete={() => {
            router.push(`/surveillance/${surveillanceId}`);
          }}
          userRole={user?.role || 'inspector'}
          excludeDomaines={isMixedWithSGS ? ['SGS'] : []}
          modeSaisie={modeSaisie}
        />
      ),
      title: 'Checklist standard',
      icon: ClipboardList,
    };
  };

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── data-role sur body pour les variables CSS de rôle (btn-primary, bg-role-gradient…) ──
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  // Calcul automatique du type UI à partir de la recommandation du profil
  useEffect(() => {
    if (!surveillance || !aerodrome) return;
    if (typeParam) return; // URL prioritaire

    const profil = profilsRisque?.[surveillance.aerodrome_id];
    if (!profil) return;

    const ecartsActifs = ecarts?.filter(e => e.aerodrome_id === surveillance.aerodrome_id && e.statut !== 'cloture') || [];
    // typePlanning: on réutilise surveillance.type (ou un fallback)
    const typePlanning = surveillance.type || 'programmee';

    // Si déjà calculé, utiliser la décision actuelle
    // sinon on déclenche le calcul
    const run = async () => {
      try {
        const d = decision?.typesChecklist?.length ? decision : await determineChecklistType(profil, ecartsActifs, typePlanning);
        if (!d?.typesChecklist?.length) return;

        const mapped = deriveUiFromDecisionChecklist(d.typesChecklist);
        setProfileDerivedType(mapped.uiType);
        setProfileDerivedInitialTab(mapped.initialTab);
      } catch {
        // fallback: rien
      }
    };

    run();
  }, [surveillance, aerodrome, typeParam, profilsRisque, ecarts, determineChecklistType, decision]);

  // ── Stats temps réel depuis checklistItems — AVANT le guard ──
  // (les hooks doivent toujours être appelés dans le même ordre)
  const liveItems = checklistItems[surveillanceId] || [];
  const liveStats = React.useMemo(() => {
    const total = liveItems.length;
    const sa = liveItems.filter(i => i.resultat === 'SA').length;
    const ns = liveItems.filter(i => i.resultat === 'NS').length;
    const nv = liveItems.filter(i => i.resultat === 'NV' || !i.resultat).length;
    const na = liveItems.filter(i => i.resultat === 'NA').length;
    const progression = total > 0 ? Math.round(((sa + ns + na) / total) * 100) : 0;
    return { total, sa, ns, nv, na, progression };
  }, [liveItems]);

  // ── Profil risque & maturité SGS ───────────────────────────
  const profil = profilsRisque?.[surveillance?.aerodrome_id || ''];
  const scoreRisque = profil?.score_global;
  const niveauRisque = profil?.niveau;
  const maturiteSGS = aerodrome?.maturite_sgs;

  const scoreColor = scoreRisque == null ? 'text-muted-foreground'
    : scoreRisque >= 80 ? 'text-success' : scoreRisque >= 60 ? 'text-warning' : 'text-danger';
  const niveauBadgeClass = niveauRisque === 'faible' ? 'bg-success/20 text-success border-success'
    : niveauRisque === 'moyen' ? 'bg-warning/20 text-warning border-warning'
    : niveauRisque === 'eleve' ? 'bg-orange-100 text-orange-700 border-orange-300'
    : 'bg-danger/20 text-danger border-danger';

  if (!surveillance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-danger" />
          </div>
          <p className="text-lg font-medium text-foreground mb-2">Surveillance non trouvée</p>
          <p className="text-sm text-muted-foreground mb-6">La surveillance que vous cherchez n'existe pas ou a été supprimée.</p>
          <button onClick={() => router.push('/surveillance')} className="btn btn-primary">
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  const { component: ChecklistComponent, title, icon: Icon } = getComponentByType();

  // ── Portée pour affichage conditionnel ─────────────────────
  const surveillancePortee = surveillance?.portee || [];
  const isSgsOnlyPage = surveillancePortee.length === 1 && surveillancePortee[0] === 'SGS';
  const isMixedWithSGSPage = surveillancePortee.includes('SGS') && !isSgsOnlyPage;

  return (
    <div className="min-h-screen bg-background" data-role={user?.role} data-module="checklist">
      {/* ── Header sticky premium ────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border shadow-role-glow">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-2">

          {/* Ligne 1 : navigation + titre + état réseau */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/surveillance/${surveillanceId}`)}
                className="btn btn-ghost p-2 shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              {/* Icône type */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${
                typeParam === 'suivi'  ? 'bg-gradient-to-br from-amber-500 to-orange-600' :
                typeParam === 'pac'   ? 'bg-gradient-to-br from-green-500 to-emerald-600' :
                typeParam === 'mixte' ? 'bg-gradient-to-br from-purple-500 to-purple-600' :
                                        'bg-role-gradient'
              }`}>
                {Icon && <Icon className="w-4 h-4 text-white" />}
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight text-foreground">
                  <span className="text-role-primary">{aerodrome?.code_oaci}</span>&nbsp;— {aerodrome?.nom}
                </h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="badge muted badge-icon">
                    <ClipboardList className="w-2.5 h-2.5" />
                    <span className="capitalize">{surveillance.type?.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}
                    {surveillance.date_fin && ` → ${new Date(surveillance.date_fin).toLocaleDateString('fr-FR')}`}
                  </span>
                  {surveillance.equipe_ids?.length > 0 && (
                    <span className="badge muted badge-icon">
                      <Users className="w-2.5 h-2.5" />
                      {surveillance.equipe_ids.length} inspecteur{surveillance.equipe_ids.length > 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="badge primary badge-icon">
                    {Icon && <Icon className="w-2.5 h-2.5" />} {title}
                    {typeParam === 'mixte' && <><LayoutGrid className="w-2.5 h-2.5 ml-1" /></>}
                  </span>
                </div>
              </div>
            </div>

            {/* Bouton évaluation SGS pour portée mixte */}
            {isMixedWithSGSPage && (
              <button
                onClick={() => router.push(`/surveillance/${surveillanceId}/checklist?type=sgs`)}
                className="btn btn-sm btn-primary gap-1.5 shrink-0"
              >
                <Shield className="w-3.5 h-3.5" />
                Évaluation SGS
              </button>
            )}

            {/* Statut réseau + Mode de saisie */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              {/* Wifi */}
              {isOffline ? (
                <span className="badge warning badge-icon">
                  <WifiOff className="w-3 h-3" /> Hors ligne
                </span>
              ) : (
                <span className="badge success badge-icon">
                  <Wifi className="w-3 h-3" /> En ligne
                </span>
              )}
              {/* Mode de saisie — en dessous du wifi */}
              <div className="flex items-center gap-1">
                {([
                  { mode: 'clavier' as const, icon: Keyboard, label: 'Clavier' },
                  { mode: 'stylet'  as const, icon: PenLine,  label: 'Stylet'  },
                  { mode: 'mixte'   as const, icon: Type,     label: 'Mixte'   },
                ]).map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setModeSaisie(mode)}
                    title={label}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      modeSaisie === mode
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Ligne 2 : score risque · maturité SGS · stats temps réel */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Score de risque */}
            {scoreRisque != null && (
              <span className="badge muted badge-icon">
                <FileText className="w-3 h-3" />
                Risque&nbsp;<strong className={scoreColor}>{scoreRisque}/100</strong>
                {niveauRisque && (
                  <span className={`badge ${niveauBadgeClass} text-[10px]`}>{niveauRisque}</span>
                )}
              </span>
            )}
            {/* Maturité SGS */}
            {maturiteSGS != null && (
              <span className="badge muted badge-icon">
                <ClipboardList className="w-3 h-3" />
                SGS&nbsp;<strong className={maturiteSGS >= 4 ? 'text-success' : maturiteSGS >= 3 ? 'text-warning' : 'text-danger'}>{maturiteSGS}/5</strong>
              </span>
            )}
            {/* Séparateur + stats temps réel — masquées pour l'évaluation SGS (PAOE) */}
            {liveStats.total > 0 && !isSgsOnlyPage && typeParam !== 'sgs' && (
              <>
                <span className="text-border text-xs">|</span>
                <span className="badge muted text-xs">
                  <strong className="text-foreground">{liveStats.total}</strong>&nbsp;items
                </span>
                <span className="badge success">SA&nbsp;{liveStats.sa}</span>
                <span className="badge danger">NS&nbsp;{liveStats.ns}</span>
                <span className="badge warning">NV&nbsp;{liveStats.nv}</span>
                {/* Barre de progression sans inline style */}
                <div className="flex items-center gap-1.5">
                  <div className="progress w-24 h-1.5">
                    <div
                      className={`progress-bar progress-fill ${liveStats.progression >= 80 ? 'bg-success' : liveStats.progression >= 50 ? 'bg-warning' : 'bg-danger'}`}
                      style={{ '--pf': liveStats.progression } as React.CSSProperties}
                    />
                  </div>
                  <strong className="text-xs text-foreground">{liveStats.progression}%</strong>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Contenu principal — pleine largeur */}
      <div className="w-full px-2 py-4">
        {ChecklistComponent}
      </div>
    </div>
  );
}
