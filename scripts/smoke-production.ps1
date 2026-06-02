$ErrorActionPreference = "Stop"

$sshKey = "$HOME\.ssh\hardzone_deploy"
$target = "root@79.137.162.55"

$remoteScript = @'
set -euo pipefail

echo "== backend health =="
curl -fsS http://127.0.0.1:3000/health
echo

echo "== frontend http =="
curl -I -fsS http://127.0.0.1:3001

echo "== listening ports =="
ss -ltnp | grep -E ':3000|:3001'

echo "== recent backend logs =="
su - app -c 'pm2 logs inventory-backend --lines 100 --nostream' | tail -n 100

echo "== recent frontend logs =="
su - app -c 'pm2 logs hardzone-frontend --lines 100 --nostream' | tail -n 100
'@

$remoteScript | ssh -i $sshKey -o ConnectTimeout=10 -o StrictHostKeyChecking=no $target "tr -d '\r' | bash"
