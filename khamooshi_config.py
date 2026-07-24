"""Configuration for the Mazandaran outage API."""

BASE_URL = "https://khamooshi.maztozi.ir"
OUTAGES_API_URL = f"{BASE_URL}/api/outages"

# One logical city can be backed by several numeric selectors in the API.
# The website sends one /api/outages request for every selector and merges them.
CITIES = [
    {
        "key": "babol",
        "label": "بابل",
        "source_city_ids": [13, 25, 61, 62, 64, 65, 66, 67, 68],
        "pgds": "",
    },
    {
        "key": "babolsar",
        "label": "بابلسر",
        "source_city_ids": [53, 85],
        "pgds": "",
    },
    {
        "key": "sari",
        "label": "ساری",
        "source_city_ids": [2, 3, 4, 5, 6, 87],
        "pgds": "",
    },
    {
        "key": "qaemshahr",
        "label": "قائم‌شهر",
        "source_city_ids": [31, 32, 34],
        "pgds": "",
    },
    {
        "key": "amol",
        "label": "آمل",
        "source_city_ids": [71, 72, 73, 74, 75, 76],
        "pgds": "",
    },
    {
        "key": "behshahr",
        "label": "بهشهر",
        "source_city_ids": [22, 23, 26],
        "pgds": "",
    },
]
