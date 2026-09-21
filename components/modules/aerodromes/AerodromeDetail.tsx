// components/modules/aerodromes/AerodromeDetail.tsx
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  Plane, Ruler, FileText, History,
  Eye, Edit3, X, Shield, Gauge, Brain,
} from 'lucide-react';
import {
  useAppStore,
  Aerodrome, Certification, Homologation, ScoreHistoryPoint
} from '@/lib/store';
import { riskAgent } from '@/lib/ia/agents/riskAgent';
import type { RiskAnalysisResult } from '@/lib/ia/agents/riskAgent';
import AdminInspecteurDashboard from './AdminInspecteurDashboard';
import { OngletInfo, OngletRisque, OngletTechnique, OngletCertification, OngletSurveillances, OngletDocuments, OngletHistorique, OngletAerorisq } from './AerodromeDetailTabs';
// Badges partagés (source unique — voir aerodromeBadges.tsx).
import {
  AerodromeStatutBadge,
  AerodromeTypeBadge,
  AerodromeTypeEntiteBadge,
  NiveauRisqueBadge,
} from './aerodromeBadges';

interface AerodromeDetailProps {
  aerodrome: Aerodrome;
  onClose: () => void;
  onEdit: () => void;
  userRole: string;
}

const ADMIN_INSPECTEUR_ROLES = ['admin', 'inspector', 'inspecteur']

const isAdminOrInspector = (role: string) => ADMIN_INSPECTEUR_ROLES.includes(role)

// Helpers d'affichage unifiés dans ./aerodromeBadges.tsx (source unique) :
// getStatutBadge → AerodromeStatutBadge, getTypeBadge → AerodromeTypeBadge,
// getTypeEntiteBadge → AerodromeTypeEntiteBadge,
// getNiveauRisqueBadge → NiveauRisqueBadge (corrige aussi le crash sur
// niveau inattendu : l'ancien fallback variants['modere'] était undefined),
// getRiskProgressClass → partagé, getTendanceIcon → TendanceIcon,
// SGS_LABELS/SGS_CLASSES/getSgsNiveau → SgsMaturiteBadge (échelle 0-100,
// libellé AGENTS.md getSgsMaturiteLabel).

// toDMS + MiniMap déplacés dans ./AerodromeDetailTabs.tsx (onglet Infos).

