// components/modules/planning/PlanningCalendarView.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/fr';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { Planning, Aerodrome } from '@/lib/store';
import { createPortal } from 'react-dom';
import { Eye, PenSquare, Trash2, X, MapPin, Calendar as CalendarIcon, Users, Target, AlertTriangle } from 'lucide-react';

moment.locale('fr');
const localizer = momentLocalizer(moment);

const getStatusColorClass = (statut: string): string => {
  const colors: Record<string, string> = {
    'planifiee': 'border-l-role-primary',
    'en_cours': 'border-l-warning',
    'checklist_signee': 'border-l-info',
    'ecarts_signes': 'border-l-warning',
    'rapport_signe': 'border-l-success',
    'lettre_signee': 'border-l-success',
    'transmise': 'border-l-success',
    'archivee': 'border-l-muted',
    'en_retard': 'border-l-danger',
  };
  return colors[statut] || 'border-l-role-primary';
};

const getSurveillanceStatutBadge = (statut: string) => {
  const labels: Record<string, string> = {
    'planifiee': 'Planifié', 'en_cours': 'En cours', 'checklist_signee': 'Checklist signée',
    'ecarts_signes': 'Écarts signés', 'rapport_signe': 'Rapport signé',
    'lettre_signee': 'Lettre signée', 'transmise': 'Exécuté', 'archivee': 'Archivée',
    'en_retard': 'En retard'
  };
  const classes: Record<string, string> = {
    'planifiee': 'badge primary', 'en_cours': 'badge warning',
    'checklist_signee': 'badge primary', 'ecarts_signes': 'badge warning',
    'rapport_signe': 'badge success', 'lettre_signee': 'badge success',
    'transmise': 'badge success', 'archivee': 'badge neutral',
    'en_retard': 'badge danger animate-pulse'
  };
  return { label: labels[statut] || statut, cls: classes[statut] || 'badge neutral' };
};

const getPrioriteBadge = (priorite: string) => {
  const labels: Record<string, string> = {
    critique: 'Critique', haute: 'Élevée', moyenne: 'Moyenne', basse: 'Faible'
  };
  const classes: Record<string, string> = {
    critique: 'badge danger', haute: 'badge warning', moyenne: 'badge primary', basse: 'badge neutral'
  };
  return { label: labels[priorite] || priorite, cls: classes[priorite] || 'badge neutral' };
};

const getSurveillanceStatutBadge = (statut: string) => {
  const labels: Record<string, string> = {
    'planifiee': 'Planifié', 'en_cours': 'En cours', 'checklist_signee': 'Checklist signée',
    'ecarts_signes': 'Écarts signés', 'rapport_signe': 'Rapport signé',
    'lettre_signee': 'Lettre signée', 'transmise': 'Exécuté avec succès', 'archivee': 'Archivée'
  };
  const classes: Record<string, string> = {
    'planifiee': 'outline', 'en_cours': 'warning', 'checklist_signee': 'primary',
    'ecarts_signes': 'primary', 'rapport_signe': 'success', 'lettre_signee': 'success',
    'transmise': 'success', 'archivee': 'neutral', 'en_retard': 'danger animate-pulse'
  };
  return { label: labels[statut] || statut, cls: classes[statut] || 'neutral' };
};

const getSurveillanceTypeBadge = (type: string) => {
  const labels: Record<string, string> = {
    'programmee': 'Programmée', 'inopinee': 'Inopinée', 'speciale': 'Spéciale',
    'suivi_ecarts': 'Suivi écarts', 'mise_oeuvre_pac': 'Mise œuvre PAC',
    'certification': 'Certification', 'homologation': 'Homologation',
    'audit_complet': 'Audit complet', 'urgence': 'Urgence'
  };
  const classes: Record<string, string> = {
    'programmee': 'primary', 'inopinee': 'warning', 'speciale': 'danger',
    'suivi_ecarts': 'purple', 'mise_oeuvre_pac': 'info',
    'certification': 'success', 'homologation': 'success',
    'audit_complet': 'primary', 'urgence': 'danger'
  };
  return { label: labels[type] || type.replace(/_/g, ' '), cls: classes[type] || 'neutral' };
};

interface CalendarViewProps {
  plannings: Planning[];
  aerodromes: Aerodrome[];
  onSelectEvent?: (event: Planning) => void;
  onEdit?: (planning: Planning) => void;
  onDelete?: (planning: Planning) => void;
}

