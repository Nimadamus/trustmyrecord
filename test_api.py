from sports_api import get_active_sports

if __name__ == '__main__':
    active_sports = get_active_sports()
    if active_sports:
        print("Successfully fetched active sports:")
        for sport in active_sports:
            print(f"- {sport['title']}")
    else:
        print("Failed to fetch active sports.")
