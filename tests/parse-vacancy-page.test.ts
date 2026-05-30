import { describe, expect, it } from "vitest";
import { parseVacancyPageHtml } from "@job-search/browser";

const FIXTURE = `
<html><body>
<script>
{"vacancyId":133653223,"name":"Senior backend developer",
"description":"&lt;p&gt;&lt;strong&gt;Fintech team&lt;/strong&gt;&lt;/p&gt; Build APIs and payment services for international markets with high load and strict compliance requirements.",
"keySkills":{"keySkill":["Git","Symfony","PHP"]}}
</script>
</body></html>
`;

describe("parseVacancyPageHtml", () => {
  it("extracts HTML description and key skills from embedded JSON", () => {
    const parsed = parseVacancyPageHtml(FIXTURE);
    expect(parsed.description).toContain("<strong>Fintech team</strong>");
    expect(parsed.description).toContain("Build APIs and payment services");
    expect(parsed.keySkills).toEqual(["Git", "Symfony", "PHP"]);
  });

  it("returns empty when markers are missing", () => {
    expect(parseVacancyPageHtml("<html></html>")).toEqual({});
  });
});
