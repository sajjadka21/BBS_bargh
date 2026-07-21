"""Configuration for the Mazandaran outage API."""

BASE_URL = "https://khamooshi.maztozi.ir"
OUTAGES_API_URL = f"{BASE_URL}/api/outages"

# The new API uses one numeric selector in the `city` request field.
CITIES = [
    {
        "key": "babolsar",
        "label": "\u0628\u0627\u0628\u0644\u0633\u0631",
        "query_city": 85,
        "pgds": "",
    },
    {
        "key": "sari",
        "label": "\u0633\u0627\u0631\u06cc",
        "query_city": 2,
        "pgds": "",
    },
]