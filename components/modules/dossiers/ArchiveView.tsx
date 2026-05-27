// components/modules/dossiers/ArchiveView.tsx
'use client';

import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Download,
  ArchiveRestore,
  Trash2,
  Calendar,
  Search,
  Filter,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface ArchiveViewProps {
  onRestore?: (dossierId: string) => void;
}

interface Fichier {
  id: string;
  nom: string;
  taille: string;
  type: string;
  url: string;
}

export function ArchiveView({ onRestore }: ArchiveViewProps) {
  const dossiers = useAppStore(s => s.dossiers);
  const aerodromes = useAppStore(s => s.aerodromes);
  const restaurerDossier = useAppStore(s => s.restaurerDossier);
  const deleteDossier = useAppStore(s => s.deleteDossier);

  // États pour les filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategorie, setSelectedCategorie] = useState('tous');
  const [selectedAerodrome, setSelectedAerodrome] = useState('tous');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [anneesOuvertes, setAnneesOuvertes] = useState<Record<string, boolean>>({});
  const [categoriesOuvertes, setCategoriesOuvertes] = useState<Record<string, boolean>>({});

  // Récupérer uniquement les dossiers archivés
  const dossiersArchives = useMemo(
    () => dossiers?.filter((d) => d.statut === 'archive') ?? [],
    [dossiers]
  );

  // Appliquer les filtres
  const dossiersFiltres = useMemo(() => {
    return dossiersArchives.filter((dossier) => {
      // Recherche textuelle
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const match =
          dossier.reference?.toLowerCase().includes(term) ||
          dossier.titre?.toLowerCase().includes(term) ||
          dossier.instructions?.toLowerCase().includes(term);
        if (!match) return false;
      }

      // Filtre catégorie
      if (selectedCategorie !== 'tous' && dossier.categorie !== selectedCategorie)
        return false;

      // Filtre aérodrome
      if (selectedAerodrome !== 'tous' && dossier.aerodrome_id !== selectedAerodrome)
        return false;

      // Filtre date d'archivage
      if (dateDebut && (dossier as any).archived_at && (dossier as any).archived_at < dateDebut)
        return false;
      if (dateFin && (dossier as any).archived_at && (dossier as any).archived_at > dateFin)
        return false;

      return true;
    });
  }, [dossiersArchives, searchTerm, selectedCategorie, selectedAerodrome, dateDebut, dateFin]);

  // Grouper par année puis par catégorie
  const dossiersGroupes = useMemo(() => {
    const grouped: Record<string, Record<string, typeof dossiersArchives>> = {};

    dossiersFiltres.forEach((dossier) => {
      const annee = (dossier as any).archived_at
        ? new Date((dossier as any).archived_at).getFullYear().toString()
        : 'Sans date';
      const categorie = dossier.categorie;

      if (!grouped[annee]) grouped[annee] = {};
      if (!grouped[annee][categorie]) grouped[annee][categorie] = [];
      grouped[annee][categorie].push(dossier);
    });

    // Trier les années décroissantes
    const anneesTriees = Object.keys(grouped).sort((a, b) => {
      if (a === 'Sans date') return 1;
      if (b === 'Sans date') return -1;
      return parseInt(b) - parseInt(a);
    });

    const result: { annee: string; categories: { nom: string; dossiers: any[] }[] }[] = [];
    for (const annee of anneesTriees) {
      const categories = Object.entries(grouped[annee]).map(([nom, dossiers]) => ({
        nom,
        dossiers,
      }));
      result.push({ annee, categories });
    }

    return result;
  }, [dossiersFiltres]);

  const toggleAnnee = (annee: string) => {
    setAnneesOuvertes((prev) => ({ ...prev, [annee]: !prev[annee] }));
  };

  const toggleCategorie = (key: string) => {
    setCategoriesOuvertes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRestore = (dossierId: string) => {
    restaurerDossier(dossierId);
    onRestore?.(dossierId);
  };

  const handleDelete = (dossierId: string) => {
    if (confirm('Supprimer définitivement ce dossier ?')) {
      deleteDossier(dossierId);
    }
  };

  // Liste unique des catégories pour le filtre
  const categoriesDisponibles = useMemo(() => {
    const cats = new Set(dossiersArchives.map((d) => d.categorie));
    return Array.from(cats);
  }, [dossiersArchives]);

  if (dossiersArchives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ArchiveRestore className="h-16 w-16 text-muted-foreground opacity-30 mb-4" />
        <p className="text-muted-foreground">Aucun dossier archivé</p>
        <p className="text-small text-muted-foreground mt-1">
          Les dossiers terminés seront automatiquement archivés
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Recherche */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher dans les archives..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent"
            />
          </div>

          {/* Filtre catégorie */}
          <select
            value={selectedCategorie}
            onChange={(e) => setSelectedCategorie(e.target.value)}
            className="h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.75rem center',
              backgroundRepeat: 'no-repeat',
            }}
          >
            <option value="tous">Toutes catégories</option>
            {categoriesDisponibles.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Filtre aérodrome */}
          <select
            value={selectedAerodrome}
            onChange={(e) => setSelectedAerodrome(e.target.value)}
            className="h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] appearance-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.75rem center',
              backgroundRepeat: 'no-repeat',
            }}
          >
            <option value="tous">Tous aérodromes</option>
            {aerodromes?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code_oaci} - {a.nom}
              </option>
            ))}
          </select>

          {/* Filtre date */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground text-sm"
                placeholder="Du"
              />
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground text-sm"
                placeholder="Au"
              />
            </div>
          </div>

          {/* Reset filtres */}
          {(searchTerm || selectedCategorie !== 'tous' || selectedAerodrome !== 'tous' || dateDebut || dateFin) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategorie('tous');
                setSelectedAerodrome('tous');
                setDateDebut('');
                setDateFin('');
              }}
              className="btn btn-ghost btn-sm"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {/* Résumé des résultats */}
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <span className="badge neutral">
            {dossiersFiltres.length} dossier(s) archivé(s)
          </span>
        </div>
      </div>

      {/* Accordéon par année */}
      <div className="space-y-3">
        {dossiersGroupes.map(({ annee, categories }) => (
          <div key={annee} className="card overflow-hidden">
            {/* En-tête année */}
            <button
              onClick={() => toggleAnnee(annee)}
              className="w-full flex items-center justify-between p-4 bg-role-primary-soft/30 hover:bg-role-primary-soft/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {anneesOuvertes[annee] ? (
                  <ChevronDown className="h-4 w-4 text-role-primary" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-role-primary" />
                )}
                <span className="font-semibold text-lg">{annee}</span>
                <span className="badge neutral">
                  {categories.reduce((acc, cat) => acc + cat.dossiers.length, 0)} dossier(s)
                </span>
              </div>
            </button>

            {/* Contenu année */}
            {anneesOuvertes[annee] && (
              <div className="p-4 space-y-3">
                {categories.map(({ nom, dossiers: catDossiers }) => {
                  const key = `${annee}-${nom}`;
                  return (
                    <div key={nom} className="border border-border rounded-xl overflow-hidden">
                      {/* En-tête catégorie */}
                      <button
                        onClick={() => toggleCategorie(key)}
                        className="w-full flex items-center justify-between p-3 bg-background hover:bg-role-primary-soft/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {categoriesOuvertes[key] ? (
                            <ChevronDown className="h-3 w-3 text-role-primary" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-role-primary" />
                          )}
                          <span className="font-medium capitalize">{nom}</span>
                          <span className="badge outline text-xs">
                            {catDossiers.length}
                          </span>
                        </div>
                      </button>

                      {/* Liste des dossiers de cette catégorie */}
                      {categoriesOuvertes[key] && (
                        <div className="p-3 space-y-3 border-t border-border">
                          {catDossiers.map((dossier) => (
                            <DossierArchiveCard
                              key={dossier.id}
                              dossier={dossier}
                              aerodrome={aerodromes?.find(
                                (a) => a.id === dossier.aerodrome_id
                              )}
                              onRestore={() => handleRestore(dossier.id)}
                              onDelete={() => handleDelete(dossier.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Composant carte pour un dossier archivé
function DossierArchiveCard({
  dossier,
  aerodrome,
  onRestore,
  onDelete,
}: {
  dossier: any;
  aerodrome?: any;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [showFiles, setShowFiles] = useState(false);

  return (
    <div className="bg-role-primary-soft/10 rounded-xl p-4 hover:shadow-role-glow transition-shadow">
      <div className="flex flex-wrap justify-between items-start gap-3">
        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-role-primary">
              {dossier.reference}
            </span>
            <span className="badge neutral text-xs">
              {new Date(dossier.archived_at).toLocaleDateString('fr-FR')}
            </span>
          </div>
          <h4 className="font-medium mt-1">{dossier.titre}</h4>
          {aerodrome && (
            <p className="text-small text-muted-foreground mt-1">
              {aerodrome.code_oaci} — {aerodrome.nom}
            </p>
          )}
          {dossier.instructions && (
            <p className="text-small text-muted-foreground mt-2 line-clamp-2">
              {dossier.instructions}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onRestore}
            className="action-button text-success hover:bg-success-soft"
            title="Restaurer"
          >
            <ArchiveRestore className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="action-button text-danger hover:bg-danger-soft"
            title="Supprimer définitivement"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fichiers associés */}
      {dossier.fichiers && dossier.fichiers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="flex items-center gap-1 text-small text-role-primary hover:underline"
          >
            {showFiles ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {dossier.fichiers.length} fichier(s) associé(s)
          </button>
          {showFiles && (
            <div className="mt-2 space-y-2">
              {dossier.fichiers.map((fichier: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-background rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-small truncate max-w-[200px]">
                      {fichier.nom}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({fichier.taille})
                    </span>
                  </div>
                  <a
                    href={fichier.url}
                    download={fichier.nom}
                    className="action-button"
                    title="Télécharger"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}