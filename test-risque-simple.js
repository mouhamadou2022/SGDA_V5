// test-risque-simple.js
// À exécuter avec: node test-risque-simple.js

console.log('🧪 TEST SIMPLIFIÉ DU MODULE DE RISQUE')
console.log('=====================================\n')

// Version simplifiée des fonctions de calcul
function calculerC1(maturite_sgs, score_enquetes) {
  const scoreMaturite = ((maturite_sgs - 1) / 4) * 100
  if (!score_enquetes) return Math.round(scoreMaturite)
  return Math.round((scoreMaturite * 0.7) + (score_enquetes * 0.3))
}

function calculerC2(ecarts) {
  const ecartsClotures = ecarts.filter(e => e.statut === 'cloture')
  if (ecartsClotures.length === 0) return 100
  
  let scoreTotal = 0
  for (const ecart of ecartsClotures) {
    const dateCreation = new Date(ecart.created_at)
    const dateCloture = new Date(ecart.updated_at)
    const delaiEffectif = Math.floor((dateCloture - dateCreation) / (1000 * 60 * 60 * 24))
    const delaiEcheance = parseInt(ecart.delai_regularisation) || 30
    const ratio = Math.min(delaiEffectif / delaiEcheance, 2)
    const scoreEcart = Math.max(100 - (ratio * 50), 0)
    scoreTotal += scoreEcart
  }
  return Math.round(scoreTotal / ecartsClotures.length)
}

function calculerC3(surveillances) {
  if (surveillances.length === 0) return 100
  
  const dernieres = surveillances
    .filter(s => s.score_global !== undefined)
    .sort((a, b) => new Date(b.date_fin) - new Date(a.date_fin))
    .slice(0, 5)
  
  if (dernieres.length === 0) return 100
  
  let scorePondere = 0
  let poidsTotal = 0
  
  dernieres.forEach((surv, index) => {
    const poids = (index === 0) ? 2 : 1
    scorePondere += (surv.score_global || 0) * poids
    poidsTotal += poids
  })
  
  return Math.round(scorePondere / poidsTotal)
}

function calculerC4(ecarts) {
  const SEUIL_MAX = 50
  let penalite = 0
  
  for (const ecart of ecarts) {
    if (ecart.statut === 'cloture') continue
    switch (ecart.niveau_risque) {
      case 'critique': penalite += 4; break
      case 'eleve': penalite += 2; break
      case 'moyen': penalite += 1; break
    }
  }
  
  return Math.max(100 - Math.round((penalite / SEUIL_MAX) * 100), 0)
}

function calculerC5(evenements) {
  const POIDS = { accident: 40, incident_grave: 20, incident: 10, panne: 5 }
  const recents = evenements
  if (recents.length === 0) return 100
  
  let penalite = 0
  for (const evt of recents) {
    penalite += POIDS[evt.type] || 0
  }
  
  return Math.max(100 - penalite, 0)
}

function calculerScoreRisque(maturite_sgs, score_enquetes, ecarts, surveillances, evenements) {
  // Poids selon CDC section 4.1
  const POIDS_C1 = 0.20
  const POIDS_C2 = 0.25
  const POIDS_C3 = 0.20
  const POIDS_C4 = 0.20
  const POIDS_C5 = 0.15

  const c1 = calculerC1(maturite_sgs, score_enquetes)
  const c2 = calculerC2(ecarts)
  const c3 = calculerC3(surveillances)
  const c4 = calculerC4(ecarts)
  const c5 = calculerC5(evenements)
  
  const global = Math.round(
    (c1 * POIDS_C1) + (c2 * POIDS_C2) + (c3 * POIDS_C3) + 
    (c4 * POIDS_C4) + (c5 * POIDS_C5)
  )
  
  // Niveau de risque selon CDC section 4.2
  let niveau = 'excellent'
  if (global < 80) niveau = 'bon'
  if (global < 60) niveau = 'modere'
  if (global < 30) niveau = 'critique'
  
  return {
    global,
    niveau,
    c1,
    c2,
    c3,
    c4,
    c5,
    tendance: 'stable',
    prediction_3m: global,
    prediction_6m: global,
    computed_at: new Date().toLocaleString('fr-SN')
  }
}

// ===== DONNÉES DE TEST =====
console.log('📊 Données de test préparées...\n')

