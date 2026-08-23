import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Copy,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Tv,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_LABEL,
  addDaysISO,
  buildAccountShareText,
  buildWhatsappMessage,
  daysLeft,
  formatDate,
  money,
  normalizePhone,
  statusOf,
  todayISO,
  type Account,
  type Client,
  type Status,
} from "@/lib/streaming";

import { AccountDialog } from "@/components/AccountDialog";
import { ClientDialog } from "@/components/ClientDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export const Route = createFileRoute("/_authenticated/panel")({
  head: () => ({
    meta: [
      { title: "Panel de ventas — StreamPanel" },
      {
        name: "description",
        content: "Cuentas, clientes, vencimientos y recordatorios de WhatsApp de tu negocio de streaming.",
      },
      { property: "og:title", content: "Panel de ventas — StreamPanel" },
      {
        property: "og:description",
        content: "Cuentas, clientes, vencimientos y recordatorios de WhatsApp de tu negocio de streaming.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Panel,
});

const statusStyles: Record<Status, string> = {
  activo: "bg-success/15 text-success border-success/30",
  "por-vencer": "bg-warning/15 text-warning border-warning/30",
  vencido: "bg-destructive/15 text-destructive border-destructive/30",
};

function StatusBadge({ iso }: { iso: string | null }) {
  const s = statusOf(iso);
  const d = daysLeft(iso);
  return (
    <Badge variant="outline" className={statusStyles[s]}>
      {STATUS_LABEL[s]}
      {d !== null && ` · ${d}d`}
    </Badge>
  );
}

function Panel() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [accountDialog, setAccountDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [clientDialog, setClientDialog] = useState(false);
  const [clientAccountId, setClientAccountId] = useState<string>("");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientExtra, setClientExtra] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [deleteAccount, setDeleteAccount] = useState<Account | null>(null);

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
      return { email: auth.user.email ?? "", name: data?.full_name || auth.user.email || "Vendedor" };
    },
  });

  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .order("platform")
        .order("label");
      if (error) throw error;
      return data as Account[];
    },
  });

  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("expires_at");
      if (error) throw error;
      return data as Client[];
    },
  });

  const accountList = accounts.data ?? [];
  const clientList = clients.data ?? [];

  const stats = useMemo(() => {
    let porVencer = 0;
    let vencidos = 0;
    let pendientes = 0;
    let ingresos = 0;
    const month = todayISO().slice(0, 7);
    for (const c of clientList) {
      const s = statusOf(c.expires_at);
      if (s === "por-vencer") porVencer += 1;
      if (s === "vencido") vencidos += 1;
      if (!c.paid) pendientes += 1;
      if (c.sale_date.slice(0, 7) === month) ingresos += Number(c.price ?? 0);
    }
    return { porVencer, vencidos, pendientes, ingresos };
  }, [clientList]);

  const alerts = useMemo(
    () =>
      clientList
        .filter((c) => {
          const s = statusOf(c.expires_at);
          return s === "por-vencer" || s === "vencido";
        })
        .sort((a, b) => (daysLeft(a.expires_at) ?? 0) - (daysLeft(b.expires_at) ?? 0)),
    [clientList],
  );

  const renew = useMutation({
    mutationFn: async (client: Client) => {
      const base = daysLeft(client.expires_at)! < 0 ? todayISO() : client.expires_at;
      const { error } = await supabase
        .from("clients")
        .update({ sale_date: todayISO(), expires_at: addDaysISO(base, client.days), paid: true })
        .eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Servicio renovado");
    },
    onError: (e: Error) => toast.error("No se pudo renovar", { description: e.message }),
  });

  const removeClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente eliminado");
    },
    onError: (e: Error) => toast.error("No se pudo eliminar", { description: e.message }),
  });

  const removeAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cuenta eliminada");
    },
    onError: (e: Error) => toast.error("No se pudo eliminar", { description: e.message }),
  });

  const openWhatsapp = (client: Client) => {
    if (!normalizePhone(client.phone)) {
      toast.error("Este cliente no tiene número de WhatsApp");
      return;
    }
    const account = accountList.find((a) => a.id === client.account_id);
    const message = buildWhatsappMessage(client, account);
    window.open(
      `https://wa.me/${normalizePhone(client.phone)}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    qc.clear();
    navigate({ to: "/", replace: true });
  };

  const newClient = (accountId: string, extra: boolean) => {
    setEditingClient(null);
    setClientAccountId(accountId);
    setClientExtra(extra);
    setClientDialog(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Tv className="size-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">StreamPanel</p>
              <p className="text-xs text-muted-foreground">{profile.data?.name ?? "…"}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" />
            Salir
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={<Users className="size-4" />} label="Clientes" value={String(clientList.length)} />
          <StatCard
            icon={<CalendarClock className="size-4" />}
            label="Por vencer"
            value={String(stats.porVencer)}
            tone="text-warning"
          />
          <StatCard
            icon={<AlertTriangle className="size-4" />}
            label="Vencidos"
            value={String(stats.vencidos)}
            tone="text-destructive"
          />
          <StatCard
            icon={<CircleCheck className="size-4" />}
            label="Ventas del mes"
            value={money(stats.ingresos)}
            tone="text-primary"
          />
        </section>

        <Tabs defaultValue="alertas">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="alertas" className="flex-1 sm:flex-none">
              Vencimientos {alerts.length > 0 && `(${alerts.length})`}
            </TabsTrigger>
            <TabsTrigger value="cuentas" className="flex-1 sm:flex-none">
              Cuentas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="alertas" className="mt-4 space-y-3">
            {alerts.length === 0 ? (
              <EmptyState
                title="Sin vencimientos cercanos"
                description="Aquí aparecerán los clientes con 5 días o menos, y los que ya vencieron."
              />
            ) : (
              alerts.map((c) => {
                const account = accountList.find((a) => a.id === c.account_id);
                return (
                  <Card key={c.id} className="border-border/60">
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{c.name}</p>
                          <StatusBadge iso={c.expires_at} />
                          {!c.paid && (
                            <Badge variant="outline" className="border-destructive/30 bg-destructive/15 text-destructive">
                              Sin pagar
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {account ? `${account.platform} · ${account.label}` : "Cuenta eliminada"} · vence{" "}
                          {formatDate(c.expires_at)}
                          {c.vendor ? ` · ${c.vendor}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => openWhatsapp(c)}>
                          <MessageCircle className="size-4" />
                          Avisar
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => renew.mutate(c)}>
                          <RefreshCw className="size-4" />
                          Renovar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="cuentas" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setEditingAccount(null);
                  setAccountDialog(true);
                }}
              >
                <Plus className="size-4" />
                Nueva cuenta
              </Button>
            </div>

            {accountList.length === 0 ? (
              <EmptyState
                title="Aún no tienes cuentas"
                description="Crea tu primera cuenta de streaming (por ejemplo Netflix6) y agrega sus clientes."
              />
            ) : (
              accountList.map((account) => {
                const own = clientList.filter((c) => c.account_id === account.id);
                const normales = own.filter((c) => !c.is_extra);
                const extras = own.filter((c) => c.is_extra);
                return (
                  <Card key={account.id} className="overflow-hidden border-border/60">
                    <CardHeader className="gap-3 border-b border-border/60 bg-secondary/30">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <CardTitle className="flex items-center gap-2">
                            {account.platform} · {account.label}
                            <StatusBadge iso={account.expires_at} />
                          </CardTitle>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {account.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="size-3" />
                                {account.email}
                              </span>
                            )}
                            {account.password && (
                              <span className="flex items-center gap-1">
                                <KeyRound className="size-3" />
                                {account.password}
                              </span>
                            )}
                            {account.change_date && <span>Cambio: {formatDate(account.change_date)}</span>}
                            <span>
                              Cupos: {normales.length}/{account.max_profiles}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Editar cuenta"
                            onClick={() => {
                              setEditingAccount(account);
                              setAccountDialog(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Eliminar cuenta"
                            onClick={() => setDeleteAccount(account)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 p-4">
                      <ClientGroup
                        title="Usuarios"
                        clients={normales}
                        onAdd={() => newClient(account.id, false)}
                        onEdit={(c) => {
                          setEditingClient(c);
                          setClientAccountId(account.id);
                          setClientDialog(true);
                        }}
                        onDelete={setDeleteClient}
                        onWhatsapp={openWhatsapp}
                        onRenew={(c) => renew.mutate(c)}
                      />
                      <ClientGroup
                        title="Usuarios extras"
                        clients={extras}
                        onAdd={() => newClient(account.id, true)}
                        onEdit={(c) => {
                          setEditingClient(c);
                          setClientAccountId(account.id);
                          setClientDialog(true);
                        }}
                        onDelete={setDeleteClient}
                        onWhatsapp={openWhatsapp}
                        onRenew={(c) => renew.mutate(c)}
                      />
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AccountDialog open={accountDialog} onOpenChange={setAccountDialog} account={editingAccount} />
      {clientAccountId && (
        <ClientDialog
          open={clientDialog}
          onOpenChange={setClientDialog}
          accountId={clientAccountId}
          client={editingClient}
          defaultVendor={profile.data?.name ?? ""}
          defaultExtra={clientExtra}
        />
      )}

      <AlertDialog open={!!deleteClient} onOpenChange={(o) => !o && setDeleteClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {deleteClient?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteClient) removeClient.mutate(deleteClient.id);
                setDeleteClient(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteAccount} onOpenChange={(o) => !o && setDeleteAccount(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {deleteAccount?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              También se eliminarán todos los clientes registrados en esta cuenta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAccount) removeAccount.mutate(deleteAccount.id);
                setDeleteAccount(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="space-y-1 p-4">
        <div className={`flex items-center gap-2 text-xs text-muted-foreground ${tone ?? ""}`}>
          {icon}
          {label}
        </div>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed border-border/60 bg-card/50">
      <CardContent className="p-8 text-center">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function ClientGroup({
  title,
  clients,
  onAdd,
  onEdit,
  onDelete,
  onWhatsapp,
  onRenew,
}: {
  title: string;
  clients: Client[];
  onAdd: () => void;
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
  onWhatsapp: (c: Client) => void;
  onRenew: (c: Client) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Button size="sm" variant="ghost" onClick={onAdd}>
          <Plus className="size-4" />
          Agregar
        </Button>
      </div>

      {clients.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          Sin registros.
        </p>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-secondary/25 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{c.name}</p>
                  <StatusBadge iso={c.expires_at} />
                  {!c.paid && (
                    <Badge variant="outline" className="border-destructive/30 bg-destructive/15 text-destructive">
                      Sin pagar
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Venta {formatDate(c.sale_date)} · {c.days}d · vence {formatDate(c.expires_at)}
                  {c.price !== null ? ` · ${money(Number(c.price))}` : ""}
                  {c.vendor ? ` · ${c.vendor}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="secondary" onClick={() => onWhatsapp(c)}>
                  <MessageCircle className="size-4" />
                  WhatsApp
                </Button>
                <Button size="icon" variant="ghost" aria-label="Renovar" onClick={() => onRenew(c)}>
                  <RefreshCw className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => onEdit(c)}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Eliminar" onClick={() => onDelete(c)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
