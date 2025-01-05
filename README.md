# Bot Vitalume - Assistente Virtual para Clínicas

Bot assistente virtual para WhatsApp que ajuda no agendamento de consultas.

## Instalação Rápida (Windows)

1. Baixe o arquivo `install.ps1`
2. Clique com o botão direito nele e escolha "Executar com PowerShell"
3. Siga as instruções na tela
4. Quando terminar, edite o arquivo `.env` e coloque sua chave da OpenAI
5. Execute o arquivo `iniciar.bat` para rodar o bot
6. Escaneie o QR Code com seu WhatsApp

## Configuração Manual

Se preferir configurar manualmente:

1. Instale o [Node.js](https://nodejs.org/)
2. Instale o [Git](https://git-scm.com/)
3. Clone o repositório:
```bash
git clone https://github.com/askrella/whatsapp-chatgpt.git
cd whatsapp-chatgpt
```
4. Instale as dependências:
```bash
npm install
```
5. Copie o arquivo `.env.example` para `.env` e configure:
   - Coloque sua OPENAI_API_KEY
   - Configure o número da Ana
   - Configure os números permitidos no sandbox
6. Inicie o bot:
```bash
npm run start
```

## Modo Sandbox

O bot possui um modo sandbox para testes. No arquivo `.env`:

```env
AGENT_SANDBOX=true
AGENT_SANDBOX_NUMBERS=["558591271498@c.us"]
```

Apenas os números listados em `AGENT_SANDBOX_NUMBERS` poderão interagir com o bot.

## Número da Ana

O bot pode ser configurado para responder apenas quando mencionado com @ana:

```env
WHATSAPP_NUMBER_ANA="558581019252@c.us"
```

Quando usando este número:
- Mensagens sem @ana são ignoradas
- Mensagens com @ana são processadas normalmente
- Mensagens de outros números são processadas sempre
