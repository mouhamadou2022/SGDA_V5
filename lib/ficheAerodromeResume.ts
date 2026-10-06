// lib/ficheAerodromeResume.ts
// Résumé d'une fiche aérodrome en langage clair (DG non-expert) : phrases
// factuelles construites UNIQUEMENT depuis les champs renseignés de la fiche
// (formulaire aérodrome) — jamais d'invention, jamais de LLM (instantané).
// Pur et testé.

import type { Aerodrome } from './store/aerodromesSlice';

function statutCertification(aero: Aerodrome): string | null {
  if (aero.statut_certification === 'certifie') {
    return `certifié${aero.certifie_le ? ` le ${new Date(aero.certifie_le).toLocaleDateString('fr-FR')}` : ''}${aero.numero_certificat ? ` (certificat ${aero.numero_certificat})` : ''}`;
  }
  if (aero.statut_certification === 'homologue') {
    return `homologué${aero.homologue_le ? ` le ${new Date(aero.homologue_le).toLocaleDateString('fr-FR')}` : ''}`;
  }
  if (aero.statut_certification === 'non_certifie') return 'non certifié';
  if (aero.statut_certification === 'non_homologue') return 'non homologué';
  return null;
}

/**
 * Lignes de résumé en langage clair (une seule phrase par fait).
 * Seuls les champs renseignés produisent une ligne.
 */
export function resumerFicheAerodrome(aero: Aerodrome): string[] {
  const lignes: string[] = [];

  lignes.push(
    `L'aérodrome ${aero.nom} (${aero.code_oaci}) est un aéroport ${aero.type === 'international' ? 'international' : 'national'} situé dans la région de ${aero.region || 'Dakar'}.`,
  );

  const statut = aero.statut === 'actif' ? 'en activité'
    : aero.statut === 'suspendu' ? 'suspendu'
    : aero.statut === 'ferme' ? 'fermé' : null;
  const certif = statutCertification(aero);
  if (statut || certif) {
    lignes.push(
      `Il est ${[statut, certif].filter(Boolean).join(' et ')}.`,
    );
  }

  const piste = aero.piste_principale;
  if (piste && (piste.longueur || piste.largeur)) {
    const dims = [piste.longueur ? `${piste.longueur} mètres de long` : '', piste.largeur ? `${piste.largeur} mètres de large` : '']
      .filter(Boolean).join(' sur ');
    const details = [
      piste.orientation ? `orientée ${piste.orientation}` : '',
      piste.revetement ? `en ${piste.revetement}` : '',
      piste.avion_reference ? `dimensionnée pour ${piste.avion_reference}` : '',
    ].filter(Boolean).join(', ');
    lignes.push(`Sa piste principale mesure ${dims}${details ? `, ${details}` : ''}.`);
  }

  const exploitant = aero.exploitant_nom?.trim();
  if (exploitant) {
    lignes.push(
      `Il est exploité par ${exploitant}${aero.exploitant_telephone ? ` (${aero.exploitant_telephone})` : ''}.`,
    );
  }

  const horaires = aero.horaires === 'h24' ? 'jour et nuit (H24)' : aero.horaires === 'jour' ? 'de jour uniquement' : '';
  const sslia = aero.categorie_sslia ? `catégorie SSLIA ${aero.categorie_sslia}` : '';
  if (horaires || sslia) {
    lignes.push(`Il fonctionne ${[horaires, sslia && `avec une ${sslia}`].filter(Boolean).join(', ')}.`);
  }

  if (aero.statut_sgs === 'non_applicable') {
    lignes.push(`Le système de gestion de la sécurité (SGS) ne s'y applique pas.`);
  } else if (aero.statut_sgs === 'simplifie') {
    lignes.push(`Il relève d'un SGS simplifié.`);
  }

  const contacts = (aero.contacts || []).filter(c => c.nom).slice(0, 2);
  if (contacts.length > 0) {
    lignes.push(
      `Contacts : ${contacts.map(c => `${c.nom}${c.poste ? ` (${c.poste})` : ''}`).join(' ; ')}.`,
    );
  }

  return lignes;
}
