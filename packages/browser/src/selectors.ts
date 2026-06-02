/**
 * HH.ru selectors and detection texts. Text-based locators are more resilient
 * than CSS, but markup changes happen; on mismatch we classify selector_broken
 * and route to the playwright-repair queue rather than guessing.
 */
export const HH = {
  respondButton: [
    '[data-qa="vacancy-response-link-top"]',
    '[data-qa="vacancy-response-link-bottom"]',
  ],
  respondButtonText: ["Откликнуться", "Откликнуться на вакансию"],
  alreadyAppliedText: [
    "Вы откликнулись",
    "Резюме отправлено",
    "Отклик отправлен",
  ],
  loginText: ["Войти", "Вход", "Авторизуйтесь"],
  /** HH shows this when cookies exist but the session cannot view the vacancy. */
  authWallText: [
    "Вам недоступна эта вакансия",
    "Войдите как пользователь, у которого есть доступ",
  ],
  authCookieName: "hhtoken",
  /** Guest sessions also get hhtoken; role distinguishes anonymous vs logged-in. */
  authRoleCookieName: "hhrole",
  authApplicantRole: "applicant",
  coverLetterToggleText: [
    "Сопроводительное письмо",
    "Добавить сопроводительное",
  ],
  coverLetterTextarea: [
    '[data-qa="vacancy-response-popup-form-letter-input"]',
    'textarea[name="text"]',
  ],
  submitButton: [
    '[data-qa="vacancy-response-submit-popup"]',
    '[data-qa="vacancy-response-letter-submit"]',
    '[data-qa="vacancy-response-popup-submit-button"]',
  ],
  submitButtonText: ["Откликнуться", "Отправить"],
  successText: [
    "Резюме доставлено",
    "Вы откликнулись",
    "Отклик доставлен",
    "Отклик успешно отправлен",
    "Отклик отправлен",
    "Сообщение отправлено",
  ],
  crossCountryText: ["вакансию в другой стране", "другой стран"],
  crossCountryConfirmText: ["Все равно откликнуться", "Всё равно откликнуться"],
  resumeOptionSelectors: [
    '[data-qa*="resume-card"]',
    '[data-qa*="resume-selector"]',
    '[data-qa*="resume-item"]',
  ],
  questionnaireText: [
    "Заполните анкету",
    "Ответьте на вопросы",
    "ответьте на вопрос",
    "обязательные вопросы",
    "Тестовое задание",
  ],
  resumeChooserText: ["Выберите резюме", "Какое резюме отправить"],
  captchaText: [
    "captcha",
    "Подтвердите, что вы не робот",
    "необычная активность",
  ],
};
