import json
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

    def test_operador_sem_acesso_a_outra_empresa(self):
        self.call('post', '/api/login', {'username': 'admin', 'password': 'admin'})
        other = self.call('post', '/api/companies', {'name': 'Outra'})
        self.call('post', '/api/users', {'username': 'op', 'name': 'Op', 'password': '1234', 'role': 'operador', 'company_id': other['id']})
        self.call('post', '/api/logout')
        self.call('post', '/api/login', {'username': 'op', 'password': '1234'})
        self.assertEqual([c['id'] for c in self.call('get', '/api/companies')], [other['id']])
        self.call('get', '/api/companies/1/rooms', status=403)
        self.call('put', f"/api/companies/{other['id']}", {'name': 'x'}, status=403)

    def test_csrf_exigido(self):
        c = Client(enforce_csrf_checks=True)
        r = c.post('/api/login', data='{"username":"admin","password":"admin"}', content_type='application/json')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(Stay.objects.exists())
