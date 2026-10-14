"""Prepara o sistema na primeira execução: cria o administrador e, opcionalmente, dados de exemplo."""
import os
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from core.models import Category, Company, Product, Room, User


class Command(BaseCommand):
    help = 'Cria o usuário administrador inicial e uma empresa de exemplo (somente se não houver usuários).'

    def add_arguments(self, parser):
        parser.add_argument('--no-demo', action='store_true', help='Não criar a empresa de exemplo')

    @transaction.atomic
    def handle(self, *args, no_demo=False, **opts):
        if User.objects.exists():
            self.stdout.write('Usuários já existem; nada a fazer.')
            return
        username = os.environ.get('ADMIN_USERNAME', 'admin')
        password = os.environ.get('ADMIN_PASSWORD', 'admin')
        User.objects.create_superuser(username=username, password=password, first_name='Administrador', role='admin')
        self.stdout.write(self.style.SUCCESS(f'Criado usuário "{username}". Troque a senha após o primeiro acesso.'))
        if no_demo or os.environ.get('DEMO_DATA', '1') == '0':
            return
        c = Company.objects.create(name='Empresa Exemplo')
        std = Category.objects.create(company=c, name='Standard', hour_price=40, hour_min_hours=2, extra_hour_price=25,
                                      overnight_price=120, daily_price=180)
        lux = Category.objects.create(company=c, name='Luxo', hour_price=70, hour_min_hours=2, extra_hour_price=40,
                                      overnight_price=200, daily_price=300)
        Room.objects.bulk_create([Room(company=c, category=std, name=str(100 + i)) for i in range(1, 7)] +
                                 [Room(company=c, category=lux, name=str(200 + i)) for i in range(1, 3)])
        Product.objects.bulk_create([Product(company=c, name=n, price=Decimal(p)) for n, p in [
            ('Água 500ml', '5'), ('Refrigerante lata', '7'), ('Cerveja long neck', '12'), ('Energético', '15'),
            ('Porção de batata', '35'), ('Chocolate', '8')]])
        self.stdout.write(self.style.SUCCESS('Criada a "Empresa Exemplo" com 8 quartos e 6 produtos.'))
