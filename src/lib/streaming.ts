import type { Database } from "@/integrations/supabase/types";

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type Client = Database["public"]["Tables"]["clients"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];

export const PLATFORMS = [
  "Netflix",
  "Disney+",
  "Max",
  "Prime Video",
  "Spotify",
  "Paramount+",
  "Vix",
  "Crunchyroll",
  "YouTube Premium",
  "Otro",
] as const;

/** Fecha de hoy en formato ISO (yyyy-mm-dd) usando la zona local. */
export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00`).getTime();
  const now = new Date(`${todayISO()}T00:00:00`).getTime();
  return Math.round((target - now) / 86400000);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  const y = parts[0] ?? "";
  const m = parts[1] ?? "";
  const d = parts[2] ?? "";
  return `${d}/${m}/${y.slice(2)}`;
}

export type Status = "vencido" | "por-vencer" | "activo";

export function statusOf(iso: string | null): Status {
  const d = daysLeft(iso);
  if (d === null) return "activo";
  if (d < 0) return "vencido";
  if (d <= 5) return "por-vencer";
  return "activo";
}

export const STATUS_LABEL: Record<Status, string> = {
  vencido: "Vencido",
  "por-vencer": "Por vencer",
  activo: "Activo",
};

export function money(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Normaliza el número a solo dígitos para el enlace de WhatsApp. */
export function normalizePhone(phone: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function buildWhatsappMessage(client: Client, account: Account | undefined): string {
  const d = daysLeft(client.expires_at);
  const servicio = account ? `${account.platform}${account.label ? ` (${account.label})` : ""}` : "tu servicio";
  const vence = formatDate(client.expires_at);
  if (d !== null && d < 0) {
    return (
      `Hola ${client.name}! 👋\n\n` +
      `Tu servicio de ${servicio} venció el ${vence} (hace ${Math.abs(d)} día(s)).\n` +
      `Si deseas continuar disfrutándolo, avísame para renovarlo hoy mismo. ✅`
    );
  }
  if (d === 0) {
    return (
      `Hola ${client.name}! 👋\n\n` +
      `Te recuerdo que tu servicio de ${servicio} vence HOY (${vence}).\n` +
      `¿Deseas renovarlo? Con gusto te ayudo. ✅`
    );
  }
  return (
    `Hola ${client.name}! 👋\n\n` +
    `Te recuerdo que tu servicio de ${servicio} vence el ${vence} (en ${d} día(s)).\n` +
    `¿Deseas renovarlo? Con gusto te ayudo. ✅`
  );
}

export function whatsappUrl(phone: string | null, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

const PLATFORM_EMOJI: Record<string, string> = {
  Netflix: "🔴",
  "Disney+": "🔵",
  Max: "🟣",
  "Prime Video": "🔷",
  Spotify: "🟢",
  "Paramount+": "🔹",
  Vix: "🟡",
  Crunchyroll: "🟠",
  "YouTube Premium": "🔺",
  Otro: "⚪",
};

export function platformEmoji(platform: string): string {
  return PLATFORM_EMOJI[platform] ?? "⚪";
}

/** Etiqueta del perfil de un cliente ("Perfil 2", "Extra 1", etc.). */
export function profileLabelOf(client: Client, index?: number): string {
  const raw = (client.profile_label ?? "").trim();
  if (raw) return /^\d+$/.test(raw) ? `Perfil ${raw}` : raw;
  if (index !== undefined) return client.is_extra ? `Extra ${index + 1}` : `Perfil ${index + 1}`;
  return client.is_extra ? "Extra" : "Perfil";
}

/**
 * Texto listo para copiar/enviar por WhatsApp con los datos de la cuenta.
 * Solo incluye datos de la cuenta indicada y, opcionalmente, del cliente indicado.
 */
export function buildAccountShareText(
  account: Account,
  client?: Client | null,
  options?: { profileIndex?: number },
): string {
  const lines = [`*${platformEmoji(account.platform)} ${account.platform} servicio*`];
  if (account.email) lines.push(`✉️ ${account.email}`);
  if (account.password) lines.push(`🔑 ${account.password}`);

  if (client && client.account_id === account.id) {
    const perfil = profileLabelOf(client, options?.profileIndex);
    lines.push(`🖥️ ${perfil}${client.is_extra ? " (usuario extra)" : ""}`);
    lines.push(`📅 Vence: ${formatDate(client.expires_at)}`);
  } else {
    lines.push("🖥️");
    if (account.expires_at) lines.push(`📅 Vence: ${formatDate(account.expires_at)}`);
  }

  lines.push("");
  lines.push("👆");
  return lines.join("\n");
}

/** Normaliza texto para búsquedas: sin tildes, minúsculas y sin espacios extra. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
