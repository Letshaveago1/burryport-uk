import requests
from datetime import datetime, timezone
from supabase import create_client, Client
import os
from dotenv import load_dotenv

# --- SETUP ---
load_dotenv() 

# Supabase client (assuming it's initialized correctly in src.lib.supabase_client if you use it)
try:
    from src.lib.supabase_client import supabase
except ImportError:
    print("Warning: Could not import shared Supabase client. Initializing locally.")
    SUPABASE_URL: str = os.environ.get("SUPABASE_URL")
    SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# OpenWeatherMap API Configuration
OPENWEATHER_API_KEY: str = os.environ.get("OPENWEATHER_API_KEY")
OPENWEATHER_LAT: str = os.environ.get("OPENWEATHER_LAT")
OPENWEATHER_LON: str = os.environ.get("OPENWEATHER_LON")

# OpenWeatherMap API Endpoints
# We'll use the 5-day / 3-hour forecast endpoint
# Request 'units=metric' for Celsius and m/s wind speed
FORECAST_ENDPOINT = (
    "https://api.openweathermap.org/data/2.5/forecast?"
    "lat={lat}&lon={lon}&appid={api_key}&units=metric" 
)

# --- IMPORTANT: Match your table name exactly ---
TABLE_NAME = "weather_forecast" 

def fetch_openweathermap_forecast():
    """Fetches the 5-day / 3-hour forecast from the OpenWeatherMap API."""
    if not OPENWEATHER_API_KEY or not OPENWEATHER_LAT or not OPENWEATHER_LON:
        print("Error: OPENWEATHER_API_KEY, LAT, or LON not set in .env")
        return []

    url = FORECAST_ENDPOINT.format(
        lat=OPENWEATHER_LAT,
        lon=OPENWEATHER_LON,
        api_key=OPENWEATHER_API_KEY
    )
    print(f"Fetching weather forecast from OpenWeatherMap API for lat={OPENWEATHER_LAT}, lon={OPENWEATHER_LON}...")

    try:
        response = requests.get(url)
        response.raise_for_status() # Raises HTTPError for bad responses (4xx or 5xx)
        data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching OpenWeatherMap data: {e}")
        return []

    records = []
    
    if 'list' in data:
        for forecast_item in data['list']:
            forecast_time_utc = datetime.fromtimestamp(forecast_item['dt'], tz=timezone.utc)
            
            main_data = forecast_item['main']
            weather_data = forecast_item['weather'][0]
            wind_data = forecast_item['wind']

            # Extract data, matching column names and expected types
            # Use .get() with default values to handle potentially missing keys gracefully
            
            # --- Mapping to your schema ---
            try:
                records.append({
                    "forecast_time": forecast_time_utc.isoformat().replace('+00:00', 'Z'),
                    "temp_c": round(main_data.get('temp'), 2) if main_data.get('temp') is not None else None,
                    "feels_like_c": round(main_data.get('feels_like'), 2) if main_data.get('feels_like') is not None else None,
                    "pressure_hpa": main_data.get('pressure'),
                    "humidity_percent": main_data.get('humidity'),
                    "weather_main": weather_data.get('main'), # e.g., "Clouds", "Rain"
                    "weather_description": weather_data.get('description'), # e.g., "overcast clouds", "light rain"
                    "weather_icon": weather_data.get('icon'), # e.g., "04d"
                    "wind_speed_mps": round(wind_data.get('speed', 0), 2), # Already in m/s from units=metric
                    "wind_deg": wind_data.get('deg'), # Degrees (0-360)
                    "visibility_m": forecast_item.get('visibility'), # Visibility in meters
                    "rain_prob": round(forecast_item.get('pop', 0), 2) # Probability of Precipitation (0.00-1.00)
                    # Note: 'precipitation_prob' is present in your schema, but 'rain_prob' matches OWM's 'pop'
                    # and its numeric(3,2) type. The `precipitation_prob` smallint column seems to be a leftover.
                    # I am populating 'rain_prob' as it matches OWM's 'pop'. 
                    # If `precipitation_prob` is also needed, please clarify its intended source/meaning.
                    # For now, I'm assuming 'rain_prob' is the target for OWM's 'pop'.
                })
            except TypeError as te:
                print(f"Skipping record due to data type conversion error: {te} in item {forecast_item}")
                continue
            except Exception as e:
                print(f"An unexpected error occurred while processing forecast item: {e} in item {forecast_item}")
                continue
    else:
        print("No 'list' data found in OpenWeatherMap response. Check API key or coordinates.")
        # print(data) # Uncomment to see raw response if needed for debugging

    return records

def update_supabase_weather(records):
    """Inserts or updates weather forecast records into the Supabase database."""
    if not records:
        print("No weather forecast data records to insert.")
        return

    print(f"Prepared {len(records)} weather records for insertion into {TABLE_NAME}.")
    if supabase is None:
        print("Fatal Error: Supabase client is not initialized. Cannot update database.")
        return

    try:
        response = (
            supabase.table(TABLE_NAME)
            .upsert(records, on_conflict="forecast_time")
            .execute()
        )
        print(f"✅ Successfully inserted/updated {len(response.data)} weather forecast data in Supabase.")
        
    except Exception as e:
        print(f"❌ An error occurred during Supabase insertion: {e}")
        print("HINT: Double-check your Supabase RLS policies and ensure 'forecast_time' has a UNIQUE constraint.")

if __name__ == "__main__":
    print("--- Starting OpenWeatherMap Weather Scraper ---")
    weather_data = fetch_openweathermap_forecast()
    update_supabase_weather(weather_data)
    print("--- OpenWeatherMap Weather Scraper Finished ---")