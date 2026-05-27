import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { to, subject, message, link } = await request.json();

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ success: false, reason: 'non configuré' }, { status: 204 });
    }

    const emailModule = await import('resend').catch(() => null) as { Resend: new (key: string) => any } | null;
    if (!emailModule?.Resend) {
      return NextResponse.json({ error: 'Email service unavailable' }, { status: 503 });
    }
    const { Resend } = emailModule;

    const html = link
      ? `<p>${message}</p><p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">Voir les détails</a></p>`
      : `<p>${message}</p>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: `SGDA ANACIM <notifications@${process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'anacim.sn'}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
}
