// components/modules/dashboard/GuestDashboardModule.tsx
// ✅ Mode consultation publique
// ✅ Design system premium - classes harmonisées
// ✅ Animations et accessibilité

'use client'

import { useMemo } from 'react'
import { Plane, ShieldCheck, ShieldOff, MapPin, Phone, Mail, UserPlus, Globe, Building2, Users } from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface GuestDashboardModuleProps {
  user: any
}

export function GuestDashboardModule({ user }: GuestDashboardModuleProps) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const certifications = useAppStore(s => s.certifications);

  const aerodromesPublics = useMemo(() => {
    return (aerodromes || []).map(aero => {
      const cert = certifications?.find(c => c.aerodrome_id === aero.id)
      const estCertifie = cert?.statut_global === 'certifie'
      return { ...aero, estCertifie }
    })
  }, [aerodromes, certifications])

  const stats = useMemo(() => {
    const total = aerodromesPublics.length
    const internationaux = aerodromesPublics.filter(a => a.type === 'international').length
    const certifies = aerodromesPublics.filter(a => a.estCertifie).length
    return { total, internationaux, certifies }
  }, [aerodromesPublics])

  const now = new Date()

  return (
    <div className="space-y-6 animate-fade-in" data-module="guest-dashboard">

      {/* ==================== EN-TÊTE ANACIM ==================== */}
      <div className="relative overflow-hidden rounded-2xl bg-role-gradient shadow-role-glow">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
        </div>
        <div className="relative p-8 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/20 rounded-xl p-3 backdrop-blur-sm">
              <Globe className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">ANACIM</h1>
              <p className="text-white/80 text-sm">Agence Nationale de l'Aviation Civile et de la Météorologie</p>
            </div>
          </div>
          <p className="text-white/90 text-sm leading-relaxed max-w-3xl">
            L'ANACIM assure la supervision de la sécurité des aérodromes au Sénégal conformément aux normes
            de l'Organisation de l'Aviation Civile Internationale (OACI). Notre mission : garantir la sécurité
            des infrastructures aéroportuaires, superviser les processus de certification et d'homologation,
            et veiller à la conformité réglementaire de l'ensemble du réseau aéroportuaire national.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="badge outline bg-white/20 text-white border-white/30">
              Données publiques
            </span>
            <span className="badge outline bg-white/20 text-white border-white/30">
              Mise à jour {now.toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>
      </div>

      {/* ==================== KPIS PUBLICS ==================== */}
      <div className="kpi-grid">
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="kpi-icon"><Plane className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Aérodromes</div>
            <div className="kpi-value">{stats.total}</div>
          </div>
        </div>
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-icon"><Globe className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Internationaux</div>
            <div className="kpi-value">{stats.internationaux}</div>
          </div>
        </div>
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="kpi-icon"><ShieldCheck className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Certifiés</div>
            <div className="kpi-value">{stats.certifies}</div>
          </div>
        </div>
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-icon"><Users className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Visiteurs</div>
            <div className="kpi-value">—</div>
          </div>
        </div>
      </div>

      {/* ==================== LISTE DES AÉRODROMES ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.25s' }}>
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Plane className="h-5 w-5 text-role-primary" />
            Aérodromes du Sénégal
            <span className="badge outline ml-2">
              {aerodromesPublics.length} aérodromes
            </span>
          </h3>
        </div>
        <div className="card-content p-0">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Code OACI</th>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Région</th>
                  <th>Certification</th>
                </tr>
              </thead>
              <tbody>
                {aerodromesPublics.map((aero, idx) => (
                  <tr key={aero.id} className="hover:bg-role-primary-soft transition-colors animate-fade-up" style={{ animationDelay: `${0.25 + idx * 0.02}s` }}>
                    <td><span className="code-oaci-badge">{aero.code_oaci}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted" />
                        <span className="text-small text-foreground">{aero.nom}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${aero.type === 'international' ? 'primary' : 'neutral'}`}>
                        {aero.type === 'international' ? 'International' : 'National'}
                      </span>
                    </td>
                    <td className="text-small text-foreground">{aero.region}</td>
                    <td>
                      {aero.estCertifie ? (
                        <div className="flex items-center gap-1.5 text-success">
                          <ShieldCheck className="h-4 w-4" />
                          <span className="text-xs font-semibold">Certifié</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-muted">
                          <ShieldOff className="h-4 w-4" />
                          <span className="text-xs">Non certifié</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {aerodromesPublics.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted text-sm">
                      Aucun aérodrome disponible
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ==================== CONTACT ANACIM ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.3s' }}>
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Building2 className="h-5 w-5 text-role-primary" />
            Contact ANACIM
          </h3>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border px-4 py-3 hover:bg-muted/50 transition-colors">
              <Mail className="h-5 w-5 text-role-primary shrink-0" />
              <div>
                <p className="text-xs text-muted mb-0.5">Email</p>
                <p className="text-sm font-semibold text-foreground">contact@anacim.sn</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-muted/30 border border-border px-4 py-3 hover:bg-muted/50 transition-colors">
              <Phone className="h-5 w-5 text-role-primary shrink-0" />
              <div>
                <p className="text-xs text-muted mb-0.5">Téléphone</p>
                <p className="text-sm font-semibold text-foreground">+221 33 869 00 00</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-role-primary-soft border border-role-primary/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-role-primary text-sm">Accès complet au système SGDA</p>
              <p className="text-xs text-muted mt-0.5">
                Exploitants, inspecteurs et partenaires peuvent demander un accès complet.
              </p>
            </div>
            <button className="btn btn-primary gap-2 shrink-0" onClick={() => window.location.href = '/login'}>
              <UserPlus className="h-4 w-4" />
              Demander un accès au système
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-xs text-muted">
          © ANACIM Sénégal — Données publiques — Version 5.0
        </p>
      </div>
    </div>
  )
}

export default GuestDashboardModule;
