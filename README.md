Fullstack Todo

Архитектура

Приложение состоит из пяти основных сервисов, запускаемых через Docker Compose: React frontend, Node.js backend, MongoDB, Redis и Nginx reverse proxy на edge уровне. Во фронтенде используется React и Vite, он собирается в статический бандл и обслуживается отдельным nginx внутри контейнера frontend. Backend представляет собой Node.js приложение на Express с MongoDB для хранения задач и Redis для кеширования списков задач. Внешний Nginx принимает входящий трафик, проксирует запросы к frontend и backend и отвечает за rate limiting, заголовки безопасности, health-check и SSL в production.

Основные компоненты

Frontend

Код находится в каталоге frontend. Используется React и Vite, точки входа index.html и src/main.jsx, основной компонент src/components/TodoApp.jsx. Приложение читает базовый URL API из VITE_API_URL или REACT_APP_API_URL. Список задач загружается через GET /api/todos, отображаются приоритет, статус, дедлайн и вложения. Создание задач происходит через форму с multipart upload и опциональным файлом, что отправляет запрос POST /api/todos. Кнопки позволяют переключать статус выполнения через PUT /api/todos/:id и удалять задачи через DELETE /api/todos/:id. Ссылки на вложения формируются как /uploads/filename и отдаются через reverse proxy Nginx.

Backend

Код находится в каталоге backend. Конфигурация управляется переменными окружения: NODE_ENV, PORT, MONGODB_URI, REDIS_URL, CORS_ORIGIN, MAX_FILE_SIZE, ENABLE_ANALYTICS, ENABLE_FILE_UPLOAD и другими. Приложение использует helmet и express-rate-limit для базовой защиты и ограничения запросов к /api, а также cors с origin из CORS_ORIGIN. Парсеры JSON и urlencoded настроены с лимитом 10 мегабайт и обслуживают все API. Каталог uploads отдается как статический по пути /uploads.

MongoDB подключается через MONGODB_URI с использованием mongoose, схема Todo содержит поля title, description, completed, priority с enum low, medium, high, dueDate и массив attachments. Каждый элемент массива attachments хранит имя файла, оригинальное имя, тип, размер и дату загрузки, а сама схема Todo использует timestamps для createdAt и updatedAt. Redis инициализируется через REDIS_URL, используется для кеширования ответов GET /api/todos, что уменьшает нагрузку на MongoDB и ускоряет выдачу результатов.

Основные маршруты backend:

GET /api/health возвращает статус подключений Mongo и Redis, текущее окружение, uptime процесса Node.js, информацию по памяти и идентификатор контейнера; если оба подключения активны, статус 200, иначе 503. GET /api/todos поддерживает фильтрацию по статусу completed или pending и по priority, а также пагинацию через параметры page и limit; результат кешируется в Redis на пять минут, если Redis доступен. POST /api/todos создает новую задачу, принимает multipart форму с полями title, description, priority, dueDate и attachments, сохраняет вложения на диск и метаданные в Mongo, а затем очищает связанные ключи кеша. PUT /api/todos/:id обновляет задачу по идентификатору, позволяет менять поля и при необходимости пересоздавать список вложений. DELETE /api/todos/:id удаляет задачу и очищает кеш. GET /api/analytics выполняет агрегирование и возвращает общее количество задач, количество завершенных и активных и распределение по приоритетам, если ENABLE_ANALYTICS включен.

Backend содержит обработку 404 для неизвестных маршрутов и graceful shutdown по сигналам SIGTERM и SIGINT, при котором корректно закрывается HTTP сервер, соединения Redis и MongoDB. Маршрут /uploads обслуживает файлы вложений, которые затем выдаются через внешний Nginx.

MongoDB и инициализация

MongoDB запускается в контейнере mongo, данные сохраняются в volume mongo-data. На старте контейнера используется скрипт mongo-init.js, который создается в корне проекта и монтируется в /docker-entrypoint-initdb.d. Скрипт создает базу данных todoapp и коллекцию todos, добавляет индексы по полям createdAt, completed, priority и dueDate и вставляет несколько тестовых документов, чтобы интерфейс сразу показывал примерные задачи.

Redis

Redis запускается с включенным appendonly режимом в контейнере redis. Backend подключается к Redis по REDIS_URL и использует его для кеширования ответов по спискам задач. Для управления кешем используются ключи вида todos фильтр страница лимит, а при изменении данных в API кеш очищается через сканирование по паттерну todos:. Health-check backend показывает состояние подключения к Redis.

Nginx reverse proxy

Файл конфигурации nginx/nginx.conf описывает edge Nginx для окружения без SSL. Определены upstream блоки frontend_upstream для frontend:80 и backend_upstream для backend:3000, включен gzip для типичных текстовых и бинарных типов, настроены таймауты и keepalive. Локация /api/todos использует отдельную зону лимитирования uploads_limit с более строгими ограничениями и проксирует запросы к backend, включая настройки заголовков Host, X-Real-IP и X-Forwarded-For и таймауты на соединение и чтение. Локация /api/ применяет общую зону лимитирования api_limit и также проксирует к backend. Локация /uploads/ отдаёт вложения через backend и может использовать кэширование ответов для успешных запросов. Локация /health проксирует на /api/health backend. Путь /nginx-status включает stub_status и ограничен по IP. Путь / проксирует на frontend_upstream, обеспечивая прямой доступ к SPA.

SSL конфигурация

