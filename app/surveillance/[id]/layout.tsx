// app/surveillance/[id]/layout.tsx
// Layout partagé pour toutes les pages surveillance — évite le rechargement complet
export default function SurveillanceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
