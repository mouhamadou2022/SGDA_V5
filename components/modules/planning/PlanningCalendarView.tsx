// components/modules/planning/PlanningCalendarView.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/fr';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { Planning, Aerodrome } from '@/lib/store';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Eye, PenSquare, Trash2, X, MapPin, Calendar as CalendarIcon, Users, Target, AlertTriangle } from 'lucide-react';

moment.locale('fr');
const localizer = momentLocalizer(moment);

const getBorderClass = (statut: string): string => {
  const m: Record<string, string> = {
    'planifiee': 'border-l-role-primary',
    'realisee': 'border-l-info',
    'en_cours': 'border-l-warning',
    'annulee': 'border-l-muted',
    'en_retard': 'border-l-danger animate-pulse',
  };
  return m[statut] || 'border-l-role-primary';
};

const getPrioriteBadge = (priorite: string) => {
  const labels: Record<string, string> = { critique: 'Critique', haute: 'Élevée', moyenne: 'Moyenne', basse: 'Faible' };
  const classes: Record<string, string> = { critique: 'badge danger', haute: 'badge warning', moyenne: 'badge primary', basse: 'badge neutral' };
  return { label: labels[priorite] || priorite, cls: classes[priorite] || 'badge neutral' };
};

const getStatutBadge = (statut: string) => {
  const labels: Record<string, string> = {
    'planifiee': 'Planifié', 'en_cours': 'En cours', 'realisee': 'Réalisé',
    'annulee': 'Annulée', 'en_retard': 'En retard',
  };
  const classes: Record<string, string> = {
    'planifiee': 'badge primary', 'en_cours': 'badge warning',
    'realisee': 'badge info', 'annulee': 'badge neutral',
    'en_retard': 'badge danger animate-pulse',
  };
  return { label: labels[statut] || statut, cls: classes[statut] || 'badge neutral' };
};

interface CalendarViewProps {
  plannings: (Planning & { surveillanceId?: string })[];
  aerodromes: Aerodrome[];
  onSelectEvent?: (event: Planning) => void;
  onEdit?: (planning: Planning) => void;
  onDelete?: (planning: Planning) => void;
}

// Carte planning dans les vues grille (6 mois / année)
function EventCard({ event, onClick }: { event: any; onClick: () => void }) {
  const border = getBorderClass(event.statut);
  const badge = getStatutBadge(event.statut);
  return (
    <div
      onClick={onClick}
      className={`p-2 rounded-lg cursor-pointer bg-background border border-border border-l-4 ${border} hover:scale-[1.02] hover:shadow-md hover:border-role-primary/30 transition-all duration-200 text-xs`}
    >
      <div className="flex items-center gap-1.5">
        <span className="code-oaci-badge text-[10px]">{event.aerodrome?.code_oaci}</span>
        <span className="text-[10px] text-foreground font-medium truncate">{event.aerodrome?.nom?.substring(0, 20)}</span>
        <span className={`${badge.cls} text-[9px] ml-auto`}>{badge.label}</span>
      </div>
    </div>
  );
}

// Vue 6 mois
const SixMonthsView = (props: any) => {
  const { date, events, onSelectEvent } = props;
  const months = Array.from({ length: 6 }, (_, i) => moment(date).add(i, 'months'));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 p-4">
      {months.map((month, idx) => {
        const monthEvents = (events || []).filter((e: any) =>
          moment(e.start).month() === month.month() && moment(e.start).year() === month.year()
        );
        return (
          <Card
            key={idx}
            heading={
              <div className="flex items-center justify-between w-full">
                <span className="text-small font-semibold text-role-primary">{month.format('MMMM')}</span>
                {monthEvents.length > 0 && <span className="badge neutral text-[9px] h-4 px-1.5">{monthEvents.length}</span>}
              </div>
            }
            size="sm"
            className="[&>div:last-child]:p-2"
          >
              <div className="space-y-1 max-h-[250px] overflow-y-auto">
                {monthEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Aucun</p>
                ) : (
                  <>
                    {monthEvents.slice(0, 8).map((event: any) => (
                      <EventCard key={event.id} event={event} onClick={() => onSelectEvent?.(event)} />
                    ))}
                    {monthEvents.length > 8 && <p className="text-xs text-muted-foreground text-center pt-1">+{monthEvents.length - 8} autre(s)</p>}
                  </>
                )}
              </div>
          </Card>
        );
      })}
    </div>
  );
};
SixMonthsView.title = (date: Date) => moment(date).format('MMMM YYYY');

