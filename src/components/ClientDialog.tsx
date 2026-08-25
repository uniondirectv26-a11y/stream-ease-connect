import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { addDaysISO, todayISO, type Client } from "@/lib/streaming";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  client?: Client | null;
  defaultVendor: string;
  defaultExtra?: boolean;
};

export function ClientDialog({ open, onOpenChange, accountId, client, defaultVendor, defaultExtra }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paid, setPaid] = useState(true);
  const [saleDate, setSaleDate] = useState(todayISO());
  const [days, setDays] = useState("30");
  const [expiresAt, setExpiresAt] = useState(addDaysISO(todayISO(), 30));
  const [price, setPrice] = useState("");
  const [vendor, setVendor] = useState("");
  const [isExtra, setIsExtra] = useState(false);
  const [profileLabel, setProfileLabel] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(client?.name ?? "");
    setPhone(client?.phone ?? "");
    setPaid(client?.paid ?? true);
    setSaleDate(client?.sale_date ?? todayISO());
    setDays(String(client?.days ?? 30));
    setExpiresAt(client?.expires_at ?? addDaysISO(client?.sale_date ?? todayISO(), client?.days ?? 30));
    setPrice(client?.price !== null && client?.price !== undefined ? String(client.price) : "");
    setVendor(client?.vendor ?? defaultVendor);
    setIsExtra(client?.is_extra ?? defaultExtra ?? false);
    setProfileLabel(client?.profile_label ?? "");
    setNotes(client?.notes ?? "");
  }, [open, client, defaultVendor, defaultExtra]);

  const recalc = (nextSale: string, nextDays: string) => {
    const n = Number(nextDays);
    if (nextSale && Number.isFinite(n) && n > 0) setExpiresAt(addDaysISO(nextSale, n));
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sesión no válida");
      if (!name.trim()) throw new Error("El nombre del cliente es obligatorio");
      const payload = {
        account_id: accountId,
        name: name.trim(),
        phone: phone.trim() || null,
        paid,
        sale_date: saleDate,
        days: Number(days) || 30,
        expires_at: expiresAt,
        price: price.trim() === "" ? null : Number(price),
        vendor: vendor.trim() || null,
        is_extra: isExtra,
        profile_label: profileLabel.trim() || null,
        notes: notes.trim() || null,
        created_by: userId,
      };
      if (client) {
        const { error } = await supabase.from("clients").update(payload).eq("id", client.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(client ? "Cliente actualizado" : "Cliente registrado");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("No se pudo guardar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>La fecha de vencimiento se calcula sola con la venta y los días.</DialogDescription>
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
              <Label htmlFor="cli-name">Nombre</Label>
              <Input
                id="cli-name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Stefany Valencia"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cli-phone">WhatsApp</Label>
              <Input
                id="cli-phone"
                maxLength={20}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="573001112233"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="cli-sale">Fecha de venta</Label>
              <Input
                id="cli-sale"
                type="date"
                required
                value={saleDate}
                onChange={(e) => {
                  setSaleDate(e.target.value);
                  recalc(e.target.value, days);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cli-days">Días</Label>
              <Input
                id="cli-days"
                type="number"
                min={1}
                max={730}
                value={days}
                onChange={(e) => {
                  setDays(e.target.value);
                  recalc(saleDate, e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cli-exp">Vencimiento</Label>
              <Input
                id="cli-exp"
                type="date"
                required
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cli-price">Precio</Label>
              <Input
                id="cli-price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="15000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cli-vendor">Vendedor</Label>
              <Input
                id="cli-vendor"
                maxLength={60}
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Luis"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <Label htmlFor="cli-paid">Pagó</Label>
              <Switch id="cli-paid" checked={paid} onCheckedChange={setPaid} />
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <Label htmlFor="cli-extra">Usuario extra</Label>
              <Switch id="cli-extra" checked={isExtra} onCheckedChange={setIsExtra} />
            </div>
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
