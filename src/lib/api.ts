import type { User } from "./types";

export const API_BASE =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) || "/api";

const TOKEN_KEY = "chateasy_token";
const USER_KEY = "chateasy_user";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: User): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable — session stays in memory only */
  }
}

export function storeUser(user: User): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, auth = true, query } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError("Cannot reach the server. Check your connection and try again.", 0);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") || "";
  let payload: any = null;
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => null);
  } else {
    const text = await response.text().catch(() => "");
    payload = text ? { message: text } : null;
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.message || `Request failed (${response.status})`,
      response.status,
      payload?.code,
      payload
    );
  }
  return payload as T;
}

export function mediaUrl(url?: string | null): string {
  if (!url) return "";
  const token = getToken();
  if (!url.startsWith("/api/media/") || !token) return url;
  return `${url}?token=${encodeURIComponent(token)}`;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

export function detectMediaKind(file: File): "image" | "video" | "audio" | "file" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

export interface UploadResult {
  _id: string;
  url: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "video" | "audio" | "file";
  duration?: number;
  width?: number;
  height?: number;
}

export async function uploadFile(
  file: File | Blob,
  options: { chatId?: string; name?: string; kind?: "image" | "video" | "audio" | "file"; duration?: number } = {}
): Promise<UploadResult> {
  const blob = file as Blob;
  if (blob.size > 12 * 1024 * 1024) throw new ApiError("Files must be 12 MB or smaller", 413);
  const named = file as File;
  const dataUrl = await readAsDataUrl(blob);
  const kind = options.kind || detectMediaKind(named);
  return api<UploadResult>("/uploads", {
    method: "POST",
    body: {
      dataUrl,
      name: options.name || named.name || `recording-${kind}`,
      kind,
      chatId: options.chatId,
      duration: options.duration,
    },
  });
}
