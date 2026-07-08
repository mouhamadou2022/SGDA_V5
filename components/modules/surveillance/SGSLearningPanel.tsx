'use client';

import React, { useState, useMemo } from 'react';
import { Brain, ChevronDown, ChevronRight, AlertTriangle, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getSGSMemoryStats, getSGSProblematicElements } from '@/lib/sgsMemory';

interface Props {
  aerodromeId: string;
}

export function SGSLearningPanel({ aerodromeId }: Props) {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => getSGSMemoryStats(aerodromeId), [aerodromeId]);
  const problematiques = useMemo(() => getSGSProblematicElements(aerodromeId, 30).slice(0, 5), [aerodromeId]);

  if (stats.total_corrections === 0) return null;

  return (
    <Card variant="level" levelColor="primary" className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-black/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold">Apprentissage SGS</span>
          <span className="badge bg-blue-100 text-blue-700 border-blue-200 text-[10px]">
            {stats.total_corrections} correction{stats.total_corrections > 1 ? 's' : ''}
          </span>
          <span className={`badge text-[10px] ${stats.confiance_moyenne >= 70 ? 'bg-success/10 text-success border-success/20' : stats.confiance_moyenne >= 50 ? 'bg-warning/10 text-warning border-warning/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
            Confiance {stats.confiance_moyenne}%
          </span>
          {stats.items_problematiques > 0 && (
            <span className="badge bg-danger/10 text-danger border-danger/20 text-[10px] flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {stats.items_problematiques} élément{stats.items_problematiques > 1 ? 's' : ''} problématique{stats.items_problematiques > 1 ? 's' : ''}
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
              <p className="text-lg font-bold text-purple-700">{stats.total_corrections}</p>
              <p className="text-[10px] text-purple-500">Corrections PAOE</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-amber-700">{stats.items_problematiques}</p>
              <p className="text-[10px] text-amber-500">Éléments problématiques</p>
            </div>
          </div>

          {/* Éléments problématiques */}
          {problematiques.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1 mb-1.5">
                <AlertTriangle className="w-3 h-3" /> Éléments à surveiller (taux d'erreur &gt; 30%)
              </p>
              <div className="space-y-1">
                {problematiques.map(p => (
                  <div key={p.element_id} className="flex items-center justify-between px-2 py-1 rounded bg-danger/5 text-[11px]">
                    <span className="font-mono text-danger/70">{p.element_id}</span>
                    <span className="flex-1 mx-2 text-right text-muted-foreground">{p.corrections} correction{p.corrections > 1 ? 's' : ''}</span>
                    <span className="badge bg-danger/10 text-danger border-danger/20 text-[9px]">{p.taux_erreur}% erreurs</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground italic">
            <TrendingUp className="w-3 h-3 inline mr-1" />
            Les corrections des inspecteurs sur les niveaux PAOE améliorent progressivement les suggestions IA.
          </p>
        </div>
      )}
    </Card>
  );
}
