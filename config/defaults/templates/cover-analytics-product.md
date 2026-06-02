---
id: analytics-product
priority: 75
fallback: false
select:
  keywords:
    - { term: analytics, weight: 3 }
    - { term: аналитик, weight: 3 }
    - { term: a/b, weight: 3 }
    - { term: ab test, weight: 3 }
    - { term: metrics, weight: 3 }
    - { term: метрик, weight: 3 }
  useCases:
    ids: [UC-09]
    weight: 2
  fields:
    title: 2.0
    keySkills: 1.5
    description: 0.8
---

Здравствуйте!

Заинтересовала вакансия {{role}}{{company_suffix}}. Совмещаю продуктовый frontend с аналитикой и экспериментами: метрики, A/B-тесты, инструменты для продуктовой команды.

{{facts}}

Готов обсудить, какие метрики и сценарии для вас приоритетны.

{{candidate_name}}
{{contact_footer}}
