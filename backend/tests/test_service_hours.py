from app.services import service_hours


def test_counselor_log_value_is_parsed():
    assert service_hours.parse_log_value("5 | Osceola Library") == (5.0, "Osceola Library")
    assert service_hours.parse_log_value("2.5 hours: Second Harvest") == (2.5, "Second Harvest")
    assert service_hours.parse_log_value("lots | somewhere") is None
    assert service_hours.parse_log_value("900 | too many") is None


def test_places_fit_the_student_first():
    places = service_hours.ranked_places({"career_aspiration": "Nurse"}, {})
    assert "health" in places[0]["tags"]
    assert places[0]["fits"]
    assert len(places) == len(service_hours.data()["places"])


def test_known_places_get_their_full_name():
    assert service_hours.place_name("the library") == "Osceola Library System: Teen Ambassadors"
    assert service_hours.place_name("Second Harvest") == "Second Harvest Food Bank of Central Florida"
    assert service_hours.place_name("My church") == "My church"


def test_bright_futures_goals():
    goals = {goal["key"]: goal for goal in service_hours._bright_futures_goals(80)}
    assert goals["FMS"]["met"] and not goals["FAS"]["met"]
    assert goals["FAS"]["left"] == 20
    assert goals["GS"]["hours"] == 30
