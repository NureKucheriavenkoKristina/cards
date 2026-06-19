import { supabase } from '@/src/lib/supabase';

function readAdminColumn(row: Record<string, unknown> | null | undefined): boolean {
  if (!row) return false;
  const v = row.isAdmin ?? row.isadmin ?? row.is_admin;
  return v === true || v === 'true' || v === 1;
}

/**
 * Resolves admin flag.
 *
 * Priority:
 *  1. `public.get_my_admin_status()` RPC (SECURITY DEFINER — bypasses UUID mismatch)
 *  2. Direct query of `public.users` by `user_id`
 *  3. Direct query of `public.users` by `email`
 */
export async function fetchIsAdmin(
  userId: string | undefined,
  email?: string | null,
): Promise<boolean> {
  if (!userId) return false;

  // 1. Use the reliable SECURITY DEFINER RPC (works after sync migration)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_admin_status');
    if (!rpcError && typeof rpcData === 'boolean') {
      return rpcData;
    }
  } catch {
    // RPC not yet deployed – fall through to legacy checks below
  }

  // 2. Legacy: query public.users by user_id
  for (const col of ['user_id', 'id'] as const) {
    const { data, error } = await supabase.from('users').select('*').eq(col, userId).maybeSingle();
    if (error) continue;
    if (data && readAdminColumn(data as Record<string, unknown>)) return true;
    if (data) return false;
  }

  // 3. Legacy: query public.users by email
  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail) {
    const { data: byEmail, error: emailErr } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (!emailErr && byEmail) {
      return readAdminColumn(byEmail as Record<string, unknown>);
    }
  }

  return false;
}
