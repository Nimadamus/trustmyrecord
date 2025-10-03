import requests
import os
import json

url = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams"

response = requests.get(url)

data = json.loads(response.text)

teams = data['sports'][0]['leagues'][0]['teams']

team_to_file = {}

for team_data in teams:
    team = team_data['team']
    team_name = team['displayName']
    logo_url = team['logos'][0]['href']
    abbreviation = team['abbreviation']
    filename = f"{abbreviation.lower()}.png"
    team_to_file[team_name] = filename

    # Download and save the logo
    logo_response = requests.get(logo_url)
    with open(os.path.join('static', 'images', 'logos', 'mlb', filename), 'wb') as f:
        f.write(logo_response.content)

print(team_to_file)
