$ErrorActionPreference = "Stop"

$sshKey = "$HOME\.ssh\hardzone_deploy"
$target = "root@79.137.162.55"

Write-Host "== ssh =="
ssh -i $sshKey -o ConnectTimeout=10 -o StrictHostKeyChecking=no $target "echo ok"

Write-Host "== pm2 status =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "su - app -c 'pm2 status'"

Write-Host "== backend health =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "curl -fsS http://127.0.0.1:3000/health"

Write-Host "== frontend http =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "curl -I -fsS http://127.0.0.1:3001"

Write-Host "== recent backend errors =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "su - app -c 'pm2 logs inventory-backend --lines 80 --nostream' | tail -n 80"

Write-Host "== recent frontend errors =="
ssh -i $sshKey -o StrictHostKeyChecking=no $target "su - app -c 'pm2 logs hardzone-frontend --lines 80 --nostream' | tail -n 80"
