from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import CashEntry, CashSession, Category, Company, Product, Reservation, Room, Stay, StayItem, User


@admin.register(User)
class AppUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (('Sistema', {'fields': ('role', 'company')}),)
    list_display = ('username', 'first_name', 'role', 'company', 'is_active')


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ('name', 'overnight_start', 'overnight_end', 'daily_start', 'daily_end', 'tolerance_min')


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'company', 'hour_price', 'overnight_price', 'daily_price', 'active')
    list_filter = ('company',)


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('name', 'company', 'category', 'capacity', 'status', 'active')
    list_filter = ('company', 'status')


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'company', 'price', 'active')
    list_filter = ('company',)


class StayItemInline(admin.TabularInline):
    model = StayItem
    extra = 0


@admin.register(Stay)
class StayAdmin(admin.ModelAdmin):
    list_display = ('id', 'company', 'room_name', 'billing_type', 'guest_name', 'check_in', 'check_out', 'status', 'total')
    list_filter = ('company', 'status', 'billing_type')
    inlines = [StayItemInline]


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('id', 'company', 'room', 'billing_type', 'start_at', 'end_at', 'guest_name', 'status')
    list_filter = ('company', 'status', 'billing_type')


class CashEntryInline(admin.TabularInline):
    model = CashEntry
    extra = 0


@admin.register(CashSession)
class CashSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'company', 'opened_at', 'opening_amount', 'closed_at', 'expected_cash', 'counted_cash')
    list_filter = ('company',)
    inlines = [CashEntryInline]


@admin.register(CashEntry)
class CashEntryAdmin(admin.ModelAdmin):
    list_display = ('id', 'company', 'occurred_at', 'kind', 'category', 'amount', 'payment_method', 'cancelled_at')
    list_filter = ('company', 'kind', 'category')
