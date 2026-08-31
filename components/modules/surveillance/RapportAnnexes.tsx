// components/modules/surveillance/RapportAnnexes.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Eye,
  ChevronDown,
  Users,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Copy,
  BarChart3,
  UserCheck,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore, type PresenceEntry } from '@/lib/store';
import { getCellColor } from '@/lib/risque';
import { getSgsMaturiteLabel } from '@/lib/utils';
import { PresenceSheet } from './PresenceSheet';

// ============================================================
// ANNEXE A-1 : FICHES DE PRÉSENCE
// ============================================================

function AnnexePresence({ surveillanceId, readOnly }: { surveillanceId: string; readOnly: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const getFichesBySurveillance = useAppStore(s => s.getFichesBySurveillance);
  // Souscription réactive au store : si les fiches changent (ajout/édition/signature)
  // pendant que le composant est monté, la liste se met à jour sans rechargement.
  const presences = getFichesBySurveillance?.(surveillanceId) || [];

  const stats = {
    total: presences.length,
    anacim: presences.filter(p => p.structure === 'ANACIM').length,
    exploitant: presences.filter(p => p.structure === 'EXPLOITANT').length,
    signees: presences.filter(p => p.signature_url).length,
  };

  const handleCopyTable = () => {
    let csv = 'Nom,Structure,Fonction,Téléphone,Email,Signature\n';
    presences.forEach(p => {
      csv += `${p.prenom_nom},${p.structure},${p.fonction},${p.telephone},${p.email},${p.signature_url ? 'Signé' : 'Non signé'}\n`;
    });
    navigator.clipboard.writeText(csv);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Tableau copié',
      message: 'Le tableau des présences a été copié',
      canal: 'in_app',
    });
  };

  const handleExportPresences = () => {
    const csv = [
      ['Nom', 'Structure', 'Fonction', 'Téléphone', 'Email', 'Signature', 'Date signature'],
      ...presences.map(p => [
        p.prenom_nom,
        p.structure,
        p.fonction,
        p.telephone,
        p.email,
        p.signature_url ? 'Signé' : 'Non signé',
        p.signature_date ? new Date(p.signature_date).toLocaleDateString('fr-FR') : '',
      ]),
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presences_${surveillanceId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Export effectué',
      message: 'La liste des présences a été exportée',
      canal: 'in_app',
    });
  };

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <Users className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-1: Fiches de présence</span>
          <span className="badge outline text-xs">{stats.total} participant(s)</span>
          <span className="badge success text-xs">{stats.signees}/{stats.total} signé(s)</span>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyTable(); }}
                className="action-button"
                title="Copier le tableau"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleExportPresences(); }}
                className="action-button"
                title="Exporter CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          {readOnly ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 bg-primary-soft rounded-lg">
                  <div className="text-lg font-bold text-primary">{stats.anacim}</div>
                  <div className="text-xs text-muted-foreground">ANACIM</div>
                </div>
                <div className="text-center p-2 bg-warning-soft rounded-lg">
                  <div className="text-lg font-bold text-warning">{stats.exploitant}</div>
                  <div className="text-xs text-muted-foreground">Exploitant</div>
                </div>
                <div className="text-center p-2 bg-success-soft rounded-lg">
                  <div className="text-lg font-bold text-success">{stats.signees}</div>
                  <div className="text-xs text-muted-foreground">Signatures</div>
                </div>
              </div>

              <DataTable
                data={presences}
                columns={[
                  { key: 'nom', header: 'Nom complet', render: (p) => <span className="font-medium text-foreground">{p.prenom_nom || '-'}</span> },
                  { key: 'structure', header: 'Structure', render: (p) => (
                    <span className={`badge ${p.structure === 'ANACIM' ? 'primary' : p.structure === 'EXPLOITANT' ? 'warning' : 'neutral'}`}>
                      {p.structure}
                    </span>
                  )},
                  { key: 'fonction', header: 'Fonction', render: (p) => <span className="text-muted-foreground">{p.fonction || '-'}</span> },
                  { key: 'telephone', header: 'Téléphone', render: (p) => <span className="text-muted-foreground">{p.telephone || '-'}</span> },
                  { key: 'email', header: 'Email', render: (p) => <span className="text-muted-foreground">{p.email || '-'}</span> },
                  { key: 'signature', header: 'Signature', render: (p) => p.signature_url ? (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-success" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(p.signature_date).toLocaleDateString('fr-FR')}
                      </span>
                      <button className="action-button" onClick={() => window.open(p.signature_url, '_blank')} title="Voir signature">
                        <Eye className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-danger text-xs">Non signé</span>
                  )},
                ]}
                keyExtractor={(p) => p.id}
                emptyState={{ icon: Users, title: 'Aucune fiche de présence disponible', description: 'Utilisez le composant PresenceSheet pour ajouter des participants' }}
              />
            </>
          ) : (
            <PresenceSheet
              surveillanceId={surveillanceId}
              userRole="inspector"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANNEXE A-2 : ÉCARTS CONSTATÉS (avec vérification de cohérence)
// ============================================================

function AnnexeEcarts({ surveillanceId }: { surveillanceId: string }) {
  const [expanded, setExpanded] = useState(true);
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes = useAppStore(s => s.aerodromes);
  const getEcartsEffectifs = useAppStore(s => s.getEcartsEffectifsSurveillance);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);
  const sigs = surveillance?.signatures_ecarts || [];

  // Pendant la rédaction les écarts vivent dans `ecartsRedaction` (brouillons) ;
  // on lit donc les écarts « effectifs » (brouillons normalisés) pour que
  // l'annexe A-2 affiche les écarts avant même la transmission.
  const realEcarts = useMemo(
    () => getEcartsEffectifs(surveillanceId),
    [getEcartsEffectifs, surveillanceId]
  );
  const displayedEcarts = realEcarts;

  const stats = {
    total: displayedEcarts.length,
    critiques: displayedEcarts.filter(e => e.niveau_risque === 'critique').length,
    eleves: displayedEcarts.filter(e => e.niveau_risque === 'eleve').length,
    moyens: displayedEcarts.filter(e => e.niveau_risque === 'moyen').length,
    faibles: displayedEcarts.filter(e => e.niveau_risque === 'faible').length,
    clos: displayedEcarts.filter(e => e.statut === 'cloture').length,
  };

  const getNiveauBadge = (niveau: string) => {
    switch (niveau) {
      case 'critique': return 'badge danger animate-pulse';
      case 'eleve': return 'badge eleve';
      case 'moyen': return 'badge moyen';
      default: return 'badge neutral';
    }
  };

  const handleCopyTable = () => {
    let csv = 'Référence,Réf. réglementaire,Libellé,Niveau,Statut\n';
    displayedEcarts.forEach(e => {
      csv += `${e.reference},${e.ref_reglementaire},"${e.libelle}",${e.niveau_risque},${e.statut}\n`;
    });
    navigator.clipboard.writeText(csv);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Tableau copié',
      message: 'Le tableau des écarts a été copié',
      canal: 'in_app',
    });
  };

  const handleExportEcarts = () => {
    const csv = [
      ['Référence', 'Réf. réglementaire', 'Libellé', 'Niveau', 'Statut', 'Créé le', 'Délai régularisation'],
      ...displayedEcarts.map(e => [
        e.reference,
        e.ref_reglementaire,
        e.libelle,
        e.niveau_risque,
        e.statut,
        new Date(e.created_at).toLocaleDateString('fr-FR'),
        e.delai_regularisation ? new Date(e.delai_regularisation).toLocaleDateString('fr-FR') : '',
      ]),
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecarts_${surveillanceId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Export effectué',
      message: 'La liste des écarts a été exportée',
      canal: 'in_app',
    });
  };

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <AlertTriangle className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-2: Écarts constatés</span>
          <span className="badge outline text-xs">{stats.total} écart(s)</span>
          {stats.critiques > 0 && (
            <span className="badge danger animate-pulse text-xs">{stats.critiques} critique(s)</span>
          )}
          <span className="badge success text-xs">{stats.clos} clôturé(s)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleCopyTable(); }}
            className="action-button"
            title="Copier le tableau"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleExportEcarts(); }}
            className="action-button"
            title="Exporter CSV"
          >
            <Download className="w-4 h-4" />
          </button>
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="grid grid-cols-5 gap-2 mb-4">
            <div className="text-center p-2 bg-danger-soft rounded-lg">
              <div className="text-lg font-bold text-danger">{stats.critiques}</div>
              <div className="text-xs text-muted-foreground">Critique</div>
            </div>
            <div className="text-center p-2 bg-warning-soft rounded-lg">
              <div className="text-lg font-bold text-warning">{stats.eleves}</div>
              <div className="text-xs text-muted-foreground">Élevé</div>
            </div>
            <div className="text-center p-2 bg-primary-soft rounded-lg">
              <div className="text-lg font-bold text-primary">{stats.moyens}</div>
              <div className="text-xs text-muted-foreground">Moyen</div>
            </div>
            <div className="text-center p-2 bg-gray-100 rounded-lg">
              <div className="text-lg font-bold text-gray-600">{stats.faibles}</div>
              <div className="text-xs text-muted-foreground">Faible</div>
            </div>
            <div className="text-center p-2 bg-success-soft rounded-lg">
              <div className="text-lg font-bold text-success">{stats.clos}</div>
              <div className="text-xs text-muted-foreground">Clôturés</div>
            </div>
          </div>

          {displayedEcarts.length > 0 ? (
            <div className="rapport-ecarts-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Référence</TableHead>
                    <TableHead>Libellé / constat</TableHead>
                    <TableHead className="w-24">Niveau</TableHead>
                    <TableHead className="w-36">Indice OACI</TableHead>
                    <TableHead className="w-40">Réf. réglementaire</TableHead>
                    <TableHead className="w-40">Signataire</TableHead>
                    <TableHead className="w-24">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedEcarts.map((ecart) => {
                    const sig = sigs.find(s => s.signataire_id === ecart.inspecteur_ref_id) || sigs[sigs.length - 1];
                    return (
                      <TableRow key={ecart.id}>
                        <TableCell className="font-semibold text-foreground align-top">{ecart.reference}</TableCell>
                        <TableCell className="align-top">
                          <p className="text-sm text-foreground leading-relaxed">{ecart.libelle}</p>
                          {ecart.ref_reglementaire && (
                            <p className="text-xs text-muted-foreground mt-1">
                              OACI : {aerodrome?.code_oaci || 'N/A'} · {surveillance?.date_fin
                                ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR')
                                : 'N/A'}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <span className={getNiveauBadge(ecart.niveau_risque)}>{ecart.niveau_risque}</span>
                        </TableCell>
                        <TableCell className="align-top">
                          {ecart.cellule_risque_oaci ? (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center justify-center rounded font-bold text-xs px-2 py-0.5 font-mono tracking-wider ${getCellColor(ecart.cellule_risque_oaci)}`}>
                                {ecart.cellule_risque_oaci}
                              </span>
                              {ecart.probabilite_risque && ecart.gravite_risque && (
                                <span className="text-xs text-muted-foreground">
                                  P{ecart.probabilite_risque}×G{ecart.gravite_risque}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top">{ecart.ref_reglementaire}</TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-sm text-foreground">
                              {sig?.signataire_nom || 'Inspecteur non renseigné'}
                            </span>
                          </div>
                          {sig?.signature_url ? (
                            <img
                              src={sig.signature_url}
                              alt="Signature"
                              className="h-8 w-auto object-contain mt-1"
                            />
                          ) : (
                            <div className="h-8 w-20 border border-dashed border-border rounded flex items-center justify-center text-xs text-muted-foreground mt-1">
                              Signé
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top whitespace-nowrap">
                          {new Date(ecart.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-success" />
              <p className="text-sm">Aucun écart constaté</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANNEXE A-3 : PROFIL DE RISQUE (avec vérification de cohérence)
// ============================================================

function AnnexeProfilRisque({ aerodromeId, readOnly }: { aerodromeId: string; readOnly: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const profil = profilsRisque[aerodromeId];

  const getNiveauConfig = (score: number) => {
    if (score >= 80) return { label: 'Excellent', color: 'text-success', bg: 'bg-success-soft', badge: 'success' };
    if (score >= 60) return { label: 'Bon', color: 'text-primary', bg: 'bg-primary-soft', badge: 'primary' };
    if (score >= 30) return { label: 'Modéré', color: 'text-warning', bg: 'bg-warning-soft', badge: 'warning' };
    return { label: 'Critique', color: 'text-danger', bg: 'bg-danger-soft', badge: 'danger' };
  };

  const getTendanceIcon = () => {
    if (profil?.tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-success" />;
    if (profil?.tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-danger animate-pulse" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getProgressClass = (score: number) => {
    if (score >= 80) return 'progress-faible';
    if (score >= 60) return 'progress-moyen';
    if (score >= 30) return 'progress-eleve';
    return 'progress-critique';
  };

  const niveauConfig = profil ? getNiveauConfig(profil.score_global) : null;

  const critereLabels: Record<string, string> = {
    c1: 'Maturité SGS',
    c2: 'Efficacité des PAC',
    c3: 'Conformité réglementaire',
    c4: 'Charge critique',
    c5: 'Résilience',
  };
  const minCritere = profil
    ? ([
        { key: 'c1', label: critereLabels.c1, value: profil.c1 },
        { key: 'c2', label: critereLabels.c2, value: profil.c2 },
        { key: 'c3', label: critereLabels.c3, value: profil.c3 },
        { key: 'c4', label: critereLabels.c4, value: profil.c4 },
        { key: 'c5', label: critereLabels.c5, value: profil.c5 },
      ] as { key: string; label: string; value: number }[]).sort((a, b) => a.value - b.value)[0]
    : { key: 'c5', label: 'Résilience', value: 0 };

  if (!profil) {
    return (
      <div className="accordion mb-4">
        <button
          className="accordion-trigger w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-role-primary" />
            <span className="font-semibold text-foreground">Annexe A-3: Profil de risque</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="accordion-content text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Profil de risque non disponible</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <BarChart3 className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-3: Profil de risque</span>
          <span className={`badge ${niveauConfig?.badge}`}>{niveauConfig?.label}</span>
          <div className="flex items-center gap-1">
            {getTendanceIcon()}
            <span className={`text-xs capitalize ${profil.tendance === 'baisse' ? 'text-danger' : profil.tendance === 'hausse' ? 'text-success' : ''}`}>
              {profil.tendance}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-foreground">Score global</span>
            <span className={`text-2xl font-bold ${niveauConfig?.color}`}>{profil.score_global}/100</span>
          </div>
          <div className="progress h-2 mb-4">
            <div className={`progress-bar ${getProgressClass(profil.score_global)}`} style={{ width: `${profil.score_global}%` }} />
          </div>

          <div className="mb-5 p-3 rounded-lg border border-border/60 bg-white">
            <p className="text-sm text-foreground leading-relaxed">
              Le niveau de risque global de cet aérodrome est
              <strong className="text-foreground"> {niveauConfig?.label.toLowerCase()} </strong>avec un score de{' '}
              <strong className="text-foreground">{profil.score_global}/100</strong>
              {profil.tendance === 'hausse' ? ' , en amélioration par rapport aux calculs précédents (tendance haussière).' :
                profil.tendance === 'baisse' ? ' , en dégradation (tendance baissière) : une attention particulière est requise.' :
                ' , stable par rapport aux calculs précédents.'}
            </p>
            <p className="text-sm text-foreground leading-relaxed mt-2">
              Le critère le plus fragilisant est la{' '}
              <strong className="text-foreground">{minCritere.label}</strong> (score {minCritere.value}/100) : c'est sur ce
              point que les actions de remédiation devraient être priorisées.
            </p>
            {typeof profil.prediction_3m === 'number' && (
              <p className="text-sm text-foreground leading-relaxed mt-2">
                À 3 mois, le score projeté est de <strong className="text-foreground">{profil.prediction_3m}/100</strong>
                {typeof profil.prediction_6m === 'number' && <> et de <strong className="text-foreground">{profil.prediction_6m}/100</strong> à 6 mois</>},
                ce qui permet d'anticiper l'évolution du niveau de risque.
              </p>
            )}
          </div>

          <div className="space-y-4 mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Analyse détaillée par critère</p>
            {[
              { key: 'c1', label: 'C1 — Maturité SGS', value: profil.c1,
                interp: profil.c1 >= 80 ? 'Votre système de gestion de la sécurité est mature et pleinement opérationnel : procédures documentées, comprises et appliquées par tous.' :
                  profil.c1 >= 60 ? 'Votre SGS est opérationnel mais perfectible. Renforcez la documentation des procédures et la formation continue du personnel.' :
                  profil.c1 >= 30 ? 'Votre SGS est partiellement déployé. Priorités : formaliser votre politique sécurité, nommer un responsable SGS, structurer le traitement des événements de sécurité.' :
                  'Votre SGS est insuffisant ou inexistant. Une structure minimale (politique de sécurité, responsabilités, procédures écrites) est requise d\'urgence pour la conformité réglementaire.' },
              { key: 'c2', label: 'C2 — Efficacité des PAC', value: profil.c2,
                interp: profil.c2 >= 80 ? 'Vos actions correctives sont traitées dans les délais et leur efficacité fait l\'objet d\'une vérification systématique.' :
                  profil.c2 >= 60 ? 'Le suivi des PAC est globalement correct mais des retards ponctuels existent. Renforcez la traçabilité des clôtures et les relances.' :
                  profil.c2 >= 30 ? 'Trop de PAC ne sont pas clôturés dans les délais impartis. Mettez en place un tableau de bord de suivi et désignez des responsables par écart.' :
                  'Le suivi des PAC est quasi inexistant. Action prioritaire : établir un processus formel de traitement et de suivi des actions correctives avec échéances.' },
              { key: 'c3', label: 'C3 — Conformité réglementaire', value: profil.c3,
                interp: profil.c3 >= 80 ? 'Votre niveau de conformité est satisfaisant. Maintenez la veille réglementaire et les auto-évaluations périodiques.' :
                  profil.c3 >= 60 ? 'Des écarts de conformité existent mais ne sont pas critiques. Planifiez leur résolution par ordre de priorité (échéances, criticité).' :
                  profil.c3 >= 30 ? 'Plusieurs non-conformités réglementaires nécessitent une attention immédiate. Réalisez un audit interne systématique pour les identifier et les traiter.' :
                  'Le niveau de conformité réglementaire est préoccupant. Une action corrective globale et structurée est nécessaire pour éviter des mesures de suspension.' },
              { key: 'c4', label: 'C4 — Charge critique', value: profil.c4,
                interp: profil.c4 >= 80 ? 'La charge de travail et les facteurs de risque humains sont bien maîtrisés. Poursuivez la surveillance.' :
                  profil.c4 >= 60 ? 'Quelques facteurs de charge critique sont présents. Surveillez les pics d\'activité, les rotations de personnel et la charge mentale.' :
                  profil.c4 >= 30 ? 'La charge critique est élevée. Évaluez les risques de fatigue, l\'adéquation des effectifs et la répartition des tâches opérationnelles.' :
                  'La charge critique est excessive, augmentant le risque d\'erreur humaine. Réorganisez les plannings, renforcez les effectifs et réduisez les tâches simultanées.' },
              { key: 'c5', label: 'C5 — Résilience', value: profil.c5,
                interp: profil.c5 >= 80 ? 'Votre organisation est résiliente : capacité démontrée à absorber et à se remettre des perturbations.' :
                  profil.c5 >= 60 ? 'La résilience est correcte mais des scénarios de continuité d\'activité doivent être formalisés et testés.' :
                  profil.c5 >= 30 ? 'La capacité de réaction face aux imprévus est limitée. Élaborez un plan de continuité d\'activité et organisez des exercices.' :
                  'Votre organisation est fragile face aux perturbations. Un plan de continuité d\'activité détaillé est urgent, accompagné de formations aux procédures d\'urgence.' },
            ].map(crit => {
              const critConfig = getNiveauConfig(crit.value);
              return (
                <div key={crit.key} className="p-3 rounded-lg border border-border/60 bg-white">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-mono font-bold text-muted-foreground w-8">{crit.key.toUpperCase()}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium text-foreground">{crit.label}</span>
                        <span className={`text-sm font-bold ${critConfig.color}`}>{crit.value}/100{crit.key === 'c1' && <span className="text-xs text-muted-foreground font-normal ml-1">({getSgsMaturiteLabel(crit.value)})</span>}</span>
                      </div>
                      <div className="progress h-1.5">
                        <div className={`progress-bar ${getProgressClass(crit.value)}`} style={{ width: `${crit.value}%` }} />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pl-10">{crit.interp}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground">Dernier calcul du profil</p>
            <p className="text-sm">{new Date(profil.computed_at).toLocaleString('fr-FR')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

interface RapportAnnexesProps {
  surveillanceId: string;
  onExport?: (format: string) => void;
  readOnly?: boolean;
  userRole?: string;
}

export function RapportAnnexes({
  surveillanceId,
  onExport,
  readOnly = false,
  userRole = 'inspector',
}: RapportAnnexesProps) {
  const surveillances = useAppStore(s => s.surveillances);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const aerodromes = useAppStore(s => s.aerodromes);
  const addNotification = useAppStore(s => s.addNotification);
  const user = useAppStore(s => s.user);
  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodromeId = surveillance?.aerodrome_id;
  const aerodrome = aerodromes.find(a => a.id === aerodromeId);
  const profil = aerodromeId ? profilsRisque[aerodromeId] : undefined;

  const [expandedSections, setExpandedSections] = useState<string[]>(['A1', 'A2', 'A3']);
  const [expandedAll, setExpandedAll] = useState(true);
  const [exportingAnnexes, setExportingAnnexes] = useState(false);

  const handleExportDocx = async () => {
    setExportingAnnexes(true);
    try {
      const { exportAnnexeDOCX } = await import('@/lib/services/rapportAnnexeService');
      const realEcarts = useAppStore.getState().getEcartsEffectifsSurveillance(surveillanceId);
      const fichesPresence = useAppStore.getState().getFichesBySurveillance(surveillanceId);
      const niveauLabel = (s: number) => s >= 80 ? 'Bon' : s >= 60 ? 'Moyen' : s >= 30 ? 'Faible' : 'Critique';

      await exportAnnexeDOCX({
        aerodrome_nom: aerodrome?.nom || '',
        aerodrome_code: aerodrome?.code_oaci || '',
        reference: `${aerodrome?.code_oaci || 'XXX'}_${new Date().getFullYear()}_ANNEXES`,
        date_debut: surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A',
        date_fin: surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A',
        date_profil: new Date().toLocaleDateString('fr-FR'),
        presences: fichesPresence.map(f => ({
          nom_presence: f.prenom_nom,
          structure_presence: f.structure,
          fonction_presence: f.fonction,
          tel_presence: f.telephone,
          signature_presence: f.signature_date ? `Signé le ${new Date(f.signature_date).toLocaleDateString('fr-FR')}` : '',
        })),
        nb_ecarts: realEcarts.length,
        ecarts_liste: realEcarts.map(e => ({
          ref_ecart: e.reference,
          domaine_ecart: e.domaine,
          constat_ecart: e.libelle,
          niveau_ecart: e.niveau_risque,
          statut_ecart: e.statut,
        })),
        score_global: profil ? `${profil.score_global}/100` : 'N/A',
        tendance: profil?.tendance || 'N/A',
        prediction_3m: profil?.prediction_3m != null ? `${profil.prediction_3m}/100` : 'N/A',
        prediction_6m: profil?.prediction_6m != null ? `${profil.prediction_6m}/100` : 'N/A',
        c1_score: profil ? `${profil.c1}/100` : 'N/A',
        c1_niveau: profil ? niveauLabel(profil.c1) : 'N/A',
        c2_score: profil ? `${profil.c2}/100` : 'N/A',
        c2_niveau: profil ? niveauLabel(profil.c2) : 'N/A',
        c3_score: profil ? `${profil.c3}/100` : 'N/A',
        c3_niveau: profil ? niveauLabel(profil.c3) : 'N/A',
        c4_score: profil ? `${profil.c4}/100` : 'N/A',
        c4_niveau: profil ? niveauLabel(profil.c4) : 'N/A',
        c5_score: profil ? `${profil.c5}/100` : 'N/A',
        c5_niveau: profil ? niveauLabel(profil.c5) : 'N/A',
        analyse_profil: profil
          ? `Score global: ${profil.score_global}/100 (${profil.niveau}). C1: ${profil.c1}/100, C2: ${profil.c2}/100, C3: ${profil.c3}/100, C4: ${profil.c4}/100, C5: ${profil.c5}/100. Tendance: ${profil.tendance}.`
          : 'Non disponible.',
        domaines_checklist: [],
        taux_global: '0%',
        sa_total: 0,
        ns_total: 0,
        nv_total: 0,
        total_items: 0,
      });

      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Annexes exportées',
        message: 'Le document des annexes a été généré au format Word.',
        canal: 'in_app',
      });
    } catch (err) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Erreur lors de l\'export des annexes',
        canal: 'in_app',
      });
    } finally {
      setExportingAnnexes(false);
    }
  };

  const toggleAll = () => {
    setExpandedAll(!expandedAll);
    if (!expandedAll) {
      setExpandedSections(['A1', 'A2', 'A3']);
    } else {
      setExpandedSections([]);
    }
  };

  const handleExportZip = () => {
    if (onExport) {
      onExport('zip');
    } else {
      const data = {
        surveillanceId,
        exported_at: new Date().toISOString(),
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `annexes_${surveillanceId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-4" data-role={userRole}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-role-primary" />
          <h3 className="font-semibold text-foreground">Annexes du rapport</h3>
          <span className="badge outline text-xs">A-1, A-2, A-3</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleAll} className="btn btn-secondary btn-sm gap-1">
            {expandedAll ? 'Tout réduire' : 'Tout déployer'}
          </button>
          <button onClick={handleExportZip} className="btn btn-secondary btn-sm gap-1">
            Télécharger
          </button>
          <button onClick={handleExportDocx} disabled={exportingAnnexes} className="btn btn-primary btn-sm gap-1">
            {exportingAnnexes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exporter DOCX
          </button>
        </div>
      </div>

      {expandedSections.includes('A1') && (
        <AnnexePresence surveillanceId={surveillanceId} readOnly={readOnly} />
      )}

      {expandedSections.includes('A2') && (
        <AnnexeEcarts surveillanceId={surveillanceId} />
      )}

      {expandedSections.includes('A3') && aerodromeId && (
        <AnnexeProfilRisque aerodromeId={aerodromeId} readOnly={readOnly} />
      )}

      {expandedSections.length === 0 && (
        <Card className="text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune annexe sélectionnée</p>
          <p className="text-xs mt-1">Cliquez sur "Tout déployer" pour afficher les annexes</p>
        </Card>
      )}
    </div>
  );
}

export default RapportAnnexes;
