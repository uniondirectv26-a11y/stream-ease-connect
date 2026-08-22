import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { PLATFORMS, type Account } from "@/lib/streaming";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: Account | null;
};

export function AccountDialog({ open, onOpenChange, account }: Props) {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState("Netflix");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [changeDate, setChangeDate] = useState("");
  const [maxProfiles, setMaxProfiles] = useState("5");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setPlatform(account?.platform ?? "Netflix");
    setLabel(account?.label ?? "");
    setEmail(account?.email ?? "");
    setPassword(account?.password ?? "");
    setExpiresAt(account?.expires_at ?? "");
    setChangeDate(account?.change_date ?? "");
    setMaxProfiles(String(account?.max_profiles ?? 5));
    setNotes(account?.notes ?? "");
  }, [open, account]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sesión no válida");
      const payload = {
        platform,
        label: label.trim(),
        email: email.trim() || null,
        password: password.trim() || null,
        expires_at: expiresAt || null,
        change_date: changeDate || null,
        max_profiles: Number(maxProfiles) || 5,
        notes: notes.trim() || null,
        created_by: userId,
      };
      if (account) {
        const { error } = await supabase.from("accounts").update(payload).eq("id", account.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("accounts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      toast.success(account ? "Cuenta actualizada" : "Cuenta creada");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("No se pudo guardar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
          <DialogDescription>Datos de la cuenta de streaming que compartes con tus clientes.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Plataforma</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Nombre de la cuenta</Label>
              <Input
                id="label"
                required
                maxLength={60}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Netflix6"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="acc-email">Correo</Label>
              <Input
                id="acc-email"
                type="email"
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cuenta@gmail.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-pass">Contraseña</Label>
              <Input
                id="acc-pass"
                maxLength={120}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="acc-exp">Vence</Label>
              <Input id="acc-exp" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-change">Fecha de cambio</Label>
              <Input id="acc-change" type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-max">Cupos</Label>
              <Input
                id="acc-max"
                type="number"
                min={1}
                max={20}
                value={maxProfiles}
                onChange={(e) => setMaxProfiles(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-notes">Notas</Label>
            <Textarea
              id="acc-notes"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles del proveedor, PIN, etc."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