// Vue personnalisée pour 6 mois — grille de 6 mois, pas de Calendar imbriqué
const SixMonthsView = (props: any) => {
  const { date, events, onSelectEvent, ...rest } = props;
  const months = Array.from({ length: 6 }, (_, i) => moment(date).add(i, 'months'));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 p-4">
      {months.map((month, idx) => {
        const monthEvents = (events || []).filter((event: any) =>
          moment(event.start).month() === month.month() && moment(event.start).year() === month.year()
        );
        return (
          <div key={idx} className="card border-border">
            <div className="card-header py-2 px-3 bg-gradient-to-r from-role-primary/5 to-transparent flex items-center justify-between">
              <div className="card-title text-small font-semibold text-role-primary">
                {month.format('MMMM')}
              </div>
              {monthEvents.length > 0 && (
                <span className="badge neutral text-[9px] h-4 px-1.5">{monthEvents.length}</span>
              )}
            </div>
            <div className="card-content p-2">
              <div className="space-y-1 max-h-[250px] overflow-y-auto">
                {monthEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Aucun</p>
                ) : (
                  <>
                    {monthEvents.slice(0, 8).map((event: any) => {
                      const borderCls = getStatusColorClass(event.statut);
                      const statutBadge = getSurveillanceStatutBadge(event.statut);
                      return (
                        <div
                          key={event.id}
                          className={`p-2 rounded-lg cursor-pointer bg-background border border-border border-l-4 ${borderCls} hover:scale-[1.02] hover:shadow-md hover:border-role-primary/30 transition-all duration-200 text-xs`}
                          onClick={() => onSelectEvent?.(event)}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="code-oaci-badge text-[10px]">{event.aerodrome?.code_oaci}</span>
                            <span className="text-[10px] text-foreground font-medium truncate">
                              {event.aerodrome?.nom?.substring(0, 20)}
                            </span>
                            <span className={`${statutBadge.cls} text-[9px] ml-auto`}>{statutBadge.label}</span>
                          </div>
                        </div>
                      );
                    })}
                    {monthEvents.length > 8 && (
                      <p className="text-xs text-muted-foreground text-center pt-1">
                        +{monthEvents.length - 8} autre(s)
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
SixMonthsView.title = (date: Date) => moment(date).format('MMMM YYYY');

// Vue personnalisée pour l'année — grille 12 mois
const YearView = (props: any) => {
  const { date, events, onSelectEvent, ...rest } = props;
  const months = Array.from({ length: 12 }, (_, i) => moment(date).month(i));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {months.map((month, idx) => {
        const monthEvents = (events || []).filter((event: any) =>
          moment(event.start).month() === idx && moment(event.start).year() === moment(date).year()
        );
        return (
          <div key={idx} className="card border-border">
            <div className="card-header py-2 px-3 bg-gradient-to-r from-role-primary/5 to-transparent flex items-center justify-between">
              <div className="card-title text-small font-semibold text-role-primary">
                {month.format('MMMM YYYY')}
              </div>
              {monthEvents.length > 0 && (
                <span className="badge neutral text-[9px] h-4 px-1.5">{monthEvents.length}</span>
              )}
            </div>
            <div className="card-content p-2">
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {monthEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Aucun planning</p>
                ) : (
                  monthEvents.slice(0, 5).map((event: any) => {
                    const borderCls = getStatusColorClass(event.statut);
                    const statutBadge = getSurveillanceStatutBadge(event.statut);
                    return (
                    <div
                      key={event.id}
                      className={`p-2 rounded-lg cursor-pointer bg-background border border-border border-l-4 ${borderCls} hover:scale-[1.02] hover:shadow-md hover:border-role-primary/30 transition-all duration-200 text-xs`}
                      onClick={() => onSelectEvent?.(event)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="code-oaci-badge text-[10px]">{event.aerodrome?.code_oaci}</span>
                        <span className="text-[10px] text-foreground font-medium truncate">
                          {event.aerodrome?.nom?.substring(0, 20)}
                        </span>
                        <span className={`${statutBadge.cls} text-[9px] ml-auto`}>{statutBadge.label}</span>
                      </div>
                    </div>
                    );
                  })}
    </div>
  );
};
YearView.title = (date: Date) => moment(date).format('YYYY');

// Modale de détail avec actions
function EventDetailModal({
  planning,
  aerodrome,
  onClose,
  onView,
  onEdit,
  onDelete,
}: {
  planning: Planning;
  aerodrome?: Aerodrome;
  onClose: () => void;
  onView: (p: Planning) => void;
  onEdit: (p: Planning) => void;
  onDelete: (p: Planning) => void;
}) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-role-primary" />
              Détail du planning
            </div>
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="modal-body p-5 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-role-primary" />
              <span className="font-medium">{aerodrome?.code_oaci} - {aerodrome?.nom}</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-role-primary" />
              <span>{new Date(planning.date_debut).toLocaleDateString('fr-FR')} → {new Date(planning.date_fin).toLocaleDateString('fr-FR')}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Target className="w-4 h-4 text-role-primary" />
              <span className="capitalize">{planning.type?.replace(/_/g, ' ')}</span>
              <span className={`badge ${getPrioriteBadge(planning.priorite).cls}`}>
                {getPrioriteBadge(planning.priorite).label}
              </span>
              <span className={`badge ${getSurveillanceStatutBadge(planning.statut).cls}`}>
                {getSurveillanceStatutBadge(planning.statut).label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-role-primary" />
              <span>{planning.equipe_ids?.length || 0} inspecteur(s)</span>
            </div>
            {planning.statut === 'en_retard' && (
              <div className="alert alert-danger py-2">
                <AlertTriangle className="alert-icon w-4 h-4" />
                <div className="alert-content text-sm">Planning en retard</div>
              </div>
            )}
          </div>
          <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Fermer</button>
            <button className="btn btn-primary btn-sm gap-1" onClick={() => { onView(planning); onClose(); }}>
              <Eye className="w-4 h-4" /> Voir
            </button>
            <button className="btn btn-secondary btn-sm gap-1" onClick={() => { onEdit(planning); onClose(); }}>
              <PenSquare className="w-4 h-4" /> Modifier
            </button>
            <button className="btn btn-danger btn-sm gap-1" onClick={() => { onDelete(planning); onClose(); }}>
              <Trash2 className="w-4 h-4" /> Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PlanningCalendarView({ plannings, aerodromes, onSelectEvent, onEdit, onDelete }: CalendarViewProps) {
  const [currentView, setCurrentView] = useState<string>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPlanning, setSelectedPlanning] = useState<Planning | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Transformer les plannings en événements pour le calendrier
  const events = useMemo(() => plannings.map(planning => {
    const aerodrome = aerodromes.find(a => a.id === planning.aerodrome_id);

    return {
      id: planning.id,
      title: `${aerodrome?.code_oaci} - ${getSurveillanceStatutBadge(planning.statut).label}`,
      start: new Date(planning.date_debut),
      end: new Date(planning.date_fin),
      resource: planning,
      aerodrome,
      colorClass: getStatusColorClass(planning.statut),
      statut: planning.statut,
      priorite: planning.priorite,
      type: planning.type,
    };
  }), [plannings, aerodromes]);

  const eventStyleGetter = useCallback((event: any) => {
    return {
      className: `${event.colorClass} rounded-lg border-none text-xs font-medium px-2 py-1 shadow-sm`,
      style: {},
    };
  }, []);

  const EventComponent = useCallback(({ event }: any) => {
    const dotCls = event.statut === 'en_retard' ? 'bg-danger' : event.statut === 'transmise' ? 'bg-success' : event.statut === 'en_cours' ? 'bg-warning' : 'bg-role-primary'
    return (
      <div className="flex items-center gap-1 h-full overflow-hidden text-[10px] px-1">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
        <span className="code-oaci-badge text-[9px] px-1 py-0">
          {event.aerodrome?.code_oaci}
        </span>
        <span className="truncate ml-auto text-white/80">
          {getSurveillanceStatutBadge(event.statut).label}
        </span>
      </div>
    );
  }, []);

  const messages = useMemo(() => ({
    next: "Suivant",
    previous: "Précédent",
    today: "Aujourd'hui",
    month: "Mois",
    week: "Semaine",
    day: "Jour",
    agenda: "Agenda",
    date: "Date",
    time: "Heure",
    event: "Événement",
    allDay: "Journée",
    work_week: "Semaine de travail",
    yesterday: "Hier",
    tomorrow: "Demain",
    noEventsInRange: "Aucun planning pour cette période",
  }), []);

  const handleSelectEvent = useCallback((event: any) => {
    const planning = event.resource ?? event as Planning;
    if (planning) {
      setSelectedPlanning(planning);
      setShowDetail(true);
    }
  }, []);

  const handleSelectSlot = useCallback((slotInfo: { start: Date, end: Date }) => {
    setCurrentDate(slotInfo.start);
    setCurrentView('day');
  }, []);

  const handleDetailView = useCallback((p: Planning) => {
    setShowDetail(false);
    setSelectedPlanning(null);
    onSelectEvent?.(p);
  }, [onSelectEvent]);

  const handleDetailEdit = useCallback((p: Planning) => {
    setShowDetail(false);
    setSelectedPlanning(null);
    onEdit?.(p);
  }, [onEdit]);

  const handleDetailDelete = useCallback((p: Planning) => {
    setShowDetail(false);
    setSelectedPlanning(null);
    onDelete?.(p);
  }, [onDelete]);

  const CustomToolbar = useCallback((toolbar: any) => {
    const goToBack = () => {
      let newDate;
      if (currentView === 'month') newDate = moment(toolbar.date).subtract(1, 'months').toDate();
      else if (currentView === 'week') newDate = moment(toolbar.date).subtract(1, 'weeks').toDate();
      else if (currentView === 'day') newDate = moment(toolbar.date).subtract(1, 'days').toDate();
      else if (currentView === 'year') newDate = moment(toolbar.date).subtract(1, 'years').toDate();
      else if (currentView === 'sixMonths') newDate = moment(toolbar.date).subtract(6, 'months').toDate();
      else newDate = moment(toolbar.date).subtract(1, 'months').toDate();
      setCurrentDate(newDate);
      toolbar.onNavigate('PREV');
    };

    const goToNext = () => {
      let newDate;
      if (currentView === 'month') newDate = moment(toolbar.date).add(1, 'months').toDate();
      else if (currentView === 'week') newDate = moment(toolbar.date).add(1, 'weeks').toDate();
      else if (currentView === 'day') newDate = moment(toolbar.date).add(1, 'days').toDate();
      else if (currentView === 'year') newDate = moment(toolbar.date).add(1, 'years').toDate();
      else if (currentView === 'sixMonths') newDate = moment(toolbar.date).add(6, 'months').toDate();
      else newDate = moment(toolbar.date).add(1, 'months').toDate();
      setCurrentDate(newDate);
      toolbar.onNavigate('NEXT');
    };

    const goToToday = () => {
      setCurrentDate(new Date());
      toolbar.onNavigate('TODAY');
    };

    const viewNames: Record<string, string> = {
      month: 'Mois',
      week: 'Semaine',
      day: 'Jour',
      sixMonths: '6 Mois',
      year: 'Année',
    };

    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gradient-to-r from-role-primary/5 to-transparent rounded-t-xl border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={goToBack} className="btn btn-secondary btn-sm px-3 py-1">←</button>
          <button onClick={goToToday} className="btn btn-secondary btn-sm px-3 py-1">Aujourd'hui</button>
          <button onClick={goToNext} className="btn btn-secondary btn-sm px-3 py-1">→</button>
          <span className="text-sm font-semibold text-foreground ml-2">
            {moment(toolbar.date).format(currentView === 'year' ? 'YYYY' : currentView === 'sixMonths' ? 'MMMM YYYY' : 'MMMM YYYY')}
          </span>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-0.5">
          {Object.entries(viewNames).map(([view, label]) => (
            <button
              key={view}
              onClick={() => { setCurrentView(view); toolbar.onView(view); }}
              className={`btn btn-sm px-3 py-1 ${currentView === view ? 'btn-primary shadow-md' : 'btn-secondary'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }, [currentView]);

  const views = useMemo(() => ({
    month: true,
    week: true,
    day: true,
    sixMonths: SixMonthsView,
    year: YearView,
  }), []);

  const selectedAerodrome = useMemo(
    () => selectedPlanning ? aerodromes.find(a => a.id === selectedPlanning.aerodrome_id) : undefined,
    [selectedPlanning, aerodromes]
  );

  return (
    <div className="card border-border shadow-md">
      <div className="card-content p-0">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          titleAccessor={(event: any) => `${event.aerodrome?.code_oaci} - ${getSurveillanceStatutBadge(event.statut).label}`}
          className="h-[700px]"
          views={views}
          view={currentView as any}
          date={currentDate}
          onNavigate={(date) => setCurrentDate(date)}
          onView={(view) => setCurrentView(view as string)}
          messages={messages}
          eventPropGetter={eventStyleGetter}
          components={{ event: EventComponent, toolbar: CustomToolbar }}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          popup
          selectable
          step={30}
          timeslots={2}
        />
      </div>

      {/* Modale de détail avec actions */}
      {showDetail && selectedPlanning && (
        <EventDetailModal
          planning={selectedPlanning}
          aerodrome={selectedAerodrome}
          onClose={() => { setShowDetail(false); setSelectedPlanning(null); }}
          onView={handleDetailView}
          onEdit={handleDetailEdit}
          onDelete={handleDetailDelete}
        />
      )}
    </div>
  );
}
