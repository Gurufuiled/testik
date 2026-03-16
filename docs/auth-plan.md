# План: Auth + Logout (Loginus) для мобильного мессенджера

## 1. HTTP callback для OAuth (текущее состояние)

**Проблема:** Loginus не поддерживает custom scheme (`messenger://`), redirect идёт на HTTP. WebView на Android не вызывает `onShouldStartLoadWithRequest` при редиректах.

**Решение (уже реализовано):**
- Backend `GET /api/auth/callback` возвращает **HTML** вместо 302
- HTML вызывает `window.ReactNativeWebView.postMessage()` с `{ type: 'auth', code, redirect_uri }`
- Mobile: `onMessage` получает данные, вызывает `POST /auth/loginus` для обмена code на токены

**Требования:**
- `usesCleartextTraffic: true` в app.json (Android)
- `LOGINUS_REDIRECT_URI=http://192.168.1.85:4000/api/auth/callback` в Loginus
- Телефон и сервер в одной сети

---

## 2. Хранение id_token локально (для SLO)

**Где:** на устройстве (AsyncStorage / SecureStore)

**Когда сохранять:** при успешном логине, в ответе от `POST /auth/loginus` бэкенд возвращает `id_token` (если Loginus его отдал).

**Схема:**
```
Логин → POST /auth/loginus → { access_token, refresh_token, user, id_token }
→ Сохраняем id_token в SecureStore
```

**При повторном входе:** да, новый `id_token` приходит при каждом логине через Loginus. Старый можно удалить, если был.

**Минусы (приняты):**
- Доверяем клиенту
- При переустановке приложения — потеря id_token (SLO без hint всё равно может работать)
- При компрометации устройства — токен уязвим

**Плюсы:**
- Сервер не хранит id_token
- Меньше нагрузки на БД

---

## 3. Backend: отдача id_token при логине

**Изменение:** `POST /auth/loginus` в ответе добавляет `id_token` (если Loginus его вернул в ответе token exchange).

**Формат ответа:**
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1234567890,
  "user": { ... },
  "id_token": "eyJ..."  // опционально, для SLO
}
```

---

## 4. Logout (SLO) — flow

### 4.1 Backend: `POST /auth/logout` (расширить)

**Текущее:** удаляет refresh token из БД, возвращает `{ ok: true }`.

**Новое:**
1. Удалить refresh token из БД (как сейчас)
2. Принять `id_token` в теле запроса (опционально, от клиента)
3. Если есть `id_token` — построить SLO URL:
   ```
   {LOGINUS_BASE_URL}/api/v2/oauth/end_session?id_token_hint=...&client_id=...&post_logout_redirect_uri=...
   ```
4. Вернуть `{ ok: true, slo_url: "..." }` (если SLO URL построен)
5. Если `id_token` нет — вернуть `{ ok: true }` (локальный logout)

### 4.2 Backend: `GET /api/auth/logout-done`

**Назначение:** URL, куда Loginus редиректит после SLO.

**Реализация:** возвращает HTML (как callback):
- `postMessage` с `{ type: 'logout_done' }` для WebView
- или fallback `window.location = 'messenger://logout'`

### 4.3 Настройка Loginus

- **Post Logout Redirect URI:** `http://192.168.1.85:4000/api/auth/logout-done`
- Добавить в настройках OAuth-клиента в Loginus

---

## 5. Mobile: хранение id_token и логика logout

### 5.1 При логине

- Сохранять `id_token` в SecureStore (если есть в ответе)
- Ключ: `loginus_id_token` или `@auth/id_token`

### 5.2 При logout

1. Вызвать `POST /auth/logout` с `id_token` в body (если есть)
2. Очистить локальные токены (access, refresh, id_token)
3. Если в ответе есть `slo_url`:
   - Открыть WebView с `slo_url`
   - WebView загрузит Loginus → Loginus сделает SLO → редирект на `logout-done`
   - Наш `logout-done` вернёт HTML с postMessage
   - `onMessage` получит `logout_done` → закрыть WebView, показать экран логина
4. Если `slo_url` нет — просто показать экран логина

### 5.3 Обработка `logout-done` в WebView

- Добавить `onMessage` обработку для `type: 'logout_done'`
- Закрыть WebView (если открыт), перейти на LoginScreen

---

## 6. Чек-лист реализации

| # | Задача | Файл |
|---|--------|------|
| 1 | Backend: возвращать id_token в loginWithCode | auth.service.ts |
| 2 | Backend: POST /auth/logout — принимать id_token, строить slo_url | auth.controller.ts |
| 3 | Backend: GET /api/auth/logout-done — HTML с postMessage | auth.controller.ts |
| 4 | Mobile: сохранять id_token при логине | AuthService, SecureStore |
| 5 | Mobile: при logout отправлять id_token, обрабатывать slo_url | LogoutScreen / Settings |
| 6 | Mobile: WebView для SLO, обработка logout_done | LoginScreen или отдельный компонент |
| 7 | Loginus: добавить Post Logout Redirect URI | Панель Loginus |

---

## 7. Переменные окружения

**server/.env:**
```
LOGINUS_REDIRECT_URI=http://192.168.1.85:4000/api/auth/callback
LOGINUS_REDIRECT_URI_LOGOUT=http://192.168.1.85:4000/api/auth/logout-done  # для post_logout_redirect_uri
```

(Или использовать один базовый URL и конкатенировать пути.)
