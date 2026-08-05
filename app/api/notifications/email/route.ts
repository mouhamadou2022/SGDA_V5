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

    let ResendClient: any
    try { ResendClient = (await import('resend')).Resend } catch { /* not found */ }
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
      const message = typeof error === 'string'
        ? error
        : (error as { message?: string })?.message
          || (error as { name?: string })?.name
          || 'Erreur inconnue du service email'
      return NextResponse.json({ success: false, error: message, detail: error }, { status: 400 });
    }
    console.log('[Email] Succès — ID:', data?.id)
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
}
