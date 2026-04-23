-- ============================================================
-- CleanVentures — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor to set up all tables.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STEP 1: CREATE ALL TABLES (no RLS policies yet)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username          TEXT UNIQUE NOT NULL,
  full_name         TEXT NOT NULL,
  avatar_url        TEXT,
  about             TEXT,
  location          TEXT,
  city              TEXT,
  display_name_pref TEXT NOT NULL DEFAULT 'username'
                      CHECK (display_name_pref IN ('username', 'full_name')),
  wallet_balance    NUMERIC(10,2) NOT NULL DEFAULT 0,
  push_token        TEXT,
  joined_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ventures (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  location          TEXT NOT NULL DEFAULT '',
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  status            TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed', 'ongoing', 'finished', 'cancelled')),
  owner_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cover_image_url   TEXT,
  max_members       INTEGER NOT NULL DEFAULT 20,
  start_date        DATE,
  end_date          DATE,
  budget            NUMERIC(10,2) NOT NULL DEFAULT 0,
  spent             NUMERIC(10,2) NOT NULL DEFAULT 0,
  stream_channel_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.venture_members (
  venture_id  UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'volunteer'
                CHECK (role IN ('owner', 'co-organiser', 'volunteer')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (venture_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id  UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'done')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id  UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('topup', 'payment', 'refund')),
  amount      NUMERIC(10,2) NOT NULL,
  description TEXT NOT NULL,
  venture_id  UUID REFERENCES public.ventures(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STEP 2: ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventures           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venture_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 3: RLS POLICIES (all tables exist by now)
-- ============================================================

-- profiles
CREATE POLICY "Anyone can read profiles"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- ventures
CREATE POLICY "Anyone can read ventures"
  ON public.ventures FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create ventures"
  ON public.ventures FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner or co-organiser can update ventures"
  ON public.ventures FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.venture_members
      WHERE venture_members.venture_id = ventures.id
        AND venture_members.user_id = auth.uid()
        AND venture_members.role IN ('owner', 'co-organiser')
    )
  );

CREATE POLICY "Owner can delete ventures"
  ON public.ventures FOR DELETE USING (auth.uid() = owner_id);

-- venture_members
CREATE POLICY "Anyone can read venture_members"
  ON public.venture_members FOR SELECT USING (true);

CREATE POLICY "Users can join ventures"
  ON public.venture_members FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave ventures"
  ON public.venture_members FOR DELETE USING (auth.uid() = user_id);

-- tasks
CREATE POLICY "Venture members can read tasks"
  ON public.tasks FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.venture_members
      WHERE venture_members.venture_id = tasks.venture_id
        AND venture_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Organisers can create tasks"
  ON public.tasks FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.venture_members
      WHERE venture_members.venture_id = tasks.venture_id
        AND venture_members.user_id = auth.uid()
        AND venture_members.role IN ('owner', 'co-organiser')
    )
  );

CREATE POLICY "Organisers can update tasks"
  ON public.tasks FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.venture_members
      WHERE venture_members.venture_id = tasks.venture_id
        AND venture_members.user_id = auth.uid()
        AND venture_members.role IN ('owner', 'co-organiser')
    )
  );

CREATE POLICY "Organisers can delete tasks"
  ON public.tasks FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.venture_members
      WHERE venture_members.venture_id = tasks.venture_id
        AND venture_members.user_id = auth.uid()
        AND venture_members.role IN ('owner', 'co-organiser')
    )
  );

-- activity_events
CREATE POLICY "Venture members can read activity"
  ON public.activity_events FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.venture_members
      WHERE venture_members.venture_id = activity_events.venture_id
        AND venture_members.user_id = auth.uid()
    )
  );

-- notifications
CREATE POLICY "Users can read their own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- wallet_transactions
CREATE POLICY "Users can read their own transactions"
  ON public.wallet_transactions FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- STEP 4: AUTO-UPDATE TIMESTAMPS TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_ventures
  BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_tasks
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- STEP 5: STORAGE BUCKETS
-- Run these separately in Supabase Storage dashboard, or
-- uncomment and run here if your project supports it:
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
--   ON CONFLICT (id) DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('venture-images', 'venture-images', true)
--   ON CONFLICT (id) DO NOTHING;
