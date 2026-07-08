// components/modules/surveillance/ChecklistStats.tsx
'use client';

import React, { useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  BarChart3,
  PieChart,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { ResultatChecklist } from '@/types/checklist'

export interface ChecklistItemStats {
  id: string;
  domaine: string;
  resultat?: ResultatChecklist;
}

export interface StatsParDomaine {
  domaine: string;
  sa: number;
  ns: number;
  nv: number;
  na: number;
  total: number;
  renseignes: number;
  tauxConformiteClassique: number;
  tauxConformiteReel: number;
  progression: number;
}

export interface StatsGlobales {
  total: number;
  sa: number;
  ns: number;
  nv: number;
  na: number;
  renseignes: number;
  restants: number;
  tauxConformiteClassique: number;
  tauxConformiteReel: number;
  progression: number;
}

export interface ChecklistStatsProps {
  items: ChecklistItemStats[];
  title?: string;
  showDetails?: boolean;
  compact?: boolean;
  onDomaineClick?: (domaine: string) => void;
}

const RESULTAT_COLORS = {
  SA: { bg: 'bg-success', text: 'text-success', icon: CheckCircle2, label: 'Satisfaisant' },
  NS: { bg: 'bg-danger', text: 'text-danger', icon: AlertCircle, label: 'Non satisfaisant' },
  NV: { bg: 'bg-warning', text: 'text-warning', icon: AlertTriangle, label: 'Non vérifié' },
  NA: { bg: 'bg-gray-400', text: 'text-gray-500', icon: MinusCircle, label: 'Non applicable' },
};

/**
 * Calcule les statistiques globales à partir des items
 */
export function calculateStats(items: ChecklistItemStats[]): StatsGlobales {
  const total = items.length;
  const sa = items.filter(i => i.resultat === 'SA').length;
  const ns = items.filter(i => i.resultat === 'NS').length;
  const nv = items.filter(i => i.resultat === 'NV' || !i.resultat).length;
  const na = items.filter(i => i.resultat === 'NA').length;
  const renseignes = sa + ns + na;
  const restants = total - renseignes;

  // Taux de conformité classique (SA / total)
  const tauxConformiteClassique = total > 0 ? Math.round((sa / total) * 100) : 0;

  // Taux de conformité réel (NV = NS, donc SA / (SA + NS + NV))
  const totalReel = sa + ns + nv;
  const tauxConformiteReel = totalReel > 0 ? Math.round((sa / totalReel) * 100) : 0;

  const progression = total > 0 ? Math.round((renseignes / total) * 100) : 0;

  return {
    total,
    sa,
    ns,
    nv,
    na,
    renseignes,
    restants,
    tauxConformiteClassique,
    tauxConformiteReel,
    progression,
  };
}

/**
 * Calcule les statistiques par domaine
 */
export function calculateStatsByDomaine(items: ChecklistItemStats[]): StatsParDomaine[] {
  const domainesMap = new Map<string, StatsParDomaine>();

  items.forEach(item => {
    const domaine = item.domaine || 'Autre';
    if (!domainesMap.has(domaine)) {
      domainesMap.set(domaine, {
        domaine,
        sa: 0,
        ns: 0,
        nv: 0,
        na: 0,
        total: 0,
        renseignes: 0,
        tauxConformiteClassique: 0,
        tauxConformiteReel: 0,
        progression: 0,
      });
    }

    const stats = domainesMap.get(domaine)!;
    stats.total++;

    if (item.resultat === 'SA') stats.sa++;
    else if (item.resultat === 'NS') stats.ns++;
    else if (item.resultat === 'NA') stats.na++;
    else stats.nv++;

    stats.renseignes = stats.sa + stats.ns + stats.na;
    stats.progression = stats.total > 0 ? Math.round((stats.renseignes / stats.total) * 100) : 0;

    const totalReel = stats.sa + stats.ns + stats.nv;
    stats.tauxConformiteReel = totalReel > 0 ? Math.round((stats.sa / totalReel) * 100) : 0;
    stats.tauxConformiteClassique = stats.total > 0 ? Math.round((stats.sa / stats.total) * 100) : 0;
  });

  return Array.from(domainesMap.values()).sort((a, b) => a.domaine.localeCompare(b.domaine));
}

/**
 * Obtenir la couleur de la barre de progression en fonction du taux
 */
export function getProgressColor(taux: number): string {
  if (taux >= 80) return 'bg-success';
  if (taux >= 60) return 'bg-primary';
  if (taux >= 40) return 'bg-warning';
  return 'bg-danger';
}

/**
 * Obtenir la classe de badge en fonction du taux
 */
export function getBadgeClass(taux: number): string {
  if (taux >= 80) return 'badge success';
  if (taux >= 60) return 'badge primary';
  if (taux >= 40) return 'badge warning';
  return 'badge danger';
}

/**
 * Obtenir l'icône de tendance
 */
export function getTendanceIcon(taux: number, previousTaux?: number) {
  if (!previousTaux) return <Minus className="w-3 h-3 text-gray-400" />;
  if (taux > previousTaux) return <TrendingUp className="w-3 h-3 text-success" />;
  if (taux < previousTaux) return <TrendingDown className="w-3 h-3 text-danger" />;
  return <Minus className="w-3 h-3 text-gray-400" />;
}

// Composant: Carte de statistique globale
function GlobalStatsCard({ stats }: { stats: StatsGlobales }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="text-center p-3 bg-success/10 rounded-xl">
        <CheckCircle2 className="w-5 h-5 text-success mx-auto mb-1" />
        <div className="text-2xl font-bold text-success">{stats.sa}</div>
        <div className="text-xs text-muted-foreground">SA</div>
      </div>
      <div className="text-center p-3 bg-danger/10 rounded-xl">
        <AlertCircle className="w-5 h-5 text-danger mx-auto mb-1" />
        <div className="text-2xl font-bold text-danger">{stats.ns}</div>
        <div className="text-xs text-muted-foreground">NS</div>
      </div>
      <div className="text-center p-3 bg-warning/10 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-warning mx-auto mb-1" />
        <div className="text-2xl font-bold text-warning">{stats.nv}</div>
        <div className="text-xs text-muted-foreground">NV</div>
      </div>
      <div className="text-center p-3 bg-gray-100 rounded-xl">
        <MinusCircle className="w-5 h-5 text-gray-500 mx-auto mb-1" />
        <div className="text-2xl font-bold text-gray-600">{stats.na}</div>
        <div className="text-xs text-muted-foreground">NA</div>
      </div>
    </div>
  );
}

