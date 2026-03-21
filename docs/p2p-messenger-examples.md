# Примеры мессенджеров с P2P-доставкой и децентрализованным хранением

## Зачем нам это

Ниже собраны реальные проекты, на которые полезно смотреть при проектировании нашего мессенджера.

Важно сразу разделять три разные модели:

- direct P2P: устройства общаются друг с другом напрямую;
- decentralized relay/store-and-forward: доставка и временное хранение идут через распределенную сеть нод;
- local-first storage: данные в первую очередь живут на устройстве, а не в центральной облачной базе.

У разных проектов эти свойства сочетаются по-разному.

## Короткая таблица


| Проект     | Что это                               | Доставка                                                | Где хранятся данные                          | Насколько близко к нам                    |
| ---------- | ------------------------------------- | ------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| Briar      | privacy-first P2P messenger           | direct P2P через Bluetooth / Wi-Fi / Tor                | в основном локально на устройствах           | очень близко по духу                      |
| Berty      | distributed / offline-first messenger | peer-to-peer, включая offline/local transports          | локально на устройствах                      | очень близко как mobile/offline ориентир  |
| Session    | decentralized messenger               | через сеть децентрализованных нод, не чистый direct P2P | распределенно, с offline delivery через сеть | полезно как пример decentralized delivery |
| Tox / uTox | классический P2P messenger stack      | direct peer-to-peer                                     | в основном у клиентов                        | полезно как старый, но важный reference   |


## 1. Briar

Сайт: [https://briarproject.org/](https://briarproject.org/)

Почему важен:

- это один из самых понятных примеров настоящего privacy-first P2P messenger;
- проект изначально строился вокруг отсутствия центрального сервера как источника истины;
- поддерживает альтернативные транспорты, включая Bluetooth, Wi-Fi и Tor.

Что полезно нам:

- thinking in local-first storage;
- event-based sync между peers;
- работа в нестабильной сети;
- сильный offline mindset.

Что стоит помнить:

- такой подход обычно сложнее в UX и надежности, чем серверная модель;
- для массового мессенджера direct P2P без fallback может быть тяжелым в поддержке.

Вывод:

- если мы хотим именно "по-настоящему P2P", то Briar ближе всего к этому направлению.

## 2. Berty

Сайт: [https://berty.tech/features](https://berty.tech/features)

Почему важен:

- Berty прямо заявляет privacy-first и fully distributed подход;
- делает акцент на отсутствии серверов и облака;
- интересен именно как mobile/offline-first reference.

Что полезно нам:

- подход к локальному хранению;
- offline и nearby communication mindset;
- peer-to-peer на мобильных устройствах как first-class сценарий.

Что стоит помнить:

- это сложная инженерная зона: мобильные ограничения, батарея, background execution, сетевые ограничения;
- не все такие идеи одинаково легко превращаются в consumer-friendly продукт.

Вывод:

- Berty полезен как ориентир для mobile distributed architecture, особенно если мы хотим серьезно думать про offline-first.

## 3. Session

Сайт: [https://getsession.org/](https://getsession.org/)

Docs: [https://docs.getsession.org/session-messenger](https://docs.getsession.org/session-messenger)

Почему важен:

- Session децентрализован, но это не чистый device-to-device P2P;
- доставка идет через сеть распределенных нод;
- есть decentralized offline message delivery и onion-routed paths;
- архитектурно это скорее distributed network messenger, чем классический direct P2P chat.

Что полезно нам:

- как строить decentralized delivery, когда собеседник offline;
- как убирать зависимость от одной центральной базы;
- как сочетать privacy и более практичную доставку, чем pure direct P2P.

Что стоит помнить:

- Session ближе к "децентрализованная транспортная сеть", чем к "устройства говорят только напрямую";
- это уже другая архитектурная семья, чем Briar.

Вывод:

- если нам нужен realistic path между обычным клиент-серверным мессенджером и жестким direct P2P, Session очень полезен как компромиссная модель.

## 4. Tox / uTox

Сайт: [https://utox.org/](https://utox.org/)

Почему важен:

- это один из самых известных старых P2P messenger ecosystems;
- no registration, Tox ID, direct peer-to-peer communications;
- важный исторический reference для decentralized IM.

Что полезно нам:

- базовая модель peer identities;
- понимание direct P2P messaging и file transfer без аккаунтов/номеров;
- reference для того, как выглядит P2P-first стек без центрального облака.

Что стоит помнить:

- это более старый стек и не обязательно лучший пример современного mobile UX;
- многие идеи полезны архитектурно, но не как готовый product reference.

Вывод:

- смотреть стоит скорее как на протокольный и исторический ориентир, чем как на лучший UX-образец.

## Что из этого ближе к нашему проекту

Если сравнивать с нашим направлением, картина такая:

### Самые близкие

- Briar
- Berty

Почему:

- local-first mindset;
- хранение на устройстве;
- сильный упор на peer-to-peer и distributed behavior;
- меньше зависимости от центральной серверной модели.

### Полезный компромиссный ориентир

- Session

Почему:

- показывает, как можно сделать decentralized delivery практичнее;
- помогает понять модель "не один центральный сервер, но и не только direct P2P";
- особенно полезен, если нам нужен офлайн-доставка и более надежная маршрутизация.

### Больше как протокольный reference

- Tox

Почему:

- полезен для понимания самой P2P-идеи;
- менее полезен как ориентир для современного polished mobile messenger UX.

## Что у них можно позаимствовать

### Из Briar

- local-first architecture;
- синк как обмен событиями, а не как чтение единой серверной строки;
- работа в плохой сети и без постоянного интернета.

### Из Berty

- distributed mobile-first thinking;
- offline-first product assumptions;
- уважение к ограничениям мобильных устройств при P2P-подходе.

### Из Session

- decentralized delivery через распределенную сеть;
- store-and-forward мышление;
- архитектуру, где direct P2P не обязателен для каждого сообщения.

### Из Tox

- peer identity model;
- direct P2P message and file transfer basics;
- взгляд на P2P messenger без регистрации и облачного аккаунта.

## Практический вывод для нас

Если мы хотим двигаться постепенно, а не пытаться за один шаг уйти в "полный decentralized messenger", наиболее реалистичный путь такой:

1. Сохранить local-first client storage.
2. Продолжать мыслить сообщения и chat state как события.
3. Разделить direct P2P transport и fallback delivery.
4. Для offline-доставки допустить не чистый direct P2P, а distributed relay/store-and-forward слой.

Если хотим ориентир по архитектуре:

- для pure P2P смотреть на Briar и Berty;
- для practical decentralized delivery смотреть на Session;
- для базовой P2P-модели и истории смотреть на Tox.

## Короткий итог

- "P2P messenger" и "decentralized messenger" не всегда одно и то же.
- Briar и Berty ближе к нашей идее direct/local-first distributed chat.
- Session очень полезен как пример decentralized delivery через сеть нод.
- Tox полезен как классический reference по P2P messaging.

