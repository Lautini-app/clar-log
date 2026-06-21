import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  // Preserve hash so Supabase magic-link tokens (#access_token=…&refresh_token=…)
  // survive the redirect and can be consumed by consumeSessionTokenFromUrl().
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/heute", hash: location.hash });
  },
});
