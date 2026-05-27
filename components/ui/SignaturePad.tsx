// components/ui/SignaturePad.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import { isSignatureValid, uploadSignature, saveSignature } from '@/lib/signature'
import { AuthUser } from '@/lib/auth'
import { PenLine, RotateCcw, Check, X } from 'lucide-react'
import { Button } from './button'

interface SignaturePadProps {
  user: AuthUser
  documentType: 'lettre' | 'certificat' | 'decision' | 'rapport' | 'checklist'
  documentId: string
  onSigned?: (signatureUrl: string) => void
  onCancel?: () => void
  width?: number
  height?: number
}

export function SignaturePadComponent({ 
  user, 
  documentType, 
  documentId, 
  onSigned, 
  onCancel,
  width = 500,
  height = 200
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [signaturePad, setSignaturePad] = useState<SignaturePad | null>(null)
  const [isSigning, setIsSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    canvas.width = width
    canvas.height = height

    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = width * ratio
    canvas.height = height * ratio
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = '#1a237e'
      ctx.lineWidth = 2
    }

    const pad = new SignaturePad(canvas, {
      penColor: '#1a237e',
      backgroundColor: 'white',
      minWidth: 1,
      maxWidth: 3,
      throttle: 16
    })

    setSignaturePad(pad)

    return () => {
      pad.off()
    }
  }, [width, height])

  const handleClear = () => {
    if (signaturePad) {
      signaturePad.clear()
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) {
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
      }
    }
  }

  const handleSign = async () => {
    if (!canvasRef.current || !signaturePad) return
    
    setError(null)
    setIsSigning(true)

    try {
      if (!isSignatureValid(canvasRef.current)) {
        throw new Error('Veuillez signer le document')
      }

      const signatureUrl = await uploadSignature(
        canvasRef.current,
        user.id,
        documentType,
        documentId
      )

      if (!signatureUrl) {
        throw new Error("Erreur lors de l'upload de la signature")
      }

      const signature = await saveSignature(
        user.id,
        `${user.prenom} ${user.nom}`,
        documentType,
        documentId,
        signatureUrl
      )

      if (!signature) {
        throw new Error("Erreur lors de l'enregistrement de la signature")
      }

      onSigned?.(signatureUrl)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setIsSigning(false)
    }
  }

  return (
    <div className="space-y-4" data-role={user.role}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenLine size={20} className="text-role-primary" />
          <h3 className="font-medium text-foreground">Signature</h3>
        </div>
        <div className="text-sm text-muted">
          Signataire: {user.prenom} {user.nom}
        </div>
      </div>

      <div className="border-2 border-border rounded-xl bg-white p-1">
        <canvas
          ref={canvasRef}
          className="w-full h-auto touch-none"
          style={{ 
            width: width + 'px', 
            height: height + 'px',
            maxWidth: '100%'
          }}
        />
      </div>

      {error && (
        <div className="p-3 text-sm text-danger bg-danger/10 rounded-xl border border-danger/20">
          {error}
        </div>
      )}

      <p className="text-xs text-muted">
        ✍️ Signez dans la zone ci-dessus (compatible tablette, stylet et souris)
      </p>

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleClear}
          disabled={isSigning}
          className="btn-secondary"
        >
          <RotateCcw size={16} className="mr-2" />
          Effacer
        </Button>
        
        <Button
          onClick={handleSign}
          disabled={isSigning}
          className="btn-primary"
        >
          <Check size={16} className="mr-2" />
          {isSigning ? 'Signature en cours...' : 'Valider la signature'}
        </Button>

        {onCancel && (
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSigning}
            className="btn-secondary"
          >
            <X size={16} className="mr-2" />
            Annuler
          </Button>
        )}
      </div>
    </div>
  )
}