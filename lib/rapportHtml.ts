// lib/rapportHtml.ts
// Générateurs HTML partagés entre SurveillanceRapport.tsx et reportAgent.ts
// Toutes les fonctions sont pures — elles prennent les données en paramètres.

export function generateEquipeTableHtml(
  membres: Array<{ prenom?: string; nom?: string; service?: string; specialites?: string | string[]; role?: string; id?: string }>,
  chefId?: string,
): string {
  if (membres.length === 0) return '<p>Aucune équipe assignée</p>';
  let html = '<table class="table"><thead><tr><th>Nom</th><th>Fonction</th><th>Rôle</th></tr></thead><tbody>';
  for (const u of membres) {
    const specs = Array.isArray(u.specialites) ? u.specialites.join(', ') : (u.specialites || u.service || '-');
    const role = (u.role === 'chef_equipe' || u.id === chefId) ? "Chef d'équipe" : 'Inspecteur';
    html += `<tr><td>${u.prenom || ''} ${u.nom || ''}</td><td>${specs}</td><td>${role}</td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

export function generateEcartsTableHtml(
  ecarts: Array<{ reference: string; libelle: string; niveau_risque: string; statut: string }>,
): string {
  if (ecarts.length === 0) return '<p>Aucun écart constaté</p>';
  let html = '<table class="table"><thead><tr><th>Référence</th><th>Libellé</th><th>Niveau</th><th>Statut</th></tr></thead><tbody>';
  for (const e of ecarts) {
    const badge = e.niveau_risque === 'critique' ? 'danger' : e.niveau_risque === 'eleve' ? 'warning' : 'primary';
    html += `<tr><td class="code-oaci-badge">${e.reference}</td><td>${e.libelle}</td><td><span class="badge ${badge}">${e.niveau_risque}</span></td><td>${e.statut}</td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

export function generateResultsSimpleHtml(
  stats: { total: number; sa: number; ns: number; nv: number },
): string {
  const denominator = stats.sa + stats.ns + stats.nv;
  const taux = denominator > 0 ? Math.round((stats.sa / denominator) * 100) : 0;
  const color = taux >= 70 ? '#10b981' : taux >= 50 ? '#f59e0b' : '#ef4444';
  return `
    <div>
      <h3>Synthèse des constats</h3>
      <ul>
        <li>Satisfaisant (SA): ${stats.sa}</li>
        <li>Non satisfaisant (NS): ${stats.ns}</li>
        <li>Non vérifié (NV): ${stats.nv}</li>
        <li><strong>Taux de conformité: ${taux}%</strong></li>
      </ul>
      <div class="progress h-2 mt-2">
        <div class="progress-bar" style="width: ${taux}%; background-color: ${color}"></div>
      </div>
    </div>`;
}
