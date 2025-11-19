import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client
from pathlib import Path

# --- SHARED SUPABASE CLIENT INITIALIZATION ---

# Use pathlib for a more robust way to find the project root and the .env file.
# Path(__file__).resolve() -> gets the full path to this file (supabase_client.py)
# .parents[2] -> goes up two directories (from /src/lib/ to /)
project_root = Path(__file__).resolve().parents[2]
dotenv_path = project_root / ".env"
load_dotenv(dotenv_path=dotenv_path)

SUPABASE_URL: str = os.environ.get("SUPABASE_URL")
SUPABASE_KEY: str = os.environ.get("SUPABASE_KEY")

# Validate that Supabase credentials are set
if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase credentials (SUPABASE_URL, SUPABASE_KEY) not found in .env file.", file=sys.stderr)
    sys.exit(1)

# Create a single, reusable client instance
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)