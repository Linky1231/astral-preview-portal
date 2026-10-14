import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Esquema mínimo para que el proyecto Convex de la plataforma sea válido y
// desplegable. La app real usa Supabase; estas tablas no se usan desde el front.
export default defineSchema({
  pings: defineTable({
    at: v.number(),
    note: v.optional(v.string()),
  }),
});
