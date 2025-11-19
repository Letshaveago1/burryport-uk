import feedparser
from datetime import datetime
import re # Used for cleaning up data
from zoneinfo import ZoneInfo # For robust timezone handling

# --- SETUP & IMPORTS ---
# Import the shared Supabase client from the lib directory
from lib.supabase_client import supabase

# --- CONFIGURATION ---
# TideTimes.org.uk provides a stable RSS feed for predictions.
TIDE_FEED_URL = "https://www.tidetimes.org.uk/burry-port-tide-times.rss"

TABLE_NAME = "tides"

# --- 1. RSS PARSING FUNCTION ---
def parse_tide_feed():
    """Fetches and parses tide predictions from the RSS feed."""
    print(f"Fetching data from RSS feed: {TIDE_FEED_URL}")
    feed = feedparser.parse(TIDE_FEED_URL)
    records = []
    london_tz = ZoneInfo("Europe/London")

    # Each 'entry' in the feed is a single high or low tide event
    if not feed.entries:
        print("Warning: RSS feed is empty or could not be parsed.")
        return []

    for entry in feed.entries:
        # The 'published_parsed' field gives the date of the event as a time tuple
        date_tuple = entry.published_parsed
        if not date_tuple:
            print(f"Skipping entry with no date: {entry.get('title')}")
            continue

        # The description contains all tide events for the day, separated by <br/>
        description = entry.get("description", "")

        # --- FIX: Clean HTML tags from the description before processing ---
        # This makes parsing more reliable by removing links and other tags.
        clean_text = re.sub('<[^<]+?>', '\n', description)

        # Split by newline and process each line
        for line in clean_text.splitlines():
            line = line.strip()
            # Regex to find: HH:MM - High/Low Tide (X.XXm). Handles HTML encoded parentheses.
            match = re.search(r'(\d{2}:\d{2})\s+-\s+(High|Low)\s+Tide\s+(?:&#x28;|\()([\d\.]+m)(?:&#x29;|\))', line)
            if not match:
                continue

            try:
                tide_time_only, tide_type, height_str = match.groups()
                height_m = float(height_str.replace('m', ''))

                # --- Combine Date and Time Correctly ---
                event_date = datetime(*date_tuple[:3])
                tide_hour = int(tide_time_only.split(':')[0])
                tide_minute = int(tide_time_only.split(':')[1])
                naive_dt = event_date.replace(hour=tide_hour, minute=tide_minute)
                # To make a naive datetime timezone-aware with zoneinfo, use .replace()
                local_dt = naive_dt.replace(tzinfo=london_tz)
                tide_iso_time = local_dt.isoformat()

                records.append({
                    "tide_time": tide_iso_time,
                    "tide_type": tide_type,
                    "height_m": round(height_m, 2)
                })
            except (ValueError, AttributeError) as e:
                print(f"Error processing line: '{line}'. Details: {e}")

    # Deduplicate records in case the feed has overlaps.
    # This creates a dictionary with tide_time as key, which automatically handles duplicates.
    unique_records = list({r['tide_time']: r for r in records}.values())
    unique_records.sort(key=lambda r: r['tide_time']) # Sort chronologically
    
    return unique_records

# --- 2. SUPABASE INSERTION FUNCTION ---
def update_supabase_tides(records):
    """Inserts or updates tide records into the Supabase database."""
    if not records:
        print("No tide data records to insert.")
        return

    print(f"Prepared {len(records)} records for insertion into {TABLE_NAME}.")
    
    try:
        # .upsert() will insert new records or update existing ones if a
        # record with the same 'tide_time' already exists.
        # This requires a UNIQUE constraint on the 'tide_time' column in your Supabase table.
        response = (
            supabase.table(TABLE_NAME)
            .upsert(records, on_conflict="tide_time")
            .execute()
        )
        
        print(f"Successfully inserted/updated tide data in Supabase.")
        
    except Exception as e:
        print(f"An error occurred during Supabase insertion: {e}")
        print("HINT: Ensure the 'tide_time' column has a UNIQUE constraint in your 'tides' table.")

# --- 3. MAIN EXECUTION ---
def main():
    """Main function to run the scraper and update the database."""
    print("--- Starting Tide Scraper ---")
    tide_data = parse_tide_feed()
    update_supabase_tides(tide_data)
    print("--- Tide Scraper Finished ---")

if __name__ == "__main__":
    main()