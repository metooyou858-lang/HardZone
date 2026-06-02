# HardZone Backup and Restore

Цель: перед изменениями базы, оплат, расписания и прав доступа иметь понятную процедуру сохранения и проверки восстановления PostgreSQL.

## Когда делать backup

Backup обязателен перед:

- production deploy с миграциями;
- изменениями AQSI/оплат и заказов;
- изменениями расписания, посещений, абонементов;
- изменениями ролей, прав доступа и пользователей;
- ручными SQL-операциями на production.

Перед restore на production всегда сначала сделать свежий backup текущего состояния.

## Production backup

Подключение выполняется с Windows через ключ `~/.ssh/hardzone_deploy`.

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o ConnectTimeout=10 root@79.137.162.55 "echo ok"
```

Создать каталог для backup, если его ещё нет:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "mkdir -p /srv/backups/hardzone && chown app:app /srv/backups/hardzone && chmod 750 /srv/backups/hardzone"
```

Сделать backup из production `.env`. Сначала зайти на сервер:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55
```

Затем выполнить на сервере:

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
  PGPASSWORD="$db_password" pg_dump --format=custom --no-owner --no-privileges --file="$backup_file" -h "${db_host:-127.0.0.1}" -p "${db_port:-5432}" -U "$db_user" -d "$db_name"
fi

ls -lh "$backup_file"
```

Проверить, что файл появился и не пустой:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "ls -lh /srv/backups/hardzone | tail -n 10"
```

## Скачать backup локально

```powershell
scp -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55:/srv/backups/hardzone/hardzone_YYYYMMDD_HHMMSS.dump .
```

Не коммитить `.dump` файлы в репозиторий.

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

## Staging restore

Для staging использовать отдельную БД, отдельный `.env` и отдельные PM2-процессы. Не восстанавливать production dump в production DB для проверки.

Рекомендуемый порядок:

1. Остановить staging backend.
2. Сделать backup текущей staging DB.
3. Очистить или пересоздать staging DB.
4. Восстановить production dump в staging DB.
5. Запустить `npm run migrate` на staging DB.
6. Запустить staging backend/frontend.
7. Проверить login, `/health`, продажи, расписание, права доступа.

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

Restore-команда зависит от production DB name/user. Перед выполнением сверить `.env` на сервере:

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
