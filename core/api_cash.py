"""Fluxo de caixa (turnos e lançamentos) e relatórios."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from .api import assert_company, endpoint, fail, get_or_404, money, num, s
from .api_reservations import from_ms
from .billing import BILLING_TYPES, to_wall
from .models import CashEntry, CashSession, Company, Reservation, Stay, StayItem

# Sangria e suprimento só movem dinheiro da gaveta: não são receita nem despesa nos relatórios.
TRANSFERS = {'Sangria', 'Suprimento'}
ZERO = Decimal('0')


def entry_json(e):
    return {'id': e.id, 'kind': e.kind, 'category': e.category, 'description': e.description or None,
            'amount': e.amount, 'payment_method': e.payment_method or None, 'occurred_at': e.occurred_at,
            'stay_id': e.stay_id, 'session_id': e.session_id, 'automatic': e.stay_id is not None,
            'created_by': e.created_by.display_name if e.created_by else None,
            'cancelled': e.cancelled_at is not None}


def session_summary(sess):
    entries = list(sess.entries.select_related('created_by').order_by('-occurred_at'))
    live = [e for e in entries if not e.cancelled_at]
    by_payment = defaultdict(lambda: {'entradas': ZERO, 'saidas': ZERO})
    for e in live:
        by_payment[e.payment_method or 'Não informado']['entradas' if e.kind == 'entrada' else 'saidas'] += e.amount
    cash = by_payment.get('Dinheiro', {'entradas': ZERO, 'saidas': ZERO})
    expected = money(sess.opening_amount + cash['entradas'] - cash['saidas'])
    return {
        'id': sess.id, 'opened_at': sess.opened_at, 'opened_by': sess.opened_by.display_name if sess.opened_by else None,
        'opening_amount': sess.opening_amount, 'closed_at': sess.closed_at,
        'closed_by': sess.closed_by.display_name if sess.closed_by else None,
        'counted_cash': sess.counted_cash, 'notes': sess.notes or None,
        'expected_cash': sess.expected_cash if sess.closed_at else expected,
        'difference': None if sess.counted_cash is None else money(sess.counted_cash - sess.expected_cash),
        'entradas': money(sum((e.amount for e in live if e.kind == 'entrada'), ZERO)),
        'saidas': money(sum((e.amount for e in live if e.kind == 'saida'), ZERO)),
        'by_payment': {k: {kk: money(vv) for kk, vv in v.items()} for k, v in by_payment.items()},
        'entries': [entry_json(e) for e in entries],
    }


def open_session(company_id):
    return CashSession.objects.select_related('opened_by').filter(company_id=company_id, closed_at__isnull=True).first()


@endpoint()
def company_cash():
    def get(request, body, id):
        assert_company(request.user, id)
        sess = open_session(id)
        last = CashSession.objects.filter(company_id=id, closed_at__isnull=False).order_by('-closed_at').first()
        return {'session': session_summary(sess) if sess else None,
                'last_closed': None if not last else {'id': last.id, 'closed_at': last.closed_at, 'counted_cash': last.counted_cash}}

    def post(request, body, id):  # abrir caixa
        assert_company(request.user, id)
        get_or_404(Company, id, 'Empresa')
        try:
            with transaction.atomic():
                sess = CashSession.objects.create(company_id=id, opened_at=timezone.now(), opened_by=request.user,
                                                  opening_amount=money(num(body.get('opening_amount') or 0, 'troco inicial')))
        except IntegrityError:
            fail(400, 'Já existe um caixa aberto')
        return session_summary(sess)
    return {'GET': get, 'POST': post}


@endpoint()
def cash_session_detail():
    def get(request, body, id):
        sess = get_or_404(CashSession, id, 'Caixa')
        assert_company(request.user, sess.company_id)
        return session_summary(sess)
    return {'GET': get}


@endpoint()
def cash_session_close():
    def post(request, body, id):
        with transaction.atomic():
            sess = CashSession.objects.select_for_update().filter(pk=id).first()
            if not sess:
                fail(404, 'Caixa não encontrado')
            assert_company(request.user, sess.company_id)
            if sess.closed_at:
                fail(400, 'Este caixa já foi fechado')
            summary = session_summary(sess)
            sess.expected_cash = summary['expected_cash']
            sess.counted_cash = money(num(body.get('counted_cash') or 0, 'dinheiro contado'))
            sess.notes = s(body.get('notes'), 500)
            sess.closed_at, sess.closed_by = timezone.now(), request.user
            sess.save()
        return session_summary(sess)
    return {'POST': post}


@endpoint()
def company_cash_sessions():
    def get(request, body, id):
        assert_company(request.user, id)
        qs = CashSession.objects.filter(company_id=id).select_related('opened_by', 'closed_by')
        if request.GET.get('from'):
            qs = qs.filter(Q(closed_at__isnull=True) | Q(closed_at__gte=from_ms(request.GET['from'], 'de')))
        if request.GET.get('to'):
            qs = qs.filter(opened_at__lte=from_ms(request.GET['to'], 'até'))
        out = []
        for sess in qs[:200]:
            d = session_summary(sess)
            d.pop('entries')
            out.append(d)
        return out
    return {'GET': get}


@endpoint()
def company_cash_entries():
    def get(request, body, id):
        assert_company(request.user, id)
        start, end = period(request)
        qs = CashEntry.objects.filter(company_id=id, occurred_at__range=(start, end)).select_related('created_by')
        return [entry_json(e) for e in qs.order_by('-occurred_at')[:2000]]

    def post(request, body, id):
        assert_company(request.user, id)
        get_or_404(Company, id, 'Empresa')
        kind = s(body.get('kind'))
        if kind not in ('entrada', 'saida'):
            fail(400, 'Tipo inválido')
        category = s(body.get('category'), 60) or ('Receita avulsa' if kind == 'entrada' else 'Outras despesas')
        if category == 'Sangria' and kind != 'saida' or category == 'Suprimento' and kind != 'entrada':
            fail(400, 'Categoria não combina com o tipo do lançamento')
        amount = money(num(body.get('amount'), 'valor'))
        if amount <= 0:
            fail(400, 'Informe um valor maior que zero')
        payment = s(body.get('payment_method'), 40)
        sess = open_session(id)
        if category in TRANSFERS:
            if not sess:
                fail(400, 'Abra o caixa para fazer sangria ou suprimento')
            payment = 'Dinheiro'
        occurred = from_ms(body['occurred_at'], 'data') if s(body.get('occurred_at')) and category not in TRANSFERS else timezone.now()
        e = CashEntry.objects.create(company_id=id, session=sess if occurred >= (sess.opened_at if sess else occurred) else None,
                                     kind=kind, category=category, description=s(body.get('description'), 200),
                                     amount=amount, payment_method=payment, occurred_at=occurred, created_by=request.user)
        return entry_json(e)
    return {'GET': get, 'POST': post}


@endpoint()
def cash_entry_cancel():
    def post(request, body, id):
        with transaction.atomic():
            e = CashEntry.objects.select_for_update().filter(pk=id).first()
            if not e:
                fail(404, 'Lançamento não encontrado')
            assert_company(request.user, e.company_id)
            if e.stay_id:
                fail(400, 'Lançamentos de estadia não podem ser estornados aqui')
            if e.cancelled_at:
                fail(400, 'Lançamento já estornado')
            if e.session_id and e.session.closed_at:
                fail(400, 'O caixa deste lançamento já foi fechado')
            e.cancelled_at, e.cancelled_by = timezone.now(), request.user
            e.save()
        return entry_json(e)
    return {'POST': post}


# ---------- relatórios ----------
def period(request):
    now = timezone.now()
    start = from_ms(request.GET['from'], 'de') if request.GET.get('from') else now - timedelta(days=1)
    end = from_ms(request.GET['to'], 'até') if request.GET.get('to') else now
    if end < start:
        fail(400, 'Período inválido')
    if end - start > timedelta(days=400):
        fail(400, 'Escolha um período de até 400 dias')
    return start, end


@endpoint()
def company_report():
    def get(request, body, id):
        assert_company(request.user, id)
        company = get_or_404(Company, id, 'Empresa')
        tz = company.timezone
        start, end = period(request)

        entries = list(CashEntry.objects.filter(company_id=id, occurred_at__range=(start, end), cancelled_at__isnull=True))
        stays = list(Stay.objects.filter(company_id=id, check_out__range=(start, end)).exclude(status='aberta').order_by('-check_out'))
        closed = [x for x in stays if x.status == 'fechada']

        income = [e for e in entries if e.kind == 'entrada' and e.category not in TRANSFERS]
        expense = [e for e in entries if e.kind == 'saida' and e.category not in TRANSFERS]
        total_in = money(sum((e.amount for e in income), ZERO))
        total_out = money(sum((e.amount for e in expense), ZERO))

        def group(rows, key):
            g = defaultdict(lambda: ZERO)
            for e in rows:
                g[key(e)] += e.amount
            return sorted(({'name': k, 'total': money(v)} for k, v in g.items()), key=lambda x: -x['total'])

        # Série por dia (no fuso da empresa)
        days = {}
        d = to_wall(start, tz).date()
        last = to_wall(end, tz).date()
        while d <= last and len(days) < 400:
            days[d.isoformat()] = {'date': d.isoformat(), 'entradas': ZERO, 'saidas': ZERO}
            d += timedelta(days=1)
        for e in income + expense:
            k = to_wall(e.occurred_at, tz).date().isoformat()
            if k in days:
                days[k]['entradas' if e.kind == 'entrada' else 'saidas'] += e.amount

        def ssum(rows, attr):
            return money(sum((getattr(x, attr) or ZERO for x in rows), ZERO))

        by_billing = []
        for k, label in BILLING_TYPES.items():
            rows = [x for x in closed if x.billing_type == k]
            by_billing.append({'key': k, 'name': label, 'count': len(rows), 'total': ssum(rows, 'total'),
                               'room_amount': ssum(rows, 'room_amount')})

        rooms = defaultdict(lambda: {'count': 0, 'total': ZERO, 'room_amount': ZERO, 'items_amount': ZERO, 'minutes': 0})
        for x in closed:
            r = rooms[x.room_name]
            r['count'] += 1
            r['total'] += x.total or ZERO
            r['room_amount'] += x.room_amount or ZERO
            r['items_amount'] += x.items_amount or ZERO
            r['minutes'] += int((x.check_out - x.check_in).total_seconds() // 60)
        by_room = sorted(({'name': k, **v} for k, v in rooms.items()), key=lambda x: -x['total'])

        products = defaultdict(lambda: {'qty': ZERO, 'total': ZERO})
        for it in StayItem.objects.filter(stay__in=[x.id for x in closed]):
            p = products[it.name]
            p['qty'] += it.qty
            p['total'] += it.qty * it.unit_price
        by_product = sorted(({'name': k, 'qty': v['qty'], 'total': money(v['total'])} for k, v in products.items()),
                            key=lambda x: -x['total'])

        res = Reservation.objects.filter(company_id=id, start_at__range=(start, end))
        res_count = defaultdict(int)
        for r in res:
            res_count[r.status] += 1

        return {
            'period': {'from': start, 'to': end},
            'totals': {'entradas': total_in, 'saidas': total_out, 'saldo': money(total_in - total_out)},
            'stays': {'count': len(closed), 'cancelled': len(stays) - len(closed),
                      'room_amount': ssum(closed, 'room_amount'), 'items_amount': ssum(closed, 'items_amount'),
                      'discount': ssum(closed, 'discount'), 'surcharge': ssum(closed, 'surcharge'), 'total': ssum(closed, 'total'),
                      'ticket': money(ssum(closed, 'total') / len(closed)) if closed else ZERO},
            'income_by_payment': group(income, lambda e: e.payment_method or 'Não informado'),
            'income_by_category': group(income, lambda e: e.category),
            'expense_by_category': group(expense, lambda e: e.category),
            'by_billing': by_billing, 'by_room': by_room, 'by_product': by_product,
            'daily': [{**v, 'entradas': money(v['entradas']), 'saidas': money(v['saidas'])} for v in days.values()],
            'reservations': dict(res_count),
            'stay_rows': [{'id': x.id, 'room_name': x.room_name, 'billing_type': x.billing_type, 'guest_name': x.guest_name or None,
                           'check_in': x.check_in, 'check_out': x.check_out, 'status': x.status, 'room_amount': x.room_amount,
                           'items_amount': x.items_amount, 'total': x.total, 'payment_method': x.payment_method or None}
                          for x in stays[:1000]],
        }
    return {'GET': get}
