---
id: platform-admin
priority: 100
fallback: false
select:
  keywords:
    - { term: admin, weight: 3 }
    - { term: админ, weight: 3 }
    - { term: платформ, weight: 3 }
    - { term: platform, weight: 3 }
    - { term: backoffice, weight: 3 }
    - { term: bitrix, weight: 3 }
  useCases:
    ids: [UC-01, UC-02]
    weight: 2
  fields:
    title: 2.0
    keySkills: 1.5
    description: 0.8
---

Здравствуйте!

Заинтересовала вакансия {{role}}{{company_suffix}}. Делаю внутренние платформы и админ-панели на React/TypeScript: роли и права, сложные формы, таблицы, интеграции с SSO/CMS и backend.

{{facts}}

Готов обсудить, чем буду полезен вашей платформенной команде.

{{candidate_name}}
{{contact_footer}}
