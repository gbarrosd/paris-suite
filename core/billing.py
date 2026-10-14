"""Cálculo do valor da estadia (hora, pernoite, diária).

Os cálculos usam o horário de parede (local) do fuso da empresa, com datetimes "ingênuos"
obtidos convertendo o instante para o fuso e removendo o tzinfo.
"""
import math
from datetime import datetime, timedelta, time
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo

DAY = timedelta(days=1)
BILLING_TYPES = {'hora': 'Por hora', 'pernoite': 'Pernoite', 'diaria': 'Diária'}


def money(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def br(v) -> str:
    return f'{money(v):.2f}'.replace('.', ',')


def parse_hm(hm) -> time:
    if isinstance(hm, time):
        return hm
    h, m = (str(hm or '00:00').split(':') + ['0'])[:2]
    return time(int(h), int(m))


def to_wall(dt: datetime, tz: str) -> datetime:
    return dt.astimezone(ZoneInfo(tz)).replace(tzinfo=None)


def next_at(wall: datetime, hm, inclusive=False) -> datetime:
    """Próxima ocorrência do horário hm depois de `wall` (ou igual, se inclusive)."""
    t = datetime.combine(wall.date(), parse_hm(hm))
    if t < wall or (not inclusive and t == wall):
        t += DAY
    return t


def billable_hours(delta: timedelta, tolerance_min: int) -> int:
    """Horas cobráveis: a fração só conta se passar da tolerância."""
    minutes = int(delta.total_seconds() // 60)
    if minutes <= 0:
        return 0
    full, rest = divmod(minutes, 60)
    return full + (1 if rest > tolerance_min else 0)


def fmt_h(delta: timedelta) -> str:
    m = max(0, int(delta.total_seconds() // 60))
    return f'{m // 60}h{m % 60:02d}'


def calc_stay(billing_type: str, check_in: datetime, check_out: datetime, rates: dict, tz='America/Sao_Paulo'):
    hour_price = money(rates.get('hour_price') or 0)
    extra = rates.get('extra_hour_price')
    r = {
        'hour_price': hour_price,
        'hour_min_hours': max(1, int(rates.get('hour_min_hours') or 1)),
        'extra_hour_price': hour_price if extra in (None, '') else money(extra),
        'tolerance_min': max(0, int(rates.get('tolerance_min') or 0)),
        'overnight_price': money(rates.get('overnight_price') or 0),
        'overnight_start': rates.get('overnight_start') or '20:00',
        'overnight_end': rates.get('overnight_end') or '12:00',
        'daily_price': money(rates.get('daily_price') or 0),
        'daily_start': rates.get('daily_start') or '12:00',
        'daily_end': rates.get('daily_end') or '12:00',
    }
    start = to_wall(check_in, tz)
    end = to_wall(max(check_out, check_in), tz)
    elapsed = end - start
    tol = r['tolerance_min']
    lines = []

    if billing_type == 'hora':
        hours = max(r['hour_min_hours'], billable_hours(elapsed, tol))
        lines.append({'desc': f"Permanência por hora ({fmt_h(elapsed)} → {hours}h × {br(r['hour_price'])})",
                      'amount': money(hours * r['hour_price'])})
    elif billing_type == 'pernoite':
        due = next_at(start, r['overnight_end'])
        s, e = parse_hm(r['overnight_start']), parse_hm(r['overnight_end'])
        window = (datetime.combine(start.date(), e) - datetime.combine(start.date(), s)) % DAY or DAY
        window_start = due - window
        lines.append({'desc': f"Pernoite ({r['overnight_start']} às {r['overnight_end']})", 'amount': r['overnight_price']})
        if start < window_start:
            h = billable_hours(window_start - start, tol)
            if h:
                lines.append({'desc': f"Entrada antecipada ({h}h × {br(r['extra_hour_price'])})",
                              'amount': money(h * r['extra_hour_price'])})
        if end > due:
            h = billable_hours(end - due, tol)
            if h:
                lines.append({'desc': f"Horas excedentes após {r['overnight_end']} ({h}h × {br(r['extra_hour_price'])})",
                              'amount': money(h * r['extra_hour_price'])})
    elif billing_type == 'diaria':
        # Entrada antes do horário de início conta a partir do início do mesmo dia.
        today_start = datetime.combine(start.date(), parse_hm(r['daily_start']))
        anchor = max(start, today_start)
        first_due = next_at(anchor, r['daily_end'])
        over = end - first_due - timedelta(minutes=tol)
        days = 1 + (math.ceil(over / DAY) if over > timedelta(0) else 0)
        lines.append({'desc': f"Diária ({r['daily_start']} às {r['daily_end']}) × {days}",
                      'amount': money(days * r['daily_price'])})
    else:
        raise ValueError(f'Tipo de cobrança inválido: {billing_type}')

    return {'lines': lines, 'total': money(sum(l['amount'] for l in lines)), 'elapsed': elapsed}
