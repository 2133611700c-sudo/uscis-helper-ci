import type { ServerClient } from '../client';
import type { Profile } from '../types/tables';

export async function getProfile(db: ServerClient, userId: string): Promise<Profile | null> {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function upsertProfile(
  db: ServerClient,
  profile: Partial<Profile> & { id: string },
): Promise<Profile> {
  const { data, error } = await db
    .from('profiles')
    .upsert({ ...profile, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}
