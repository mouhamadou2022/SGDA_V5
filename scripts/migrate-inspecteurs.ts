import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import * as path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Charger .env.local
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY requis dans .env')
  process.exit(1)
}

const supabase = createClient(url, key)

async function migrate() {
  console.log('--- Migration inspecteurs ---\n')

  // 1. Charger tous les inspecteurs
  const { data: inspecteurs, error: errIns } = await supabase.from('inspecteurs').select('*')
  if (errIns) { console.error('❌ Erreur chargement inspecteurs:', errIns.message); return }
  if (!inspecteurs || inspecteurs.length === 0) { console.log('Aucun inspecteur trouvé.'); return }
  console.log(`📋 ${inspecteurs.length} inspecteur(s) trouvé(s)`)

  // 2. Charger tous les utilisateurs existants
  const { data: utilisateurs } = await supabase.from('utilisateurs').select('id')
  const userIdsExistants = new Set((utilisateurs || []).map(u => u.id))

  // 3. Charger les compétences de la table séparée
  const { data: competencesTable } = await supabase.from('competences').select('*')
  const competencesParInsp = new Map<string, any[]>()
  for (const c of competencesTable || []) {
    const list = competencesParInsp.get(c.inspecteur_id) || []
    list.push(c)
    competencesParInsp.set(c.inspecteur_id, list)
  }

  let usersCrees = 0
  let competencesMigrees = 0
  let erreurs = 0

  for (const ins of inspecteurs) {
    const userId = ins.user_id

    // ── Étape A : Créer utilisateur manquant ──
    if (userId && !userIdsExistants.has(userId)) {
      const roleMap: Record<string, string> = {
        inspecteur_principal: 'inspector',
        inspecteur_titulaire: 'inspector',
        inspecteur_stagiaire: 'inspector',
        cadre_technique: 'inspector',
      }
      const newUser = {
        id: userId,
        email: ins.email || `${ins.prenom?.toLowerCase()}.${ins.nom?.toLowerCase()}@anacim.sn`,
        prenom: ins.prenom || '',
        nom: ins.nom || '',
        role: roleMap[ins.type] || 'inspector',
        statut: 'actif',
        matricule: ins.matricule || '',
        service: ins.service || null,
        type_inspecteur: ins.type || null,
        inspecteur_id: ins.id,
        telephone: ins.telephone || null,
        notifications_email: true,
        notifications_sms: false,
        created_at: ins.created_at || new Date().toISOString(),
      }
      const { error } = await supabase.from('utilisateurs').insert(newUser)
      if (error) {
        console.error(`  ❌ Utilisateur ${ins.prenom} ${ins.nom} (${ins.id}):`, error.message)
        erreurs++
      } else {
        console.log(`  ✅ Utilisateur créé : ${ins.prenom} ${ins.nom} (${userId.slice(0, 8)}…)`)
        usersCrees++
      }
    }

    // ── Étape B : Migrer competences string[] → Competence[] ──
    const competences = ins.competences
    if (Array.isArray(competences) && competences.length > 0) {
      const estString = typeof competences[0] === 'string'
      if (estString) {
        // Fusionner avec les compétences de la table séparée
        const compsTable = competencesParInsp.get(ins.id) || []
        const domainesTable = new Set(compsTable.map(c => c.domaine))
        const merged: any[] = [
          ...compsTable,
          ...competences
            .filter((d: string) => !domainesTable.has(d))
            .map((d: string) => ({ id: crypto.randomUUID(), inspecteur_id: ins.id, domaine: d, niveau: 1, source: 'migration' })),
        ]
        const { error } = await supabase.from('inspecteurs').update({ competences: merged }).eq('id', ins.id)
        if (error) {
          console.error(`  ❌ Competences ${ins.prenom} ${ins.nom}:`, error.message)
          erreurs++
        } else {
          console.log(`  🔄 Competences migrées : ${ins.prenom} ${ins.nom} (${competences.length} → ${merged.length} objets)`)
          competencesMigrees++
        }
      }
    }

    // ── Étape C : Inspecteur sans user_id → créer l'user_id si possible ──
    if (!userId) {
      const email = ins.email || `${ins.prenom?.toLowerCase()}.${ins.nom?.toLowerCase()}@anacim.sn`
      // Chercher un utilisateur avec cet email
      const { data: match } = await supabase.from('utilisateurs').select('id').eq('email', email).maybeSingle()
      if (match) {
        const { error } = await supabase.from('inspecteurs').update({ user_id: match.id }).eq('id', ins.id)
        if (!error) console.log(`  🔗 Lien user_id rétabli : ${ins.prenom} ${ins.nom} → ${match.id.slice(0, 8)}…`)
      }
    }
  }

  console.log(`\n--- Bilan ---`)
  console.log(`✅ ${usersCrees} utilisateur(s) créé(s)`)
  console.log(`🔄 ${competencesMigrees} inspecteur(s) avec competences migrées`)
  console.log(`❌ ${erreurs} erreur(s)`)
  console.log('Terminé.')
}

migrate()