// Vue année
const YearView = (props: any) => {
  const { date, events, onSelectEvent } = props;
  const months = Array.from({ length: 12 }, (_, i) => moment(date).month(i));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
      {months.map((month, idx) => {
        const monthEvents = (events || []).filter((e: any) =>
          moment(e.start).month() === idx && moment(e.start).year() === moment(date).year()
        );
        return (
          <Card
            key={idx}
            heading={
              <div className="flex items-center justify-between w-full">
                <span className="text-small font-semibold text-role-primary">{month.format('MMMM YYYY')}</span>
                {monthEvents.length > 0 && <span className="badge neutral text-[9px] h-4 px-1.5">{monthEvents.length}</span>}
              </div>
            }
            size="sm"
            className="[&>div:last-child]:p-2"
          >
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {monthEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Aucun planning</p>
                ) : (
                  <>
                    {monthEvents.slice(0, 5).map((event: any) => (
                      <EventCard key={event.id} event={event} onClick={() => onSelectEvent?.(event)} />
                    ))}
                    {monthEvents.length > 5 && <p className="text-xs text-muted-foreground text-center pt-1">+{monthEvents.length - 5} autre(s)</p>}
                  </>
                )}
              </div>
          </Card>
        );
      })}
    </div>
  );
};
YearView.title = (date: Date) => moment(date).format('YYYY');

