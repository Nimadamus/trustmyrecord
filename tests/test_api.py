
import pytest
from sports_api import get_active_sports, get_odds


def def test_get_active_sports_success(mocker):
    mock_response = mocker.Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = [
        {"key": "americanfootball_nfl", "title": "NFL"},
        {"key": "basketball_nba", "title": "NBA"},
    ]
    mocker.patch("requests.get", return_value=mock_response)

    active_sports = get_active_sports()
    assert active_sports is not None
    assert len(active_sports) == 2
    assert active_sports[0]["key"] == "americanfootball_nfl"


def def test_get_active_sports_failure(mocker):
    mock_response = mocker.Mock()
    mock_response.status_code = 401
    mocker.patch("requests.get", return_value=mock_response)

    active_sports = get_active_sports()
    assert active_sports is None


def def test_get_odds_success(mocker):
    mock_response = mocker.Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"some_odds_data": "here"}
    mocker.patch("requests.get", return_value=mock_response)

    odds = get_odds("americanfootball_nfl")
    assert odds is not None
    assert odds["some_odds_data"] == "here"


def def test_get_odds_failure(mocker):
    mock_response = mocker.Mock()
    mock_response.status_code = 401
    mocker.patch("requests.get", return_value=mock_response)

    odds = get_odds("americanfootball_nfl")
    assert odds is None
