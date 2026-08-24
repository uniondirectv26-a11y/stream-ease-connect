-- 1) Roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'member';

-- El usuario más antiguo queda como administrador si aún no hay ninguno
UPDATE public.profiles p
SET role = 'admin'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin')
  AND p.id = (SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1);

-- 2) Helpers
CREATE OR REPLACE FUNCTION public.is_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role = _role);
$$;

GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 3) Límite real de 5 usuarios + rol del primer usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total int;
BEGIN
  SELECT count(*) INTO total FROM public.profiles;
  IF total >= 5 THEN
    RAISE EXCEPTION 'Límite alcanzado: esta aplicación permite máximo 5 usuarios.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'phone',
    CASE WHEN total = 0 THEN 'admin'::public.app_role ELSE 'member'::public.app_role END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

-- Refuerzo: nunca más de 5 filas en profiles
CREATE OR REPLACE FUNCTION public.enforce_profiles_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM public.profiles) >= 5 THEN
    RAISE EXCEPTION 'Límite alcanzado: esta aplicación permite máximo 5 usuarios.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_profiles_limit ON public.profiles;
CREATE TRIGGER trg_profiles_limit BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profiles_limit();

-- Evita que un miembro se auto-promueva a administrador
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo el administrador puede cambiar roles.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_profiles_protect_role ON public.profiles;
CREATE TRIGGER trg_profiles_protect_role BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- 4) Políticas RLS: solo miembros del equipo
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_select_members ON public.profiles FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY profiles_delete_admin ON public.profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND auth.uid() <> id);

DROP POLICY IF EXISTS accounts_all_authenticated ON public.accounts;
CREATE POLICY accounts_select_members ON public.accounts FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));
CREATE POLICY accounts_insert_members ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()) AND auth.uid() = created_by);
CREATE POLICY accounts_update_members ON public.accounts FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid())) WITH CHECK (public.is_member(auth.uid()));
CREATE POLICY accounts_delete_members ON public.accounts FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS clients_all_authenticated ON public.clients;
CREATE POLICY clients_select_members ON public.clients FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));
CREATE POLICY clients_insert_members ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()) AND auth.uid() = created_by);
CREATE POLICY clients_update_members ON public.clients FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid())) WITH CHECK (public.is_member(auth.uid()));
CREATE POLICY clients_delete_members ON public.clients FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS expenses_all_authenticated ON public.expenses;
CREATE POLICY expenses_select_members ON public.expenses FOR SELECT TO authenticated
  USING (public.is_member(auth.uid()));
CREATE POLICY expenses_insert_members ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid()) AND auth.uid() = created_by);
CREATE POLICY expenses_update_members ON public.expenses FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid())) WITH CHECK (public.is_member(auth.uid()));
CREATE POLICY expenses_delete_members ON public.expenses FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

-- 5) Cupos de cuentas
UPDATE public.accounts SET max_profiles = 5 WHERE max_profiles > 5;
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_max_profiles_range;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_max_profiles_range
  CHECK (max_profiles >= 1 AND max_profiles <= 5);

CREATE OR REPLACE FUNCTION public.enforce_account_slots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  limite int;
  usados int;
BEGIN
  IF NEW.is_extra THEN
    SELECT count(*) INTO usados FROM public.clients
      WHERE account_id = NEW.account_id AND is_extra AND id <> NEW.id;
    IF usados >= 2 THEN
      RAISE EXCEPTION 'Superaste el límite de usuarios: esta cuenta ya tiene 2 usuarios extras.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT LEAST(COALESCE(max_profiles, 5), 5) INTO limite FROM public.accounts WHERE id = NEW.account_id;
    SELECT count(*) INTO usados FROM public.clients
      WHERE account_id = NEW.account_id AND NOT is_extra AND id <> NEW.id;
    IF usados >= COALESCE(limite, 5) THEN
      RAISE EXCEPTION 'Esta cuenta ya tiene todos los cupos normales ocupados. Regístralo como usuario extra.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_clients_slots ON public.clients;
CREATE TRIGGER trg_clients_slots BEFORE INSERT OR UPDATE OF account_id, is_extra ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.enforce_account_slots();