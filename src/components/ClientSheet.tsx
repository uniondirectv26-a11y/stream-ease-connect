import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Copy, MessageCircle, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_LABEL,
  buildAccountShareText,
  daysLeft,
  formatDate,
  money,
  profileLabelOf,
  statusOf,
  type Account,
  type Client,
  type Status,
} from "@/lib/streaming";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const statusStyles: Record<Status, string> = {
  activo: "bg-success/15 text-success border-success/30",
  "por-vencer": "bg-warning/15 text-warning border-warning/30",
  vencido: "bg-destructive/15 text-destructive border-destructive/30",
};

type Props = {
  client: Client | null;
  account: Account | undefined;
  profileIndex?: number;
  onOpenChange: (open: boolean) => void;
  onEdit: (c: Client) => void;
  onRenew: (c: Client) => void;
  onWhatsapp: (c: Client) => void;
};

export function ClientSheet({ client, account, profileIndex, onOpenChange, onEdit, onRenew, onWhatsapp }: Props) {
  const renewals = useQuery({
    queryKey: ["renewals", client?.id],
    enabled: !!client,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_renewals")
        .select("*")
        .eq("client_id", client!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const status = statusOf(client?.expires_at ?? null);
  const left = daysLeft(client?.expires_at ?? null);

  const copyCredentials = async () => {
    if (!client || !account) {
      toast.error("Esta cuenta ya no existe", { description: "No hay credenciales para copiar." });
      return;
    }
    const text = buildAccountShareText(account, client, { profileIndex });
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Mensaje copiado", { description: "Pégalo en WhatsApp" });
    } catch {
      toast.error("No se pudo copiar", { description: text });
    }
  };

  return (
    <Sheet open={!!client} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl sm:max-w-lg sm:rounded-none">
        {client && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-lg">
                {client.name}
                <Badge variant="outline" className={statusStyles[status]}>
                  {STATUS_LABEL[status]}
                  {left !== null && ` · ${left}d`}
                </Badge>
                {client.is_extra && <Badge variant="outline">Extra</Badge>}
              </SheetTitle>
              <SheetDescription>
                {account ? `${account.platform} · ${account.label}` : "Cuenta eliminada"} ·{" "}
                {profileLabelOf(client, profileIndex)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4 pb-6">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Field label="WhatsApp" value={client.phone || "—"} />
                <Field label="Perfil" value={profileLabelOf(client, profileIndex)} />
                <Field label="Correo de la cuenta" value={account?.email || "—"} className="col-span-2 break-all" />
                <Field label="Fecha de venta" value={formatDate(client.sale_date)} />
                <Field label="Vencimiento" value={`${formatDate(client.expires_at)} (${client.days}d)`} />
                <Field label="Precio" value={client.price !== null ? money(Number(client.price)) : "—"} />
                <Field label="Pago" value={client.paid ? "Pagado" : "Pendiente"} />
                <Field label="Vendedor" value={client.vendor || "—"} />
                {client.notes && <Field label="Notas" value={client.notes} className="col-span-2" />}
              </dl>

              <div className="grid grid-cols-2 gap-2">
                <Button className="h-11" onClick={() => onWhatsapp(client)}>
                  <MessageCircle className="size-4" />
                  WhatsApp
                </Button>
                <Button className="h-11" variant="secondary" onClick={() => onRenew(client)}>
                  <RefreshCw className="size-4" />
                  Renovar
                </Button>
                <Button className="h-11" variant="secondary" onClick={copyCredentials}>
                  <Copy className="size-4" />
                  Copiar mensaje
                </Button>
                <Button className="h-11" variant="outline" onClick={() => onEdit(client)}>
                  <Pencil className="size-4" />
                  Editar
                </Button>
              </div>

              {account && (
                <pre className="whitespace-pre-wrap rounded-xl border border-border/60 bg-secondary/30 p-3 text-xs text-foreground/90">
                  {buildAccountShareText(account, client, { profileIndex })}
                </pre>
              )}

              <Separator />

              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CalendarClock className="size-4" />
                  Historial de renovaciones
                </p>
                {renewals.isLoading ? (
                  <p className="text-xs text-muted-foreground">Cargando…</p>
                ) : (renewals.data?.length ?? 0) === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
                    Aún no hay renovaciones registradas.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {renewals.data!.map((r) => (
                      <li key={r.id} className="rounded-lg border border-border/60 bg-secondary/25 p-3 text-xs">
                        <p className="font-medium">
                          {formatDate(r.previous_expires_at)} → {formatDate(r.new_expires_at)}
                        </p>
                        <p className="text-muted-foreground">
                          {r.days}d{r.price !== null ? ` · ${money(Number(r.price))}` : ""} ·{" "}
                          {new Date(r.created_at).toLocaleDateString("es-CO")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