export default function AerodromeDetail({ aerodrome, onClose, onEdit, userRole: userRoleProp }: AerodromeDetailProps) {
  const user = useAppStore(s => s.user)
  const ecarts = useAppStore(s => s.ecarts)
  const surveillances = useAppStore(s => s.surveillances)
  const certifications = useAppStore(s => s.certifications)
  const homologations = useAppStore(s => s.homologations)
  const getProfilRisque = useAppStore(s => s.getProfilRisque)
  const setProfilRisque = useAppStore(s => s.setProfilRisque)
  const getHistoricalScoresForAerodrome = useAppStore(s => s.getHistoricalScoresForAerodrome);
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const codesAcces = useAppStore(s => s.codesAcces)
  const setCurrentAerodrome = useAppStore(s => s.setCurrentAerodrome)
  const userRole = user?.role || userRoleProp

  // Informer le store du contexte aérodrome actuel (utilisé par l'assistant IA)
  useEffect(() => {
    setCurrentAerodrome(aerodrome)
    return () => setCurrentAerodrome(null)
  }, [aerodrome, setCurrentAerodrome])
  
  const profilRisque = getProfilRisque(aerodrome.id);
  const surveillancesAerodrome = surveillances.filter(s => s.aerodrome_id === aerodrome.id);
  const ecartsCount = ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.statut !== 'cloture').length;
  const historiqueScoresAerodrome = getHistoricalScoresForAerodrome?.(aerodrome.id) || [];
  
  const personnelAerodrome = useMemo(() => {
    return utilisateurs.filter(u => u.aerodrome_id === aerodrome.id && ['dg_operator', 'focal_operator', 'staff_operator'].includes(u.role))
  }, [utilisateurs, aerodrome.id])

  const codesActifsAerodrome = useMemo(() => {
    return codesAcces.filter(c => c.aerodrome_id === aerodrome.id && c.statut === 'actif')
  }, [codesAcces, aerodrome.id])
  
  const [activeTab, setActiveTab] = useState('info');
  const [iaAnalysis, setIaAnalysis] = useState<RiskAnalysisResult | null>(null);
  const [isLoadingIA, setIsLoadingIA] = useState(false);

  // Charger l'analyse IA (quantitative d'abord, narrative ensuite)
  useEffect(() => {
    let cancelled = false
    const loadIAnalysis = async () => {
      setIsLoadingIA(true);
      try {
        const analysis = await riskAgent.analyzeRisk({
          aerodromeId: aerodrome.id,
          includePredictions: true,
          includeBlackSwan: true,
          includeSuggestions: true
        }, {});
        if (!cancelled) {
          setIaAnalysis(analysis)
          setIsLoadingIA(false)
        }

        // Charger l'analyse narrative séparément (peut être lent — Ollama timeout 10s)
        try {
          const narrative = await riskAgent.getAIAnalysis(aerodrome.id, analysis)
          if (narrative && !cancelled) {
            setIaAnalysis(prev => prev ? { ...prev, aiAnalysis: narrative } : { ...analysis, aiAnalysis: narrative })
          }
        } catch {
          // Narrative non disponible — l'analyse quantitative reste affichée
        }
      } catch (error) {
        if (!cancelled) console.error('[AerodromeDetail] Erreur chargement IA:', error);
        if (!cancelled) setIsLoadingIA(false);
      }
    };
    loadIAnalysis();
    return () => { cancelled = true; };
  }, [aerodrome.id]);

  // Auto-initialisation du profil risque si absent (création hors formulaire ou erreur)
  useEffect(() => {
    if (profilRisque) return;
    (async () => {
      try {
        const { calculerProfilInitial } = await import('@/lib/risque/initialProfile');
        const profil = calculerProfilInitial(aerodrome);
        await setProfilRisque(aerodrome.id, profil.profil);
      } catch (err) {
        console.error('[AerodromeDetail] Échec init profil risque:', err);
      }
    })();
  }, [aerodrome.id, profilRisque, setProfilRisque, aerodrome]);

  // Données réelles depuis le store
  const realDocuments = useMemo(() => {
    const docs: Array<{ id: string; titre: string; type: string; date: string; uploader: string }> = [];
    certifications?.forEach((c: Certification) => {
      if (c.aerodrome_id === aerodrome.id) {
        docs.push({ id: c.id, titre: `Certificat Aérodrome ${c.reference}`, type: 'PDF', date: c.created_at, uploader: 'ANACIM' });
      }
    });
    homologations?.forEach((h: Homologation) => {
      if (h.aerodrome_id === aerodrome.id) {
        docs.push({ id: h.id, titre: `Décision Homologation ${h.reference}`, type: 'PDF', date: h.created_at, uploader: 'ANACIM' });
      }
    });
    surveillancesAerodrome.forEach(s => {
      docs.push({ id: s.id, titre: `Rapport Surveillance ${s.type}`, type: 'PDF', date: s.created_at, uploader: s.created_by || 'ANACIM' });
    });
    return docs;
  }, [aerodrome.id, certifications, homologations, surveillancesAerodrome]);

  const [survPage, setSurvPage] = useState(1)
  const [docPage, setDocPage] = useState(1)
  const TABLE_PAGE_SIZE = 10
  const paginatedSurv = useMemo(() => {
    const start = (survPage - 1) * TABLE_PAGE_SIZE
    return surveillancesAerodrome.slice(start, start + TABLE_PAGE_SIZE)
  }, [surveillancesAerodrome, survPage])
  const paginatedDocs = useMemo(() => {
    const start = (docPage - 1) * TABLE_PAGE_SIZE
    return realDocuments.slice(start, start + TABLE_PAGE_SIZE)
  }, [realDocuments, docPage])

  const realHistorique = useMemo(() => {
    const events: Array<{ id: string; date: string; action: string; utilisateur: string; details: string }> = [];
    surveillancesAerodrome.forEach(s => {
      events.push({ id: s.id, date: s.created_at, action: 'Surveillance', utilisateur: s.created_by || 'Système', details: `${s.type} - ${(s as { objectifs?: string }).objectifs?.substring(0, 50) || ''}...` });
    });
    ecarts.filter(e => e.aerodrome_id === aerodrome.id).forEach(e => {
      events.push({ id: e.id, date: e.created_at, action: `Écart ${e.niveau_risque}`, utilisateur: 'Système', details: e.libelle?.substring(0, 50) || '' });
    });
    historiqueScoresAerodrome.forEach((h: ScoreHistoryPoint, idx: number) => {
      events.push({ id: `hist-${idx}`, date: h.date, action: 'Mise à jour score', utilisateur: 'Système', details: `Score: ${h.score}/100` });
    });
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);
  }, [aerodrome.id, surveillancesAerodrome, ecarts, historiqueScoresAerodrome]);


  return (
    <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary" data-role={userRole}>
      {/* En-tête */}
      <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
        <div className="modal-title">
          {aerodrome.type_entite === 'helistation'
            ? <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🚁</span>
            : aerodrome.type_entite === 'mixte'
              ? <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>✈🚁</span>
              : <Plane className="w-5 h-5 text-role-primary" />
          }
          <div>
            <span>{aerodrome.nom}</span>
            <span className="modal-subtitle">{aerodrome.code_oaci}</span>
          </div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Fermer"><X className="w-4 h-4" /></button>
      </div>

      {/* Badges */}
      <div className="px-6 py-3 bg-background border-b border-border flex items-center gap-2 flex-wrap">
        <AerodromeTypeBadge type={aerodrome.type} typeEntite={aerodrome.type_entite} />
        <AerodromeTypeEntiteBadge typeEntite={aerodrome.type_entite} />
        <AerodromeStatutBadge statut={aerodrome.statut} />
        {profilRisque && <NiveauRisqueBadge niveau={profilRisque.niveau} score={profilRisque.score_global} />}
        {aerodrome.statut_sgs === 'non_applicable' && (
          <span className="badge neutral text-[10px]">SGS non applicable</span>
        )}
      </div>

      {/* Vue unifiée Admin/Inspecteur — pas d'onglets */}
      {isAdminOrInspector(userRole) ? (
        <div className="modal-body bg-background px-6 py-5">
          <AdminInspecteurDashboard
            aerodrome={aerodrome}
            iaAnalysis={iaAnalysis}
            isLoadingIA={isLoadingIA}
          />
        </div>
      ) : (<>
      {/* Onglets pour les autres rôles */}
      <div className="tabs border-b border-border px-6 pt-4 bg-background">
        {[
          { id: 'info', label: 'Infos', icon: Plane },
          { id: 'risque', label: 'Profil Risque', icon: Gauge },
          { id: 'technique', label: 'Technique', icon: Ruler },
          { id: 'certification', label: 'Cert/Homo', icon: Shield },
          { id: 'surveillances', label: 'Surveillances', icon: Eye },
          { id: 'documents', label: 'Documents', icon: FileText },
          { id: 'historique', label: 'Historique', icon: History },
          { id: 'aerorisq', label: 'AERORISQ', icon: Brain }
        ].map(tab => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`tab py-2 px-4 ${activeTab === tab.id ? 'border-b-2 border-role-primary text-role-primary font-semibold' : 'text-muted-foreground'}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon className="h-4 w-4 inline mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="modal-body bg-background">
        {/* ==================== ONGLET INFOS ==================== */}
{activeTab === 'info' && (
          <OngletInfo
            aerodrome={aerodrome}
            personnelAerodrome={personnelAerodrome}
            codesActifsAerodrome={codesActifsAerodrome}
            ecartsCount={ecartsCount}
            nbSurveillances={surveillancesAerodrome.length}
          />
        )}

        {/* ==================== ONGLET RISQUE AVEC IA ==================== */}
{activeTab === 'risque' && (
          <OngletRisque
            aerodrome={aerodrome}
            profilRisque={profilRisque}
            iaAnalysis={iaAnalysis}
            isLoadingIA={isLoadingIA}
          />
        )}

        {/* ==================== ONGLET TECHNIQUE ==================== */}
{activeTab === 'technique' && (
          <OngletTechnique aerodrome={aerodrome} />
        )}

        {/* ==================== ONGLET CERTIFICATION/HOMOLOGATION ==================== */}
{activeTab === 'certification' && (
          <OngletCertification aerodrome={aerodrome} />
        )}

        {/* ==================== ONGLET SURVEILLANCES ==================== */}
{activeTab === 'surveillances' && (
          <OngletSurveillances
            data={paginatedSurv}
            total={surveillancesAerodrome.length}
            page={survPage}
            onPageChange={setSurvPage}
            pageSize={TABLE_PAGE_SIZE}
            ecarts={ecarts}
          />
        )}

        {/* ==================== ONGLET DOCUMENTS ==================== */}
{activeTab === 'documents' && (
          <OngletDocuments
            data={paginatedDocs}
            total={realDocuments.length}
            page={docPage}
            onPageChange={setDocPage}
            pageSize={TABLE_PAGE_SIZE}
          />
        )}

        {/* ==================== ONGLET HISTORIQUE ==================== */}
{activeTab === 'historique' && (
          <OngletHistorique historique={realHistorique} />
        )}

        {/* ==================== ONGLET AERORISQ ==================== */}
{activeTab === 'aerorisq' && (
          <OngletAerorisq aerodromeId={aerodrome.id} />
        )}
      </div>
    </>)}
      {/* Pied avec actions */}
      <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
        <button onClick={onClose} className="btn btn-secondary gap-2">
          <X className="h-4 w-4" />Fermer
        </button>
        <button onClick={onEdit} className="btn btn-primary gap-2">
          <Edit3 className="h-4 w-4" />Modifier
        </button>
      </div>
    </div>
  );
}