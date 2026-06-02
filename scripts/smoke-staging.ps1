$ErrorActionPreference = "Stop"

$sshKey = "$HOME\.ssh\hardzone_deploy"
$target = "root@79.137.162.55"

$remoteScript = @'
set -euo pipefail

echo "== backend health =="
curl -fsS http://127.0.0.1:3100/health
echo

echo "== frontend http =="
curl -I -fsS http://127.0.0.1:3101

echo "== listening ports =="
ss -ltnp | grep -E ':3100|:3101'

echo "== recent staging backend logs =="
su - app -c 'pm2 logs hardzone-staging-backend --lines 80 --nostream' | tail -n 80

echo "== recent staging frontend logs =="
su - app -c 'pm2 logs hardzone-staging-frontend --lines 80 --nostream' | tail -n 80
'@

$remoteScript | ssh -i $sshKey -o ConnectTimeout=10 -o StrictHostKeyChecking=no $target "tr -d '\r' | bash"
