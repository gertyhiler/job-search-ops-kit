export interface HhClientOptions {
  userAgent: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  oauthToken?: string;
}

export interface HhSearchParams {
  text: string;
  area?: number;
  schedule?: string[];
  experience?: string | null;
  page?: number;
  perPage?: number;
}

const DEFAULT_BASE = "https://api.hh.ru";

export class HhClient {
  readonly #ua: string;
  readonly #base: string;
  readonly #timeoutMs: number;
  readonly #token?: string;

  constructor(opts: HhClientOptions) {
    this.#ua = opts.userAgent;
    this.#base = opts.baseUrl ?? DEFAULT_BASE;
    this.#timeoutMs = opts.requestTimeoutMs ?? 15_000;
    this.#token =
      opts.oauthToken && opts.oauthToken.length > 0
        ? opts.oauthToken
        : undefined;
  }

  async #get(
    pathname: string,
    query: Record<string, string | number | string[] | undefined>,
  ): Promise<unknown> {
    const url = new URL(`${this.#base}${pathname}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, v);
      } else {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "user-agent": this.#ua,
          accept: "application/json",
          ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `HH API ${pathname} failed: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchVacancies(params: HhSearchParams): Promise<HhSearchResponse> {
    return (await this.#get("/vacancies", {
      text: params.text,
      area: params.area,
      schedule: params.schedule,
      experience: params.experience ?? undefined,
      page: params.page ?? 0,
      per_page: params.perPage ?? 50,
      order_by: "publication_time",
    })) as HhSearchResponse;
  }

  async getVacancy(id: string): Promise<HhVacancyDetail> {
    return (await this.#get(`/vacancies/${id}`, {})) as HhVacancyDetail;
  }
}

// ---- HH response shapes (only the fields we use) ----

export interface HhSalary {
  from: number | null;
  to: number | null;
  currency: string | null;
  gross: boolean | null;
}

export interface HhSearchItem {
  id: string;
  name: string;
  alternate_url: string;
  published_at: string;
  area?: { id?: string; name?: string };
  employer?: {
    id?: string;
    name?: string;
    url?: string;
    alternate_url?: string;
  };
  salary?: HhSalary | null;
  snippet?: { requirement?: string | null; responsibility?: string | null };
  schedule?: { id?: string; name?: string } | null;
  employment?: { id?: string; name?: string } | null;
  experience?: { id?: string; name?: string } | null;
}

export interface HhSearchResponse {
  items: HhSearchItem[];
  found: number;
  pages: number;
  page: number;
  per_page: number;
}

export interface HhVacancyDetail extends HhSearchItem {
  description?: string;
  key_skills?: Array<{ name: string }>;
}
