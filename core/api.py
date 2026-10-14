"""API JSON usada pela interface (mesmas rotas da versão anterior)."""
import json
import re
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from functools import wraps
from zoneinfo import ZoneInfo

from django.contrib.auth import authenticate, login, logout
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone

from .billing import BILLING_TYPES, calc_stay, money
from .models import Category, CashEntry, CashSession, Company, Product, Reservation, Room, Stay, StayItem, User

ROOM_STATUS = {'livre', 'ocupado', 'limpeza', 'manutencao'}
HM = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def fail(status, message):
    raise ApiError(status, message)


def endpoint(public=False):
    """Decorador: trata JSON, autenticação e erros, e despacha por método HTTP."""
    def deco(handlers):
        @wraps(handlers)
        def view(request, **kw):
            try:
                fn = handlers().get(request.method)
                if not fn:
                    fail(405, 'Método não permitido')
                if not public and not request.user.is_authenticated:
                    fail(401, 'Faça login')
                body = {}
                if request.method in ('POST', 'PUT') and request.body:
                    try:
                        body = json.loads(request.body)
                    except ValueError:
                        fail(400, 'JSON inválido')
                out = fn(request, body, **kw)
                return JsonResponse(out if out is not None else {'ok': True}, safe=False, json_dumps_params={'default': _default})
            except ApiError as e:
                return JsonResponse({'error': str(e)}, status=e.status)
        return view
    return deco


def _default(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, datetime):
        return ms(o)
    raise TypeError(type(o))


def ms(dt):
    return int(dt.timestamp() * 1000) if dt else None


def hm(t):
    return t.strftime('%H:%M')


# ---------- validação ----------
def s(v, maxlen=120):
    return '' if v is None else str(v).strip()[:maxlen]


def required(v, field):
    r = s(v)
    if not r:
        fail(400, f'Informe {field}')
    return r


def num(v, field, minimum=0):
    try:
        n = Decimal(str(v))
    except (InvalidOperation, ValueError):
        fail(400, f'Valor inválido para {field}')
    if not n.is_finite() or n < minimum:
        fail(400, f'Valor inválido para {field}')
    return n


def get_or_404(model, pk, what, **filters):
    obj = model.objects.filter(pk=pk, **filters).first()
    if not obj:
        fail(404, f'{what} não encontrado(a)')
    return obj


# ---------- permissões ----------
def assert_company(user, company_id):
    if not user.can_access(company_id):
        fail(403, 'Sem acesso a esta empresa')


def assert_admin(user):
    if not user.is_admin:
        fail(403, 'Apenas o administrador do sistema pode fazer isso')


# ---------- serialização ----------
def company_json(c):
    return {'id': c.id, 'name': c.name, 'timezone': c.timezone, 'tolerance_min': c.tolerance_min,
            'overnight_start': hm(c.overnight_start), 'overnight_end': hm(c.overnight_end),
            'daily_start': hm(c.daily_start), 'daily_end': hm(c.daily_end)}


def category_json(c):
    return {'id': c.id, 'company_id': c.company_id, 'name': c.name, 'hour_price': c.hour_price,
            'hour_min_hours': c.hour_min_hours, 'extra_hour_price': c.extra_hour_price,
            'overnight_price': c.overnight_price, 'daily_price': c.daily_price}


def room_json(r):
    return {'id': r.id, 'company_id': r.company_id, 'category_id': r.category_id, 'category_name': r.category.name,
            'name': r.name, 'capacity': r.capacity, 'status': r.status}


def product_json(p):
    return {'id': p.id, 'company_id': p.company_id, 'name': p.name, 'price': p.price}


def user_json(u):
    return {'id': u.id, 'username': u.username, 'name': u.display_name, 'role': 'admin' if u.is_admin else 'usuario',
            'company_id': u.company_id, 'active': u.is_active}


