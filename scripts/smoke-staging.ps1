$ErrorActionPreference = "Stop"

$sshKey = "$HOME\.ssh\hardzone_deploy"
$target = "root@79.137.162.55"

Write-Host "== ssh =="
ssh -i $sshKey -o ConnectTimeout=10 -o StrictHostKeyChecking=no $target "echo ok"

Write-Host "== pm2 staging status =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "su - app -c 'pm2 describe hardzone-staging-backend >/dev/null && pm2 describe hardzone-staging-frontend >/dev/null'"

Write-Host "== staging backend health =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "curl -fsS http://127.0.0.1:3100/health"

Write-Host "== staging frontend http =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "curl -I -fsS http://127.0.0.1:3101"

Write-Host "== recent staging backend logs =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "su - app -c 'pm2 logs hardzone-staging-backend --lines 80 --nostream' | tail -n 80"

Write-Host "== recent staging frontend logs =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "su - app -c 'pm2 logs hardzone-staging-frontend --lines 80 --nostream' | tail -n 80"
