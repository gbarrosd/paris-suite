# Gerência de Quartos e Consumíveis (motel/hotel) · Django + PostgreSQL + Docker

App web responsivo (celular, tablet e computador) para controlar quartos, estadias e consumo, com várias empresas.

## Como rodar (Docker)

Requisito: Docker com Docker Compose (Docker Desktop no Windows/Mac).

```bash
cd gerencia-hotel-motel
cp .env.example .env      # edite as senhas e a DJANGO_SECRET_KEY
docker compose up -d --build
```

Abra `http://localhost:8000`. Em celulares e tablets da mesma rede, use o IP do computador (ex.: `http://192.168.0.10:8000`).

Na primeira subida o sistema aplica as migrações e cria o usuário **admin** (senha **admin**, ou o que estiver em `ADMIN_USERNAME`/`ADMIN_PASSWORD` no `.env`) e uma "Empresa Exemplo" com 8 quartos e 6 produtos (`DEMO_DATA=0` desliga). Troque a senha no menu do usuário.

O painel administrativo do Django fica em `/admin` (usuários com perfil Administrador).

Comandos úteis:

```bash
docker compose logs -f web                       # logs
docker compose exec web python manage.py test core   # testes
docker compose exec db pg_dump -U motel motel > backup.sql   # backup do banco
docker compose down                              # parar (os dados ficam no volume pgdata)
```

Se acessar por um domínio com HTTPS, preencha `DJANGO_CSRF_TRUSTED_ORIGINS` (ex.: `https://motel.exemplo.com.br`) e `DJANGO_SECURE_COOKIES=1`.

### Sem Docker (desenvolvimento)

```bash
pip install -r requirements.txt
python manage.py migrate && python manage.py bootstrap
DJANGO_DEBUG=1 python manage.py runserver
```

Sem `POSTGRES_HOST` definido, usa SQLite local; com `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER` e `POSTGRES_PASSWORD`, usa PostgreSQL.

## Como funciona

- **Empresas**: cada uma tem seus quartos, categorias, preços, produtos e usuários. Admin vê todas e troca no topo.
- **Horários (por empresa)**: início/fim do pernoite, entrada/saída da diária, tolerância em minutos e fuso horário.
- **Categorias de quarto (preços)**: preço da hora, mínimo de horas, hora adicional, pernoite e diária.
- **Iniciar estadia**: toque num quarto livre, escolha *Por hora*, *Pernoite* ou *Diária* e, se quiser, o nome do cliente. Os preços do momento ficam gravados na estadia.
- **Consumo**: no quarto ocupado, toque nos produtos para lançar; dá para remover itens, trocar a cobrança e o nome.
- **Fechar conta**: hospedagem + consumo, desconto/acréscimo, forma de pagamento e **nota** para imprimir (térmica 80 mm ou comum). O quarto vai para *Limpeza* e depois é liberado com um toque.
- **Histórico**: estadias encerradas por período, com faturamento e total por forma de pagamento.
- **Usuários**: Operador (opera quartos), Gerente (configura a própria empresa), Administrador (todas).

## Regras de cobrança

- **Por hora**: horas cheias; a fração só conta se passar da tolerância. Respeita o mínimo de horas.
- **Pernoite**: valor fixo da janela (ex.: 20:00 às 12:00). Entrada antes do início e saída depois do fim cobram horas adicionais.
- **Diária**: conta até o horário de saída; passou da saída + tolerância, entra outra diária.

## Estrutura

- `config/`: configurações do Django (lidas do ambiente)
- `core/models.py`: empresas, categorias, quartos, produtos, estadias, itens e usuários
- `core/billing.py`: cálculo da hospedagem
- `core/api.py` e `core/urls.py`: API JSON usada pela interface
- `core/static/core/` e `core/templates/core/`: interface (HTML, CSS e JavaScript)
- `core/management/commands/bootstrap.py`: cria admin e dados de exemplo
- `core/tests.py`: testes de cobrança, fluxo completo e permissões
- `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`: execução com PostgreSQL
