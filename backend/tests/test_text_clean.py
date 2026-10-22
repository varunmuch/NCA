from app.services.text_clean import clean_items, clean_paragraph, clean_strings, plain_text


def test_bold_markers_are_removed():
    assert plain_text("Learn **Python** and ****SQL*****.") == "Learn Python and SQL."
    assert plain_text("Try __statistics__ first") == "Try statistics first"


def test_made_up_field_names_are_dropped():
    junk = "future_steps_10th_12th_grade_2_years_out_of_high_school_4_years_out_of_high"
    assert clean_items(["Join a coding club.", junk]) == ["Join a coding club."]


def test_junk_appended_after_prose_is_cut():
    text = "Ask yourself if you like puzzles. next_steps_10th_12th_grade_2_years"
    assert clean_paragraph(text) == "Ask yourself if you like puzzles."


def test_sentence_split_across_items_is_rejoined():
    items = [
        "Take a free course on Python or R, which are super-",
        "important for Data Scientists.",
        "Join a coding club at school.",
    ]
    assert clean_items(items) == [
        "Take a free course on Python or R, which are super-important for Data Scientists.",
        "Join a coding club at school.",
    ]


def test_trailing_fragment_is_trimmed():
    assert clean_paragraph("You like math. You also enjoy building and") == "You like math."


def test_repeats_and_limit():
    items = ["Shadow a data analyst.", "Shadow a data analyst!", "Volunteer to chart survey results."]
    assert clean_items(items, max_items=5) == ["Shadow a data analyst.", "Volunteer to chart survey results."]


def test_nested_structures_are_cleaned():
    raw = {"goal": "**Learn** Python", "steps": ["Try *SQL*", "a_b_c_d"]}
    assert clean_strings(raw) == {"goal": "Learn Python", "steps": ["Try SQL", ""]}


def test_normal_words_with_one_underscore_survive():
    assert plain_text("Use snake_case names") == "Use snake_case names"
