import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.test import Client, TestCase, SimpleTestCase

from .billing import calc_stay
from .models import Room, Stay

TZ = ZoneInfo('America/Sao_Paulo')
RATES = dict(hour_price='40', hour_min_hours=2, extra_hour_price='25', tolerance_min=15,
             overnight_price='120', overnight_start='20:00', overnight_end='12:00',
             daily_price='180', daily_start='12:00', daily_end='12:00')


def at(s):
    return datetime.fromisoformat(s).replace(tzinfo=TZ)


def ms_in(hours):
    return int((time.time() + hours * 3600) * 1000)


def total(kind, a, b):
    return float(calc_stay(kind, at(a), at(b), RATES)['total'])


class BillingTests(SimpleTestCase):
    def test_hora_minimo(self):
        self.assertEqual(total('hora', '2026-10-13T14:00', '2026-10-13T14:40'), 80)

    def test_hora_tolerancia(self):
        self.assertEqual(total('hora', '2026-10-13T14:00', '2026-10-13T17:10'), 120)
        self.assertEqual(total('hora', '2026-10-13T14:00', '2026-10-13T17:20'), 160)

    def test_pernoite_dentro_do_horario(self):
        self.assertEqual(total('pernoite', '2026-10-13T22:00', '2026-10-14T11:50'), 120)
        self.assertEqual(total('pernoite', '2026-10-14T01:30', '2026-10-14T12:10'), 120)

    def test_pernoite_excedente_e_antecipada(self):
        r = calc_stay('pernoite', at('2026-10-13T18:00'), at('2026-10-14T13:30'), RATES)
        self.assertEqual([float(l['amount']) for l in r['lines']], [120, 50, 50])

    def test_diaria(self):
        self.assertEqual(total('diaria', '2026-10-13T14:00', '2026-10-14T12:00'), 180)
        self.assertEqual(total('diaria', '2026-10-13T14:00', '2026-10-14T12:30'), 360)
        self.assertEqual(total('diaria', '2026-10-13T14:00', '2026-10-16T10:00'), 540)
        self.assertEqual(total('diaria', '2026-10-13T03:00', '2026-10-14T11:00'), 180)


