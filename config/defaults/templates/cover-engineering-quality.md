---
id: engineering-quality
priority: 71
fallback: false
select:
  keywords:
    - { term: testing, weight: 3 }
    - { term: test, weight: 2 }
    - { term: ci/cd, weight: 3 }
    - { term: fsd, weight: 3 }
    - { term: code review, weight: 3 }
    - { term: качеств, weight: 3 }
    - { term: jest, weight: 2 }
    - { term: playwright, weight: 2 }
  useCases:
    ids: [UC-10]
    weight: 2
  fields:
    title: 2.0
    keySkills: 1.5
    description: 0.8
---

Здравствуйте!

Заинтересовала вакансия {{role}}{{company_suffix}}. Делаю продуктовый frontend и параллельно выстраиваю инженерную базу: тесты, CI/CD, code review, архитектурные практики.

{{facts}}

Готов обсудить, как усилить качество и скорость поставки в вашей команде.

{{candidate_name}}
{{contact_footer}}