Файл nginx/nginx-ssl.conf описывает вариант конфигурации для production с TLS. Он определяет редирект с HTTP на HTTPS через сервер на 80 порту, а сервер на 443 использует ssl_certificate и ssl_certificate_key из каталога /etc/nginx/ssl. Включены протоколы TLSv1.2 и TLSv1.3, безопасные наборы шифров, кеш и таймауты сессий. Добавляются заголовки безопасности Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options и X-XSS-Protection. Сервер на 443 повторяет маршруты /api/todos, /api/, /uploads/, /health и /, проксируя их на backend и frontend, как в основной конфигурации. Сертификаты fullchain.pem и privkey.pem должны быть размещены в каталоге nginx/ssl и монтироваться в контейнер Nginx в production.

Docker Compose для разработки

Файл docker-compose.yml описывает стек для локальной разработки. Сервис frontend собирается из каталога ./frontend с использованием Dockerfile, получает переменную окружения VITE_API_URL=http://localhost/api и подключается к сети frontend-network, завися от backend. Сервис backend собирается из ./backend, получает значения NODE_ENV=development, PORT=3000, MONGODB_URI=mongodb://mongo:27017/todoapp, REDIS_URL=redis://redis:6379, CORS_ORIGIN=http://localhost, MAX_FILE_SIZE, ENABLE_ANALYTICS и ENABLE_FILE_UPLOAD, монтирует каталоги ./backend/uploads и ./backend/logs в контейнер и подключается к backend-network, завися от mongo и redis.

Сервис mongo использует образ mongo:6, монтирует volume mongo-data в /data/db и файл mongo-init.js как скрипт инициализации, а также имеет healthcheck на команду ping через mongosh. Сервис redis использует образ redis:7-alpine с включенным appendonly режимом и healthcheck через redis-cli ping, данные сохраняются в volume redis-data. Сервис nginx использует образ nginx:alpine, публикует порт 80 на хост, монтирует nginx/nginx.conf как основной конфиг и зависит от frontend и backend, подключаясь к обеим сетям frontend-network и backend-network. Для Nginx определен healthcheck, который вызывает /health.

Docker Compose для production

Файл docker-compose.prod.yml представляет собой override для production. Для frontend он задает VITE_API_URL=https://yourdomain.com/api и restart unless-stopped. Для backend включает NODE_ENV=production и LOG_LEVEL=error, устанавливает лимиты и резервации ресурсов по CPU и памяти, настраивает логирование через драйвер json-file с ограничениями по размеру и количеству файлов и включает restart unless-stopped. Для mongo задаются переменные MONGO_INITDB_ROOT_USERNAME и MONGO_INITDB_ROOT_PASSWORD_FILE, секрет mongo_password подключается через Docker secrets и также настраиваются лимиты ресурсов и restart unless-stopped. Для redis задаются ресурсы и restart unless-stopped. Сервис nginx в production публикует порты 80 и 443, монтирует nginx/nginx-ssl.conf как основной конфиг Nginx и каталог nginx/ssl с сертификатами, а также использует restart unless-stopped. Секрет mongo_password читается из файла secrets/mongo_password.txt.

Monitoring и health-check

Файл docker-compose.monitoring.yml описывает сервисы Prometheus и Grafana. Prometheus использует образ prom/prometheus и монтирует файл конфигурации prometheus.yml, слушая порт 9090 на хосте и подключаясь к backend-network. Grafana использует образ grafana/grafana-oss, задает пароль администратора через GF_SECURITY_ADMIN_PASSWORD, публикует порт 3001 на хосте и сохраняет данные в volume grafana-data. Оба сервиса находятся в сети backend-network.

Скрипт scripts/health-check.sh выполняет docker-compose ps для проверки состояния сервисов и затем вызывает curl к http://localhost/health и http://localhost/api/health, возвращая код ошибки, если какой-либо запрос неуспешен. Скрипт помечен как исполняемый и может использоваться в CI или локально для быстрой проверки.

Окружение

Файлы .env.example и .env.production недоступны для автоматического редактирования, но должны содержать следующие ключи. NODE_ENV определяет режим работы приложения (development или production). PORT задает порт backend, обычно 3000. MONGODB_URI задает строку подключения к MongoDB, например mongodb://mongo:27017/todoapp. MONGO_USERNAME и MONGO_PASSWORD используются для авторизации в Mongo при необходимости. REDIS_URL задает адрес Redis, например redis://redis:6379, а REDIS_PASSWORD при необходимости содержит пароль. JWT_SECRET должен быть строкой длиной не менее 32 символов для будущих функций авторизации. CORS_ORIGIN определяет origin фронтенда, например http://localhost или https://yourdomain.com. MAX_FILE_SIZE задает максимальный размер файла в байтах, UPLOAD_DIR путь к каталогу загрузок в контейнере, LOG_LEVEL задает уровень логирования, а ENABLE_ANALYTICS и ENABLE_FILE_UPLOAD включают или отключают соответствующие возможности.

Команды запуска

Для запуска окружения разработки в корне проекта можно выполнить docker-compose up --build или docker-compose up -d --build для фонового запуска. Для просмотра логов всех сервисов используется docker-compose logs -f. Масштабирование backend в режиме разработки выполняется командой docker-compose up --scale backend=2. Для production используется docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build и обновление отдельного сервиса выполняется командой docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps backend. Проверить статус можно через docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps.

Резервное копирование MongoDB и восстановление

Для резервного копирования базы данных todoapp можно использовать docker exec todo-mongo mongodump --db todoapp --out /backup, а для копирования данных volume в архив tar использовать контейнер alpine с примонтированным volume и рабочим каталогом. Восстановление выполняется аналогичным образом, распаковкой архива в каталог данных volume.


