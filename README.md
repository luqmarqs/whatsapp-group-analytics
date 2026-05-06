# WhatsApp Group Analytics

Painel de analytics operacional para grupos de WhatsApp, auto-hospedado com Docker Compose.

## Funcionalidades

- Grupos ativos / silenciosos
- Volume de mensagens por grupo e dia
- Entradas e saídas de membros
- Links mais compartilhados
- Alertas automáticos (silêncio, pico, queda)
- Tarefas de mobilização por grupo
- API REST + painel React

## Stack

| Componente | Tecnologia |
|---|---|
| Banco de dados | PostgreSQL 16 |
| Cache/Fila | Redis 7 |
| API | Node.js 20 + Fastify |
| Worker WhatsApp | Node.js 20 + Baileys |
| Frontend | React 18 + Vite + Tailwind |
| Proxy HTTPS | Caddy 2 |

---

## Deploy em VPS

### 1. Pré-requisitos

```bash
# Ubuntu 22.04+
sudo apt update && sudo apt upgrade -y

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose plugin
sudo apt install -y docker-compose-plugin

# Firewall UFW
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp   # HTTP/3
sudo ufw enable
```

### 2. Clonar o projeto

```bash
git clone <repo-url> /opt/whatsapp-group-analytics
cd /opt/whatsapp-group-analytics
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env   # edite todas as variáveis
```

Gere segredos seguros:

```bash
# JWT_SECRET (mínimo 64 chars)
openssl rand -hex 64

# FIRST_ADMIN_TOKEN
openssl rand -hex 32

# Senhas do banco e Redis — use senhas longas e aleatórias
openssl rand -base64 32
```

Edite o **DOMAIN** no `.env` e no `Caddyfile` com o seu domínio público.

### 4. Subir os serviços

```bash
docker compose up -d --build
docker compose logs -f
```

### 5. Criar o primeiro usuário admin

```bash
curl -X POST https://SEU_DOMINIO/api/admin/create-first-user \
  -H "Content-Type: application/json" \
  -H "x-admin-token: SEU_FIRST_ADMIN_TOKEN" \
  -d '{"email":"admin@exemplo.com","name":"Admin","password":"senha-forte"}'
```

### 6. Conectar o WhatsApp

O worker gera um QR code no terminal. Escaneie com o WhatsApp:

```bash
docker compose logs -f worker
# Aguarde o QR code aparecer e escaneie com o celular
```

Após autenticar, o worker sincroniza todos os grupos automaticamente.

---

## Desenvolvimento local

```bash
# Clone e configure
cp .env.example .env
# Edite DATABASE_URL e REDIS_URL para localhost (ou use o docker-compose local)

# API
cd apps/api && npm install && npm run dev

# Worker
cd apps/worker && npm install && npm run dev

# Web
cd apps/web && npm install && npm run dev
# Acesse http://localhost:5173
```

---

## Rotas da API

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | /health | — | Health check |
| POST | /auth/login | — | Login |
| GET | /auth/me | JWT | Usuário atual |
| POST | /admin/create-first-user | Token | Cria primeiro admin |
| GET | /whatsapp/overview | JWT | KPIs gerais |
| GET | /whatsapp/groups | JWT | Lista de grupos |
| GET | /whatsapp/groups/:id | JWT | Detalhe do grupo |
| GET | /whatsapp/links | JWT | Links compartilhados |
| GET | /whatsapp/alerts | JWT | Alertas |
| PATCH | /whatsapp/alerts/:id/read | JWT | Marcar alerta como lido |
| POST | /whatsapp/tasks | JWT | Criar tarefa |
| GET | /whatsapp/tasks | JWT | Listar tarefas |
| PATCH | /whatsapp/tasks/:id | JWT | Atualizar status da tarefa |

---

## Rotas do Frontend

| Rota | Descrição |
|---|---|
| /login | Login |
| /dashboard | Dashboard com KPIs |
| /whatsapp | Visão geral WhatsApp |
| /whatsapp/groups | Lista de grupos |
| /whatsapp/groups/:id | Detalhe do grupo |
| /whatsapp/links | Links compartilhados |
| /whatsapp/alerts | Alertas |
| /whatsapp/tasks | Tarefas de mobilização |
| /settings | Configurações do usuário |

---

## Banco de dados

Tabelas criadas automaticamente na primeira subida:

- `users` — usuários do painel
- `whatsapp_instances` — instâncias WhatsApp
- `whatsapp_groups` — grupos monitorados
- `whatsapp_group_members` — membros (hash de telefone)
- `whatsapp_messages` — metadados de mensagens
- `whatsapp_group_events` — entradas/saídas
- `whatsapp_links` — links deduplicados por grupo
- `whatsapp_daily_group_metrics` — métricas agregadas diárias
- `whatsapp_alerts` — alertas gerados
- `whatsapp_group_tasks` — tarefas de mobilização
- `whatsapp_group_task_status` — status por grupo

### Privacidade

- Telefones nunca são salvos — apenas o SHA-256 do JID
- Texto de mensagens **não é salvo** por padrão (`STORE_MESSAGE_BODY=false`)
- Mídia nunca é salva
- Apenas metadados: tipo, tamanho aproximado, timestamp, grupo, remetente (hash)

---

## Backup e restore

```bash
# Backup (salva em ./backups/)
./scripts/backup-postgres.sh

# Restore
./scripts/restore-postgres.sh backups/wga_20240101_010000.sql.gz
```

### Backup diário automático (crontab)

```bash
crontab -e
# Adicione:
0 3 * * * /opt/whatsapp-group-analytics/scripts/backup-postgres.sh >> /var/log/wga-backup.log 2>&1
```

---

## Atualização

```bash
cd /opt/whatsapp-group-analytics
git pull

# Rebuild e restart
docker compose up -d --build

# Ver logs
docker compose logs -f
```

> **Migrações de banco:** se houver novos arquivos em `packages/database/migrations/`, execute-os manualmente:
> ```bash
> docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -f /docker-entrypoint-initdb.d/002_nova_migracao.sql
> ```

---

## Segurança

- PostgreSQL e Redis só ficam na rede interna Docker (sem porta exposta ao host)
- Caddy gerencia HTTPS automático via Let's Encrypt
- JWT com expiração de 7 dias
- Senhas com bcrypt (custo 12)
- `FIRST_ADMIN_TOKEN` deve ser rotacionado após o primeiro uso

---

## Alertas gerados automaticamente (01h15 UTC)

| Tipo | Condição |
|---|---|
| `silent_3d` | Sem mensagens há 3+ dias |
| `silent_7d` | Sem mensagens há 7+ dias |
| `activity_spike` | Volume > 5x a média de 7 dias |
| `activity_drop` | Volume < 20% da média (min. 10 msgs/dia) |
| `viral_link` | Mesmo link compartilhado 10+ vezes em 24h |
