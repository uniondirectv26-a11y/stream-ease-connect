ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS profile_label text;

CREATE TABLE public.client_renewals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  previous_expires_at date,
  new_expires_at date NOT NULL,
  days integer NOT NULL DEFAULT 30,
  price numeric,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_renewals TO authenticated;
GRANT ALL ON public.client_renewals TO service_role;

ALTER TABLE public.client_renewals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "renewals_select_members" ON public.client_renewals
  FOR SELECT TO authenticated USING (public.is_member(auth.uid()));
CREATE POLICY "renewals_insert_members" ON public.client_renewals
  FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid()) AND auth.uid() = created_by);
CREATE POLICY "renewals_update_members" ON public.client_renewals
  FOR UPDATE TO authenticated USING (public.is_member(auth.uid())) WITH CHECK (public.is_member(auth.uid()));
CREATE POLICY "renewals_delete_members" ON public.client_renewals
  FOR DELETE TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_client_renewals_client ON public.client_renewals (client_id, created_at DESC);

CREATE TRIGGER trg_client_renewals_updated
  BEFORE UPDATE ON public.client_renewals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_account_slots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  limite int;
  usados int;
BEGIN
  IF NEW.is_extra THEN
    SELECT count(*) INTO usados FROM public.clients
      WHERE account_id = NEW.account_id AND is_extra AND id <> NEW.id;
    IF usados >= 2 THEN
      RAISE EXCEPTION 'Superaste el límite de usuarios: esta cuenta ya tiene 2 usuarios extras (máximo permitido).'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT LEAST(COALESCE(max_profiles, 5), 5) INTO limite FROM public.accounts WHERE id = NEW.account_id;
    SELECT count(*) INTO usados FROM public.clients
      WHERE account_id = NEW.account_id AND NOT is_extra AND id <> NEW.id;
    IF usados >= COALESCE(limite, 5) THEN
      RAISE EXCEPTION 'Esta cuenta ya tiene los % cupos normales ocupados. Regístralo como usuario extra.', COALESCE(limite, 5)
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $function$;