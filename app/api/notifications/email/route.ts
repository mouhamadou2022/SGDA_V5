import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { to, subject, message, link, attachments } = await request.json();

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: false, reason: 'Email non configuré (pas de clé Resend)' });
    }

    const html = link
      ? `<p>${message}</p><p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">Voir les détails</a></p>`
      : `<p>${message}</p>`;

    let ResendClient: { new(apiKey: string): { emails: { send: (payload: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } } } | undefined
    try { ResendClient = (await import('resend')).Resend as never } catch { /* not found */ }
    if (!ResendClient) {
      return NextResponse.json({ error: 'Service email indisponible' }, { status: 503 });
    }
    const resend = new ResendClient(process.env.RESEND_API_KEY);

    console.log('[Email] Envoi à', to, '| Sujet:', subject)
    const { data, error } = await resend.emails.send({
      from: `SGDA ANACIM <notifications@${process.env.EMAIL_DOMAIN || process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'anacim.sn'}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(Array.isArray(attachments) && attachments.length > 0
        ? { attachments: attachments.map((a: { filename?: string; content?: string }) => ({
            filename: a.filename || 'document.pdf',
            content: a.content || '',
          })) }
        : {}),
    });

    if (error) {
      console.error('[Email] Erreur Resend:', error)
      const detail = error as { message?: string; name?: string; statusCode?: number }
      const message = typeof error === 'string'
        ? error
        : detail?.message || detail?.name || 'Erreur inconnue du service email'
      const aide = message.match(/only send testing emails|restricted to only send emails/i)
        ? ' La clé Resend est en mode test (sandbox) : elle ne peut envoyer qu\'à votre propre adresse. Pour envoyer aux inspecteurs, vérifiez un domaine sur https://resend.com/domains puis utilisez une clé de production et mettez à jour EMAIL_DOMAIN.'
        : message.match(/verify a domain/i)
          ? ' Le domaine de l\'expéditeur n\'est pas vérifié sur Resend. Ajoutez un domaine sur https://resend.com/domains et renseignez EMAIL_DOMAIN avec ce domaine.'
          : ''
      return NextResponse.json({ success: false, error: message + aide, detail: error }, { status: 400 });
    }
    console.log('[Email] Succès — ID:', (data as { id?: string } | null)?.id)
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
}
