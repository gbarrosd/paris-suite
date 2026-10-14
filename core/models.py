from datetime import time
from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.db import models


class Company(models.Model):
    name = models.CharField('nome', max_length=120)
    timezone = models.CharField('fuso horário', max_length=60, default='America/Sao_Paulo')
    overnight_start = models.TimeField('início do pernoite', default=time(20, 0))
    overnight_end = models.TimeField('fim do pernoite', default=time(12, 0))
    daily_start = models.TimeField('entrada da diária', default=time(12, 0))
    daily_end = models.TimeField('saída da diária', default=time(12, 0))
    tolerance_min = models.PositiveIntegerField('tolerância (min)', default=15)
    active = models.BooleanField('ativa', default=True)

    class Meta:
        verbose_name = 'empresa'
        ordering = ['name']

    def __str__(self):
        return self.name


class User(AbstractUser):
    # Administrador: dono do sistema (todas as empresas, cadastra empresas e usuários).
    # Usuário: opera e configura somente a própria empresa.
    ROLES = [('admin', 'Administrador'), ('usuario', 'Usuário')]
    role = models.CharField('perfil', max_length=10, choices=ROLES, default='usuario')
    company = models.ForeignKey(Company, verbose_name='empresa', null=True, blank=True, on_delete=models.PROTECT)

    class Meta:
        verbose_name = 'usuário'

    @property
    def display_name(self):
        return self.first_name or self.username

    @property
    def is_admin(self):
        return self.role == 'admin' or self.is_superuser

    def can_access(self, company_id):
        return self.is_admin or (self.company_id is not None and self.company_id == int(company_id))


class Category(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='categories')
    name = models.CharField('nome', max_length=80)
    hour_price = models.DecimalField('preço da hora', max_digits=10, decimal_places=2, default=Decimal('0'))
    hour_min_hours = models.PositiveIntegerField('mínimo de horas', default=1)
    extra_hour_price = models.DecimalField('hora adicional', max_digits=10, decimal_places=2, null=True, blank=True)
    overnight_price = models.DecimalField('pernoite', max_digits=10, decimal_places=2, default=Decimal('0'))
    daily_price = models.DecimalField('diária', max_digits=10, decimal_places=2, default=Decimal('0'))
    active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'categoria de quarto'
        verbose_name_plural = 'categorias de quarto'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.company})'


class Room(models.Model):
    STATUS = [('livre', 'Livre'), ('ocupado', 'Ocupado'), ('limpeza', 'Limpeza'), ('manutencao', 'Manutenção')]
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='rooms')
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='rooms')
    name = models.CharField('nome/número', max_length=40)
    capacity = models.PositiveSmallIntegerField('capacidade (pessoas)', null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS, default='livre')
    active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'quarto'

    def __str__(self):
        return f'Quarto {self.name}'


class Product(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='products')
    name = models.CharField('nome', max_length=120)
    price = models.DecimalField('preço', max_digits=10, decimal_places=2)
    active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'produto'
        ordering = ['name']

    def __str__(self):
        return self.name


class Stay(models.Model):
    BILLING = [('hora', 'Por hora'), ('pernoite', 'Pernoite'), ('diaria', 'Diária')]
    STATUS = [('aberta', 'Aberta'), ('fechada', 'Fechada'), ('cancelada', 'Cancelada')]
    company = models.ForeignKey(Company, on_delete=models.PROTECT, related_name='stays')
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name='stays')
    room_name = models.CharField(max_length=40)
    category_name = models.CharField(max_length=80)
    billing_type = models.CharField('cobrança', max_length=10, choices=BILLING)
    guest_name = models.CharField('cliente', max_length=120, blank=True, default='')
    check_in = models.DateTimeField('entrada')
    check_out = models.DateTimeField('saída', null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS, default='aberta')
    # Preços e horários vigentes na entrada: mudanças posteriores não afetam estadias abertas.
    rates = models.JSONField()
    room_lines = models.JSONField(default=list, blank=True)
    room_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    items_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    surcharge = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    total = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    payment_method = models.CharField(max_length=40, blank=True, default='')
    notes = models.CharField(max_length=500, blank=True, default='')
    opened_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    closed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        verbose_name = 'estadia'
        indexes = [models.Index(fields=['company', 'status', 'check_out'])]
        constraints = [models.UniqueConstraint(fields=['room'], condition=models.Q(status='aberta'), name='uma_estadia_aberta_por_quarto')]

    def __str__(self):
        return f'Estadia {self.pk} · quarto {self.room_name}'


