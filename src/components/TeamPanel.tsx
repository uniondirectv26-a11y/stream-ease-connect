import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { deleteTeamUser } from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const MAX_USERS = 5;

type TeamMember = {
  id: string;
  full_name: string;
  phone: string | null;
  role: "admin" | "member";
  created_at: string;
};

type Props = {
  currentUserId: string;
  isAdmin: boolean;
};

export function TeamPanel({ currentUserId, isAdmin }: Props) {
  const qc = useQueryClient();
  const removeUser = useServerFn(deleteTeamUser);
  const [pendingDelete, setPendingDelete] = useState<TeamMember | null>(null);

  const members = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, role, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as TeamMember[];
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "member" }) => {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Rol actualizado");
    },
    onError: (e: Error) => toast.error("No se pudo cambiar el rol", { description: e.message }),
  });

  const destroy = useMutation({
    mutationFn: async (id: string) => removeUser({ data: { userId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
      toast.success("Usuario eliminado");
    },
    onError: (e: Error) => toast.error("No se pudo eliminar", { description: e.message }),
  });

  const list = members.data ?? [];

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" /> Usuarios del sistema
            </CardTitle>
            <CardDescription>
              {list.length}/{MAX_USERS} usuarios. La aplicación permite máximo {MAX_USERS} accesos.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {list.map((m) => (
            <div
              key={m.id}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/30 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.full_name || "Sin nombre"}
                  {m.id === currentUserId && <span className="text-muted-foreground"> (tú)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.phone || "Sin WhatsApp"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                  {m.role === "admin" ? (
                    <span className="flex items-center gap-1">
                      <ShieldCheck className="size-3" /> Administrador
                    </span>
                  ) : (
                    "Miembro"
                  )}
                </Badge>
                {isAdmin && m.id !== currentUserId && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={changeRole.isPending}
                      onClick={() =>
                        changeRole.mutate({ id: m.id, role: m.role === "admin" ? "member" : "admin" })
                      }
                    >
                      {m.role === "admin" ? "Quitar admin" : "Hacer admin"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      disabled={destroy.isPending}
                      onClick={() => setPendingDelete(m)}
                    >
                      {destroy.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!isAdmin && (
            <p className="text-xs text-muted-foreground">
              Solo el administrador puede crear, cambiar de rol o eliminar usuarios.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.full_name || "Este usuario"} perderá el acceso a la aplicación. Los registros que creó se
              conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) destroy.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
