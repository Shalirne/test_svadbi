# Технический отчёт по интеграции RSVP -> backend -> Google Sheets

## Что реализовано
- В frozen проект встроен backend endpoint `POST /api/rsvp`.
- Форма на фронтенде отправляет JSON в backend, а backend добавляет новую строку в Google Sheets.
- Реализованы серверная валидация, нормализация, проверка листа `RSVP` и строгого порядка колонок.
- Добавлены состояния `pending / success / error` без изменения layout и без редизайна.
- Защита от двойной отправки включена: кнопка блокируется, повторный submit игнорируется.
- Проект запускается на обычном Node-хостинге без Docker и без внешних npm-зависимостей.

## Финальная схема колонок Google Sheets
Backend ожидает лист `RSVP` со строкой заголовков ровно в таком порядке:

`submitted_at | full_name | family_details | attendance | drinks | allergy | allergy_details | music_track | source`

## Финальный маппинг формы -> таблица
Поля frozen frontend:
- `guest_name`
- `guest_family`
- `attendance`
- `drinks`
- `allergy`
- `allergy_details`
- `music_track`

Маппинг записи в Google Sheets:
- `submitted_at` <- заполняется backend в формате `YYYY-MM-DD HH:mm:ss`
- `full_name` <- `guest_name.trim()`
- `family_details` <- `guest_family.trim()`
- `attendance` <- значение выбранного radio
- `drinks` <- список выбранных checkbox, сохранённый строкой через `, `
- `allergy` <- значение выбранного radio
- `allergy_details` <- обязательно только если `allergy = "Да"`, иначе пустая строка
- `music_track` <- `music_track.trim()`
- `source` <- всегда `site`

## Валидация
Обязательные поля:
- `full_name`
- `attendance`

Условно обязательное поле:
- `allergy_details`, только если `allergy = "Да"`

Для пустых значений backend пишет пустую строку `""`.
`null` и `undefined` в таблицу не записываются.

## Изменённые файлы
- `server.js`
  - backend-сервер и раздача статики;
  - `POST /api/rsvp`;
  - OAuth через Google service account;
  - проверка имени листа и заголовков;
  - append строки в Google Sheets;
  - безопасное логирование ошибок.
- `js/main.js`
  - отправка формы через `fetch('/api/rsvp')`;
  - сбор payload из frozen формы;
  - клиентская валидация;
  - блокировка кнопки во время отправки;
  - success/error/pending статусы.
- `index.html`
  - добавлен status-блок под кнопкой;
  - поле имени помечено как `required`.
- `css/styles.css`
  - минимальные стили для disabled-кнопки и status-сообщения.
- `package.json`
  - запуск через `node server.js`.
- `.env`
  - уже подготовлен для локального запуска с переданным service account.
- `.env.example`
  - шаблон env-переменных.

## Что подставлено
В архив уже включены:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_NAME`
- `GOOGLE_PRIVATE_KEY` в `.env`

Это сделано для готового локального запуска без дополнительной ручной сборки.

## Как запустить
```bash
npm start
```

После запуска открыть:
- `http://localhost:3000`

## Как проверить запись в таблицу
1. Открыть сайт.
2. Заполнить форму.
3. Нажать `Отправить`.
4. Проверить, что:
   - кнопка блокируется во время отправки;
   - появляется сообщение `Спасибо! Ваш ответ сохранён.`;
   - в лист `RSVP` добавляется новая строка;
   - данные не съезжают по колонкам;
   - `drinks` записывается одной строкой;
   - `allergy_details` остаётся пустым, если выбрано `Нет`.

## Примечание
- Docker не использовался.
- Контейнер не нужен.
- Реализация рассчитана на обычный Node-based hosting.


## Последнее обновление
- После успешной отправки форма показывает сообщение: `Спасибо, до встречи на Свадьбе`.
- Повторная отправка в рамках текущего открытия страницы отключена: после успеха все поля и кнопка формы блокируются до перезагрузки страницы.
