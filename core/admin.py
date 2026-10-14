from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Category, Company, Product, Room, Stay, StayItem, User


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
    list_display = ('name', 'company', 'category', 'status', 'active')
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
