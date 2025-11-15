from django.shortcuts import render
from django.http import HttpResponse


def home(request):
    return render(request, 'public/index.html')

def restaurant_page(request):
    return render(request, 'public/restaurants.html')

def hotels_page(request):
    return render(request, 'public/hotels.html')

def bus(request, bus_id):
    context = {'bus_id': bus_id}
    return render(request, 'public/bus.html', context)