const ecarts = [
  { 
    id: '1', 
    niveau_risque: 'critique', 
    statut: 'ouvert', 
    delai_regularisation: '30', 
    created_at: '2025-01-01', 
    updated_at: '2025-02-15' 
  },
  { 
    id: '2', 
    niveau_risque: 'eleve', 
    statut: 'ouvert', 
    delai_regularisation: '20', 
    created_at: '2025-01-10', 
    updated_at: '2025-01-25' 
  },
  { 
    id: '3', 
    niveau_risque: 'moyen', 
    statut: 'cloture', 
    delai_regularisation: '15', 
    created_at: '2025-01-05', 
    updated_at: '2025-01-12' 
  },
  { 
    id: '4', 
    niveau_risque: 'faible', 
    statut: 'cloture', 
    delai_regularisation: '30', 
    created_at: '2024-12-01', 
    updated_at: '2025-01-20' 
  }
]

const surveillances = [
  { score_global: 95, date_fin: '2025-02-01' },
  { score_global: 82, date_fin: '2024-12-15' },
  { score_global: 68, date_fin: '2024-11-01' }
]

const evenements = [
  { type: 'incident', date: '2025-01-15' },
  { type: 'panne', date: '2024-12-20' }
]

// ===== TEST 1 : Aérodrome en bonne santé =====
console.log('📈 TEST 1 : Aérodrome en bonne santé')
console.log('   - Maturité SGS: N4')
console.log('   - Enquêtes: 85/100')
console.log('   - Écarts: seulement clôturés')
console.log('   - Surveillances: toutes')
console.log('   - Événements: 2 mineurs\n')

const score1 = calculerScoreRisque(
  4,           // maturité N4
  85,          // score enquêtes
  ecarts.filter(e => e.statut === 'cloture'), // seulement clôturés
  surveillances,
  evenements
)

console.log('RÉSULTAT:')
console.log(`   Score global: ${score1.global}/100 (${score1.niveau})`)
console.log(`   - C1 Maturité SGS: ${score1.c1}/100`)
console.log(`   - C2 Efficacité: ${score1.c2}/100`)
console.log(`   - C3 Conformité: ${score1.c3}/100`)
console.log(`   - C4 Charge critique: ${score1.c4}/100`)
console.log(`   - C5 Résilience: ${score1.c5}/100`)
console.log('')

// ===== TEST 2 : Aérodrome en difficulté =====
console.log('📉 TEST 2 : Aérodrome en difficulté')
console.log('   - Maturité SGS: N2')
console.log('   - Enquêtes: 45/100')
console.log('   - Écarts: tous (ouverts + clôturés)')
console.log('   - Surveillances: seulement la dernière')
console.log('   - Événements: 2\n')

const score2 = calculerScoreRisque(
  2,           // maturité N2
  45,          // score enquêtes
  ecarts,      // tous les écarts
  surveillances.slice(0, 1), // seulement la dernière
  evenements
)

console.log('RÉSULTAT:')
console.log(`   Score global: ${score2.global}/100 (${score2.niveau})`)
console.log(`   - C1 Maturité SGS: ${score2.c1}/100`)
console.log(`   - C2 Efficacité: ${score2.c2}/100`)
console.log(`   - C3 Conformité: ${score2.c3}/100`)
console.log(`   - C4 Charge critique: ${score2.c4}/100`)
console.log(`   - C5 Résilience: ${score2.c5}/100`)
console.log('')

// ===== TEST 3 : Aérodrome critique =====
console.log('🔥 TEST 3 : Aérodrome critique')
console.log('   - Maturité SGS: N1')
console.log('   - Enquêtes: 20/100')
console.log('   - Écarts: seulement les critiques ouverts')
console.log('   - Surveillances: aucune')
console.log('   - Événements: 2\n')

const score3 = calculerScoreRisque(
  1,           // maturité N1
  20,          // score enquêtes
  ecarts.filter(e => e.niveau_risque === 'critique' && e.statut === 'ouvert'),
  [],          // aucune surveillance
  evenements
)

console.log('RÉSULTAT:')
console.log(`   Score global: ${score3.global}/100 (${score3.niveau})`)
console.log(`   - C1 Maturité SGS: ${score3.c1}/100`)
console.log(`   - C2 Efficacité: ${score3.c2}/100`)
console.log(`   - C3 Conformité: ${score3.c3}/100`)
console.log(`   - C4 Charge critique: ${score3.c4}/100`)
console.log(`   - C5 Résilience: ${score3.c5}/100`)
console.log('')

console.log('✅ TEST TERMINÉ')
console.log('📅 Calculé le:', new Date().toLocaleString('fr-SN'))