# Paris Suite · Gestão de motel/hotel (Django + PostgreSQL + Docker)

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

Depois de mudar o código, atualize com `docker compose up -d --build` (as migrações rodam sozinhas e os dados são mantidos).

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

- **Empresas**: cada uma tem seus quartos, categorias, preços, produtos, reservas, caixa e usuários. Um usuário só vê e altera a própria empresa.
- **Perfis**: *Administrador* (dono do sistema) vê todas as empresas e é o único que cadastra empresas e usuários. *Usuário* opera e configura somente a empresa dele (horários, preços, quartos, produtos, reservas e caixa).
- **Quartos**: nome/número, categoria e, opcionalmente, para quantas pessoas é o quarto.
- **Horários (por empresa)**: início/fim do pernoite, entrada/saída da diária, tolerância em minutos e fuso horário.
- **Categorias de quarto (preços)**: preço da hora, mínimo de horas, hora adicional, pernoite e diária.
- **Iniciar estadia**: toque num quarto livre, escolha *Por hora*, *Pernoite* ou *Diária* e, se quiser, o nome do cliente. Os preços do momento ficam gravados na estadia.
- **Reservas**: agende um quarto para um dia e horário, por hora (com horas previstas), pernoite ou diária (com nº de diárias). O sistema calcula o fim previsto, não deixa reservar o mesmo quarto em horários que se sobrepõem e mostra no quadro de quartos as reservas das próximas 24h (e as atrasadas). Na chegada, toque em *Iniciar reserva*.
- **Consumo**: no quarto ocupado, toque nos produtos para lançar; dá para remover itens, trocar a cobrança e o nome.
- **Fechar conta**: hospedagem + consumo, desconto/acréscimo, forma de pagamento e **nota** para imprimir (térmica 80 mm ou comum). O valor entra automaticamente no caixa. O quarto vai para *Limpeza* e depois é liberado com um toque.
- **Caixa**: abertura do turno com troco, entradas, despesas, sangria e suprimento, estorno de lançamentos e fechamento com o dinheiro contado (mostra sobra ou falta). Turnos anteriores ficam guardados e podem ser impressos.
- **Relatórios**: por período (hoje, ontem, 7 dias, mês ou datas livres): entradas, saídas e saldo, hospedagem x consumo, ticket médio, gráfico por dia, por forma de pagamento, por tipo de cobrança, por quarto, produtos vendidos, despesas por categoria, reservas e lista de estadias. Dá para imprimir e exportar o fluxo de caixa em CSV (abre no Excel).

## Regras de cobrança

- **Por hora**: horas cheias; a fração só conta se passar da tolerância. Respeita o mínimo de horas.
- **Pernoite**: valor fixo da janela (ex.: 20:00 às 12:00). Entrada antes do início e saída depois do fim cobram horas adicionais.
- **Diária**: conta até o horário de saída; passou da saída + tolerância, entra outra diária.

## Estrutura

- `config/`: configurações do Django (lidas do ambiente)
- `core/models.py`: empresas, categorias, quartos, produtos, estadias, itens e usuários
- `core/billing.py`: cálculo da hospedagem
- `core/api.py`, `core/api_reservations.py`, `core/api_cash.py` e `core/urls.py`: API JSON usada pela interface
- `core/static/core/` e `core/templates/core/`: interface (HTML, CSS e JavaScript)
- `core/management/commands/bootstrap.py`: cria admin e dados de exemplo
- `core/tests.py`: testes de cobrança, fluxo completo, reservas, caixa, relatórios e permissões
- `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`: execução com PostgreSQL
