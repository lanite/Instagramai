import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      searches: {
        Row: {
          id: string;
          user_id: string;
          niche: string;
          city: string;
          country: string;
          results: any[];
          lead_count: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          niche: string;
          city: string;
          country: string;
          results: any[];
          lead_count: number;
        };
      };
      usage: {
        Row: {
          id: string;
          user_id: string;
          search_count: number;
          is_premium: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          search_count: number;
          is_premium: boolean;
        };
      };
    };
  };
};
