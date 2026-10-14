from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def index(request):
    """Página única da interface; garante o cookie CSRF usado pelas chamadas da API."""
    return render(request, 'core/index.html')