def stay_details(stay, now=None):
    now = now or timezone.now()
    items = list(stay.items.all())
    items_amount = money(sum((i.unit_price * i.qty for i in items), Decimal('0')))
    company = stay.company
    if stay.status == 'aberta':
        calc = calc_stay(stay.billing_type, stay.check_in, now, stay.rates, company.timezone)
        lines, room_amount = calc['lines'], calc['total']
    else:
        lines, room_amount = stay.room_lines, stay.room_amount or Decimal('0')
    return {
        'id': stay.id, 'company_id': stay.company_id, 'room_id': stay.room_id, 'room_name': stay.room_name,
        'category_name': stay.category_name, 'billing_type': stay.billing_type, 'guest_name': stay.guest_name or None,
        'check_in': stay.check_in, 'check_out': stay.check_out, 'status': stay.status, 'rates': stay.rates,
        'items': [{'id': i.id, 'product_id': i.product_id, 'name': i.name, 'unit_price': i.unit_price,
                   'qty': i.qty, 'created_at': i.created_at} for i in items],
        'room_lines': lines, 'room_amount': room_amount, 'items_amount': items_amount,
        'discount': stay.discount, 'surcharge': stay.surcharge, 'total': stay.total,
        'payment_method': stay.payment_method or None, 'notes': stay.notes or None,
        'preview_total': money(room_amount + items_amount - stay.discount + stay.surcharge),
        'company': {'id': company.id, 'name': company.name, 'timezone': company.timezone},
        'now': now,
    }


# ---------- autenticação ----------
@endpoint(public=True)
def login_view():
    def post(request, body):
        user = authenticate(request, username=s(body.get('username')).lower(), password=body.get('password') or '')
        if not user:
            fail(401, 'Usuário ou senha inválidos')
        login(request, user)
        return {'ok': True}
    return {'POST': post}


@endpoint(public=True)
def logout_view():
    def post(request, body):
        logout(request)
    return {'POST': post}


@endpoint()
def me():
    return {'GET': lambda request, body: user_json(request.user)}


@endpoint()
def my_password():
    def put(request, body):
        u = request.user
        if not u.check_password(body.get('current') or ''):
            fail(400, 'Senha atual incorreta')
        if len(s(body.get('password'))) < 4:
            fail(400, 'A nova senha precisa de pelo menos 4 caracteres')
        u.set_password(body['password'])
        u.save()
        login(request, u)  # mantém a sessão após trocar a senha
    return {'PUT': put}


# ---------- empresas ----------
def company_fields(b):
    f = {'name': required(b.get('name'), 'o nome da empresa'), 'timezone': s(b.get('timezone')) or 'America/Sao_Paulo',
         'tolerance_min': int(num(b.get('tolerance_min') or 0, 'tolerância'))}
    for k in ('overnight_start', 'overnight_end', 'daily_start', 'daily_end'):
        v = s(b.get(k))[:5]
        if not HM.match(v):
            fail(400, f'Horário inválido ({k}). Use HH:MM')
        f[k] = datetime.strptime(v, '%H:%M').time()
    try:
        ZoneInfo(f['timezone'])
    except Exception:
        fail(400, 'Fuso horário inválido')
    return f


@endpoint()
def companies():
    def get(request, body):
        u = request.user
        qs = Company.objects.filter(active=True)
        if not u.is_admin:
            qs = qs.filter(pk=u.company_id)
        return [company_json(c) for c in qs]

    def post(request, body):
        assert_admin(request.user)
        f = company_fields({'overnight_start': '20:00', 'overnight_end': '12:00', 'daily_start': '12:00',
                            'daily_end': '12:00', 'tolerance_min': 15, **body})
        with transaction.atomic():
            c = Company.objects.create(**f)
            Category.objects.create(company=c, name='Padrão')
        return company_json(c)
    return {'GET': get, 'POST': post}


