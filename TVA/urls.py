from django.urls import path
from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('restaurants/', views.restaurant_page, name='restaurant_page'),
    path('hotels/', views.hotels_page, name='hotels_page'),
    path('bus/<str:bus_id>', views.bus, name='bus_route'),
    # path('restaurants/', views.alerts_page, name='alerts_page'),
    # path('restaurants/', views.city_page, name='city_page'),

]