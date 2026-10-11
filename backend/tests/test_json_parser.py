import pytest

from app.utils.json_parser import JSONExtractionError, extract_json


def test_extract_plain_json():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_with_surrounding_prose():
    text = 'Sure, here you go:\n{"a": 1, "b": [1, 2]}\nHope that helps!'
    assert extract_json(text) == {"a": 1, "b": [1, 2]}


def test_extract_json_in_fence():
    text = '```json\n{"a": 1}\n```'
    assert extract_json(text) == {"a": 1}


def test_extract_json_raises_on_garbage():
    with pytest.raises(JSONExtractionError):
        extract_json("no json here at all")
