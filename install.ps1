# Função para verificar se um comando existe
function Test-Command($cmdname) {
    return [bool](Get-Command -Name $cmdname -ErrorAction SilentlyContinue)
}

Write-Host "`n=== Instalador do Bot Vitalume ===" -ForegroundColor Cyan
Write-Host "Iniciando instalação..." -ForegroundColor Yellow

# Verifica se o Node.js está instalado
if (-not (Test-Command node)) {
    Write-Host "`nNode.js não encontrado. Instalando..." -ForegroundColor Yellow
    
    # Baixa o instalador do Node.js
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $installerPath = "$env:TEMP\node-installer.msi"
    
    Write-Host "Baixando Node.js..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $nodeUrl -OutFile $installerPath
    
    Write-Host "Instalando Node.js..." -ForegroundColor Gray
    Start-Process msiexec.exe -Wait -ArgumentList "/i $installerPath /quiet"
    
    Remove-Item $installerPath
    
    # Recarrega o PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "Node.js instalado com sucesso!" -ForegroundColor Green
}

# Verifica se o Git está instalado
if (-not (Test-Command git)) {
    Write-Host "`nGit não encontrado. Instalando..." -ForegroundColor Yellow
    
    # Baixa o instalador do Git
    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"
    $installerPath = "$env:TEMP\git-installer.exe"
    
    Write-Host "Baixando Git..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $gitUrl -OutFile $installerPath
    
    Write-Host "Instalando Git..." -ForegroundColor Gray
    Start-Process $installerPath -Wait -ArgumentList "/VERYSILENT /NORESTART"
    
    Remove-Item $installerPath
    
    # Recarrega o PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Host "Git instalado com sucesso!" -ForegroundColor Green
}

# Clona o repositório
Write-Host "`nBaixando o bot..." -ForegroundColor Yellow
if (Test-Path "whatsapp-chatgpt") {
    Write-Host "Pasta já existe. Atualizando..." -ForegroundColor Gray
    Set-Location whatsapp-chatgpt
    git pull
} else {
    git clone https://github.com/askrella/whatsapp-chatgpt.git
    Set-Location whatsapp-chatgpt
}

# Instala as dependências
Write-Host "`nInstalando dependências..." -ForegroundColor Yellow
npm install

# Configura o .env se não existir
if (-not (Test-Path ".env")) {
    Write-Host "`nConfigurando ambiente..." -ForegroundColor Yellow
    
    # Solicita informações básicas
    $anaNumber = Read-Host "Digite o número do WhatsApp da Ana (com @c.us no final)"
    $sandboxNumber = Read-Host "Digite seu número de WhatsApp para teste (com @c.us no final)"
    
    # Cria o arquivo .env com as configurações mínimas
    @"
# Configuração Básica
OPENAI_API_KEY=seu-token-aqui
AI_AGENT_MODE=true

# Configuração da Ana
WHATSAPP_NUMBER_ANA="$anaNumber"
AI_AGENT_NAME=Ana
AI_AGENT_PERSONALITY="Sou uma pessoa acolhedora, atenciosa e sempre disposta a ajudar. Falo de forma clara e amigável, usando um tom leve mas profissional."

# Modo Sandbox (para testes)
AGENT_SANDBOX=true
AGENT_SANDBOX_NUMBERS=["$sandboxNumber"]

# Horários dos Profissionais
DOCTOR_SCHEDULES='{
  "Dr. Lucas (Psicólogo)": {
    "segunda": ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"],
    "terça": ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"],
    "quarta": ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"],
    "quinta": ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"],
    "sexta": ["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"]
  }
}'
"@ | Out-File -FilePath ".env" -Encoding utf8
}

# Cria o script de inicialização
@"
@echo off
title Bot Vitalume
color 0A
echo Iniciando o Bot Vitalume...
echo.
npm run start
pause
"@ | Out-File -FilePath "iniciar.bat" -Encoding utf8

Write-Host "`n=== Instalação Concluída! ===" -ForegroundColor Green
Write-Host "1. Edite o arquivo .env e configure sua OPENAI_API_KEY" -ForegroundColor Yellow
Write-Host "2. Execute o arquivo iniciar.bat para rodar o bot" -ForegroundColor Yellow
Write-Host "3. Escaneie o QR Code que aparecer com o WhatsApp" -ForegroundColor Yellow
Write-Host "`nPressione qualquer tecla para sair..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") 