// Composant: Barre de progression avec taux
function ProgressBar({ label, value, color, showValue = true }: { label: string; value: number; color?: string; showValue?: boolean }) {
  const barColor = color || getProgressColor(value);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        {showValue && <span className="font-medium">{value}%</span>}
      </div>
      <div className="progress h-2">
        <div className={`progress-bar ${barColor}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// Composant: Ligne de statistiques par domaine (version compacte)
function DomaineStatsRowCompact({ stat, onClick }: { stat: StatsParDomaine; onClick?: () => void }) {
  const barColor = getProgressColor(stat.tauxConformiteReel);
  const badgeClass = getBadgeClass(stat.tauxConformiteReel);

  return (
    <div
      className="flex items-center gap-3 py-2 border-b border-border last:border-0 cursor-pointer hover:bg-role-primary-soft transition-colors"
      onClick={onClick}
    >
      <div className="w-16 text-sm font-medium text-foreground">{stat.domaine}</div>
      <div className="flex-1">
        <div className="progress h-1.5">
          <div className={`progress-bar ${barColor}`} style={{ width: `${stat.tauxConformiteReel}%` }} />
        </div>
      </div>
      <div className="w-12 text-right">
        <span className={`text-xs font-medium ${badgeClass}`}>{stat.tauxConformiteReel}%</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="text-success">{stat.sa}</span>
        <span className="text-danger">{stat.ns}</span>
        <span className="text-warning">{stat.nv}</span>
      </div>
    </div>
  );
}

// Composant: Ligne de statistiques par domaine (version détaillée)
function DomaineStatsRowDetailed({ stat, onClick }: { stat: StatsParDomaine; onClick?: () => void }) {
  const barColor = getProgressColor(stat.tauxConformiteReel);
  const badgeClass = getBadgeClass(stat.tauxConformiteReel);

  return (
    <div
      className="border rounded-lg p-3 cursor-pointer hover:shadow-md transition-all"
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-role-primary" />
          <span className="font-semibold text-sm text-foreground">{stat.domaine}</span>
          <span className={`text-xs ${badgeClass}`}>{stat.tauxConformiteReel}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="badge success">{stat.sa}</span>
          <span className="badge danger">{stat.ns}</span>
          <span className="badge warning">{stat.nv}</span>
          <span className="badge neutral">{stat.na}</span>
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Conformité réelle (NV=NS)</span>
            <span className="font-medium">{stat.tauxConformiteReel}%</span>
          </div>
          <div className="progress h-1.5">
            <div className={`progress-bar ${barColor}`} style={{ width: `${stat.tauxConformiteReel}%` }} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Progression</span>
            <span className="font-medium">{stat.progression}%</span>
          </div>
          <div className="progress h-1">
            <div className="progress-bar bg-primary" style={{ width: `${stat.progression}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-1 text-center text-xs">
          <div>
            <div className="text-success font-bold">{stat.sa}</div>
            <div className="text-muted-foreground">SA</div>
          </div>
          <div>
            <div className="text-danger font-bold">{stat.ns}</div>
            <div className="text-muted-foreground">NS</div>
          </div>
          <div>
            <div className="text-warning font-bold">{stat.nv}</div>
            <div className="text-muted-foreground">NV</div>
          </div>
          <div>
            <div className="text-gray-500 font-bold">{stat.na}</div>
            <div className="text-muted-foreground">NA</div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground pt-1 border-t border-border">
          {stat.renseignes}/{stat.total} items renseignés
        </div>
      </div>
    </div>
  );
}

