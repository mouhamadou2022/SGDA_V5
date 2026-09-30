// components/modules/signatures/SignaturesModule.tsx
// Module Signatures DG ANACIM — PLACEHOLDER : fonctionnalité à implémenter
// ultérieurement (signature électronique qualifiée). L'implémentation
// précédente est conservée dans l'historique git.
'use client'

import { PenLine, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ModuleHeader } from '@/components/layout/ModuleHeader'

interface SignaturesModuleProps {
  userRole: string
  userId: string
}

export default function SignaturesModule({ userRole, userId }: SignaturesModuleProps) {
  void userRole
  void userId
  return (
    <div className="space-y-6 animate-fade-in" data-module="signatures">
      <ModuleHeader
        icon={<PenLine className="w-6 h-6 text-white" />}
        title="Signatures DG"
        description="Signature des rapports et lettres de surveillance"
      />
      <Card
        icon={<Clock className="h-5 w-5 text-role-primary" />}
        title="Fonctionnalité à implémenter plus tard"
      >
        <div className="py-8 text-center">
          <PenLine className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-foreground">La signature électronique DG sera disponible dans une prochaine version.</p>
          <p className="text-sm text-muted-foreground mt-2">
            En attendant, les rapports et lettres suivent le circuit actuel : rédaction par l'équipe d'inspection,
            transmission, puis signature physique avant envoi aux exploitants.
          </p>
        </div>
      </Card>
    </div>
  )
}
