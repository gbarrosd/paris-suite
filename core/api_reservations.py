"""Reservas/agendamentos de quartos."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from .api import (assert_company, endpoint, fail, get_or_404, hm, num, s, start_stay)
from .billing import BILLING_TYPES, next_at, parse_hm, to_wall
from .models import Reservation, Room

DAY = timedelta(days=1)


def from_ms(v, field):
    try:
        return datetime.fromtimestamp(int(v) / 1000, tz=ZoneInfo('UTC'))
    except (TypeError, ValueError, OverflowError):
        fail(400, f'Data inválida ({field})')


def expected_end(company, category, billing_type, start, hours=None, days=None):
    """Fim previsto da reserva, usado para checar conflitos entre reservas do mesmo quarto."""
    zone = ZoneInfo(company.timezone)
    wall = to_wall(start, company.timezone)
    if billing_type == 'hora':
        h = max(hours or 0, category.hour_min_hours, 1)
        return start + timedelta(hours=h)
    if billing_type == 'pernoite':
        end = next_at(wall, hm(company.overnight_end))
    else:
        anchor = max(wall, datetime.combine(wall.date(), parse_hm(hm(company.daily_start))))
        end = next_at(anchor, hm(company.daily_end)) + (max(days or 1, 1) - 1) * DAY
    return end.replace(tzinfo=zone)


def conflicts(room_id, start, end, exclude=None):
    qs = Reservation.objects.filter(room_id=room_id, status='agendada', start_at__lt=end, end_at__gt=start)
    if exclude:
        qs = qs.exclude(pk=exclude)
    return qs


def reservation_json(r):
    return {'id': r.id, 'company_id': r.company_id, 'room_id': r.room_id, 'room_name': r.room.name,
            'category_name': r.room.category.name, 'capacity': r.room.capacity, 'billing_type': r.billing_type,
            'start_at': r.start_at, 'end_at': r.end_at, 'hours': r.hours, 'days': r.days,
            'guest_name': r.guest_name or None, 'guest_phone': r.guest_phone or None, 'people': r.people,
            'notes': r.notes or None, 'status': r.status, 'stay_id': r.stay_id,
            'created_by': r.created_by.display_name if r.created_by else None}


def reservation_fields(b, company):
    room = Room.objects.select_related('category').filter(pk=b.get('room_id') or 0, company=company, active=True).first()
    if not room:
        fail(400, 'Escolha um quarto válido')
    btype = s(b.get('billing_type'))
    if btype not in BILLING_TYPES:
        fail(400, 'Escolha o tipo de cobrança: hora, pernoite ou diária')
    start = from_ms(b.get('start_at'), 'início')
    hours = int(num(b.get('hours'), 'horas', 1)) if btype == 'hora' and s(b.get('hours')) else None
    days = int(num(b.get('days'), 'diárias', 1)) if btype == 'diaria' and s(b.get('days')) else None
    people = int(num(b.get('people'), 'pessoas', 1)) if s(b.get('people')) else None
    if (hours or 0) > 72 or (days or 0) > 60 or (people or 0) > 50:
        fail(400, 'Valor fora do limite')
    return {'room': room, 'billing_type': btype, 'start_at': start, 'hours': hours, 'days': days, 'people': people,
            'end_at': expected_end(company, room.category, btype, start, hours, days),
            'guest_name': s(b.get('guest_name')), 'guest_phone': s(b.get('guest_phone'), 40), 'notes': s(b.get('notes'), 500)}


def check_free(f, exclude=None):
    c = conflicts(f['room'].id, f['start_at'], f['end_at'], exclude).select_related('room').first()
    if c:
        tz = c.company.timezone
        fail(400, f"O quarto {c.room.name} já tem reserva de {to_wall(c.start_at, tz):%d/%m %H:%M} até {to_wall(c.end_at, tz):%d/%m %H:%M}")


@endpoint()
def company_reservations():
    def get(request, body, id):
        assert_company(request.user, id)
        qs = Reservation.objects.filter(company_id=id).select_related('room__category', 'created_by')
        if request.GET.get('from'):
            qs = qs.filter(end_at__gte=from_ms(request.GET['from'], 'de'))
        if request.GET.get('to'):
            qs = qs.filter(start_at__lte=from_ms(request.GET['to'], 'até'))
        st = request.GET.get('status')
        if st:
            qs = qs.filter(status__in=st.split(','))
        return [reservation_json(r) for r in qs.order_by('start_at')[:500]]

    def post(request, body, id):
        assert_company(request.user, id)
        from .models import Company
        company = get_or_404(Company, id, 'Empresa')
        with transaction.atomic():
            f = reservation_fields(body, company)
            Room.objects.select_for_update().filter(pk=f['room'].id).first()  # serializa reservas do mesmo quarto
            if f['end_at'] <= timezone.now():
                fail(400, 'A reserva já teria terminado. Confira a data e o horário.')
            check_free(f)
            r = Reservation.objects.create(company=company, created_by=request.user, **f)
        return reservation_json(r)
    return {'GET': get, 'POST': post}


@endpoint()
def company_availability():
    """Quartos livres para um período: usado no formulário de reserva."""
    def get(request, body, id):
        assert_company(request.user, id)
        from .models import Company
        company = get_or_404(Company, id, 'Empresa')
        btype = s(request.GET.get('billing_type'))
        if btype not in BILLING_TYPES:
            fail(400, 'Tipo de cobrança inválido')
        start = from_ms(request.GET.get('start_at'), 'início')
        q = request.GET
        hours = int(q['hours']) if btype == 'hora' and q.get('hours', '').isdigit() else None
        days = int(q['days']) if btype == 'diaria' and q.get('days', '').isdigit() else None
        exclude = int(q['exclude']) if q.get('exclude', '').isdigit() else None
        out = []
        for room in Room.objects.filter(company=company, active=True).select_related('category'):
            end = expected_end(company, room.category, btype, start, hours, days)
            c = conflicts(room.id, start, end, exclude).first()
            out.append({'room_id': room.id, 'end_at': end, 'available': c is None,
                        'conflict': None if c is None else {'start_at': c.start_at, 'end_at': c.end_at, 'guest_name': c.guest_name or None}})
        return out
    return {'GET': get}


def load_reservation(request, id, lock=False):
    qs = Reservation.objects.select_related('company', 'room__category', 'created_by')
    if lock:
        qs = qs.select_for_update(of=('self',))
    r = qs.filter(pk=id).first()
    if not r:
        fail(404, 'Reserva não encontrada')
    assert_company(request.user, r.company_id)
    return r


def assert_scheduled(r):
    if r.status != 'agendada':
        fail(400, 'Esta reserva não está mais agendada')


@endpoint()
def reservation_detail():
    def get(request, body, id):
        return reservation_json(load_reservation(request, id))

    def put(request, body, id):
        with transaction.atomic():
            r = load_reservation(request, id, lock=True)
            assert_scheduled(r)
            f = reservation_fields({'room_id': r.room_id, 'billing_type': r.billing_type, 'start_at': int(r.start_at.timestamp() * 1000),
                                    'hours': r.hours, 'days': r.days, 'people': r.people, 'guest_name': r.guest_name,
                                    'guest_phone': r.guest_phone, 'notes': r.notes, **body}, r.company)
            check_free(f, exclude=r.id)
            for k, v in f.items():
                setattr(r, k, v)
            r.save()
        return reservation_json(r)
    return {'GET': get, 'PUT': put}


@endpoint()
def reservation_action():
    def post(request, body, id, action):
        with transaction.atomic():
            r = load_reservation(request, id, lock=True)
            assert_scheduled(r)
            if action == 'cancel':
                r.status = 'cancelada'
                if s(body.get('notes')):
                    r.notes = s(body.get('notes'), 500)
            elif action == 'no-show':
                r.status = 'nao_compareceu'
            elif action == 'checkin':
                stay = start_stay(request, r.room_id, r.billing_type, r.guest_name)
                r.status, r.stay = 'iniciada', stay
            else:
                fail(404, 'Ação inválida')
            r.save()
        return reservation_json(r)
    return {'POST': post}


def upcoming_by_room(company_id, now, horizon=timedelta(hours=24)):
    """Próxima reserva agendada de cada quarto (atrasadas ou nas próximas 24h)."""
    out = {}
    for r in Reservation.objects.filter(company_id=company_id, status='agendada', end_at__gt=now,
                                        start_at__lt=now + horizon).order_by('start_at'):
        out.setdefault(r.room_id, r)
    return out
