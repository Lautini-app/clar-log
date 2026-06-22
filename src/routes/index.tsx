import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    throw redirect({ to: "/heute", search: location.search, hash: location.hash });
  },
});
