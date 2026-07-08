'use client';

import { useState, useMemo } from 'react';
import { Calendar, Clock, User, Flame, AlertCircle, CheckCircle2, PlayCircle, Eye } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { chargeUtils, Tache } from '@/lib/chargeUtils';

const STATUT_SECTIONS = [
  { key: 'en_retard', label: 'En retard', border: 'border-danger/30', bg: 'bg-danger/5', badge: 'badge danger animate-pulse' },
  { key: 'en_cours',  label: 'En cours',  border: 'border-primary/30', bg: 'bg-role-primary-soft', badge: 'badge primary' },
  { key: 'a_faire',   label: 'À faire',   border: 'border-border', bg: 'bg-muted/20', badge: 'badge neutral' },
  { key: 'termine',   label: 'Terminé',   border: 'border-success/30', bg: 'bg-success/5', badge: 'badge success' },
] as const;

const PRIORITE_CONFIG: Record<string, { label: string; className: string }> = {
  critique: { label: 'Critique', className: 'badge danger animate-pulse' },
  haute:    { label: 'Haute',    className: 'badge warning' },
  moyenne:  { label: 'Moyenne',  className: 'badge primary' },
  basse:    { label: 'Basse',    className: 'badge neutral' },
};

const getStatutBadge = (statut: string) => {
  const v: Record<string, { label: string; className: string }> = {
    a_faire:   { label: 'À faire',   className: 'badge neutral' },
    en_cours:  { label: 'En cours',  className: 'badge primary' },
    termine:   { label: 'Terminé',   className: 'badge success' },
    en_retard: { label: 'En retard', className: 'badge danger animate-pulse' },
  };
  return v[statut] || v.a_faire;
};

interface TachesAccordeonProps {
  userRole: string;
  userId: string;
}

