// Server-side auth + membership helpers. Answers "who is this request" and
// "what companies do they belong to, in what role". Used by the new auth pages
// and org routes. Data access elsewhere still goes through the anon client;
// this layer is about identity, not row security (RLS is a later stage).

import { createSupabaseServer } from '@/lib/supabase-auth'
import { createClient } from '@supabase/supabase-js'

// Plain anon client for reading org tables from server routes (no session needed).
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export type Role = 'owner' | 'admin' | 'member'
export type OrgMembership = { org_id: string; name: string; role: Role; join_code: string | null }

/** The signed-in user, or null. Verified against Supabase (not just cookie-trusted). */
export async function getUser() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

/** Every company this user belongs to, with their role in each. */
export async function getUserOrgs(userId: string): Promise<OrgMembership[]> {
  const { data } = await db
    .from('org_members')
    .select('role, org_id, organizations(name, join_code)')
    .eq('user_id', userId)
  return (data ?? []).map((m: any) => ({
    org_id: m.org_id,
    role: m.role as Role,
    name: m.organizations?.name ?? 'Company',
    join_code: m.organizations?.join_code ?? null,
  }))
}

/** This user's role in one company, or null if not a member. */
export async function getRole(userId: string, orgId: string): Promise<Role | null> {
  const { data } = await db
    .from('org_members')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle()
  return (data?.role as Role) ?? null
}

export const canManageTeam = (role: Role | null) => role === 'owner' || role === 'admin'
