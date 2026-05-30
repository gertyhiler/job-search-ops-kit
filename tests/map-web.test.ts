import { describe, expect, it } from "vitest";
import { mapWebToHhDetail } from "@job-search/connectors";
import type { HhWebVacancyWithDetail } from "@job-search/browser";

const SAMPLE: HhWebVacancyWithDetail = {
  vacancyId: 133653223,
  name: "Senior backend developer (PHP, Symfony) в Fintech",
  company: { id: 1085439, name: "еКапуста" },
  compensation: {
    from: 400_000,
    to: 600_000,
    currencyCode: "RUR",
    gross: false,
  },
  publicationTime: { $: "2026-05-29T13:13:39.505+03:00" },
  area: { "@id": 1, name: "Москва" },
  "@workSchedule": "remote",
  workExperience: "between3And6",
  employment: { "@type": "FULL" },
  detail: {
    description: "<p>Build payment APIs.</p>",
    keySkills: ["PHP", "Symfony"],
  },
};

describe("mapWebToHhDetail", () => {
  it("maps shards + scraped detail to legacy HhVacancyDetail shape", () => {
    const mapped = mapWebToHhDetail(SAMPLE);
    expect(mapped.id).toBe("133653223");
    expect(mapped.alternate_url).toBe("https://hh.ru/vacancy/133653223");
    expect(mapped.published_at).toBe("2026-05-29T13:13:39.505+03:00");
    expect(mapped.employer).toEqual({ id: "1085439", name: "еКапуста" });
    expect(mapped.salary).toEqual({
      from: 400_000,
      to: 600_000,
      currency: "RUR",
      gross: false,
    });
    expect(mapped.schedule).toEqual({
      id: "remote",
      name: "Удалённая работа",
    });
    expect(mapped.experience).toEqual({
      id: "between3And6",
      name: "3–6 лет",
    });
    expect(mapped.description).toBe("<p>Build payment APIs.</p>");
    expect(mapped.key_skills).toEqual([{ name: "PHP" }, { name: "Symfony" }]);
  });
});
