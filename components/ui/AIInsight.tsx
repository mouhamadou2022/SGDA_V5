'use client';

import { useState } from 'react';
import { Brain, ChevronDown, ChevronUp, X, Sparkles } from 'lucide-react';

interface AIInsightProps {
  title: string;
  content: string;
  confidence?: number;
  onApply?: () => void;
  onDismiss?: () => void;
  icon?: React.ElementType;
}

export function AIInsight({
  title,
  content,
  confidence = 0,
  onApply,
  onDismiss,
  icon: Icon = Sparkles
}: AIInsightProps) {
  const [expanded, setExpanded] = useState(true);

  const getConfidenceColor = () => {
    if (confidence >= 80) return 'bg-success';
    if (confidence >= 60) return 'bg-primary';
    if (confidence >= 40) return 'bg-warning';
    return 'bg-danger';
  };

  return (
    <div className="card border-l-4 border-l-role-primary bg-role-primary-soft/20 mb-3">
      <div className="card-content p-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-role-primary-soft flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-role-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {confidence > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className={`h-full ${getConfidenceColor()}`} style={{ width: `${confidence}%` }} />
                </div>
                <span className="text-[10px] text-muted-foreground">{confidence}%</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onApply && (
              <button
                onClick={onApply}
                className="text-xs text-role-primary hover:underline"
              >
                Appliquer
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="action-button w-6 h-6 p-0"
                title="Ignorer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="action-button w-6 h-6 p-0"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>
        
        {expanded && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-sm text-muted-foreground">{content}</p>
          </div>
        )}
      </div>
    </div>
  );
}