export function TachesAccordeon({ userRole, userId }: TachesAccordeonProps) {
  const surveillances = useAppStore(s => s.surveillances);
  const ecarts = useAppStore(s => s.ecarts);
  const evenements = useAppStore(s => s.evenements);
  const dossiers = useAppStore(s => s.dossiers);
  const formations = useAppStore(s => s.formations);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const updateEcart = useAppStore(s => s.updateEcart);
  const updateEvenement = useAppStore(s => s.updateEvenement);
  const updateDossier = useAppStore(s => s.updateDossier);
  const updateFormation = useAppStore(s => s.updateFormation);
  const addNotification = useAppStore(s => s.addNotification);

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['en_retard', 'en_cours']));

  const toutesTaches = useMemo(() => {
    const taches: Tache[] = [];

    surveillances?.forEach(s => {
      if (s.equipe_ids?.length) {
        s.equipe_ids.forEach(inspId => {
          const t = chargeUtils.surveillanceVersTache(s, aerodromes);
          taches.push({ ...t, id: `${t.id}-${inspId}` });
        });
      }
    });

    ecarts?.forEach(e => {
      if (e.inspecteur_ref_id) {
        taches.push({ ...chargeUtils.ecartVersTache(e, aerodromes), lien_id: e.inspecteur_ref_id });
      }
      const tachePAC = chargeUtils.ecartVersTacheEvaluationPAC(e, aerodromes)
      if (tachePAC && e.inspecteur_ref_id) {
        taches.push({ ...tachePAC, lien_id: e.inspecteur_ref_id })
      }
      const tachePreuves = chargeUtils.ecartVersTacheValidationPreuves(e, aerodromes)
      if (tachePreuves && e.inspecteur_ref_id) {
        taches.push({ ...tachePreuves, lien_id: e.inspecteur_ref_id })
      }
    });

    evenements?.forEach(e => {
      if (e.inspecteur_id) {
        taches.push({ ...chargeUtils.evenementVersTache(e, aerodromes), lien_id: e.inspecteur_id });
      }
    });

    dossiers?.forEach(d => {
      if (d.inspecteur_id) {
        taches.push({ ...chargeUtils.dossierVersTache(d, aerodromes), lien_id: d.inspecteur_id });
      }
    });

    formations?.forEach(f => {
      (f.participants || []).forEach(inspId => {
        if (f.statut === 'planifiee' || f.statut === 'en_cours') {
          taches.push({
            id: `fmt-${f.id}-${inspId}`,
            type: 'formation',
            titre: `Formation : ${f.titre}`,
            description: f.objectifs || '',
            priorite: 'moyenne',
            statut: f.statut === 'planifiee' ? 'a_faire' : 'en_cours',
            date_echeance: f.date,
            date_debut: f.date,
            temps_estime: f.duree_heures,
            temps_passe: 0,
            progression: 0,
            aerodrome_id: undefined,
            lien_id: inspId,
          });
        }
      });
    });

    return taches;
  }, [surveillances, ecarts, evenements, dossiers, formations, aerodromes]);

  const tachesFiltrees = useMemo(() => {
    return toutesTaches.filter(t => t.lien_id === userId);
  }, [toutesTaches, userId]);

  const grouped = useMemo(() => {
    const g: Record<string, Tache[]> = { en_retard: [], en_cours: [], a_faire: [], termine: [] };
    tachesFiltrees.forEach(t => { if (g[t.statut]) g[t.statut].push(t); else g.a_faire.push(t); });
    return g;
  }, [tachesFiltrees]);

  const toggleSection = (statut: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(statut)) next.delete(statut); else next.add(statut);
      return next;
    });
  };

  const handleMarkTermine = (tache: Tache) => {
    const prefix = tache.id.split('-')[0];
    switch (prefix) {
      case 'surv': {
        const id = tache.id.replace('surv-', '').replace(`-${userId}`, '');
        updateSurveillance(id, { statut: 'transmise', progression: 100 });
        break;
      }
      case 'ecart': {
        const id = tache.id.replace('ecart-', '');
        updateEcart(id, { statut: 'cloture' });
        break;
      }
      case 'evt': {
        const id = tache.id.replace('evt-', '');
        updateEvenement(id, { statut: 'cloture' });
        break;
      }
      case 'dossier': {
        const id = tache.id.replace('dossier-', '');
        updateDossier(id, { statut: 'termine', progression: 100 } as any);
        break;
      }
      case 'fmt': {
        const parts = tache.id.split('-');
        if (parts.length >= 3) {
          parts.pop();
          updateFormation(parts.slice(1).join('-'), { statut: 'terminee' });
        }
        break;
      }
    }
    addNotification({ user_id: userId, type: 'success', title: 'Tâche terminée', message: `${tache.titre} marquée comme terminée.`, canal: 'in_app' });
  };

  return (
    <div className="space-y-4" data-role={userRole} data-module="taches-accordeon">
      <div className="space-y-3">
        {STATUT_SECTIONS.map((section, idx) => {
          const list = grouped[section.key as keyof typeof grouped] || [];
          if (list.length === 0) return null;

          return (
            <div key={section.key} className={`border rounded-xl overflow-hidden ${section.border} animate-fade-up`} style={{ animationDelay: `${idx * 0.1}s` }}>
              <button
                className={`w-full flex items-center justify-between px-5 py-3 text-left transition-colors ${section.bg}`}
                onClick={() => toggleSection(section.key)}
                aria-expanded={openSections.has(section.key)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-foreground">{section.label}</span>
                  <span className={section.badge}>{list.length}</span>
                </div>
                <span className={`text-muted transition-transform duration-200 ${openSections.has(section.key) ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {openSections.has(section.key) && (
                <div className="p-4 space-y-3">
                  {list.map((tache, i) => {
                    const isExpired = new Date(tache.date_echeance) < new Date() && tache.statut !== 'termine' && tache.statut !== 'en_retard';
                    const user = utilisateurs?.find(u => u.id === tache.lien_id);
                    const priorite = PRIORITE_CONFIG[tache.priorite] || PRIORITE_CONFIG.moyenne;
                    const statut = getStatutBadge(tache.statut);

                    return (
                      <div key={tache.id} className={`card ${isExpired ? 'border-l-4 border-l-danger' : ''} animate-fade-up`} style={{ animationDelay: `${i * 0.03}s` }}>
                        <div className="card-content p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <h4 className="font-medium text-foreground text-sm">{tache.titre}</h4>
                                <span className={`${priorite.className} text-[10px]`}>{priorite.label}</span>
                                <span className={`${statut.className} text-[10px]`}>{statut.label}</span>
                                {isExpired && <span className="badge danger animate-pulse text-[10px]"><Flame className="w-2.5 h-2.5" />En retard</span>}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                                <span className="badge outline text-[10px]">{tache.type}</span>
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  <span>Échéance: {new Date(tache.date_echeance).toLocaleDateString('fr-FR')}</span>
                                </div>
                                {user && <div className="flex items-center gap-1"><User className="w-3 h-3" /><span>{user.prenom} {user.nom}</span></div>}
                              </div>
                              {tache.progression > 0 && tache.statut !== 'termine' && (
                                <div className="mt-3">
                                  <div className="flex justify-between text-xs text-muted mb-1"><span>Progression</span><span>{tache.progression}%</span></div>
                                  <div className="progress h-1.5"><div className="progress-bar" style={{ width: `${tache.progression}%` }} /></div>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button className="action-button hover:text-role-primary" title="Voir"><Eye className="w-4 h-4" /></button>
                              {tache.statut !== 'termine' && tache.statut !== 'en_retard' && (
                                <button className="action-button hover:text-success" title="Marquer terminé" onClick={() => handleMarkTermine(tache)}>
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
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
  );
}

export default TachesAccordeon;