// Modale détail
function EventDetailModal({ planning, aerodrome, onClose, onView, onEdit, onDelete }: {
  planning: Planning; aerodrome?: Aerodrome; onClose: () => void;
  onView: (p: Planning) => void; onEdit: (p: Planning) => void; onDelete: (p: Planning) => void;
}) {
  const statutBadge = getStatutBadge(planning.statut);
  const prioriteBadge = getPrioriteBadge(planning.priorite);
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title flex items-center gap-2"><CalendarIcon className="w-5 h-5 text-role-primary" />Détail du planning</div>
            <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
          <div className="modal-body p-5 space-y-4">
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-role-primary" /><span className="font-medium">{aerodrome?.code_oaci} - {aerodrome?.nom}</span></div>
            <div className="flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-role-primary" /><span>{new Date(planning.date_debut).toLocaleDateString('fr-FR')} → {new Date(planning.date_fin).toLocaleDateString('fr-FR')}</span></div>
            <div className="flex items-center gap-2 flex-wrap">
              <Target className="w-4 h-4 text-role-primary" />
              <span className="capitalize">{planning.type?.replace(/_/g, ' ')}</span>
              <span className={`badge ${prioriteBadge.cls}`}>{prioriteBadge.label}</span>
              <span className={`badge ${statutBadge.cls}`}>{statutBadge.label}</span>
            </div>
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-role-primary" /><span>{planning.equipe_ids?.length || 0} inspecteur(s)</span></div>
            {planning.statut === 'en_retard' && <div className="alert alert-danger py-2"><AlertTriangle className="alert-icon w-4 h-4" /><div className="alert-content text-sm">Planning en retard</div></div>}
          </div>
          <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Fermer</button>
            <button className="btn btn-primary btn-sm gap-1" onClick={() => { onView(planning); onClose(); }}><Eye className="w-4 h-4" />Voir</button>
            <button className="btn btn-secondary btn-sm gap-1" onClick={() => { onEdit(planning); onClose(); }}><PenSquare className="w-4 h-4" />Modifier</button>
            <button className="btn btn-danger btn-sm gap-1" onClick={() => { onDelete(planning); onClose(); }}><Trash2 className="w-4 h-4" />Supprimer</button>
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

  const events = useMemo(() => plannings.map(p => {
    const aero = aerodromes.find(a => a.id === p.aerodrome_id);
    return { id: p.id, start: new Date(p.date_debut), end: new Date(p.date_fin), resource: p, aerodrome: aero, statut: p.statut, priorite: p.priorite, type: p.type };
  }), [plannings, aerodromes]);

  const eventStyleGetter = useCallback((event: any) => {
    const bgMap: Record<string, string> = {
      'realisee': 'bg-info',
      'en_cours': 'bg-warning',
      'annulee': 'bg-muted',
      'en_retard': 'bg-danger',
    };
    const bg = bgMap[event.statut] || 'bg-role-primary';
    return { className: `${bg} !text-white rounded-lg border-none text-xs font-medium px-2 py-1 shadow-sm`, style: {} };
  }, []);

  const EventComponent = useCallback(({ event }: any) => {
    const dotMap: Record<string, string> = {
      'realisee': 'bg-info',
      'en_cours': 'bg-warning',
      'annulee': 'bg-muted',
      'en_retard': 'bg-danger',
    };
    const dot = dotMap[event.statut] || 'bg-role-primary';
    return (
      <div className="flex items-center gap-1 h-full overflow-hidden text-[10px] px-1">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        <span className="code-oaci-badge text-[9px] px-1 py-0">{event.aerodrome?.code_oaci}</span>
        <span className="truncate ml-auto text-white/90">{getStatutBadge(event.statut).label}</span>
      </div>
    );
  }, []);

  const messages = useMemo(() => ({
    next: "Suivant", previous: "Précédent", today: "Aujourd'hui",
    month: "Mois", week: "Semaine", day: "Jour", agenda: "Agenda",
    date: "Date", time: "Heure", event: "Événement", allDay: "Journée",
    work_week: "Semaine de travail", yesterday: "Hier", tomorrow: "Demain",
    noEventsInRange: "Aucun planning pour cette période",
  }), []);

  const handleSelectEvent = useCallback((event: any) => {
    const p = event.resource ?? event as Planning;
    if (p) { setSelectedPlanning(p); setShowDetail(true); }
  }, []);

  const views = useMemo(() => ({ month: true, week: true, day: true, sixMonths: SixMonthsView, year: YearView }), []);

  const selectedAerodrome = useMemo(() => selectedPlanning ? aerodromes.find(a => a.id === selectedPlanning.aerodrome_id) : undefined, [selectedPlanning, aerodromes]);

  const CustomToolbar = useCallback((toolbar: any) => {
    const goBack = () => {
      let d = toolbar.date;
      if (currentView === 'sixMonths') d = moment(d).subtract(6, 'months').toDate();
      else if (currentView === 'year') d = moment(d).subtract(1, 'years').toDate();
      else if (currentView === 'week') d = moment(d).subtract(1, 'weeks').toDate();
      else if (currentView === 'day') d = moment(d).subtract(1, 'days').toDate();
      else d = moment(d).subtract(1, 'months').toDate();
      setCurrentDate(d); toolbar.onNavigate('PREV');
    };
    const goNext = () => {
      let d = toolbar.date;
      if (currentView === 'sixMonths') d = moment(d).add(6, 'months').toDate();
      else if (currentView === 'year') d = moment(d).add(1, 'years').toDate();
      else if (currentView === 'week') d = moment(d).add(1, 'weeks').toDate();
      else if (currentView === 'day') d = moment(d).add(1, 'days').toDate();
      else d = moment(d).add(1, 'months').toDate();
      setCurrentDate(d); toolbar.onNavigate('NEXT');
    };
    const goToday = () => { setCurrentDate(new Date()); toolbar.onNavigate('TODAY'); };
    const viewNames: Record<string, string> = { month: 'Mois', week: 'Semaine', day: 'Jour', sixMonths: '6 Mois', year: 'Année' };
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gradient-to-r from-role-primary/5 to-transparent rounded-t-xl border-b border-border">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="btn btn-secondary btn-sm px-3 py-1">←</button>
          <button onClick={goToday} className="btn btn-secondary btn-sm px-3 py-1">Aujourd'hui</button>
          <button onClick={goNext} className="btn btn-secondary btn-sm px-3 py-1">→</button>
          <span className="text-sm font-semibold text-foreground ml-2">{moment(toolbar.date).format(currentView === 'year' ? 'YYYY' : 'MMMM YYYY')}</span>
        </div>
        <div className="flex gap-1 bg-muted rounded-xl p-0.5">
          {Object.entries(viewNames).map(([v, label]) => (
            <button key={v} onClick={() => { setCurrentView(v); toolbar.onView(v); }} className={`btn btn-sm px-3 py-1 ${currentView === v ? 'btn-primary shadow-md' : 'btn-secondary'}`}>{label}</button>
          ))}
        </div>
      </div>
    );
  }, [currentView]);

  return (
    <Card className="shadow-md">
      <Calendar
        localizer={localizer} events={events} startAccessor="start" endAccessor="end"
        titleAccessor={(event: any) => `${event.aerodrome?.code_oaci} - ${getStatutBadge(event.statut).label}`}
        className="h-[700px]" views={views} view={currentView as any} date={currentDate}
        onNavigate={(date) => setCurrentDate(date)} onView={(view) => setCurrentView(view as string)}
        messages={messages} eventPropGetter={eventStyleGetter}
        components={{ event: EventComponent, toolbar: CustomToolbar }}
        onSelectEvent={handleSelectEvent} popup selectable step={30} timeslots={2}
      />
      {showDetail && selectedPlanning && (
        <EventDetailModal planning={selectedPlanning} aerodrome={selectedAerodrome}
          onClose={() => { setShowDetail(false); setSelectedPlanning(null); }}
          onView={(p) => { setShowDetail(false); setSelectedPlanning(null); onSelectEvent?.(p); }}
          onEdit={(p) => { setShowDetail(false); setSelectedPlanning(null); onEdit?.(p); }}
          onDelete={(p) => { setShowDetail(false); setSelectedPlanning(null); onDelete?.(p); }}
        />
      )}
    </Card>
  );
}
