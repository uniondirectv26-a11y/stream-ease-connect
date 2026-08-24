CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  concept TEXT NOT NULL DEFAULT 'Renovación de cuenta',
  amount NUMERIC NOT NULL DEFAULT 0,
  spent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses_all_authenticated" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (auth.uid() = created_by);
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();