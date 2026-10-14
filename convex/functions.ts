import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Funciones mínimas para que el despliegue Convex de la plataforma tenga un
// punto de entrada válido. La aplicación real usa Supabase; esto es solo la
// base técnica que exige el pipeline de build de la plataforma.

export const ping = query({
  args: { when: v.optional(v.string()) },
  handler: async (_ctx, args) => `pong${args.when ? " " + args.when : ""}`,
});

export const countPings = query({
  handler: async (ctx) => (await ctx.db.query("pings").collect()).length,
});

export const addPing = mutation({
  args: { note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("pings", { at: Date.now(), note: args.note });
  },
});
