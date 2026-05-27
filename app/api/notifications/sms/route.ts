import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { to, message } = await request.json()
    if (!to || !message) {
      return NextResponse.json({ error: 'Destinataire et message requis' }, { status: 400 })
    }

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilioModule = await import('twilio').catch(() => null) as { default: any } | null
      if (twilioModule) {
        const client = twilioModule.default(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        )
        const result = await client.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to,
        })
        return NextResponse.json({ data: result })
      }
      return NextResponse.json({ error: 'SMS service unavailable' }, { status: 503 })
    }

    if (process.env.SMS_PROVIDER === 'orange') {
      // Orange SMS API — à implémenter selon documentation partenaire
      console.log('[SMS] Orange provider sélectionné, envoi à', to)
      return NextResponse.json({ success: true, provider: 'orange' })
    }

    console.log('[SMS] Aucun fournisseur configuré. Simulation d\'envoi à', to)
    console.log('[SMS] Message:', message)
    return NextResponse.json({ success: true, simulated: true })
  } catch (error: any) {
    console.error('[SMS] Erreur:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}
