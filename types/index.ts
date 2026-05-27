// types/index.ts
// ✅ Export centralisé de tous les types

export * from './surveillance';
// Checklist types imported directly from @/types/checklist when needed

// Réexporter les types du store si nécessaire
export type {
  Aerodrome,
  Certification,
  Homologation,
  Planning,
  ProfilRisque,
  Notification,
  Surveillance,
  Ecart,
  EvenementSecurite,
  Enquete,
  Message,
  Utilisateur,
  Dossier,
  Formation,
  KitDocument,
  CodeAcces,
  AuditLog
} from '@/lib/store';