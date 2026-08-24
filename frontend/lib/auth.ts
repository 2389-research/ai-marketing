// Server-side auth + membership helpers. Answers "who is this request" and
// "what companies do they belong to, in what role". Used by the new auth pages
// and org routes. Data access elsewhere still goes through the anon client;
// this layer is about identity, not row security (RLS is a later stage).

import { createSupabaseServer } from '@/lib/supabase-auth'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const ACTIVE_ORG = 'active_org'

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

/** The company the user is currently working in: the active_org cookie if it's
 *  one they belong to, otherwise their first membership. */
export async function getActiveOrg(userId: string): Promise<OrgMembership | null> {
  const orgs = await getUserOrgs(userId)
  if (orgs.length === 0) return null
  const cookieStore = await cookies()
  const wanted = cookieStore.get(ACTIVE_ORG)?.value
  return orgs.find(o => o.org_id === wanted) ?? orgs[0]
}

export type Member = { user_id: string; role: Role; email: string; full_name: string | null }

/** Members of a company, with names/emails from the profiles mirror. */
export async function listMembers(orgId: string): Promise<Member[]> {
  const { data } = await db
    .from('org_members')
    .select('user_id, role, profiles(email, full_name)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  return (data ?? []).map((m: any) => ({
    user_id: m.user_id,
    role: m.role as Role,
    email: m.profiles?.email ?? '',
    full_name: m.profiles?.full_name ?? null,
  }))
}
