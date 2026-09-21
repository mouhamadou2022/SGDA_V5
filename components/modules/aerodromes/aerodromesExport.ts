// components/modules/aerodromes/aerodromesExport.ts
// Exports PDF extraits de AerodromesModule (comportement identique) :
// liste filtrée (HTML → PDF) et fiche aérodrome (rapport structuré).
// Fonctions async pures en dépendances explicites (pas d'accès store).

import { generatePDFFromHTMLString, downloadBlob } from '@/lib/pdfGenerator';
import { creerRapportPdf, PDF_COLORS } from '@/lib/services/pdfRapport';
import { toast } from '@/lib/toast';
import type {
  Aerodrome, Certification, Homologation, Ecart, Surveillance, ProfilRisque,
} from '@/lib/store';

type Notify = typeof toast;

export interface ContexteFiche {
  profilsRisque: Record<string, ProfilRisque>;
  certifications: Certification[] | undefined;
  homologations: Homologation[] | undefined;
  ecarts: Ecart[];
  surveillances: Surveillance[];
}

/** Export PDF de la liste filtrée. */
export async function exporterListePDF(args: {
  aerodromes: Aerodrome[];
  profilsRisque: Record<string, ProfilRisque>;
  setExporting: (v: boolean) => void;
  notify: Notify;
}): Promise<void> {
  const { aerodromes: filteredAerodromes, profilsRisque, setExporting, notify } = args;
  if (filteredAerodromes.length === 0) {
    notify('warning', 'Aucun aérodrome à exporter', 'La liste filtrée est vide');
    return;
  }
  setExporting(true);
  try {
    const rows = filteredAerodromes.map((a, i) => {
      const profil = profilsRisque[a.id];
      const risque = profil?.niveau || '—';
      return `
        <tr>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${i + 1}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;">${a.nom}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${a.code_oaci}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${a.region}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${a.type === 'international' ? 'International' : 'National'} · ${a.type_entite === 'helistation' ? 'Hélistation' : a.type_entite === 'mixte' ? 'Mixte' : 'Aérodrome'}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-transform:capitalize;">${a.statut}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-transform:capitalize;">${risque}</td>
        </tr>`;
    }).join('');

    const html = `
      <html><head><meta charset="utf-8" /></head>
      <body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;padding:0;">
        <div style="padding:0 4px;">
          <div style="border-bottom:3px solid #0f766e;padding-bottom:10px;margin-bottom:16px;">
            <h1 style="font-size:20px;margin:0;color:#0f766e;">Liste des aérodromes</h1>
            <div style="font-size:11px;color:#475569;margin-top:4px;">SGDA V5 — ${filteredAerodromes.length} aérodrome${filteredAerodromes.length > 1 ? 's' : ''} — généré le ${new Date().toLocaleDateString('fr-FR')}</div>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#f1f5f9;">
              <th style="padding:5px 8px;font-size:10px;text-align:left;color:#475569;">#</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;color:#475569;">Nom</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;color:#475569;">Code OACI</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;color:#475569;">Région</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;color:#475569;">Type</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;color:#475569;">Statut</th>
              <th style="padding:5px 8px;font-size:10px;text-align:left;color:#475569;">Risque</th>
            </tr>
            ${rows}
          </table>
          <div style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;color:#94a3b8;">
            Ce rapport reflète les filtres actifs au moment de l'export (recherche, région, type, statut, niveau de risque).
          </div>
        </div>
      </body></html>`;

    const result = await generatePDFFromHTMLString(html, {
      title: `Liste des aérodromes — ${new Date().toISOString().slice(0, 10)}`,
      author: 'SGDA V5',
      subject: 'Liste des aérodromes',
      keywords: ['SGDA', 'aérodromes', 'liste'],
      header: { text: 'SGDA V5 — Aérodromes', height: 10 },
      footer: { text: 'Rapport généré par le module Aérodromes', height: 10 },
    });
    if (!result.success || !result.blob) throw new Error(result.error || 'Génération impossible');
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a'); a.href = url; a.download = `aerodromes-liste-${new Date().toISOString().split('T')[0]}.pdf`; a.click();
    URL.revokeObjectURL(url);
    notify('success', 'Rapport PDF généré', `${filteredAerodromes.length} aérodromes`);
  } catch (error) {
    console.error('Erreur export liste PDF:', error);
    notify('error', 'Échec export PDF', error instanceof Error ? error.message : 'Erreur inconnue');
  } finally {
    setExporting(false);
  }
}

