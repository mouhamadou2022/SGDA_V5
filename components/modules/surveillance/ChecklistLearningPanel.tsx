'use client';

import React, { useState, useMemo } from 'react';
import { Brain, ChevronDown, ChevronRight, AlertTriangle, TrendingUp, FileEdit } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getLearningStats, getProblematicItems, getTextDeltaStats } from '@/lib/checklistMemory';

interface Props {
  aerodromeId: string;
}

export function ChecklistLearningPanel({ aerodromeId }: Props) {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => getLearningStats(), []);
  const problematiques = useMemo(() => getProblematicItems(aerodromeId, 30).slice(0, 5), [aerodromeId]);
  const textStats = useMemo(() => getTextDeltaStats(aerodromeId), [aerodromeId]);

  if (stats.total_items === 0) return null;

  return (
    <Card variant="level" levelColor="primary" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-black/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold">Apprentissage IA</span>
          <span className="badge bg-blue-100 text-blue-700 border-blue-200 text-[10px]">
            {stats.total_items} item{stats.total_items > 1 ? 's' : ''}
          </span>
          <span className={`badge text-[10px] ${stats.confiance_moyenne >= 70 ? 'bg-success/10 text-success border-success/20' : stats.confiance_moyenne >= 50 ? 'bg-warning/10 text-warning border-warning/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
            Confiance {stats.confiance_moyenne}%
          </span>
          {stats.taux_ecart_recurrent > 0 && (
            <span className="badge bg-danger/10 text-danger border-danger/20 text-[10px] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {stats.taux_ecart_recurrent}% récurrents
            </span>
          )}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-blue-100 pt-2">
          {/* Stats clés */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-blue-700">{stats.confiance_moyenne}%</p>
              <p className="text-[10px] text-blue-500">Confiance moyenne</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-purple-700">{textStats.total_modifications}</p>
              <p className="text-[10px] text-purple-500">Modifications texte</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-amber-700">{stats.items_problematiques}</p>
              <p className="text-[10px] text-amber-500">Items problématiques</p>
            </div>
          </div>

          {/* Dernières modifications texte */}
          {textStats.top_fields.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
                <FileEdit className="w-3 h-3" /> Champs les plus modifiés
              </p>
              <div className="flex flex-wrap gap-1.5">
                {textStats.top_fields.slice(0, 5).map(f => {
                  const labels: Record<string, string> = {
                    point_verification: 'Question',
                    reference_reglementaire: 'Réf. régl.',
                    directive_preuve: 'Directive',
                    directive_sa: 'Dir. SA',
                    directive_ns: 'Dir. NS',
                    directive_nv: 'Dir. NV',
                    directive_na: 'Dir. NA',
                  };
                  return (
                    <span key={f.field} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600">
                      {labels[f.field] || f.field}
                      <span className="font-bold">{f.count}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Items problématiques */}
          {problematiques.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
                <AlertTriangle className="w-3 h-3" /> Items à surveiller (taux d'erreur &gt; 30%)
              </p>
              <div className="space-y-1">
                {problematiques.map(p => (
                  <div key={p.record.id} className="flex items-center justify-between px-2 py-1 rounded bg-danger/5 text-[11px]">
                    <span className="font-mono text-danger/70">{p.record.item_numero}</span>
                    <span className="flex-1 mx-2 truncate text-muted-foreground">{p.record.item_description}</span>
                    <span className="badge bg-danger/10 text-danger border-danger/20 text-[9px]">{p.taux_erreur}% erreurs</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Suggestion */}
          <p className="text-[10px] text-muted-foreground italic">
            <TrendingUp className="w-3 h-3 inline mr-1" />
            Les corrections des inspecteurs améliorent progressivement les prédictions IA.
            {stats.total_items > 0 && ` ${Math.round(problematiques.length / stats.total_items * 100)}% des items ont besoin d'attention.`}
          </p>
        </div>
      )}
    </Card>
  );
}
