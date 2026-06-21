import type { UserRole, LanguageCode, OrderStatus, FormType } from './enums';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  language: LanguageCode;
  role: UserRole;
  phone: string | null;
  timezone: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranslationsOrder {
  id: string;
  user_id: string | null;
  source_language: LanguageCode;
  target_language: LanguageCode;
  document_type: string;
  page_count: number | null;
  status: OrderStatus;
  price_usd: number | null;
  paid_at: string | null;
  delivered_at: string | null;
  uscis_certified: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormSession {
  id: string;
  user_id: string | null;
  form_type: FormType;
  language: LanguageCode;
  started_at: string;
  completed_at: string | null;
  last_step: string | null;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface FormAnswer {
  id: string;
  session_id: string;
  question_key: string;
  answer_value: string | null;
  answered_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  ip_hash: string | null;
  created_at: string;
}
