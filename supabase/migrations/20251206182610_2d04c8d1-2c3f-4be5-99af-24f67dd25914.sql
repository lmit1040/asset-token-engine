-- Create enum types
CREATE TYPE public.asset_type AS ENUM ('GOLDBACK', 'SILVER', 'COPPER', 'GOLD_CERTIFICATE', 'SILVER_CERTIFICATE', 'OTHER');
CREATE TYPE public.owner_entity AS ENUM ('PERSONAL_TRUST', 'BUSINESS_TRUST', 'SPV_LLC');
CREATE TYPE public.token_model AS ENUM ('ONE_TO_ONE', 'FRACTIONAL', 'VAULT_BASKET');
CREATE TYPE public.app_role AS ENUM ('admin', 'standard_user');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'standard_user',
  UNIQUE (user_id, role)
);

-- Create assets table
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_type asset_type NOT NULL,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  storage_location TEXT,
  owner_entity owner_entity NOT NULL,
  acquisition_date DATE,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create proof_of_reserve_files table
CREATE TABLE public.proof_of_reserve_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create token_definitions table
CREATE TABLE public.token_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE NOT NULL,
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL UNIQUE,
  token_model token_model NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 0,
  total_supply NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_token_holdings table
CREATE TABLE public.user_token_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token_definition_id UUID REFERENCES public.token_definitions(id) ON DELETE CASCADE NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 0,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token_definition_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proof_of_reserve_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_token_holdings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'name');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'standard_user');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for assets
CREATE POLICY "Authenticated users can view assets"
  ON public.assets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert assets"
  ON public.assets FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update assets"
  ON public.assets FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete assets"
  ON public.assets FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for proof_of_reserve_files
CREATE POLICY "Authenticated users can view proof files"
  ON public.proof_of_reserve_files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage proof files"
  ON public.proof_of_reserve_files FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for token_definitions
CREATE POLICY "Authenticated users can view token definitions"
  ON public.token_definitions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage token definitions"
  ON public.token_definitions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_token_holdings
CREATE POLICY "Users can view their own holdings"
  ON public.user_token_holdings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all holdings"
  ON public.user_token_holdings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all holdings"
  ON public.user_token_holdings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for proof of reserve files
INSERT INTO storage.buckets (id, name, public) VALUES ('proof-of-reserve', 'proof-of-reserve', true);

-- Storage policies
CREATE POLICY "Authenticated users can view proof files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'proof-of-reserve');

CREATE POLICY "Admins can upload proof files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'proof-of-reserve');

CREATE POLICY "Admins can delete proof files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'proof-of-reserve');