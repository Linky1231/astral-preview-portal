// Client-side stub — OAuth not available in local mode.
export const lovable = {
  auth: {
    signInWithOAuth: async (_provider: string, _opts?: { redirect_uri?: string }) => {
      return { error: new Error('OAuth no disponible en modo local') };
    },
  },
};