@endpoint()
def company_detail():
    def put(request, body, id):
        assert_company(request.user, id)
        c = get_or_404(Company, id, 'Empresa')
        f = company_fields({'name': c.name, 'timezone': c.timezone, **body})
        if not request.user.is_admin:  # nome e fuso só o administrador muda
            f['name'], f['timezone'] = c.name, c.timezone
        for k, v in f.items():
            setattr(c, k, v)
        c.save()
        return company_json(c)
    return {'PUT': put}


# ---------- categorias ----------
def category_fields(b):
    extra = b.get('extra_hour_price')
    return {
        'name': required(b.get('name'), 'o nome da categoria'),
        'hour_price': money(num(b.get('hour_price') or 0, 'preço da hora')),
        'hour_min_hours': max(1, int(num(b.get('hour_min_hours') or 1, 'mínimo de horas'))),
        'extra_hour_price': None if extra in (None, '') else money(num(extra, 'hora adicional')),
        'overnight_price': money(num(b.get('overnight_price') or 0, 'preço do pernoite')),
        'daily_price': money(num(b.get('daily_price') or 0, 'preço da diária')),
    }


@endpoint()
def company_categories():
    def get(request, body, id):
        assert_company(request.user, id)
        return [category_json(c) for c in Category.objects.filter(company_id=id, active=True)]

    def post(request, body, id):
        assert_company(request.user, id)
        get_or_404(Company, id, 'Empresa')
        return category_json(Category.objects.create(company_id=id, **category_fields(body)))
    return {'GET': get, 'POST': post}


@endpoint()
def category_detail():
    def put(request, body, id):
        c = get_or_404(Category, id, 'Categoria', active=True)
        assert_company(request.user, c.company_id)
        for k, v in category_fields(body).items():
            setattr(c, k, v)
        c.save()
        return category_json(c)

    def delete(request, body, id):
        c = get_or_404(Category, id, 'Categoria', active=True)
        assert_company(request.user, c.company_id)
        if c.rooms.filter(active=True).exists():
            fail(400, 'Existem quartos nesta categoria. Mude a categoria deles antes de excluir.')
        c.active = False
        c.save()
    return {'PUT': put, 'DELETE': delete}


# ---------- quartos ----------
def natural_key(name):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', name)]


def room_fields(b, company_id):
    cat = Category.objects.filter(pk=b.get('category_id') or 0, active=True, company_id=company_id).first()
    if not cat:
        fail(400, 'Escolha uma categoria válida')
    cap = s(b.get('capacity'))
    capacity = int(num(cap, 'capacidade', 1)) if cap else None
    if capacity is not None and capacity > 50:
        fail(400, 'Capacidade inválida')
    return {'name': required(b.get('name'), 'o nome/número do quarto')[:40], 'category': cat, 'capacity': capacity}


@endpoint()
def company_rooms():
    def get(request, body, id):
        assert_company(request.user, id)
        rooms = sorted(Room.objects.filter(company_id=id, active=True).select_related('category'), key=lambda r: natural_key(r.name))
        open_stays = {st.room_id: st for st in Stay.objects.filter(company_id=id, status='aberta')
                      .select_related('company').prefetch_related('items')}
        now = timezone.now()
        from .api_reservations import upcoming_by_room
        upcoming = upcoming_by_room(id, now)
        out = []
        for r in rooms:
            d = room_json(r)
            nr = upcoming.get(r.id)
            d['next_reservation'] = nr and {'id': nr.id, 'start_at': nr.start_at, 'end_at': nr.end_at, 'billing_type': nr.billing_type,
                                            'guest_name': nr.guest_name or None}
            st = open_stays.get(r.id)
            if st:
                det = stay_details(st, now)
                d['stay'] = {k: det[k] for k in ('id', 'billing_type', 'guest_name', 'check_in', 'room_amount', 'items_amount', 'preview_total')}
            else:
                d['stay'] = None
            out.append(d)
        return out

    def post(request, body, id):
        assert_company(request.user, id)
        get_or_404(Company, id, 'Empresa')
        return room_json(Room.objects.create(company_id=id, **room_fields(body, id)))
    return {'GET': get, 'POST': post}


