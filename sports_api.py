import os
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ.get('THE_ODDS_API_KEY')
BASE_URL = 'https://api.the-odds-api.com/v4'

def get_active_sports():
    url = f'{BASE_URL}/sports/?apiKey={API_KEY}'
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        return None

def get_odds(sport_key, region='us', market='h2h', bookmakers=None):
    url = f'{BASE_URL}/sports/{sport_key}/odds/?apiKey={API_KEY}&regions={region}&markets={market}'
    if bookmakers:
        url += f'&bookmakers={bookmakers}'
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        return None
