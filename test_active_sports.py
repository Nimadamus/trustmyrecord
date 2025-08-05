from sports_api import get_active_sports
import json

print("Fetching active sports...")
active_sports = get_active_sports()

if active_sports:
    print("Successfully fetched active sports:")
    for sport in active_sports:
        print(f"- Title: {sport['title']}, Key: {sport['key']}")
else:
    print("Failed to fetch active sports.")
