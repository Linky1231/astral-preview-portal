// Client-side: auth middleware not needed for SSR server functions
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export const requireSupabaseAuth = {
  type: 'function' as const,
  server: () => ({
    async next(ctx?: { context?: Record<string, unknown> }) {
      const SUPABASE_URL = typeof process !== 'undefined' ? process.env.SUPABASE_URL : undefined
      const SUPABASE_PUBLISHABLE_KEY = typeof process !== 'undefined' ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined

      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        throw new Error('Missing Supabase environment variables')
      }

      const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

      return ctx?.context
        ? { context: { ...ctx.context, supabase, userId: null, claims: null } }
        : { context: { supabase, userId: null, claims: null } }
    },
  }),
}