@endpoint()
def room_detail():
    def put(request, body, id):
        r = get_or_404(Room, id, 'Quarto', active=True)
        assert_company(request.user, r.company_id)
        for k, v in room_fields(body, r.company_id).items():
            setattr(r, k, v)
        r.save()
        return room_json(r)

    def delete(request, body, id):
        r = get_or_404(Room, id, 'Quarto', active=True)
        assert_company(request.user, r.company_id)
        if r.status == 'ocupado':
            fail(400, 'Quarto ocupado não pode ser removido')
        r.active = False
        r.save()
    return {'PUT': put, 'DELETE': delete}


@endpoint()
def room_status():
    def post(request, body, id):
        r = get_or_404(Room, id, 'Quarto', active=True)
        assert_company(request.user, r.company_id)
        status = s(body.get('status'))
        if status not in ROOM_STATUS or status == 'ocupado':
            fail(400, 'Status inválido')
        if r.status == 'ocupado':
            fail(400, 'Finalize a estadia antes de mudar o status')
        r.status = status
        r.save()
        return room_json(r)
    return {'POST': post}


# ---------- produtos ----------
@endpoint()
def company_products():
    def get(request, body, id):
        assert_company(request.user, id)
        return [product_json(p) for p in Product.objects.filter(company_id=id, active=True)]

    def post(request, body, id):
        assert_company(request.user, id)
        get_or_404(Company, id, 'Empresa')
        p = Product.objects.create(company_id=id, name=required(body.get('name'), 'o nome do produto'),
                                   price=money(num(body.get('price'), 'preço')))
        return product_json(p)
    return {'GET': get, 'POST': post}


@endpoint()
def product_detail():
    def put(request, body, id):
        p = get_or_404(Product, id, 'Produto', active=True)
        assert_company(request.user, p.company_id)
        p.name = required(body.get('name'), 'o nome do produto')
        p.price = money(num(body.get('price'), 'preço'))
        p.save()
        return product_json(p)

    def delete(request, body, id):
        p = get_or_404(Product, id, 'Produto', active=True)
        assert_company(request.user, p.company_id)
        p.active = False
        p.save()
    return {'PUT': put, 'DELETE': delete}


# ---------- estadias ----------
def load_stay(request, id, lock=False):
    qs = Stay.objects.select_related('company')
    if lock:
        qs = qs.select_for_update(of=('self',))
    st = qs.filter(pk=id).first()
    if not st:
        fail(404, 'Estadia não encontrada')
    assert_company(request.user, st.company_id)
    return st


def assert_open(st):
    if st.status != 'aberta':
        fail(400, 'Esta estadia já foi encerrada')


@transaction.atomic
def start_stay(request, room_id, btype, guest_name):
    """Abre a estadia gravando os preços e horários vigentes. Usado no check-in direto e no da reserva."""
    if btype not in BILLING_TYPES:
        fail(400, 'Escolha o tipo de cobrança: hora, pernoite ou diária')
    r = Room.objects.select_for_update().select_related('category', 'company').filter(pk=room_id, active=True).first()
    if not r:
        fail(404, 'Quarto não encontrado')
    assert_company(request.user, r.company_id)
    if r.status != 'livre':
        fail(400, f'O quarto {r.name} não está livre')
    c, cat = r.company, r.category
    rates = {
        'hour_price': str(cat.hour_price), 'hour_min_hours': cat.hour_min_hours,
        'extra_hour_price': None if cat.extra_hour_price is None else str(cat.extra_hour_price),
        'overnight_price': str(cat.overnight_price), 'daily_price': str(cat.daily_price),
        'overnight_start': hm(c.overnight_start), 'overnight_end': hm(c.overnight_end),
        'daily_start': hm(c.daily_start), 'daily_end': hm(c.daily_end), 'tolerance_min': c.tolerance_min,
    }
    st = Stay.objects.create(company=c, room=r, room_name=r.name, category_name=cat.name, billing_type=btype,
                             guest_name=s(guest_name), check_in=timezone.now(), rates=rates, opened_by=request.user)
    r.status = 'ocupado'
    r.save(update_fields=['status'])
    return st


