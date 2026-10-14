// Client-side: auth attacher not needed for SSR middleware
import { supabase } from './client'

export const attachSupabaseAuth = {
  type: 'function' as const,
  client: () => ({
    async next(ctx?: { headers?: Record<string, string> }) {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      return ctx?.headers
        ? { headers: token ? { ...ctx.headers, Authorization: `Bearer ${token}` } : ctx.headers }
        : undefined
    },
  }),
}
