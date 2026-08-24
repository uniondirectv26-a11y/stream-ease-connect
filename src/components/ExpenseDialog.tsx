import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { todayISO, type Account, type Expense } from "@/lib/streaming";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  expense?: Expense | null;
  accounts: Account[];
};

const NONE = "none";

export function ExpenseDialog({ open, onOpenChange, expense, accounts }: Props) {
  const qc = useQueryClient();
  const [concept, setConcept] = useState("Renovación de cuenta");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(todayISO());
  const [accountId, setAccountId] = useState<string>(NONE);

  useEffect(() => {
    if (!open) return;
    setConcept(expense?.concept ?? "Renovación de cuenta");
    setAmount(expense?.amount !== null && expense?.amount !== undefined ? String(expense.amount) : "");
    setSpentOn(expense?.spent_on ?? todayISO());
    setAccountId(expense?.account_id ?? NONE);
  }, [open, expense]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sesión no válida");
      const payload = {
        concept: concept.trim() || "Renovación de cuenta",
        amount: Number(amount) || 0,
        spent_on: spentOn,
        account_id: accountId === NONE ? null : accountId,
        created_by: userId,
      };
      if (expense) {
        const { error } = await supabase.from("expenses").update(payload).eq("id", expense.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(expense ? "Inversión actualizada" : "Inversión registrada");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("No se pudo guardar", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar inversión" : "Nueva inversión"}</DialogTitle>
          <DialogDescription>Dinero que inviertes en renovar o comprar cuentas. Se resta de tus ventas.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="exp-concept">Concepto</Label>
            <Input
              id="exp-concept"
              maxLength={80}
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Renovación Netflix6"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="exp-amount">Monto invertido</Label>
              <Input
                id="exp-amount"
                type="number"
                min={0}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp-date">Fecha</Label>
              <Input
                id="exp-date"
                type="date"
                required
                value={spentOn}
                onChange={(e) => setSpentOn(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="exp-account">Cuenta (opcional)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="exp-account">
                <SelectValue placeholder="Sin cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin cuenta</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.platform} · {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
