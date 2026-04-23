// Auto-generated types matching the Supabase PostgreSQL schema.
// Run `npx supabase gen types typescript` to regenerate after schema changes.

export type VentureStatus = "proposed" | "ongoing" | "finished" | "cancelled";
export type MemberRole = "owner" | "co-organiser" | "volunteer";
export type TaskStatus = "open" | "in_progress" | "done";
export type NotifType = "venture_update" | "task_assigned" | "member_joined" | "message" | "system";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at">>;
      };
      ventures: {
        Row: Venture;
        Insert: Omit<Venture, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Venture, "id" | "created_at">>;
      };
      venture_members: {
        Row: VentureMember;
        Insert: Omit<VentureMember, "joined_at">;
        Update: Partial<Pick<VentureMember, "role">>;
      };
      tasks: {
        Row: Task;
        Insert: Omit<Task, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Task, "id" | "created_at">>;
      };
      activity_events: {
        Row: ActivityEvent;
        Insert: Omit<ActivityEvent, "id" | "created_at">;
        Update: never;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, "id" | "created_at">;
        Update: Partial<Pick<Notification, "read">>;
      };
      wallet_transactions: {
        Row: WalletTransaction;
        Insert: Omit<WalletTransaction, "id" | "created_at">;
        Update: never;
      };
    };
  };
}

export interface Profile {
  id: string; // matches auth.users.id
  username: string;
  full_name: string;
  avatar_url: string | null;
  about: string | null;
  location: string | null;
  display_name_pref: "username" | "full_name";
  city: string | null;
  joined_date: string;
  wallet_balance: number;
  push_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Venture {
  id: string;
  title: string;
  description: string;
  location: string;
  lat: number | null;
  lng: number | null;
  status: VentureStatus;
  owner_id: string;
  cover_image_url: string | null;
  max_members: number;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  spent: number;
  stream_channel_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VentureMember {
  venture_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
}

export interface Task {
  id: string;
  venture_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  created_by: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityEvent {
  id: string;
  venture_id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotifType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: "topup" | "payment" | "refund";
  amount: number;
  description: string;
  venture_id: string | null;
  created_at: string;
}
