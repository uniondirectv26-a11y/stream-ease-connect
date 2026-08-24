import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Elimina por completo a un usuario del equipo. Solo el administrador puede hacerlo. */
export const deleteTeamUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) {
      throw new Error("No puedes eliminar tu propio usuario.");
    }

    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAdmin) throw new Error("Solo el administrador puede eliminar usuarios.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: profileError } = await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    if (profileError) throw new Error(profileError.message);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
