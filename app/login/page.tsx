'use client';

import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center p-8">
        <h1 className="text-xl font-bold text-foreground mb-4">Session expirée</h1>
        <p className="text-muted-foreground mb-6">Votre session a expiré. Veuillez retourner à l&apos;accueil pour vous reconnecter.</p>
        <Link href="/" className="btn btn-primary gap-2">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
