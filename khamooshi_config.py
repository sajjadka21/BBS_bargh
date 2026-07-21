"""Shared configuration for the outage fetcher."""

BASE_URL = "https://khamooshi.maztozi.ir/"

# area_id="-1" means all electricity service areas for that city.
CITIES = [
    {
        "key": "babolsar",
        "label": "بابلسر",
        "city_id": "990090351",
        "area_id": "85",
    },
    {
        "key": "sari",
        "label": "ساری",
        "city_id": "1",
        "area_id": "-1",
    },
]
