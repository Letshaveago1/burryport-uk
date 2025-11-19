import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo # For robust timezone handling

# Import the shared Supabase client from the src/lib directory
from src.lib.supabase_client import supabase


# --- CONFIGURATION ---
# Base URL template for daily tide times
BASE_URL = "https://www.tidetimes.org.uk/burry-port-tide-times-"
TABLE_NAME = "tides"
DAYS_TO_FORECAST = 7

# --- 1. CORE SCRAPING FUNCTION FOR A SINGLE DAY ---
def scrape_single_day(date_obj, london_tz):
    """Fetches and parses tide predictions for a single day."""
    date_str = date_obj.strftime('%Y%m%d')
    url = f"{BASE_URL}{date_str}"
    
    print(f"Fetching data for: {date_str}")
    
    try:
        response = requests.get(url)
        response.raise_for_status() 
    except requests.exceptions.RequestException as e:
        print(f"Error fetching URL {url}: {e}")
        return []

    soup = BeautifulSoup(response.content, 'html.parser')
    daily_records = []
    
    # --- FIX: Target the specific container div and then the table within it ---
    tide_container = soup.find('div', id='tides')
    if not tide_container:
        print(f"Warning: Could not find the main tide container (#tides) for {date_str}.")
        return []

    data_table = tide_container.find('table')

    tide_rows = [tr for tr in data_table.find_all('tr') if 'colhead' not in tr.get('class', [])]
    
    for row in tide_rows:
        tide_type_cell = row.find('td', class_='tal') 
        tide_time_cell = row.find('td', class_='tac') 
        tide_height_cell = row.find('td', class_='tar')
        
        # Check if the row contains the necessary structure
        if tide_type_cell and tide_time_cell and tide_height_cell:
            tide_type = tide_type_cell.text.strip()
            
            # The time is inside a <span> within the 'tac' cell.
            span_time = tide_time_cell.find('span')
            if not span_time:
                # print(f"Skipping row, could not find time span in: {tide_time_cell}") # Uncomment for debugging
                continue # Skip if the expected span is missing

            tide_time_raw = span_time.text.strip() 
            try:
                height_m = round(float(tide_height_cell.text.strip().replace('m', '')), 2)
                
                # Combine the date and time string
                full_datetime_str = f"{date_obj.strftime('%Y-%m-%d')} {tide_time_raw}"
                
                # Parse as a naive datetime (24-hour format)
                naive_dt = datetime.strptime(full_datetime_str, '%Y-%m-%d %H:%M')

                # Make it timezone-aware for London (correctly handles GMT/BST switch)
                local_dt = naive_dt.replace(tzinfo=london_tz)

                # Convert to ISO 8601 string (Postgres/Supabase standard)
                tide_iso_time = local_dt.isoformat()

                daily_records.append({
                    "tide_time": tide_iso_time,
                    "tide_type": tide_type,
                    "height_m": height_m
                })
            except ValueError as ve:
                print(f"Skipping record due to parsing error: {full_datetime_str}. Error: {ve}")
                continue
    return daily_records

# --- 2. MAIN SCRAPER & DB UPDATE ---
def run_weekly_scraper():
    """Scrapes 7 days of tide data and updates the Supabase database."""
    all_records = []
    london_tz = ZoneInfo("Europe/London")
    today = datetime.now(london_tz).date()
    
    for i in range(DAYS_TO_FORECAST):
        target_date = today + timedelta(days=i)
        daily_data = scrape_single_day(target_date, london_tz)
        all_records.extend(daily_data)
    
    if not all_records:
        print("Scraper finished, but no tide data records were collected.")
        return

    print(f"Scraper collected {len(all_records)} records over {DAYS_TO_FORECAST} days.")
    
    try:
        # Use .upsert() on the 'tide_time' column (must be UNIQUE in Supabase)
        response = (
            supabase.table(TABLE_NAME)
            .upsert(all_records, on_conflict="tide_time")
            .execute()
        )
        print(f"✅ Successfully inserted/updated data in Supabase.")
        
    except Exception as e:
        print(f"❌ An error occurred during Supabase insertion: {e}")
        print("HINT: Check Supabase keys, RLS policies, and ensure 'tide_time' has a UNIQUE constraint.")

# --- 3. MAIN EXECUTION ---
def main():
    """Main function to run the scraper and update the database."""
    print("--- Starting Tide Scraper ---")
    run_weekly_scraper()
    print("--- Tide Scraper Finished ---")

if __name__ == "__main__":
    main()