// Composant principal
export function ChecklistStats({
  items,
  title = "Statistiques de la checklist",
  showDetails = true,
  compact = false,
  onDomaineClick,
}: ChecklistStatsProps) {
  const statsGlobal = useMemo(() => calculateStats(items), [items]);
  const statsByDomaine = useMemo(() => calculateStatsByDomaine(items), [items]);

  // Avertissement sur les NV considérés comme NS
  const hasNV = statsGlobal.nv > 0;

  if (compact) {
    return (
      <div className="space-y-3">
        {/* Barre de progression globale */}
        <ProgressBar
          label="Progression globale"
          value={statsGlobal.progression}
          showValue={true}
        />

        {/* Taux de conformité réel */}
        <ProgressBar
          label="Conformité réelle (NV=NS)"
          value={statsGlobal.tauxConformiteReel}
          color={getProgressColor(statsGlobal.tauxConformiteReel)}
          showValue={true}
        />

        {/* Compteurs simplifiés */}
        <div className="flex items-center gap-3 justify-between pt-1">
          <span className="badge success">SA: {statsGlobal.sa}</span>
          <span className="badge danger">NS: {statsGlobal.ns}</span>
          <span className="badge warning">NV: {statsGlobal.nv}</span>
          <span className="badge neutral">NA: {statsGlobal.na}</span>
        </div>

        {hasNV && (
          <div className="text-xs text-warning flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            NV sont considérés comme non satisfaisants
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-role-primary" />
          <h3 className="font-semibold text-foreground">{title}</h3>
          <span className="badge outline text-xs">{statsGlobal.total} items</span>
        </div>
        {hasNV && (
          <div className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="w-3 h-3" />
            NV = Non satisfaisant
          </div>
        )}
      </div>

      {/* Cartes globales */}
      <GlobalStatsCard stats={statsGlobal} />

      {/* Barres de progression globales */}
      <div className="space-y-2">
        <ProgressBar
          label="Progression"
          value={statsGlobal.progression}
          showValue={true}
        />
        <ProgressBar
          label="Taux de conformité réel (NV=NS)"
          value={statsGlobal.tauxConformiteReel}
          color={getProgressColor(statsGlobal.tauxConformiteReel)}
          showValue={true}
        />
        {statsGlobal.tauxConformiteClassique !== statsGlobal.tauxConformiteReel && (
          <div className="text-xs text-muted-foreground pl-1">
            Taux classique (SA/total): {statsGlobal.tauxConformiteClassique}%
          </div>
        )}
      </div>

      {/* Statistiques par domaine */}
      {showDetails && statsByDomaine.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <PieChart className="w-4 h-4 text-role-primary" />
            <span className="text-sm font-medium">Par domaine</span>
          </div>

          {statsByDomaine.map(stat => (
            <DomaineStatsRowCompact
              key={stat.domaine}
              stat={stat}
              onClick={() => onDomaineClick?.(stat.domaine)}
            />
          ))}
        </div>
      )}

      {/* Version détaillée (optionnelle) */}
      {showDetails && (
        <div className="pt-2">
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Voir le détail par domaine
            </summary>
            <div className="mt-3 space-y-3">
              {statsByDomaine.map(stat => (
                <DomaineStatsRowDetailed
                  key={stat.domaine}
                  stat={stat}
                  onClick={() => onDomaineClick?.(stat.domaine)}
                />
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export default ChecklistStats;