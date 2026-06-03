# HardZone Backup and Restore

Цель: перед изменениями базы, оплат, расписания и прав доступа иметь понятную процедуру сохранения PostgreSQL и проверяемого восстановления.

## Когда делать backup

Backup обязателен перед:

- production deploy с миграциями;
- изменениями AQSI, оплат, заказов и фискализации;
- изменениями расписания, посещений, абонементов;
- изменениями ролей, прав доступа и пользователей;
- ручными SQL-операциями на production;
- любым production restore.

Перед restore на production всегда сначала сделать свежий backup текущего состояния.

## Быстрая команда

Из корня репозитория на Windows:

```powershell
.\scripts\backup-production.ps1
```

Скрипт подключается к `79.137.162.55`, читает `/srv/HardZone/backend/.env`, создаёт custom dump PostgreSQL и показывает список последних backup-файлов.

Опционально:

```powershell
.\scripts\backup-production.ps1 -BackupDir /srv/backups/hardzone
```

## Production backup вручную

Проверить SSH:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o ConnectTimeout=10 root@79.137.162.55 "echo ok"
```

Создать каталог для backup, если его ещё нет:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "mkdir -p /srv/backups/hardzone && chown app:app /srv/backups/hardzone && chmod 750 /srv/backups/hardzone"
```

Зайти на сервер:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55
```

Выполнить на сервере:

```bash
su - app
cd /srv/HardZone/backend

backup_file="/srv/backups/hardzone/hardzone_$(date +%Y%m%d_%H%M%S).dump"
database_url="$(sed -n 's/^DATABASE_URL=//p' .env | tail -n 1)"

if [ -n "$database_url" ]; then
  pg_dump --format=custom --no-owner --no-privileges --file="$backup_file" "$database_url"
else
  db_host="$(sed -n 's/^DB_HOST=//p' .env | tail -n 1)"
  db_port="$(sed -n 's/^DB_PORT=//p' .env | tail -n 1)"
  db_name="$(sed -n 's/^DB_NAME=//p' .env | tail -n 1)"
  db_user="$(sed -n 's/^DB_USER=//p' .env | tail -n 1)"
  db_password="$(sed -n 's/^DB_PASSWORD=//p' .env | tail -n 1)"

  PGPASSWORD="$db_password" pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file="$backup_file" \
    -h "${db_host:-127.0.0.1}" \
    -p "${db_port:-5432}" \
    -U "$db_user" \
    -d "$db_name"
fi

ls -lh "$backup_file"
```

Проверить последние файлы:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "ls -lh /srv/backups/hardzone | tail -n 10"
```

## Скачать backup локально

```powershell
scp -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55:/srv/backups/hardzone/hardzone_YYYYMMDD_HHMMSS.dump .
```

Не коммитить `.dump`, `.backup`, `.sql`, `.sql.gz` файлы в репозиторий.

## Test restore locally

Проверку восстановления делать на отдельной локальной или staging-базе, не на рабочей базе разработки.

```powershell
createdb hardzone_restore
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "postgres://hardzone:hardzone@127.0.0.1:5432/hardzone_restore" .\hardzone_YYYYMMDD_HHMMSS.dump
```

После restore прогнать миграции на восстановленной базе:

```powershell
cd backend
$env:DATABASE_URL="postgres://hardzone:hardzone@127.0.0.1:5432/hardzone_restore"
npm run migrate
```

Минимальная проверка данных:

```powershell
psql "postgres://hardzone:hardzone@127.0.0.1:5432/hardzone_restore" -c "SELECT COUNT(*) AS users_count FROM users;"
psql "postgres://hardzone:hardzone@127.0.0.1:5432/hardzone_restore" -c "SELECT COUNT(*) AS orders_count FROM orders;"
psql "postgres://hardzone:hardzone@127.0.0.1:5432/hardzone_restore" -c "SELECT COUNT(*) AS clients_count FROM clients;"
```

## Test restore on production server

Быстрая проверка последнего production dump во временную БД на том же сервере:

```powershell
.\scripts\test-restore-production-backup.ps1
```

Скрипт:

- берёт последний `/srv/backups/hardzone/hardzone_*.dump`, если файл не указан явно;
- создаёт временную БД `hardzone_restore_YYYYMMDD_HHMMSS`;
- выполняет `pg_restore`;
- выводит counts по `users`, `clients`, `orders`, `schema_migrations`;
- удаляет временную БД после успешной проверки.

Проверить конкретный файл:

```powershell
.\scripts\test-restore-production-backup.ps1 -BackupFile /srv/backups/hardzone/hardzone_YYYYMMDD_HHMMSS.dump
```

Оставить временную БД для ручного просмотра:

```powershell
.\scripts\test-restore-production-backup.ps1 -KeepDatabase
```

## Staging restore

Для staging использовать отдельную БД, отдельный `.env` и отдельные PM2-процессы. Не восстанавливать production dump в production DB ради проверки.

Рекомендуемый порядок:

1. Остановить staging backend.
2. Сделать backup текущей staging DB.
3. Очистить или пересоздать staging DB.
4. Восстановить production dump в staging DB.
5. Запустить `npm run migrate` на staging DB.
6. Запустить staging backend/frontend.
7. Проверить login, `/health`, продажи, расписание, права доступа.

Подробности staging-контура: `docs/STAGING.md`.

## Production restore

Production restore разрешён только как аварийная операция.

Порядок:

1. Зафиксировать причину restore и выбранный backup-файл.
2. Сделать свежий backup текущего production.
3. Остановить backend и frontend PM2.
4. Восстановить выбранный dump.
5. Прогнать миграции.
6. Запустить PM2.
7. Выполнить `.\scripts\smoke-production.ps1`.
8. Проверить логи backend/frontend.

Команды PM2:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 stop inventory-backend hardzone-frontend'"
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 restart inventory-backend hardzone-frontend'"
```

Перед restore сверить production `.env` на сервере:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'cd /srv/HardZone/backend && grep -E \"^(DATABASE_URL|DB_HOST|DB_PORT|DB_NAME|DB_USER)=\" .env | sed \"s/=.*/=<set>/\"'"
```

## Retention

Минимальная схема хранения:

- хранить daily backup за последние 7 дней;
- хранить weekly backup за последние 4 недели;
- перед каждым production deploy с миграцией хранить отдельный pre-deploy backup;
- не хранить dumps в Git;
- не отправлять dumps в публичные чаты и issue.

## Проверка процедуры

Раз в месяц или перед большим релизом выполнить test restore на staging/local и записать:

- дата backup;
- дата restore;
- имя dump-файла;
- прошли ли миграции;
- прошёл ли smoke-check;
- кто проверял.
