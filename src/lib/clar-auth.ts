import { supabase } from "@/integrations/supabase/client";

type TokenParams = {
  accessToken: string;
  refreshToken: string;
};

function getUrlParams(): URLSearchParams {

  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  hashParams.forEach((value, key) => {
    if (!params.has(key)) params.set(key, value);
  });
  return params;
}

export function readTokenParams(): TokenParams | null {
  if (typeof window === "undefined") return null;
  const params = getUrlParams();
  const accessToken =
    params.get("access_token") ?? params.get("accessToken") ?? params.get("token");
  const refreshToken = params.get("refresh_token") ?? params.get("refreshToken");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

function removeTokenParamsFromUrl() {
  const url = new URL(window.location.href);
  const keys = ["access_token", "accessToken", "token", "refresh_token", "refreshToken"];
  keys.forEach((key) => url.searchParams.delete(key));
  url.hash = "";
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export async function consumeSessionTokenFromUrl(): Promise<boolean> {
  const tokens = readTokenParams();
  if (!tokens) return false;

  const { error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  if (error) {
    return false;
  }

  removeTokenParamsFromUrl();
  return true;
}