class StayItem(models.Model):
    stay = models.ForeignKey(Stay, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, null=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=120)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    qty = models.DecimalField(max_digits=8, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'item de consumo'
        verbose_name_plural = 'itens de consumo'
        ordering = ['id']


class Reservation(models.Model):
    STATUS = [('agendada', 'Agendada'), ('iniciada', 'Iniciada'), ('cancelada', 'Cancelada'), ('nao_compareceu', 'Não compareceu')]
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='reservations')
    room = models.ForeignKey(Room, on_delete=models.PROTECT, related_name='reservations')
    billing_type = models.CharField('cobrança', max_length=10, choices=Stay.BILLING)
    start_at = models.DateTimeField('início')
    end_at = models.DateTimeField('fim previsto')
    hours = models.PositiveSmallIntegerField('horas (por hora)', null=True, blank=True)
    days = models.PositiveSmallIntegerField('diárias', null=True, blank=True)
    guest_name = models.CharField('cliente', max_length=120, blank=True, default='')
    guest_phone = models.CharField('telefone', max_length=40, blank=True, default='')
    people = models.PositiveSmallIntegerField('pessoas', null=True, blank=True)
    notes = models.CharField('observação', max_length=500, blank=True, default='')
    status = models.CharField(max_length=16, choices=STATUS, default='agendada')
    stay = models.OneToOneField(Stay, null=True, blank=True, on_delete=models.SET_NULL, related_name='reservation')
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'reserva'
        ordering = ['start_at']
        indexes = [models.Index(fields=['company', 'status', 'start_at'])]

    def __str__(self):
        return f'Reserva {self.pk} · quarto {self.room.name}'


class CashSession(models.Model):
    """Turno de caixa: abertura com troco e fechamento com o valor contado em dinheiro."""
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='cash_sessions')
    opened_at = models.DateTimeField('abertura')
    opened_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    opening_amount = models.DecimalField('troco inicial', max_digits=10, decimal_places=2, default=Decimal('0'))
    closed_at = models.DateTimeField('fechamento', null=True, blank=True)
    closed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    expected_cash = models.DecimalField('dinheiro esperado', max_digits=10, decimal_places=2, null=True, blank=True)
    counted_cash = models.DecimalField('dinheiro contado', max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.CharField('observação', max_length=500, blank=True, default='')

    class Meta:
        verbose_name = 'turno de caixa'
        verbose_name_plural = 'turnos de caixa'
        ordering = ['-opened_at']
        constraints = [models.UniqueConstraint(fields=['company'], condition=models.Q(closed_at__isnull=True), name='um_caixa_aberto_por_empresa')]


class CashEntry(models.Model):
    """Lançamento do fluxo de caixa. Estadias fechadas geram entradas automáticas."""
    KINDS = [('entrada', 'Entrada'), ('saida', 'Saída')]
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='cash_entries')
    session = models.ForeignKey(CashSession, null=True, blank=True, on_delete=models.SET_NULL, related_name='entries')
    kind = models.CharField('tipo', max_length=8, choices=KINDS)
    category = models.CharField('categoria', max_length=60)
    description = models.CharField('descrição', max_length=200, blank=True, default='')
    amount = models.DecimalField('valor', max_digits=10, decimal_places=2)
    payment_method = models.CharField('forma de pagamento', max_length=40, blank=True, default='')
    occurred_at = models.DateTimeField('data')
    stay = models.OneToOneField(Stay, null=True, blank=True, on_delete=models.SET_NULL, related_name='cash_entry')
    created_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')
    cancelled_at = models.DateTimeField('estornado em', null=True, blank=True)
    cancelled_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        verbose_name = 'lançamento de caixa'
        verbose_name_plural = 'lançamentos de caixa'
        ordering = ['-occurred_at']
        indexes = [models.Index(fields=['company', 'occurred_at'])]
