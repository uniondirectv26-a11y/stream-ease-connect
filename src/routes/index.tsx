import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Tv, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StreamPanel — Gestión de ventas de streaming" },
      {
        name: "description",
        content:
          "Controla cuentas de streaming, clientes, fechas de vencimiento y envía recordatorios por WhatsApp en un clic.",
      },
      { property: "og:title", content: "StreamPanel — Gestión de ventas de streaming" },
      {
        property: "og:description",
        content:
          "Controla cuentas de streaming, clientes, fechas de vencimiento y envía recordatorios por WhatsApp en un clic.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) navigate({ to: "/panel", replace: true });
      else setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/panel", replace: true });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) toast.error("No pudimos iniciar sesión", { description: error.message });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim(), phone: phone.trim() },
      },
    });
    setLoading(false);
    if (error) {
      const limite =
        /l[ií]mite alcanzado/i.test(error.message) ||
        /database error saving new user/i.test(error.message) ||
        /unexpected_failure/i.test(error.message);
      toast.error(
        limite ? "Límite alcanzado: esta aplicación permite máximo 5 usuarios." : "No pudimos crear la cuenta",
        limite ? undefined : { description: error.message },
      );
      return;
    }
    if (!data.session) {
      setSent(true);
      toast.success("Revisa tu correo para confirmar la cuenta");
    }
  };

  const google = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error("No pudimos conectar con Google");
      return;
    }
    if (result.redirected) return;
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center gap-8 px-4 py-10"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Tv className="size-7" />
        </span>
        <h1 className="text-3xl font-bold tracking-tight">StreamPanel</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Administra tus cuentas de streaming, clientes y vencimientos. Avisa por WhatsApp en un clic.
        </p>
      </div>

      <Card className="w-full max-w-md border-border/60 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle>Acceso de vendedores</CardTitle>
          <CardDescription>Entra con tu cuenta para gestionar las ventas del equipo.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <ShieldCheck className="size-8 text-primary" />
              <p className="text-sm text-muted-foreground">
                Te enviamos un correo de confirmación a <strong className="text-foreground">{email}</strong>. Ábrelo
                para activar tu cuenta y luego vuelve a iniciar sesión.
              </p>
              <Button variant="secondary" onClick={() => setSent(false)}>
                Volver
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="signup">Registrarme</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-5">
                <form className="space-y-4" onSubmit={signIn}>
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vendedor@correo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="size-4 animate-spin" />}
                    Entrar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-5">
                <form className="space-y-4" onSubmit={signUp}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Tu nombre</Label>
                    <Input
                      id="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Luis"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">WhatsApp (opcional)</Label>
                    <Input
                      id="phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="573001112233"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email2">Correo</Label>
                    <Input
                      id="email2"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password2">Contraseña</Label>
                    <Input
                      id="password2"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="size-4 animate-spin" />}
                    Crear cuenta
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}

          {!sent && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="secondary" className="w-full" onClick={google} disabled={loading}>
                Continuar con Google
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
