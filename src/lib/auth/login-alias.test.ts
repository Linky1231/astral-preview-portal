import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cleanUsername,
  looksLikeEmail,
  lookupLoginEmail,
  saveLoginAlias,
} from "./login-alias";
import { resolveLocalUsernameEmail } from "@/integrations/supabase/client";

/** Stub mínimo de localStorage para el entorno node de vitest. */
function installLocalStorage(seed: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(seed));
  const stub = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as unknown as { localStorage: typeof stub }).localStorage = stub;
  return stub;
}

describe("detección de identificador", () => {
  it("reconoce correos (Gmail, etc.)", () => {
    expect(looksLikeEmail("linkyteam989@gmail.com")).toBe(true);
    expect(looksLikeEmail("  usuario@dominio.com  ")).toBe(true);
  });

  it("reconoce nombres de usuario", () => {
    expect(looksLikeEmail("Atlas")).toBe(false);
    expect(looksLikeEmail("mi_usuario")).toBe(false);
    expect(looksLikeEmail("")).toBe(false);
  });
});

describe("cleanUsername", () => {
  it("normaliza a minúsculas y a-z0-9_", () => {
    expect(cleanUsername("Atlas")).toBe("atlas");
    expect(cleanUsername("  Mi_Usuario  ")).toBe("mi_usuario");
    expect(cleanUsername("Átlas!")).toBe("tlas");
  });
});

describe("alias usuario → correo", () => {
  beforeEach(() => installLocalStorage());
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it("guarda y recupera el correo de una cuenta", () => {
    saveLoginAlias("Atlas", "linkyteam989@gmail.com");
    expect(lookupLoginEmail("Atlas")).toBe("linkyteam989@gmail.com");
    expect(lookupLoginEmail("atlas")).toBe("linkyteam989@gmail.com");
    expect(lookupLoginAliasMiss()).toBeNull();
  });

  it("ignora valores inválidos sin lanzar", () => {
    saveLoginAlias("", "a@b.com");
    saveLoginAlias("sin_correo", "no-es-correo");
    expect(lookupLoginEmail("")).toBeNull();
    expect(lookupLoginEmail("sin_correo")).toBeNull();
  });

  it("no guarda datos corruptos en localStorage", () => {
    installLocalStorage({ _ast_login_alias: "no-json" });
    expect(lookupLoginEmail("atlas")).toBeNull();
    expect(() => saveLoginAlias("atlas", "a@b.com")).not.toThrow();
  });
});

function lookupLoginAliasMiss(): string | null {
  return lookupLoginEmail("usuario_inexistente");
}

describe("resolveLocalUsernameEmail (modo local)", () => {
  beforeEach(() => installLocalStorage());
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it("resuelve un nombre de usuario al correo real de la cuenta", () => {
    installLocalStorage({
      _local_auth_users: JSON.stringify([
        { id: "u1", email: "linkyteam989@gmail.com", passwordHash: "x", createdAt: "2026-01-01" },
      ]),
      _local_data_profiles: JSON.stringify([{ id: "u1", username: "atlas" }]),
    });
    expect(resolveLocalUsernameEmail("Atlas")).toBe("linkyteam989@gmail.com");
    expect(resolveLocalUsernameEmail("atlas")).toBe("linkyteam989@gmail.com");
  });

  it("acepta un correo tal cual", () => {
    expect(resolveLocalUsernameEmail("  Alguien@Gmail.com ")).toBe("alguien@gmail.com");
  });

  it("devuelve null cuando el usuario no existe", () => {
    installLocalStorage({
      _local_auth_users: JSON.stringify([
        { id: "u1", email: "atlas@asternal.app", passwordHash: "x", createdAt: "2026-01-01" },
      ]),
      _local_data_profiles: JSON.stringify([{ id: "u1", username: "atlas" }]),
    });
    expect(resolveLocalUsernameEmail("fantasma")).toBeNull();
    expect(resolveLocalUsernameEmail("")).toBeNull();
  });

  it("resuelve por la parte local del correo si no hay perfil", () => {
    installLocalStorage({
      _local_auth_users: JSON.stringify([
        { id: "u9", email: "otro@asternal.app", passwordHash: "x", createdAt: "2026-01-01" },
      ]),
    });
    expect(resolveLocalUsernameEmail("otro")).toBe("otro@asternal.app");
  });
});
