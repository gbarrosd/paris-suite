from django.urls import path

from . import api, views

urlpatterns = [
    path('api/login', api.login_view),
    path('api/logout', api.logout_view),
    path('api/me', api.me),
    path('api/me/password', api.my_password),
    path('api/companies', api.companies),
    path('api/companies/<int:id>', api.company_detail),
    path('api/companies/<int:id>/categories', api.company_categories),
    path('api/companies/<int:id>/rooms', api.company_rooms),
    path('api/companies/<int:id>/products', api.company_products),
    path('api/companies/<int:id>/stays', api.company_stays),
    path('api/categories/<int:id>', api.category_detail),
    path('api/rooms/<int:id>', api.room_detail),
    path('api/rooms/<int:id>/status', api.room_status),
    path('api/rooms/<int:id>/checkin', api.room_checkin),
    path('api/products/<int:id>', api.product_detail),
    path('api/stays/<int:id>', api.stay_detail),
    path('api/stays/<int:id>/items', api.stay_items),
    path('api/stays/<int:id>/items/<int:item_id>', api.stay_item_detail),
    path('api/stays/<int:id>/checkout', api.stay_checkout),
    path('api/stays/<int:id>/cancel', api.stay_cancel),
    path('api/users', api.users),
    path('api/users/<int:id>', api.user_detail),
    path('', views.index),
]
