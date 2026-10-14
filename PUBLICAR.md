# Como publicar o Paris Suite

Duas etapas:
- **Parte A: demonstração grátis no Render.** Serve para o cliente testar alguns dias.
- **Parte B: cliente fechou, servidor no Hostinger.** Tem domínio, HTTPS e backup diário.

Antes de tudo, o código precisa estar no GitHub em um repositório **privado**. O passo a passo está em `guias/hospedagem-e-github.md`.

---

## Parte A: demonstração no Render (grátis)

1. Crie uma conta em https://render.com usando **Sign in with GitHub**.
2. No painel, clique em **New** e depois em **Blueprint**.
3. Escolha o repositório `paris-suite`. O Render lê o arquivo `render.yaml` e mostra o banco `paris-suite-db` e o serviço `paris-suite`.
4. Ele vai pedir o **ADMIN_PASSWORD**. Coloque uma senha forte: é a senha do usuário `admin`.
5. Clique em **Deploy Blueprint** e espere uns 5 a 10 minutos na primeira vez.
6. Abra o serviço `paris-suite` e copie o endereço que aparece no topo, por exemplo `https://paris-suite.onrender.com`.
   - Se o endereço for diferente (ex.: `https://paris-suite-ab12.onrender.com`), vá em **Environment**, troque `DJANGO_CSRF_TRUSTED_ORIGINS` pelo endereço certo e salve. O sistema reinicia sozinho.
7. Entre com o usuário `admin` e a senha do passo 4. Já vem a "Empresa Exemplo" para mostrar.

Lembretes:
- Depois de 15 minutos sem uso o sistema "dorme". O primeiro acesso leva cerca de 1 minuto, então abra o link um pouco antes de mostrar ao cliente.
- O banco grátis é apagado 30 dias depois de criado.
- Para entregar ao cliente, crie um usuário para ele dentro do sistema e mande só o link e o login.

---

## Parte B: cliente fechou, servidor no Hostinger

### 1. Comprar o domínio
- Para `.com.br`, compre em https://registro.br (cerca de R$ 40 por ano). Também dá para comprar na própria Hostinger.
- Escolha um endereço para o sistema, por exemplo `app.parissuite.com.br`.

### 2. Contratar o servidor
- Hostinger **VPS KVM 1**, local **Brasil**, sistema **Ubuntu 24.04 com Docker**.
- Anote o **IP** do servidor e a senha de root.

### 3. Apontar o domínio para o servidor
- No painel onde comprou o domínio, abra **DNS** e crie um registro:
  - Tipo: `A`
  - Nome: `app` (ou `@` se for usar o domínio puro)
  - Valor: o IP do servidor
- Espere de alguns minutos a algumas horas. Para conferir, rode `ping app.parissuite.com.br` no Mac: tem que aparecer o IP do servidor.

### 4. Instalar o sistema no servidor
No Terminal do Mac:
```
ssh root@SEU_IP
git clone https://github.com/SEU_USUARIO/paris-suite.git
cd paris-suite
cp .env.example .env
nano .env
```
No `.env`, ajuste:
```
DOMAIN=app.parissuite.com.br
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.parissuite.com.br
DJANGO_SECRET_KEY=(uma frase longa e aleatória)
POSTGRES_PASSWORD=(senha forte)
ADMIN_PASSWORD=(senha forte)
DEMO_DATA=0
```
Salve com `Ctrl+O`, `Enter` e saia com `Ctrl+X`.

### 5. Ligar
```
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
Abra `https://app.parissuite.com.br`. O cadeado do HTTPS aparece sozinho, porque o Caddy pede o certificado na primeira visita. Endereços `http://` passam automaticamente para `https://`.

Se o GitHub pedir senha no `git clone`, use um token: GitHub, **Settings**, **Developer settings**, **Personal access tokens**, com acesso só de leitura a esse repositório.

### 6. Atualizar o sistema depois
```
cd paris-suite
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Backup diário

O serviço `backup` faz uma cópia do banco **todo dia às 4h** (horário de Brasília) na pasta `backups/` do servidor. Ele guarda os últimos **14 dias** e apaga os mais antigos sozinho.
- Para mudar o horário ou os dias guardados, coloque no `.env`, por exemplo, `BACKUP_HOUR=03` e `BACKUP_KEEP_DAYS=30`.

**Importante:** o backup fica no mesmo servidor. Se o servidor for perdido, o backup vai junto. Por isso:
- Ative também o **backup semanal da Hostinger**, no painel do VPS.
- De vez em quando, baixe uma cópia para o Mac:
  ```
  scp -r root@SEU_IP:paris-suite/backups ~/Desktop/backups-paris-suite
  ```

Para fazer um backup na hora:
```
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backup sh -c 'pg_dump --no-owner | gzip > /backups/manual-$(date +%F).sql.gz'
```

Para restaurar um backup (isso **apaga os dados atuais**):
```
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop web
docker compose exec -T db psql -U motel -c 'drop schema public cascade; create schema public;' motel
gunzip -c backups/NOME-DO-ARQUIVO.sql.gz | docker compose exec -T db psql -q -U motel motel
docker compose -f docker-compose.yml -f docker-compose.prod.yml start web
```