@endpoint()
def room_checkin():
    def post(request, body, id):
        return stay_details(start_stay(request, id, s(body.get('billing_type')), body.get('guest_name')))
    return {'POST': post}


@endpoint()
def stay_detail():
    def get(request, body, id):
        return stay_details(load_stay(request, id))

    def put(request, body, id):
        st = load_stay(request, id)
        assert_open(st)
        btype = s(body.get('billing_type')) or st.billing_type
        if btype not in BILLING_TYPES:
            fail(400, 'Tipo de cobrança inválido')
        st.billing_type = btype
        if 'guest_name' in body:
            st.guest_name = s(body.get('guest_name'))
        st.save()
        return stay_details(st)
    return {'GET': get, 'PUT': put}


@endpoint()
def stay_items():
    def post(request, body, id):
        st = load_stay(request, id)
        assert_open(st)
        p = Product.objects.filter(pk=body.get('product_id') or 0, company_id=st.company_id, active=True).first()
        if not p:
            fail(400, 'Produto inválido')
        qty = num(body.get('qty') or 1, 'quantidade')
        if qty <= 0:
            fail(400, 'Quantidade deve ser maior que zero')
        StayItem.objects.create(stay=st, product=p, name=p.name, unit_price=p.price, qty=qty)
        return stay_details(st)
    return {'POST': post}


@endpoint()
def stay_item_detail():
    def delete(request, body, id, item_id):
        st = load_stay(request, id)
        assert_open(st)
        StayItem.objects.filter(pk=item_id, stay=st).delete()
        return stay_details(st)
    return {'DELETE': delete}


@endpoint()
def stay_checkout():
    def post(request, body, id):
        discount = money(num(body.get('discount') or 0, 'desconto'))
        surcharge = money(num(body.get('surcharge') or 0, 'acréscimo'))
        with transaction.atomic():
            st = load_stay(request, id, lock=True)
            assert_open(st)
            now = timezone.now()
            st.discount, st.surcharge = discount, surcharge
            d = stay_details(st, now)
            total = money(d['room_amount'] + d['items_amount'] - discount + surcharge)
            if total < 0:
                fail(400, 'O desconto é maior que o total')
            st.status, st.check_out = 'fechada', now
            st.room_lines = [{'desc': l['desc'], 'amount': str(l['amount'])} for l in d['room_lines']]
            st.room_amount, st.items_amount, st.total = d['room_amount'], d['items_amount'], total
            st.payment_method = s(body.get('payment_method'), 40)
            st.notes = s(body.get('notes'), 500)
            st.closed_by = request.user
            st.save()
            Room.objects.filter(pk=st.room_id).update(status='limpeza')
            if total > 0:
                CashEntry.objects.create(
                    company_id=st.company_id, session=CashSession.objects.filter(company_id=st.company_id, closed_at__isnull=True).first(),
                    kind='entrada', category='Hospedagem e consumo', amount=total, payment_method=st.payment_method,
                    description=f'Quarto {st.room_name} · {BILLING_TYPES[st.billing_type]}' + (f' · {st.guest_name}' if st.guest_name else ''),
                    occurred_at=now, stay=st, created_by=request.user)
        return stay_details(st)
    return {'POST': post}


@endpoint()
def stay_cancel():
    def post(request, body, id):
        with transaction.atomic():
            st = load_stay(request, id, lock=True)
            assert_open(st)
            st.status, st.check_out, st.total = 'cancelada', timezone.now(), Decimal('0')
            st.notes = s(body.get('notes'), 500)
            st.closed_by = request.user
            st.save()
            Room.objects.filter(pk=st.room_id).update(status='livre')
    return {'POST': post}


