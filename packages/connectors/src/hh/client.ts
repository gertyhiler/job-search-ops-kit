// ---- HH vacancy shapes (legacy API field names, used by normalize) ----

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

export interface HhVacancyDetail extends HhSearchItem {
  description?: string;
  key_skills?: Array<{ name: string }>;
}