class FlowTests(TestCase):
    def setUp(self):
        call_command('bootstrap', stdout=open('/dev/null', 'w'))
        self.c = Client()

    def call(self, method, url, body=None, status=200):
        if method == 'get':
            r = self.c.get(url)
        else:
            r = getattr(self.c, method)(url, data=json.dumps(body or {}), content_type='application/json')
        self.assertEqual(r.status_code, status, r.content)
        return r.json()

    def test_fluxo_completo(self):
        self.call('get', '/api/me', status=401)
        self.call('post', '/api/login', {'username': 'admin', 'password': 'errada'}, status=401)
        self.call('post', '/api/login', {'username': 'admin', 'password': 'admin'})
        co = self.call('get', '/api/companies')[0]
        rooms = self.call('get', f"/api/companies/{co['id']}/rooms")
        room = rooms[0]
        products = self.call('get', f"/api/companies/{co['id']}/products")
        st = self.call('post', f"/api/rooms/{room['id']}/checkin", {'billing_type': 'hora', 'guest_name': 'Maria'})
        self.call('post', f"/api/rooms/{room['id']}/checkin", {'billing_type': 'hora'}, status=400)
        st = self.call('post', f"/api/stays/{st['id']}/items", {'product_id': products[0]['id'], 'qty': 2})
        self.assertEqual(st['items_amount'], 2 * products[0]['price'])
        closed = self.call('post', f"/api/stays/{st['id']}/checkout", {'discount': 5, 'payment_method': 'Pix'})
        self.assertEqual(closed['status'], 'fechada')
        self.assertEqual(closed['total'], 80 + 2 * products[0]['price'] - 5)
        self.assertEqual(Room.objects.get(pk=room['id']).status, 'limpeza')
        hist = self.call('get', f"/api/companies/{co['id']}/stays?from=0&to=99999999999999")
        self.assertEqual(hist['summary']['by_payment'], {'Pix': closed['total']})

    def test_usuario_isolado_na_propria_empresa(self):
        self.call('post', '/api/login', {'username': 'admin', 'password': 'admin'})
        first = self.call('get', '/api/companies')[0]
        other = self.call('post', '/api/companies', {'name': 'Outra'})
        self.call('post', '/api/users', {'username': 'op', 'name': 'Op', 'password': '1234', 'role': 'usuario', 'company_id': other['id']})
        self.call('post', '/api/logout')
        self.call('post', '/api/login', {'username': 'op', 'password': '1234'})
        self.assertEqual([c['id'] for c in self.call('get', '/api/companies')], [other['id']])
        for url in ('rooms', 'products', 'categories', 'reservations', 'cash', 'report'):
            self.call('get', f"/api/companies/{first['id']}/{url}", status=403)
        self.call('put', f"/api/companies/{first['id']}", {'name': 'x'}, status=403)
        # Usuário comum configura a própria empresa, mas não cadastra empresas nem usuários.
        cat = self.call('get', f"/api/companies/{other['id']}/categories")[0]
        room = self.call('post', f"/api/companies/{other['id']}/rooms", {'name': '1', 'category_id': cat['id'], 'capacity': 3})
        self.assertEqual(room['capacity'], 3)
        self.call('put', f"/api/companies/{other['id']}", {**other, 'name': 'Novo nome', 'tolerance_min': 30})
        self.assertEqual(self.call('get', '/api/companies')[0]['name'], 'Outra')
        self.call('post', '/api/companies', {'name': 'Minha'}, status=403)
        self.call('get', '/api/users', status=403)
        self.call('post', '/api/users', {'username': 'x', 'name': 'X', 'password': '1234', 'company_id': other['id']}, status=403)
        # Não consegue usar quarto/produto de outra empresa por id.
        first_room = Room.objects.filter(company_id=first['id']).first()
        self.call('post', f"/api/rooms/{first_room.id}/checkin", {'billing_type': 'hora'}, status=403)
        self.call('post', f"/api/companies/{other['id']}/reservations",
                  {'room_id': first_room.id, 'billing_type': 'hora', 'start_at': ms_in(2)}, status=400)

    def test_reserva(self):
        self.call('post', '/api/login', {'username': 'admin', 'password': 'admin'})
        co = self.call('get', '/api/companies')[0]
        room = self.call('get', f"/api/companies/{co['id']}/rooms")[0]
        r = self.call('post', f"/api/companies/{co['id']}/reservations",
                      {'room_id': room['id'], 'billing_type': 'hora', 'start_at': ms_in(2), 'hours': 3, 'guest_name': 'Ana'})
        self.assertEqual(r['end_at'] - r['start_at'], 3 * 3600 * 1000)
        # conflito no mesmo quarto
        self.call('post', f"/api/companies/{co['id']}/reservations",
                  {'room_id': room['id'], 'billing_type': 'hora', 'start_at': ms_in(3)}, status=400)
        av = {a['room_id']: a for a in self.call('get', f"/api/companies/{co['id']}/availability?billing_type=hora&start_at={ms_in(3)}")}
        self.assertFalse(av[room['id']]['available'])
        rooms = {x['id']: x for x in self.call('get', f"/api/companies/{co['id']}/rooms")}
        self.assertEqual(rooms[room['id']]['next_reservation']['id'], r['id'])
        r = self.call('post', f"/api/reservations/{r['id']}/checkin")
        self.assertEqual(r['status'], 'iniciada')
        self.assertEqual(Room.objects.get(pk=room['id']).status, 'ocupado')
        self.assertEqual(Stay.objects.get(pk=r['stay_id']).guest_name, 'Ana')
        self.call('post', f"/api/reservations/{r['id']}/cancel", status=400)

    def test_caixa_e_relatorio(self):
        self.call('post', '/api/login', {'username': 'admin', 'password': 'admin'})
        co = self.call('get', '/api/companies')[0]
        cid = co['id']
        self.call('post', f"/api/companies/{cid}/cash/entries", {'kind': 'saida', 'category': 'Sangria', 'amount': 10}, status=400)
        sess = self.call('post', f"/api/companies/{cid}/cash", {'opening_amount': 100})
        self.call('post', f"/api/companies/{cid}/cash", {'opening_amount': 100}, status=400)
        room = self.call('get', f"/api/companies/{cid}/rooms")[0]
        prod = self.call('get', f"/api/companies/{cid}/products")[0]
        st = self.call('post', f"/api/rooms/{room['id']}/checkin", {'billing_type': 'hora'})
        self.call('post', f"/api/stays/{st['id']}/items", {'product_id': prod['id'], 'qty': 3})
        closed = self.call('post', f"/api/stays/{st['id']}/checkout", {'payment_method': 'Dinheiro'})
        self.call('post', f"/api/companies/{cid}/cash/entries", {'kind': 'saida', 'category': 'Sangria', 'amount': 50})
        desp = self.call('post', f"/api/companies/{cid}/cash/entries",
                         {'kind': 'saida', 'category': 'Lavanderia', 'amount': 30, 'payment_method': 'Pix'})
        cash = self.call('get', f"/api/companies/{cid}/cash")['session']
        self.assertEqual(cash['expected_cash'], 100 + closed['total'] - 50)
        self.call('post', f"/api/cash/entries/{desp['id']}/cancel")
        done = self.call('post', f"/api/cash/sessions/{sess['id']}/close", {'counted_cash': 100 + closed['total'] - 60})
        self.assertEqual(done['difference'], -10)
        rep = self.call('get', f"/api/companies/{cid}/report?from={ms_in(-24)}&to={ms_in(1)}")
        self.assertEqual(rep['totals']['entradas'], closed['total'])
        self.assertEqual(rep['totals']['saidas'], 0)  # sangria não é despesa e a lavanderia foi estornada
        self.assertEqual(rep['stays']['items_amount'], 3 * prod['price'])
        self.assertEqual(rep['by_product'][0]['qty'], 3)

    def test_csrf_exigido(self):
        c = Client(enforce_csrf_checks=True)
        r = c.post('/api/login', data='{"username":"admin","password":"admin"}', content_type='application/json')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(Stay.objects.exists())
