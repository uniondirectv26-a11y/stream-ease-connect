import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Usa la sesión guardada localmente: si se cae la señal no se pierde el acceso.
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/" });
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});
