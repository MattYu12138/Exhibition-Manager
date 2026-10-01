import { createI18n } from 'vue-i18n'
import axios from 'axios'
import zh from './zh'
import en from './en'

const savedLang = localStorage.getItem('lang') === 'en' ? 'en' : 'zh'
axios.defaults.headers.common['Accept-Language'] = savedLang

const i18n = createI18n({
  legacy: false,
  locale: savedLang,
  fallbackLocale: 'en',
  messages: { zh, en },
})

export function setLanguage(language) {
  const next = language === 'en' ? 'en' : 'zh'
  i18n.global.locale.value = next
  localStorage.setItem('lang', next)
  axios.defaults.headers.common['Accept-Language'] = next
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
}

// Transport errors are independent of the server's language. Preserve any
// server-provided details rather than replacing them with a generic message.
export function localizedError(error, t, fallback = 'common.requestFailed') {
  const serverMessage = error?.response?.data?.message
  if (serverMessage) return serverMessage
  const detail = error?.message || ''
  if (/network error|failed to fetch/i.test(detail)) return t('common.networkError')
  if (/timeout|timed out/i.test(detail)) return t('common.timeout')
  if (detail === '未登录') return t('common.unauthorized')
  return detail || t(fallback)
}

document.documentElement.lang = savedLang === 'zh' ? 'zh-CN' : 'en'
export default i18n
