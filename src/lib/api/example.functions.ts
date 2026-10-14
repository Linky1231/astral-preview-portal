// Client-side stub — server functions are not available without TanStack Start
import { z } from "zod";

export const getGreeting = {
  inputValidator: z.object({ name: z.string().min(1) }),
  handler: async ({ data }: { data: { name: string } }) => {
    return {
      greeting: `Hello, ${data.name}!`,
      mode: "client",
    };
  },
};
