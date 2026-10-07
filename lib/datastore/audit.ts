// lib/datastore/audit.ts — Domaine audit (journal traçabilité).
// Write-through best-effort : sans lui, le journal reste local au poste
// (la table audit_logs existe mais rien ne l'alimente depuis l'app).

import { supabase } from '../supabase';
import type { AuditLog } from '../store/auditSlice';
import { DatastoreResult } from './_shared';

export async function fetchAuditLogs(limit = 200): Promise<DatastoreResult<AuditLog[]>> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit);
  return { data: data as AuditLog[] | null, error: error?.message ?? null };
}

export async function createAuditLog(
  payload: Omit<AuditLog, 'id' | 'date'>,
): Promise<DatastoreResult<AuditLog>> {
  const { data, error } = await supabase
    .from('audit_logs')
    .insert({ ...payload, date: new Date().toISOString() })
    .select()
    .single();
  return { data: data as AuditLog | null, error: error?.message ?? null };
}