/** Export PDF de la fiche d'un aérodrome. */
export async function exporterFichePDF(args: {
  aero: Aerodrome;
  ctx: ContexteFiche;
  setExporting: (v: boolean) => void;
  closeExportModal: () => void;
  notify: Notify;
}): Promise<void> {
  const { aero, ctx, setExporting, closeExportModal, notify } = args;
  const { profilsRisque, certifications, homologations, ecarts, surveillances } = ctx;
  setExporting(true);
  closeExportModal();
  try {
    const pdf = await creerRapportPdf();

    const profil = profilsRisque[aero.id];
    const risqueLabel = profil?.niveau ? profil.niveau.charAt(0).toUpperCase() + profil.niveau.slice(1) : '—';
    const certif = certifications?.find(c => c.aerodrome_id === aero.id);
    const homolog = homologations?.find(h => h.aerodrome_id === aero.id);
    const ecartsAero = (ecarts || []).filter(e => e.aerodrome_id === aero.id);
    const ecartsOuverts = ecartsAero.filter(e => e.statut !== 'cloture');
    const surveillancesAero = (surveillances || []).filter(s => s.aerodrome_id === aero.id)
      .sort((x, y) => new Date(y.date_fin).getTime() - new Date(x.date_fin).getTime());
    const derniereSurv = surveillancesAero.find(s => s.statut === 'transmise');
    const typeApp = aero.type_entite === 'helistation' ? 'Hélistation' : aero.type_entite === 'mixte' ? 'Site mixte' : 'Aérodrome';
    const date = new Date().toISOString().split('T')[0];
    const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

    pdf.coverPage({
      titre: 'FICHE D’INFORMATION AÉRODROME',
      sousTitre: `${aero.nom} (${aero.code_oaci}) — ${typeApp}`,
      ref: `FICHE-${aero.code_oaci}-${date.replace(/-/g, '')}`,
      meta: [
        ['Nom', aero.nom],
        ['Code OACI', aero.code_oaci],
        ['Département', aero.departement || 'DNSA'],
        ['Région', aero.region],
        ['Type', aero.type === 'international' ? 'International' : 'National'],
        ['Statut', aero.statut],
      ],
    });

    pdf.addPage();

    pdf.kpiBoxes([
      { value: profil ? `${Math.round(profil.score_global)}/100` : '—', label: 'Score de risque', color: profil ? (profil.score_global >= 70 ? PDF_COLORS.red : profil.score_global >= 40 ? PDF_COLORS.amber : PDF_COLORS.green) : PDF_COLORS.gray },
      { value: risqueLabel, label: 'Niveau de risque', color: PDF_COLORS.primary },
      { value: `${ecartsOuverts.length}`, label: 'Écarts ouverts', color: ecartsOuverts.length > 0 ? PDF_COLORS.red : PDF_COLORS.green },
      { value: aero.statut_sgs === 'non_applicable' ? 'Non applicable' : profil ? `${Math.round(profil.c1)}/100` : '—', label: 'Maturité SGS (C1)', color: aero.statut_sgs === 'non_applicable' ? PDF_COLORS.gray : PDF_COLORS.blue },
      { value: `${surveillancesAero.length}`, label: 'Surveillances', color: PDF_COLORS.primary },
      { value: derniereSurv ? new Date(derniereSurv.date_fin).toLocaleDateString('fr-FR') : '—', label: 'Dernière transmise', color: PDF_COLORS.gray },
    ]);

    pdf.sectionTitle('1. Identification');
    pdf.kvTable([
      ['Nom', aero.nom],
      ['Code OACI', aero.code_oaci],
      ['Département', aero.departement || 'DNSA'],
      ['Type', aero.type === 'international' ? 'International' : 'National'],
      ['Nature', typeApp],
      ['Région', aero.region],
      ['Catégorie SSLIA', aero.categorie_sslia || '—'],
      ['Statut', aero.statut],
      ['Coordonnées', `${aero.lat.toFixed(5)}, ${aero.lon.toFixed(5)}`],
      ['Altitude', aero.altitude ? `${aero.altitude} m` : '—'],
      ['Horaires', aero.horaires === 'h24' ? '24h/24' : aero.horaires === 'jour' ? 'Jour' : '—'],
    ]);

    pdf.sectionTitle('2. Exploitant');
    const contactsExploitant = (aero.contacts || []).map((c, i) => `${c.nom}${c.poste ? ' — ' + c.poste : ''}${c.email ? ' · ' + c.email : ''}${c.telephone ? ' · ' + c.telephone : ''}`);
    pdf.kvTable([
      ['Nom', aero.exploitant_nom || '—'],
      ['Adresse', aero.exploitant_adresse || '—'],
      ['Téléphone', aero.exploitant_telephone || '—'],
      ['Contacts', contactsExploitant.length > 0 ? contactsExploitant.join('\n') : '—'],
    ]);

    pdf.sectionTitle('3. Infrastructure — Piste principale');
    const piste = aero.piste_principale;
    pdf.kvTable(piste ? [
      ['Longueur', `${piste.longueur} m`],
      ['Largeur', `${piste.largeur} m`],
      ['Orientation', piste.orientation || '—'],
      ['Revêtement', piste.revetement || '—'],
      ['PCR (classification)', piste.pcr ? `${piste.pcr}` : '—'],
      ['Code de référence OACI', piste.code_reference || '—'],
      ['Type d\'approche', piste.type_approche ? (({ a_vue: 'À vue', classique: 'Classique', cat1: 'CAT I', cat2: 'CAT II' }) as Record<string, string>)[piste.type_approche] || piste.type_approche : '—'],
      ['Avion de référence', piste.avion_reference || '—'],
    ] : [['Piste principale', 'Aucune donnée']]);

    const heli = aero.helistation;
    if (heli) {
      pdf.sectionTitle('3bis. Hélistation / Plate-forme');
      pdf.kvTable([
        ['Indicatif radio (RT)', heli.indicatif_rt || '—'],
        ['Identification', heli.identification || '—'],
        ['Marque distinctive', heli.marque_distinctive || '—'],
        ['Type d\'installation', heli.type_installation ? (({ plateforme_autoelevee: 'Plate-forme auto-élévatrice', plateforme_fixe: 'Plate-forme fixe', plateforme_flottante: 'Plate-forme flottante', terrestre: 'Terrestre', navire: 'Navire', autre: 'Autre' }) as Record<string, string>)[heli.type_installation] || heli.type_installation : '—'],
        ['Valeur D (diamètre max admis)', heli.valeur_d ? `${heli.valeur_d} m` : '—'],
        ['Altitude plate-forme', heli.altitude_ft ? `${heli.altitude_ft} ft` : '—'],
        ['Cap magnétique (FATO)', heli.cap ? `${heli.cap}°` : '—'],
        ['MTOW max admis', heli.mtom ? `${heli.mtom} t` : '—'],
        ['Moyen de communication', heli.moyen_com ? (({ VHF: 'VHF', UHF: 'UHF', HF: 'HF', SATCOM: 'SATCOM' }) as Record<string, string>)[heli.moyen_com] || heli.moyen_com : '—'],
        ['Fréquence COM', heli.frequence_com || '—'],
        ['Avitaillement', heli.avitaillement ? 'Oui' : 'Non'],
        ['GPU (groupe de puissance)', heli.gpu ? 'Oui' : 'Non'],
        ['Équipement incendie', heli.equipement_incendie || '—'],
      ]);
    }

    pdf.sectionTitle('4. Sécurité et risque');
    pdf.kvTable([
      ['Score global', profil ? `${Math.round(profil.score_global)}/100` : '—'],
      ['Niveau de risque', risqueLabel],
      ['Composante C1 (SGS)', aero.statut_sgs === 'non_applicable' ? 'Non applicable (exclu du score)' : profil ? `${Math.round(profil.c1)}/100` : '—'],
      ['Composante C2 (Sécurité opérationnelle)', profil ? `${Math.round(profil.c2)}/100` : '—'],
      ['Composante C3 (Surveillance)', profil ? `${Math.round(profil.c3)}/100` : '—'],
      ['Composante C4 (Conformité)', profil ? `${Math.round(profil.c4)}/100` : '—'],
      ['Composante C5 (Résilience & historique)', profil ? `${Math.round(profil.c5)}/100` : '—'],
      ['Tendance', profil?.tendance === 'hausse' ? 'Hausse' : profil?.tendance === 'baisse' ? 'Baisse' : 'Stable'],
      ['Prédiction 3 mois', profil?.prediction_3m ? `${Math.round(profil.prediction_3m)}` : '—'],
      ['Prédiction 6 mois', profil?.prediction_6m ? `${Math.round(profil.prediction_6m)}` : '—'],
    ]);

    pdf.sectionTitle('5. Certification / Homologation');
    const certifDelivrance = certif?.date_delivrance || certif?.phases_data?.phase4?.date_delivrance;
    const certifExpiration = certif?.date_expiration || certif?.phases_data?.phase4?.date_expiration;
    pdf.subHeading('Certification');
    pdf.kvTable(certif ? [
      ['Statut global', certif.statut_global],
      ['Type', certif.type_certification === 'initiale' ? 'Initiale' : certif.type_certification === 'renouvellement' ? 'Renouvellement' : '—'],
      ['N° certificat', certif.numero_cert || certif.phases_data?.phase4?.numero_certificat || '—'],
      ['Date de délivrance', fmt(certifDelivrance)],
      ['Date d\'expiration', fmt(certifExpiration)],
      ['Conditions / limitations', certif.phases_data?.phase4?.conditions_exploitation || certif.phases_data?.phase4?.limitations || '—'],
      ['Statut officiel AIP', certif.phases_data?.phase5?.statut_officiel || '—'],
      ['Référence AIP', certif.phases_data?.phase5?.reference_aip || '—'],
    ] : [['Certification', 'Non certifié']]);

    const homologDelivrance = homolog?.date_delivrance || homolog?.phases_data?.phase3?.date_delivrance;
    const homologExpiration = homolog?.date_expiration || homolog?.phases_data?.phase3?.date_expiration;
    pdf.subHeading('Homologation');
    pdf.kvTable(homolog ? [
      ['Statut global', homolog.statut_global],
      ['Type', homolog.type_homologation === 'initiale' ? 'Initiale' : homolog.type_homologation === 'renouvellement' ? 'Renouvellement' : '—'],
      ['N° décision', homolog.numero_decision || homolog.phases_data?.phase3?.numero_decision || '—'],
      ['Date de délivrance', fmt(homologDelivrance)],
      ['Date d\'expiration', fmt(homologExpiration)],
      ['Conditions d\'exploitation', homolog.phases_data?.phase3?.conditions_exploitation || '—'],
      ['Décision finale', homolog.phases_data?.phase3?.nature_decision || '—'],
    ] : [['Homologation', 'Non homologué']]);

    pdf.sectionTitle(`6. Écarts ouverts (${ecartsOuverts.length})`);
    if (ecartsOuverts.length > 0) {
      pdf.table({
        head: [['#', 'Réf.', 'Libellé', 'Risque', 'Échéance PAC']],
        body: ecartsOuverts.map((e, i) => [
          String(i + 1), e.reference || '—', e.libelle, e.niveau_risque,
          e.delai_pac ? new Date(e.delai_pac).toLocaleDateString('fr-FR') : '—',
        ]),
      });
    } else {
      pdf.paragraph('Aucun écart ouvert.');
    }

    pdf.sectionTitle(`7. Historique des surveillances (${surveillancesAero.length})`);
    if (surveillancesAero.length > 0) {
      pdf.table({
        head: [['#', 'Type', 'Début', 'Fin', 'Statut']],
        body: surveillancesAero.slice(0, 10).map((s, i) => [
          String(i + 1), s.type,
          s.date_debut ? new Date(s.date_debut).toLocaleDateString('fr-FR') : '—',
          s.date_fin ? new Date(s.date_fin).toLocaleDateString('fr-FR') : '—',
          s.statut,
        ]),
      });
    } else {
      pdf.paragraph('Aucune surveillance enregistrée.');
    }

    pdf.paragraph(`Fiche d'information aérodrome générée par SGDA V5 à partir des données locales du poste (consultable hors ligne).${derniereSurv ? ` Dernière surveillance transmise : ${new Date(derniereSurv.date_fin).toLocaleDateString('fr-FR')}.` : ''}`, 8, { color: PDF_COLORS.gray, italic: true });

    pdf.drawFooter('SGDA V5 — FICHE AÉRODROME — ANACIM / Direction de la Navigation Aérienne');
    const blob = pdf.blob();
    downloadBlob(blob, `fiche-${aero.code_oaci}-${date}.pdf`);
    notify('success', 'Fiche PDF générée', aero.code_oaci);
  } catch (error) {
    console.error('Erreur export fiche PDF:', error);
    notify('error', 'Échec export PDF', error instanceof Error ? error.message : 'Erreur inconnue');
  } finally {
    setExporting(false);
  }
}