@endpoint()
def company_stays():
    def get(request, body, id):
        assert_company(request.user, id)
        now = timezone.now()

        def ts(name, default):
            v = request.GET.get(name)
            return datetime.fromtimestamp(int(v) / 1000, tz=ZoneInfo('UTC')) if v and v.isdigit() else default
        start, end = ts('from', now - timedelta(days=1)), ts('to', now)
        rows = list(Stay.objects.filter(company_id=id, check_out__range=(start, end)).exclude(status='aberta').order_by('-check_out'))
        closed = [r for r in rows if r.status == 'fechada']

        def total(k):
            return money(sum((getattr(r, k) or 0 for r in closed), Decimal('0')))
        by_payment = {}
        for r in closed:
            k = r.payment_method or 'Não informado'
            by_payment[k] = money(by_payment.get(k, 0) + r.total)
        return {
            'rows': [{'id': r.id, 'room_name': r.room_name, 'category_name': r.category_name, 'billing_type': r.billing_type,
                      'guest_name': r.guest_name or None, 'check_in': r.check_in, 'check_out': r.check_out, 'status': r.status,
                      'room_amount': r.room_amount, 'items_amount': r.items_amount, 'discount': r.discount,
                      'surcharge': r.surcharge, 'total': r.total, 'payment_method': r.payment_method or None} for r in rows],
            'summary': {'count': len(closed), 'room_amount': total('room_amount'), 'items_amount': total('items_amount'),
                        'discount': total('discount'), 'surcharge': total('surcharge'), 'total': total('total'),
                        'by_payment': by_payment},
        }
    return {'GET': get}


# ---------- usuários (somente administrador) ----------
def user_fields(b, is_new):
    f = {'username': required(b.get('username'), 'o usuário').lower()[:150], 'first_name': required(b.get('name'), 'o nome')[:150],
         'role': s(b.get('role')) or 'usuario', 'company_id': int(b['company_id']) if s(b.get('company_id')).isdigit() else None}
    if f['role'] not in ('admin', 'usuario'):
        fail(400, 'Perfil inválido')
    if f['role'] == 'usuario':
        if not f['company_id']:
            fail(400, 'Escolha a empresa do usuário')
        get_or_404(Company, f['company_id'], 'Empresa')
    else:
        f['company_id'] = None
    if is_new and len(s(b.get('password'))) < 4:
        fail(400, 'A senha precisa de pelo menos 4 caracteres')
    return f


def apply_admin_flags(u):
    # Administradores também acessam o painel /admin do Django.
    u.is_staff = u.is_superuser = u.role == 'admin'


@endpoint()
def users():
    def get(request, body):
        assert_admin(request.user)
        return [user_json(u) for u in User.objects.order_by('first_name')]

    def post(request, body):
        assert_admin(request.user)
        f = user_fields(body, True)
        if User.objects.filter(username=f['username']).exists():
            fail(400, 'Este usuário já existe')
        u = User(**f)
        u.set_password(body['password'])
        apply_admin_flags(u)
        u.save()
    return {'GET': get, 'POST': post}


@endpoint()
def user_detail():
    def put(request, body, id):
        a = request.user
        assert_admin(a)
        u = get_or_404(User, id, 'Usuário')
        f = user_fields(body, False)
        if User.objects.filter(username=f['username']).exclude(pk=u.pk).exists():
            fail(400, 'Este usuário já existe')
        active = body.get('active') not in (False, 0)
        if u.pk == a.pk and (not active or f['role'] != 'admin'):
            fail(400, 'Você não pode desativar ou mudar o próprio perfil')
        for k, v in f.items():
            setattr(u, k, v)
        u.is_active = active
        pw = s(body.get('password'))
        if pw:
            if len(pw) < 4:
                fail(400, 'A senha precisa de pelo menos 4 caracteres')
            u.set_password(pw)
        apply_admin_flags(u)
        u.save()
    return {'PUT': put}
