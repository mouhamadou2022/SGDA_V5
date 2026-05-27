'use client';

import React, { useState } from 'react';

export default function LoginPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div>
      <input placeholder="prenom.nom@anacim.sn" />
      <input placeholder="••••••••" type="password" />
      <button onClick={() => setSubmitted(true)}>ACCÉDER À LA PLATEFORME</button>
      <div>AÉRODROMES À SURVEILLER</div>
      <div>INSPECTEURS ACTIFS</div>
      <div>CONFORMITÉ VISÉE</div>
      {submitted && <div>CONNEXION EN COURS</div>}
    </div>
  );
}
