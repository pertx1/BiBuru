// Tipos de la base de datos. Se regeneran con `npm run db:types` (ver README)
// cada vez que cambie una migración.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: { id: string; owner_id: string; name: string; created_at: string; updated_at: string };
        Insert: never;
        Update: { name?: string };
        Relationships: [];
      };
      workspace_members: {
        Row: { workspace_id: string; user_id: string; role: "owner" | "admin" | "member"; created_at: string };
        Insert: { workspace_id: string; user_id: string; role?: "owner" | "admin" | "member" };
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          default_workspace_id: string | null;
          display_name: string | null;
          timezone: string;
          daily_digest_time: string;
          quiet_hours_start: string;
          quiet_hours_end: string;
          ai_monthly_budget_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: {
          display_name?: string | null;
          timezone?: string;
          daily_digest_time?: string;
          quiet_hours_start?: string;
          quiet_hours_end?: string;
          ai_monthly_budget_cents?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
