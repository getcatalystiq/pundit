"use client";

import { getAccessToken } from "./oauth-client";

export async function fetchWithAuth(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw {
      error: data.error || `Request failed: ${response.status}`,
      status: response.status,
    };
  }

  return response;
}
