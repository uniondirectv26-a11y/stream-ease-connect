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
  Search,
  Send,
  Trash2,
  Tv,
  Users,
  Wallet,
  TrendingDown,
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
  type Expense,
  type Status,
} from "@/lib/streaming";

import { AccountDialog } from "@/components/AccountDialog";
import { ClientDialog } from "@/components/ClientDialog";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

const MAX_EXTRAS = 2;

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

  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [accountDialog, setAccountDialog] = useState(false);
  const [expenseDialog, setExpenseDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
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
      return {
        id: auth.user.id,
        email: auth.user.email ?? "",
        name: data?.full_name || auth.user.email || "Vendedor",
        role: (data?.role ?? "member") as "admin" | "member",
      };
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

  const expenses = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("spent_on", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });

  const accountList = accounts.data ?? [];
  const clientList = clients.data ?? [];
  const expenseList = expenses.data ?? [];

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
    let invertido = 0;
    for (const e of expenseList) {
      if (e.spent_on.slice(0, 7) === month) invertido += Number(e.amount ?? 0);
    }
    return { porVencer, vencidos, pendientes, ingresos, invertido, neto: ingresos - invertido };
  }, [clientList, expenseList]);

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

  const removeExpense = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Inversión eliminada");
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

  const copyAccountText = async (account: Account) => {
    const text = buildAccountShareText(account);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Datos copiados", { description: "Pégalos en WhatsApp" });
    } catch {
      toast.error("No se pudo copiar", { description: text });
    }
  };

  const shareAccountText = (account: Account) => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(buildAccountShareText(account))}`,
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
    const account = accountList.find((a) => a.id === accountId);
    const own = clientList.filter((c) => c.account_id === accountId);
    const normales = own.filter((c) => !c.is_extra).length;
    const extras = own.filter((c) => c.is_extra).length;
    const maxNormales = account?.max_profiles ?? 5;

    if (!extra && normales >= maxNormales) {
      toast.error(`Cuenta llena: ${normales}/${maxNormales} usuarios normales`, {
        description: "No puedes ingresar más clientes normales. Regístralo mejor como usuario extra.",
      });
      return;
    }
    if (extra && extras >= MAX_EXTRAS) {
      toast.error("Superaste el límite de usuarios", {
        description: `Esta cuenta ya tiene ${normales}/${maxNormales} normales y ${extras}/${MAX_EXTRAS} extras. Usa otra cuenta.`,
      });
      return;
    }

    setEditingClient(null);
    setClientAccountId(accountId);
    setClientExtra(extra);
    setClientDialog(true);
  };

  const q = search.trim().toLowerCase();
  const searchResults = useMemo(
    () => (q ? clientList.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q)) : []),
    [clientList, q],
  );

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
        <section className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente por nombre o WhatsApp…"
              className="pl-9"
              aria-label="Buscar clientes"
            />
          </div>

          {q && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {searchResults.length} resultado(s) para “{search.trim()}”
              </p>
              {searchResults.length === 0 ? (
                <EmptyState title="Sin resultados" description="Revisa el nombre o prueba con otra palabra." />
              ) : (
                searchResults.map((c) => {
                  const account = accountList.find((a) => a.id === c.account_id);
                  return (
                    <Card key={c.id} className="border-border/60">
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold">{c.name}</p>
                            <StatusBadge iso={c.expires_at} />
                            {c.is_extra && <Badge variant="outline">Extra</Badge>}
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
                            WhatsApp
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => renew.mutate(c)}>
                            <RefreshCw className="size-4" />
                            Renovar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Editar"
                            onClick={() => {
                              setEditingClient(c);
                              setClientAccountId(c.account_id);
                              setClientDialog(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
          <StatCard
            icon={<TrendingDown className="size-4" />}
            label="Invertido del mes"
            value={money(stats.invertido)}
            tone="text-warning"
          />
          <StatCard
            icon={<Wallet className="size-4" />}
            label="Ganancia neta del mes"
            value={money(stats.neto)}
            tone={stats.neto < 0 ? "text-destructive" : "text-success"}
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
            <TabsTrigger value="finanzas" className="flex-1 sm:flex-none">
              Inversiones
            </TabsTrigger>
            <TabsTrigger value="usuarios" className="flex-1 sm:flex-none">
              Usuarios
            </TabsTrigger>
          </TabsList>

          <TabsContent value="usuarios" className="mt-4 space-y-3">
            {profile.data && (
              <TeamPanel currentUserId={profile.data.id} isAdmin={profile.data.role === "admin"} />
            )}
          </TabsContent>

          <TabsContent value="finanzas" className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                icon={<CircleCheck className="size-4" />}

                label="Ventas del mes"
                value={money(stats.ingresos)}
                tone="text-primary"
              />
              <StatCard
                icon={<TrendingDown className="size-4" />}
                label="Inversión del mes"
                value={money(stats.invertido)}
                tone="text-warning"
              />
              <StatCard
                icon={<Wallet className="size-4" />}
                label="Queda (ventas - inversión)"
                value={money(stats.neto)}
                tone={stats.neto < 0 ? "text-destructive" : "text-success"}
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setEditingExpense(null);
                  setExpenseDialog(true);
                }}
              >
                <Plus className="size-4" />
                Nueva inversión
              </Button>
            </div>

            {expenseList.length === 0 ? (
              <EmptyState
                title="Sin inversiones registradas"
                description="Registra el dinero que gastas al renovar o comprar cuentas para ver tu ganancia real."
              />
            ) : (
              expenseList.map((e) => {
                const account = accountList.find((a) => a.id === e.account_id);
                return (
                  <Card key={e.id} className="border-border/60">
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-semibold">{e.concept}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(e.spent_on)}
                          {account ? ` · ${account.platform} · ${account.label}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-warning">-{money(Number(e.amount))}</p>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar inversión"
                          onClick={() => {
                            setEditingExpense(e);
                            setExpenseDialog(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Eliminar inversión"
                          onClick={() => setDeleteExpense(e)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>


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
                const isCollapsed = collapsed[account.id] ?? true;
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
                            aria-label="Copiar datos de la cuenta"
                            title="Copiar datos"
                            onClick={() => copyAccountText(account)}
                          >
                            <Copy className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Enviar datos por WhatsApp"
                            title="Enviar por WhatsApp"
                            onClick={() => shareAccountText(account)}
                          >
                            <Send className="size-4 text-success" />
                          </Button>
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

                      <pre className="whitespace-pre-wrap rounded-md bg-background/60 p-3 text-xs text-foreground/90">
                        {buildAccountShareText(account)}
                      </pre>

                      <Button
                        variant="secondary"
                        size="sm"
                        className="self-start"
                        onClick={() => setCollapsed((s) => ({ ...s, [account.id]: !isCollapsed }))}
                      >
                        {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                        {isCollapsed
                          ? `Ver clientes (${own.length})`
                          : `Ocultar clientes (${own.length})`}
                      </Button>
                    </CardHeader>

                    {!isCollapsed && (
                    <CardContent className="space-y-4 p-4">

                      <ClientGroup
                        title="Usuarios"
                        used={normales.length}
                        max={account.max_profiles}
                        fullHint="Cuenta llena. Registra los siguientes como usuarios extras."
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
                        used={extras.length}
                        max={MAX_EXTRAS}
                        fullHint="Superaste el límite de usuarios de esta cuenta. Usa otra cuenta."
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
                    )}
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AccountDialog open={accountDialog} onOpenChange={setAccountDialog} account={editingAccount} />
      <ExpenseDialog
        open={expenseDialog}
        onOpenChange={setExpenseDialog}
        expense={editingExpense}
        accounts={accountList}
      />

      <AlertDialog open={!!deleteExpense} onOpenChange={(o) => !o && setDeleteExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta inversión?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteExpense ? `${deleteExpense.concept} · ${money(Number(deleteExpense.amount))}` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteExpense) removeExpense.mutate(deleteExpense.id);
                setDeleteExpense(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  used,
  max,
  fullHint,
  clients,
  onAdd,
  onEdit,
  onDelete,
  onWhatsapp,
  onRenew,
}: {
  title: string;
  used: number;
  max: number;
  fullHint: string;
  clients: Client[];
  onAdd: () => void;
  onEdit: (c: Client) => void;
  onDelete: (c: Client) => void;
  onWhatsapp: (c: Client) => void;
  onRenew: (c: Client) => void;
}) {
  const full = used >= max;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}{" "}
          <span className={full ? "text-destructive" : "text-muted-foreground"}>
            ({used}/{max})
          </span>
        </p>
        <Button size="sm" variant="ghost" onClick={onAdd} disabled={full}>
          <Plus className="size-4" />
          Agregar
        </Button>
      </div>

      {full && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {fullHint}
        </p>
      )}


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
