# Отчёт: логика отправки сообщений и синхронизация

## 1. Проблема: пустые сообщения в чате

### Текущий поток отправки

1. **InputBar** → `handleSendText()`: берёт `inputText.trim()`, проверяет `if (!content) return`, вызывает `onSendText(content)`.
2. **ChatScreen** → `handleSendText(text)`: создаёт сообщение с `content: text`, вызывает `addMessage()` и `TransportService.sendMessage(chatId, text, 'text', tempId)`.
3. **TransportService** → `sendMessage()`: вызывает `WebSocketService.sendEvent('send_message', { chat_id, content, msg_type })`.
4. **Сервер** → `handleSendMessage()`: получает `payload.content`, вызывает `createMessage(..., content ?? null, ...)`.
5. **Сервер** → broadcast: отправляет `{ type: 'message', message }`, где `message` — `MappedMessage` с полем `content`.

### Текущий поток получения

1. **WebSocketProvider** → `onNewMessage`: получает `payload.message`, вызывает `mapServerMessageToMessage(msg)` → `mapped` с `content: payload.content`.
2. **Отправитель**: ищет `sending` по `msg_type` и `content` (для текста), вызывает `updateMessage(..., { id, status, created_at, updated_at, media? })` — **content не передаётся**.
3. **Получатель**: вызывает `prependMessage(chat_id, mapped)` — `mapped` содержит `content`.

### Возможные причины пустых сообщений

| # | Гипотеза | Где проверить |
|---|----------|---------------|
| 1 | При обновлении сообщения отправителя `content` не передаётся — остаётся старый. Если `sending` выбран неверно, может подставиться пустое. | `WebSocketProvider.tsx` → `updateMessage` |
| 2 | Для текста берётся `sendingCandidates[0]` (новейший), а подтверждение приходит за первое (старейшее) — неверное сопоставление. | `WebSocketProvider.tsx` → логика `sending` |
| 3 | `fullSync` перезаписывает `messageStore` после получения по WebSocket — возможна гонка. | `SyncService.ts` → `fullSync` |
| 4 | API `GET /chats/:id/messages` возвращает другой формат (например, camelCase), и `content` не маппится. | `SyncService.ts` → `mapApiMessageToMessage` |

### Что нужно сделать

1. **Явно передавать `content` при обновлении сообщения отправителя:**
   ```ts
   updateMessage(msg.chat_id, sending.id, {
     id: mapped.id,
     status: mapped.status,
     content: mapped.content,  // добавить
     created_at: mapped.created_at,
     updated_at: mapped.updated_at,
     ...(mapped.media?.length && { media: mapped.media }),
   });
   ```

2. **Для текста использовать ту же логику, что и для media** — брать старейшее `sending` (первое отправленное), т.к. подтверждения приходят по порядку:
   ```ts
   const sending = sendingCandidates.length > 0
     ? sendingCandidates[sendingCandidates.length - 1]  // всегда старейшее
     : undefined;
   ```

3. **Проверить формат ответа API** — убедиться, что `GET /chats/:id/messages` возвращает `content` в snake_case и он корректно маппится в `mapApiMessageToMessage`.

4. **Добавить fallback для пустого `content`** — если `content` пустой, всё равно рендерить бабл с временем, чтобы не было «невидимых» сообщений.

---

## 2. Проблема: в чатах отображается «Chat» вместо имени пользователя

### Текущее поведение

- **ChatListScreen**: `{item.name || 'Chat'}` — для приватных чатов `name` обычно `null`.
- **ChatsStack**: `options={{ title: 'Chat' }}` — заголовок экрана всегда «Chat».

### Почему так

- У приватных чатов в БД `name` не задаётся.
- В `MappedChat` есть только `name`, `members` (user_id), нет `display_name` собеседника.

### Что нужно сделать

#### Вариант A: Сервер отдаёт имя собеседника

1. В **ChatsService** (или маппере) для приватных чатов вычислять `peer_display_name`:
   - взять `members`, исключить текущего пользователя;
   - для оставшегося пользователя взять `displayName` или `username` из User.
2. Добавить в ответ API поле, например: `peer_display_name` или `display_name`.
3. В **Chat** (клиент) добавить поле `peer_display_name?: string | null`.
4. В **ChatListScreen** и **ChatScreen** использовать:
   - `item.peer_display_name || item.name || 'Chat'` для заголовка/названия.

#### Вариант B: Клиент сам подставляет имя

1. Хранить **usersStore** (или кэш пользователей) с `id` → `display_name` / `username`.
2. При загрузке чатов дополнительно запрашивать данные пользователей по `members[].user_id` (если их ещё нет в кэше).
3. В **ChatListScreen** по `item.members` находить `user_id` собеседника и подставлять имя из `usersStore`.

#### Рекомендация

Вариант A проще и надёжнее: один источник правды на сервере, меньше запросов и логики на клиенте.

---

## 3. Краткий чеклист

### Отправка и синхронизация сообщений

- [x] Добавить `content` в `updateMessage` при обновлении сообщения отправителя.
- [x] Унифицировать выбор `sending` — всегда брать старейшее.
- [ ] Проверить формат API `GET /chats/:id/messages` и маппинг `content`.
- [x] Добавить fallback-рендер для сообщений с пустым `content`.

### Отображение имени в чатах

- [x] Добавить на сервере поле `peer_display_name` (или аналог) для приватных чатов.
- [x] Обновить маппер и DTO на сервере.
- [x] Обновить тип `Chat` и маппер на клиенте.
- [x] В **ChatListScreen** использовать `peer_display_name || name || 'Chat'`.
- [x] В **ChatsStack** для экрана Chat задавать `title` из `route.params` (имя чата/собеседника).
